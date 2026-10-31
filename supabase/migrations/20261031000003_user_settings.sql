-- Per-user settings: appearance, notification preferences, privacy, account state.
--
-- One row per person (user_id), read/written only by its owner (RLS) and streamed
-- by Realtime, so every device of the same account converges on the same values.
-- The preferences are not cosmetic: the notification system, friend requests and
-- profile visibility below are enforced server-side.

---------------------------------------------------------------- user_settings

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- appearance
  theme       text not null default 'light' check (theme in ('light', 'dark')),
  text_size   text not null default 'medium' check (text_size in ('small', 'medium', 'large')),
  -- notification preferences (which categories may reach this person)
  notify_messages        boolean not null default true,
  notify_friend_requests boolean not null default true,
  notify_communities     boolean not null default true,
  notify_courses         boolean not null default true,
  notify_assignments     boolean not null default true,
  notify_deadlines       boolean not null default true,
  notify_challenges      boolean not null default true,
  -- privacy
  profile_visibility    text not null default 'public' check (profile_visibility in ('public', 'private')),
  info_visibility       text not null default 'everyone' check (info_visibility in ('everyone', 'friends', 'nobody')),
  allow_friend_requests boolean not null default true,
  show_online_status    boolean not null default true,
  -- account state and presence
  deactivated  boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.user_settings enable row level security;

grant select, insert, update on public.user_settings to authenticated;

drop policy if exists "Users read their settings" on public.user_settings;
create policy "Users read their settings"
  on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users insert their settings" on public.user_settings;
create policy "Users insert their settings"
  on public.user_settings for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users update their settings" on public.user_settings;
create policy "Users update their settings"
  on public.user_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Stream changes to the owner's other devices (no-op when already added).
do $$
begin
  begin
    alter publication supabase_realtime add table public.user_settings;
  exception when duplicate_object then null;
  end;
end $$;

create or replace function public.touch_user_settings_updated_at()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch
before update on public.user_settings
for each row execute function public.touch_user_settings_updated_at();

--------------------------------------------- private messages (if missing)

-- Some deployed databases were refactored without the social tables: create the
-- private-message tables when absent so messaging (and its notification
-- preference) actually works. Existing installations keep their tables.
create table if not exists public.direct_messages (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint direct_messages_not_self check (from_id <> to_id)
);
create index if not exists direct_messages_from_idx on public.direct_messages (from_id, created_at desc);
create index if not exists direct_messages_to_idx on public.direct_messages (to_id, created_at desc);

alter table public.direct_messages enable row level security;
grant select, insert on public.direct_messages to authenticated;

do $$
begin
  if to_regclass('public.direct_messages') is not null then
    drop policy if exists "dm_select_participants" on public.direct_messages;
    create policy dm_select_participants on public.direct_messages
      for select to authenticated
      using (from_id = (select auth.uid()) or to_id = (select auth.uid()));

    drop policy if exists "dm_insert_own" on public.direct_messages;
    create policy dm_insert_own on public.direct_messages
      for insert to authenticated
      with check (from_id = (select auth.uid()));
  end if;
end $$;

