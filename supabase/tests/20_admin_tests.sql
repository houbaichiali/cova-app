-- =============================================================================
-- Admin Center regression tests: permissions, auditing and data integrity for
-- every admin module. Runs AFTER 10_rls_tests.sql, on the same database
-- (mocked auth). Run as the `postgres` superuser like the base harness:
--   psql -d covabase -f tests/20_admin_tests.sql
--
-- Personas: 10_rls_tests.sql leaves alice (a), bob (b), carol (c), erin (e);
-- dave was deleted by the base suite. This file adds:
--   frank 00000000-0000-0000-0000-00000000000f  analyst role
-- and grants bob -> admin, carol -> moderator.
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

-- scalar getter for keys stored with t.keep
create function t.get(p_key text) returns text language plpgsql as $$
declare val text;
begin select v into val from t.ctx where k = p_key; return val; end $$;
grant execute on function t.get(text) to authenticated, anon;

-- ============================================================================
-- setup: roles + an extra persona (superuser, like the live founder bootstrap)
-- ============================================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000f', 'frank@x.edu', '{"display_name":"Frank Analyst"}');

insert into public.user_admin_roles (user_id, role_key, granted_by) values
  ('00000000-0000-0000-0000-00000000000b', 'admin',      '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c', 'moderator',  '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000f', 'analyst',    '00000000-0000-0000-0000-00000000000b')
on conflict do nothing;

-- ============================================================================
-- PHASE: rules & policies
-- ============================================================================
set role authenticated;

-- erin (plain student) -------------------------------------------------------
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('rules: student cannot create', $$select public.admin_rule_create('T','d','general','low')$$, 'error');
select t.check('rules: student cannot list', $$select * from public.admin_rules_list()$$, 'error');
select t.check('rules: student cannot change status', $$select public.admin_rule_status(gen_random_uuid(),'publish')$$, 'error');
select t.check('rules: student cannot read versions', $$select * from public.admin_rule_versions(gen_random_uuid())$$, 'error');

-- carol (moderator: rules.read, no rules.manage) -----------------------------
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.check('rules: moderator without rules.manage cannot create', $$select public.admin_rule_create('T','d','general','low')$$, 'error');

-- bob (admin: rules.manage) --------------------------------------------------
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.keep('rule_id', $$select public.admin_rule_create('Be respectful','No harassment','respect','high','Warn then suspend', date '2026-12-01')$$);
select t.check('rules: created as draft v1', $$select 1 from public.admin_rules_list('','','draft') where id=t.get('rule_id')::uuid and version=1$$, 'rows=1');

-- status transitions
select t.check('rules: publish draft', $$select public.admin_rule_status(t.get('rule_id')::uuid,'publish')$$, 'ok');
select t.check('rules: publish twice refused', $$select public.admin_rule_status(t.get('rule_id')::uuid,'publish')$$, 'error');
select t.check('rules: unpublish back to draft', $$select public.admin_rule_status(t.get('rule_id')::uuid,'unpublish')$$, 'ok');
select t.check('rules: publish again', $$select public.admin_rule_status(t.get('rule_id')::uuid,'publish')$$, 'ok');

-- content edit bumps version + freezes history
select t.keep('rule_version', $$select public.admin_rule_update(t.get('rule_id')::uuid,'Be respectful','No harassment or bullying','respect','high','Warn then suspend', date '2026-12-01','Clarified scope')$$);
select t.check('rules: edit bumps to v2', $$select 1 from public.admin_rules_list('','','') where id=t.get('rule_id')::uuid and version=2 having t.get('rule_version')='2'$$, 'rows=1');
select t.check('rules: two version rows exist', $$select count(*) from public.admin_rule_versions(t.get('rule_id')::uuid) having count(*)=2$$, 'rows=1');
select t.check('rules: v1 content preserved', $$select 1 from public.admin_rule_versions(t.get('rule_id')::uuid) where version=1 and description='No harassment'$$, 'rows=1');
select t.check('rules: v2 content updated', $$select 1 from public.admin_rule_versions(t.get('rule_id')::uuid) where version=2 and description='No harassment or bullying'$$, 'rows=1');

-- archive / reactivate
select t.check('rules: archive active rule', $$select public.admin_rule_status(t.get('rule_id')::uuid,'archive')$$, 'ok');
select t.check('rules: archive twice refused', $$select public.admin_rule_status(t.get('rule_id')::uuid,'archive')$$, 'error');
select t.check('rules: reactivate archived', $$select public.admin_rule_status(t.get('rule_id')::uuid,'reactivate')$$, 'ok');

