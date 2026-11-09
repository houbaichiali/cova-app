-- COVA ADMIN CENTER — Phase 5: rules and policies management.
-- Non-destructive: new tables + one new permission; nothing existing is altered.
--
-- Model:
--  * community_rules           the current face of every rule (one row per rule).
--  * community_rule_versions   immutable snapshot per version — a rule is never
--                              rewritten silently: every content edit bumps the
--                              version and freezes the previous content, so past
--                              moderation decisions stay explainable.
--  * All writes go through security-definer RPCs that check permissions and
--    write the audit log. No direct INSERT/UPDATE/DELETE grant.
--
-- Permissions (admin_roles already seeded in 20261104000002):
--  * rules.read   new — view rules and their versions (all staff roles).
--  * rules.manage existing — create/edit/publish/archive rules (founder, admin).

insert into public.admin_permissions (key, module, label)
values ('rules.read', 'rules', 'View community rules and versions')
on conflict (key) do nothing;

-- Everyone who can already read reports can also read the rulebook; the two
-- go together in practice (a moderator needs the rule they enforce).
insert into public.admin_role_permissions (role_key, permission_key)
select r.key, 'rules.read'
from public.admin_roles r
where r.key in ('admin', 'moderator', 'content_manager', 'support', 'analyst')
on conflict do nothing;

------------------------------------------------------------------------ rules