-- When `user_id` last opened the conversation with `other_id`. Written only by
-- mark_thread_read() so the timestamp comes from the server.
create table if not exists public.message_reads (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  other_id uuid not null references public.profiles (id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (user_id, other_id)
);

alter table public.message_reads enable row level security;
grant select on public.message_reads to authenticated;

do $$
begin
  if to_regclass('public.message_reads') is not null then
    drop policy if exists "message_reads_select" on public.message_reads;
    create policy message_reads_select on public.message_reads
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

create or replace function public.mark_thread_read(p_other uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  insert into public.message_reads (user_id, other_id, read_at)
  values (auth.uid(), p_other, clock_timestamp())
  on conflict (user_id, other_id) do update set read_at = excluded.read_at;
end;
$$;
grant execute on function public.mark_thread_read(uuid) to authenticated;

------------------------------------------- notifications: respect preferences

-- Whether a notification of this kind may reach this person. A missing row
-- means "everything on" (the defaults), so nobody loses notifications because
-- they never opened Settings.
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
    when 'resource_added' then notify_courses
    when 'deadline_reminder' then notify_deadlines
    when 'xp_earned' then notify_challenges
    else true
  end
  into allowed
  from public.user_settings
  where user_id = p_user;
  return coalesce(allowed, true);
end;
$$;
revoke all on function public.notifications_enabled_for(uuid, text) from public, authenticated, anon;

-- Same behaviour as 20261031000001, plus: the recipient's notification
-- preferences are applied before a row is written.
create or replace function public.notify(
  p_user   uuid,
  p_kind   text,
  p_actor  uuid,
  p_href   text,
  p_text   text,
  p_detail text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if not public.notifications_enabled_for(p_user, p_kind) then return; end if;
  insert into public.notifications (user_id, kind, actor_id, href, text, detail)
  values (p_user, p_kind, p_actor, p_href, coalesce(p_text, ''), coalesce(p_detail, ''));
end;
$$;
revoke all on function public.notify(uuid, text, uuid, text, text, text) from public, authenticated, anon;

-- "New messages" becomes a real notification: one unread "new message"
-- notification per sender at a time (a chat burst never floods the list).
create or replace function public.notify_on_direct_message_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sender_code text;
begin
  if not public.notifications_enabled_for(new.to_id, 'new_message') then return null; end if;
  if exists (
    select 1 from public.notifications
    where user_id = new.to_id and kind = 'new_message' and actor_id = new.from_id and read_at is null
  ) then
    return null;
  end if;
  select user_code into sender_code from public.profiles where id = new.from_id;
  perform public.notify(new.to_id, 'new_message', new.from_id,
    '/messages?to=' || coalesce(sender_code, ''), '', '');
  return null;
end;
$$;

-- Every trigger below is created only when its table exists, so the migration
-- also applies to databases whose schema was refactored (e.g. no direct_messages).

do $$
begin
  if to_regclass('public.direct_messages') is not null then
    drop trigger if exists direct_message_notify on public.direct_messages;
    create trigger direct_message_notify
    after insert on public.direct_messages
    for each row execute function public.notify_on_direct_message_insert();
  end if;
end $$;

------------------------------------------------------ privacy: friend requests

-- Schema compatibility: some deployed databases name the pair columns
-- requester_id/addressee_id instead of from_id/to_id (the schema this app's
-- data layer reads). Expose generated aliases so both names work everywhere.
do $$
begin
  if to_regclass('public.friendships') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'friendships'
                   and column_name = 'requester_id')
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'friendships'
                       and column_name = 'from_id') then
    execute 'alter table public.friendships add column from_id uuid generated always as (requester_id) stored';
    execute 'alter table public.friendships add column to_id uuid generated always as (addressee_id) stored';
  end if;
end $$;

-- Blocks friend requests towards people who turned them off. A BEFORE trigger
-- enforces this for every code path (the RPC, direct inserts, imports...).
-- Column-agnostic: reads whichever pair naming the table uses.
create or replace function public.enforce_friend_requests_allowed()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  payload json := to_json(new);
  target  uuid := coalesce((payload->>'to_id')::uuid, (payload->>'addressee_id')::uuid);
  actor   uuid := coalesce((payload->>'from_id')::uuid, (payload->>'requester_id')::uuid);
  allowed boolean;
begin
  select allow_friend_requests into allowed
  from public.user_settings
  where user_id = target;
  if coalesce(allowed, true) = false and actor is distinct from target then
    raise exception 'This person does not accept friend requests.';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.friendships') is not null then
    drop trigger if exists friend_requests_allowed on public.friendships;
    create trigger friend_requests_allowed
    before insert on public.friendships
    for each row execute function public.enforce_friend_requests_allowed();
  end if;
end $$;

------------------------------------------------- privacy: visible profile data

-- The one door through which profile details (title, bio, domain, languages,
-- photo) leave the database for other students. Each target decides:
--   profile_visibility 'private' -> only friends (and self) see anything;
--   info_visibility 'everyone' / 'friends' / 'nobody' -> who sees the details;
--   deactivated accounts disappear for everyone except themselves;
--   'online' is only reported when the target allows it.
create or replace function public.get_visible_profiles(p_codes text[])
returns table (
  user_code        text,
  display_name     text,
  headline         text,
  avatar_url       text,
  bio              text,
  domain           text,
  prog_languages   text[],
  spoken_languages text[],
  online           boolean
)
language sql security definer set search_path = public as $$
  select
    p.user_code,
    p.display_name,
    p.headline,
    p.avatar_url,
    p.bio,
    p.domain,
    p.prog_languages,
    p.spoken_languages,
    us.show_online_status and us.last_seen_at > now() - interval '5 minutes'
  from public.profiles p
  join public.user_settings us on us.user_id = p.id
  where p.user_code = any (p_codes)
    and (
      p.id = (select auth.uid())
      or (
        not us.deactivated
        and (
          us.profile_visibility = 'public'
          or exists (
            select 1 from public.friendships f
            where f.status = 'accepted'
              and ((f.from_id = (select auth.uid()) and f.to_id = p.id)
                or (f.from_id = p.id and f.to_id = (select auth.uid())))
          )
        )
        and (
          us.info_visibility = 'everyone'
          or (
            us.info_visibility = 'friends'
            and exists (
              select 1 from public.friendships f2
              where f2.status = 'accepted'
                and ((f2.from_id = (select auth.uid()) and f2.to_id = p.id)
                  or (f2.from_id = p.id and f2.to_id = (select auth.uid())))
            )
          )
        )
      )
    )
$$;
grant execute on function public.get_visible_profiles(text[]) to authenticated;

---------------------------------------------------------- account: deactivate

create or replace function public.deactivate_own_account()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  insert into public.user_settings (user_id, deactivated) values ((select auth.uid()), true)
  on conflict (user_id) do update set deactivated = true, updated_at = now();
end;
$$;

create or replace function public.reactivate_own_account()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  update public.user_settings set deactivated = false, updated_at = now()
  where user_id = (select auth.uid());
end;
$$;

grant execute on function public.deactivate_own_account() to authenticated;
grant execute on function public.reactivate_own_account() to authenticated;

------------------------------------------------------- deadline reminders cron

-- Hourly job: remind enrolled students about assignments due within 48 hours
-- (never for work already submitted, at most one reminder per 24 hours and per
-- assignment). Recipients' "Deadline reminders" preference applies through
-- notify(). Requires the pg_cron extension; skipped (with a notice) when the
-- project does not have it.
create or replace function public.remind_assignment_deadlines()
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, actor_id, href, text, detail)
  select e.user_id, 'deadline_reminder', a.created_by,
         '/assignments/' || a.id::text, a.title,
         to_char(a.due_at at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC'
  from public.assignments a
  join public.course_enrollments e on e.course_id = a.course_id
  where a.due_at is not null
    and a.due_at > now()
    and a.due_at <= now() + interval '48 hours'
    and not exists (
      select 1 from public.notifications n
      where n.user_id = e.user_id
        and n.kind = 'deadline_reminder'
        and n.href = '/assignments/' || a.id::text
        and n.created_at > now() - interval '23 hours'
    )
    and not exists (
      select 1 from public.assignment_submissions s
      where s.assignment_id = a.id and s.student_id = e.user_id and s.status = 'submitted'
    );
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if not exists (select 1 from cron.job where jobname = 'cova-deadline-reminders') then
        perform cron.schedule('cova-deadline-reminders', '17 * * * *', 'select public.remind_assignment_deadlines()');
      end if;
    exception when others then
      raise notice 'pg_cron unavailable (%): schedule deadline reminders manually', sqlerrm;
    end;
  else
    raise notice 'pg_cron not available: schedule public.remind_assignment_deadlines() manually';
  end if;
end $$;
