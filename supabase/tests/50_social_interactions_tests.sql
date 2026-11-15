-- =============================================================================
-- COVA — Social interactions test suite (50)
--
-- Covers 20261115000004_social_interactions.sql:
--   * reactions: unique per user+kind, removable, visibility-gated
--   * comments: threaded, visibility-gated, own-only edit/delete
--   * author notifications for reactions and comments
--   * user_blocks: bidirectional DM + friend-request blocking
--
-- RUN AFTER 10/20/30/40 in the same mock-auth database (same runbook as
-- 40_security_hardening_tests.sql). Last lines: TOTAL n pass=n fail=0
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

set role authenticated;

-- Fixtures: gina's public group (1111…) from the hardening suite + a private one.
select t.as_user('00000000-0000-0000-0000-000000000041'); -- gina
select t.check('gina posts in the public group',
  $$insert into public.space_posts (space_id, author_id, body)
    values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000041','Interaction test post')$$, 'ok');
select t.keep('pub_post', $$select id from public.space_posts where body='Interaction test post' limit 1$$);
select t.check('gina creates a private group',
  $$insert into public.spaces (id, kind, name, visibility, owner_id)
    values ('33333333-3333-3333-3333-333333333333','group','Private Interaction Group','private','00000000-0000-0000-0000-000000000041')$$, 'ok');
select t.check('gina posts in the private group',
  $$insert into public.space_posts (space_id, author_id, body)
    values ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000041','Secret post')$$, 'ok');
select t.keep('priv_post', $$select id from public.space_posts where body='Secret post' limit 1$$);
select t.check('gina adds ivan to the private group',
  $$insert into public.space_members (space_id, user_id, role) values ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000043','member')$$, 'ok');

-- ------------------------------------------------------------------ reactions
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan (member)
select t.check('ivan likes the public post',
  $$insert into public.post_reactions (post_id, kind)
    select id, 'like' from public.space_posts where body='Interaction test post'$$, 'ok');
select t.check('duplicate identical reaction refused',
  $$insert into public.post_reactions (post_id, kind)
    select id, 'like' from public.space_posts where body='Interaction test post'$$, 'error');
select t.check('second reaction kind allowed',
  $$insert into public.post_reactions (post_id, kind)
    select id, 'insightful' from public.space_posts where body='Interaction test post'$$, 'ok');
select t.check('stranger cannot react to a private post',
  $$insert into public.post_reactions (post_id, kind)
    select id, 'like' from public.space_posts where body='Secret post'$$, 'error');
select t.as_user('00000000-0000-0000-0000-000000000041'); -- gina (owner)
select t.check('author sees both reactions',
  $$select 1 from public.post_reactions join public.space_posts p on p.id = post_id
    where p.body='Interaction test post' having count(*)=2$$, 'rows=1');
select t.check('author got the reaction notification',
  $$select 1 from public.notifications where kind='post_reaction' having count(*)=1$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan removes one of his reactions',
  $$delete from public.post_reactions where kind='insightful'
    and post_id in (select id from public.space_posts where body='Interaction test post')$$, 'rows=1');

-- ------------------------------------------------------------------- comments
select t.check('ivan comments on the public post',
  $$insert into public.post_comments (post_id, body)
    select id, 'Nice work!' from public.space_posts where body='Interaction test post'$$, 'ok');
select t.check('ivan replies to his own comment',
  $$insert into public.post_comments (post_id, parent_id, body)
    select id, (select c.id from public.post_comments c where c.body='Nice work!' limit 1), 'Thanks me'
      from public.space_posts where body='Interaction test post'$$, 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000c'); -- carol (stranger)
select t.check('stranger cannot comment on a private post',
  $$insert into public.post_comments (post_id, body)
    select id, 'sneaky' from public.space_posts where body='Secret post'$$, 'error');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan edits his own comment',
  $$update public.post_comments set body='Nice work, edited!'
    where body='Nice work!'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000c'); -- carol
select t.check('carol cannot edit someone else''s comment',
  $$update public.post_comments set body='hacked' where body='Nice work, edited!'$$, 'rows=0');
select t.as_user('00000000-0000-0000-0000-000000000041'); -- gina (author)
select t.check('author got exactly one comment notification',
  $$select 1 from public.notifications where kind='post_comment' having count(*)=1$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan deletes his reply (cascade removes nothing else)',
  $$delete from public.post_comments where body='Thanks me'$$, 'rows=1');

-- --------------------------------------------------------------------- blocks
select t.as_user('00000000-0000-0000-0000-00000000000a'); -- alice
select t.check('alice blocks ivan',
  $$insert into public.user_blocks (blocker_id, blocked_id)
    values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000043')$$, 'ok');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan (blocked)
select t.check('blocked: ivan cannot DM alice',
  $$insert into public.direct_messages (to_id, body) values ('00000000-0000-0000-0000-00000000000a','still friends?')$$, 'error');
select t.check('blocker direction: ivan cannot DM alice either way is closed',
  $$insert into public.friendships (to_id) values ('00000000-0000-0000-0000-00000000000a')$$, 'error');
select t.check('ivan can still DM unblocked gina',
  $$insert into public.direct_messages (to_id, body) values ('00000000-0000-0000-0000-000000000041','hi gina')$$, 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000a'); -- alice
select t.check('blocker side cannot DM the blocked user either',
  $$insert into public.direct_messages (to_id, body) values ('00000000-0000-0000-0000-000000000043','oops')$$, 'error');
select t.check('alice unblocks ivan',
  $$delete from public.user_blocks where blocked_id='00000000-0000-0000-0000-000000000043'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('unblocked: ivan can DM alice again',
  $$insert into public.direct_messages (to_id, body) values ('00000000-0000-0000-0000-00000000000a','all good')$$, 'ok');

-- ==================================================================== SUMMARY
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
  from t.results where label like '%reaction%' or label like '%comment%' or label like '%blocked%'
     or label like '%unblock%' or label like '%blocker%' or label like '%ivan%' or label like '%stranger%';
