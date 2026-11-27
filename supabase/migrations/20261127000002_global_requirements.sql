-- COVA — Phase 8 & 9: Global Requirements & Configuration storage, admin
-- permissions, authentication provider settings and Storage hardening.
--
-- Everything here is additive; nothing existing is dropped or rewritten.
-- The project owner reviews and applies this file MANUALLY (never auto-run).
--
-- Client contract: the app works WITHOUT this migration (defaults live in
-- src/lib/file-policy.ts); when applied, the admin module can override the
-- per-area limits and the visibility of providers and upload options.

------------------------------------------------------- upload requirements

create table if not exists public.upload_requirements (
  area       text primary key check (area in (
               'avatar','cover','postImage','projectImage','document',
               'courseAttachment','codingSubmission','projectSource',
               'audio','video','general','badgeImage')),
  max_kb     integer not null check (max_kb between 1 and 102400),
  extensions text[] not null default '{}',
  enabled    boolean not null default true,
  hidden     boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.upload_requirements enable row level security;
alter table public.upload_requirements owner to postgres;

-- Direct reads stay owner-of-nothing: everyone goes through the RPC below
-- so the defaults can be merged server-side.
revoke all on public.upload_requirements from public, anon, authenticated;

create policy "upload_requirements_admin_manage"
  on public.upload_requirements for all
  to authenticated
  using (public.is_admin_user('requirements.manage'))
  with check (public.is_admin_user('requirements.manage'));

-- Public, readable snapshot (admin overrides over the app defaults).
create or replace function public.upload_requirements_visible()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(
    r.area,
    jsonb_build_object('maxKb', r.max_kb, 'extensions', r.extensions,
                       'enabled', r.enabled, 'hidden', r.hidden)
  ), '{}'::jsonb)
  from public.upload_requirements r;
$$;

revoke all on function public.upload_requirements_visible() from public, anon, authenticated;
grant execute on function public.upload_requirements_visible() to anon, authenticated;

