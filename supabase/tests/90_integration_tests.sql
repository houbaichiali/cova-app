-- =============================================================================
-- COVA — Integration wiring test suite (90)
--
-- Covers 20261115000012_integration_wiring.sql:
--   * assignment submission transition pays the rule once per submission
--   * lesson completion pays the rule once per lesson
--   * Q&A answers pay the rule once per answer
--   * preferences: members who disabled community notifications stop
--     receiving the new community kinds; moderation notices stay on
--
-- Reuses the 30_profile_tests fixtures (course 'prof101', assignment
-- '22222222-…'). notifications_enabled_for is revoked from clients, so its
-- checks run as postgres with the mock identity set.
-- RUN AFTER 10/…/85 in the same mock-auth database.
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

-- fixtures: enroll ivan in the existing portfolio course
reset role;
insert into public.course_enrollments (course_id, user_id)
values ('prof101', '00000000-0000-0000-0000-000000000043')
on conflict do nothing;
set role authenticated;

-- ------------------------------------------------- assignment submission XP
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan starts the portfolio assignment',
  $$insert into public.assignment_submissions (id, assignment_id, student_id, status)
    values ('99999999-9999-9999-9999-999999999999','22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000043','in_progress')$$, 'ok');
select t.check('transition to submitted pays 25 XP',
  $$update public.assignment_submissions set status='submitted' where id='99999999-9999-9999-9999-999999999999'$$, 'rows=1');
select t.check('rule ledger row (submission:<id>)',
  $$select 1 from public.xp_ledger where event_key='rule:assignments:submit:standard:submission:99999999-9999-9999-9999-999999999999' and amount=25 and user_id='00000000-0000-0000-0000-000000000043'$$, 'rows=1');
-- a later grading transition must not pay again
select t.check('grading update does not pay again',
  $$update public.assignment_submissions set status='graded' where id='99999999-9999-9999-9999-999999999999'$$, 'rows=1');
select t.check('still exactly one rule ledger row',
  $$select 1 from public.xp_ledger where event_key='rule:assignments:submit:standard:submission:99999999-9999-9999-9999-999999999999' having count(*)=1$$, 'rows=1');

-- ------------------------------------------------------ lesson completion XP
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan completes one more lesson (integration)',
  $$insert into public.lesson_completions (lesson_id) values ('int-lesson-1')$$, 'rows=1');
select t.check('lesson rule pays 10 XP',
  $$select 1 from public.xp_ledger where event_key='rule:lessons:complete:standard:lesson:int-lesson-1' and amount=10 and user_id='00000000-0000-0000-0000-000000000043'$$, 'rows=1');
select t.check('re-completing the same lesson pays nothing',
  $$insert into public.lesson_completions (lesson_id) values ('int-lesson-1')$$, 'error');

-- --------------------------------------------------------------- Q&A answer XP
select t.check('ivan answers a question (integration)',
  $$insert into public.qa_answers (question_id, body)
    values ('44444444-4444-4444-4444-444444444444','Integration answer body')$$, 'ok');
select t.check('qa answer rule pays 5 XP',
  $$select 1 from public.xp_ledger where event_key='rule:qa:answer:standard:answer:' || (
      select id::text from public.qa_answers where body='Integration answer body' limit 1
    ) and amount=5 and user_id='00000000-0000-0000-0000-000000000043'$$, 'rows=1');

-- ------------------------------------------------- notification preferences
reset role;
insert into public.user_settings (user_id, notify_communities)
  values ('00000000-0000-0000-0000-000000000043', false)
  on conflict (user_id) do update set notify_communities = false;
select t.check('community kinds respect the toggle (post_comment off)',
  $$select 1 where not public.notifications_enabled_for('00000000-0000-0000-0000-000000000043','post_comment')$$, 'rows=1');
select t.check('qa_answer follows the community toggle',
  $$select 1 where not public.notifications_enabled_for('00000000-0000-0000-0000-000000000043','qa_answer')$$, 'rows=1');
select t.check('sanction notices stay on',
  $$select 1 where public.notifications_enabled_for('00000000-0000-0000-0000-000000000043','sanction')$$, 'rows=1');
delete from public.user_settings where user_id='00000000-0000-0000-0000-000000000043';
select t.check('default stays allowed when no settings row exists',
  $$select 1 where public.notifications_enabled_for('00000000-0000-0000-0000-000000000043','post_reaction')$$, 'rows=1');

-- ==================================================================== SUMMARY
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
  from t.results where label like '%ivan%' or label like '%lesson%' or label like '%rule%'
     or label like '%grading%' or label like '%qa%' or label like '%community%' or label like '%sanction%'
     or label like '%default%';
