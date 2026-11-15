-- =============================================================================
-- COVA — Community foundations (additive, non-destructive).
--
-- Phase 2 of the community/rewards overhaul (docs/rewards-badges-audit.md):
--   1. report_content(): a STUDENT-FACING reporting RPC. The pre-existing
--      admin_report_create() is admin-gated and always wrote an empty
--      content_ref, so nobody could report anything from the app. Students can
--      now report a post (space_post:<uuid>) or a member (user:<code>); the
--      report lands in the existing moderation_reports queue the Admin Center
--      already triages.
--   2. spaces_delete_v3: owners can delete their own group. The v3 policy set
--      (20261102000004) intentionally had no DELETE; group deletion cascades to
--      posts and members through foreign keys. Join-code rows referencing the
--      deleted space become harmless orphans (target_id carries no FK because
--      the same table serves legacy communities).
--   3. remind_assignment_deadlines() routes through notify() so the recipient's
--      notification preferences are honoured (the previous version inserted
--      notification rows directly and bypassed user_settings toggles).
-- =============================================================================

------------------------------------------------------ 1. Student-facing reporting
create or replace function public.report_content(
  p_category text,
  p_description text,
  p_reported_user uuid default null,
  p_content_ref text default '',
  p_subject text default ''
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_reporter uuid := (select auth.uid());
  v_category text := btrim(p_category);
  v_ref text := btrim(p_content_ref);
  v_id uuid;
begin
  if v_reporter is null then raise exception 'Authentication required'; end if;
  if v_category not in ('spam', 'harassment', 'inappropriate', 'other') then
    raise exception 'Unknown report category';
  end if;
  if p_reported_user = v_reporter then
    raise exception 'You cannot report yourself';
  end if;
  if char_length(v_ref) > 200 then raise exception 'content_ref too long'; end if;
  if v_ref <> '' and v_ref !~ '^(space_post|direct_message|user):[0-9a-fA-F-]{36}$'
    and v_ref !~ '^(space_post|direct_message|user):[A-Za-z0-9_-]{1,64}$' then
    raise exception 'Invalid content_ref format';
  end if;
  -- One pending report per reporter per content: no duplicates, no spam queue.
  if v_ref <> '' and exists (
    select 1 from public.moderation_reports r
    where r.reporter_id = v_reporter and r.content_ref = v_ref and r.status = 'pending'
  ) then
    raise exception 'This content has already been reported and is awaiting review';
  end if;
  insert into public.moderation_reports
    (reporter_id, reported_user_id, subject, category, description, content_ref)
  values (
    v_reporter,
    p_reported_user,
    left(coalesce(nullif(btrim(p_subject), ''), 'User report'), 160),
    v_category,
    left(btrim(coalesce(p_description, '')), 2000),
    v_ref
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.report_content(text, text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, text, uuid, text, text) to authenticated;

--------------------------------------------------------------- 2. Group deletion
do $$
begin
  if to_regclass('public.spaces') is not null then
    drop policy if exists spaces_delete_v3 on public.spaces;
    create policy spaces_delete_v3 on public.spaces
      for delete to authenticated
      using (owner_id = auth.uid());
  end if;
end
$$;

------------------------------------------- 3. Deadline reminders honour preferences
-- Same scheduling and anti-duplicate logic; only the write path changes:
-- notify() (20261031000003:187) checks notifications_enabled_for() before
-- inserting, so members who turned reminders off stop receiving them.
create or replace function public.remind_assignment_deadlines()
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(
    e.user_id, 'deadline_reminder', a.created_by,
    '/assignments/' || a.id::text, a.title,
    to_char(a.due_at at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC'
  )
  from public.assignments a
  join public.course_enrollments e on e.course_id = a.course_id
  where a.due_at is not null
    and a.due_at > now()
    and a.due_at <= now() + interval '48 hours'
    and not exists (
      select 1 from public.notifications n
      where n.user_id = e.user_id
        and n.kind = 'deadline_reminder'
        and n.href = '/assignments/' || a.id::text
        and n.created_at > now() - interval '23 hours'
    )
    and not exists (
      select 1 from public.assignment_submissions s
      where s.assignment_id = a.id and s.student_id = e.user_id and s.status = 'submitted'
    );
end;
$$;

revoke all on function public.remind_assignment_deadlines() from public, anon, authenticated;
