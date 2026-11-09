-- =============================================================================
-- TEST-ONLY SCAFFOLD — DO NOT RUN ON SUPABASE, DO NOT USE AS A REAL MIGRATION.
--
-- The live COVA database predates this repository: the base DDL for the spaces
-- (communities/groups/voice rooms), courses and assignments families was never
-- committed as a migration. The real schema must always come from a dump of the
-- live database (see docs / owner).
--
-- This file exists ONLY so the RLS/regression test harness can execute the full
-- migration chain on a plain Postgres instance:
--     psql -f 00_mock_supabase.sql
--     psql -f 05_base_schema_stub.sql      <-- THIS FILE (test only)
--     psql -f migrations/....sql           (in filename order)
--     psql -f 10_rls_tests.sql
--
-- Columns below are the minimal shape required by the later migrations and the
-- queries the application issues. They are NOT authoritative.
-- =============================================================================

-- ---------------------------------------------------------------- spaces family
create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'community'
              check (kind in ('community', 'group', 'voice')),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 600),
  category    text not null default 'general',
  language    text not null default '',
  visibility  text not null default 'public' check (visibility in ('public', 'private')),
  post_policy text not null default 'members' check (post_policy in ('members', 'mods', 'owner')),
  owner_id    uuid references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists spaces_kind_idx on public.spaces (kind);

create table if not exists public.space_members (
  space_id   uuid not null references public.spaces (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'mod', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table if not exists public.space_posts (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  attachments jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
create index if not exists space_posts_space_idx on public.space_posts (space_id, created_at desc);

create table if not exists public.space_join_codes (
  space_id   uuid primary key references public.spaces (id) on delete cascade,
  code       text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- community join requests
create table if not exists public.join_requests (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  constraint join_requests_not_self check (false) -- placeholder, replaced by RPCs
);

-- -------------------------------------------------------------- courses family
create table if not exists public.courses (
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  description   text not null default '' check (char_length(description) <= 2000),
  subject       text not null default '',
  -- the live courses.id is TEXT (migration 20261028000001 compares it to text params)
  id            text primary key default public.random_code(10),
  teacher_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_by    uuid references public.profiles (id) on delete cascade,
  invite_code   text,
  created_at    timestamptz not null default now()
);

create table if not exists public.course_lessons (
  id         uuid primary key default gen_random_uuid(),
  course_id  text not null references public.courses (id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 160),
  type       text not null default 'reading' check (type in ('reading', 'video', 'exercise', 'tp')),
  minutes    integer not null default 0,
  summary    text not null default '',
  content    text not null default '',
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists course_lessons_course_idx on public.course_lessons (course_id, position);

create table if not exists public.course_enrollments (
  course_id    text not null references public.courses (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  enrolled_at  timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table if not exists public.lesson_completions (
  -- lesson_id is TEXT in the live database (gamification joins lessons.id::text)
  lesson_id    text not null,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (lesson_id, user_id)
);


-- Live-DB-only profile columns (no repo migration creates them; discovered by
-- running the chain — extend this list as the harness reveals more).
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles
  add column if not exists user_code text unique default ('CV-' || public.random_code(8));
-- profiles.xp: the gamification counter. Referenced by gamification/quiz/XP
-- migrations but created by none of them (live database only).
alter table public.profiles add column if not exists xp integer not null default 0;
