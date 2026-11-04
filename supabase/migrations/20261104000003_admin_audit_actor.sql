-- Fix: admin_audit now takes an explicit actor. Inside security-definer
-- functions (and the SQL editor) auth.uid() is NULL because the code runs as
-- the table owner, not as a signed-in user — the founder bootstrap audit
-- therefore passed a NULL actor_id and violated the NOT NULL constraint.
-- Callers must pass the acting user explicitly; the server-side helper still
-- relies on auth.uid() when a real session exists.

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
revoke all on function public.admin_audit(text, text, text, text, jsonb, uuid)
  from public, anon, authenticated;

-- The bootstrap audits itself with the granted user as the actor.
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
