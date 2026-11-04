-- COVA ADMIN CENTER — Phase 1: roles, permissions and security foundation.
-- Non-destructive: new tables only, nothing existing is altered.
--
-- Security model:
--  * The browser NEVER grants admin rights. Every check goes through the
--    security-definer functions below, which read the tables directly.
--  * No direct INSERT/UPDATE/DELETE grant on admin tables: writes happen
--    through definer RPCs (later phases) that audit themselves.
--  * Self-promotion is structurally impossible: user_admin_roles grants are
--    inserted only by the database owner or future definer RPCs, and the
--    founder-grant helper below is revoked from everyone.
--  * MFA state is exposed through admin_my_access() so the /admin gate can
--    require a verified second factor before showing anything.

-- ----------------------------------------------------------------- roles
create table if not exists public.admin_roles (
  key         text primary key,
  label       text not null,
  description text not null default '',
  rank        integer not null,          -- higher = more authority
  is_system   boolean not null default false
);
alter table public.admin_roles enable row level security;

insert into public.admin_roles (key, label, description, rank, is_system) values
  ('founder',         'Founder / Super Admin', 'Highest authority: team, settings, security, permanent bans.', 100, true),
  ('admin',           'Admin',                 'General platform management with explicit permissions.',       80, true),
  ('moderator',       'Moderator',             'Community moderation, reports and authorized sanctions.',      60, true),
  ('content_manager', 'Content Manager',       'Quiz and educational content review.',                         40, true),
  ('support',         'Support Agent',         'User assistance with restricted data access.',                 30, true),
  ('analyst',         'Analyst',               'Read-only access to approved analytics.',                      20, true)
on conflict (key) do nothing;

-- ----------------------------------------------------------- permissions
create table if not exists public.admin_permissions (
  key   text primary key,
  module text not null,
  label text not null
);
alter table public.admin_permissions enable row level security;

insert into public.admin_permissions (key, module, label) values
  ('users.read',                 'users',        'View users and profiles'),
  ('users.note',                 'users',        'Write administrative notes'),
  ('users.suspend',              'users',        'Issue restrictions and suspensions'),
  ('users.ban',                  'users',        'Approve permanent bans'),
  ('users.delete',               'users',        'Protected user data deletion'),
  ('moderation.reports.read',    'moderation',   'View reports'),
  ('moderation.reports.handle',  'moderation',   'Work and resolve reports'),
  ('moderation.sanction',        'moderation',   'Issue sanctions'),
  ('moderation.appeals.handle',  'moderation',   'Decide appeals'),
  ('rules.manage',               'rules',        'Manage community rules and versions'),
  ('content.review',             'content',      'Review quizzes and educational content'),
  ('gamification.badges.manage', 'gamification', 'Create and edit badges'),
  ('gamification.xp.adjust',     'gamification', 'Manual XP adjustments'),
  ('analytics.read',             'analytics',    'View platform analytics'),
  ('security.read',              'security',     'View security center'),
  ('team.manage',                'team',         'Manage administrative staff'),
  ('settings.manage',            'settings',     'Manage platform settings'),
  ('audit.read',                 'audit',        'Read audit logs')
on conflict (key) do nothing;

-- --------------------------------------------------- role -> permissions
create table if not exists public.admin_role_permissions (
  role_key       text not null references public.admin_roles (key) on delete cascade,
  permission_key text not null references public.admin_permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);
alter table public.admin_role_permissions enable row level security;

insert into public.admin_role_permissions (role_key, permission_key)
select 'admin', key from public.admin_permissions
where key not in ('users.delete', 'team.manage')
on conflict do nothing;

insert into public.admin_role_permissions (role_key, permission_key) values
  ('moderator', 'users.read'),
  ('moderator', 'users.note'),
  ('moderator', 'users.suspend'),
  ('moderator', 'moderation.reports.read'),
  ('moderator', 'moderation.reports.handle'),
  ('moderator', 'moderation.sanction'),
  ('moderator', 'moderation.appeals.handle'),
  ('content_manager', 'users.read'),
  ('content_manager', 'content.review'),
  ('support', 'users.read'),
  ('support', 'users.note'),
  ('support', 'moderation.reports.read'),
  ('analyst', 'analytics.read')
on conflict do nothing;

-- ------------------------------------------------- user <-> role grants
create table if not exists public.user_admin_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role_key   text not null references public.admin_roles (key) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);
create index if not exists user_admin_roles_user_idx
  on public.user_admin_roles (user_id) where revoked_at is null;
-- One active grant per user and role.
create unique index if not exists user_admin_roles_active_key
  on public.user_admin_roles (user_id, role_key) where revoked_at is null;
alter table public.user_admin_roles enable row level security;

-- ------------------------------------------------------------ audit log
create table if not exists public.admin_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references auth.users (id) on delete set null,
  action      text not null,
  target_type text not null default '',
  target_id   text not null default '',
  reason      text not null default '',
  metadata    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_actor_idx
  on public.admin_audit_logs (actor_id, created_at desc);
alter table public.admin_audit_logs enable row level security;
-- No INSERT/UPDATE/DELETE grant: the log is append-only through definer code.

