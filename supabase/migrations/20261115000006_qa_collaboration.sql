-- =============================================================================
-- COVA — Q&A and collaboration (additive, non-destructive).
--
-- Phase 4 of the community/rewards overhaul:
--   1. qa_questions / qa_answers / qa_votes — a community Q&A module. The
--      question author alone marks one answer as best (RPC, atomic), which
--      also resolves the question. Votes are ±1 per member per target.
--   2. collab_requests — study-partner and mentor requests between members,
--      accepted or declined by the recipient. Replaces nothing: friendships,
--      DMs and groups are untouched.
--
-- All social inserts are gated by me_sanctions() like the rest of COVA.
-- =============================================================================

------------------------------------------------------------------ qa_questions
create table if not exists public.qa_questions (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 5 and 160),
  body       text not null default '' check (char_length(body) <= 4000),
  subject    text not null default 'general',
  status     text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);
create index if not exists qa_questions_created_idx on public.qa_questions (created_at desc);
alter table public.qa_questions enable row level security;
grant select, insert, update, delete on public.qa_questions to authenticated;

drop policy if exists "Questions are public" on public.qa_questions;
create policy "Questions are public"
  on public.qa_questions for select to authenticated
  using (true);

drop policy if exists "Users ask as themselves" on public.qa_questions;
create policy "Users ask as themselves"
  on public.qa_questions for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not exists (select 1 from public.me_sanctions())
  );

drop policy if exists "Users edit own questions" on public.qa_questions;
create policy "Users edit own questions"
  on public.qa_questions for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists "Users delete own questions" on public.qa_questions;
create policy "Users delete own questions"
  on public.qa_questions for delete to authenticated
  using (author_id = (select auth.uid()));

-------------------------------------------------------------------- qa_answers
create table if not exists public.qa_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.qa_questions (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  is_best     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint qa_answers_one_best_per_question unique (question_id, is_best) deferrable initially deferred
);
create index if not exists qa_answers_question_idx on public.qa_answers (question_id, created_at);
alter table public.qa_answers enable row level security;
grant select, insert, update, delete on public.qa_answers to authenticated;

drop policy if exists "Answers are public" on public.qa_answers;
create policy "Answers are public"
  on public.qa_answers for select to authenticated
  using (true);

drop policy if exists "Users answer as themselves" on public.qa_answers;
create policy "Users answer as themselves"
  on public.qa_answers for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not exists (select 1 from public.me_sanctions())
  );

drop policy if exists "Users edit own answers" on public.qa_answers;
create policy "Users edit own answers"
  on public.qa_answers for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists "Users delete own answers" on public.qa_answers;
create policy "Users delete own answers"
  on public.qa_answers for delete to authenticated
  using (author_id = (select auth.uid()));

-- The question author picks the single best answer; the question is resolved.
create or replace function public.qa_select_best_answer(p_answer uuid)
returns void
language plpgsql
security definer
set search_path = public as $$
declare
  v_question uuid;
  v_author uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select question_id, (select author_id from public.qa_questions q where q.id = a.question_id)
    into v_question, v_author
    from public.qa_answers a where a.id = p_answer;
  if not found then raise exception 'Answer not found'; end if;
  if v_author <> (select auth.uid()) then raise exception 'Only the question author can pick the best answer'; end if;
  update public.qa_answers set is_best = false where question_id = v_question and is_best;
  update public.qa_answers set is_best = true where id = p_answer;
  update public.qa_questions set status = 'resolved' where id = v_question;
end;
$$;

revoke all on function public.qa_select_best_answer(uuid) from public, anon;
grant execute on function public.qa_select_best_answer(uuid) to authenticated;

--------------------------------------------------------------------- qa_votes
create table if not exists public.qa_votes (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('question', 'answer')),
  target_id   uuid not null,
  value       smallint not null check (value in (-1, 1)),
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
alter table public.qa_votes enable row level security;
grant select, insert, delete on public.qa_votes to authenticated;

drop policy if exists "Votes are public" on public.qa_votes;
create policy "Votes are public"
  on public.qa_votes for select to authenticated
  using (true);

drop policy if exists "Users vote as themselves" on public.qa_votes;
create policy "Users vote as themselves"
  on public.qa_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not exists (select 1 from public.me_sanctions())
  );

drop policy if exists "Users remove own votes" on public.qa_votes;
create policy "Users remove own votes"
  on public.qa_votes for delete to authenticated
  using (user_id = (select auth.uid()));

-- Notify the question author when someone answers (except self-answers).
create or replace function public.notify_on_qa_answer()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_author uuid;
begin
  if new.author_id is null then return new; end if;
  select author_id into v_author from public.qa_questions where id = new.question_id;
  if v_author is null or v_author = new.author_id then return new; end if;
  perform public.notify(
    v_author,
    'qa_answer',
    new.author_id,
    '/qa/' || new.question_id::text,
    left(new.body, 120),
    ''
  );
  return new;
end;
$$;

drop trigger if exists qa_answer_notify on public.qa_answers;
create trigger qa_answer_notify
  after insert on public.qa_answers
  for each row execute function public.notify_on_qa_answer();

-------------------------------------------------------------- collab_requests
create table if not exists public.collab_requests (
  id         uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_id  uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('study_partner', 'mentor')),
  message    text not null default '' check (char_length(message) <= 1000),
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  constraint collab_not_self check (requester_id <> target_id),
  unique (requester_id, target_id, kind)
);
create index if not exists collab_requests_target_idx on public.collab_requests (target_id, status);
alter table public.collab_requests enable row level security;
grant select, insert, update, delete on public.collab_requests to authenticated;

drop policy if exists "Parties see their collab requests" on public.collab_requests;
create policy "Parties see their collab requests"
  on public.collab_requests for select to authenticated
  using (
    requester_id = (select auth.uid())
    or target_id = (select auth.uid())
  );

drop policy if exists "Users request as themselves" on public.collab_requests;
create policy "Users request as themselves"
  on public.collab_requests for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and not exists (select 1 from public.me_sanctions())
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = target_id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = target_id)
    )
  );

drop policy if exists "Recipient decides" on public.collab_requests;
create policy "Recipient decides"
  on public.collab_requests for update to authenticated
  using (target_id = (select auth.uid()))
  with check (target_id = (select auth.uid()));

drop policy if exists "Requester cancels pending" on public.collab_requests;
create policy "Requester cancels pending"
  on public.collab_requests for delete to authenticated
  using (requester_id = (select auth.uid()) and status = 'pending');

create or replace function public.notify_on_collab_write()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_code text;
begin
  if new.target_id is null or new.requester_id is null then return new; end if;
  if new.status = 'accepted' then
    select user_code into v_code from public.profiles where id = new.requester_id;
    perform public.notify(
      new.target_id,
      'collab_accepted',
      new.requester_id,
      coalesce('/u/' || v_code, '/friends'),
      case new.kind when 'mentor' then 'Mentoring' else 'Study partners' end,
      ''
    );
  end if;
  return new;
end;
$$;

drop trigger if exists collab_notify on public.collab_requests;
create trigger collab_notify
  after insert or update of status on public.collab_requests
  for each row
  when (new.status = 'accepted')
  execute function public.notify_on_collab_write();
