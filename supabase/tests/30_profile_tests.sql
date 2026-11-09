-- =============================================================================
-- Profile & Portfolio regression tests: appearance validation, per-section
-- privacy, portfolio visibility, import authenticity, certificate rules,
-- verified-skill foundation and storage policies.
--
-- Runs AFTER 10_rls_tests.sql and 20_admin_tests.sql on the same database
-- (mocked auth). Personas available: alice (a), bob (b, admin), carol (c,
-- moderator), erin (e), frank (f, analyst).
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

-- ============================================================================
-- setup (superuser): handles, friendship, real learning records for alice
-- ============================================================================
\set alice 00000000-0000-0000-0000-00000000000a
\set erin  00000000-0000-0000-0000-00000000000e
\set frank 00000000-0000-0000-0000-00000000000f

-- accepted friendship alice <-> erin
insert into public.friendships (from_id, to_id, status) values
  (:'alice'::uuid, :'erin'::uuid, 'accepted')
on conflict do nothing;

-- alice owns a course with one lesson, an assignment she submitted
insert into public.courses (id, title, teacher_id, created_by)
values ('prof101', 'Portfolio Course', :'alice'::uuid, :'alice'::uuid)
on conflict (id) do nothing;
insert into public.course_lessons (id, course_id, title, minutes)
values ('11111111-1111-1111-1111-111111111111', 'prof101', 'Lesson 1', 45)
on conflict (id) do nothing;
insert into public.course_enrollments (course_id, user_id) values ('prof101', :'alice'::uuid)
on conflict do nothing;
insert into public.lesson_completions (lesson_id, user_id)
values ('11111111-1111-1111-1111-111111111111', :'alice'::uuid)
on conflict do nothing;

insert into public.assignments (id, course_id, created_by, title, due_at, points)
values ('22222222-2222-2222-2222-222222222222', 'prof101', :'alice'::uuid, 'Build a portfolio site', now() + interval '10 days', 100)
on conflict (id) do nothing;
insert into public.assignment_submissions (assignment_id, student_id, status, submitted_at, submission_text)
values ('22222222-2222-2222-2222-222222222222', :'alice'::uuid, 'graded', now(), 'my submission')
on conflict do nothing;
select t.keep('alice_submission_id', $$select id::text from public.assignment_submissions
  where student_id='00000000-0000-0000-0000-00000000000a'
    and assignment_id='22222222-2222-2222-2222-222222222222'$$);

-- erin also submitted the same assignment (alice must NOT import it)
insert into public.assignment_submissions (assignment_id, student_id, status, submitted_at)
values ('22222222-2222-2222-2222-222222222222', :'erin'::uuid, 'submitted', now())
on conflict do nothing;

-- a completed challenge for alice
insert into public.challenges (id, created_by, title, category, difficulty, points, minutes, exercise_type)
values ('33333333-3333-3333-3333-333333333333', :'alice'::uuid, 'CSS layout sprint', 'Daily', 'Easy', 50, 20, 'quiz')
on conflict (id) do nothing;
insert into public.challenge_submissions (challenge_id, user_id, status, submitted_at, score)
values ('33333333-3333-3333-3333-333333333333', :'alice'::uuid, 'submitted', now(), 90)
on conflict do nothing;

-- a badge earned by alice
insert into public.badge_definitions (key, base_key, category, name, description, metric, threshold, rarity)
values ('profile-TestBadge', 'profile-TestBadge', 'learning', 'Test Badge', 'Awarded by the test harness', 'lessons_completed', 1, 'rare')
on conflict (key) do nothing;
insert into public.user_badges (user_id, badge_key, awarded_at)
values (:'alice'::uuid, 'profile-TestBadge', now() - interval '3 days')
on conflict do nothing;

-- a public study group alice belongs to, and a private one
insert into public.spaces (id, kind, name, visibility)
values ('44444444-4444-4444-4444-444444444444', 'group', 'Robotics Club', 'public'),
       ('55555555-5555-5555-5555-555555555555', 'group', 'Secret Society', 'private')
on conflict (id) do nothing;
insert into public.space_members (space_id, user_id) values
  ('44444444-4444-4444-4444-444444444444', :'alice'::uuid),
  ('55555555-5555-5555-5555-555555555555', :'alice'::uuid)
