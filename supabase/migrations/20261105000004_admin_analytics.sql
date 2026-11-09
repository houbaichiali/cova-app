-- COVA ADMIN CENTER — Phase 5: platform analytics.
-- Read-only aggregates computed in SQL; the browser receives numbers, never
-- row dumps. Every metric covers the window [now - p_days, now) with the
-- previous window of the same length for comparison. Permission: analytics.read.

create or replace function public.admin_analytics_summary(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days integer := coalesce(p_days, 30);
  v_from timestamptz;
  v_prev_from timestamptz;
  v_active_now integer;
  v_active_prev integer;
  v_result jsonb;
begin
  if not public.is_admin_user('analytics.read') then
    raise exception 'Missing permission: analytics.read';
  end if;
  if v_days not in (7, 30, 90, 365) then
    raise exception 'Unsupported period';
  end if;
  v_from := now() - make_interval(days => v_days);
  v_prev_from := now() - make_interval(days => v_days * 2);

  select count(distinct user_id) into v_active_now
  from public.xp_ledger where created_at >= v_from;
  select count(distinct user_id) into v_active_prev
  from public.xp_ledger
  where created_at >= v_prev_from and created_at < v_from;

  select jsonb_build_object(
    'days', v_days,

    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles where not is_sample),
      'new', (select count(*) from public.profiles where not is_sample and created_at >= v_from),
      'new_prev', (select count(*) from public.profiles
                   where not is_sample and created_at >= v_prev_from and created_at < v_from),
      'active', v_active_now,
      'active_prev', v_active_prev,
      'retained', (select count(distinct l.user_id) from public.xp_ledger l
                   where l.created_at >= v_from
                     and exists (select 1 from public.xp_ledger l2
                                 where l2.user_id = l.user_id
                                   and l2.created_at >= v_prev_from and l2.created_at < v_from))
    ),

    'education', jsonb_build_object(
      'quiz_attempts', (select count(*) from public.quiz_attempts where started_at >= v_from),
      'quiz_attempts_prev', (select count(*) from public.quiz_attempts
                             where started_at >= v_prev_from and started_at < v_from),
      'quiz_games', (select count(*) from public.quiz_games where played_at >= v_from),
      'quiz_participations', (select count(*) from public.quiz_game_players gp
                              join public.quiz_games g on g.id = gp.game_id
                              where g.played_at >= v_from),
      'avg_accuracy', (select round(avg(gp.accuracy)) from public.quiz_game_players gp
                       join public.quiz_games g on g.id = gp.game_id
                       where g.played_at >= v_from),
      'assignment_submissions', (select count(*) from public.assignment_submissions
                                 where submitted_at >= v_from),
      'challenge_submissions', (select count(*) from public.challenge_submissions
                                where submitted_at >= v_from),
      'resources_added', (select count(*) from public.shared_resources where created_at >= v_from),
      'popular_categories', (
        select coalesce(jsonb_agg(jsonb_build_object('category', cat, 'n', n) order by n desc), '[]'::jsonb)
        from (
          select q.category as cat, count(*) as n
          from public.quiz_games g join public.quizzes q on q.id = g.quiz_id
          where g.played_at >= v_from
          group by q.category order by n desc limit 5
        ) top
      )
    ),

    'gamification', jsonb_build_object(
      'xp_total', (select coalesce(sum(amount), 0) from public.xp_ledger where created_at >= v_from),
      'xp_prev', (select coalesce(sum(amount), 0) from public.xp_ledger
                  where created_at >= v_prev_from and created_at < v_from),
      'badges_unlocked', (select count(*) from public.user_badges where awarded_at >= v_from),
      'badge_top', (
        select coalesce(jsonb_agg(jsonb_build_object('key', k, 'name', n, 'n', c) order by c desc), '[]'::jsonb)
        from (
          select ub.badge_key as k, d.name as n, count(*) as c
          from public.user_badges ub join public.badge_definitions d on d.key = ub.badge_key
          where ub.awarded_at >= v_from
          group by ub.badge_key, d.name order by c desc limit 5
        ) bt
      ),
      'levels', (
        select coalesce(jsonb_agg(jsonb_build_object('level', lvl, 'n', c) order by lvl), '[]'::jsonb)
        from (
          select (public.level_for_xp(p.xp)).level as lvl, count(*) as c
          from public.profiles p where not p.is_sample
          group by 1
        ) lv
      )
    ),

    'moderation', jsonb_build_object(
      'reports', (select count(*) from public.moderation_reports where created_at >= v_from),
      'reports_open', (select count(*) from public.moderation_reports
                       where status in ('pending','under_review')),
      'reports_by_status', (
        select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) as n from public.moderation_reports
              where created_at >= v_from group by status) s
      ),
      'sanctions', (select count(*) from public.moderation_sanctions where created_at >= v_from),
      'sanctions_by_type', (
        select coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
        from (select type, count(*) as n from public.moderation_sanctions
              where created_at >= v_from group by type) s
      ),
      'appeals', (select count(*) from public.moderation_appeals where created_at >= v_from),
      'avg_report_resolution_hours', (
        select round(avg(extract(epoch from (updated_at - created_at)) / 3600)::numeric, 1)
        from public.moderation_reports
        where status in ('resolved','rejected') and updated_at >= v_from
      ),
      'moderator_activity', (
        select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'actions', n) order by n desc), '[]'::jsonb)
        from (
          select pr.display_name as nm, count(*) as n
          from public.admin_audit_logs a
          left join public.profiles pr on pr.id = a.actor_id
          where a.action like 'moderation.%' and a.created_at >= v_from
          group by pr.display_name order by n desc limit 5
        ) ma
      )
    ),

    'series', jsonb_build_object(
      'registrations', (
        select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', c) order by d), '[]'::jsonb)
        from (
          select to_char(gs.day, 'YYYY-MM-DD') as d,
                 (select count(*) from public.profiles p
                  where not p.is_sample and p.created_at::date = gs.day) as c
          from generate_series(v_from::date, now()::date, interval '1 day') gs(day)
        ) reg
      ),
      'xp', (
        select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', c) order by d), '[]'::jsonb)
        from (
          select to_char(gs.day, 'YYYY-MM-DD') as d,
                 (select coalesce(sum(l.amount), 0) from public.xp_ledger l
                  where l.created_at::date = gs.day) as c
          from generate_series(v_from::date, now()::date, interval '1 day') gs(day)
        ) xp
      )
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_analytics_summary(integer) from public, anon;
grant execute on function public.admin_analytics_summary(integer) to authenticated;
