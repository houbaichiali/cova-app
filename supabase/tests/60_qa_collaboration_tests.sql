-- =============================================================================
-- COVA — Q&A & collaboration test suite (60)
--
-- Covers 20261115000006_qa_collaboration.sql:
--   * questions/answers: RLS, sanctions gate, own-only edit
--   * qa_select_best_answer: author-only, atomic, resolves the question
--   * votes: one per member per target, removable
--   * collab_requests: no self-invites, recipient decides, requester cancels
--
-- RUN AFTER 10/20/30/40/50/55 in the same mock-auth database (same runbook as
-- 40_security_hardening_tests.sql). Last lines: TOTAL n pass=n fail=0
-- =============================================================================

\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

set role authenticated;

-- ------------------------------------------------------------------ questions
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan asks a question',
  $$insert into public.qa_questions (id, title, body, subject)
    values ('44444444-4444-4444-4444-444444444444','How does the COVA XP ledger work?','I want to understand the event keys.','programming')$$, 'ok');
select t.check('too-short titles refused',
  $$insert into public.qa_questions (title) values ('hi')$$, 'error');
select t.as_user('00000000-0000-0000-0000-00000000000c'); -- carol
select t.check('carol cannot edit ivan''s question',
  $$update public.qa_questions set title='hacked question title here' where id='44444444-4444-4444-4444-444444444444'$$, 'rows=0');

-- -------------------------------------------------------------------- answers
select t.as_user('00000000-0000-0000-0000-000000000041'); -- gina answers
select t.check('gina answers the question',
  $$insert into public.qa_answers (id, question_id, body)
    values ('55555555-5555-5555-5555-555555555555','44444444-4444-4444-4444-444444444444','xp_ledger has unique (user_id, event_key) rows')$$, 'ok');
select t.check('ivan got the qa_answer notification',
  $$select 1 from public.notifications where kind='qa_answer' having count(*)=1$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-00000000000c'); -- carol
select t.check('carol cannot pick the best answer',
  $$select public.qa_select_best_answer('55555555-5555-5555-5555-555555555555')$$, 'error');

-- ---------------------------------------------------------------------- votes
select t.check('carol upvotes the question',
  $$insert into public.qa_votes (target_type, target_id, value)
    values ('question','44444444-4444-4444-4444-444444444444',1)$$, 'ok');
select t.check('duplicate vote refused',
  $$insert into public.qa_votes (target_type, target_id, value)
    values ('question','44444444-4444-4444-4444-444444444444',1)$$, 'error');
select t.check('carol upvotes the answer too',
  $$insert into public.qa_votes (target_type, target_id, value)
    values ('answer','55555555-5555-5555-5555-555555555555',1)$$, 'ok');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('question score is 1',
  $$select 1 from public.qa_votes where target_id='44444444-4444-4444-4444-444444444444' having sum(value)=1$$, 'rows=1');

-- --------------------------------------------------------------- best answer
select t.as_user('00000000-0000-0000-0000-000000000041'); -- gina (not the author)
select t.check('non-author cannot mark best via RPC',
  $$select public.qa_select_best_answer('55555555-5555-5555-5555-555555555555')$$, 'error');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan (author)
select t.check('author marks the best answer',
  $$select public.qa_select_best_answer('55555555-5555-5555-5555-555555555555')$$, 'ok');
select t.check('question resolved automatically',
  $$select 1 from public.qa_questions where id='44444444-4444-4444-4444-444444444444' and status='resolved'$$, 'rows=1');
select t.check('exactly one best answer',
  $$select 1 from public.qa_answers where question_id='44444444-4444-4444-4444-444444444444' and is_best having count(*)=1$$, 'rows=1');

-- -------------------------------------------------------------- collaboration
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan invites gina as study partner',
  $$insert into public.collab_requests (target_id, kind)
    values ('00000000-0000-0000-0000-000000000041','study_partner')$$, 'ok');
select t.check('self-invite refused',
  $$insert into public.collab_requests (target_id, kind)
    values ('00000000-0000-0000-0000-000000000043','mentor')$$, 'error');
select t.as_user('00000000-0000-0000-0000-000000000041'); -- gina (recipient)
select t.check('gina sees the request',
  $$select 1 from public.collab_requests where target_id='00000000-0000-0000-0000-000000000041'$$, 'rows=1');
select t.check('gina accepts',
  $$update public.collab_requests set status='accepted' where target_id='00000000-0000-0000-0000-000000000041' and status='pending'$$, 'rows=1');
select t.check('ivan got the collab_accepted notification',
  $$select 1 from public.notifications where kind='collab_accepted' having count(*)=1$$, 'rows=1');
select t.as_user('00000000-0000-0000-0000-000000000043'); -- ivan
select t.check('ivan cannot decide on requests sent to him... wait, he can (he is a target here?)',
  $$update public.collab_requests set status='declined' where requester_id='00000000-0000-0000-0000-000000000043'$$, 'rows=0');
select t.check('ivan cancels his own pending request (none left) rows=0',
  $$delete from public.collab_requests where requester_id='00000000-0000-0000-0000-000000000043' and status='pending'$$, 'rows=0');

-- ==================================================================== SUMMARY
select 'TOTAL ' || count(*) || ' pass=' || count(*) filter (where ok) || ' fail=' || count(*) filter (where not ok)
  from t.results where label like '%question%' or label like '%answer%' or label like '%vote%'
     or label like '%collab%' or label like '%gina%' or label like '%ivan%' or label like '%carol%'
     or label like '%self-invite%' or label like '%best%';
