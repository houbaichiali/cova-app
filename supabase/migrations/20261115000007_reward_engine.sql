-- =============================================================================
-- COVA — Reward Rules engine (additive, non-destructive).
--
-- Phase 5 of the community/rewards overhaul. This is the single source of
-- truth for activity rewards:
--   * reward_rules — admin-configurable (category, activity, difficulty) ->
--     (global_xp, skill_trophy, active). SELECT is open to authenticated
--     members so the UI can display what an activity earns; WRITES go through
--     admin_rules_save (Admin Center permission gamification.rules.manage).
--   * grant_activity_reward() — the only attribution path new code may use:
--     server-side, atomic, idempotent per activity instance (p_ref), routing
--     Global XP through grant_xp/xp_ledger and Skill Trophies through
--     skill_trophy_ledger.
--   * coding_languages — the 13 Coding Lab languages as a governed registry
--     (client-side hardcoding becomes a display detail, not the source of
--     truth).
--   * skill_trophy_ledger — per-language trophy history; my_skill_trophies()
--     sums it per language for Coding Mastery.
--
-- History preservation: nothing here rewrites xp_ledger, profiles.xp or
-- user_badges. Old event keys keep working; the engine only adds new keys
-- prefixed rule: / trophy:.
-- =============================================================================

--------------------------------------------------------------- coding languages
create table if not exists public.coding_languages (
  key        text primary key,
  label      text not null,
  active     boolean not null default true,
  sort_order integer not null default 0
);
alter table public.coding_languages enable row level security;
grant select on public.coding_languages to authenticated;
drop policy if exists "Languages are public" on public.coding_languages;
create policy "Languages are public"
  on public.coding_languages for select to authenticated
  using (true);

insert into public.coding_languages (key, label, sort_order) values
  ('python', 'Python', 1),
  ('javascript', 'JavaScript', 2),
  ('typescript', 'TypeScript', 3),
  ('html', 'HTML', 4),
  ('css', 'CSS', 5),
  ('c', 'C', 6),
  ('cpp', 'C++', 7),
  ('java', 'Java', 8),
  ('csharp', 'C#', 9),
  ('php', 'PHP', 10),
  ('go', 'Go', 11),
  ('rust', 'Rust', 12),
  ('sql', 'SQL', 13)
on conflict (key) do nothing;

------------------------------------------------------------------ reward rules
create table if not exists public.reward_rules (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in
               ('lessons', 'modules', 'challenges', 'assignments', 'quiz', 'coding', 'qa', 'community', 'misc')),
  activity     text not null,
  difficulty   text not null default 'standard'
               check (difficulty in ('standard', 'easy', 'medium', 'hard')),
  global_xp    integer not null default 0 check (global_xp between 0 and 10000),
  skill_trophy integer not null default 0 check (skill_trophy between 0 and 1000),
  active       boolean not null default true,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (category, activity, difficulty)
);
alter table public.reward_rules enable row level security;
grant select on public.reward_rules to authenticated;
drop policy if exists "Rules are readable" on public.reward_rules;
create policy "Rules are readable"
  on public.reward_rules for select to authenticated
  using (true);

-- Defaults mirror today's behaviour; the Admin Center tunes them in Phase 7.
insert into public.reward_rules (category, activity, difficulty, global_xp, skill_trophy) values
  ('challenges', 'submit', 'easy', 50, 0),
  ('challenges', 'submit', 'medium', 100, 0),
  ('challenges', 'submit', 'hard', 200, 0),
  ('quiz', 'complete', 'standard', 20, 0),
  ('assignments', 'submit', 'standard', 25, 0),
  ('lessons', 'complete', 'standard', 10, 0),
  ('modules', 'complete', 'standard', 50, 0),
  ('coding', 'attempt', 'standard', 5, 1),
  ('qa', 'answer', 'standard', 5, 0)
on conflict (category, activity, difficulty) do nothing;