-- Admin save: validated, audited (before/after), never silent.
create or replace function public.upload_requirement_save(
  p_area text, p_max_kb integer, p_extensions text[],
  p_enabled boolean, p_hidden boolean, p_reason text
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_admin_user('requirements.manage') then
    raise exception 'Admin access required (requirements.manage)';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;
  if p_area not in ('avatar','cover','postImage','projectImage','document',
                    'courseAttachment','codingSubmission','projectSource',
                    'audio','video','general','badgeImage') then
    raise exception 'Unknown upload area';
  end if;
  if p_max_kb < 1 or p_max_kb > 102400 then
    raise exception 'max_kb must be between 1 and 102400';
  end if;

  select to_jsonb(r) into v_before from public.upload_requirements r where r.area = p_area;

  insert into public.upload_requirements (area, max_kb, extensions, enabled, hidden, updated_by)
  values (p_area, p_max_kb, p_extensions, p_enabled, p_hidden, auth.uid())
  on conflict (area) do update
    set max_kb = excluded.max_kb,
        extensions = excluded.extensions,
        enabled = excluded.enabled,
        hidden = excluded.hidden,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform public.admin_audit(
    'requirements.upload.save', 'upload_area', p_area, p_reason,
    jsonb_build_object('before', v_before,
      'after', jsonb_build_object('max_kb', p_max_kb, 'extensions', p_extensions,
                                  'enabled', p_enabled, 'hidden', p_hidden)));
  return jsonb_build_object('saved', true);
end;
$$;

-- Permanent deletion of an override returns the area to the app defaults.
-- The confirmation flag must be explicit; the action is audited.
create or replace function public.upload_requirement_delete(p_area text, p_reason text, p_confirm boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_admin_user('requirements.manage') then
    raise exception 'Admin access required (requirements.manage)';
  end if;
  if p_confirm is not true then
    raise exception 'Explicit confirmation is required to delete a requirement override';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;

  select to_jsonb(r) into v_before from public.upload_requirements r where r.area = p_area;
  if v_before is null then
    return jsonb_build_object('deleted', false, 'reason', 'no override stored');
  end if;

  delete from public.upload_requirements where area = p_area;
  perform public.admin_audit(
    'requirements.upload.delete', 'upload_area', p_area, p_reason,
    jsonb_build_object('before', v_before, 'confirm', true));
  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.upload_requirement_save(text, integer, text[], boolean, boolean, text)
  from public, anon, authenticated;
revoke all on function public.upload_requirement_delete(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.upload_requirement_save(text, integer, text[], boolean, boolean, text) to authenticated;
grant execute on function public.upload_requirement_delete(text, text, boolean) to authenticated;

------------------------------------------- text validation requirements

create table if not exists public.field_requirements (
  id         uuid primary key default gen_random_uuid(),
  area       text not null check (char_length(area) between 1 and 60),
  key        text not null check (key ~ '^[a-z0-9_.-]{1,60}$'),
  min_length integer check (min_length between 0 and 50000),
  max_length integer check (max_length between 1 and 50000),
  required   boolean not null default true,
  pattern    text,
  enabled    boolean not null default true,
  hidden     boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (area, key)
);

alter table public.field_requirements enable row level security;
alter table public.field_requirements owner to postgres;
revoke all on public.field_requirements from public, anon, authenticated;

create policy "field_requirements_admin_manage"
  on public.field_requirements for all
  to authenticated
  using (public.is_admin_user('requirements.manage'))
  with check (public.is_admin_user('requirements.manage'));

create or replace function public.field_requirements_list(p_area text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    to_jsonb(f) order by f."key"
  ), '[]'::jsonb)
  from public.field_requirements f
  where f.area = p_area and f.enabled;
$$;

create or replace function public.field_requirement_save(
  p_id uuid, p_area text, p_key text,
  p_min_length integer, p_max_length integer, p_required boolean,
  p_pattern text, p_enabled boolean, p_hidden boolean, p_reason text
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_admin_user('requirements.manage') then
    raise exception 'Admin access required (requirements.manage)';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;
  if p_min_length is not null and p_max_length is not null and p_min_length > p_max_length then
    raise exception 'min_length must not exceed max_length';
  end if;

  if p_id is null then
    select to_jsonb(f) into v_before from public.field_requirements f
      where f.area = p_area and f."key" = p_key;
    insert into public.field_requirements
      (area, "key", min_length, max_length, required, pattern, enabled, hidden, updated_by)
    values
      (p_area, p_key, p_min_length, p_max_length, p_required, p_pattern, p_enabled, p_hidden, auth.uid())
    on conflict (area, "key") do update
      set min_length = excluded.min_length,
          max_length = excluded.max_length,
          required = excluded.required,
          pattern = excluded.pattern,
          enabled = excluded.enabled,
          hidden = excluded.hidden,
          updated_by = excluded.updated_by,
          updated_at = now();
  else
    select to_jsonb(f) into v_before from public.field_requirements f where f.id = p_id;
    update public.field_requirements f
      set min_length = p_min_length, max_length = p_max_length,
          required = p_required, pattern = p_pattern,
          enabled = p_enabled, hidden = p_hidden,
          updated_by = auth.uid(), updated_at = now()
      where f.id = p_id;
    if not found then
      raise exception 'Requirement not found';
    end if;
  end if;

  perform public.admin_audit(
    'requirements.field.save', 'field_requirement', p_area || '/' || p_key, p_reason,
    jsonb_build_object('before', v_before,
      'after', jsonb_build_object('min', p_min_length, 'max', p_max_length,
                                  'required', p_required, 'enabled', p_enabled, 'hidden', p_hidden)));
  return jsonb_build_object('saved', true);
end;
$$;

-- Permanent deletion checks self-dependency only (references live in app
-- code); it requires the explicit confirm flag and is audited.
create or replace function public.field_requirement_delete(p_id uuid, p_reason text, p_confirm boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  if not public.is_admin_user('requirements.manage') then
    raise exception 'Admin access required (requirements.manage)';
  end if;
  if p_confirm is not true then
    raise exception 'Explicit confirmation is required to delete a field requirement';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;
  select to_jsonb(f) into v_before from public.field_requirements f where f.id = p_id;
  if v_before is null then
    return jsonb_build_object('deleted', false);
  end if;
  delete from public.field_requirements where id = p_id;
  perform public.admin_audit(
    'requirements.field.delete', 'field_requirement',
    (v_before->>'area') || '/' || (v_before->>'key'), p_reason,
    jsonb_build_object('before', v_before, 'confirm', true));
  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.field_requirements_list(text) from public, anon, authenticated;
revoke all on function public.field_requirement_save(uuid, text, text, integer, integer, boolean, text, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.field_requirement_delete(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.field_requirements_list(text) to authenticated;
grant execute on function public.field_requirement_save(uuid, text, text, integer, integer, boolean, text, boolean, boolean, text) to authenticated;
grant execute on function public.field_requirement_delete(uuid, text, boolean) to authenticated;

------------------------------------------------------- permissions + history

insert into public.admin_permissions (key, module, label) values
  ('requirements.read',   'requirements', 'View global requirements and configuration'),
  ('requirements.manage', 'requirements', 'Edit validation, file requirements, dynamic fields and providers')
on conflict (key) do nothing;

insert into public.admin_role_permissions (role_key, permission_key)
  select r.role_key, p.key
  from (values ('founder'), ('admin')) as r(role_key)
  cross join (values ('requirements.read'), ('requirements.manage')) as p(key)
  where exists (select 1 from public.admin_permissions where key = p.key)
on conflict (role_key, permission_key) do nothing;

-- Focused history view for the requirements module (permission-checked).
create or replace function public.requirements_history(p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user('requirements.read') then
    raise exception 'Admin access required (requirements.read)';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'action', l.action, 'target_type', l.target_type,
      'target_id', l.target_id, 'reason', l.reason, 'metadata', l.metadata,
      'created_at', l.created_at
    ) order by l.created_at desc)
    from public.admin_audit_logs l
    where l.action like 'requirements.%'
    limit least(greatest(p_limit, 1), 200)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.requirements_history(integer) from public, anon, authenticated;
grant execute on function public.requirements_history(integer) to authenticated;

-------------------------------------------- authentication provider settings

-- Registration/login availability per provider (spec 5.5). Real credentials
-- stay in the Supabase Auth dashboard; nothing secret is stored here. The
-- email provider is NOT a setting: it is the last always-secure method.
insert into public.platform_settings (key, value, type, category, description) values
  ('auth.provider.google.enabled',  'false', 'boolean', 'security',
   'Show and allow Google sign-in. Enable only after configuring real Google credentials in Supabase Auth.'),
  ('auth.provider.github.enabled',  'false', 'boolean', 'security',
   'Show and allow GitHub sign-in. Enable only after configuring real GitHub credentials in Supabase Auth.'),
  ('auth.provider.discord.enabled', 'false', 'boolean', 'security',
   'Show and allow Discord sign-in. Enable only after configuring real Discord credentials in Supabase Auth.'),
  ('auth.provider.twitter.enabled', 'false', 'boolean', 'security',
   'Show and allow X (Twitter) sign-in. Enable only after configuring real X credentials in Supabase Auth.')
on conflict (key) do nothing;

-- Public snapshot of which providers the owner has enabled (no secrets):
-- the login/register screens only render the enabled ones.
create or replace function public.auth_providers_visible()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(
    replace(s.key, 'auth.provider.', ''),
    (s.value #>> '{}')::boolean
  )
  from public.platform_settings s
  where s.key like 'auth.provider.%.enabled';
$$;

revoke all on function public.auth_providers_visible() from public, anon, authenticated;
grant execute on function public.auth_providers_visible() to anon, authenticated;

------------------------------------------------------- storage hardening

-- Bucket limits aligned with the file policy (spec Phase 4/9):
--   avatars: 512 KB, JPG/PNG/WEBP (GIF removed — animated avatars are not
--   in the approved policy). Non-destructive: only limit/whitelist updates.
update storage.buckets
  set file_size_limit = 524288,
      allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'avatars';

-- challenge-files and lesson-files had NO MIME whitelist; align them with the
-- shared policy (documents, text/code, images — no executables).
update storage.buckets
  set allowed_mime_types = array[
    'application/pdf','application/msword','application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','image/png','image/jpeg','image/webp'
  ]
  where id in ('challenge-files', 'lesson-files');

-- Upload policies follow the buckets (owner-scoped inserts stay as-is).
