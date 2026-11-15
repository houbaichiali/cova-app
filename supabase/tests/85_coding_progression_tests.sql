-- =============================================================================
-- COVA — Coding progression test suite (85)
--
-- Covers 20261115000011_coding_progression.sql:
--   * coding_attempts: private rows, self-insert only
--   * the attempt trigger feeds the reward engine: rule XP + language trophy,
--     idempotent per assignment
--   * my_coding_mastery sums trophies per language
--
-- RUN AFTER 10/…/80 in the same mock-auth database.
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

set role authenticated;

-- ivan submits a Python coding assignment
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan records a python attempt',
  $$insert into public.coding_attempts (assignment_id, language, outcome)
    values ('88888888-8888-8888-8888-888888888888','python','success')$$, 'ok');
select t.check('rule XP paid for the attempt (5)',
  $$select 1 from public.xp_ledger where event_key='rule:coding:attempt:standard:attempt:88888888-8888-8888-8888-888888888888' and amount=5 and user_id='00000000-0000-0000-0000-000000000043'$$, 'rows=1');
select t.check('one python trophy credited',
  $$select 1 from public.skill_trophy_ledger where language='python' and user_id='00000000-0000-0000-0000-000000000043' and amount=1$$, 'rows=1');
-- resubmitting the same assignment (second attempt row) must not farm
select t.check('second attempt row on the same assignment',
  $$insert into public.coding_attempts (assignment_id, language, outcome)
    values ('88888888-8888-8888-8888-888888888888','python','success')$$, 'ok');
select t.check('trophy NOT duplicated (idempotent per assignment)',
  $$select 1 from public.skill_trophy_ledger where language='python' and user_id='00000000-0000-0000-0000-000000000043' having count(*)=1$$, 'rows=1');
select t.check('mastery: python rank 1 (Novice)',
  $$select 1 from public.my_coding_mastery() where language='python' and mastery_rank=1 and trophies=1$$, 'rows=1');

-- privacy
select t.as_user('00000000-0000-0000-0000-00000000000c'); -- carol
select t.check('carol cannot read ivan''s attempts',
  $$select 1 from public.coding_attempts$$, 'rows=0');
select t.check('carol has empty mastery',
  $$select 1 from public.my_coding_mastery()$$, 'rows=0');

-- ==================================================================== SUMMARY
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
  from t.results where label like '%attempt%' or label like '%trophy%' or label like '%mastery%'
     or label like '%carol%' or label like '%rule XP%' or label like '%second%';
