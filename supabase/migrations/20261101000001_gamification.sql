-- Gamification: badge definitions (10 categories, rarity editions), awards,
-- limited editions with atomic recipient numbers, XP ledger, levels, learning
-- streaks, and the server-side achievement engine.
--
-- Everything is server-authoritative: badges/XP are granted only by the SQL
-- engine below (triggers + SECURITY DEFINER functions), never by the client.

---------------------------------------------------------------- definitions

create table if not exists public.badge_definitions (
  key            text primary key,
  base_key       text not null,          -- e.g. 'bookworm' shared by its editions
  category       text not null,
  name           text not null,
  description    text not null default '',
  metric         text not null,          -- engine counter (see badge_metric)
  threshold      integer not null default 1,
  rarity         text not null default 'common'
                 check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  xp_reward      integer not null default 20,
  secret         boolean not null default false,
  limited        boolean not null default false,
  enabled        boolean not null default true,
  available_from timestamptz,            -- eligibility window (special badges)
  available_to   timestamptz,
  sort_order     integer not null default 0
);
create index if not exists badge_definitions_base_idx on public.badge_definitions (base_key);

alter table public.badge_definitions enable row level security;
grant select on public.badge_definitions to authenticated;
create policy "Authenticated read badge definitions"
  on public.badge_definitions for select to authenticated using (true);

------------------------------------------------------------------- awards

create table if not exists public.user_badges (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  badge_key       text not null references public.badge_definitions (key),
  recipient_number integer,             -- limited editions only
  pinned          boolean not null default false, -- showcase (max 3, app-enforced)
  awarded_at      timestamptz not null default now(),
  unique (user_id, badge_key)
);
create index if not exists user_badges_user_idx on public.user_badges (user_id);

alter table public.user_badges enable row level security;
grant select, update (pinned) on public.user_badges to authenticated;

drop policy if exists "Users read own and showcased badges" on public.user_badges;
create policy "Users read own and showcased badges"
  on public.user_badges for select to authenticated
  using (user_id = (select auth.uid()) or pinned);

drop policy if exists "Users pin their own badges" on public.user_badges;
create policy "Users pin their own badges"
  on public.user_badges for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

--------------------------------------------------------------- XP ledger

create table if not exists public.xp_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  event_key  text not null,
  amount     integer not null check (amount > 0),
  reason     text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);
create index if not exists xp_ledger_user_idx on public.xp_ledger (user_id, created_at desc);

alter table public.xp_ledger enable row level security;
grant select on public.xp_ledger to authenticated;
create policy "Users read their XP ledger"
  on public.xp_ledger for select to authenticated
  using (user_id = (select auth.uid()));

-- Single awarding point: the unique event key makes every XP grant idempotent.
create or replace function public.grant_xp(p_user uuid, p_event_key text, p_amount integer, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_amount is null or p_amount <= 0 then return; end if;
  begin
    insert into public.xp_ledger (user_id, event_key, amount, reason)
    values (p_user, p_event_key, p_amount, coalesce(p_reason, ''));
    update public.profiles set xp = coalesce(xp, 0) + p_amount where id = p_user;
  exception when unique_violation then
    return; -- event already rewarded
  end;
end;
$$;
revoke all on function public.grant_xp(uuid, text, integer, text) from public, authenticated, anon;

---------------------------------------------------------- learning streaks

create table if not exists public.learning_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);
alter table public.learning_days enable row level security;
grant select on public.learning_days to authenticated;
create policy "Users read their learning days"
  on public.learning_days for select to authenticated
  using (user_id = (select auth.uid()));

