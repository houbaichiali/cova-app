-- COVA — Phases 6 & 7: extended profile details, social links and
-- per-field privacy with four audiences (everyone / members / friends / me).
--
-- Design: the new personal fields do NOT go on `profiles` — that table is
-- readable by every authenticated client today, so sensitive values would
-- leak past any per-field filter. They live in a dedicated 1:1 table whose
-- RLS denies everyone except the owner, and the ONLY public door is the
-- security-definer RPC `profile_details_visible`, which applies each field's
-- audience before returning anything. The real friendship graph
-- (public.profile_is_friend_of) is reused — friendships are never invented.
--
-- Gender is optional with two explicit values (male / female) or NULL
-- (unspecified); it is never exposed automatically (default audience: me).
-- Non-destructive: additive tables + functions only.

create table if not exists public.profile_private_details (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  first_name  text check (char_length(first_name)  <= 30),
  last_name   text check (char_length(last_name)   <= 30),
  gender      text check (gender in ('male', 'female')),
  university  text check (char_length(university)  <= 120),
  education   text check (char_length(education)   <= 500),
  updated_at  timestamptz not null default now()
);

create table if not exists public.profile_social_links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('instagram','facebook','x','linkedin','github','discord')),
  value      text not null check (char_length(value) between 2 and 200),
  position   integer not null default 0,
  visibility text not null default 'members' check (visibility in ('everyone','members','friends','me')),
  created_at timestamptz not null default now(),
  unique (user_id, platform)
);

create index if not exists profile_social_links_user_idx
  on public.profile_social_links (user_id, position);

create table if not exists public.profile_field_visibility (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  field    text not null check (field in ('first_name','last_name','gender','university','education')),
  audience text not null default 'members' check (audience in ('everyone','members','friends','me')),
  primary key (user_id, field)
);

alter table public.profile_private_details   enable row level security;
alter table public.profile_social_links      enable row level security;
alter table public.profile_field_visibility  enable row level security;

alter table public.profile_private_details   owner to postgres;
alter table public.profile_social_links      owner to postgres;
alter table public.profile_field_visibility  owner to postgres;

-- Owner-only direct access; nobody else can read these tables directly.
create policy "profile_private_details_owner_all"
  on public.profile_private_details for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "profile_social_links_owner_all"
  on public.profile_social_links for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "profile_field_visibility_owner_all"
  on public.profile_field_visibility for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.profile_private_details  from public, anon, authenticated;
revoke all on public.profile_social_links     from public, anon, authenticated;
revoke all on public.profile_field_visibility from public, anon, authenticated;
grant select, insert, update, delete on public.profile_private_details   to authenticated;
grant select, insert, update, delete on public.profile_social_links      to authenticated;
grant select, insert, update, delete on public.profile_field_visibility  to authenticated;

--------------------------------------------------------------------- helpers

-- Audience of one identity field (default 'members' until configured).
create or replace function public.profile_field_audience(p_owner uuid, p_field text)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select v.audience from public.profile_field_visibility v
      where v.user_id = p_owner and v.field = p_field),
    'members'
  );
$$;

-- Audience decision: self always true; 'me' is owner-only; 'friends' uses the
-- REAL friendship graph; 'members' needs any authenticated session; 'everyone'
-- includes anonymous visitors.
create or replace function public.profile_audience_allows(
  p_owner uuid,
  p_audience text
)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_owner = (select auth.uid()) then true
    when p_audience = 'me' then false
    when p_audience = 'friends' then public.profile_is_friend_of(p_owner)
    when p_audience = 'members' then (select auth.uid()) is not null
    else true
  end;
$$;

----------------------------------------------------------------------- RPCs

-- The single public door for extended details + social links. Anon visitors
-- may call it; each field's audience decides what they receive.
create or replace function public.profile_details_visible(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid;
  v_details public.profile_private_details;
  v_result jsonb;
begin
  v_owner := public.profile_id_by_code(p_code);
  if v_owner is null then
    return jsonb_build_object('found', false);
  end if;

  select * into v_details from public.profile_private_details d
    where d.user_id = v_owner;

  v_result := jsonb_build_object('found', true, 'owner', v_owner);

  if public.profile_audience_allows(v_owner, public.profile_field_audience(v_owner, 'first_name')) then
    v_result := jsonb_set(v_result, '{first_name}', to_jsonb(v_details.first_name));
  end if;
  if public.profile_audience_allows(v_owner, public.profile_field_audience(v_owner, 'last_name')) then
    v_result := jsonb_set(v_result, '{last_name}', to_jsonb(v_details.last_name));
  end if;
  -- Gender is never exposed automatically: default audience is 'me'.
  if public.profile_audience_allows(v_owner, public.profile_field_audience(v_owner, 'gender')) then
    v_result := jsonb_set(v_result, '{gender}', to_jsonb(v_details.gender));
  end if;
  if public.profile_audience_allows(v_owner, public.profile_field_audience(v_owner, 'university')) then
    v_result := jsonb_set(v_result, '{university}', to_jsonb(v_details.university));
  end if;
  if public.profile_audience_allows(v_owner, public.profile_field_audience(v_owner, 'education')) then
    v_result := jsonb_set(v_result, '{education}', to_jsonb(v_details.education));
  end if;

  -- Social links: one visibility per platform, ordered by position.
  v_result := jsonb_set(
    v_result,
    '{social}',
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'platform', s.platform, 'value', s.value, 'position', s.position
      ) order by s.position), '[]'::jsonb)
      from public.profile_social_links s
      where s.user_id = v_owner
        and public.profile_audience_allows(v_owner, s.visibility)
    )
  );

  return v_result;
end;
$$;

revoke all on function public.profile_details_visible(text) from public, anon, authenticated;
grant execute on function public.profile_details_visible(text) to anon, authenticated;

revoke all on function public.profile_field_audience(uuid, text) from public, anon, authenticated;
revoke all on function public.profile_audience_allows(uuid, text) from public, anon, authenticated;
grant execute on function public.profile_field_audience(uuid, text) to authenticated;
grant execute on function public.profile_audience_allows(uuid, text) to authenticated;
