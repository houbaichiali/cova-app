-- COVA ADMIN CENTER — Phase 5: badge and XP management.
-- Non-destructive: one additive column on badge_definitions, one additive
-- storage bucket, one constraint WIDENING on xp_ledger (admin adjustments may
-- be negative; student-facing grants keep the amount > 0 rule). Nothing is
-- deleted; existing badges, awards and XP history keep working untouched.
--
-- XP integrity rules preserved:
--  * profiles.xp stays non-writable by clients (column grants unchanged).
--  * every adjustment goes through admin_xp_adjust (security definer,
--    gamification.xp.adjust permission, mandatory reason, mandatory
--    idempotency key, audit log, ledger row with event_key 'admin:<key>').
--  * the level curve itself is CODE (level-curve.ts + level_for_xp SQL) and is
--    deliberately NOT configurable from this module: changing it requires a
--    reviewed migration, not a button.

------------------------------------------------------------------ badge image

alter table public.badge_definitions
  add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('badge-images', 'badge-images', true, 1048576,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

-- Public read (badges are showcase items), admin-only write.
drop policy if exists "Badge images are public" on storage.objects;
create policy "Badge images are public"
  on storage.objects for select to authenticated
  using (bucket_id = 'badge-images');

drop policy if exists "Admins manage badge images" on storage.objects;
create policy "Admins manage badge images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'badge-images' and public.is_admin_user('gamification.badges.manage'));

drop policy if exists "Admins update badge images" on storage.objects;
create policy "Admins update badge images"
  on storage.objects for update to authenticated
  using (bucket_id = 'badge-images' and public.is_admin_user('gamification.badges.manage'));

drop policy if exists "Admins delete badge images" on storage.objects;
create policy "Admins delete badge images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'badge-images' and public.is_admin_user('gamification.badges.manage'));

--------------------------------------------------- xp_ledger: admin negatives

-- Widen the amount check so ADMIN correction rows (event_key like 'admin:%')
-- can be negative. Student-facing grants keep the strict amount > 0 rule.
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'xp_ledger' and c.conname = 'xp_ledger_amount_check'
  ) then
    alter table public.xp_ledger drop constraint xp_ledger_amount_check;
  end if;
  alter table public.xp_ledger
    add constraint xp_ledger_amount_check
    check (amount > 0 or event_key like 'admin:%');
end $$;

------------------------------------------------------------------- badge RPCs

