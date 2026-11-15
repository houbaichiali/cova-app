-- =============================================================================
-- COVA — Social interactions (additive, non-destructive).
--
-- Phase 3a of the community/rewards overhaul (docs/rewards-badges-audit.md):
--   1. post_reactions — likes and reactions on space posts (unique per user
--      and kind, toggle by insert/delete), with a notification to the author.
--   2. post_comments — threaded comments (one parent level), full RLS aligned
--      with the post visibility, edit/delete own, notification to the author.
--   3. user_blocks — bidirectional blocking: a blocked pair can no longer send
--      direct messages or friend requests in EITHER direction. Blocking is
--      enforced at RLS level, not just in the interface.
--
-- Reactions and comments share the post visibility model through the
-- can_view_post() helper instead of repeating the space_posts subquery.
-- =============================================================================

------------------------------------------------------- shared visibility helper
create or replace function public.can_view_post(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.space_posts p
    join public.spaces s on s.id = p.space_id
    where p.id = p_post
      and (
        s.visibility = 'public'
        or s.owner_id = (select auth.uid())
        or public.is_space_member(s.id)
      )
  )
$$;

revoke all on function public.can_view_post(uuid) from public, anon;
grant execute on function public.can_view_post(uuid) to authenticated;

----------------------------------------------------------------- post_reactions
create table if not exists public.post_reactions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.space_posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind       text not null default 'like' check (kind in ('like', 'celebrate', 'insightful', 'helpful')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, kind)
);
create index if not exists post_reactions_post_idx on public.post_reactions (post_id);
alter table public.post_reactions enable row level security;
grant select, insert, delete on public.post_reactions to authenticated;

drop policy if exists "Reactions visible with the post" on public.post_reactions;
create policy "Reactions visible with the post"
  on public.post_reactions for select to authenticated
  using (public.can_view_post(post_id));

drop policy if exists "Users react as themselves" on public.post_reactions;
create policy "Users react as themselves"
  on public.post_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_view_post(post_id)
    and not exists (select 1 from public.me_sanctions())
  );

drop policy if exists "Users remove own reactions" on public.post_reactions;
create policy "Users remove own reactions"
  on public.post_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

----------------------------------------------------------------- post_comments
create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.space_posts (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id  uuid references public.post_comments (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;
grant select, insert, update, delete on public.post_comments to authenticated;

drop policy if exists "Comments visible with the post" on public.post_comments;
create policy "Comments visible with the post"
  on public.post_comments for select to authenticated
  using (public.can_view_post(post_id));

drop policy if exists "Users comment as themselves" on public.post_comments;
create policy "Users comment as themselves"
  on public.post_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_view_post(post_id)
    and not exists (select 1 from public.me_sanctions())
  );

drop policy if exists "Users edit own comments" on public.post_comments;
create policy "Users edit own comments"
  on public.post_comments for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists "Users delete own comments" on public.post_comments;
create policy "Users delete own comments"
  on public.post_comments for delete to authenticated
  using (author_id = (select auth.uid()));

------------------------------------------------------------------- user_blocks
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists "Users see their own blocks" on public.user_blocks;
create policy "Users see their own blocks"
  on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()) or blocked_id = (select auth.uid()));

drop policy if exists "Users block as themselves" on public.user_blocks;
create policy "Users block as themselves"
  on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));

drop policy if exists "Users unblock as themselves" on public.user_blocks;
create policy "Users unblock as themselves"
  on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- Blocking closes BOTH contact directions: neither side can DM or send friend
-- requests while a block exists (recreated on top of the hardening gates).
drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages
  for insert to authenticated
  with check (
    from_id = auth.uid()
    and not exists (select 1 from public.me_sanctions())
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = to_id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = to_id)
    )
  );

drop policy if exists dm_insert_own on public.direct_messages;
create policy dm_insert_own on public.direct_messages
  for insert to authenticated
  with check (
    from_id = (select auth.uid())
    and not exists (select 1 from public.me_sanctions())
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = to_id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = to_id)
    )
  );

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    from_id = auth.uid()
    and status = 'pending'
    and not exists (select 1 from public.me_sanctions())
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = to_id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = to_id)
    )
  );

------------------------------------------------------------------ notifications
create or replace function public.notify_on_post_reaction()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_author uuid;
  v_space uuid;
  v_space_kind text;
  v_body text;
begin
  if new.user_id is null then return new; end if;
  select p.author_id, p.space_id, left(p.body, 80)
    into v_author, v_space, v_body
    from public.space_posts p
    where p.id = new.post_id;
  if v_author is null or v_author = new.user_id then return new; end if;
  select coalesce(kind, 'community') into v_space_kind from public.spaces where id = v_space;
  perform public.notify(
    v_author,
    'post_reaction',
    new.user_id,
    case when v_space_kind = 'group' then '/groups/' else '/community/' end || v_space,
    v_body,
    new.kind
  );
  return new;
end;
$$;

create or replace function public.notify_on_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_author uuid;
  v_space uuid;
  v_space_kind text;
begin
  if new.author_id is null then return new; end if;
  select p.author_id, p.space_id into v_author, v_space
    from public.space_posts p where p.id = new.post_id;
  if v_author is null or v_author = new.author_id then return new; end if;
  select coalesce(kind, 'community') into v_space_kind from public.spaces where id = v_space;
  perform public.notify(
    v_author,
    'post_comment',
    new.author_id,
    case when v_space_kind = 'group' then '/groups/' else '/community/' end || v_space,
    left(new.body, 120),
    ''
  );
  return new;
end;
$$;

drop trigger if exists post_reaction_notify on public.post_reactions;
create trigger post_reaction_notify
  after insert on public.post_reactions
  for each row execute function public.notify_on_post_reaction();

drop trigger if exists post_comment_notify on public.post_comments;
create trigger post_comment_notify
  after insert on public.post_comments
  for each row execute function public.notify_on_post_comment();
