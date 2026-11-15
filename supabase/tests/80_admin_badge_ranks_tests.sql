-- =============================================================================
-- COVA — Admin badge management test suite (80)
--
-- Covers 20261115000010_admin_badge_ranks.sql:
--   * admin_badges_list exposes visibility_mode and ranks
--   * admin_badge_save trailing parameters keep old call shapes working
--   * ranks JSON validation (shape, bounds, duplicates)
--   * visibility modes accepted
--
-- RUN AFTER 10/…/75 in the same mock-auth database (bob is the seeded admin).
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

-- ---------------------------------------------- legacy call shape still works
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b'); -- bob (admin)
select t.check('legacy save call (no new params) still works',
  $$select public.admin_badge_save('rank-test-badge','Rank Test Badge','desc','learning',
       'lessons_done',3,'common',20,false,false,true,9,null)$$, 'rows=1');
select t.check('defaults applied (public, no ranks)',
  $$select 1 from public.badge_definitions where key='rank-test-badge' and visibility_mode='public' and ranks='[]'::jsonb$$, 'rows=1');
select t.check('list exposes visibility_mode and ranks',
  $$select 1 from public.admin_badges_list() where key='rank-test-badge' and visibility_mode='public'$$, 'rows=1');

-- ---------------------------------------------------- new parameters validated
select t.check('private visibility accepted',
  $$select public.admin_badge_save('rank-test-badge','Rank Test Badge',null,null,null,null,null,null,null,null,null,null,null,'private',null)$$, 'rows=1');
select t.check('valid rank ladder accepted',
  $$select public.admin_badge_save('rank-test-badge','Rank Test Badge',null,null,null,null,null,null,null,null,null,null,null,null,
       '[{"rank":1,"threshold":5},{"rank":2,"threshold":10}]'::jsonb)$$, 'rows=1');
select t.check('ranks persisted',
  $$select 1 from public.badge_definitions where key='rank-test-badge' and visibility_mode='private'
       and ranks='[{"rank":1,"threshold":5},{"rank":2,"threshold":10}]'::jsonb$$, 'rows=1');
select t.check('rank above 8 rejected',
  $$select public.admin_badge_save('rank-test-badge','Rank Test Badge',null,null,null,null,null,null,null,null,null,null,null,null,
       '[{"rank":9,"threshold":5}]'::jsonb)$$, 'error');
select t.check('duplicate rank numbers rejected',
  $$select public.admin_badge_save('rank-test-badge','Rank Test Badge',null,null,null,null,null,null,null,null,null,null,null,null,
       '[{"rank":1,"threshold":5},{"rank":1,"threshold":10}]'::jsonb)$$, 'error');
select t.check('negative threshold rejected',
  $$select public.admin_badge_save('rank-test-badge','Rank Test Badge',null,null,null,null,null,null,null,null,null,null,null,null,
       '[{"rank":1,"threshold":-3}]'::jsonb)$$, 'error');
select t.check('unknown visibility mode rejected',
  $$select public.admin_badge_save('rank-test-badge','Rank Test Badge',null,null,null,null,null,null,null,null,null,null,null,'secret-society',null)$$, 'error');

-- --------------------------------------------- permission gate (non-admin)
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('students cannot save badges',
  $$select public.admin_badge_save('nope-badge','Nope')$$, 'error');

-- ==================================================================== SUMMARY
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
  from t.results where label like '%legacy%' or label like '%defaults%' or label like '%list%'
     or label like '%visibility%' or label like '%rank%' or label like '%students%';
