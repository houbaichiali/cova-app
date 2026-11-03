-- COVA QUIZ hardening: challenge/solo attempts, XP awards, leaderboards.
-- Fixes the overly broad SELECT policy on quizzes (a private quiz with a PIN
-- must not leak its question bank with the correct answers to everyone),
-- enforces one join code per quiz, adds challenge deadlines, and scores
-- challenge/solo attempts entirely inside SQL so correct answers never leave
-- the database.

-- ------------------------------------------------------------------ RLS fix
drop policy if exists "Authenticated read public quizzes" on public.quizzes;
create policy "Authenticated read public quizzes"
  on public.quizzes for select to authenticated
  using (visibility = 'public' or created_by = (select auth.uid()));

-- One join code per quiz (the creation wizard retries with a fresh PIN when
-- two creators pick the same one).
create unique index if not exists quizzes_pin_key on public.quizzes (pin) where pin is not null;

-- Challenge deadline + live/challenge/solo tag on persisted games.
alter table public.quizzes add column if not exists deadline timestamptz;
alter table public.quiz_games add column if not exists mode text not null default 'live'
  check (mode in ('live', 'challenge', 'solo'));

-- ---------------------------------------------------------------- attempts
-- One row per challenge/solo play-through. Players never read this table
-- directly: every access goes through the security definer RPCs below, which
-- check ownership and keep the correct answers inside the database.
create table if not exists public.quiz_attempts (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid not null references public.quizzes (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  mode                text not null check (mode in ('challenge', 'solo')),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  score               integer not null default 0,
  correct             integer not null default 0,
  answered            integer not null default 0,
  answered_ms         integer not null default 0,
  streak              integer not null default 0,
  best_streak         integer not null default 0,
  question_index      integer,
  question_started_at timestamptz
);
create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, started_at desc);
alter table public.quiz_attempts enable row level security;

create table if not exists public.quiz_attempt_answers (
  attempt_id     uuid not null references public.quiz_attempts (id) on delete cascade,
  question_index integer not null,
  choice         jsonb,
  correct        boolean not null,
  gained         integer not null default 0,
  elapsed_ms     integer not null default 0,
  answered_at    timestamptz not null default now(),
  primary key (attempt_id, question_index)
);
alter table public.quiz_attempt_answers enable row level security;

-- ------------------------------------------------------------- pin lookup
-- Safe join-by-PIN: returns only what a player needs to join. The PIN itself
-- is the access key for private quizzes; questions are never returned.
create or replace function public.quiz_pin_lookup(p_pin text)
returns table (
  id                uuid,
  title             text,
  mode              text,
  visibility        text,
  question_count    integer,
  time_per_question integer,
  scoring           text,
  nicknames         boolean,
  music             boolean,
  deadline          timestamptz
)
language sql stable security definer set search_path = public as $$
  select z.id, z.title, z.mode, z.visibility, z.question_count,
         z.time_per_question, z.scoring, z.nicknames, z.music, z.deadline
  from public.quizzes z
  where z.pin = btrim(p_pin)
  limit 1;
$$;
grant execute on function public.quiz_pin_lookup(text) to authenticated;

