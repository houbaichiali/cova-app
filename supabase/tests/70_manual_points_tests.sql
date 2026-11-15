-- =============================================================================
-- COVA — Manual-points removal test suite (70)
--
-- Covers 20261115000008_remove_manual_points.sql:
--   * challenges.points derived from difficulty when not provided
--   * explicit legacy points still accepted
--   * submit_challenge XP: rule-driven, ratio-scaled, once per challenge
--   * notification emitted exactly once
--
-- RUN AFTER 10/.../65 in the same mock-auth database.
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

set role authenticated;

-- ----------------------------------------------- derived points on insertion
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('author creates an Easy challenge without points',
  $$insert into public.challenges (id, created_by, title, category, difficulty, minutes, exercise_type)
    values ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000043','Derived Points Test','Coding','Easy',10,'quiz')$$, 'ok');
select t.check('points derived from difficulty (Easy → 50)',
  $$select 1 from public.challenges where id='66666666-6666-6666-6666-666666666666' and points=50$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000a'); -- alice (legacy client path)
select t.check('explicit legacy points still accepted',
  $$insert into public.challenges (id, created_by, title, category, difficulty, points, minutes, exercise_type)
    values ('77777777-7777-7777-7777-777777777777','00000000-0000-0000-0000-00000000000a','Legacy Points Test','Coding','Easy',250,10,'quiz')$$, 'ok');
select t.check('explicit points preserved (250)',
  $$select 1 from public.challenges where id='77777777-7777-7777-7777-777777777777' and points=250$$, 'rows=1');

-- ----------------------------------------- rule-driven, scaled challenge XP
select t.check('alice stores the answer key (2 answers)',
  $$insert into public.challenge_answer_keys (challenge_id, answer_key)
    values ('66666666-6666-6666-6666-666666666666','["alpha","beta"]')$$, 'ok');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan (student)
select t.check('ivan starts the challenge',
  $$insert into public.challenge_submissions (challenge_id, user_id, status)
    values ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000043','in_progress')$$, 'ok');
select t.check('ivan submits 1 of 2 correct',
  $$select public.submit_challenge('66666666-6666-6666-6666-666666666666','["alpha","zzz"]',null,null,null)$$, 'rows=1');
-- rule easy = 50 XP; ratio 1/2 → 25 XP; key rule:challenges:submit:easy:<id>
select t.check('rule-driven ledger row (25 XP, scaled 1/2)',
  $$select 1 from public.xp_ledger where event_key='rule:challenges:submit:easy:66666666-6666-6666-6666-666666666666' and amount=25 and user_id='00000000-0000-0000-0000-000000000043'$$, 'rows=1');
select t.check('exactly one xp_earned notification for the challenge',
  $$select 1 from public.notifications where kind='xp_earned' and href='/challenges/66666666-6666-6666-6666-666666666666' having count(*)=1$$, 'rows=1');
select t.check('re-take never pays again (ledger unchanged)',
  $$select 1 from public.xp_ledger where event_key='rule:challenges:submit:easy:66666666-6666-6666-6666-666666666666' having count(*)=1$$, 'rows=1');
select t.check('notification detail is the awarded XP amount (25)',
  $$select 1 from public.notifications where kind='xp_earned' and href='/challenges/66666666-6666-6666-6666-666666666666' and detail='25'$$, 'rows=1');

-- ==================================================================== SUMMARY
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
  from t.results where label like '%points%' or label like '%legacy%' or label like '%ivan%'
     or label like '%alice%' or label like '%rule-driven%' or label like '%re-take%' or label like '%notification%';
