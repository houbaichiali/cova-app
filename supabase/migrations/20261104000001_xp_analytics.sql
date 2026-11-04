-- XP analytics: new level curve + per-period XP sums for leaderboards.
-- Level 0 starts at 0 XP; reaching level n+1 costs 500 + (n * 100) more XP
-- than level n, so the cumulative threshold for level n is 50n² + 450n
-- (L1 = 500, L2 = 1100, L3 = 1800, L4 = 2600, …, open-ended).
-- XP totals are untouched: levels are always derived from profiles.xp, so
-- existing users keep their XP history and simply remap onto the new curve.

-- New shared curve (the client mirrors it in src/lib/gamification.ts).
create or replace function public.level_for_xp(p_xp numeric)
returns table (level integer, name text)
language plpgsql stable set search_path = public as $$
declare
  v_xp numeric := greatest(coalesce(p_xp, 0), 0);
  v_level integer := 0;
  v_names text[] := array[
    'Beginner', 'Explorer', 'Learner', 'Achiever',
    'Scholar', 'Expert', 'Master', 'Legend'
  ];
begin
  while v_xp >= 50 * (v_level + 1) * (v_level + 1) + 450 * (v_level + 1) loop
    v_level := v_level + 1;
    exit when v_level > 10000; -- hard stop, purely defensive
  end loop;
  return query
    select v_level,
           v_names[least(v_level + 1, array_length(v_names, 1))];
end;
$$;

-- Level-up notifications keep working: the trigger compares old vs new
-- levels from level_for_xp, so it follows the new curve automatically.

-- Fast period scans for the analytics chart and friend rankings.
create index if not exists xp_ledger_created_idx on public.xp_ledger (created_at);

-- Total XP gained per user inside an absolute time window. Used by the
-- leaderboard to rank friends over the selected period. Aggregate XP sums
-- only: same sensitivity as profiles.xp, which every authenticated user can
-- already read. RLS on xp_ledger stays untouched (rows remain owner-only).
create or replace function public.xp_period_sums(p_start timestamptz, p_end timestamptz)
returns table (user_id uuid, user_code text, xp_gained bigint, events bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_start is null or p_end is null or p_start >= p_end
     or p_end - p_start > interval '800 days' then
    raise exception 'Invalid period';
  end if;
  return query
    select l.user_id,
           p.user_code,
           sum(l.amount)::bigint,
           count(*)::bigint
    from public.xp_ledger l
    join public.profiles p on p.id = l.user_id
    where l.created_at >= p_start and l.created_at < p_end
    group by l.user_id, p.user_code;
end;
$$;
grant execute on function public.xp_period_sums(timestamptz, timestamptz) to authenticated;