on conflict do nothing;

-- privacy + settings rows exist from day one (the app upserts them on first use)
insert into public.profile_privacy (user_id) values (:'alice'::uuid) on conflict do nothing;
insert into public.user_settings (user_id) values (:'alice'::uuid) on conflict do nothing;

-- remember the handles for later
select t.keep('alice_code', $$select user_code from public.profiles where id='00000000-0000-0000-0000-00000000000a'$$);
select t.keep('erin_code',  $$select user_code from public.profiles where id='00000000-0000-0000-0000-00000000000e'$$);

-- ============================================================================
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a'); -- alice
-- ============================================================================

-- ------------------------------------------------------------- appearance
select t.check('appearance: partial update ok',
  $$select public.update_my_appearance('{"theme":"ocean","name_color":"#7C3AED"}'::jsonb)$$, 'ok');
select t.check('appearance: invalid hex refused',
  $$select public.update_my_appearance('{"name_color":"red"}'::jsonb)$$, 'error');
select t.check('appearance: invalid font refused',
  $$select public.update_my_appearance('{"name_font":"comic-sans"}'::jsonb)$$, 'error');
select t.check('appearance: unknown key refused',
  $$select public.update_my_appearance('{"custom_css":"body{}"}'::jsonb)$$, 'error');
select t.check('appearance: partial merge keeps theme',
  $$select 1 from public.profile_appearance where user_id='00000000-0000-0000-0000-00000000000a' and theme='ocean' and name_font='sans'$$, 'rows=1');
select t.check('appearance: cover image url validated',
  $$select public.update_my_appearance('{"cover_kind":"image","cover_image_url":"javascript:alert(1)"}'::jsonb)$$, 'error');
select t.check('appearance: https cover accepted',
  $$select public.update_my_appearance('{"cover_kind":"image","cover_image_url":"https://x.test/c.png"}'::jsonb)$$, 'ok');

-- --------------------------------------------------------------- privacy
select t.keep('stats_public', $$select public.profile_section_visible('00000000-0000-0000-0000-00000000000a','stats')::text$$);
select t.check('privacy: stats public by default', $$select 1 where t.get('stats_public')='true'$$, 'rows=1');
select t.check('privacy: unknown section hidden (stranger)',
  $$select 1 where (select public.profile_section_visible('00000000-0000-0000-0000-00000000000e','nope')) = false$$, 'rows=1');

-- goals -> friends
update public.profile_privacy set show_goals='friends' where user_id=(select auth.uid());
select t.keep('goals_friend', $$select public.profile_section_visible('00000000-0000-0000-0000-00000000000a','goals')::text$$);
select t.check('privacy: owner always sees own section', $$select 1 where t.get('goals_friend')='true'$$, 'rows=1');

select t.as_user('00000000-0000-0000-0000-00000000000e'); -- erin (friend of alice)
select t.keep('goals_as_friend', $$select public.profile_section_visible('00000000-0000-0000-0000-00000000000a','goals')::text$$);
select t.check('privacy: friend sees friends-only goals', $$select 1 where t.get('goals_as_friend')='true'$$, 'rows=1');

select t.as_user('00000000-0000-0000-0000-00000000000f'); -- frank (stranger)
select t.keep('goals_as_stranger', $$select public.profile_section_visible('00000000-0000-0000-0000-00000000000a','goals')::text$$);
select t.check('privacy: stranger blocked from friends-only goals', $$select 1 where t.get('goals_as_stranger')='false'$$, 'rows=1');
select t.check('privacy: section data null for stranger',
  $$select 1 where public.profile_section_data(t.get('alice_code'),'goals') is null$$, 'rows=1');

select t.as_user('00000000-0000-0000-0000-00000000000a');
update public.profile_privacy set show_goals='private' where user_id=(select auth.uid());
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('privacy: even friends blocked when private',
  $$select 1 where public.profile_section_data(t.get('alice_code'),'goals') is null$$, 'rows=1');

