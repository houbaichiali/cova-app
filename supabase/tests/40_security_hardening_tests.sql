-- =============================================================================
-- COVA — Security hardening test suite (40)
--
-- Covers the Phase 1 hardening migration 20261115000002_security_hardening.sql:
--   * media buckets are private, size-limited, and path-constrained
--   * quiz_grant_xp is no longer client-executable
--   * moderation sanctions (suspension) block social writes at RLS level
--   * portfolio_skills highlights can be toggled, verification stays admin-only
--   * submit_challenge pays XP through the idempotent ledger, once per challenge
--
-- RUN (plain Postgres with the mock-auth harness, AFTER 10/20/30 in the same DB
-- so the t.* helpers and personas exist):
--     createdb covatest
--     psql -d covatest -f supabase/tests/00_mock_supabase.sql
--     psql -d covatest -f supabase/migrations/20261012000001_social_schema.sql
--     psql -d covatest -f supabase/migrations/20261012000002_social_rls_and_rpc.sql
--     ... (the full migration chain, in file-name order) ...
--     psql -d covatest -f supabase/tests/10_rls_tests.sql
--     psql -d covatest -f supabase/tests/20_admin_tests.sql
--     psql -d covatest -f supabase/tests/30_profile_tests.sql
--     psql -d covatest -f supabase/tests/40_security_hardening_tests.sql
--   Last lines: TOTAL n pass=n fail=0
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

-- Extra personas: gina (owner), harold (sanctioned student), ivan (student).
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000041','gina@x.edu','{"display_name":"Gina Owner"}'),
 ('00000000-0000-0000-0000-000000000042','harold@x.edu','{"display_name":"Harold Sanctioned"}'),
 ('00000000-0000-0000-0000-000000000043','ivan@x.edu','{"display_name":"Ivan Student"}')
on conflict (id) do nothing;

grant usage on schema storage to authenticated, anon;
-- Real Supabase has RLS enabled on storage.objects; the mock does not (mirrors
-- what 30_profile_tests.sql does for its own storage checks).
alter table storage.objects enable row level security;

-- ============================================================ BUCKETS CONFIG
select t.check('dm-media bucket is private with 25MB limit',
  $$select 1 from storage.buckets where id='dm-media' and public=false and file_size_limit=26214400$$, 'rows=1');
select t.check('space-media bucket is private with 25MB limit',
  $$select 1 from storage.buckets where id='space-media' and public=false and file_size_limit=26214400$$, 'rows=1');

-- ======================================================== XP PRIVILEGE (P0-1)
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000041'); -- gina
select t.check('quiz_grant_xp is not client-executable',
  $$select public.quiz_grant_xp('00000000-0000-0000-0000-000000000041','test:mint',10,'mint')$$, 'error');
select t.check('grant_xp itself stays hidden from clients',
  $$select public.grant_xp('00000000-0000-0000-0000-000000000041','test:mint2',10,'mint')$$, 'error');

-- ======================================================== SANCTIONS (P0-3)
reset role;
insert into public.moderation_sanctions (user_id, issued_by, type, reason)
values ('00000000-0000-0000-0000-000000000042','00000000-0000-0000-0000-00000000000a','suspension','hardening test suspension');
set role authenticated;

-- A sanctioned user cannot send friend requests or messages.
select t.as_user('00000000-0000-0000-0000-000000000042'); -- harold (suspended)
select t.check('sanctioned: no friend requests',
  $$insert into public.friendships (to_id) values ('00000000-0000-0000-0000-000000000043')$$, 'error');
select t.check('sanctioned: no direct messages',
  $$insert into public.direct_messages (to_id, body) values ('00000000-0000-0000-0000-000000000043','hi')$$, 'error');

-- Positive control: a non-sanctioned user still can.
select t.as_user('00000000-0000-0000-0000-000000000041'); -- gina
select t.check('unsanctioned: friend request goes through',
  $$insert into public.friendships (to_id) values ('00000000-0000-0000-0000-000000000043')$$, 'ok');

-- Spaces: gina owns a group, harold is a member; only gina may post.
select t.check('gina creates a private-ish group',
  $$insert into public.spaces (id, kind, name, owner_id) values ('11111111-1111-1111-1111-111111111111','group','Hardening Test Group','00000000-0000-0000-0000-000000000041')$$, 'ok');
