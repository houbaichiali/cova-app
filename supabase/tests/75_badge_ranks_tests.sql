-- =============================================================================
-- COVA — Badge ranks test suite (75)
--
-- Covers 20261115000009_badge_ranks.sql:
--   * bookworm seeded with a full 8-rank ladder
--   * the lesson-completion trigger awards rank 1 automatically at 10 lessons
--   * XP through the ledger (badge_rank:<badge>:<rank>) + notification
--   * idempotent evaluation, my_badge_ranks reader
--
-- RUN AFTER 10/…/70 in the same mock-auth database.
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

set role authenticated;

select t.check('bookworm has 8 configured ranks',
  $$select 1 from public.badge_definitions where key='bookworm' and jsonb_array_length(ranks)=8$$, 'rows=1');
select t.check('visibility_mode column exists with public default',
  $$select 1 from public.badge_definitions where key='bookworm' and visibility_mode='public'$$, 'rows=1');

-- ivan completes 10 lessons: the additive trigger must award rank 1.
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan completes 10 lessons',
  $$insert into public.lesson_completions (lesson_id)
    select 'rk-' || g from generate_series(1, 10) g$$, 'rows=10');
select t.check('rank 1 awarded automatically',
  $$select 1 from public.badge_rank_awards where user_id='00000000-0000-0000-0000-000000000043' and badge_key='bookworm' and rank=1$$, 'rows=1');
select t.check('rank XP went through the ledger (badge_rank key)',
  $$select 1 from public.xp_ledger where event_key='badge_rank:bookworm:1' and amount=20 and user_id='00000000-0000-0000-0000-000000000043'$$, 'rows=1');
select t.check('badge_rank notification emitted',
  $$select 1 from public.notifications where kind='badge_rank' and detail='1' having count(*)=1$$, 'rows=1');
select t.check('rank 2 NOT awarded at 10 lessons',
  $$select 1 from public.badge_rank_awards where badge_key='bookworm' and rank=2$$, 'rows=0');

-- idempotency: re-running the evaluator must not double-award.
reset role;
select t.as_user('00000000-0000-0000-0000-000000000043');
select public.evaluate_badge_ranks('00000000-0000-0000-0000-000000000043');
select t.check('re-evaluation does not duplicate awards',
  $$select 1 from public.badge_rank_awards where badge_key='bookworm' having count(*)=1$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('my_badge_ranks exposes rank 1 with a label',
  $$select 1 from public.my_badge_ranks() where badge_key='bookworm' and rank=1 and label='Rank 1 · Novice'$$, 'rows=1');

-- another member: carol has no lessons → no rank awards.
select t.as_user('00000000-0000-0000-0000-00000000000c'); -- carol
select t.check('carol has no rank awards',
  $$select 1 from public.my_badge_ranks()$$, 'rows=0');

-- ==================================================================== SUMMARY
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
  from t.results where label like '%rank%' or label like '%ledger%' or label like '%notification%'
     or label like '%visibility%' or label like '%ivan%' or label like '%carol%' or label like '%bookworm%'
     or label like '%re-evaluation%' or label like '%lessons%';