-- Records one genuine learning day (server date, UTC) and returns the current
-- streak: consecutive days ending today or yesterday.
create or replace function public.record_learning_day(p_user uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  streak integer;
begin
  if p_user is null then return 0; end if;
  insert into public.learning_days (user_id, day) values (p_user, (now() at time zone 'utc')::date)
  on conflict (user_id, day) do nothing;

  with recursive days as (
    select (now() at time zone 'utc')::date as day
    union all
    select day - 1 from days
    where exists (select 1 from public.learning_days d where d.user_id = p_user and d.day = (select day from days) - 1)
      and day > (now() at time zone 'utc')::date - 400
  )
  select count(*) into streak from days
  where exists (select 1 from public.learning_days d where d.user_id = p_user and d.day = days.day);
  return coalesce(streak, 0);
end;
$$;
revoke all on function public.record_learning_day(uuid) from public, authenticated, anon;

--------------------------------------------------------------- metrics

create or replace function public.badge_metric(p_user uuid, p_metric text)
returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  result integer := 0;
  profile_row public.profiles%rowtype;
begin
  select * into profile_row from public.profiles where id = p_user;
  case p_metric
    when 'registered' then
      result := case when profile_row.id is not null then 1 else 0 end;
    when 'profile_complete' then
      result := case
        when coalesce(profile_row.display_name, '') <> ''
         and coalesce(profile_row.bio, '') <> ''
         and coalesce(profile_row.headline, '') <> ''
         and coalesce(profile_row.avatar_url, '') is not null
        then 1 else 0 end;
    when 'lessons_done' then
      select count(*) into result from public.lesson_completions where user_id = p_user;
    when 'modules_done' then
      with my_courses as (
        select l.course_id,
               count(distinct l.id) as total,
               count(distinct lc.lesson_id) as done
        from public.lessons l
        left join public.lesson_completions lc on lc.lesson_id = l.id::text and lc.user_id = p_user
        group by l.course_id
      )
      select count(*) into result from my_courses where done >= total and total > 0;
    when 'streak' then
      with recursive days as (
        select (now() at time zone 'utc')::date as day
        union all
        select day - 1 from days
        where exists (select 1 from public.learning_days d where d.user_id = p_user and d.day = (select day from days) - 1)
          and day > (now() at time zone 'utc')::date - 400
      )
      select count(*) into result from days
      where exists (select 1 from public.learning_days d where d.user_id = p_user and d.day = days.day);
    when 'friends' then
      select count(*) into result from public.friendships
      where status = 'accepted' and (from_id = p_user or to_id = p_user);
    when 'challenges_done' then
      select count(*) into result from public.challenge_submissions
      where user_id = p_user and status = 'submitted';
    when 'assessments_done' then
      select (
        (select count(*) from public.challenge_submissions where user_id = p_user and status = 'submitted' and score is not null)
        + (select count(*) from public.assignment_attempts where student_id = p_user and status in ('submitted', 'graded') and score is not null)
        + (select count(*) from public.assignment_submissions where student_id = p_user and grade is not null)
      ) into result;
    when 'perfect_scores' then
      select (
        (select count(*) from public.challenge_submissions s join public.challenges c on c.id = s.challenge_id
          where s.user_id = p_user and s.status = 'submitted' and s.score = c.points)
        + (select count(*) from public.assignment_attempts a join public.assignments m on m.id = a.assignment_id
          where a.student_id = p_user and a.score is not null and a.score = m.points)
        + (select count(*) from public.assignment_submissions s join public.assignments m on m.id = s.assignment_id
          where s.student_id = p_user and s.grade = m.points)
      ) into result;
    when 'high_scores' then
      select (
        (select count(*) from public.challenge_submissions s join public.challenges c on c.id = s.challenge_id
          where s.user_id = p_user and s.status = 'submitted' and s.score >= c.points * 0.9)
        + (select count(*) from public.assignment_attempts a join public.assignments m on m.id = a.assignment_id
          where a.student_id = p_user and a.score is not null and a.score >= m.points * 0.9)
        + (select count(*) from public.assignment_submissions s join public.assignments m on m.id = s.assignment_id
          where s.student_id = p_user and s.grade >= m.points * 0.9)
      ) into result;
    when 'code_done' then
      select (
        (select count(*) from public.challenge_submissions s join public.challenges c on c.id = s.challenge_id
          where s.user_id = p_user and s.status = 'submitted' and c.exercise_type = 'coding')
        + (select count(*) from public.assignment_attempts a join public.assignments m on m.id = a.assignment_id
          where a.student_id = p_user and a.status in ('submitted', 'graded') and m.kind = 'coding')
      ) into result;
    when 'badges_count' then
      select count(*) into result from public.user_badges where user_id = p_user;
    else
      result := 0;
  end case;
  return result;
end;
$$;
revoke all on function public.badge_metric(uuid, text) from public, authenticated, anon;

----------------------------------------------------------- award engine

-- Evaluates every enabled definition for this user and awards newly reached
-- editions. Idempotent: the unique (user, badge) constraint prevents doubles.
create or replace function public.evaluate_badges(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.badge_definitions%rowtype;
  metric_value integer;
  edition_number integer;
  edition_rarity text;
begin
  if p_user is null then return; end if;

  for d in
    select * from public.badge_definitions
    where enabled
      and (available_from is null or now() >= available_from)
      and (available_to is null or now() <= available_to)
    order by sort_order
  loop
    if exists (select 1 from public.user_badges where user_id = p_user and badge_key = d.key) then
      continue;
    end if;

    metric_value := public.badge_metric(p_user, d.metric);
    if metric_value < d.threshold then
      continue;
    end if;

    if d.limited then
      -- Atomic recipient number: lock the badge, then take the next slot.
      perform pg_advisory_xact_lock(hashtext('limited:' || d.key));
      select count(*) + 1 into edition_number from public.user_badges where badge_key = d.key;
      edition_rarity := case
        when edition_number <= 100 then 'legendary'
        when edition_number <= 1000 then 'epic'
        when edition_number <= 10000 then 'rare'
        when edition_number <= 50000 then 'uncommon'
        else 'common'
      end;
      if edition_number > 100000 then
        continue; -- editions exhausted
      end if;
      insert into public.user_badges (user_id, badge_key, recipient_number)
      values (p_user, d.key, edition_number);
    else
      insert into public.user_badges (user_id, badge_key) values (p_user, d.key);
      edition_rarity := d.rarity;
    end if;
  end loop;
end;
$$;
revoke all on function public.evaluate_badges(uuid) from public, authenticated, anon;

-- Awarding side-effects: badge XP (once) + achievement notification.
create or replace function public.on_user_badge_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d public.badge_definitions%rowtype;
  number_suffix text;
begin
  select * into d from public.badge_definitions where key = new.badge_key;
  perform public.grant_xp(new.user_id, 'badge:' || new.badge_key, d.xp_reward,
    'Badge: ' || d.name || coalesce(' (#' || new.recipient_number::text || ')', ''));
  number_suffix := case when new.recipient_number is not null then ' #' || new.recipient_number::text else '' end;
  perform public.notify(new.user_id, 'badge_unlocked', new.user_id, '/leaderboard?tab=badges',
    d.name || number_suffix, d.xp_reward::text);
  return null;
end;
$$;

drop trigger if exists user_badge_awarded on public.user_badges;
create trigger user_badge_awarded
after insert on public.user_badges
for each row execute function public.on_user_badge_insert();

--------------------------------------------------------------- levels

-- Level thresholds from the COVA gamification spec.
create or replace function public.level_for_xp(p_xp numeric)
returns table (level integer, name text)
language sql stable set search_path = public as $$
  select lvl.level, lvl.name
  from (values
    (1, 'Beginner', 0),
    (2, 'Explorer', 100),
    (3, 'Learner', 300),
    (4, 'Achiever', 700),
    (5, 'Scholar', 1500),
    (6, 'Expert', 3000),
    (7, 'Master', 6000),
    (8, 'Legend', 10000)
  ) as lvl(level, name, min_xp)
  where p_xp >= lvl.min_xp
  order by lvl.level desc
  limit 1
$$;

-- Level-up notification whenever profiles.xp crosses a threshold (any XP source).
create or replace function public.on_profile_xp_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_level integer;
  new_level integer;
  new_name text;
begin
  select level into old_level from public.level_for_xp(coalesce(old.xp, 0));
  select level, name into new_level, new_name from public.level_for_xp(coalesce(new.xp, 0));
  if coalesce(new_level, 1) > coalesce(old_level, 1) then
    perform public.notify(new.id, 'level_up', new.id, '/leaderboard',
      new_name, new_level::text);
  end if;
  return null;
end;
$$;

drop trigger if exists profile_level_up on public.profiles;
create trigger profile_level_up
after update of xp on public.profiles
for each row execute function public.on_profile_xp_change();

------------------------------------------------------------- event hooks

-- Lesson completion = a learning day + badge evaluation.
create or replace function public.on_lesson_completion_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.record_learning_day(new.user_id);
  perform public.evaluate_badges(new.user_id);
  return null;
end;
$$;
drop trigger if exists lesson_completion_gamify on public.lesson_completions;
do $$
begin
  if to_regclass('public.lesson_completions') is not null then
    create trigger lesson_completion_gamify
    after insert on public.lesson_completions
    for each row execute function public.on_lesson_completion_insert();
  end if;
end $$;

-- Challenge submission = learning day + badge evaluation.
create or replace function public.on_challenge_submission_write()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    perform public.record_learning_day(new.user_id);
    perform public.evaluate_badges(new.user_id);
  end if;
  return null;
end;
$$;
drop trigger if exists challenge_submission_gamify on public.challenge_submissions;
do $$
begin
  if to_regclass('public.challenge_submissions') is not null then
    create trigger challenge_submission_gamify
    after insert or update on public.challenge_submissions
    for each row execute function public.on_challenge_submission_write();
  end if;
end $$;

-- Assignment attempt submission = learning day + badge evaluation.
create or replace function public.on_attempt_write()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('submitted', 'graded') and (tg_op = 'INSERT' or old.status not in ('submitted', 'graded')) then
    perform public.record_learning_day(new.student_id);
    perform public.evaluate_badges(new.student_id);
  end if;
  return null;
end;
$$;
drop trigger if exists assignment_attempt_gamify on public.assignment_attempts;
do $$
begin
  if to_regclass('public.assignment_attempts') is not null then
    create trigger assignment_attempt_gamify
    after insert or update on public.assignment_attempts
    for each row execute function public.on_attempt_write();
  end if;
end $$;

-- Accepted friendship (both directions) = social badge evaluation.
create or replace function public.on_friendship_accept()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status <> 'accepted') then
    perform public.evaluate_badges(new.from_id);
    perform public.evaluate_badges(new.to_id);
  end if;
  return null;
end;
$$;
do $$
begin
  if to_regclass('public.friendships') is not null then
    drop trigger if exists friendship_gamify on public.friendships;
    create trigger friendship_gamify
    after insert or update on public.friendships
    for each row execute function public.on_friendship_accept();
  end if;
end $$;

-- Profile completion (bio, headline, photo, domain) = badge evaluation.
create or replace function public.on_profile_content_update()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.bio is distinct from old.bio or new.headline is distinct from old.headline
     or new.avatar_url is distinct from old.avatar_url then
    perform public.evaluate_badges(new.id);
  end if;
  return null;
end;
$$;
do $$
begin
  if to_regclass('public.profiles') is not null then
    drop trigger if exists profile_content_gamify on public.profiles;
    create trigger profile_content_gamify
    after update of bio, headline, avatar_url on public.profiles
    for each row execute function public.on_profile_content_update();
  end if;
end $$;

-- Account anniversary: a daily job awards the membership-year badge.
create or replace function public.anniversary_badge_check()
returns void
language plpgsql security definer set search_path = public as $$
declare
  p record;
  years int;
begin
  for p in
    select id, created_at from public.profiles
    where is_sample is not true
      and (
        (date_part('month', created_at at time zone 'utc'), date_part('day', created_at at time zone 'utc'))
        = (date_part('month', now() at time zone 'utc'), date_part('day', now() at time zone 'utc'))
      )
      and (created_at at time zone 'utc') < now() - interval '1 year'
  loop
    years := floor(extract(epoch from (now() - p.created_at)) / (365.25 * 86400))::int;
    insert into public.user_badges (user_id, badge_key)
    select p.id, 'member-year-' || years
    where exists (select 1 from public.badge_definitions where key = 'member-year-' || years and enabled)
    on conflict (user_id, badge_key) do nothing;
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if not exists (select 1 from cron.job where jobname = 'cova-anniversary-badges') then
        perform cron.schedule('cova-anniversary-badges', '5 3 * * *', 'select public.anniversary_badge_check()');
      end if;
    exception when others then
      raise notice 'pg_cron unavailable (%): schedule anniversary checks manually', sqlerrm;
    end;
  end if;
end $$;

---------------------------------------------------------- badge comparison RPC

-- Aggregate comparison against an accepted friend only. Aggregates respect the
-- friend's privacy: nothing individual is exposed, only counts.
create or replace function public.badge_compare(p_friend_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  friend uuid;
  friend_public text;
  result jsonb;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  select id into friend from public.profiles where user_code = p_friend_code;
  if friend is null then raise exception 'Friend not found'; end if;
  if not exists (
    select 1 from public.friendships
    where status = 'accepted' and ((from_id = me and to_id = friend) or (from_id = friend and to_id = me))
  ) then
    raise exception 'You can only compare with accepted friends';
  end if;

  select user_code into friend_public from public.profiles where id = friend;

  result := jsonb_build_object(
    'me', jsonb_build_object(
      'badges', (select count(*) from public.user_badges where user_id = me),
      'xp', (select coalesce(xp, 0) from public.profiles where id = me),
      'common', (select count(*) from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key where ub.user_id = me and d.rarity = 'common'),
      'uncommon', (select count(*) from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key where ub.user_id = me and d.rarity = 'uncommon'),
      'rare', (select count(*) from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key where ub.user_id = me and d.rarity = 'rare'),
      'epic', (select count(*) from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key where ub.user_id = me and d.rarity = 'epic'),
      'legendary', (select count(*) from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key where ub.user_id = me and d.rarity = 'legendary')
    ),
    'friend', jsonb_build_object(
      'code', friend_public,
      'badges', (select count(*) from public.user_badges where user_id = friend),
      'xp', (select coalesce(xp, 0) from public.profiles where id = friend),
      'common', (select count(*) from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key where ub.user_id = friend and d.rarity = 'common'),
      'uncommon', (select count(*) from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key where ub.user_id = friend and d.rarity = 'uncommon'),
      'rare', (select count(*) from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key where ub.user_id = friend and d.rarity = 'rare'),
      'epic', (select count(*) from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key where ub.user_id = friend and d.rarity = 'epic'),
      'legendary', (select count(*) from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key where ub.user_id = friend and d.rarity = 'legendary')
    ),
    'shared', (select count(*) from public.user_badges mine join public.user_badges theirs
               on mine.badge_key = theirs.badge_key
               where mine.user_id = me and theirs.user_id = friend)
  );
  return result;
end;
$$;
grant execute on function public.badge_compare(text) to authenticated;

-- Own metrics snapshot for progress bars.
create or replace function public.my_badge_metrics()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'registered', public.badge_metric(uid, 'registered'),
    'profile_complete', public.badge_metric(uid, 'profile_complete'),
    'lessons_done', public.badge_metric(uid, 'lessons_done'),
    'modules_done', public.badge_metric(uid, 'modules_done'),
    'streak', public.badge_metric(uid, 'streak'),
    'friends', public.badge_metric(uid, 'friends'),
    'challenges_done', public.badge_metric(uid, 'challenges_done'),
    'assessments_done', public.badge_metric(uid, 'assessments_done'),
    'perfect_scores', public.badge_metric(uid, 'perfect_scores'),
    'high_scores', public.badge_metric(uid, 'high_scores'),
    'code_done', public.badge_metric(uid, 'code_done'),
    'badges_count', public.badge_metric(uid, 'badges_count')
  );
end;
$$;
grant execute on function public.my_badge_metrics() to authenticated;

------------------------------------------------------------- seed definitions

insert into public.badge_definitions
  (key, base_key, category, name, description, metric, threshold, rarity, xp_reward, secret, limited, sort_order)
values
  -- 1. Getting started
  ('first-step', 'first-step', 'getting-started', 'First Step', 'Create a COVA account.', 'registered', 1, 'common', 20, false, false, 1),
  ('welcome-aboard', 'welcome-aboard', 'getting-started', 'Welcome Aboard', 'Complete your profile: photo, title, bio and field of study.', 'profile_complete', 1, 'uncommon', 50, false, false, 2),
  ('first-lesson', 'first-lesson', 'getting-started', 'First Lesson', 'Complete your first lesson.', 'lessons_done', 1, 'common', 20, false, false, 3),
  -- 2. Learning & progress (progressive editions)
  ('quick-learner', 'lessons-count', 'learning', 'Quick Learner', 'Complete 5 lessons.', 'lessons_done', 5, 'common', 20, false, false, 10),
  ('bookworm', 'lessons-count', 'learning', 'Bookworm', 'Complete 10 lessons.', 'lessons_done', 10, 'common', 20, false, false, 11),
  ('bookworm-unc', 'lessons-count', 'learning', 'Bookworm · Silver', 'Complete 25 lessons.', 'lessons_done', 25, 'uncommon', 50, false, false, 12),
  ('bookworm-rare', 'lessons-count', 'learning', 'Bookworm · Gold', 'Complete 50 lessons.', 'lessons_done', 50, 'rare', 100, false, false, 13),
  ('bookworm-epic', 'lessons-count', 'learning', 'Bookworm · Platinum', 'Complete 100 lessons.', 'lessons_done', 100, 'epic', 250, false, false, 14),
  ('bookworm-leg', 'lessons-count', 'learning', 'Bookworm · Legendary', 'Complete 250 lessons.', 'lessons_done', 250, 'legendary', 500, false, false, 15),
  ('scholar', 'lessons-count', 'learning', 'Scholar', 'Complete 25 lessons.', 'lessons_done', 25, 'rare', 100, false, false, 16),
  ('master-student', 'lessons-count', 'learning', 'Master Student', 'Complete 50 lessons.', 'lessons_done', 50, 'epic', 250, false, false, 17),
  ('course-finisher', 'modules_done', 'learning', 'Course Finisher', 'Complete every lesson of one module.', 'modules_done', 1, 'uncommon', 50, false, false, 18),
  ('knowledge-master', 'modules_done', 'learning', 'Knowledge Master', 'Complete all lessons of 5 modules.', 'modules_done', 5, 'epic', 250, false, false, 19),
  -- 3. Consistency & streaks (progressive)
  ('first-streak', 'streak', 'consistency', 'First Streak', 'Study 2 days in a row.', 'streak', 2, 'common', 20, false, false, 20),
  ('consistent', 'streak', 'consistency', 'Consistent', 'Study 3 days in a row.', 'streak', 3, 'common', 20, false, false, 21),
  ('on-fire', 'streak', 'consistency', 'On Fire', 'Study 7 days in a row.', 'streak', 7, 'uncommon', 50, false, false, 22),
  ('on-fire-rare', 'streak', 'consistency', 'On Fire · Gold', 'Reach a 30-day streak.', 'streak', 30, 'rare', 100, false, false, 23),
  ('on-fire-epic', 'streak', 'consistency', 'On Fire · Platinum', 'Reach a 60-day streak.', 'streak', 60, 'epic', 250, false, false, 24),
  ('on-fire-leg', 'streak', 'consistency', 'On Fire · Legendary', 'Reach a 100-day streak.', 'streak', 100, 'legendary', 500, false, false, 25),
  ('unstoppable', 'streak', 'consistency', 'Unstoppable', 'Study 14 days in a row.', 'streak', 14, 'rare', 100, false, false, 26),
  ('iron-discipline', 'streak', 'consistency', 'Iron Discipline', 'Study 30 days in a row.', 'streak', 30, 'epic', 250, false, false, 27),
  ('legendary-routine', 'streak', 'consistency', 'Legendary Routine', 'Study 100 days in a row.', 'streak', 100, 'legendary', 500, false, false, 28),
  -- 4. Excellence & performance
  ('first-perfect', 'perfect_scores', 'excellence', 'First Perfect Score', 'Score 100% on one activity.', 'perfect_scores', 1, 'uncommon', 50, false, false, 30),
  ('perfectionist', 'perfect_scores', 'excellence', 'Perfectionist', 'Score 100% on 5 activities.', 'perfect_scores', 5, 'rare', 100, false, false, 31),
  ('high-achiever', 'high_scores', 'excellence', 'High Achiever', 'Score at least 90% on 5 activities.', 'high_scores', 5, 'uncommon', 50, false, false, 32),
  ('exam-champion', 'assessments_done', 'excellence', 'Exam Champion', 'Finish 10 validated assessments.', 'assessments_done', 10, 'rare', 100, false, false, 33),
  -- 5. Challenges & quests
  ('challenger', 'challenges_done', 'challenges', 'Challenger', 'Submit your first challenge.', 'challenges_done', 1, 'common', 20, false, false, 40),
  ('challenge-accepted', 'challenges_done', 'challenges', 'Challenge Accepted', 'Complete 5 challenges.', 'challenges_done', 5, 'uncommon', 50, false, false, 41),
  ('quest-hunter', 'challenges_done', 'challenges', 'Quest Hunter', 'Complete 10 challenges.', 'challenges_done', 10, 'rare', 100, false, false, 42),
  ('challenge-master', 'challenges_done', 'challenges', 'Challenge Master', 'Complete 25 challenges.', 'challenges_done', 25, 'epic', 250, false, false, 43),
  -- 6. Community & social
  ('social-starter', 'friends', 'community', 'Social Starter', 'Add your first friend.', 'friends', 1, 'common', 20, false, false, 50),
  ('connector', 'friends', 'community', 'Connector', 'Have 10 accepted friends.', 'friends', 10, 'uncommon', 50, false, false, 51),
  -- 8. Creativity & coding
  ('code-explorer', 'code_done', 'coding', 'Code Explorer', 'Submit 5 coding exercises.', 'code_done', 5, 'uncommon', 50, false, false, 60),
  ('developer', 'code_done', 'coding', 'Developer', 'Submit 20 coding exercises.', 'code_done', 20, 'rare', 100, false, false, 61),
  ('code-master', 'code_done', 'coding', 'Code Master', 'Submit 50 coding exercises.', 'code_done', 50, 'epic', 250, false, false, 62),
  -- 10. Special & rare
  ('early-adopter', 'early-adopter', 'special', 'Early Adopter', 'Join COVA during the early-adopter window. Numbered limited edition.', 'registered', 1, 'legendary', 500, false, true, 70),
  ('founding-member', 'founding-member', 'special', 'Founding Member', 'Join COVA during the official launch period. Numbered limited edition.', 'registered', 1, 'legendary', 500, false, true, 71),
  ('legendary-member', 'legendary-member', 'special', 'Legendary Member', 'Collect 50 distinct badges.', 'badges_count', 50, 'legendary', 500, false, false, 72),
  ('night-owl', 'night-owl', 'special', 'Night Owl', 'A secret badge for those who discover it.', 'lessons_done', 3, 'rare', 100, true, false, 80),
  -- Annual membership badges (awarded by the cron on each anniversary)
  ('member-year-1', 'member-year', 'special', 'COVA Member · Year 1', 'One year of membership.', 'registered', 1, 'common', 50, false, false, 90),
  ('member-year-2', 'member-year', 'special', 'COVA Member · Year 2', 'Two years of membership.', 'registered', 1, 'uncommon', 50, false, false, 91),
  ('member-year-3', 'member-year', 'special', 'COVA Member · Year 3', 'Three years of membership.', 'registered', 1, 'rare', 100, false, false, 92),
  ('member-year-4', 'member-year', 'special', 'COVA Member · Year 4', 'Four years of membership.', 'registered', 1, 'epic', 250, false, false, 93),
  ('member-year-5', 'member-year', 'special', 'COVA Member · Year 5+', 'Five or more years of membership.', 'registered', 1, 'legendary', 500, false, false, 94)
on conflict (key) do nothing;

-- Limited editions stay dormant until an administrator opens the window:
update public.badge_definitions
set available_from = null, available_to = null
where key in ('early-adopter', 'founding-member');

-- Evaluate the real counters for existing users once (First Step, lessons,
-- friends...). Special limited editions stay dormant (no eligibility window).
do $$
declare
  u record;
begin
  for u in select id from public.profiles where is_sample is not true loop
    perform public.evaluate_badges(u.id);
  end loop;
end $$;

-- The new notification kinds respect the Challenges/XP preference.
create or replace function public.notifications_enabled_for(p_user uuid, p_kind text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  allowed boolean;
begin
  if p_user is null then return false; end if;
  select case p_kind
    when 'new_message' then notify_messages
    when 'friend_request' then notify_friend_requests
    when 'friend_accepted' then notify_friend_requests
    when 'join_request' then notify_communities
    when 'join_request_approved' then notify_communities
    when 'join_request_denied' then notify_communities
    when 'member_joined' then notify_communities
    when 'member_removed' then notify_communities
    when 'role_changed' then notify_communities
    when 'assignment_created' then notify_assignments
    when 'assignment_graded' then notify_assignments
    when 'attempt_submitted' then notify_assignments
    when 'resource_added' then notify_courses
    when 'deadline_reminder' then notify_deadlines
    when 'xp_earned' then notify_challenges
    when 'badge_unlocked' then notify_challenges
    when 'level_up' then notify_challenges
    else true
  end
  into allowed
  from public.user_settings
  where user_id = p_user;
  return coalesce(allowed, true);
end;
$$;
revoke all on function public.notifications_enabled_for(uuid, text) from public, authenticated, anon;
