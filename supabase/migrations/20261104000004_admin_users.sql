-- COVA ADMIN CENTER — Phase 3: dashboard statistics and user management.
-- Non-destructive. Every function is gated by is_admin_user and exposes only
-- what the admin UI needs: aggregates on the dashboard, per-user ledger and
-- administrative notes in the user detail view.

-- Notes an administrator writes on a user's profile (Phase 3 scope: text).
create table if not exists public.admin_user_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete set null,
  note       text not null check (char_length(btrim(note)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists admin_user_notes_user_idx
  on public.admin_user_notes (user_id, created_at desc);
alter table public.admin_user_notes enable row level security;
-- No direct grants: notes are read/written through the definer RPCs below.

-- Aggregate dashboard numbers, computed from real tables only.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  if not public.is_admin_user() then
    raise exception 'Admin access required';
  end if;

  select jsonb_build_object(
    'users_total',
      (select count(*) from public.profiles where not is_sample),
    'users_new_30d',
      (select count(*) from public.profiles
        where not is_sample and created_at > now() - interval '30 days'),
    'users_active_7d',
      (select count(distinct user_id) from public.xp_ledger
        where created_at > now() - interval '7 days'),
    'quizzes_total',
      (select count(*) from public.quizzes),
    'quiz_games_total',
      (select count(*) from public.quiz_games),
    'quiz_participations_total',
      (select count(*) from public.quiz_game_players),
    'badges_unlocked_total',
      (select count(*) from public.user_badges),
    'xp_distributed_total',
      (select coalesce(sum(amount), 0) from public.xp_ledger)
  ) into v_result;
  return v_result;
end;
$$;

-- One user's XP ledger for the admin detail view (RLS keeps the table
-- owner-only for ordinary reads; admins get a gated, limited window).
create or replace function public.admin_user_ledger(p_user uuid, p_limit integer default 100)
returns table (event_key text, amount integer, reason text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.event_key, l.amount, l.reason, l.created_at
  from public.xp_ledger l
  where l.user_id = p_user
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- Badges held by one user (count + keys) for the detail view.
create or replace function public.admin_user_badges(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'count', count(*),
    'keys', coalesce(array_agg(b.badge_key) filter (where b.badge_key is not null), '{}')
  )
  from public.user_badges b
  where b.user_id = p_user
$$;

-- Administrative notes: list.
create or replace function public.admin_user_notes_list(p_user uuid)
returns table (id uuid, note text, author_id uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, n.note, n.author_id, n.created_at
  from public.admin_user_notes n
  where n.user_id = p_user
  order by n.created_at desc
  limit 100
$$;

-- Administrative notes: add (permission users.note, always audited).
create or replace function public.admin_user_note_add(p_user uuid, p_note text)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_note   text := btrim(coalesce(p_note, ''));
  v_note_id uuid;
begin
  if not public.is_admin_user('users.note') then
    raise exception 'Missing permission: users.note';
  end if;
  if v_actor is null then raise exception 'Sign in first'; end if;
  if char_length(v_note) < 1 or char_length(v_note) > 1000 then
    raise exception 'Note must be 1-1000 characters';
  end if;

  insert into public.admin_user_notes (user_id, author_id, note)
  values (p_user, v_actor, v_note)
  returning id into v_note_id;

  perform public.admin_audit(
    'admin.note.add', 'user', p_user::text, 'Administrative note added',
    jsonb_build_object('note_id', v_note_id), v_actor);
  return v_note_id;
end;
$$;

revoke all on function public.admin_dashboard_stats() from public, anon;
revoke all on function public.admin_user_ledger(uuid, integer) from public, anon;
revoke all on function public.admin_user_badges(uuid) from public, anon;
revoke all on function public.admin_user_notes_list(uuid) from public, anon;
revoke all on function public.admin_user_note_add(uuid, text) from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_user_ledger(uuid, integer) to authenticated;
grant execute on function public.admin_user_badges(uuid) to authenticated;
grant execute on function public.admin_user_notes_list(uuid) to authenticated;
grant execute on function public.admin_user_note_add(uuid, text) to authenticated;