-- search & filters
select t.check('rules: search by title', $$select 1 from public.admin_rules_list('respectful','','') $$, 'rows=1');
select t.check('rules: filter by category', $$select 1 from public.admin_rules_list('','respect','')$$, 'rows=1');
select t.check('rules: filter by status', $$select 1 from public.admin_rules_list('','','active') where id=t.get('rule_id')::uuid$$, 'rows=1');

-- validation
select t.check('rules: empty title refused', $$select public.admin_rule_create('  ','d','general','low')$$, 'error');
select t.check('rules: bad severity refused', $$select public.admin_rule_create('T','d','general','ultra')$$, 'error');
select t.check('rules: unknown status action refused', $$select public.admin_rule_status(t.get('rule_id')::uuid,'nuke')$$, 'error');
select t.check('rules: update unknown rule refused', $$select public.admin_rule_update(gen_random_uuid(),'T','d','general','low','',null,'')$$, 'error');

-- audit trail (read as the DB owner: no SELECT grant on the log by design)
reset role;
select t.check('rules: create+edits+status changes audited', $$select count(*) from public.admin_audit_logs where action like 'rules.%' and target_id=t.get('rule_id')::text having count(*)=7$$, 'rows=1');
set role authenticated;

-- analyst (read-only) --------------------------------------------------------
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('rules: analyst can read list', $$select * from public.admin_rules_list('','','')$$, 'rows=1');
select t.check('rules: analyst can read versions', $$select * from public.admin_rule_versions(t.get('rule_id')::uuid)$$, 'rows=2');
select t.check('rules: analyst cannot edit', $$select public.admin_rule_update(t.get('rule_id')::uuid,'x','d','general','low','',null,'')$$, 'error');
select t.check('rules: analyst cannot create', $$select public.admin_rule_create('T','d','general','low')$$, 'error');

-- ============================================================================
-- PHASE: content quality review
-- ============================================================================
reset role; -- setup below runs as the DB owner (RLS does not apply to it)

-- a quiz authored by carol + a resource uploaded by erin to review
insert into public.quizzes (id, created_by, title, category, questions)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'Cells basics', 'Science', '[]'::jsonb);
insert into public.shared_resources (title, type, category, minutes, file_name, mime_type, file_size, storage_path, uploaded_by)
values ('Algebra sheet', 'Cheatsheet', 'Mathematics', 5, 'alg.pdf', 'application/pdf', 1024,
        '00000000-0000-0000-0000-00000000000e/alg.pdf', '00000000-0000-0000-0000-00000000000e');

-- grant content_manager role to carol as well (moderator+content_manager)
insert into public.user_admin_roles (user_id, role_key, granted_by)
values ('00000000-0000-0000-0000-00000000000c', 'content_manager', '00000000-0000-0000-0000-00000000000b')
on conflict do nothing;

set role authenticated;

-- erin (plain student): nothing allowed
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('content: student cannot browse', $$select * from public.admin_content_browse('quiz')$$, 'error');
select t.check('content: student cannot enqueue', $$select public.admin_content_enqueue('quiz','11111111-1111-1111-1111-111111111111')$$, 'error');
select t.check('content: student cannot decide', $$select public.admin_content_decide(gen_random_uuid(),'approve','')$$, 'error');

-- analyst: read-only role, must not decide
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('content: analyst cannot enqueue', $$select public.admin_content_enqueue('quiz','11111111-1111-1111-1111-111111111111')$$, 'error');
select t.check('content: analyst cannot browse', $$select * from public.admin_content_browse('quiz')$$, 'error');