-- ------------------------------------------------------ access functions
-- THE gate. Every admin RLS policy and server route calls this. The founder
-- role implicitly holds every permission; other roles check explicit grants.
create or replace function public.is_admin_user(p_permission text default null)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if p_permission is null then
    return exists (
      select 1 from public.user_admin_roles uar
      where uar.user_id = v_uid and uar.revoked_at is null
    );
  end if;
  -- founder implicit wildcard
  if exists (
    select 1 from public.user_admin_roles uar
    where uar.user_id = v_uid and uar.revoked_at is null and uar.role_key = 'founder'
  ) then
    return true;
  end if;
  return exists (
    select 1
    from public.user_admin_roles uar
    join public.admin_role_permissions rp on rp.role_key = uar.role_key
    where uar.user_id = v_uid and uar.revoked_at is null
      and rp.permission_key = p_permission
  );
end;
$$;

-- Everything the /admin gate and UI need about the caller in one call:
-- role (highest active), explicit permissions, and whether a verified MFA
-- factor exists (required before the Admin Center opens).
create or replace function public.admin_my_access()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_perms text[];
  v_mfa boolean;
begin
  if v_uid is null then
    return jsonb_build_object('is_admin', false, 'role', null, 'permissions', '[]'::jsonb, 'mfa_ok', false);
  end if;

  select uar.role_key into v_role
  from public.user_admin_roles uar
  join public.admin_roles r on r.key = uar.role_key
  where uar.user_id = v_uid and uar.revoked_at is null
  order by r.rank desc
  limit 1;

  if v_role is null then
    return jsonb_build_object('is_admin', false, 'role', null, 'permissions', '[]'::jsonb, 'mfa_ok', false);
  end if;

  if v_role = 'founder' then
    select array_agg(key) into v_perms from public.admin_permissions;
  else
    select coalesce(array_agg(distinct rp.permission_key), '{}') into v_perms
    from public.user_admin_roles uar
    join public.admin_role_permissions rp on rp.role_key = uar.role_key
    where uar.user_id = v_uid and uar.revoked_at is null;
  end if;

  select exists (
    select 1 from auth.mfa_factors
    where user_id = v_uid and status = 'verified'
  ) into v_mfa;

  return jsonb_build_object(
    'is_admin', true,
    'role', v_role,
    'permissions', to_jsonb(v_perms),
    'mfa_ok', v_mfa
  );
end;
$$;

-- Internal audit writer for the definer RPCs of later phases. The actor is
-- passed explicitly: inside security-definer code auth.uid() is NULL (the
-- code runs as the table owner, not as the signed-in user).
create or replace function public.admin_audit(
  p_action text,
  p_target_type text default '',
  p_target_id text default '',
  p_reason text default '',
  p_metadata jsonb default '[]'::jsonb,
  p_actor uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if v_actor is null then
    raise exception 'admin_audit requires an actor: no session and no explicit actor given';
  end if;
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, metadata)
  values (v_actor, p_action, p_target_type, p_target_id, p_reason, p_metadata);
end;
$$;

-- One-time founder bootstrap helper. Revoked from everyone: the project
-- owner runs it manually in the Supabase SQL editor with their user code
-- (see supabase/scripts/grant-founder.sql). It refuses to run when a
-- founder already exists, so it cannot be replayed later.
create or replace function public.admin_grant_founder(p_user_code text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if exists (
    select 1 from public.user_admin_roles uar
    where uar.role_key = 'founder' and uar.revoked_at is null
  ) then
    raise exception 'A founder already exists';
  end if;
  select id into v_user from public.profiles where user_code = btrim(p_user_code) limit 1;
  if v_user is null then raise exception 'Unknown user code'; end if;
  insert into public.user_admin_roles (user_id, role_key, granted_by)
  values (v_user, 'founder', v_user);
  perform public.admin_audit('admin.grant_role', 'user', v_user::text, 'Initial founder bootstrap', '[]'::jsonb, v_user);
end;
$$;
revoke all on function public.admin_grant_founder(text) from public, authenticated, anon;
revoke all on function public.is_admin_user(text) from public, anon;
revoke all on function public.admin_my_access() from public, anon;
revoke all on function public.admin_audit(text, text, text, text, jsonb) from public, anon;
grant execute on function public.is_admin_user(text) to authenticated;
grant execute on function public.admin_my_access() to authenticated;

-- ------------------------------------------------------------------ RLS
-- Catalog tables: readable by any active admin (the UI needs role/labels).
create policy "Admin roles readable by admins"
  on public.admin_roles for select to authenticated
  using (public.is_admin_user());
create policy "Admin permissions readable by admins"
  on public.admin_permissions for select to authenticated
  using (public.is_admin_user());
create policy "Role permissions readable by admins"
  on public.admin_role_permissions for select to authenticated
  using (public.is_admin_user());

-- Grants: admins see everything, a user always sees their own rows.
create policy "Admin grants readable by admins or self"
  on public.user_admin_roles for select to authenticated
  using (public.is_admin_user() or user_id = (select auth.uid()));

-- Audit log: strictly audit.read, and read-only (no write grants above).
create policy "Audit logs readable with audit permission"
  on public.admin_audit_logs for select to authenticated
  using (public.is_admin_user('audit.read'));
