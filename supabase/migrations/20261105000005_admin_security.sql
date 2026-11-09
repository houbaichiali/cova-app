-- COVA ADMIN CENTER — Phase 5: security center.
-- HONESTY CONTRACT: this module only surfaces events COVA actually records
-- (the admin audit log + MFA factors). It does NOT invent login activity,
-- session lists or attack detections that are not collected anywhere. Where a
-- signal does not exist, the UI says so instead of showing fake data.
--
-- Permission: security.read (founder/admin). The emergency revoke is
-- founder-only (rank 100), audited, and refuses to target the caller itself.

create or replace function public.admin_security_overview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_admin_user('security.read') then
    raise exception 'Missing permission: security.read';
  end if;

  return jsonb_build_object(
    -- active administrators with their live MFA state
    'admins', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', uar.user_id,
        'display_name', pr.display_name,
        'user_code', pr.user_code,
        'role_key', uar.role_key,
        'granted_at', uar.granted_at,
        'mfa_ok', exists (
          select 1 from auth.mfa_factors f
          where f.user_id = uar.user_id and f.status = 'verified'
        )
      ) order by uar.granted_at desc), '[]'::jsonb)
      from public.user_admin_roles uar
      left join public.profiles pr on pr.id = uar.user_id
      where uar.revoked_at is null
    ),

    -- every recorded role change (grant/revoke) — real audit rows only
    'role_changes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'action', a.action, 'actor', pr.display_name,
        'target_id', a.target_id, 'reason', a.reason, 'created_at', a.created_at
      ) order by a.created_at desc), '[]'::jsonb)
      from (
        select * from public.admin_audit_logs
        where action like 'admin.grant%' or action like 'admin.revoke%'
        order by created_at desc limit 50
      ) a
      left join public.profiles pr on pr.id = a.actor_id
    ),

    -- sensitive actions worth reviewing (real audit rows only)
    'sensitive_actions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'action', a.action, 'actor', pr.display_name,
        'target_type', a.target_type, 'target_id', a.target_id,
        'reason', a.reason, 'created_at', a.created_at
      ) order by a.created_at desc), '[]'::jsonb)
      from (
        select * from public.admin_audit_logs
        where action in (
          'gamification.xp_adjust', 'moderation.sanction', 'moderation.sanction_approve',
          'moderation.sanction_lift', 'content.remove', 'content.hide', 'rules.publish'
        )
        order by created_at desc limit 50
      ) a
      left join public.profiles pr on pr.id = a.actor_id
    ),

    -- audit volume per day (14 days) — a real, collected signal
    'audit_volume', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', c) order by d), '[]'::jsonb)
      from (
        select to_char(gs.day, 'YYYY-MM-DD') as d,
               (select count(*) from public.admin_audit_logs l
                where l.created_at::date = gs.day) as c
        from generate_series((now() - interval '13 days')::date, now()::date, interval '1 day') gs(day)
      ) v
    ),

    -- role -> active holders + permission counts (from real tables)
    'roles', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', r.key, 'label', r.label, 'rank', r.rank,
        'holders', (select count(*) from public.user_admin_roles uar
                    where uar.role_key = r.key and uar.revoked_at is null),
        'permissions', (select count(*) from public.admin_role_permissions rp
                        where rp.role_key = r.key)
      ) order by r.rank desc), '[]'::jsonb)
      from public.admin_roles r
    )
  );
end;
$$;

-- Emergency access revocation: founder-only, removes ALL active admin roles
-- of the target in one audited action. Refuses self-revocation (use the team
-- module / SQL for a planned handover).
create or replace function public.admin_security_revoke_access(p_user uuid, p_reason text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_rank   integer;
  v_target_rank integer;
  v_count  integer := 0;
  v_role   text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select r.rank into v_rank
  from public.user_admin_roles uar
  join public.admin_roles r on r.key = uar.role_key
  where uar.user_id = v_actor and uar.revoked_at is null
  order by r.rank desc limit 1;
  if v_rank is null or v_rank < 100 then
    raise exception 'Only the Founder / Super Admin can revoke admin access';
  end if;
  if p_user = v_actor then
    raise exception 'Revoking your own access is not allowed here';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is mandatory';
  end if;

  select max(r.rank) into v_target_rank
  from public.user_admin_roles uar
  join public.admin_roles r on r.key = uar.role_key
  where uar.user_id = p_user and uar.revoked_at is null;

  if v_target_rank is null then
    raise exception 'This account holds no active admin role';
  end if;
  -- a founder can never be demoted through this path
  if v_target_rank >= 100 then
    raise exception 'The Founder account cannot be revoked here';
  end if;

  for v_role in
    select uar.role_key from public.user_admin_roles uar
    where uar.user_id = p_user and uar.revoked_at is null
  loop
    update public.user_admin_roles
      set revoked_at = now(), revoked_by = v_actor
      where user_id = p_user and role_key = v_role and revoked_at is null;
    v_count := v_count + 1;
  end loop;

  perform public.admin_audit('admin.revoke_access', 'user', p_user::text,
    btrim(p_reason), jsonb_build_object('roles_removed', v_count), v_actor);
  return v_count;
end;
$$;

revoke all on function public.admin_security_overview() from public, anon;
revoke all on function public.admin_security_revoke_access(uuid, text) from public, anon;
grant execute on function public.admin_security_overview() to authenticated;
grant execute on function public.admin_security_revoke_access(uuid, text) to authenticated;