create or replace function public.admin_badges_list()
returns table (
  key text, base_key text, category text, name text, description text,
  metric text, threshold integer, rarity text, xp_reward integer,
  secret boolean, limited boolean, enabled boolean, sort_order integer,
  image_url text, unlocked_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user('gamification.badges.manage') then
    raise exception 'Missing permission: gamification.badges.manage';
  end if;
  return query
  select d.key, d.base_key, d.category, d.name, d.description,
         d.metric, d.threshold, d.rarity, d.xp_reward,
         d.secret, d.limited, d.enabled, d.sort_order, d.image_url,
         (select count(*) from public.user_badges ub where ub.badge_key = d.key)
  from public.badge_definitions d
  order by d.sort_order, d.key
  limit 500;
end;
$$;

-- Create or update a badge definition. Keys are immutable and badges are never
-- deleted (disable instead) so existing user_badges rows always stay valid.
create or replace function public.admin_badge_save(
  p_key text, p_name text, p_description text default '', p_category text default 'learning',
  p_metric text default 'registered', p_threshold integer default 1,
  p_rarity text default 'common', p_xp_reward integer default 20,
  p_secret boolean default false, p_limited boolean default false,
  p_enabled boolean default true, p_sort_order integer default 0,
  p_image_url text default null
)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.badge_definitions%rowtype;
begin
  if not public.is_admin_user('gamification.badges.manage') then
    raise exception 'Missing permission: gamification.badges.manage';
  end if;
  p_key := lower(btrim(p_key));
  if p_key is null or p_key !~ '^[a-z0-9_-]{2,60}$' then
    raise exception 'Badge key must be 2-60 chars: a-z 0-9 _ -';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'Name is required';
  end if;
  if p_metric not in ('registered','profile_complete','lessons_done','modules_done',
                      'streak','friends','challenges_done','assessments_done',
                      'perfect_scores','high_scores','code_done','badges_count') then
    raise exception 'Unknown metric';
  end if;
  if p_threshold is null or p_threshold < 1 then
    raise exception 'Threshold must be >= 1';
  end if;

  select * into v_existing from public.badge_definitions where key = p_key;
  if found then
    update public.badge_definitions set
      name = btrim(p_name),
      description = coalesce(btrim(p_description), ''),
      category = coalesce(p_category, v_existing.category),
      metric = p_metric,
      threshold = p_threshold,
      rarity = coalesce(p_rarity, v_existing.rarity),
      xp_reward = p_xp_reward,
      secret = p_secret,
      limited = p_limited,
      enabled = p_enabled,
      sort_order = p_sort_order,
      image_url = coalesce(p_image_url, v_existing.image_url)
    where key = p_key;
    perform public.admin_audit('gamification.badge_update', 'badge', p_key,
      v_existing.name || ' -> ' || btrim(p_name),
      jsonb_build_object('metric', p_metric, 'threshold', p_threshold, 'enabled', p_enabled));
    return p_key;
  end if;

  insert into public.badge_definitions
    (key, base_key, category, name, description, metric, threshold, rarity,
     xp_reward, secret, limited, enabled, sort_order, image_url)
  values
    (p_key, split_part(p_key, '-', 1), coalesce(p_category, 'learning'),
     btrim(p_name), coalesce(btrim(p_description), ''), p_metric, p_threshold,
     coalesce(p_rarity, 'common'), p_xp_reward, p_secret, p_limited, p_enabled,
     p_sort_order, p_image_url);
  perform public.admin_audit('gamification.badge_create', 'badge', p_key, btrim(p_name),
    jsonb_build_object('metric', p_metric, 'threshold', p_threshold));
  return p_key;
end;
$$;

create or replace function public.admin_badge_recipients(p_key text, p_limit integer default 100)
returns table (user_id uuid, user_code text, display_name text, awarded_at timestamptz, recipient_number integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user('gamification.badges.manage') then
    raise exception 'Missing permission: gamification.badges.manage';
  end if;
  return query
  select ub.user_id, p.user_code, p.display_name, ub.awarded_at, ub.recipient_number
  from public.user_badges ub
  join public.profiles p on p.id = ub.user_id
  where ub.badge_key = p_key
  order by ub.awarded_at desc
  limit least(coalesce(p_limit, 100), 500);
end;
$$;

---------------------------------------------------------------------- XP RPCs

-- XP history with an honest "needs review" flag: manual adjustments and large
-- amounts are marked, nothing is accused automatically.
create or replace function public.admin_xp_history(
  p_query text default '', p_only_needs_review boolean default false, p_limit integer default 100
)
returns table (
  id uuid, user_id uuid, user_code text, display_name text,
  event_key text, amount integer, reason text, created_at timestamptz,
  needs_review boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user('gamification.xp.adjust') then
    raise exception 'Missing permission: gamification.xp.adjust';
  end if;
  return query
  select l.id, l.user_id, p.user_code, p.display_name,
         l.event_key, l.amount, l.reason, l.created_at,
         (l.event_key like 'admin:%' or l.amount >= 300) as needs_review
  from public.xp_ledger l
  join public.profiles p on p.id = l.user_id
  where (p_query = '' or p.user_code ilike '%' || p_query || '%'
         or p.display_name ilike '%' || p_query || '%'
         or l.event_key ilike '%' || p_query || '%')
    and (not p_only_needs_review or l.event_key like 'admin:%' or l.amount >= 300)
  order by l.created_at desc
  limit least(coalesce(p_limit, 100), 500);
end;
$$;

-- Manual XP correction. Mandatory reason, mandatory idempotency key (the UI
-- generates one per adjustment intent; a replay is refused by the ledger's
-- unique (user_id, event_key) constraint). Profiles.xp is updated inside the
-- same definer transaction — never from client code.
create or replace function public.admin_xp_adjust(
  p_user uuid, p_amount integer, p_reason text, p_idempotency_key text
)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_key   text;
begin
  if not public.is_admin_user('gamification.xp.adjust') then
    raise exception 'Missing permission: gamification.xp.adjust';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is mandatory';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{6,64}$' then
    raise exception 'Idempotency key required';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then
    raise exception 'Amount must be a non-zero integer within ±100000';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_user and not pr.is_sample) then
    raise exception 'Unknown student';
  end if;

  v_key := 'admin:' || p_idempotency_key;
  begin
    insert into public.xp_ledger (user_id, event_key, amount, reason)
    values (p_user, v_key, p_amount, '[admin] ' || btrim(p_reason));
  exception when unique_violation then
    raise exception 'This exact adjustment was already applied (idempotency key replay)';
  end;

  update public.profiles set xp = coalesce(xp, 0) + p_amount where id = p_user;

  perform public.admin_audit('gamification.xp_adjust', 'user', p_user::text,
    btrim(p_reason), jsonb_build_object('amount', p_amount, 'ledger_event', v_key));
  return p_amount;
end;
$$;

revoke all on function public.admin_badges_list() from public, anon;
revoke all on function public.admin_badge_save(text, text, text, text, text, integer, text, integer, boolean, boolean, boolean, integer, text) from public, anon;
revoke all on function public.admin_badge_recipients(text, integer) from public, anon;
revoke all on function public.admin_xp_history(text, boolean, integer) from public, anon;
revoke all on function public.admin_xp_adjust(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_badges_list() to authenticated;
grant execute on function public.admin_badge_save(text, text, text, text, text, integer, text, integer, boolean, boolean, boolean, integer, text) to authenticated;
grant execute on function public.admin_badge_recipients(text, integer) to authenticated;
grant execute on function public.admin_xp_history(text, boolean, integer) to authenticated;
grant execute on function public.admin_xp_adjust(uuid, integer, text, text) to authenticated;
