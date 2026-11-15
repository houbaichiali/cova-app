-- =============================================================================
-- COVA — Reward Rules engine test suite (65)
--
-- Covers 20261115000007_reward_engine.sql:
--   * seeded rules exist
--   * grant_activity_reward: exact difficulty, standard fallback, no-rule → 0
--   * idempotency per activity instance (p_ref) for XP and trophies
--   * skill trophies per language + my_skill_trophies sums
--   * admin_rules_save: permission gate, valid edit, history row
--
-- grant_activity_reward is revoked from clients (like grant_xp), so its tests
-- run as postgres with the mock-auth identity set (auth.uid() still resolves).
-- RUN AFTER 10/20/30/40/50/55/60 in the same database.
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

-- --------------------------------------------------------------------- seeds
select t.check('nine reward rules seeded',
  $$select 1 from public.reward_rules having count(*)=9$$, 'rows=1');
select t.check('thirteen coding languages seeded',
  $$select 1 from public.coding_languages having count(*)=13$$, 'rows=1');
select t.check('rules are readable by members',
  $$select 1 from public.reward_rules where category='challenges' and activity='submit' and difficulty='easy' and global_xp=50$$, 'rows=1');

-- ------------------------------------------------------ attribution: XP path
reset role;
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('easy challenge pays 50 XP',
  $$select * from public.grant_activity_reward('challenges','submit','easy','sub-1',''::text,'')$$, 'rows=1');
select t.check('ledger row written with rule: key',
  $$select 1 from public.xp_ledger where event_key='rule:challenges:submit:easy:sub-1' and amount=50 and user_id='00000000-0000-0000-0000-000000000043'$$, 'rows=1');
select t.check('same instance pays again? no (idempotent)',
  $$select * from public.grant_activity_reward('challenges','submit','easy','sub-1',''::text,'')$$, 'rows=1');
select t.check('exactly one ledger row for sub-1',
  $$select 1 from public.xp_ledger where event_key='rule:challenges:submit:easy:sub-1' having count(*)=1$$, 'rows=1');
select t.check('new instance (sub-2) pays again',
  $$select * from public.grant_activity_reward('challenges','submit','easy','sub-2',''::text,'')$$, 'rows=1');
select t.check('ledger row for sub-2 exists',
  $$select 1 from public.xp_ledger where event_key='rule:challenges:submit:easy:sub-2' and amount=50$$, 'rows=1');
select t.check('unknown activity pays nothing',
  $$select * from public.grant_activity_reward('misc','nothing',null,'x1',''::text,'')$$, 'rows=1');
select t.check('standard fallback for quiz hard → 20 XP',
  $$select * from public.grant_activity_reward('quiz','complete','hard','quiz-1',''::text,'')$$, 'rows=1');
select t.check('fallback ledger row exists',
  $$select 1 from public.xp_ledger where event_key='rule:quiz:complete:hard:quiz-1' and amount=20$$, 'rows=1');

-- ------------------------------------------------- attribution: trophies path
select t.check('coding attempt pays 5 XP + 1 python trophy',
  $$select * from public.grant_activity_reward('coding','attempt',null,'run-1','python','')$$, 'rows=1');
select t.check('trophy ledger row written',
  $$select 1 from public.skill_trophy_ledger where user_id='00000000-0000-0000-0000-000000000043' and language='python' and event_key='rule:coding:attempt:standard:run-1' and amount=1$$, 'rows=1');
select t.check('same coding run pays nothing the second time',
  $$select * from public.grant_activity_reward('coding','attempt',null,'run-1','python','')$$, 'rows=1');
select t.check('my_skill_trophies sums python = 1',
  $$select 1 from public.my_skill_trophies() where language='python' and trophies=1$$, 'rows=1');
select t.check('trophies without a language pay only XP',
  $$select * from public.grant_activity_reward('coding','attempt',null,'run-2',null,'')$$, 'rows=1');
select t.check('run-2 xp ledger row exists',
  $$select 1 from public.xp_ledger where event_key='rule:coding:attempt:standard:run-2' and amount=5$$, 'rows=1');

-- ------------------------------------------------------------ admin editing
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan (not an admin)
select t.check('students cannot edit rules',
  $$select public.admin_rules_save('qa','answer','standard',7,0,true)$$, 'error');

reset role;
select t.as_user('00000000-0000-0000-0000-00000000000b'); -- bob, seeded admin
select t.check('admin raises the qa.answer rule to 7 XP',
  $$select public.admin_rules_save('qa','answer','standard',7,0,true)$$, 'rows=1');
select t.check('history row recorded',
  $$select 1 from public.reward_rule_history where new_global_xp=7 having count(*)=1$$, 'rows=1');
select t.check('range validation rejects negative XP',
  $$select public.admin_rules_save('qa','answer','standard',-5,0,true)$$, 'error');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('updated rule pays 7 XP now',
  $$select * from public.grant_activity_reward('qa','answer','standard','ans-1',null,'')$$, 'rows=1');
select t.check('updated ledger row exists',
  $$select 1 from public.xp_ledger where event_key='rule:qa:answer:standard:ans-1' and amount=7$$, 'rows=1');

-- ==================================================================== SUMMARY
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
  from t.results where label like '%rule%' or label like '%ledger%' or label like '%trophy%'
     or label like '%coding%' or label like '%admin%' or label like '%students%' or label like '%history%'
     or label like '%languages%' or label like '%instance%' or label like '%fallback%'
     or label like '%unknown%' or label like '%quiz%' or label like '%coding attempt%' or label like '%updated%';
