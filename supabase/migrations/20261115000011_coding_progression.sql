-- =============================================================================
-- COVA — Coding Lab progression & Coding Mastery (additive).
--
-- Phase 10 of the community/rewards overhaul:
--   * coding_attempts — one row per submitted coding assignment (language,
--     outcome). The client inserts its own rows; RLS keeps them private.
--   * Every attempt feeds the reward engine through a trigger:
--     grant_activity_reward('coding','attempt', NULL, 'attempt:<assignment>',
--     <language>) — Global XP (rule) AND one Skill Trophy in the submission's
--     language, both idempotent per assignment, so re-submitting never farms.
--   * my_coding_mastery() sums the trophy ledger per language and maps it to
--     the 8 mastery tiers (Novice → Mythic, thresholds on trophies).
-- =============================================================================

create table if not exists public.coding_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  language     text not null references public.coding_languages (key) on delete cascade,
  outcome      text not null default 'success' check (outcome in ('success', 'failure')),
  assignment_id uuid references public.assignments (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists coding_attempts_user_idx on public.coding_attempts (user_id, language);
alter table public.coding_attempts enable row level security;
grant select, insert on public.coding_attempts to authenticated;

drop policy if exists "Attempts are private" on public.coding_attempts;
create policy "Attempts are private"
  on public.coding_attempts for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users record own attempts" on public.coding_attempts;
create policy "Users record own attempts"
  on public.coding_attempts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not exists (select 1 from public.me_sanctions())
  );

-- Attribution happens inside the database so the client cannot pick amounts.
create or replace function public.award_on_coding_attempt()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  perform public.grant_activity_reward(
    'coding', 'attempt', null,
    'attempt:' || coalesce(new.assignment_id::text, new.id::text),
    new.language,
    'Coding Lab submission'
  );
  return null;
end;
$$;

drop trigger if exists coding_attempt_award on public.coding_attempts;
create trigger coding_attempt_award
  after insert on public.coding_attempts
  for each row execute function public.award_on_coding_attempt();

------------------------------------------------------------ mastery reader RPC
create or replace function public.my_coding_mastery()
returns table (
  language text,
  attempts integer,
  trophies integer,
  mastery_rank smallint,
  mastery_label text
)
language plpgsql
stable
security definer
set search_path = public as $$
begin
  return query
  with agg as (
    select a.language,
           count(*)::int as attempts,
           coalesce(t.amount, 0)::int as trophies
    from public.coding_attempts a
    left join (
      select l.language, sum(l.amount)::int as amount
      from public.skill_trophy_ledger l
      where l.user_id = (select auth.uid())
      group by l.language
    ) t on t.language = a.language
    where a.user_id = (select auth.uid())
    group by a.language
  )
  select agg.language, agg.attempts, agg.trophies,
    case
      when agg.trophies >= 800 then 8
      when agg.trophies >= 400 then 7
      when agg.trophies >= 200 then 6
      when agg.trophies >= 100 then 5
      when agg.trophies >= 50 then 4
      when agg.trophies >= 25 then 3
      when agg.trophies >= 10 then 2
      else 1
    end::smallint as mastery_rank,
    public.badge_rank_label(
      case
        when agg.trophies >= 800 then 8
        when agg.trophies >= 400 then 7
        when agg.trophies >= 200 then 6
        when agg.trophies >= 100 then 5
        when agg.trophies >= 50 then 4
        when agg.trophies >= 25 then 3
        when agg.trophies >= 10 then 2
        else 1
      end
    ) as mastery_label
  from agg
  order by agg.trophies desc, agg.language;
end;
$$;

revoke all on function public.my_coding_mastery() from public, anon;
grant execute on function public.my_coding_mastery() to authenticated;
