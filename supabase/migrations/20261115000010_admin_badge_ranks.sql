-- =============================================================================
-- COVA — Admin badge management: ranks and visibility (additive).
--
-- Phase 9 of the community/rewards overhaul. Extends the audited badge RPCs
-- with the two Phase 8 columns:
--   * admin_badges_list now returns visibility_mode and ranks.
--   * admin_badge_save accepts two TRAILING optional parameters
--     (p_visibility_mode, p_ranks) — existing callers keep working unchanged;
--     null keeps the current value. Ranks JSON is validated: 1..8 entries,
--     rank 1..8, positive thresholds, no duplicate rank.
-- =============================================================================

create or replace function public.admin_badges_list()
returns table (
  key text, base_key text, category text, name text, description text,
  metric text, threshold integer, rarity text, xp_reward integer,
  secret boolean, limited boolean, enabled boolean, sort_order integer,
  image_url text, unlocked_count bigint,
  visibility_mode text, ranks jsonb
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
         (select count(*) from public.user_badges ub where ub.badge_key = d.key),
         d.visibility_mode, d.ranks
  from public.badge_definitions d
  order by d.sort_order, d.key
  limit 500;
end;
$$;

create or replace function public.admin_badge_save(
  p_key text, p_name text, p_description text default '', p_category text default 'learning',
  p_metric text default 'registered', p_threshold integer default 1,
  p_rarity text default 'common', p_xp_reward integer default 20,
  p_secret boolean default false, p_limited boolean default false,
  p_enabled boolean default true, p_sort_order integer default 0,
  p_image_url text default null,
  p_visibility_mode text default null,
  p_ranks jsonb default null
)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.badge_definitions%rowtype;
  v_ranks jsonb;
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
  if p_visibility_mode is not null
    and p_visibility_mode not in ('public','private','hidden') then
    raise exception 'Unknown visibility mode';
  end if;
  -- Ranks validation: up to 8 tiers, rank 1..8, positive thresholds, unique.
  if p_ranks is not null then
    if jsonb_typeof(p_ranks) <> 'array' or jsonb_array_length(p_ranks) > 8 then
      raise exception 'ranks must be an array of at most 8 entries';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_ranks) elem
      where (elem->>'rank') is null
         or (elem->>'threshold') is null
         or (elem->>'rank')::int not between 1 and 8
         or (elem->>'threshold')::int < 1
    ) then
      raise exception 'each rank needs {rank: 1..8, threshold: >= 1}';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_ranks) elem
      group by (elem->>'rank') having count(*) > 1
    ) then
      raise exception 'rank numbers must be unique';
    end if;
    v_ranks := p_ranks;
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
      image_url = coalesce(p_image_url, v_existing.image_url),
      visibility_mode = coalesce(p_visibility_mode, v_existing.visibility_mode),
      ranks = coalesce(v_ranks, v_existing.ranks)
    where key = p_key;
    perform public.admin_audit('gamification.badge_update', 'badge', p_key,
      v_existing.name || ' -> ' || btrim(p_name),
      jsonb_build_object('metric', p_metric, 'threshold', p_threshold, 'enabled', p_enabled,
                         'visibility_mode', coalesce(p_visibility_mode, v_existing.visibility_mode),
                         'ranks', coalesce(v_ranks, v_existing.ranks)));
    return p_key;
  end if;

  insert into public.badge_definitions
    (key, base_key, category, name, description, metric, threshold, rarity,
     xp_reward, secret, limited, enabled, sort_order, image_url,
     visibility_mode, ranks)
  values
    (p_key, split_part(p_key, '-', 1), coalesce(p_category, 'learning'),
     btrim(p_name), coalesce(btrim(p_description), ''), p_metric, p_threshold,
     coalesce(p_rarity, 'common'), p_xp_reward, p_secret, p_limited, p_enabled,
     p_sort_order, p_image_url,
     coalesce(p_visibility_mode, 'public'), coalesce(v_ranks, '[]'::jsonb));
  perform public.admin_audit('gamification.badge_create', 'badge', p_key, btrim(p_name),
    jsonb_build_object('metric', p_metric, 'threshold', p_threshold));
  return p_key;
end;
$$;