-- carol (content_manager): full review workflow
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.check('content: manager browses quizzes', $$select 1 from public.admin_content_browse('quiz') where content_id='11111111-1111-1111-1111-111111111111'$$, 'rows=1');
select t.keep('quiz_review', $$select public.admin_content_enqueue('quiz','11111111-1111-1111-1111-111111111111')$$);
select t.keep('res_review',  $$select public.admin_content_enqueue('resource',(select id from public.shared_resources where title='Algebra sheet'))$$);
select t.check('content: double enqueue refused', $$select public.admin_content_enqueue('quiz','11111111-1111-1111-1111-111111111111')$$, 'error');
select t.check('content: assign to self', $$select public.admin_content_assign(t.get('quiz_review')::uuid)$$, 'ok');
select t.check('content: request correction (no content change)', $$select public.admin_content_decide(t.get('quiz_review')::uuid,'request_correction','Add diagrams')$$, 'ok');
select t.check('content: quiz untouched by correction', $$select 1 from public.quizzes where id='11111111-1111-1111-1111-111111111111' and visibility='public' and questions='[]'::jsonb$$, 'rows=1');
select t.check('content: hide quiz -> private', $$select public.admin_content_decide(t.get('quiz_review')::uuid,'hide','Wrong answer in Q2')$$, 'ok');
select t.check('content: quiz visibility now private', $$select 1 from public.quizzes where id='11111111-1111-1111-1111-111111111111' and visibility='private'$$, 'rows=1');
select t.check('content: unhide restores public', $$select public.admin_content_decide(t.get('quiz_review')::uuid,'unhide','')$$, 'ok');
select t.check('content: remove resource', $$select public.admin_content_decide(t.get('res_review')::uuid,'remove','Copyright issue')$$, 'ok');
select t.check('content: resource hidden flag set', $$select 1 from public.shared_resources where title='Algebra sheet' and hidden$$, 'rows=1');
select t.check('content: queue shows both reviews', $$select count(*) from public.admin_content_queue('','') having count(*)=2$$, 'rows=1');
select t.check('content: queue filter by status', $$select 1 from public.admin_content_queue('','removed') where content_type='resource'$$, 'rows=1');
select t.check('content: unknown action refused', $$select public.admin_content_decide(t.get('res_review')::uuid,'delete','')$$, 'error');

-- student still reads their own hidden resource, but others do not
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('content: owner still sees own hidden resource', $$select 1 from public.shared_resources where title='Algebra sheet'$$, 'rows=1');
-- a different student (bob) must NOT see it
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('content: other student cannot see hidden resource (admin sees own)', $$select 1 from public.shared_resources where title='Algebra sheet' and not hidden$$, 'rows=0');

-- audit trail
reset role;
select t.check('content: decisions audited', $$select count(*) from public.admin_audit_logs where action like 'content.%' having count(*)>=7$$, 'rows=1');
set role authenticated;

-- ============================================================================
-- PHASE: badge & XP management
-- ============================================================================
-- grant carol the badges.manage + xp.adjust permissions via content_manager? No:
-- content_manager lacks them. Grant bob a second role is admin (has all but
-- users.delete/team.manage). Erin stays the denial persona.
set role authenticated;

-- erin (student): nothing
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('gamif: student cannot list badges', $$select * from public.admin_badges_list()$$, 'error');
select t.check('gamif: student cannot adjust xp', $$select public.admin_xp_adjust('00000000-0000-0000-0000-00000000000e'::uuid, 50, 'test reason', 'abc123')$$, 'error');
select t.check('gamif: student cannot read xp history', $$select * from public.admin_xp_history()$$, 'error');

-- analyst: read-only, no gamification permissions
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('gamif: analyst cannot create badge', $$select public.admin_badge_save('test-badge','Test','')$$, 'error');
select t.check('gamif: analyst cannot adjust xp', $$select public.admin_xp_adjust('00000000-0000-0000-0000-00000000000e'::uuid, 50, 'test reason', 'abc124')$$, 'error');

-- bob (admin): badges.manage + xp.adjust
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('gamif: admin creates badge', $$select public.admin_badge_save('test-bronze','Test Bronze','A test badge','learning','streak',3,'common',15,false,false,true,999)$$, 'ok');
select t.check('gamif: badge exists with base_key', $$select 1 from public.badge_definitions where key='test-bronze' and base_key='test' and metric='streak' and threshold=3$$, 'rows=1');
select t.check('gamif: admin updates badge', $$select public.admin_badge_save('test-bronze','Test Bronze v2','Updated','learning','streak',5,'uncommon',25,false,false,false,999)$$, 'ok');
select t.check('gamif: update kept key, changed fields', $$select 1 from public.badge_definitions where key='test-bronze' and name='Test Bronze v2' and threshold=5 and enabled=false$$, 'rows=1');
select t.check('gamif: unknown metric refused', $$select public.admin_badge_save('test-bad','X','','learning','no_such_metric',1)$$, 'error');
select t.check('gamif: bad key refused', $$select public.admin_badge_save('Bad Key!','X','')$$, 'error');
select t.check('gamif: threshold 0 refused', $$select public.admin_badge_save('test-low','X','','learning','streak',0)$$, 'error');

-- recipients (insert as the DB owner: clients have no INSERT grant on awards)
reset role;
insert into public.user_badges (user_id, badge_key) values
  ('00000000-0000-0000-0000-00000000000c', 'test-bronze');
