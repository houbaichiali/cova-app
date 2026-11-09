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

\echo ======== ADMIN RESULTS ========
select case when ok then 'PASS' else 'FAIL' end || ' | ' || label || ' | ' || detail from t.results where label like 'rules:%' order by ok, label;
select 'ADMIN TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok) from t.results where label like 'rules:%';
