-- COVA ADMIN CENTER — Phase 4: moderation, sanctions and appeals.
-- Non-destructive. All writes go through security-definer RPCs that check
-- permissions, write the audit log and notify the affected users.

-- ---------------------------------------------------------------- reports
create table if not exists public.moderation_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references auth.users (id) on delete set null,
  reported_user_id uuid references auth.users (id) on delete set null,
  subject          text not null check (char_length(btrim(subject)) between 1 and 160),
  category         text not null default 'other',
  description      text not null default '' check (char_length(description) <= 2000),
  content_ref      text not null default '',
  status           text not null default 'pending'
                   check (status in ('pending','under_review','resolved','rejected','escalated')),
  assigned_to      uuid references auth.users (id) on delete set null,
  resolution       text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists moderation_reports_status_idx
  on public.moderation_reports (status, created_at desc);
alter table public.moderation_reports enable row level security;
-- No direct grants: staff access through the definer RPCs below.

-- -------------------------------------------------------------- sanctions
create table if not exists public.moderation_sanctions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  issued_by         uuid not null references auth.users (id) on delete set null,
  type              text not null check (type in
                    ('warning','content_removal','restriction','suspension','ban')),
  reason            text not null check (char_length(btrim(reason)) between 1 and 1000),
  rule_ref          text not null default '',
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz,
  status            text not null default 'active'
                    check (status in ('active','pending_approval','refused','lifted')),
  related_report_id uuid references public.moderation_reports (id) on delete set null,
  approved_by       uuid references auth.users (id) on delete set null,
  approved_at       timestamptz,
  lifted_by         uuid references auth.users (id) on delete set null,
  lifted_at         timestamptz,
  lift_reason       text not null default '',
  created_at        timestamptz not null default now()
);
create index if not exists moderation_sanctions_user_idx
  on public.moderation_sanctions (user_id, created_at desc);
create index if not exists moderation_sanctions_status_idx
  on public.moderation_sanctions (status) where status in ('active','pending_approval');
alter table public.moderation_sanctions enable row level security;