set role authenticated;
select t.check('gamif: recipients listed', $$select 1 from public.admin_badge_recipients('test-bronze') where display_name='carol'$$, 'rows=1');
reset role; -- award rows of other users are RLS-hidden from admins (read own or pinned only)
select t.check('gamif: disabling badge keeps awards', $$select 1 from public.user_badges where badge_key='test-bronze' and user_id='00000000-0000-0000-0000-00000000000c'::uuid$$, 'rows=1');
set role authenticated;

-- XP adjustment flow
select t.keep('carol_xp', $$select coalesce(xp,0) from public.profiles where id='00000000-0000-0000-0000-00000000000c'::uuid$$);
select t.check('gamif: xp adjust +50', $$select public.admin_xp_adjust('00000000-0000-0000-0000-00000000000c'::uuid, 50, 'Compensation for lost quiz XP', 'adj00001')$$, 'ok');
select t.check('gamif: profiles.xp increased by 50', $$select 1 from public.profiles where id='00000000-0000-0000-0000-00000000000c'::uuid and coalesce(xp,0)=t.get('carol_xp')::int + 50$$, 'rows=1');
reset role; -- ledger rows of other users are RLS-hidden from admins (by design)
select t.check('gamif: ledger row recorded', $$select 1 from public.xp_ledger where user_id='00000000-0000-0000-0000-00000000000c'::uuid and event_key='admin:adj00001' and amount=50 and reason like '[admin]%'$$, 'rows=1');
set role authenticated;
select t.check('gamif: replay refused (idempotency)', $$select public.admin_xp_adjust('00000000-0000-0000-0000-00000000000c'::uuid, 50, 'Compensation for lost quiz XP', 'adj00001')$$, 'error');
select t.check('gamif: xp unchanged after replay', $$select 1 from public.profiles where id='00000000-0000-0000-0000-00000000000c'::uuid and coalesce(xp,0)=t.get('carol_xp')::int + 50$$, 'rows=1');
select t.check('gamif: negative correction works', $$select public.admin_xp_adjust('00000000-0000-0000-0000-00000000000c'::uuid, -20, 'Reverse duplicate award', 'adj00002')$$, 'ok');
select t.check('gamif: profiles.xp decreased by 20', $$select 1 from public.profiles where id='00000000-0000-0000-0000-00000000000c'::uuid and coalesce(xp,0)=t.get('carol_xp')::int + 30$$, 'rows=1');
select t.check('gamif: short reason refused', $$select public.admin_xp_adjust('00000000-0000-0000-0000-00000000000c'::uuid, 10, 'ok', 'adj00003')$$, 'error');
select t.check('gamif: zero amount refused', $$select public.admin_xp_adjust('00000000-0000-0000-0000-00000000000c'::uuid, 0, 'no change at all', 'adj00004')$$, 'error');
select t.check('gamif: sample profile refused', $$select public.admin_xp_adjust((select id from public.profiles where is_sample limit 1), 10, 'sample target test', 'adj00005')$$, 'error');
select t.check('gamif: history lists adjustments', $$select 1 from public.admin_xp_history('adj00001') where event_key='admin:adj00001' and needs_review$$, 'rows=1');
select t.check('gamif: history filter needs_review only', $$select count(*) from public.admin_xp_history('',true) having count(*)>=2$$, 'rows=1');

-- audit
reset role;
select t.check('gamif: badge+xp actions audited', $$select count(*) from public.admin_audit_logs where action like 'gamification.%' having count(*)>=4$$, 'rows=1');
set role authenticated;

-- ============================================================================
-- PHASE: analytics
-- ============================================================================
-- bob (admin: analytics.read)
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('analytics: admin gets summary', $$select public.admin_analytics_summary(30)$$, 'ok');
select t.check('analytics: users total present', $$select 1 from (select (public.admin_analytics_summary(30)->'users'->>'total')::int as n) x where n >= 4$$, 'rows=1');
select t.check('analytics: series has 30 day buckets', $$select jsonb_array_length(public.admin_analytics_summary(30)->'series'->'xp')$$, 'rows=1');
select t.keep('ser_len', $$select jsonb_array_length(public.admin_analytics_summary(30)->'series'->'xp')$$);
select t.check('analytics: 30 buckets', $$select 1 where t.get('ser_len')::int between 30 and 31$$, 'rows=1');
select t.check('analytics: 7-day period works', $$select jsonb_array_length(public.admin_analytics_summary(7)->'series'->'xp')$$, 'rows=1');
select t.check('analytics: bad period refused', $$select public.admin_analytics_summary(13)$$, 'error');

