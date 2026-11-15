-- =============================================================================
-- COVA — Follows & bookmarks test suite (55)
--
-- Covers 20261115000005_follows_bookmarks.sql:
--   * follows: follow/unfollow, no self-follow, no duplicates, notification
--   * post_bookmarks: private per user, only on visible posts, PK prevents
--     duplicates
--
-- RUN AFTER 10/20/30/40/50 in the same mock-auth database (same runbook as
-- 40_security_hardening_tests.sql). Last lines: TOTAL n pass=n fail=0
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

set role authenticated;

-- ------------------------------------------------------------------- follows
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan follows gina',
  $$insert into public.follows (followed_id) values ('00000000-0000-0000-0000-000000000041')$$, 'ok');
select t.check('duplicate follow refused',
  $$insert into public.follows (followed_id) values ('00000000-0000-0000-0000-000000000041')$$, 'error');
select t.check('self-follow refused',
  $$insert into public.follows (followed_id) values ('00000000-0000-0000-0000-000000000043')$$, 'error');
select t.check('gina got the new_follower notification',
  $$select 1 from public.notifications where kind='new_follower' having count(*)=1$$, 'rows=1');
select t.check('follows are readable by other members',
  $$select 1 from public.follows having count(*)>=1$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000c'); -- carol cannot follow AS ivan
select t.check('carol cannot unfollow for ivan',
  $$delete from public.follows where follower_id='00000000-0000-0000-0000-000000000043'$$, 'rows=0');

-- ----------------------------------------------------------------- bookmarks
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan bookmarks the public post',
  $$insert into public.post_bookmarks (post_id)
    select id from public.space_posts where body='Interaction test post'$$, 'ok');
select t.check('duplicate bookmark refused',
  $$insert into public.post_bookmarks (post_id)
    select id from public.space_posts where body='Interaction test post'$$, 'error');
select t.as_user('00000000-0000-0000-0000-00000000000c'); -- carol (stranger)
select t.check('stranger cannot bookmark a post she cannot see',
  $$insert into public.post_bookmarks (post_id)
    select id from public.space_posts where body='Secret post'$$, 'error');
select t.check('carol sees no bookmarks at all (owner-only)',
  $$select 1 from public.post_bookmarks$$, 'rows=0');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan sees exactly his bookmark',
  $$select 1 from public.post_bookmarks where user_id='00000000-0000-0000-0000-000000000043'$$, 'rows=1');
select t.check('ivan unbookmarks',
  $$delete from public.post_bookmarks where user_id='00000000-0000-0000-0000-000000000043'$$, 'rows=1');

-- ==================================================================== SUMMARY
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
  from t.results where label like '%follow%' or label like '%bookmark%' or label like '%follower%';