select t.check('gina adds harold as member',
  $$insert into public.space_members (space_id, user_id, role) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000042','member')$$, 'ok');
select t.as_user('00000000-0000-0000-0000-000000000042'); -- harold
select t.check('sanctioned: no group posts',
  $$insert into public.space_posts (space_id, author_id, body) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000042','nope')$$, 'error');
-- A pending request sent to the sanctioned user cannot be accepted either.
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan sends harold a request',
  $$insert into public.friendships (to_id) values ('00000000-0000-0000-0000-000000000042')$$, 'ok');
select t.as_user('00000000-0000-0000-0000-000000000042'); -- harold
select t.check('sanctioned: cannot accept requests',
  $$update public.friendships set status='accepted' where from_id='00000000-0000-0000-0000-000000000043' and to_id='00000000-0000-0000-0000-000000000042'$$, 'error');

-- Lifting the sanction restores normal behaviour.
reset role;
update public.moderation_sanctions set status='lifted' where user_id='00000000-0000-0000-0000-000000000042';
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000042'); -- harold (lifted)
select t.check('lifted: group post allowed again',
  $$insert into public.space_posts (space_id, author_id, body) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000042','hello now')$$, 'ok');
select t.check('lifted: request acceptance allowed again',
  $$update public.friendships set status='accepted' where from_id='00000000-0000-0000-0000-000000000043' and to_id='00000000-0000-0000-0000-000000000042'$$, 'ok');

-- ================================================== PORTFOLIO SKILLS (P0-4)
select t.as_user('00000000-0000-0000-0000-000000000041'); -- gina
select t.check('gina inserts a self-declared skill',
  $$insert into public.portfolio_skills (user_id, name) values ('00000000-0000-0000-0000-000000000041','Python')$$, 'ok');
select t.check('gina toggles the highlight (the old 42501 bug)',
  $$update public.portfolio_skills set highlight=true where user_id='00000000-0000-0000-0000-000000000041' and name='Python'$$, 'ok');
select t.check('verification status is not client-writable',
  $$update public.portfolio_skills set verification_status='cova_verified' where user_id='00000000-0000-0000-0000-000000000041' and name='Python'$$, 'error');
select t.check('gina cannot edit someone else''s skill',
  $$update public.portfolio_skills set highlight=true where user_id='00000000-0000-0000-0000-000000000043' and name='Python'$$, 'error');

-- ==================================================== MEDIA PATH POLICIES (P0-2)
select t.as_user('00000000-0000-0000-0000-000000000041'); -- gina
select t.check('dm media: own folder upload ok',
  $$insert into storage.objects (bucket_id, name) values ('dm-media','00000000-0000-0000-0000-000000000041/voice-1.webm')$$, 'ok');
select t.check('dm media: legacy shared folder refused',
  $$insert into storage.objects (bucket_id, name) values ('dm-media','dm/voice-1.webm')$$, 'error');
select t.check('dm media: someone else''s folder refused',
  $$insert into storage.objects (bucket_id, name) values ('dm-media','00000000-0000-0000-0000-000000000043/voice-1.webm')$$, 'error');
select t.check('space media: owner upload ok',
  $$insert into storage.objects (bucket_id, name) values ('space-media','11111111-1111-1111-1111-111111111111/photo-1.png')$$, 'ok');
select t.as_user('00000000-0000-0000-0000-000000000042'); -- harold (member, lifted)
select t.check('space media: member upload ok',
  $$insert into storage.objects (bucket_id, name) values ('space-media','11111111-1111-1111-1111-111111111111/photo-2.png')$$, 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000c'); -- carol (stranger)
select t.check('space media: stranger refused',
  $$insert into storage.objects (bucket_id, name) values ('space-media','11111111-1111-1111-1111-111111111111/photo-3.png')$$, 'error');
set role anon;
select t.check('anon cannot read media anymore',
  $$select 1 from storage.objects where bucket_id='dm-media'$$, 'rows=0');
set role authenticated;

-- ================================================== CHALLENGE XP LEDGER (P0-5)
select t.as_user('00000000-0000-0000-0000-00000000000a'); -- alice, author
select t.check('alice creates a 100-point challenge',
  $$insert into public.challenges (id, created_by, title, category, difficulty, points, minutes, exercise_type)
    values ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000a','XP Ledger Test Challenge','Coding','Easy',100,10,'quiz')$$, 'ok');
select t.check('alice stores the answer key',
  $$insert into public.challenge_answer_keys (challenge_id, answer_key) values ('22222222-2222-2222-2222-222222222222','["alpha","beta"]')$$, 'ok');

select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan, student
select t.check('ivan starts the challenge',
  $$insert into public.challenge_submissions (challenge_id, user_id, status) values ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000043','in_progress')$$, 'ok');
select t.check('ivan submits 1/2 correct (returns 50)',
  $$select public.submit_challenge('22222222-2222-2222-2222-222222222222','["alpha","zzz"]',null,null,null)$$, 'rows=1');
select t.keep('ivan_xp', $$select xp from public.profiles where id='00000000-0000-0000-0000-000000000043'$$);
select t.check('xp landed in the ledger once (50)',
  $$select 1 from public.xp_ledger where user_id='00000000-0000-0000-0000-000000000043' and event_key='challenge:22222222-2222-2222-2222-222222222222' and amount=50$$, 'rows=1');
select t.check('profiles.xp matches the award',
  $$select 1 from public.profiles where id='00000000-0000-0000-0000-000000000043' and xp=50$$, 'rows=1');

-- Re-take: allowed, but the challenge never pays twice.
select t.check('ivan re-starts the challenge',
  $$insert into public.challenge_submissions (challenge_id, user_id, status) values ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000043','in_progress')$$, 'ok');
select t.check('ivan re-submits a perfect score (still returns 100)',
  $$select public.submit_challenge('22222222-2222-2222-2222-222222222222','["alpha","beta"]',null,null,null)$$, 'rows=1');
select t.check('ledger still has exactly one challenge row',
  $$select 1 from public.xp_ledger where user_id='00000000-0000-0000-0000-000000000043' and event_key='challenge:22222222-2222-2222-2222-222222222222' having count(*)=1$$, 'rows=1');
select t.check('profiles.xp did not change on the re-take',
  $$select 1 from public.profiles where id='00000000-0000-0000-0000-000000000043' and xp=50$$, 'rows=1');
select t.check('exactly one xp_earned notification for the challenge',
  $$select 1 from public.notifications where user_id='00000000-0000-0000-0000-000000000043' and kind='xp_earned' and href='/challenges/22222222-2222-2222-2222-222222222222' having count(*)=1$$, 'rows=1');

-- ==================================================================== SUMMARY
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
  from t.results where label like '%bucket%' or label like '%xp%' or label like '%ledger%'
     or label like '%sanctioned%' or label like '%lifted%' or label like '%unsanctioned%'
     or label like '%gina%' or label like '%ivan%' or label like '%alice%'
     or label like '%dm media%' or label like '%space media%' or label like '%anon%'
     or label like '%quiz_grant_xp%' or label like '%grant_xp%' or label like '%verification%';
