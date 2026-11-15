-- =============================================================================
-- COVA — Spaces schema reconciliation (additive, idempotent).
--
-- WHY THIS EXISTS
--   The production database contains `spaces`, `space_members`, `space_posts`,
--   `space_join_requests` and `join_codes`, but their CREATE TABLE statements
--   were never committed to this repository. Every migration that touches them
--   guards itself with `to_regclass(...)` (20261102000004), so a deployment
--   built purely from the migration chain ends up with NO tables and a
--   silently empty feed (`social-store.ts` logs "[social] could not refresh
--   posts" and shows nothing).
--
-- WHAT THIS MIGRATION DOES
--   Creates the missing tables with `if not exists` (no-op on the live DB),
--   enables RLS, grants the access the client needs, and (re)creates the v3
--   policies verbatim from 20261102000004 plus minimal policies for the two
--   request/code tables the client uses.
--
-- SOURCE OF TRUTH
--   Table shapes come from supabase/tests/05_base_schema_stub.sql (kept in
--   sync with the live schema when the harness was built) and from the exact
--   columns the client reads/writes (social-store.ts, GroupDetail.tsx,
--   space_join RPCs). Divergences from the stub are documented inline.
--
-- !! BEFORE APPLYING: validate against the real database with
--      pg_dump --schema-only --table=public.spaces --table=public.space_members
--              --table=public.space_posts --table=public.space_join_requests
--              --table=public.join_codes
--    `create table if not exists` cannot alter an existing table, so applying
--    this on the live database is a no-op for the CREATEs and only resets the
--    listed policies to their v3 definitions.
-- =============================================================================

--------------------------------------------------------------- spaces
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
  space_id  uuid not null references public.spaces (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  -- note: the live database also stores 'admin' (GroupDetail.tsx:150 checks for
  -- it); the stub only lists owner/mod/member. Kept permissive to match both.
  role      text not null default 'member'
            check (role in ('owner', 'admin', 'mod', 'member')),
  joined_at timestamptz not null default now(),
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

-- Invite codes. Live table (client: social-store.ts:660 and GroupDetail.tsx:152
-- read `kind='space'` + `target_id`; the legacy communities use the same table
-- per 20261102000003:277). NOT `space_join_codes` — that name only exists in
-- the test stub.
create table if not exists public.join_codes (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'space',
  target_id  uuid,
  code       text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists join_codes_target_idx on public.join_codes (kind, target_id);

-- Join queue for private groups. Live table (space_join RPCs insert
-- (space_id, user_id, status='pending') with `on conflict do nothing`, so a
-- unique constraint on (space_id, user_id) is expected).
create table if not exists public.space_join_requests (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status     text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (space_id, user_id)
);
create index if not exists space_join_requests_space_idx on public.space_join_requests (space_id, status);

alter table public.spaces            enable row level security;
alter table public.space_members     enable row level security;
alter table public.space_posts       enable row level security;
alter table public.join_codes        enable row level security;
alter table public.space_join_requests enable row level security;

grant select, insert, update on public.spaces to authenticated;
grant select, insert, update, delete on public.space_members to authenticated;
grant select, insert, update, delete on public.space_posts to authenticated;
grant select, insert on public.join_codes to authenticated;
grant select, insert, update, delete on public.space_join_requests to authenticated;

--------------------------------------------------------------- spaces RLS (v3, verbatim)
drop policy if exists spaces_select_v3 on public.spaces;
create policy spaces_select_v3 on public.spaces
  for select to authenticated
  using (
    visibility = 'public'
    or owner_id = auth.uid()
    or public.is_space_member(id)
    or public.is_community_member(id)
  );

drop policy if exists spaces_insert_v3 on public.spaces;
create policy spaces_insert_v3 on public.spaces
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists spaces_update_v3 on public.spaces;
create policy spaces_update_v3 on public.spaces
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

----------------------------------------------------------- space_members RLS (v3, verbatim)
drop policy if exists space_members_select_v3 on public.space_members;
create policy space_members_select_v3 on public.space_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_space_owner(space_id)
    or exists (
      select 1 from public.spaces s
      where s.id = space_id and s.visibility = 'public'
    )
  );

drop policy if exists space_members_insert_self_v3 on public.space_members;
create policy space_members_insert_self_v3 on public.space_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and exists (
      select 1 from public.spaces s
      where s.id = space_id and s.visibility = 'public'
    )
  );

drop policy if exists space_members_insert_owner_v3 on public.space_members;
create policy space_members_insert_owner_v3 on public.space_members
  for insert to authenticated
  with check (public.is_space_owner(space_id));

drop policy if exists space_members_delete_v3 on public.space_members;
create policy space_members_delete_v3 on public.space_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_space_owner(space_id));

drop policy if exists space_members_update_v3 on public.space_members;
create policy space_members_update_v3 on public.space_members
  for update to authenticated
  using (user_id = auth.uid() or public.is_space_owner(space_id))
  with check (user_id = auth.uid() or public.is_space_owner(space_id));

------------------------------------------------------------- space_posts RLS (v3, verbatim)
drop policy if exists space_posts_select_v3 on public.space_posts;
create policy space_posts_select_v3 on public.space_posts
  for select to authenticated
  using (
    exists (
      select 1 from public.spaces s
      where s.id = space_id
        and (
          s.visibility = 'public'
          or s.owner_id = auth.uid()
          or public.is_space_member(s.id)
        )
    )
  );

drop policy if exists space_posts_insert_v3 on public.space_posts;
create policy space_posts_insert_v3 on public.space_posts
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_space_member(space_id)
  );

drop policy if exists space_posts_update_v3 on public.space_posts;
create policy space_posts_update_v3 on public.space_posts
  for update to authenticated
  using (author_id = auth.uid() or public.is_space_owner(space_id))
  with check (author_id = auth.uid() or public.is_space_owner(space_id));

drop policy if exists space_posts_delete_v3 on public.space_posts;
create policy space_posts_delete_v3 on public.space_posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_space_owner(space_id));

------------------------------------------------------- join_codes RLS (minimal, new)
-- Members and owners may read their own group's code (the client filters by
-- role); owners may issue one. Anything richer stays in SECURITY DEFINER RPCs.
drop policy if exists join_codes_select_member on public.join_codes;
create policy join_codes_select_member on public.join_codes
  for select to authenticated
  using (
    exists (
      select 1 from public.spaces s
      where s.id = join_codes.target_id
        and (s.owner_id = auth.uid() or public.is_space_member(s.id))
    )
  );

drop policy if exists join_codes_insert_owner on public.join_codes;
create policy join_codes_insert_owner on public.join_codes
  for insert to authenticated
  with check (
    kind = 'space'
    and exists (
      select 1 from public.spaces s
      where s.id = join_codes.target_id and s.owner_id = auth.uid()
    )
  );

------------------------------------------------- space_join_requests RLS (minimal, new)
drop policy if exists space_join_requests_select on public.space_join_requests;
create policy space_join_requests_select on public.space_join_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_space_owner(space_id)
    or public.is_space_member(space_id)
  );

drop policy if exists space_join_requests_insert_self on public.space_join_requests;
create policy space_join_requests_insert_self on public.space_join_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists space_join_requests_delete_own on public.space_join_requests;
create policy space_join_requests_delete_own on public.space_join_requests
  for delete to authenticated
  using (user_id = auth.uid() or public.is_space_owner(space_id));

drop policy if exists space_join_requests_update_owner on public.space_join_requests;
create policy space_join_requests_update_owner on public.space_join_requests
  for update to authenticated
  using (public.is_space_owner(space_id))
  with check (public.is_space_owner(space_id));