-- Change history for the Admin Center (who changed what, when).
create table if not exists public.reward_rule_history (
  id         uuid primary key default gen_random_uuid(),
  rule_id    uuid references public.reward_rules (id) on delete cascade,
  changed_by uuid references auth.users (id) on delete set null,
  changes    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.reward_rule_history enable row level security;

------------------------------------------------------------- skill trophies
create table if not exists public.skill_trophy_ledger (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  language  text not null references public.coding_languages (key) on delete cascade,
  event_key text not null,
  amount    integer not null check (amount > 0),
  reason    text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);
create index if not exists skill_trophy_user_idx on public.skill_trophy_ledger (user_id, language);
alter table public.skill_trophy_ledger enable row level security;
grant select on public.skill_trophy_ledger to authenticated;
drop policy if exists "Trophies are private" on public.skill_trophy_ledger;
create policy "Trophies are private"
  on public.skill_trophy_ledger for select to authenticated
  using (user_id = (select auth.uid()));

------------------------------------------------------------ attribution engine
-- ONE attribution path for every future reward: server-side, atomic and
-- idempotent per activity instance (p_ref). Global XP flows through
-- grant_xp (xp_ledger); skill trophies through skill_trophy_ledger. Returns
-- what was actually granted (0/0 when no active rule covers the activity or
-- the reward was already paid).
create or replace function public.grant_activity_reward(
  p_category text,
  p_activity text,
  p_difficulty text default null,
  p_ref text default '',
  p_language text default null,
  p_reason text default ''
)
returns table (awarded_global_xp integer, awarded_skill_trophy integer)
language plpgsql
security definer
set search_path = public as $$
declare
  v_user uuid := (select auth.uid());
  v_rule public.reward_rules%rowtype;
  v_event_key text;
  v_trophy int := 0;
  v_xp int := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_rule
    from public.reward_rules r
    where r.category = p_category
      and r.activity = p_activity
      and r.active
      and (
        (p_difficulty is not null and r.difficulty = p_difficulty)
        or (p_difficulty is null and r.difficulty = 'standard')
      )
    order by case when r.difficulty = coalesce(p_difficulty, 'standard') then 0 else 1 end
    limit 1;

  if not found then
    -- fall back to the standard rule when the specific difficulty has none
    select * into v_rule
      from public.reward_rules r
      where r.category = p_category
        and r.activity = p_activity
        and r.difficulty = 'standard'
        and r.active
      limit 1;
  end if;

  if not found then
    return query select 0, 0;
    return;
  end if;

  v_event_key := 'rule:' || p_category || ':' || p_activity || ':' ||
                 coalesce(p_difficulty, 'standard') || ':' || coalesce(p_ref, '');

  if v_rule.global_xp > 0
    and not exists (
      select 1 from public.xp_ledger l
      where l.user_id = v_user and l.event_key = v_event_key
    )
  then
    perform public.grant_xp(v_user, v_event_key, v_rule.global_xp,
      coalesce(nullif(p_reason, ''), p_category || '.' || p_activity));
    v_xp := v_rule.global_xp;
  end if;

  if v_rule.skill_trophy > 0 and p_language is not null then
    insert into public.skill_trophy_ledger (user_id, language, event_key, amount, reason)
    values (v_user, p_language, v_event_key, v_rule.skill_trophy, p_reason)
    on conflict (user_id, event_key) do nothing;
    if found then v_trophy := v_rule.skill_trophy; end if;
  end if;

  return query select v_xp, v_trophy;
end;
$$;

revoke all on function public.grant_activity_reward(text, text, text, text, text, text)
  from public, anon, authenticated;

-- Per-language trophy sums for Coding Mastery (Phase 10).
create or replace function public.my_skill_trophies()
returns table (language text, trophies integer)
language sql
stable
security definer
set search_path = public as $$
  select l.language, coalesce(sum(l.amount), 0)::integer as trophies
  from public.skill_trophy_ledger l
  where l.user_id = (select auth.uid())
  group by l.language
  order by trophies desc
$$;

revoke all on function public.my_skill_trophies() from public, anon;
grant execute on function public.my_skill_trophies() to authenticated;

------------------------------------------------------------- admin rule editing
-- New Admin Center permission, granted to the 'admin' role like every other
-- permission seed (admin_foundation.sql:72).
insert into public.admin_permissions (key, module, label) values
  ('gamification.rules.manage', 'gamification', 'Reward rules configuration')
on conflict (key) do nothing;

insert into public.admin_role_permissions (role_key, permission_key)
  select 'admin', 'gamification.rules.manage'
  where exists (select 1 from public.admin_permissions where key = 'gamification.rules.manage')
on conflict (role_key, permission_key) do nothing;

create or replace function public.admin_rules_list()
returns table (
  id uuid, category text, activity text, difficulty text,
  global_xp integer, skill_trophy integer, active boolean, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public as $$
  select id, category, activity, difficulty, global_xp, skill_trophy, active, updated_at
  from public.reward_rules
  order by category, activity, difficulty
$$;

revoke all on function public.admin_rules_list() from public, anon;
grant execute on function public.admin_rules_list() to authenticated;

create or replace function public.admin_rules_save(
  p_category text,
  p_activity text,
  p_difficulty text,
  p_global_xp integer,
  p_skill_trophy integer,
  p_active boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_old public.reward_rules%rowtype;
begin
  if not public.is_admin_user('gamification.rules.manage') then
    raise exception 'Missing permission: gamification.rules.manage';
  end if;
  if p_category not in ('lessons','modules','challenges','assignments','quiz','coding','qa','community','misc') then
    raise exception 'Unknown reward category';
  end if;
  if p_difficulty not in ('standard','easy','medium','hard') then
    raise exception 'Unknown difficulty';
  end if;
  if p_global_xp is null or p_global_xp < 0 or p_global_xp > 10000 then
    raise exception 'global_xp must be between 0 and 10000';
  end if;
  if p_skill_trophy is null or p_skill_trophy < 0 or p_skill_trophy > 1000 then
    raise exception 'skill_trophy must be between 0 and 1000';
  end if;

  select * into v_old from public.reward_rules
    where category = p_category and activity = p_activity and difficulty = p_difficulty;

  insert into public.reward_rules
    (category, activity, difficulty, global_xp, skill_trophy, active, updated_by, updated_at)
  values
    (p_category, p_activity, p_difficulty, p_global_xp, p_skill_trophy, p_active, v_actor, now())
  on conflict (category, activity, difficulty) do update
    set global_xp = excluded.global_xp,
        skill_trophy = excluded.skill_trophy,
        active = excluded.active,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
  returning id into v_id;

  insert into public.reward_rule_history (rule_id, changed_by, changes)
  values (
    v_id, v_actor,
    jsonb_build_object(
      'global_xp', coalesce(v_old.global_xp, -1),
      'skill_trophy', coalesce(v_old.skill_trophy, -1),
      'active', coalesce(v_old.active, null),
      'new_global_xp', p_global_xp,
      'new_skill_trophy', p_skill_trophy,
      'new_active', p_active
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_rules_save(text, text, text, integer, integer, boolean)
  from public, anon;
grant execute on function public.admin_rules_save(text, text, text, integer, integer, boolean)
  to authenticated;
