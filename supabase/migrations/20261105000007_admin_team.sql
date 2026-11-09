-- COVA ADMIN CENTER — Phase 5: administrative team management.
-- Founder / Super Admin only (rank 100). Self-promotion stays structurally
-- impossible: user_admin_roles has no client INSERT grant, and these RPCs
-- refuse to create or touch a founder role — the founder account comes from
-- the existing manual bootstrap (supabase/scripts/grant-founder.sql).
--
-- Permission gate: team.manage (only the founder implicitly holds it — no
-- role seed includes it, so granting it to a custom role later is possible
-- without a migration).

create or replace function public.admin_team_list()
returns table (
  grant_id uuid, user_id uuid, user_code text, display_name text,
  role_key text, role_label text, role_rank integer,
  granted_by uuid, granted_by_name text, granted_at timestamptz,
  revoked_at timestamptz, revoked_by uuid, mfa_ok boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user('team.manage') then
    raise exception 'Missing permission: team.manage';
  end if;
  return query
  select uar.id, uar.user_id, p.user_code, p.display_name,
         uar.role_key, r.label, r.rank,
         uar.granted_by, gp.display_name, uar.granted_at,
         uar.revoked_at, uar.revoked_by,
         exists (select 1 from auth.mfa_factors f where f.user_id = uar.user_id and f.status = 'verified')
  from public.user_admin_roles uar
  join public.admin_roles r on r.key = uar.role_key
  left join public.profiles p on p.id = uar.user_id
  left join public.profiles gp on gp.id = uar.granted_by
  order by uar.revoked_at nulls first, uar.granted_at desc
  limit 200;
end;
$$;

create or replace function public.admin_team_grant(
  p_user_code text, p_role_key text, p_reason text
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_actor_rank integer;
  v_user uuid;
  v_role_rank integer;
  v_grant uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select max(r.rank) into v_actor_rank
  from public.user_admin_roles uar
  join public.admin_roles r on r.key = uar.role_key
  where uar.user_id = v_actor and uar.revoked_at is null;
  if v_actor_rank is null or v_actor_rank < 100 then
    raise exception 'Only the Founder / Super Admin can manage the team';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is mandatory';
  end if;
  if p_role_key = 'founder' then
    raise exception 'The founder account is bootstrapped manually only (grant-founder.sql)';
  end if;
  select rank into v_role_rank from public.admin_roles where key = p_role_key;
  if v_role_rank is null then raise exception 'Unknown role'; end if;
  if v_role_rank >= v_actor_rank then
    raise exception 'You cannot grant a role at or above your own rank';
  end if;

  select id into v_user from public.profiles
  where user_code = btrim(p_user_code) and not is_sample limit 1;
  if v_user is null then raise exception 'No real student matches this COVA code'; end if;
  if v_user = v_actor then raise exception 'You already hold the highest role'; end if;

  if exists (
    select 1 from public.user_admin_roles
    where user_id = v_user and role_key = p_role_key and revoked_at is null
  ) then
    raise exception 'This account already holds this role';
  end if;

  insert into public.user_admin_roles (user_id, role_key, granted_by)
  values (v_user, p_role_key, v_actor)
  returning id into v_grant;

  perform public.admin_audit('admin.grant_role', 'user', v_user::text,
    btrim(p_reason), jsonb_build_object('role', p_role_key), v_actor);
  return v_grant;
end;
$$;

create or replace function public.admin_team_revoke(p_grant uuid, p_reason text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_actor_rank integer;
  v_row public.user_admin_roles%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select max(r.rank) into v_actor_rank
  from public.user_admin_roles uar
  join public.admin_roles r on r.key = uar.role_key
  where uar.user_id = v_actor and uar.revoked_at is null;
  if v_actor_rank is null or v_actor_rank < 100 then
    raise exception 'Only the Founder / Super Admin can manage the team';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is mandatory';
  end if;

  select * into v_row from public.user_admin_roles where id = p_grant;
  if not found then raise exception 'Grant not found'; end if;
  if v_row.revoked_at is not null then raise exception 'Grant already revoked'; end if;
  if v_row.user_id = v_actor then raise exception 'Revoking your own access is not allowed here'; end if;
  if v_row.role_key = 'founder' then
    raise exception 'The founder account cannot be demoted';
  end if;

  update public.user_admin_roles
    set revoked_at = now(), revoked_by = v_actor
    where id = p_grant;

  perform public.admin_audit('admin.revoke_role', 'user', v_row.user_id::text,
    btrim(p_reason), jsonb_build_object('role', v_row.role_key), v_actor);
end;
$$;

revoke all on function public.admin_team_list() from public, anon;
revoke all on function public.admin_team_grant(text, text, text) from public, anon;
revoke all on function public.admin_team_revoke(uuid, text) from public, anon;
grant execute on function public.admin_team_list() to authenticated;
grant execute on function public.admin_team_grant(text, text, text) to authenticated;
grant execute on function public.admin_team_revoke(uuid, text) to authenticated;
