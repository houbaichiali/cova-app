-- =============================================================================
-- COVA — Follows and bookmarks (additive, non-destructive).
--
-- Phase 3b of the community/rewards overhaul:
--   1. follows — public "follow a member" edges with a notification for the
--      person being followed. Select is open to authenticated users (who a
--      member follows is public information, like friendships).
--   2. post_bookmarks — private per-user saved posts. Visibility is strictly
--      owner-only, and saving requires the post to be visible (can_view_post
--      from the interactions migration), so nobody bookmarks content they
--      cannot read.
-- =============================================================================

----------------------------------------------------------------------- follows
create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followed_id uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint follows_not_self check (follower_id <> followed_id)
);
create index if not exists follows_followed_idx on public.follows (followed_id);
alter table public.follows enable row level security;
grant select, insert, delete on public.follows to authenticated;

drop policy if exists "Follows are public" on public.follows;
create policy "Follows are public"
  on public.follows for select to authenticated
  using (true);

drop policy if exists "Users follow as themselves" on public.follows;
create policy "Users follow as themselves"
  on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));

drop policy if exists "Users unfollow as themselves" on public.follows;
create policy "Users unfollow as themselves"
  on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

create or replace function public.notify_on_new_follow()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_code text;
begin
  if new.follower_id is null then return new; end if;
  select user_code into v_code from public.profiles where id = new.follower_id;
  perform public.notify(
    new.followed_id,
    'new_follower',
    new.follower_id,
    coalesce('/u/' || v_code, '/community'),
    '',
    ''
  );
  return new;
end;
$$;

drop trigger if exists follow_notify on public.follows;
create trigger follow_notify
  after insert on public.follows
  for each row execute function public.notify_on_new_follow();

----------------------------------------------------------------- post_bookmarks
create table if not exists public.post_bookmarks (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id    uuid not null references public.space_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.post_bookmarks enable row level security;
grant select, insert, delete on public.post_bookmarks to authenticated;

drop policy if exists "Bookmarks are private" on public.post_bookmarks;
create policy "Bookmarks are private"
  on public.post_bookmarks for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users bookmark visible posts" on public.post_bookmarks;
create policy "Users bookmark visible posts"
  on public.post_bookmarks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_view_post(post_id)
  );

drop policy if exists "Users remove own bookmarks" on public.post_bookmarks;
create policy "Users remove own bookmarks"
  on public.post_bookmarks for delete to authenticated
  using (user_id = (select auth.uid()));