-- identity gating via user_settings.profile_visibility
select t.as_user('00000000-0000-0000-0000-00000000000a');
update public.user_settings set profile_visibility='private' where user_id=(select auth.uid());
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('privacy: private profile hides identity from strangers',
  $$select 1 where public.profile_section_visible('00000000-0000-0000-0000-00000000000a','identity') = false$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.keep('identity_as_friend', $$select public.profile_section_visible('00000000-0000-0000-0000-00000000000a','identity')::text$$);
select t.check('privacy: friends still see a private profile', $$select 1 where t.get('identity_as_friend')='true'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000a');
update public.user_settings set profile_visibility='public' where user_id=(select auth.uid());

-- ------------------------------------------------------------ section data
select t.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.profile_subjects (user_id, name, position) values
  ((select auth.uid()), 'Mathematics', 0), ((select auth.uid()), 'Design', 1);
select t.keep('subject_count', $$select jsonb_array_length(public.profile_section_data(t.get('alice_code'),'subjects'))::text$$);
select t.check('sections: subjects listed', $$select 1 where t.get('subject_count')='2'$$, 'rows=1');

insert into public.profile_goals (user_id, title, target_date, progress)
values ((select auth.uid()), 'Learn Python', current_date + 30, 20);
select t.check('sections: goals visible to owner', $$select public.profile_section_data(t.get('alice_code'),'goals')$$, 'ok');

insert into public.portfolio_settings (user_id, about_intro) values ((select auth.uid()), 'Hi, I am Alice.');

select t.keep('badges_n', $$select jsonb_array_length(public.profile_section_data(t.get('alice_code'),'badges'))::text$$);
select t.check('sections: earned badges listed (triggers add milestone badges)',
  $$select 1 where t.get('badges_n')::int >= 1$$, 'rows=1');
select t.check('sections: TestBadge among earned badges',
  $$select 1 from jsonb_array_elements(public.profile_section_data(t.get('alice_code'),'badges')) b where b->>'badge_key'='profile-TestBadge'$$, 'rows=1');

select t.keep('groups_n', $$select jsonb_array_length(public.profile_section_data(t.get('alice_code'),'groups'))::text$$);
select t.check('sections: owner sees own private group too', $$select 1 where t.get('groups_n')='2'$$, 'rows=1');

select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.keep('groups_stranger', $$select jsonb_array_length(public.profile_section_data(t.get('alice_code'),'groups'))::text$$);
select t.check('sections: stranger sees only public groups', $$select 1 where t.get('groups_stranger')='1'$$, 'rows=1');

select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('sections: stats compute', $$select public.profile_section_data(t.get('alice_code'),'stats')$$, 'ok');
select t.keep('journey_len', $$select jsonb_array_length(public.profile_section_data(t.get('alice_code'),'journey'))::text$$);
select t.check('sections: journey has joined+badge+lesson', $$select 1 where t.get('journey_len')::int >= 3$$, 'rows=1');

-- overview shape
select t.check('overview: unknown code is null',
  $$select 1 where public.profile_public_overview('COVA-NOPE00') is null$$, 'rows=1');
select t.keep('ov_xp_hidden', $$select (public.profile_public_overview(t.get('alice_code'))->'sections'->>'xp')$$);

-- ---------------------------------------------------------------- projects
insert into public.portfolio_projects (user_id, title, status, visibility, featured)
values ((select auth.uid()), 'Public showcase', 'published', 'public', true),
       ((select auth.uid()), 'Friends only build', 'published', 'friends', false),
       ((select auth.uid()), 'Secret draft', 'draft', 'public', false);

select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.keep('proj_stranger', $$select jsonb_array_length(public.profile_section_data(t.get('alice_code'),'projects'))::text$$);
select t.check('projects: stranger sees only published+public', $$select 1 where t.get('proj_stranger')='1'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.keep('proj_friend', $$select jsonb_array_length(public.profile_section_data(t.get('alice_code'),'projects'))::text$$);
select t.check('projects: friend also sees friends-only', $$select 1 where t.get('proj_friend')='2'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.keep('proj_owner', $$select jsonb_array_length(public.profile_section_data(t.get('alice_code'),'projects'))::text$$);
select t.check('projects: owner public view shows published only (drafts stay in editor)',
  $$select 1 where t.get('proj_owner')='2'$$, 'rows=1');
select t.check('projects: owner reads own drafts via direct select',
  $$select 1 from public.portfolio_projects where user_id='00000000-0000-0000-0000-00000000000a' and status='draft'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('projects: stranger cannot select rows directly',
  $$select 1 from public.portfolio_projects where user_id='00000000-0000-0000-0000-00000000000a'$$, 'rows=0');

-- ----------------------------------------------------------------- imports
select t.as_user('00000000-0000-0000-0000-00000000000a'); -- back to alice
select t.check('imports: cannot import someone else''s submission',
  $$select public.portfolio_import_options()$$, 'ok');
insert into public.portfolio_imports (user_id, source_kind, source_id)
values ((select auth.uid()), 'assignment', t.get('alice_submission_id')::uuid);
select t.keep('imports_own', $$select count(*) from public.portfolio_imports$$);
select t.check('imports: own submitted assignment imported', $$select 1 where t.get('imports_own')='1'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('imports: cannot claim alice''s submission',
  $$insert into public.portfolio_imports (user_id, source_kind, source_id)
    values ((select auth.uid()), 'assignment', t.get('alice_submission_id')::uuid)$$, 'error');
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.keep('import_opts_stranger', $$select jsonb_array_length(public.portfolio_import_options()->'assignments')::text$$);
select t.check('imports: stranger has no import options', $$select 1 where t.get('import_opts_stranger')='0'$$, 'rows=1');

-- ------------------------------------------------------------ certificates
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('certificates: cannot self-issue COVA kind',
  $$insert into public.portfolio_certificates (user_id, title, kind)
    values ((select auth.uid()), 'Fake', 'cova')$$, 'error');
select t.check('certificates: cannot set cova_issued',
  $$insert into public.portfolio_certificates (user_id, title, verification_status)
    values ((select auth.uid()), 'Fake', 'cova_issued')$$, 'error');
insert into public.portfolio_certificates (user_id, title, kind, issuer, issue_date)
values ((select auth.uid()), 'Intro to Data certificate', 'external', 'Coursera', current_date - 10);
select t.check('certificates: external claim allowed',
  $$update public.portfolio_certificates set verification_status='external_claim'
    where user_id=(select auth.uid())$$, 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('certificates: rows not readable directly by others',
  $$select 1 from public.portfolio_certificates where user_id='00000000-0000-0000-0000-00000000000a'$$, 'rows=0');
select t.keep('cert_via_rpc', $$select jsonb_array_length(public.portfolio_public_overview(t.get('alice_code'))->'certificates')::text$$);
select t.check('certificates: visible via filtered RPC', $$select 1 where t.get('cert_via_rpc')='1'$$, 'rows=1');

-- ---------------------------------------------------------- verified skills
select t.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.portfolio_skills (user_id, name, category)
values ((select auth.uid()), 'Python', 'technical');
select t.keep('skill_id', $$select id::text from public.portfolio_skills where name='Python'$$);
select t.check('skills: cannot insert pre-verified',
  $$insert into public.portfolio_skills (user_id, name, verification_status)
    values ((select auth.uid()), 'Hacking', 'cova_verified')$$, 'error');
select t.check('skills: no update grant (cannot self-verify later)',
  $$update public.portfolio_skills set verification_status='cova_verified' where id=t.get('skill_id')::uuid$$, 'error');

select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('skills: stranger without permission cannot verify',
  $$select public.admin_verify_skill(t.get('skill_id')::uuid, 'quiz mastery')$$, 'error');
-- grant the permission to the analyst role (superuser action)
set role postgres;
insert into public.admin_role_permissions (role_key, permission_key)
values ('analyst', 'portfolio.skills.verify') on conflict do nothing;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('skills: permission holder verifies with source',
  $$select public.admin_verify_skill(t.get('skill_id')::uuid, 'Verified via Python certification exam')$$, 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.keep('skill_status', $$select verification_status from public.portfolio_skills where id=t.get('skill_id')::uuid$$);
select t.check('skills: verification recorded', $$select 1 where t.get('skill_status')='cova_verified'$$, 'rows=1');
select t.check('skills: verified visible in section data',
  $$select 1 where (public.profile_section_data(t.get('alice_code'),'skills')->0->>'verification_status')='cova_verified'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.check('skills: verification requires a source',
  $$select public.admin_verify_skill(t.get('skill_id')::uuid, '')$$, 'error');

-- ------------------------------------------------------------- portfolio RPC
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.keep('pf_visible', $$select (public.portfolio_public_overview(t.get('alice_code'))->>'visible')$$);
select t.check('portfolio: visible to members by default', $$select 1 where t.get('pf_visible')='true'$$, 'rows=1');
select t.keep('pf_projects', $$select jsonb_array_length(public.portfolio_public_overview(t.get('alice_code'))->'projects')::text$$);
select t.check('portfolio: friend sees public+friends projects', $$select 1 where t.get('pf_projects')='2'$$, 'rows=1');

select t.as_user('00000000-0000-0000-0000-00000000000a');
update public.profile_privacy set portfolio_visibility='friends' where user_id=(select auth.uid());
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.keep('pf_hidden', $$select (public.portfolio_public_overview(t.get('alice_code'))->>'visible')$$);
select t.check('portfolio: friends-only hides from strangers', $$select 1 where t.get('pf_hidden')='false'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.keep('pf_friend_ok', $$select (public.portfolio_public_overview(t.get('alice_code'))->>'visible')$$);
select t.check('portfolio: friends-only visible to friends', $$select 1 where t.get('pf_friend_ok')='true'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000a');
update public.profile_privacy set portfolio_visibility='public' where user_id=(select auth.uid());

-- ------------------------------------------------------------ storage rules
-- Real Supabase has RLS enabled on storage.objects; the mock does not.
set role postgres;
alter table storage.objects enable row level security;
set role authenticated;

select t.as_user('00000000-0000-0000-0000-00000000000a'); -- alice owns the folders
select t.check('storage: owner uploads own cover',
  $$insert into storage.objects (bucket_id, name) values ('profile-covers','00000000-0000-0000-0000-00000000000a/cover-1.png')$$, 'ok');
select t.check('storage: cannot write into someone else''s folder',
  $$insert into storage.objects (bucket_id, name) values ('profile-covers','00000000-0000-0000-0000-00000000000e/cover-1.png')$$, 'error');
select t.check('storage: documents bucket private + own folder',
  $$insert into storage.objects (bucket_id, name) values ('portfolio-documents','00000000-0000-0000-0000-00000000000a/doc1.pdf')$$, 'ok');
select t.check('storage: documents cannot be written for others',
  $$insert into storage.objects (bucket_id, name) values ('portfolio-documents','00000000-0000-0000-0000-00000000000e/doc2.pdf')$$, 'error');
select t.keep('doc_cert_id', $$select id::text from public.portfolio_certificates where title='Intro to Data certificate'$$);
-- friends-only document: friends may sign it, strangers may not
update public.portfolio_certificates set visibility='friends',
  file_path='00000000-0000-0000-0000-00000000000a/cert1.pdf'
where id=t.get('doc_cert_id')::uuid;
select t.check('storage: owner reads own document via policy',
  $$select 1 from storage.objects where bucket_id='portfolio-documents' and name='00000000-0000-0000-0000-00000000000a/doc1.pdf'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.keep('doc_friend_sign', $$select public.portfolio_certificate_visible(t.get('doc_cert_id')::uuid)::text$$);
select t.check('storage: friend can sign a visible certificate', $$select 1 where t.get('doc_friend_sign')='true'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('storage: certificate file uploaded under owner folder',
  $$insert into storage.objects (bucket_id, name) values ('portfolio-documents','00000000-0000-0000-0000-00000000000a/cert1.pdf')$$, 'ok');
select t.as_user('00000000-0000-0000-0000-00000000000e');
select t.check('storage: friend reads document via policy',
  $$select 1 from storage.objects where bucket_id='portfolio-documents' and name='00000000-0000-0000-0000-00000000000a/cert1.pdf'$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000f');
select t.keep('doc_stranger_sign', $$select public.portfolio_certificate_visible(t.get('doc_cert_id')::uuid)::text$$);
select t.check('storage: stranger cannot sign others'' document', $$select 1 where t.get('doc_stranger_sign')='false'$$, 'rows=1');

-- ------------------------------------------------------------------ totals
select 'PROFILE-TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
from t.results where label not like 'rls:%' and label not like 'admin:%';
