-- COVA QUIZ: quizzes (with jsonb questions), live-game results.
-- Quiz meta + questions live together; game results persist when the host
-- ends a session (server route, host token, RLS-checked).

create table if not exists public.quizzes (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null references auth.users (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  description  text not null default '',
  category     text not null default 'Other',
  mode         text not null default 'live' check (mode in ('live', 'challenge', 'solo')),
  visibility   text not null default 'public' check (visibility in ('public', 'private')),
  question_count integer not null default 0,
  time_per_question integer not null default 20 check (time_per_question in (10, 20, 30, 60)),
  scoring      text not null default 'standard' check (scoring in ('standard', 'fixed')),
  randomize    boolean not null default false,
  nicknames    boolean not null default true,
  music        boolean not null default false,
  pin          text,
  questions    jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  created_at   timestamptz not null default now()
);
create index if not exists quizzes_created_idx on public.quizzes (created_at desc);

alter table public.quizzes enable row level security;
grant select, insert, update, delete on public.quizzes to authenticated;

drop policy if exists "Authenticated read public quizzes" on public.quizzes;
create policy "Authenticated read public quizzes"
  on public.quizzes for select to authenticated
  using (visibility = 'public' or created_by = (select auth.uid()) or pin is not null);

drop policy if exists "Authors manage their quizzes" on public.quizzes;
create policy "Authors manage their quizzes"
  on public.quizzes for all to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- Results: one row per finished game, players with their scores.
create table if not exists public.quiz_games (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes (id) on delete cascade,
  host_id     uuid not null references auth.users (id) on delete cascade,
  pin         text not null,
  played_at   timestamptz not null default now()
);
create index if not exists quiz_games_quiz_idx on public.quiz_games (quiz_id, played_at desc);

create table if not exists public.quiz_game_players (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.quiz_games (id) on delete cascade,
  nickname    text not null,
  user_id     uuid references auth.users (id) on delete set null,
  score       integer not null default 0,
  correct     integer not null default 0,
  total       integer not null default 0,
  accuracy    integer not null default 0,
  avg_ms      integer not null default 0
);
create index if not exists quiz_game_players_game_idx on public.quiz_game_players (game_id, score desc);

alter table public.quiz_games enable row level security;
alter table public.quiz_game_players enable row level security;
grant select, insert on public.quiz_games to authenticated;
grant select, insert on public.quiz_game_players to authenticated;

drop policy if exists "Authenticated read quiz games" on public.quiz_games;
create policy "Authenticated read quiz games"
  on public.quiz_games for select to authenticated using (true);
drop policy if exists "Hosts create quiz games" on public.quiz_games;
create policy "Hosts create quiz games"
  on public.quiz_games for insert to authenticated
  with check (host_id = (select auth.uid()));

drop policy if exists "Authenticated read quiz game players" on public.quiz_game_players;
create policy "Authenticated read quiz game players"
  on public.quiz_game_players for select to authenticated using (true);
drop policy if exists "Hosts create quiz game players" on public.quiz_game_players;
create policy "Hosts create quiz game players"
  on public.quiz_game_players for insert to authenticated
  with check (exists (select 1 from public.quiz_games g where g.id = game_id and g.host_id = (select auth.uid())));

-- Demonstration quiz (private, live, 10 questions, standard scoring).
insert into public.quizzes (id, created_by, title, description, category, mode, visibility,
  question_count, time_per_question, scoring, randomize, nicknames, music, pin, questions)
select
  '11111111-1111-4111-8111-111111111111',
  (select id from auth.users limit 1),
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
  ]'::jsonb
where not exists (select 1 from public.quizzes where id = '11111111-1111-4111-8111-111111111111')
  and exists (select 1 from auth.users);