-- ---------------------------------------------------- challenge/solo RPCs
-- Starts (or resumes) an attempt. The deadline gates challenge mode only.
create or replace function public.quiz_attempt_start(p_pin text, p_mode text)
returns table (
  attempt_id        uuid,
  title             text,
  question_count    integer,
  time_per_question integer,
  scoring           text,
  deadline          timestamptz,
  mode              text,
  answered          integer,
  score             integer
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_quiz   public.quizzes;
  v_user   uuid := (select auth.uid());
  v_exists uuid;
begin
  if v_user is null then raise exception 'Sign in first'; end if;
  if p_mode not in ('challenge', 'solo') then raise exception 'Unknown mode'; end if;

  select * into v_quiz from public.quizzes where pin = btrim(p_pin) limit 1;
  if v_quiz.id is null then raise exception 'PIN not found'; end if;
  if p_mode = 'challenge' and v_quiz.deadline is not null and v_quiz.deadline < now() then
    raise exception 'Deadline passed';
  end if;

  -- Resume an unfinished attempt for the same quiz and mode.
  select a.id into v_exists
  from public.quiz_attempts a
  where a.quiz_id = v_quiz.id and a.user_id = v_user and a.mode = p_mode and a.finished_at is null
  limit 1;
  if v_exists is null then
    insert into public.quiz_attempts (quiz_id, user_id, mode)
    values (v_quiz.id, v_user, p_mode)
    returning id into v_exists;
  end if;

  return query
    select v_exists,
           v_quiz.title,
           v_quiz.question_count,
           v_quiz.time_per_question,
           v_quiz.scoring,
           v_quiz.deadline,
           p_mode,
           (select count(*)::integer from public.quiz_attempt_answers w
             where w.attempt_id = v_exists),
           (select a.score from public.quiz_attempts a where a.id = v_exists);
end;
$$;

-- Serves one question WITHOUT the correct answer(s) and starts its clock.
create or replace function public.quiz_attempt_question(p_attempt uuid, p_index integer)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_attempt public.quiz_attempts;
  v_quiz    public.quizzes;
  v_raw     jsonb;
begin
  select * into v_attempt from public.quiz_attempts
    where id = p_attempt and user_id = (select auth.uid()) and finished_at is null;
  if v_attempt.id is null then raise exception 'Attempt not found'; end if;
  if p_index < 0 then raise exception 'Question out of range'; end if;
  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;
  if p_index >= coalesce(jsonb_array_length(v_quiz.questions), 0) then
    raise exception 'Question out of range';
  end if;
  if exists (select 1 from public.quiz_attempt_answers w
              where w.attempt_id = v_attempt.id and w.question_index = p_index) then
    raise exception 'Question already answered';
  end if;

  -- Idempotent re-open: refreshing the page must not reset the clock.
  if v_attempt.question_index is distinct from p_index then
    update public.quiz_attempts
      set question_index = p_index, question_started_at = now()
      where id = v_attempt.id;
  end if;

  v_raw := v_quiz.questions -> p_index;
  return v_raw - 'correct';
end;
$$;
grant execute on function public.quiz_attempt_question(uuid, integer) to authenticated;

-- Scores the CURRENT question server-side: correctness, speed band, streak
-- bonus. The client only sends its choice; timing comes from the server clock.
create or replace function public.quiz_attempt_answer(p_attempt uuid, p_choice jsonb)
returns table (correct boolean, gained integer, score integer, streak integer)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_attempt public.quiz_attempts;
  v_quiz    public.quizzes;
  v_q       jsonb;
  v_correct boolean := false;
  v_gained  integer := 0;
  v_elapsed integer;
  v_limit   integer;
  v_streak  integer;
begin
  select * into v_attempt from public.quiz_attempts
    where id = p_attempt and user_id = (select auth.uid()) and finished_at is null;
  if v_attempt.id is null then raise exception 'Attempt not found'; end if;
  if v_attempt.question_index is null or v_attempt.question_started_at is null then
    raise exception 'Question not started';
  end if;
  if exists (select 1 from public.quiz_attempt_answers w
              where w.attempt_id = v_attempt.id
                and w.question_index = v_attempt.question_index) then
    raise exception 'Answer already submitted';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;
  v_q := v_quiz.questions -> v_attempt.question_index;
  if v_q is null then raise exception 'Question unavailable'; end if;

  v_elapsed := greatest(0, (extract(epoch from (now() - v_attempt.question_started_at)) * 1000))::integer;
  v_limit := coalesce((v_q ->> 'seconds')::integer, v_quiz.time_per_question) * 1000;

  -- Server-side validation of the submitted choice. Correct answers never
  -- leave the database: the comparison happens here, on the stored jsonb.
  if p_choice is null then
    v_correct := false; -- no answer
  elsif jsonb_typeof(v_q -> 'correct') = 'array' then
    -- Multiple select: exact match of the sorted index sets.
    if jsonb_typeof(p_choice) = 'array' then
      v_correct :=
        (select coalesce(string_agg(s.e, ',' order by s.e), '')
           from (select cast(value as integer)::text as e from jsonb_array_elements_text(p_choice)) s)
        =
        (select coalesce(string_agg(s.e, ',' order by s.e), '')
           from (select cast(value as integer)::text as e from jsonb_array_elements_text(v_q -> 'correct')) s);
    end if;
  else
    v_correct := p_choice = (v_q -> 'correct');
  end if;

  if v_correct then
    if v_quiz.scoring = 'fixed' then
      v_gained := 1000;
    else
      v_gained := case
        when v_limit <= 0 or v_elapsed <= v_limit * 0.2 then 1000
        when v_elapsed <= v_limit * 0.4 then 800
        when v_elapsed <= v_limit * 0.6 then 600
        when v_elapsed <= v_limit * 0.8 then 400
        else 200
      end;
    end if;
    v_streak := v_attempt.streak + 1;
    v_gained := v_gained + least(300, (v_streak - 1) * 50);
  else
    v_streak := 0;
  end if;

  insert into public.quiz_attempt_answers (attempt_id, question_index, choice, correct, gained, elapsed_ms)
  values (v_attempt.id, v_attempt.question_index, p_choice, v_correct, v_gained, v_elapsed);

  -- Column references are qualified: unqualified names would resolve to the
  -- OUT parameters (correct/gained/score/streak) inside plpgsql.
  update public.quiz_attempts a
    set score = a.score + v_gained,
        correct = a.correct + (case when v_correct then 1 else 0 end),
        answered = a.answered + 1,
        answered_ms = a.answered_ms + (case when v_correct then v_elapsed else 0 end),
        streak = v_streak,
        best_streak = greatest(a.best_streak, v_streak),
        question_index = null,
        question_started_at = null
    where a.id = v_attempt.id;

  return query select v_correct, v_gained,
    (select b.score from public.quiz_attempts b where b.id = v_attempt.id), v_streak;
end;
$$;
grant execute on function public.quiz_attempt_answer(uuid, jsonb) to authenticated;

-- XP awarding helper (idempotent through the xp_ledger unique event key).
create or replace function public.quiz_grant_xp(p_user uuid, p_event text, p_amount integer, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_amount is null or p_amount <= 0 then return; end if;
  begin
    insert into public.xp_ledger (user_id, event_key, amount, reason)
    values (p_user, p_event, p_amount, coalesce(p_reason, ''));
    update public.profiles set xp = coalesce(xp, 0) + p_amount where id = p_user;
  exception when unique_violation then
    return; -- already rewarded
  end;
end;
$$;

-- Finishes an attempt: persists a quiz_game row, awards XP
-- (10 per correct answer, capped at 100) and returns the summary. Idempotent.
create or replace function public.quiz_attempt_finish(p_attempt uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_attempt public.quiz_attempts;
  v_game    uuid;
  v_xp      integer;
begin
  select * into v_attempt from public.quiz_attempts
    where id = p_attempt and user_id = (select auth.uid());
  if v_attempt.id is null then raise exception 'Attempt not found'; end if;

  if v_attempt.finished_at is null then
    update public.quiz_attempts set finished_at = now() where id = v_attempt.id;

    insert into public.quiz_games (quiz_id, host_id, pin, mode)
    values (v_attempt.quiz_id, v_attempt.user_id,
            (select pin from public.quizzes where id = v_attempt.quiz_id), v_attempt.mode)
    returning id into v_game;

    insert into public.quiz_game_players (game_id, nickname, user_id, score, correct, total, accuracy, avg_ms)
    select v_game,
           coalesce(pr.display_name, 'Student'),
           v_attempt.user_id,
           v_attempt.score,
           v_attempt.correct,
           coalesce(jsonb_array_length(q.questions), 0),
           case when v_attempt.answered > 0
                then round(v_attempt.correct * 100.0 / v_attempt.answered)::integer else 0 end,
           case when v_attempt.correct > 0
                then round(v_attempt.answered_ms::numeric / v_attempt.correct)::integer else 0 end
    from public.quiz_attempts a
    join public.quizzes q on q.id = a.quiz_id
    left join public.profiles pr on pr.id = a.user_id
    where a.id = v_attempt.id;

    v_xp := least(100, v_attempt.correct * 10);
    perform public.quiz_grant_xp(v_attempt.user_id, 'quiz:' || v_attempt.id::text, v_xp,
      'COVA QUIZ ' || v_attempt.mode);
  else
    select coalesce(max(amount), 0) into v_xp from public.xp_ledger
      where user_id = v_attempt.user_id and event_key = 'quiz:' || v_attempt.id::text;
  end if;

  return jsonb_build_object(
    'score', v_attempt.score,
    'correct', v_attempt.correct,
    'total', coalesce(jsonb_array_length((select questions from public.quizzes where id = v_attempt.quiz_id)), 0),
    'answered', v_attempt.answered,
    'accuracy', case when v_attempt.answered > 0
                then round(v_attempt.correct * 100.0 / v_attempt.answered)::integer else 0 end,
    'avgMs', case when v_attempt.correct > 0
                then round(v_attempt.answered_ms::numeric / v_attempt.correct)::integer else 0 end,
    'bestStreak', v_attempt.best_streak,
    'xp', v_xp
  );
end;
$$;
grant execute on function public.quiz_attempt_finish(uuid) to authenticated;

-- --------------------------------------------------------------- live XP
-- Called by the host route after persisting a live game: awards XP to every
-- signed-in player (10 per correct answer, +50 winner bonus, capped at 200).
create or replace function public.quiz_award_live_xp(p_game uuid)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_total integer := 0;
  v_row   record;
  v_rank  integer;
  v_count integer;
begin
  if not exists (select 1 from public.quiz_games
                  where id = p_game and host_id = (select auth.uid())) then
    raise exception 'Host only';
  end if;
  select count(*) into v_count from public.quiz_game_players where game_id = p_game;
  for v_row in
    select p.*, row_number() over (order by p.score desc) as rnk
    from public.quiz_game_players p
    where p.game_id = p_game and p.user_id is not null
  loop
    perform public.quiz_grant_xp(v_row.user_id, 'quiz:' || p_game::text, -- one grant per user per game
      least(200, v_row.correct * 10 + (case when v_row.rnk = 1 and v_count > 1 then 50 else 0 end)),
      'COVA QUIZ live');
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;
grant execute on function public.quiz_award_live_xp(uuid) to authenticated;

-- ------------------------------------------------------------ leaderboards
create or replace view public.quiz_leaderboard_global with (security_invoker = true) as
select p.user_id,
       coalesce(pr.display_name, p.nickname) as display_name,
       sum(p.score)::bigint                  as total_score,
       count(*)::integer                     as games,
       max(p.score)::integer                 as best_score
from public.quiz_game_players p
left join public.profiles pr on pr.id = p.user_id
where p.user_id is not null
group by p.user_id, p.nickname, pr.display_name;
grant select on public.quiz_leaderboard_global to authenticated;

create or replace view public.quiz_leaderboard_week with (security_invoker = true) as
select p.user_id,
       coalesce(pr.display_name, p.nickname) as display_name,
       sum(p.score)::bigint                  as total_score,
       count(*)::integer                     as games,
       max(p.score)::integer                 as best_score
from public.quiz_game_players p
join public.quiz_games g on g.id = p.game_id
left join public.profiles pr on pr.id = p.user_id
where p.user_id is not null
  and g.played_at > now() - interval '7 days'
group by p.user_id, p.nickname, pr.display_name;
grant select on public.quiz_leaderboard_week to authenticated;

-- --------------------------------------------------- demonstration quiz
-- Retry of the demo insert from 20261103000001_quiz.sql: the original ran
-- before any user signed up, the subselect returned nothing and the demo quiz
-- was silently skipped. Deterministic owner: the oldest account.
do $$
declare
  v_owner uuid;
begin
  if exists (select 1 from public.quizzes where id = '11111111-1111-4111-8111-111111111111') then
    return;
  end if;
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then return; end if;
  begin
    insert into public.quizzes (id, created_by, title, description, category, mode, visibility,
      question_count, time_per_question, scoring, randomize, nicknames, music, pin, questions)
    values (
      '11111111-1111-4111-8111-111111111111',
      v_owner,
      'General Knowledge',
      'COVA QUIZ demonstration game — 10 questions, 20 seconds each.',
      'Science',
      'live',
      'private',
      10, 20, 'standard', true, true, false, '123456',
      '[
        {"q":"What planet is known as the Red Planet?","choices":["Mars","Venus","Jupiter","Mercury"],"correct":0},
        {"q":"Water boils at 100 degrees Celsius at sea level.","choices":["True","False"],"correct":0},
        {"q":"Which gas do plants absorb?","choices":["Oxygen","Carbon dioxide","Nitrogen","Helium"],"correct":1},
        {"q":"The speed of light is about 300,000 km/s.","choices":["True","False"],"correct":0},
        {"q":"How many continents are there?","choices":["5","6","7","8"],"correct":2},
        {"q":"Select all prime numbers.","choices":["2","3","4","5"],"correct":[0,1,3],"multiple":true},
        {"q":"What is H2O?","choices":["Salt","Water","Sugar","Gold"],"correct":1},
        {"q":"The sun is a star.","choices":["True","False"],"correct":0},
        {"q":"Which is the largest ocean?","choices":["Atlantic","Indian","Arctic","Pacific"],"correct":3},
        {"q":"Honey never spoils.","choices":["True","False"],"correct":0}
      ]'::jsonb);
  exception when others then
    return; -- pin taken by another quiz: leave user quizzes untouched
  end;
end $$;
