-- =============================================================================
-- COVA — Cross-module integration wiring (additive, non-destructive).
--
-- Phase 11 of the community/rewards overhaul. Connects the remaining learning
-- activities to the Phase 5 reward engine and extends the notification
-- preference mapping to every new interaction kind. Everything is
-- server-side, ledger-visible and idempotent per activity instance.
-- =============================================================================

-------------------------------------------------- 1. assignment submission XP
-- External and interactive submissions both transition to 'submitted'; the
-- rule (assignments, submit) pays once per submission row.
create or replace function public.award_on_assignment_submission()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.student_id is null then return null; end if;
  perform public.grant_activity_reward(
    'assignments', 'submit', null,
    'submission:' || new.id::text, null,
    'Assignment submission'
  );
  return null;
end;
$$;

do $$
begin
  if to_regclass('public.assignment_submissions') is not null then
    drop trigger if exists assignment_submission_award on public.assignment_submissions;
    create trigger assignment_submission_award
      after insert or update of status on public.assignment_submissions
      for each row
      when (new.status = 'submitted')
      execute function public.award_on_assignment_submission();
  end if;
end $$;

-------------------------------------------------------- 2. lesson completion XP
create or replace function public.award_on_lesson_completion()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.user_id is null then return null; end if;
  perform public.grant_activity_reward(
    'lessons', 'complete', null,
    'lesson:' || new.lesson_id::text, null,
    'Lesson completion'
  );
  return null;
end;
$$;

do $$
begin
  if to_regclass('public.lesson_completions') is not null then
    drop trigger if exists lesson_completion_award on public.lesson_completions;
    create trigger lesson_completion_award
      after insert on public.lesson_completions
      for each row execute function public.award_on_lesson_completion();
  end if;
end $$;

--------------------------------------------------------- 3. Q&A answer XP
create or replace function public.award_on_qa_answer()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.author_id is null then return null; end if;
  perform public.grant_activity_reward(
    'qa', 'answer', null,
    'answer:' || new.id::text, null,
    'Community answer'
  );
  return null;
end;
$$;

drop trigger if exists qa_answer_award on public.qa_answers;
create trigger qa_answer_award
  after insert on public.qa_answers
  for each row execute function public.award_on_qa_answer();

-------------------------------------- 4. notification preferences for new kinds
-- New interaction kinds map onto the existing settings toggles; unmapped
-- kinds keep the `else true` default.
create or replace function public.notifications_enabled_for(p_user uuid, p_kind text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  allowed boolean;
begin
  if p_user is null then return false; end if;
  select case p_kind
    when 'new_message' then notify_messages
    when 'friend_request' then notify_friend_requests
    when 'friend_accepted' then notify_friend_requests
    when 'join_request' then notify_communities
    when 'join_request_approved' then notify_communities
    when 'join_request_denied' then notify_communities
    when 'member_joined' then notify_communities
    when 'member_removed' then notify_communities
    when 'role_changed' then notify_communities
    when 'assignment_created' then notify_assignments
    when 'assignment_graded' then notify_assignments
    when 'resource_added' then notify_courses
    when 'deadline_reminder' then notify_deadlines
    when 'xp_earned' then notify_challenges
    when 'badge_unlocked' then notify_challenges
    when 'badge_rank' then notify_challenges
    when 'level_up' then notify_challenges
    when 'post_reaction' then notify_communities
    when 'post_comment' then notify_communities
    when 'new_follower' then notify_communities
    when 'qa_answer' then notify_communities
    when 'collab_accepted' then notify_communities
    when 'sanction' then true
    when 'sanction_lifted' then true
    when 'appeal_decision' then true
    else true
  end
  into allowed
  from public.user_settings
  where user_id = p_user;
  return coalesce(allowed, true);
end;
$$;

revoke all on function public.notifications_enabled_for(uuid, text) from public, anon, authenticated;
