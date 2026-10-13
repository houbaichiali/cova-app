-- COVA Connect: schema (profiles, friendships, direct messages, communities).
-- Row Level Security, policies and RPCs live in the next migration.
--
-- Conventions
--   * Every user id column is the auth user id (auth.uid()). Clients never send it:
--     the columns default to auth.uid() and column-level grants stop clients from setting them.
--   * "public id" (COVA-XXXXXX) is the human-friendly handle people search for. It is NOT a key.

------------------------------------------------------------------------ id generators

create or replace function public.random_code(p_length int)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- No 0/O/1/I so codes are easy to read aloud. Same alphabet as the old client store.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  result text := '';
  i int;
begin
  bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex'); -- 16 random bytes
  for i in 0 .. p_length - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

------------------------------------------------------------------------ profiles

create table public.profiles (
  -- For real people this equals auth.users.id (set by the signup trigger below).
  -- Sample students are seeded rows with is_sample = true and no auth user.
  id           uuid primary key default gen_random_uuid(),
  public_id    text not null unique,
  display_name text not null default 'Student'
                 check (char_length(btrim(display_name)) between 1 and 60),
  headline     text not null default '' check (char_length(headline) <= 160),
  tone         text not null default 'soft' check (tone in ('pale', 'soft', 'muted')),
  is_sample    boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint profiles_public_id_format
    check (is_sample or public_id ~ '^COVA-[A-HJ-NP-Z2-9]{6}$')
);

create index profiles_display_name_idx on public.profiles (lower(display_name));

create or replace function public.generate_public_id()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := 'COVA-' || public.random_code(6);
    exit when not exists (select 1 from public.profiles where public_id = candidate);
  end loop;
  return candidate;
end;
$$;

alter table public.profiles alter column public_id set default public.generate_public_id();

-- A profile is created for every new auth user. SECURITY DEFINER because the new user has no
-- INSERT right on profiles (and must not have one).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, tone)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Student'
      ),
      60
    ),
    (array['pale', 'soft', 'muted'])[1 + floor(random() * 3)::int]
  );
  return new;
end;
$$;

create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profiles where id = old.id and not is_sample;
  return old;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_user();

------------------------------------------------------------------------ friendships

create table public.friendships (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friendships_not_self check (from_id <> to_id)
);

-- One row per pair, whoever asked first.
create unique index friendships_pair_idx
  on public.friendships (least(from_id, to_id), greatest(from_id, to_id));
create index friendships_to_idx on public.friendships (to_id);

------------------------------------------------------------------------ direct messages

create table public.direct_messages (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint direct_messages_not_self check (from_id <> to_id)
);

create index direct_messages_from_idx on public.direct_messages (from_id, created_at desc);
create index direct_messages_to_idx on public.direct_messages (to_id, created_at desc);

-- When `user_id` last opened the conversation with `other_id`.
create table public.message_reads (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  other_id uuid not null references public.profiles (id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (user_id, other_id)
);

------------------------------------------------------------------------ communities

create table public.communities (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 3 and 60),
  description    text not null check (char_length(btrim(description)) between 10 and 500),
  category       text not null default 'Other' check (char_length(category) between 1 and 40),
  visibility     text not null default 'public' check (visibility in ('public', 'private')),
  posting_policy text not null default 'everyone'
                   check (posting_policy in ('everyone', 'admins', 'owner')),
  owner_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now()
);

create index communities_owner_idx on public.communities (owner_id);

-- The invite code lives in its own table. A column can't be hidden row by row with RLS, and
-- column-level REVOKEs break `select *` and Realtime on communities. Here the code is only
-- readable by the community's staff, and only changeable through regenerate_join_code().
create table public.community_join_codes (
  community_id uuid primary key references public.communities (id) on delete cascade,
  code         text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$')
);

create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := public.random_code(8);
    exit when not exists (select 1 from public.community_join_codes where code = candidate);
  end loop;
  return candidate;
end;
$$;

alter table public.community_join_codes alter column code set default public.generate_join_code();

create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index community_members_user_idx on public.community_members (user_id);
-- Exactly one owner per community.
create unique index community_members_one_owner_idx
  on public.community_members (community_id) where role = 'owner';

create table public.join_requests (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (community_id, user_id)
);

create index join_requests_user_idx on public.join_requests (user_id);

create table public.community_posts (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  author_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at   timestamptz not null default now()
);

create index community_posts_feed_idx on public.community_posts (community_id, created_at desc);
