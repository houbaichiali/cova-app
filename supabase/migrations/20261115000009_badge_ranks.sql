-- =============================================================================
-- COVA — Badge ranks and visibility (additive, non-destructive).
--
-- Phase 8 of the community/rewards overhaul:
--   1. badge_definitions gains two additive columns:
--        * visibility_mode: 'public' (profile pages), 'private' (recipient and
--          admins only), 'hidden' (mystery badge until earned). The legacy
--          `secret` flag keeps working; new UI reads visibility_mode.
--        * ranks: jsonb array [{rank: 1..8, threshold: n}] — the 8-rank
--          progression evaluated against the badge's own metric.
--   2. badge_rank_awards: one row per (user, badge, rank), credited with the
--      badge's xp_reward through grant_xp (ledger key badge_rank:<badge>:<rank>)
--      plus a badge_rank notification. Existing badge unlocks, editions and
--      their XP are untouched — ranks add a progression layer on top.
--   3. evaluate_badge_ranks(p_user) is driven by the same five events that
--      drive evaluate_badges (lesson completions, challenge submissions,
--      assignment attempts, accepted friendships, profile updates) through
--      separate additive triggers.
--   4. Seeded: the bookworm family gets a full 8-rank ladder on lessons_done
--      (10/25/50/100/200/400/800/1600). Every other badge stays as-is until an
--      admin configures ranks in the Badge Management module (Phase 9).
-- =============================================================================

------------------------------------------- 1. additive columns on definitions
alter table public.badge_definitions
  add column if not exists visibility_mode text not null default 'public'
    check (visibility_mode in ('public', 'private', 'hidden'));
alter table public.badge_definitions
  add column if not exists ranks jsonb not null default '[]'::jsonb
    check (jsonb_typeof(ranks) = 'array');

-- Rank labels (configurable later through the ranks jsonb when needed).
create or replace function public.badge_rank_label(p_rank integer)
returns text
language sql
immutable
as $$
  select case p_rank
    when 1 then 'Rank 1 · Novice'
    when 2 then 'Rank 2 · Apprentice'
    when 3 then 'Rank 3 · Adept'
    when 4 then 'Rank 4 · Expert'
    when 5 then 'Rank 5 · Master'
    when 6 then 'Rank 6 · Grandmaster'
    when 7 then 'Rank 7 · Legend'
    when 8 then 'Rank 8 · Mythic'
    else 'Rank ' || p_rank
  end
$$;

------------------------------------------------------------- 2. rank awards
create table if not exists public.badge_rank_awards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  badge_key  text not null references public.badge_definitions (key) on delete cascade,
  rank       smallint not null check (rank between 1 and 8),
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_key, rank)
);
create index if not exists badge_rank_user_idx on public.badge_rank_awards (user_id, badge_key);
alter table public.badge_rank_awards enable row level security;
grant select on public.badge_rank_awards to authenticated;
drop policy if exists "Rank awards are public" on public.badge_rank_awards;
create policy "Rank awards are public"
  on public.badge_rank_awards for select to authenticated
  using (true);
-- inserts happen only inside evaluate_badge_ranks (security definer).

-------------------------------------------------------------- 3. the evaluator
create or replace function public.evaluate_badge_ranks(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public as $$
declare
  d record;
  r record;
  v_metric integer;
begin
  if p_user is null then return; end if;
  for d in
    select * from public.badge_definitions
    where jsonb_typeof(ranks) = 'array' and jsonb_array_length(ranks) > 0
  loop
    v_metric := public.badge_metric(p_user, d.metric);
    for r in
      select (elem->>'rank')::smallint as rank, (elem->>'threshold')::int as threshold
      from jsonb_array_elements(d.ranks) elem
      where (elem->>'rank') is not null and (elem->>'threshold') is not null
    loop
      if r.rank between 1 and 8 and v_metric >= r.threshold
        and not exists (
          select 1 from public.badge_rank_awards a
          where a.user_id = p_user and a.badge_key = d.key and a.rank = r.rank
        )
      then
        insert into public.badge_rank_awards (user_id, badge_key, rank)
        values (p_user, d.key, r.rank);
        if d.xp_reward > 0 then
          perform public.grant_xp(p_user, 'badge_rank:' || d.key || ':' || r.rank,
            d.xp_reward, d.name || ' — ' || public.badge_rank_label(r.rank));
        end if;
        perform public.notify(p_user, 'badge_rank', p_user,
          '/profile', d.name, r.rank::text);
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.evaluate_badge_ranks(uuid) from public, anon, authenticated;

-- Trigger wrappers (PostgreSQL triggers need RETURNS trigger functions).
create or replace function public.trg_rank_lesson()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.evaluate_badge_ranks(new.user_id); return null; end $$;

create or replace function public.trg_rank_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.evaluate_badge_ranks(new.user_id); return null; end $$;

create or replace function public.trg_rank_attempt()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.evaluate_badge_ranks(new.user_id); return null; end $$;

create or replace function public.trg_rank_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.evaluate_badge_ranks(new.to_id); return null; end $$;

create or replace function public.trg_rank_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.evaluate_badge_ranks(new.id); return null; end $$;

-- Same five events as the badge engine; additive triggers of their own.
do $$
begin
  if to_regclass('public.lesson_completions') is not null then
    drop trigger if exists lesson_completion_rank on public.lesson_completions;
    create trigger lesson_completion_rank
      after insert on public.lesson_completions
      for each row execute function public.trg_rank_lesson();
  end if;
end $$;

do $$
begin
  if to_regclass('public.challenge_submissions') is not null then
    drop trigger if exists challenge_submission_rank on public.challenge_submissions;
    create trigger challenge_submission_rank
      after insert on public.challenge_submissions
      for each row execute function public.trg_rank_challenge();
  end if;
end $$;

do $$
begin
  if to_regclass('public.assignment_attempts') is not null then
    drop trigger if exists assignment_attempt_rank on public.assignment_attempts;
    create trigger assignment_attempt_rank
      after insert on public.assignment_attempts
      for each row execute function public.trg_rank_attempt();
  end if;
end $$;

do $$
begin
  if to_regclass('public.friendships') is not null then
    drop trigger if exists friendship_rank on public.friendships;
    create trigger friendship_rank
      after update of status on public.friendships
      for each row
      when (new.status = 'accepted')
      execute function public.trg_rank_friendship();
  end if;
end $$;

do $$
begin
  drop trigger if exists profile_content_rank on public.profiles;
  create trigger profile_content_rank
    after update on public.profiles
    for each row
    execute function public.trg_rank_profile();
end $$;

------------------------------------------------------------------- 4. reader RPC
create or replace function public.my_badge_ranks()
returns table (badge_key text, rank smallint, label text, awarded_at timestamptz)
language sql
stable
security definer
set search_path = public as $$
  select a.badge_key, a.rank, public.badge_rank_label(a.rank), a.awarded_at
  from public.badge_rank_awards a
  where a.user_id = (select auth.uid())
  order by a.awarded_at desc
$$;

revoke all on function public.my_badge_ranks() from public, anon;
grant execute on function public.my_badge_ranks() to authenticated;

------------------------------------------------------------------------ 5. seed
-- Bookworm family (metric lessons_done): a full 8-rank ladder.
update public.badge_definitions
  set ranks = '[{"rank":1,"threshold":10},{"rank":2,"threshold":25},{"rank":3,"threshold":50},{"rank":4,"threshold":100},{"rank":5,"threshold":200},{"rank":6,"threshold":400},{"rank":7,"threshold":800},{"rank":8,"threshold":1600}]'::jsonb
  where key = 'bookworm';