-- ---------------------------------------------------------------- appeals
create table if not exists public.moderation_appeals (
  id              uuid primary key default gen_random_uuid(),
  sanction_id     uuid not null references public.moderation_sanctions (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  statement       text not null check (char_length(btrim(statement)) between 1 and 2000),
  status          text not null default 'pending' check (status in ('pending','accepted','rejected')),
  decided_by      uuid references auth.users (id) on delete set null,
  decision_reason text not null default '',
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
create unique index if not exists moderation_appeals_one_pending
  on public.moderation_appeals (sanction_id) where status = 'pending';
alter table public.moderation_appeals enable row level security;

-- Notify every active founder/admin (escalations, ban approvals).
create or replace function public.admin_notify_staff(p_type text, p_href text, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin record;
begin
  for v_admin in
    select distinct uar.user_id
    from public.user_admin_roles uar
    join public.admin_roles r on r.key = uar.role_key
    where uar.revoked_at is null and uar.role_key in ('founder', 'admin')
  loop
    perform public.notify(v_admin.user_id, p_type, v_admin.user_id, p_href, p_title, p_body);
  end loop;
end;
$$;
revoke all on function public.admin_notify_staff(text, text, text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------- reports
create or replace function public.admin_report_create(
  p_subject text, p_category text, p_description text,
  p_reported_user uuid default null, p_content_ref text default ''
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if not public.is_admin_user('moderation.reports.handle') then
    raise exception 'Missing permission: moderation.reports.handle';
  end if;
  insert into public.moderation_reports
    (reporter_id, reported_user_id, subject, category, description, content_ref)
  values (v_actor, p_reported_user, btrim(p_subject), btrim(p_category), btrim(p_description), btrim(p_content_ref))
  returning id into v_id;
  perform public.admin_audit('moderation.report.create', 'report', v_id::text, btrim(p_subject));
  return v_id;
end;
$$;

create or replace function public.admin_reports_list(p_status text default '')
returns table (
  id uuid, reporter_id uuid, reported_user_id uuid, subject text, category text,
  description text, content_ref text, status text, assigned_to uuid, resolution text,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.reporter_id, r.reported_user_id, r.subject, r.category,
         r.description, r.content_ref, r.status, r.assigned_to, r.resolution,
         r.created_at, r.updated_at
  from public.moderation_reports r
  where p_status = '' or r.status = p_status
  order by r.created_at desc
  limit 200
$$;

create or replace function public.admin_report_action(
  p_report uuid, p_action text, p_note text default ''
)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_new   text;
begin
  if not public.is_admin_user('moderation.reports.handle') then
    raise exception 'Missing permission: moderation.reports.handle';
  end if;
  if p_action = 'assign' then
    update public.moderation_reports
      set assigned_to = v_actor, status = 'under_review', updated_at = now()
      where id = p_report;
    v_new := 'under_review';
  elsif p_action = 'resolve' then
    update public.moderation_reports
      set status = 'resolved', resolution = coalesce(btrim(p_note), ''), updated_at = now()
      where id = p_report;
    v_new := 'resolved';
  elsif p_action = 'reject' then
    update public.moderation_reports
      set status = 'rejected', resolution = coalesce(btrim(p_note), ''), updated_at = now()
      where id = p_report;
    v_new := 'rejected';
  elsif p_action = 'escalate' then
    update public.moderation_reports
      set status = 'escalated', updated_at = now()
      where id = p_report;
    perform public.admin_notify_staff('report_escalated', '/admin/moderation',
      'Report escalated', btrim(p_note));
    v_new := 'escalated';
  else
    raise exception 'Unknown action';
  end if;
  perform public.admin_audit('moderation.report.' || p_action, 'report', p_report::text, btrim(p_note));
  return v_new;
end;
$$;

-- -------------------------------------------------------------- sanctions
-- Permanent bans require founder approval (users.ban); everything else is
-- active immediately for authorized moderators.
create or replace function public.admin_sanction_issue(
  p_user uuid, p_type text, p_reason text, p_rule_ref text default '',
  p_days integer default null, p_related_report uuid default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_id     uuid;
  v_status text;
  v_banned boolean := false;
begin
  if not public.is_admin_user('moderation.sanction') then
    raise exception 'Missing permission: moderation.sanction';
  end if;
  if p_user is null or p_user = v_actor then
    raise exception 'Invalid sanction target';
  end if;
  if p_type not in ('warning','content_removal','restriction','suspension','ban') then
    raise exception 'Unknown sanction type';
  end if;
  if coalesce(p_days, 0) < 0 then raise exception 'Invalid duration'; end if;

  if p_type = 'ban' then
    if not public.is_admin_user('users.ban') then
      raise exception 'Permanent bans require the users.ban permission';
    end if;
    v_status := 'pending_approval';
  else
    v_status := 'active';
  end if;

  insert into public.moderation_sanctions
    (user_id, issued_by, type, reason, rule_ref, ends_at, status, related_report_id)
  values
    (p_user, v_actor, p_type, btrim(p_reason), btrim(p_rule_ref),
     case when p_days is not null and p_days > 0 then now() + make_interval(days => p_days) end,
     v_status, p_related_report)
  returning id into v_id;

  if v_status = 'active' then
    perform public.notify(p_user, 'sanction', p_user, '/appeals', p_type, btrim(p_reason));
  else
    perform public.admin_notify_staff('sanction_approval', '/admin/moderation',
      'Permanent ban awaiting approval', btrim(p_reason));
  end if;

  perform public.admin_audit('moderation.sanction.issue', 'user', p_user::text,
    p_type || ': ' || btrim(p_reason), jsonb_build_object('sanction_id', v_id, 'days', p_days), v_actor);
  return jsonb_build_object('id', v_id, 'status', v_status, 'banned', v_banned);
end;
$$;

create or replace function public.admin_sanction_approve(p_sanction uuid, p_approve boolean)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_user   uuid;
  v_type   text;
  v_reason text;
begin
  if not public.is_admin_user('users.ban') then
    raise exception 'Missing permission: users.ban';
  end if;
  select user_id, type, reason into v_user, v_type, v_reason
    from public.moderation_sanctions where id = p_sanction and status = 'pending_approval';
  if v_user is null then raise exception 'Sanction not pending approval'; end if;

  if p_approve then
    update public.moderation_sanctions
      set status = 'active', approved_by = v_actor, approved_at = now()
      where id = p_sanction;
    perform public.notify(v_user, 'sanction', v_user, '/appeals', v_type, v_reason);
    perform public.admin_notify_staff('sanction_approved', '/admin/moderation',
      'Permanent ban approved', v_reason);
    perform public.admin_audit('moderation.sanction.approve', 'user', v_user::text, v_reason);
    return 'active';
  end if;
  update public.moderation_sanctions
    set status = 'refused', approved_by = v_actor, approved_at = now()
    where id = p_sanction;
  perform public.admin_audit('moderation.sanction.refuse', 'user', v_user::text, 'Ban request refused');
  return 'refused';
end;
$$;

create or replace function public.admin_sanction_lift(p_sanction uuid, p_reason text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_user  uuid;
begin
  if not public.is_admin_user('moderation.sanction') then
    raise exception 'Missing permission: moderation.sanction';
  end if;
  select user_id into v_user from public.moderation_sanctions where id = p_sanction;
  if v_user is null then raise exception 'Sanction not found'; end if;
  update public.moderation_sanctions
    set status = 'lifted', lifted_by = v_actor, lifted_at = now(),
        lift_reason = coalesce(btrim(p_reason), '')
    where id = p_sanction and status in ('active','pending_approval');
  perform public.notify(v_user, 'sanction_lifted', v_user, '/appeals', 'Sanction lifted', btrim(p_reason));
  perform public.admin_audit('moderation.sanction.lift', 'user', v_user::text, btrim(p_reason));
end;
$$;

create or replace function public.admin_sanctions_list()
returns table (
  id uuid, user_id uuid, user_code text, user_name text, type text, reason text,
  rule_ref text, starts_at timestamptz, ends_at timestamptz, status text,
  issued_by uuid, related_report_id uuid, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, p.user_code, p.display_name, m.type, m.reason,
         m.rule_ref, m.starts_at, m.ends_at, m.status, m.issued_by,
         m.related_report_id, m.created_at
  from public.moderation_sanctions m
  left join public.profiles p on p.id = m.user_id
  order by m.created_at desc
  limit 200
$$;

-- ---------------------------------------------------------------- appeals
-- A student contests one of their ACTIVE sanctions (not warnings).
create or replace function public.appeal_submit(p_sanction uuid, p_statement text)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if not exists (
    select 1 from public.moderation_sanctions
    where id = p_sanction and user_id = v_uid and status = 'active'
      and type in ('restriction','suspension','ban')
  ) then
    raise exception 'This sanction cannot be appealed';
  end if;
  insert into public.moderation_appeals (sanction_id, user_id, statement)
  values (p_sanction, v_uid, btrim(p_statement))
  returning id into v_id;
  perform public.admin_notify_staff('appeal_filed', '/admin/moderation',
    'New sanction appeal', btrim(p_statement));
  perform public.admin_audit('moderation.appeal.file', 'sanction', p_sanction::text,
    btrim(p_statement), jsonb_build_object('appeal_id', v_id), v_uid);
  return v_id;
end;
$$;

create or replace function public.my_appeals()
returns table (id uuid, sanction_id uuid, statement text, status text,
               decision_reason text, created_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.sanction_id, a.statement, a.status, a.decision_reason,
         a.created_at, a.decided_at
  from public.moderation_appeals a
  where a.user_id = (select auth.uid())
  order by a.created_at desc
  limit 50
$$;

create or replace function public.admin_appeals_list()
returns table (
  id uuid, sanction_id uuid, user_id uuid, user_code text, user_name text,
  sanction_type text, statement text, status text, decision_reason text,
  created_at timestamptz, decided_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id, a.sanction_id, a.user_id, p.user_code, p.display_name,
         m.type, a.statement, a.status, a.decision_reason, a.created_at, a.decided_at
  from public.moderation_appeals a
  left join public.profiles p on p.id = a.user_id
  left join public.moderation_sanctions m on m.id = a.sanction_id
  order by a.created_at desc
  limit 200
$$;

-- Decide an appeal: accepted can lift the sanction in the same action.
create or replace function public.admin_appeal_decide(
  p_appeal uuid, p_decision text, p_reason text, p_lift boolean default false
)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor   uuid := auth.uid();
  v_user    uuid;
  v_sanction uuid;
begin
  if not public.is_admin_user('moderation.appeals.handle') then
    raise exception 'Missing permission: moderation.appeals.handle';
  end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Unknown decision'; end if;
  select user_id, sanction_id into v_user, v_sanction
    from public.moderation_appeals where id = p_appeal and status = 'pending';
  if v_user is null then raise exception 'Appeal not pending'; end if;

  update public.moderation_appeals
    set status = p_decision, decided_by = v_actor, decision_reason = coalesce(btrim(p_reason), ''),
        decided_at = now()
    where id = p_appeal;

  if p_decision = 'accepted' and p_lift then
    update public.moderation_sanctions
      set status = 'lifted', lifted_by = v_actor, lifted_at = now(),
          lift_reason = 'Appeal accepted: ' || coalesce(btrim(p_reason), '')
      where id = v_sanction and status = 'active';
    perform public.notify(v_user, 'sanction_lifted', v_user, '/appeals',
      'Appeal accepted', coalesce(btrim(p_reason), ''));
  else
    perform public.notify(v_user, 'appeal_decision', v_user, '/appeals', p_decision,
      coalesce(btrim(p_reason), ''));
  end if;
  perform public.admin_audit('moderation.appeal.decide', 'appeal', p_appeal::text,
    p_decision || ': ' || coalesce(btrim(p_reason), ''),
    jsonb_build_object('lifted', p_decision = 'accepted' and p_lift), v_actor);
  return p_decision;
end;
$$;

-- The student-side gate: own ACTIVE sanctions (suspensions and bans block).
create or replace function public.me_sanctions()
returns table (id uuid, type text, reason text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.type, m.reason, m.starts_at, m.ends_at
  from public.moderation_sanctions m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.type in ('restriction','suspension','ban')
    and (m.ends_at is null or m.ends_at > now())
$$;

revoke all on function public.admin_notify_staff(text, text, text, text) from public, anon;
revoke all on function public.admin_report_create(text, text, text, uuid, text) from public, anon;
revoke all on function public.admin_reports_list(text) from public, anon;
revoke all on function public.admin_report_action(uuid, text, text) from public, anon;
revoke all on function public.admin_sanction_issue(uuid, text, text, text, integer, uuid) from public, anon;
revoke all on function public.admin_sanction_approve(uuid, boolean) from public, anon;
revoke all on function public.admin_sanction_lift(uuid, text) from public, anon;
revoke all on function public.admin_sanctions_list() from public, anon;
revoke all on function public.appeal_submit(uuid, text) from public, anon;
revoke all on function public.my_appeals() from public, anon;
revoke all on function public.admin_appeals_list() from public, anon;
revoke all on function public.admin_appeal_decide(uuid, text, text, boolean) from public, anon;
revoke all on function public.me_sanctions() from public, anon;
grant execute on function public.admin_report_create(text, text, text, uuid, text) to authenticated;
grant execute on function public.admin_reports_list(text) to authenticated;
grant execute on function public.admin_report_action(uuid, text, text) to authenticated;
grant execute on function public.admin_sanction_issue(uuid, text, text, text, integer, uuid) to authenticated;
grant execute on function public.admin_sanction_approve(uuid, boolean) to authenticated;
grant execute on function public.admin_sanction_lift(uuid, text) to authenticated;
grant execute on function public.admin_sanctions_list() to authenticated;
grant execute on function public.appeal_submit(uuid, text) to authenticated;
grant execute on function public.my_appeals() to authenticated;
grant execute on function public.admin_appeals_list() to authenticated;
grant execute on function public.admin_appeal_decide(uuid, text, text, boolean) to authenticated;
grant execute on function public.me_sanctions() to authenticated;