create table if not exists public.community_rules (
  id           uuid primary key default gen_random_uuid(),
  category     text not null default 'general'
               check (category in ('general','respect','content','academic','safety','privacy','other')),
  title        text not null check (char_length(btrim(title)) between 1 and 160),
  description  text not null default '' check (char_length(description) <= 4000),
  severity     text not null default 'low'
               check (severity in ('info','low','medium','high','critical')),
  action_guidance text not null default '' check (char_length(action_guidance) <= 1000),
  status       text not null default 'draft'
               check (status in ('draft','active','archived')),
  version      integer not null default 1,
  effective_at date,
  created_by   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists community_rules_status_idx
  on public.community_rules (status, category, updated_at desc);

create table if not exists public.community_rule_versions (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid not null references public.community_rules (id) on delete cascade,
  version     integer not null,
  category    text not null,
  title       text not null,
  description text not null default '',
  severity    text not null,
  action_guidance text not null default '',
  status      text not null,
  change_note text not null default '',
  changed_by  uuid not null references auth.users (id) on delete cascade,
  changed_at  timestamptz not null default now(),
  unique (rule_id, version)
);
create index if not exists community_rule_versions_rule_idx
  on public.community_rule_versions (rule_id, version desc);

alter table public.community_rules enable row level security;
alter table public.community_rule_versions enable row level security;
-- No direct grants: staff access goes through the definer RPCs below.

------------------------------------------------------------------- audit hook
-- The audit writer already exists (20261104000002 admin_audit). Rules RPCs
-- reuse it — nothing to create here.

------------------------------------------------------------------------ RPCs

create or replace function public.admin_rules_list(
  p_query text default '', p_category text default '', p_status text default ''
)
returns table (
  id uuid, category text, title text, description text, severity text,
  action_guidance text, status text, version integer, effective_at date,
  created_by uuid, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user('rules.read') then
    raise exception 'Missing permission: rules.read';
  end if;
  return query
  select r.id, r.category, r.title, r.description, r.severity,
         r.action_guidance, r.status, r.version, r.effective_at,
         r.created_by, r.created_at, r.updated_at
  from public.community_rules r
  where (p_status = '' or r.status = p_status)
    and (p_category = '' or r.category = p_category)
    and (p_query = '' or r.title ilike '%' || p_query || '%'
         or r.description ilike '%' || p_query || '%')
  order by r.updated_at desc
  limit 200;
end;
$$;

create or replace function public.admin_rule_create(
  p_title text, p_description text, p_category text, p_severity text,
  p_action_guidance text default '', p_effective_at date default null
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if not public.is_admin_user('rules.manage') then
    raise exception 'Missing permission: rules.manage';
  end if;
  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'Title is required';
  end if;
  insert into public.community_rules
    (title, description, category, severity, action_guidance, effective_at, created_by)
  values
    (btrim(p_title), coalesce(btrim(p_description), ''),
     coalesce(p_category, 'general'), coalesce(p_severity, 'low'),
     coalesce(btrim(p_action_guidance), ''), p_effective_at, v_actor)
  returning id into v_id;
  insert into public.community_rule_versions
    (rule_id, version, category, title, description, severity, action_guidance,
     status, change_note, changed_by)
  values
    (v_id, 1, coalesce(p_category, 'general'), btrim(p_title),
     coalesce(btrim(p_description), ''), coalesce(p_severity, 'low'),
     coalesce(btrim(p_action_guidance), ''), 'draft', 'Created', v_actor);
  perform public.admin_audit('rules.create', 'rule', v_id::text, btrim(p_title));
  return v_id;
end;
$$;

-- Content edit: bumps the version and freezes the previous content as an
-- immutable history row. Status changes do NOT bump the version.
create or replace function public.admin_rule_update(
  p_rule uuid, p_title text, p_description text, p_category text,
  p_severity text, p_action_guidance text, p_effective_at date,
  p_change_note text default ''
)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_old   public.community_rules%rowtype;
  v_new_version integer;
begin
  if not public.is_admin_user('rules.manage') then
    raise exception 'Missing permission: rules.manage';
  end if;
  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'Title is required';
  end if;
  select * into v_old from public.community_rules where id = p_rule;
  if not found then raise exception 'Rule not found'; end if;

  select max(version) + 1 into v_new_version
  from public.community_rule_versions where rule_id = p_rule;

  update public.community_rules set
    title = btrim(p_title),
    description = coalesce(btrim(p_description), ''),
    category = coalesce(p_category, v_old.category),
    severity = coalesce(p_severity, v_old.severity),
    action_guidance = coalesce(btrim(p_action_guidance), ''),
    effective_at = p_effective_at,
    version = v_new_version,
    updated_at = now()
  where id = p_rule;

  insert into public.community_rule_versions
    (rule_id, version, category, title, description, severity, action_guidance,
     status, change_note, changed_by)
  values
    (p_rule, v_new_version, coalesce(p_category, v_old.category), btrim(p_title),
     coalesce(btrim(p_description), ''), coalesce(p_severity, v_old.severity),
     coalesce(btrim(p_action_guidance), ''), v_old.status,
     coalesce(btrim(p_change_note), ''), v_actor);

  perform public.admin_audit('rules.update', 'rule', p_rule::text,
    coalesce(btrim(p_change_note), btrim(p_title)),
    jsonb_build_object('version', v_new_version));
  return v_new_version;
end;
$$;

create or replace function public.admin_rule_status(p_rule uuid, p_action text)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_old   text;
  v_new   text;
begin
  if not public.is_admin_user('rules.manage') then
    raise exception 'Missing permission: rules.manage';
  end if;
  select status into v_old from public.community_rules where id = p_rule;
  if not found then raise exception 'Rule not found'; end if;

  if p_action = 'publish' then
    if v_old <> 'draft' then raise exception 'Only a draft rule can be published'; end if;
    v_new := 'active';
  elsif p_action = 'archive' then
    if v_old = 'archived' then raise exception 'Rule is already archived'; end if;
    v_new := 'archived';
  elsif p_action = 'reactivate' then
    if v_old <> 'archived' then raise exception 'Only an archived rule can be reactivated'; end if;
    v_new := 'active';
  elsif p_action = 'unpublish' then
    if v_old <> 'active' then raise exception 'Only an active rule can go back to draft'; end if;
    v_new := 'draft';
  else
    raise exception 'Unknown action';
  end if;

  update public.community_rules set status = v_new, updated_at = now() where id = p_rule;
  update public.community_rule_versions
    set status = v_new
    where rule_id = p_rule and version = (select version from public.community_rules where id = p_rule);
  perform public.admin_audit('rules.' || p_action, 'rule', p_rule::text, v_old || ' -> ' || v_new);
  return v_new;
end;
$$;

create or replace function public.admin_rule_versions(p_rule uuid)
returns table (
  version integer, category text, title text, description text, severity text,
  action_guidance text, status text, change_note text,
  changed_by uuid, changed_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user('rules.read') then
    raise exception 'Missing permission: rules.read';
  end if;
  return query
  select v.version, v.category, v.title, v.description, v.severity,
         v.action_guidance, v.status, v.change_note, v.changed_by, v.changed_at
  from public.community_rule_versions v
  where v.rule_id = p_rule
  order by v.version desc
  limit 100;
end;
$$;

-- The version-history RPC is readable with rules.read so support/analyst can
-- consult the history without being able to modify anything.
revoke all on function public.admin_rules_list(text, text, text) from public, anon;
revoke all on function public.admin_rule_create(text, text, text, text, text, date) from public, anon;
revoke all on function public.admin_rule_update(uuid, text, text, text, text, text, date, text) from public, anon;
revoke all on function public.admin_rule_status(uuid, text) from public, anon;
revoke all on function public.admin_rule_versions(uuid) from public, anon;
grant execute on function public.admin_rules_list(text, text, text) to authenticated;
grant execute on function public.admin_rule_versions(uuid) to authenticated;
grant execute on function public.admin_rule_create(text, text, text, text, text, date) to authenticated;
grant execute on function public.admin_rule_update(uuid, text, text, text, text, text, date, text) to authenticated;
grant execute on function public.admin_rule_status(uuid, text) to authenticated;
