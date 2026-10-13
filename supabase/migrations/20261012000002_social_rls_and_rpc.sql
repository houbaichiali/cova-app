-- COVA Connect: Row Level Security, helper functions, RPCs and Realtime.
--
-- These rules mirror socialActions in src/lib/social-store.ts:
--   * only the owner assigns admins, edits/deletes the community and regenerates the code;
--   * owner + admins approve join requests and remove members (admins only plain members);
--   * posting follows posting_policy;
--   * private communities are readable only by members (plus people with a pending request,
--     who need the name to see "Request waiting"), and join codes are readable only by staff
--     and only usable through join_by_code().
--
-- Two layers protect every write: RLS policies + column-level GRANTs (what a client can touch
-- directly) and SECURITY DEFINER functions (multi-step actions). User ids always come from
-- auth.uid(), never from a parameter.

------------------------------------------------------------------------ helper functions
-- SECURITY DEFINER so policies can look at membership without recursing into RLS.

create or replace function public.role_of(p_community uuid, p_user uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select role from public.community_members where community_id = p_community and user_id = p_user
$$;

create or replace function public.my_role(p_community uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select role from public.community_members
  where community_id = p_community and user_id = auth.uid()
$$;

create or replace function public.is_member(p_community uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = auth.uid()
  )
$$;

create or replace function public.is_staff(p_community uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.my_role(p_community) in ('owner', 'admin'), false)
$$;

create or replace function public.is_owner(p_community uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.my_role(p_community) = 'owner', false)
$$;

create or replace function public.is_public_community(p_community uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.communities where id = p_community and visibility = 'public')
$$;

create or replace function public.has_pending_request(p_community uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.join_requests
    where community_id = p_community and user_id = auth.uid()
  )
$$;

-- Mirrors canPost() in the store.
create or replace function public.can_post(p_community uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.communities c
    join public.community_members m on m.community_id = c.id and m.user_id = auth.uid()
    where c.id = p_community
      and (
        c.posting_policy = 'everyone'
        or (c.posting_policy = 'admins' and m.role in ('owner', 'admin'))
        or (c.posting_policy = 'owner' and m.role = 'owner')
      )
  )
$$;

------------------------------------------------------------------------ community triggers

-- The creator becomes the owner and the community gets its invite code.
create or replace function public.on_community_created()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.community_members (community_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  insert into public.community_join_codes (community_id) values (new.id);
  return new;
end;
$$;

create trigger communities_after_insert
  after insert on public.communities
  for each row execute function public.on_community_created();

-- A private community turning public admits everyone who was waiting (same as the old store).
create or replace function public.on_community_visibility_changed()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.visibility = 'private' and new.visibility = 'public' then
    insert into public.community_members (community_id, user_id, role)
    select community_id, user_id, 'member'
    from public.join_requests
    where community_id = new.id
    on conflict do nothing;
    delete from public.join_requests where community_id = new.id;
  end if;
  return new;
end;
$$;

create trigger communities_after_visibility_change
  after update of visibility on public.communities
  for each row
  when (old.visibility is distinct from new.visibility)
  execute function public.on_community_visibility_changed();

------------------------------------------------------------------------ RLS on

alter table public.profiles              enable row level security;
alter table public.friendships           enable row level security;
alter table public.direct_messages       enable row level security;
alter table public.message_reads         enable row level security;
alter table public.communities           enable row level security;
alter table public.community_join_codes  enable row level security;
alter table public.community_members     enable row level security;
alter table public.join_requests         enable row level security;
alter table public.community_posts       enable row level security;

-- Start from nothing; grant only what each table needs. Column lists below are what stop a
-- client from setting from_id / owner_id / role / status on its own.
revoke all on public.profiles, public.friendships, public.direct_messages,
  public.message_reads, public.communities, public.community_join_codes,
  public.community_members, public.join_requests, public.community_posts
  from public, anon, authenticated;

------------------------------------------------------------------------ profiles
-- Everyone signed in can find people by name or COVA id (that is the product), but only the
-- owner can edit their own display fields. public_id and is_sample can never be changed.

grant select on public.profiles to authenticated;
grant update (display_name, headline, tone) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

------------------------------------------------------------------------ friendships

grant select, delete on public.friendships to authenticated;
grant insert (to_id) on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;

create policy friendships_select on public.friendships
  for select to authenticated
  using (auth.uid() in (from_id, to_id));

-- You can only ask on your own behalf, and always as "pending".
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (from_id = auth.uid() and status = 'pending');

-- Only the person who was asked can accept.
create policy friendships_accept on public.friendships
  for update to authenticated
  using (to_id = auth.uid() and status = 'pending')
  with check (to_id = auth.uid() and status = 'accepted');

-- Cancel a request you sent, decline one you received, or remove a friend.
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (auth.uid() in (from_id, to_id));

------------------------------------------------------------------------ direct messages
-- Messages can't be edited or deleted: there is no UPDATE/DELETE grant or policy.

grant select on public.direct_messages to authenticated;
grant insert (to_id, body) on public.direct_messages to authenticated;

create policy direct_messages_select on public.direct_messages
  for select to authenticated
  using (auth.uid() in (from_id, to_id));

create policy direct_messages_insert on public.direct_messages
  for insert to authenticated
  with check (from_id = auth.uid());

-- Read markers are written only by mark_thread_read() so the timestamp comes from the server.
grant select on public.message_reads to authenticated;

create policy message_reads_select on public.message_reads
  for select to authenticated
  using (user_id = auth.uid());

------------------------------------------------------------------------ communities

grant select, delete on public.communities to authenticated;
grant insert (name, description, category, visibility, posting_policy)
  on public.communities to authenticated;
grant update (name, description, category, visibility, posting_policy)
  on public.communities to authenticated;

create policy communities_select on public.communities
  for select to authenticated
  using (
    visibility = 'public'
    or owner_id = auth.uid()                -- needed so INSERT ... RETURNING works
    or public.is_member(id)
    or public.has_pending_request(id)
  );

create policy communities_insert on public.communities
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy communities_update_owner on public.communities
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy communities_delete_owner on public.communities
  for delete to authenticated
  using (owner_id = auth.uid());

-- Invite codes: staff may read them. Nobody writes them directly.
grant select on public.community_join_codes to authenticated;

create policy join_codes_select_staff on public.community_join_codes
  for select to authenticated
  using (public.is_staff(community_id));

------------------------------------------------------------------------ members

grant select, delete on public.community_members to authenticated;
grant insert (community_id) on public.community_members to authenticated;
grant update (role) on public.community_members to authenticated;

create policy members_select on public.community_members
  for select to authenticated
  using (public.is_public_community(community_id) or public.is_member(community_id));

-- Joining directly is only for public communities, always as a plain member.
create policy members_insert_public on public.community_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and public.is_public_community(community_id)
  );

-- Only the owner assigns admins. The owner's own row never changes.
create policy members_update_owner on public.community_members
  for update to authenticated
  using (role <> 'owner' and public.is_owner(community_id))
  with check (role in ('admin', 'member') and public.is_owner(community_id));

create policy members_delete on public.community_members
  for delete to authenticated
  using (
    -- leave (the owner can't)
    (user_id = auth.uid() and role <> 'owner')
    -- owner and admins remove plain members
    or (user_id <> auth.uid() and role = 'member' and public.is_staff(community_id))
    -- only the owner removes an admin
    or (user_id <> auth.uid() and role = 'admin' and public.is_owner(community_id))
  );

------------------------------------------------------------------------ join requests
-- Requests are created only by join_by_code(): you need the code to ask.

grant select, delete on public.join_requests to authenticated;

create policy join_requests_select on public.join_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff(community_id));

-- Cancel your own request. Staff answer requests through decide_join_request().
create policy join_requests_cancel_own on public.join_requests
  for delete to authenticated
  using (user_id = auth.uid());

------------------------------------------------------------------------ posts

grant select, delete on public.community_posts to authenticated;
grant insert (community_id, body) on public.community_posts to authenticated;

create policy posts_select on public.community_posts
  for select to authenticated
  using (public.is_public_community(community_id) or public.is_member(community_id));

create policy posts_insert on public.community_posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_post(community_id));

-- Author, owner, or an admin (but an admin can't delete the owner's or another admin's posts).
create policy posts_delete on public.community_posts
  for delete to authenticated
  using (
    author_id = auth.uid()
    or public.is_owner(community_id)
    or (
      public.my_role(community_id) = 'admin'
      and coalesce(public.role_of(community_id, author_id), 'member') = 'member'
    )
  );

------------------------------------------------------------------------ RPC: friends

create or replace function public.send_friend_request(p_other uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  f public.friendships;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if me = p_other then raise exception 'You can''t add yourself.'; end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'That person doesn''t exist.';
  end if;

  select * into f from public.friendships
  where least(from_id, to_id) = least(me, p_other)
    and greatest(from_id, to_id) = greatest(me, p_other);

  if found then
    if f.status = 'accepted' then raise exception 'You are already friends.'; end if;
    if f.from_id = me then raise exception 'Request already sent.'; end if;
    update public.friendships set status = 'accepted' where id = f.id; -- they had asked you
    return;
  end if;

  insert into public.friendships (from_id, to_id) values (me, p_other);
exception when unique_violation then
  raise exception 'Request already sent.';
end;
$$;

------------------------------------------------------------------------ RPC: messages

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

------------------------------------------------------------------------ RPC: people

-- Finds people by display name or COVA id: case-insensitive, partial, 2+ characters, best
-- matches first. SECURITY INVOKER, so it only ever sees what profiles_select allows.
create or replace function public.search_profiles(p_query text)
returns setof public.profiles
language sql stable
set search_path = ''
as $$
  with q as (
    select lower(regexp_replace(btrim(coalesce(p_query, '')), '^@', '')) as term
  ),
  esc as (
    select term,
           replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') as pattern
    from q
  )
  select p.*
  from public.profiles p, esc
  where char_length(esc.term) >= 2
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      lower(p.display_name) like '%' || esc.pattern || '%' escape '\'
      or lower(p.public_id) like '%' || esc.pattern || '%' escape '\'
    )
  order by
    case
      when lower(p.public_id) = esc.term then 0
      when lower(p.display_name) = esc.term then 1
      when lower(p.display_name) like esc.pattern || '%' escape '\'
        or lower(p.public_id) like esc.pattern || '%' escape '\' then 2
      else 3
    end,
    p.display_name
  limit 30
$$;

------------------------------------------------------------------------ RPC: communities

-- Uses an invite code. Public communities admit you at once; private ones file a request.
-- This is the only way to learn which community a code belongs to.
create or replace function public.join_by_code(p_code text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  c public.communities;
begin
  if me is null then raise exception 'Sign in to join a community.'; end if;

  select c2.* into c
  from public.community_join_codes jc
  join public.communities c2 on c2.id = jc.community_id
  where normalized <> '' and jc.code = normalized;

  if not found then raise exception 'That code doesn''t match any community.'; end if;

  if exists (select 1 from public.community_members where community_id = c.id and user_id = me) then
    return jsonb_build_object('communityId', c.id, 'outcome', 'already-member');
  end if;

  if c.visibility = 'public' then
    insert into public.community_members (community_id, user_id, role)
    values (c.id, me, 'member')
    on conflict do nothing;
    return jsonb_build_object('communityId', c.id, 'outcome', 'joined');
  end if;

  if exists (select 1 from public.join_requests where community_id = c.id and user_id = me) then
    return jsonb_build_object('communityId', c.id, 'outcome', 'already-requested');
  end if;

  insert into public.join_requests (community_id, user_id) values (c.id, me)
  on conflict do nothing;
  return jsonb_build_object('communityId', c.id, 'outcome', 'requested');
end;
$$;

-- Owner and admins answer requests.
create or replace function public.decide_join_request(p_request uuid, p_approve boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.join_requests;
begin
  select * into r from public.join_requests where id = p_request;
  if not found then raise exception 'That request no longer exists.'; end if;
  if not public.is_staff(r.community_id) then
    raise exception 'Only admins can answer join requests.';
  end if;

  if p_approve then
    insert into public.community_members (community_id, user_id, role)
    values (r.community_id, r.user_id, 'member')
    on conflict do nothing;
  end if;
  delete from public.join_requests where id = p_request;
end;
$$;

-- Owner only. The old code stops working immediately.
create or replace function public.regenerate_join_code(p_community uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  if not exists (select 1 from public.communities where id = p_community) then
    raise exception 'Community not found.';
  end if;
  if not public.is_owner(p_community) then
    raise exception 'Only the creator can change the invite code.';
  end if;
  new_code := public.generate_join_code();
  update public.community_join_codes set code = new_code where community_id = p_community;
  return new_code;
end;
$$;

-- Lets the UI tell "private, ask for the code" apart from "doesn't exist" without revealing
-- anything else about a private community.
create or replace function public.private_community_exists(p_community uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.communities where id = p_community and visibility = 'private')
$$;

------------------------------------------------------------------------ function privileges
-- Functions are executable by PUBLIC by default. Only signed-in users may call them.

revoke execute on function
  public.role_of(uuid, uuid), public.my_role(uuid), public.is_member(uuid), public.is_staff(uuid),
  public.is_owner(uuid), public.is_public_community(uuid), public.has_pending_request(uuid),
  public.can_post(uuid), public.send_friend_request(uuid), public.mark_thread_read(uuid),
  public.search_profiles(text), public.join_by_code(text),
  public.decide_join_request(uuid, boolean), public.regenerate_join_code(uuid),
  public.private_community_exists(uuid)
  from public, anon;

grant execute on function
  public.role_of(uuid, uuid), public.my_role(uuid), public.is_member(uuid), public.is_staff(uuid),
  public.is_owner(uuid), public.is_public_community(uuid), public.has_pending_request(uuid),
  public.can_post(uuid), public.send_friend_request(uuid), public.mark_thread_read(uuid),
  public.search_profiles(text), public.join_by_code(text),
  public.decide_join_request(uuid, boolean), public.regenerate_join_code(uuid),
  public.private_community_exists(uuid)
  to authenticated;

-- Internal helpers and triggers are never called by clients.
revoke execute on function
  public.random_code(int), public.generate_public_id(), public.generate_join_code(),
  public.handle_new_user(), public.handle_deleted_user(),
  public.on_community_created(), public.on_community_visibility_changed()
  from public, anon, authenticated;

------------------------------------------------------------------------ Realtime
-- Realtime postgres_changes respects the SELECT policies above for inserts and updates.
-- (DELETE events only carry primary keys and are not filtered, so the client just refetches.)

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'profiles', 'friendships', 'direct_messages', 'message_reads', 'communities',
      'community_join_codes', 'community_members', 'join_requests', 'community_posts'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