-- erin (student): denied. frank (analyst): CAN read (analytics.read is the
-- analyst role's documented purpose, seeded in admin_foundation) but cannot write.
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('analytics: student denied', $$select public.admin_analytics_summary(30)$$, 'error');
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('analytics: analyst (read-only role) reads', $$select public.admin_analytics_summary(7)$$, 'ok');
select t.check('analytics: analyst still cannot adjust xp', $$select public.admin_xp_adjust('00000000-0000-0000-0000-00000000000e'::uuid, 50, 'test reason again', 'abc124')$$, 'error');

-- ============================================================================
-- PHASE: security center
-- ============================================================================
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('security: student denied overview', $$select public.admin_security_overview()$$, 'error');
select t.check('security: student cannot revoke', $$select public.admin_security_revoke_access('00000000-0000-0000-0000-00000000000c'::uuid,'hostile takeover')$$, 'error');

-- bob (admin, security.read) reads the overview but cannot revoke
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('security: admin reads overview', $$select public.admin_security_overview()$$, 'ok');
select t.keep('ov_admins', $$select jsonb_array_length(public.admin_security_overview()->'admins')$$);
select t.check('security: overview lists active admins', $$select 1 where t.get('ov_admins')::int >= 3$$, 'rows=1');
select t.check('security: admin cannot revoke (not founder)', $$select public.admin_security_revoke_access('00000000-0000-0000-0000-00000000000c'::uuid,'not allowed')$$, 'error');

-- bootstrap a REAL founder like the owner would (manual SQL step), then revoke
reset role;
select t.keep('alice_code', $$select user_code from public.profiles where id='00000000-0000-0000-0000-00000000000a'::uuid$$);
select public.admin_grant_founder(t.get('alice_code'));
set role authenticated;

select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('security: founder reads overview', $$select public.admin_security_overview()$$, 'ok');
select t.check('security: founder cannot revoke self', $$select public.admin_security_revoke_access('00000000-0000-0000-0000-00000000000a'::uuid,'self test')$$, 'error');
select t.check('security: founder cannot revoke a founder', $$select public.admin_security_revoke_access('00000000-0000-0000-0000-00000000000a'::uuid,'founder test')$$, 'error');
select t.check('security: short reason refused', $$select public.admin_security_revoke_access('00000000-0000-0000-0000-00000000000c'::uuid,'x')$$, 'error');
select t.check('security: founder revokes carol', $$select public.admin_security_revoke_access('00000000-0000-0000-0000-00000000000c'::uuid,'Emergency: compromised account')$$, 'ok');
reset role;
select t.check('security: carol roles now revoked', $$select count(*) from public.user_admin_roles where user_id='00000000-0000-0000-0000-00000000000c'::uuid and revoked_at is null having count(*)=0$$, 'rows=1');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.check('security: revoked moderator loses access', $$select (public.admin_my_access()->>'is_admin')$$, 'rows=1');
reset role;
select t.check('security: revoke audited', $$select 1 from (select count(*) as n from public.admin_audit_logs where action='admin.revoke_access') x where n>=1$$, 'rows=1');
set role authenticated;

-- ============================================================================
-- PHASE: administrative settings
-- ============================================================================
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('settings: student cannot list', $$select * from public.admin_settings_list()$$, 'error');
select t.check('settings: student cannot update', $$select public.admin_settings_update('moderation.xp_review_threshold','10','student tampering')$$, 'error');

-- analyst can read (plain admin read) but not write
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('settings: analyst reads list', $$select * from public.admin_settings_list()$$, 'rows=3');
select t.check('settings: analyst cannot update', $$select public.admin_settings_update('moderation.xp_review_threshold','10','not allowed')$$, 'error');

-- bob (admin: settings.manage)
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('settings: admin lists 3 settings', $$select count(*) from public.admin_settings_list() having count(*)=3$$, 'rows=1');
select t.check('settings: update threshold to 10', $$select public.admin_settings_update('moderation.xp_review_threshold','10','Tighten XP review for the semester')$$, 'ok');
select t.check('settings: value persisted', $$select 1 from public.admin_settings_list() where key='moderation.xp_review_threshold' and value='10'::jsonb$$, 'rows=1');
select t.check('settings: out of range refused', $$select public.admin_settings_update('moderation.xp_review_threshold','999999','way too high')$$, 'error');
select t.check('settings: wrong type refused', $$select public.admin_settings_update('moderation.xp_review_threshold','"abc"','not a number')$$, 'error');
select t.check('settings: unknown key refused', $$select public.admin_settings_update('security.backdoor','true','nope')$$, 'error');
select t.check('settings: short reason refused', $$select public.admin_settings_update('moderation.report_queue_limit','150','ok')$$, 'error');

-- REAL consumption: with threshold=10, a 20 XP adjustment is now flagged
select t.check('settings: adjust 20 xp (above new threshold)', $$select public.admin_xp_adjust('00000000-0000-0000-0000-00000000000c'::uuid, 20, 'Threshold consumption proof', 'adj00010')$$, 'ok');
reset role;
select t.check('settings: 20 XP ledger row flagged needs_review', $$select 1 from (select (public.admin_setting_int('moderation.xp_review_threshold',300)) as thr) x where thr=10$$, 'rows=1');
set role authenticated;
select t.check('settings: history uses new threshold', $$select 1 from public.admin_xp_history('adj00010', true) where amount=20 and needs_review$$, 'rows=1');

-- audit with before/after
reset role;
select t.check('settings: update audited with before/after', $$select 1 from public.admin_audit_logs where action='settings.update' and target_id='moderation.xp_review_threshold' and metadata->'after' = '10'::jsonb$$, 'rows=1');
set role authenticated;

-- ============================================================================
-- PHASE: team management (founder-only)
-- ============================================================================
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.check('team: admin cannot list team', $$select * from public.admin_team_list()$$, 'error');
select t.check('team: admin cannot grant', $$select public.admin_team_grant('CV-ANYTHING','moderator','promoting carol again')$$, 'error');
select t.check('team: admin cannot revoke', $$select public.admin_team_revoke(gen_random_uuid(),'not allowed')$$, 'error');

-- alice is founder (bootstrapped in the security phase tests)
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('team: founder lists team', $$select count(*) from public.admin_team_list() having count(*)>=3$$, 'rows=1');
select t.keep('carol_code', $$select user_code from public.profiles where id='00000000-0000-0000-0000-00000000000c'::uuid$$);
select t.check('team: founder grants carol moderator again', $$select public.admin_team_grant(t.get('carol_code'),'moderator','Reinstated after review')$$, 'ok');
select t.check('team: duplicate grant refused', $$select public.admin_team_grant(t.get('carol_code'),'moderator','dup test')$$, 'error');
select t.check('team: founder role refused', $$select public.admin_team_grant(t.get('carol_code'),'founder','founder test')$$, 'error');
select t.check('team: unknown role refused', $$select public.admin_team_grant(t.get('carol_code'),'emperor','nope')$$, 'error');
select t.check('team: unknown code refused', $$select public.admin_team_grant('CV-ZZZZZZ','moderator','nobody')$$, 'error');
select t.check('team: short reason refused', $$select public.admin_team_grant(t.get('carol_code'),'support','ok')$$, 'error');
reset role; -- the grants table has no client SELECT grant (RPC-only, by design)
select t.keep('carol_grant', $$select id from public.user_admin_roles where user_id='00000000-0000-0000-0000-00000000000c'::uuid and role_key='moderator' and revoked_at is null limit 1$$);
set role authenticated;
select t.check('team: founder revokes grant', $$select public.admin_team_revoke(t.get('carol_grant')::uuid,'Trial period ended')$$, 'ok');
select t.check('team: double revoke refused', $$select public.admin_team_revoke(t.get('carol_grant')::uuid,'again')$$, 'error');
select t.check('team: founder cannot be demoted via grant row', $$select 1 from public.admin_team_list() where role_key='founder' and user_id='00000000-0000-0000-0000-00000000000a'::uuid and revoked_at is null$$, 'rows=1');
reset role;
select t.check('team: grant+revoke audited', $$select count(*) from public.admin_audit_logs where action in ('admin.grant_role','admin.revoke_role') having count(*)>=2$$, 'rows=1');
set role authenticated;

\echo ======== ADMIN RESULTS ========
select case when ok then 'PASS' else 'FAIL' end || ' | ' || label || ' | ' || detail from t.results where label like 'rules:%' or label like 'content:%' or label like 'gamif:%' or label like 'analytics:%' or label like 'security:%' or label like 'settings:%' or label like 'team:%' order by ok, label;
select 'ADMIN TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok) from t.results where label like 'rules:%' or label like 'content:%' or label like 'gamif:%' or label like 'analytics:%' or label like 'security:%' or label like 'settings:%' or label like 'team:%';
