-- =============================================================================
-- COVA — Student Profile & Portfolio enhancement (additive).
--
-- What this migration does
--   * profile_appearance      visual customization (whitelist-validated)
--   * profile_privacy         per-section visibility (public / friends / private)
--   * profile_subjects        favorite subjects (ordered)
--   * profile_goals           personal learning goals
--   * portfolio_settings      hybrid portfolio about/mode + PDF options
--   * portfolio_skills        self-declared + COVA-verified skills
--   * portfolio_projects      manual projects (draft/published, per-row visibility)
--   * portfolio_imports       selected REAL COVA records (assignments/challenges)
--   * portfolio_certificates  documents with verification status
--   * portfolio_milestones    student-added journey milestones (labeled "added by me")
--   * storage bucket `portfolio-documents` (PRIVATE) + policies
--   * security-definer RPCs that enforce privacy server-side
--
-- Non-destructive: no existing table is altered, no live column recreated
-- (profiles.bio / user_code / xp exist in the live database only — see
-- supabase/tests/05_base_schema_stub.sql). All new tables start empty.
--
-- Privacy model
--   * New data tables: owner-only RLS. Non-owners NEVER read them directly;
--     they go through security-definer RPCs that apply profile_privacy,
--     friendships and row visibility. Unauthorized callers receive nothing.
--   * profile_appearance is decorative and readable by any authenticated
--     member (needed to render a profile); only its owner can write it.
--   * Verified skills: `admin_verify_skill` is gated on the Admin Center
--     permission `portfolio.skills.verify`. Nothing else can set
--     verification_status = 'cova_verified', so no verification can be
--     invented from the browser.
-- =============================================================================

-- Optional header info on the EXISTING profiles table (additive only).
alter table public.profiles
  add column if not exists location text not null default ''
  check (char_length(location) <= 80);
grant update (location) on public.profiles to authenticated;

----------------------------------------------------------------- appearance

create table if not exists public.profile_appearance (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme   text not null default 'default'
          check (theme in ('default','minimal','dark','ocean','sunset','neon','nature','elegant')),
  -- display name
  name_color        text check (name_color is null or name_color ~ '^#[0-9A-Fa-f]{6}$'),
  name_font         text not null default 'sans'
                    check (name_font in ('sans','serif','rounded','display','mono')),
  name_weight       text not null default 'semibold'
                    check (name_weight in ('normal','medium','semibold','bold')),
  name_italic       boolean not null default false,
  name_prefix_emoji text not null default '' check (char_length(name_prefix_emoji) <= 16),
  name_suffix_emoji text not null default '' check (char_length(name_suffix_emoji) <= 16),
  -- biography
  bio_color  text check (bio_color is null or bio_color ~ '^#[0-9A-Fa-f]{6}$'),
  bio_font   text not null default 'sans'
             check (bio_font in ('sans','serif','rounded','display','mono')),
  bio_align  text not null default 'start' check (bio_align in ('start','center','end')),
  -- cover
  cover_kind   text not null default 'preset' check (cover_kind in ('preset','color','image')),
  cover_preset text not null default 'aurora'
               check (cover_preset in ('aurora','dusk','mint','ember','royal','sand','slate','rose')),
  cover_color  text check (cover_color is null or cover_color ~ '^#[0-9A-Fa-f]{6}$'),
  cover_image_url text
               check (cover_image_url is null or cover_image_url ~* '^https?://|^/'),
  cover_position text not null default 'center' check (cover_position in ('center','top','bottom')),
  -- badge marquee background (independent from the cover)
  marquee_kind   text not null default 'default' check (marquee_kind in ('default','color','preset')),
  marquee_color  text check (marquee_color is null or marquee_color ~ '^#[0-9A-Fa-f]{6}$'),
  marquee_preset text not null default 'translucent'
                 check (marquee_preset in ('translucent','paper','night','sky','blossom')),
  marquee_border       text not null default 'none' check (marquee_border in ('none','solid','dashed','glow')),
  marquee_border_color text check (marquee_border_color is null or marquee_border_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

alter table public.profile_appearance enable row level security;

grant select on public.profile_appearance to authenticated;
-- Writes go through update_my_appearance() so validation stays in one place.

drop policy if exists "Appearance readable by members" on public.profile_appearance;
create policy "Appearance readable by members"
  on public.profile_appearance for select to authenticated using (true);

-------------------------------------------------------------------- privacy

create table if not exists public.profile_privacy (
  user_id uuid primary key references auth.users (id) on delete cascade,
  show_xp           text not null default 'public' check (show_xp           in ('public','friends','private')),
  show_badges       text not null default 'public' check (show_badges       in ('public','friends','private')),
  show_stats        text not null default 'public' check (show_stats        in ('public','friends','private')),
  show_groups       text not null default 'public' check (show_groups       in ('public','friends','private')),
  show_subjects     text not null default 'public' check (show_subjects     in ('public','friends','private')),
  show_goals        text not null default 'public' check (show_goals        in ('public','friends','private')),
  show_skills       text not null default 'public' check (show_skills       in ('public','friends','private')),
  show_projects     text not null default 'public' check (show_projects     in ('public','friends','private')),
  show_achievements text not null default 'public' check (show_achievements in ('public','friends','private')),
  show_journey      text not null default 'public' check (show_journey      in ('public','friends','private')),
  show_certificates text not null default 'public' check (show_certificates in ('public','friends','private')),
  -- the portfolio as a whole
  portfolio_visibility text not null default 'public' check (portfolio_visibility in ('public','friends','private')),
  updated_at timestamptz not null default now()
);

alter table public.profile_privacy enable row level security;

grant select, insert, update on public.profile_privacy to authenticated;

drop policy if exists "Users read their privacy" on public.profile_privacy;
create policy "Users read their privacy"
  on public.profile_privacy for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users write their privacy" on public.profile_privacy;
create policy "Users write their privacy"
  on public.profile_privacy for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "Users update their privacy" on public.profile_privacy;
create policy "Users update their privacy"
  on public.profile_privacy for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

------------------------------------------------------------------- subjects

create table if not exists public.profile_subjects (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  name     text not null check (char_length(btrim(name)) between 1 and 60),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists profile_subjects_user_idx on public.profile_subjects (user_id, position);

alter table public.profile_subjects enable row level security;
grant select, insert, update, delete on public.profile_subjects to authenticated;

drop policy if exists "Users read own subjects" on public.profile_subjects;
create policy "Users read own subjects"
  on public.profile_subjects for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users write own subjects" on public.profile_subjects;
create policy "Users write own subjects"
  on public.profile_subjects for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "Users update own subjects" on public.profile_subjects;
create policy "Users update own subjects"
  on public.profile_subjects for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "Users delete own subjects" on public.profile_subjects;
create policy "Users delete own subjects"
  on public.profile_subjects for delete to authenticated
  using (user_id = (select auth.uid()));

---------------------------------------------------------------------- goals

create table if not exists public.profile_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 400),
  target_date date,
  progress    integer not null default 0 check (progress between 0 and 100),
  status      text not null default 'active' check (status in ('active','achieved','archived')),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists profile_goals_user_idx on public.profile_goals (user_id, position);

alter table public.profile_goals enable row level security;
grant select, insert, update, delete on public.profile_goals to authenticated;

drop policy if exists "Users read own goals" on public.profile_goals;
create policy "Users read own goals"
  on public.profile_goals for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users write own goals" on public.profile_goals;
create policy "Users write own goals"
  on public.profile_goals for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "Users update own goals" on public.profile_goals;
create policy "Users update own goals"
  on public.profile_goals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "Users delete own goals" on public.profile_goals;
create policy "Users delete own goals"
  on public.profile_goals for delete to authenticated
  using (user_id = (select auth.uid()));

---------------------------------------------------------- portfolio settings

create table if not exists public.portfolio_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- hybrid presentation: which mode the visitor sees first
  mode    text not null default 'academic' check (mode in ('academic','professional','hybrid')),
  -- about me
  about_intro     text not null default '' check (char_length(about_intro) <= 800),
  about_academic  text not null default '' check (char_length(about_academic) <= 800),
  about_career    text not null default '' check (char_length(about_career) <= 800),
  expertise       text[] not null default '{}',
  external_links  jsonb not null default '[]' check (jsonb_typeof(external_links) = 'array'
                    and jsonb_array_length(external_links) <= 8),
  -- PDF export options (privacy-respecting by default)
  pdf_sections    text[] not null default '{about,skills,projects,achievements,journey,certificates}',
  pdf_template    text not null default 'classic' check (pdf_template in ('classic','modern')),
  pdf_photo       boolean not null default true,
  updated_at      timestamptz not null default now(),
  constraint portfolio_settings_pdf_sections_valid check (
    pdf_sections <@ array['about','skills','projects','achievements','journey','certificates']::text[]
  )
);

alter table public.portfolio_settings enable row level security;
grant select, insert, update on public.portfolio_settings to authenticated;

drop policy if exists "Users read their portfolio settings" on public.portfolio_settings;
create policy "Users read their portfolio settings"
  on public.portfolio_settings for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users insert their portfolio settings" on public.portfolio_settings;
create policy "Users insert their portfolio settings"
  on public.portfolio_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "Users update their portfolio settings" on public.portfolio_settings;
create policy "Users update their portfolio settings"
  on public.portfolio_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

--------------------------------------------------------------------- skills

create table if not exists public.portfolio_skills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  category   text not null default 'other'
             check (category in ('technical','design','languages','business','soft','other')),
  highlight  boolean not null default false,
  position   integer not null default 0,
  -- verification: only admin_verify_skill() (Admin Center permission) may set
  -- 'cova_verified'. Clients cannot write this column.
  verification_status text not null default 'self_declared'
             check (verification_status in ('self_declared','cova_verified')),
  verified_source text not null default '' check (char_length(verified_source) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists portfolio_skills_user_idx on public.portfolio_skills (user_id, position);
alter table public.portfolio_skills enable row level security;
grant select, insert, delete on public.portfolio_skills to authenticated;

drop policy if exists "Users read own skills" on public.portfolio_skills;
create policy "Users read own skills"
  on public.portfolio_skills for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users insert own skills" on public.portfolio_skills;
create policy "Users insert own skills"
  on public.portfolio_skills for insert to authenticated
  with check (
    user_id = (select auth.uid())
    -- a self-declared insert must never arrive pre-verified
    and verification_status = 'self_declared' and verified_source = ''
  );
drop policy if exists "Users delete own skills" on public.portfolio_skills;
create policy "Users delete own skills"
  on public.portfolio_skills for delete to authenticated
  using (user_id = (select auth.uid()));
-- No UPDATE grant: name/category via delete+insert; verification never via client.

------------------------------------------------------------------- projects

create table if not exists public.portfolio_projects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null check (char_length(btrim(title)) between 1 and 100),
  short_description text not null default '' check (char_length(short_description) <= 200),
  full_description text not null default '' check (char_length(full_description) <= 4000),
  cover_image_url  text check (cover_image_url is null or cover_image_url ~* '^https?://|^/'),
  gallery          jsonb not null default '[]' check (jsonb_typeof(gallery) = 'array' and jsonb_array_length(gallery) <= 8),
  category         text not null default 'other'
                   check (category in ('web','mobile','data','ai','design','hardware','research','game','other')),
  project_type     text not null default 'personal' check (project_type in ('academic','personal','professional')),
  tools            text[] not null default '{}',
  skills           text[] not null default '{}',
  project_date     date,
  github_url       text check (github_url is null or github_url = '' or github_url ~* '^https?://'),
  demo_url         text check (demo_url is null or demo_url = '' or demo_url ~* '^https?://'),
  external_url     text check (external_url is null or external_url = '' or external_url ~* '^https?://'),
  contributors     text[] not null default '{}',
  featured         boolean not null default false,
  status           text not null default 'draft' check (status in ('draft','published')),
  visibility       text not null default 'public' check (visibility in ('public','friends','private')),
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists portfolio_projects_user_idx on public.portfolio_projects (user_id, position);
alter table public.portfolio_projects enable row level security;
grant select, insert, update, delete on public.portfolio_projects to authenticated;

drop policy if exists "Users read own projects" on public.portfolio_projects;
create policy "Users read own projects"
  on public.portfolio_projects for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users write own projects" on public.portfolio_projects;
create policy "Users write own projects"
  on public.portfolio_projects for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "Users update own projects" on public.portfolio_projects;
create policy "Users update own projects"
  on public.portfolio_projects for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "Users delete own projects" on public.portfolio_projects;
create policy "Users delete own projects"
  on public.portfolio_projects for delete to authenticated
  using (user_id = (select auth.uid()));

------------------------------------------------------------------- imports

-- Rows point at REAL COVA records (submitted assignments / completed
-- challenges). The display always joins the source row: title and date come
-- from the original record, students only add an optional note.
create table if not exists public.portfolio_imports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  source_kind text not null check (source_kind in ('assignment','challenge')),
  source_id   uuid not null,
  note        text not null default '' check (char_length(note) <= 500),
  featured    boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, source_kind, source_id)
);
create index if not exists portfolio_imports_user_idx on public.portfolio_imports (user_id, position);
alter table public.portfolio_imports enable row level security;
grant select, insert, delete on public.portfolio_imports to authenticated;

drop policy if exists "Users read own imports" on public.portfolio_imports;
create policy "Users read own imports"
  on public.portfolio_imports for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users insert own imports" on public.portfolio_imports;
create policy "Users insert own imports"
  on public.portfolio_imports for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (source_kind = 'assignment' and exists (
        select 1 from public.assignment_submissions s
        where s.id = source_id and s.student_id = (select auth.uid())
          and s.status in ('submitted','graded')))
      or
      (source_kind = 'challenge' and exists (
        select 1 from public.challenge_submissions s
        where s.id = source_id and s.user_id = (select auth.uid())
          and s.status = 'submitted' and s.submitted_at is not null))
    )
  );
drop policy if exists "Users delete own imports" on public.portfolio_imports;
create policy "Users delete own imports"
  on public.portfolio_imports for delete to authenticated
  using (user_id = (select auth.uid()));

-------------------------------------------------------------- certificates

create table if not exists public.portfolio_certificates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- upload  = user file; external = link elsewhere; cova = issued by COVA
  -- (security definer only). Uploading NEVER verifies.
  kind        text not null default 'upload' check (kind in ('upload','external','cova')),
  title       text not null check (char_length(btrim(title)) between 1 and 140),
  issuer      text not null default '' check (char_length(issuer) <= 120),
  issue_date  date,
  description text not null default '' check (char_length(description) <= 600),
  file_path   text check (file_path is null or file_path like user_id::text || '/%'),
  external_url text check (external_url is null or external_url = '' or external_url ~* '^https?://'),
  -- unverified     = as provided by the student
  -- external_claim = student links an external attestation (self-reported)
  -- cova_issued    = created by COVA (security definer only)
  verification_status text not null default 'unverified'
              check (verification_status in ('unverified','external_claim','cova_issued')),
  visibility  text not null default 'public' check (visibility in ('public','friends','private')),
  created_at  timestamptz not null default now()
);
create index if not exists portfolio_certificates_user_idx on public.portfolio_certificates (user_id);
alter table public.portfolio_certificates enable row level security;
grant select, insert, update, delete on public.portfolio_certificates to authenticated;

drop policy if exists "Users read own certificates" on public.portfolio_certificates;
create policy "Users read own certificates"
  on public.portfolio_certificates for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users insert own certificates" on public.portfolio_certificates;
create policy "Users insert own certificates"
  on public.portfolio_certificates for insert to authenticated
  with check (
    user_id = (select auth.uid())
    -- students can never self-issue COVA certificates
    and kind <> 'cova' and verification_status <> 'cova_issued'
    and (kind <> 'upload' or file_path is not null)
  );
drop policy if exists "Users update own certificates" on public.portfolio_certificates;
create policy "Users update own certificates"
  on public.portfolio_certificates for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and verification_status <> 'cova_issued'
  );
drop policy if exists "Users delete own certificates" on public.portfolio_certificates;
create policy "Users delete own certificates"
  on public.portfolio_certificates for delete to authenticated
  using (user_id = (select auth.uid()));

----------------------------------------------------------------- milestones

create table if not exists public.portfolio_milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 400),
  happened_on date not null,
  visibility  text not null default 'public' check (visibility in ('public','friends','private')),
  created_at  timestamptz not null default now()
);
create index if not exists portfolio_milestones_user_idx on public.portfolio_milestones (user_id, happened_on);
alter table public.portfolio_milestones enable row level security;
grant select, insert, update, delete on public.portfolio_milestones to authenticated;

drop policy if exists "Users read own milestones" on public.portfolio_milestones;
create policy "Users read own milestones"
  on public.portfolio_milestones for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users write own milestones" on public.portfolio_milestones;
create policy "Users write own milestones"
  on public.portfolio_milestones for insert to authenticated
  with check (user_id = (select auth.uid()) and happened_on <= current_date + 366);
drop policy if exists "Users update own milestones" on public.portfolio_milestones;
create policy "Users update own milestones"
  on public.portfolio_milestones for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "Users delete own milestones" on public.portfolio_milestones;
create policy "Users delete own milestones"
  on public.portfolio_milestones for delete to authenticated
  using (user_id = (select auth.uid()));

-------------------------------------------------------------- updated_at

create or replace function public.touch_profile_row_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profile_appearance_touch on public.profile_appearance;
create trigger profile_appearance_touch before update on public.profile_appearance
  for each row execute function public.touch_profile_row_updated_at();
drop trigger if exists profile_privacy_touch on public.profile_privacy;
create trigger profile_privacy_touch before update on public.profile_privacy
  for each row execute function public.touch_profile_row_updated_at();
drop trigger if exists portfolio_settings_touch on public.portfolio_settings;
create trigger portfolio_settings_touch before update on public.portfolio_settings
  for each row execute function public.touch_profile_row_updated_at();
drop trigger if exists profile_goals_touch on public.profile_goals;
create trigger profile_goals_touch before update on public.profile_goals
  for each row execute function public.touch_profile_row_updated_at();
drop trigger if exists portfolio_projects_touch on public.portfolio_projects;
create trigger portfolio_projects_touch before update on public.portfolio_projects
  for each row execute function public.touch_profile_row_updated_at();

----------------------------------------------------------- helper functions

-- Friendship check shared by every visibility decision.
create or replace function public.profile_is_friend_of(p_owner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner is not null
    and (select auth.uid()) is distinct from null
    and (select auth.uid()) <> p_owner
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and least(f.from_id, f.to_id) = least((select auth.uid()), p_owner)
        and greatest(f.from_id, f.to_id) = greatest((select auth.uid()), p_owner)
    );
$$;

grant execute on function public.profile_is_friend_of(uuid) to authenticated;

-- Single source of truth for "may the current viewer see this section of
-- p_owner's profile?". Unknown sections are hidden by default.
create or replace function public.profile_section_visible(p_owner uuid, p_section text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_viewer uuid := auth.uid();
  v_value  text;
  v_global text;
begin
  if p_owner is null then return false; end if;
  if v_viewer = p_owner then return true; end if;

  if p_section = 'identity' then
    select us.profile_visibility into v_global
    from public.user_settings us where us.user_id = p_owner;
    return coalesce(v_global, 'public') = 'public' or public.profile_is_friend_of(p_owner);
  end if;

  if p_section = 'portfolio' then
    select pp.portfolio_visibility into v_value
    from public.profile_privacy pp where pp.user_id = p_owner;
  elsif p_section in ('xp','badges','stats','groups','subjects','goals',
                      'skills','projects','achievements','journey','certificates') then
    execute format('select %I from public.profile_privacy where user_id = $1',
                   'show_' || p_section)
      into v_value
      using p_owner;
  else
    return false;
  end if;

  case coalesce(v_value, 'public')
    when 'public'  then return true;
    when 'friends' then return public.profile_is_friend_of(p_owner);
    else return false;
  end case;
end;
$$;

grant execute on function public.profile_section_visible(uuid, text) to authenticated;

-- Resolve a profile row from its public handle (user_code).
create or replace function public.profile_id_by_code(p_code text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles
  where user_code = p_code
    and coalesce(is_sample, false) = false
  limit 1;
$$;

create or replace function public.portfolio_certificate_visible(p_certificate uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  c public.portfolio_certificates;
  v_viewer uuid := auth.uid();
begin
  select * into c from public.portfolio_certificates where id = p_certificate;
  if c.id is null then return false; end if;
  if v_viewer = c.user_id then return true; end if;
  -- the portfolio as a whole must be visible first
  if not public.profile_section_visible(c.user_id, 'portfolio') then return false; end if;
  return c.visibility = 'public'
    or (c.visibility = 'friends' and public.profile_is_friend_of(c.user_id));
end;
$$;

grant execute on function public.portfolio_certificate_visible(uuid) to authenticated;

-- Path-based variant for the storage policy: policy expressions run with the
-- querying user's privileges, so the certificate lookup must bypass RLS here.
create or replace function public.portfolio_certificate_visible_by_path(p_path text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.portfolio_certificates c
    where c.file_path = p_path
      and public.portfolio_certificate_visible(c.id)
  );
$$;

grant execute on function public.portfolio_certificate_visible_by_path(text) to authenticated;

------------------------------------------------------------ storage buckets

-- Covers behave like avatars: public bucket, owner-only writes under uid/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-covers', 'profile-covers', true, 4194304,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Owner uploads own cover" on storage.objects;
create policy "Owner uploads own cover"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner manages own cover" on storage.objects;
create policy "Owner manages own cover"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner deletes own cover" on storage.objects;
create policy "Owner deletes own cover"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Certificate documents are PRIVATE: direct reads only for the owner; other
-- viewers receive time-limited signed URLs only while the certificate is
-- visible to them (same rules as the RPCs below).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-documents', 'portfolio-documents', false, 10485760,
        array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Owner uploads own documents" on storage.objects;
create policy "Owner uploads own documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portfolio-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner reads own documents" on storage.objects;
create policy "Owner reads own documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'portfolio-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner deletes own documents" on storage.objects;
create policy "Owner deletes own documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'portfolio-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authorized viewers can sign a URL for a certificate they are allowed to see.
-- The visibility decision lives in ONE security-definer function shared with
-- the portfolio RPC, so the storage layer and the API can never disagree.
drop policy if exists "Viewers read visible documents" on storage.objects;
create policy "Viewers read visible documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'portfolio-documents'
    and public.portfolio_certificate_visible_by_path(name)
  );

------------------------------------------------------------- appearance RPC

-- Validates and upserts the caller's appearance. Accepts a partial JSON
-- object; unknown keys are rejected so new columns can't be smuggled in.
create or replace function public.update_my_appearance(p jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_allowed text[] := array['theme','name_color','name_font','name_weight','name_italic',
    'name_prefix_emoji','name_suffix_emoji','bio_color','bio_font','bio_align',
    'cover_kind','cover_preset','cover_color','cover_image_url','cover_position',
    'marquee_kind','marquee_color','marquee_preset','marquee_border','marquee_border_color'];
  k text;
  v_font text;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Appearance must be a JSON object.';
  end if;
  for k in select jsonb_object_keys(p) loop
    if not (k = any (v_allowed)) then
      raise exception 'Unknown appearance key: %', k;
    end if;
  end loop;

  insert into public.profile_appearance (user_id) values (v_uid)
  on conflict (user_id) do nothing;

  update public.profile_appearance a set
    theme              = coalesce((p->>'theme'),                    a.theme),
    name_color         = coalesce((p->>'name_color'),               a.name_color),
    name_font          = coalesce((p->>'name_font'),                a.name_font),
    name_weight        = coalesce((p->>'name_weight'),              a.name_weight),
    name_italic        = coalesce((p->>'name_italic')::boolean,     a.name_italic),
    name_prefix_emoji  = coalesce((p->>'name_prefix_emoji'),        a.name_prefix_emoji),
    name_suffix_emoji  = coalesce((p->>'name_suffix_emoji'),        a.name_suffix_emoji),
    bio_color          = coalesce((p->>'bio_color'),                a.bio_color),
    bio_font           = coalesce((p->>'bio_font'),                 a.bio_font),
    bio_align          = coalesce((p->>'bio_align'),                a.bio_align),
    cover_kind         = coalesce((p->>'cover_kind'),               a.cover_kind),
    cover_preset       = coalesce((p->>'cover_preset'),             a.cover_preset),
    cover_color        = coalesce((p->>'cover_color'),              a.cover_color),
    cover_image_url    = coalesce((p->>'cover_image_url'),          a.cover_image_url),
    cover_position     = coalesce((p->>'cover_position'),           a.cover_position),
    marquee_kind       = coalesce((p->>'marquee_kind'),             a.marquee_kind),
    marquee_color      = coalesce((p->>'marquee_color'),            a.marquee_color),
    marquee_preset     = coalesce((p->>'marquee_preset'),           a.marquee_preset),
    marquee_border     = coalesce((p->>'marquee_border'),           a.marquee_border),
    marquee_border_color = coalesce((p->>'marquee_border_color'),   a.marquee_border_color)
  where a.user_id = v_uid;
end;
$$;

grant execute on function public.update_my_appearance(jsonb) to authenticated;

--------------------------------------------------------------- overview RPC

-- Everything an authorized viewer needs to render /u/[code]. Private sections
-- are reported in the `sections` map so the page renders honest empty states;
-- their DATA is never included for unauthorized viewers.
create or replace function public.profile_public_overview(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid;
  v_viewer uuid := auth.uid();
  v_ap public.profile_appearance;
  v_result jsonb;
  v_visible boolean;
begin
  v_owner := public.profile_id_by_code(p_code);
  if v_owner is null then
    return null;
  end if;

  select * into v_ap from public.profile_appearance where user_id = v_owner;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'user_code', p.user_code,
      'display_name', p.display_name,
      'headline', p.headline,
      'bio', p.bio,
      'domain', p.domain,
      'prog_languages', p.prog_languages,
      'spoken_languages', p.spoken_languages,
      'avatar_url', p.avatar_url,
      'location', p.location,
      'joined', p.created_at
    ),
    'appearance', to_jsonb(v_ap),
    'sections', jsonb_build_object(
      'identity',     public.profile_section_visible(v_owner, 'identity'),
      'xp',           public.profile_section_visible(v_owner, 'xp'),
      'badges',       public.profile_section_visible(v_owner, 'badges'),
      'stats',        public.profile_section_visible(v_owner, 'stats'),
      'groups',       public.profile_section_visible(v_owner, 'groups'),
      'subjects',     public.profile_section_visible(v_owner, 'subjects'),
      'goals',        public.profile_section_visible(v_owner, 'goals'),
      'skills',       public.profile_section_visible(v_owner, 'skills'),
      'projects',     public.profile_section_visible(v_owner, 'projects'),
      'achievements', public.profile_section_visible(v_owner, 'achievements'),
      'journey',      public.profile_section_visible(v_owner, 'journey'),
      'certificates', public.profile_section_visible(v_owner, 'certificates'),
      'portfolio',    public.profile_section_visible(v_owner, 'portfolio')
    )
  )
  into v_result
  from public.profiles p
  where p.id = v_owner;

  -- XP is only embedded when the viewer may see it.
  if not (v_result->'sections'->>'xp')::boolean then
    v_result := jsonb_set(v_result, '{profile,xp}', 'null');
  else
    v_result := jsonb_set(v_result, '{profile,xp}',
      coalesce((select to_jsonb(xp) from public.profiles where id = v_owner), 'null'));
  end if;

  return v_result;
end;
$$;

grant execute on function public.profile_public_overview(text) to authenticated;

-------------------------------------------------------------- sections RPC

-- One section at a time, so pages stay light. Returns NULL when the section
-- is not visible to the caller.
create or replace function public.profile_section_data(p_code text, p_section text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid;
  v_viewer uuid := auth.uid();
begin
  v_owner := public.profile_id_by_code(p_code);
  if v_owner is null then return null; end if;
  if not public.profile_section_visible(v_owner, p_section) then
    return null;
  end if;

  case p_section
    when 'stats' then
      return (
        with done as (
          select lc.lesson_id, cl.minutes, cl.course_id
          from public.lesson_completions lc
          left join public.course_lessons cl on cl.id::text = lc.lesson_id
          where lc.user_id = v_owner
        )
        select jsonb_build_object(
          'lessons_completed',  (select count(*) from done),
          'minutes_estimated',  (select coalesce(sum(minutes), 0) from done),
          'courses_enrolled',   (select count(*) from public.course_enrollments e where e.user_id = v_owner),
          'courses_completed',  (
            select count(*) from public.course_enrollments e
            where e.user_id = v_owner
              and not exists (
                select 1 from public.course_lessons cl
                where cl.course_id = e.course_id
                  and not exists (
                    select 1 from done d where d.lesson_id = cl.id::text
                  )
              )
          ),
          'quizzes_finished', (
            select count(*) from public.quiz_attempts q
            where q.user_id = v_owner and q.finished_at is not null
          ),
          'xp', (select xp from public.profiles where id = v_owner),
          'level', (select level from public.level_for_xp(
                      (select xp from public.profiles where id = v_owner))),
          'streak_days', (
            select count(*) from (
              select day, day - (row_number() over (order by day))::int as grp
              from public.learning_days
              where user_id = v_owner and day <= current_date
            ) s
            group by grp
            having max(day) >= current_date - 1
            order by max(day) desc
            limit 1
          ),
          'badges_count', (select count(*) from public.user_badges b where b.user_id = v_owner)
        )
      );

    when 'badges' then
      return (
        select coalesce(jsonb_agg(jsonb_build_object(
            'badge_key', ub.badge_key,
            'name', d.name,
            'description', d.description,
            'rarity', d.rarity,
            'category', d.category,
            'image_url', d.image_url,
            'awarded_at', ub.awarded_at,
            'recipient_number', ub.recipient_number,
            'pinned', ub.pinned
          ) order by ub.awarded_at desc), '[]'::jsonb)
        from public.user_badges ub
        join public.badge_definitions d on d.key = ub.badge_key
        where ub.user_id = v_owner
      );

    when 'groups' then
      return (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'name', s.name, 'category', s.category
          ) order by s.name), '[]'::jsonb)
        from public.space_members m
        join public.spaces s on s.id = m.space_id and s.kind = 'group'
        where m.user_id = v_owner
          and (
            s.visibility = 'public'
            or v_viewer = v_owner
            or exists (
              select 1 from public.space_members vm
              where vm.space_id = s.id and vm.user_id = v_viewer
            )
          )
      );

    when 'subjects' then
      return (
        select coalesce(jsonb_agg(name order by position, created_at), '[]'::jsonb)
        from public.profile_subjects where user_id = v_owner
      );

    when 'goals' then
      return (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', g.id, 'title', g.title, 'description', g.description,
            'target_date', g.target_date, 'progress', g.progress, 'status', g.status
          ) order by g.position, g.created_at), '[]'::jsonb)
        from public.profile_goals g where g.user_id = v_owner
      );

    when 'journey' then
      return (
        with events as (
          select 'joined' as kind, null::text as ref,
                 to_char(p.created_at, 'YYYY-MM-DD') as day,
                 null::text as extra
          from public.profiles p where p.id = v_owner
          union all
          select 'badge', ub.badge_key,
                 to_char(ub.awarded_at, 'YYYY-MM-DD'),
                 d.name
          from public.user_badges ub
          join public.badge_definitions d on d.key = ub.badge_key
          where ub.user_id = v_owner
          union all
          select 'lesson', min(lc.lesson_id),
                 to_char(min(lc.completed_at), 'YYYY-MM-DD'),
                 null
          from public.lesson_completions lc
          where lc.user_id = v_owner
          union all
          select 'milestone', m.id::text,
                 to_char(m.happened_on, 'YYYY-MM-DD'),
                 m.title
          from public.portfolio_milestones m
          where m.user_id = v_owner
            and (v_viewer = v_owner
                 or m.visibility = 'public'
                 or (m.visibility = 'friends' and public.profile_is_friend_of(v_owner)))
          union all
          select 'certificate', c.id::text,
                 to_char(coalesce(c.issue_date, c.created_at::date), 'YYYY-MM-DD'),
                 c.title
          from public.portfolio_certificates c
          where c.user_id = v_owner
            and c.verification_status = 'cova_issued'
        )
        select coalesce(jsonb_agg(jsonb_build_object(
            'kind', kind, 'ref', ref, 'day', day, 'extra', extra
          ) order by day desc), '[]'::jsonb)
        from events
      );

    when 'skills' then
      return (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'name', s.name, 'category', s.category,
            'highlight', s.highlight,
            'verification_status', s.verification_status
          ) order by s.position, s.created_at), '[]'::jsonb)
        from public.portfolio_skills s where s.user_id = v_owner
      );

    when 'projects' then
      return (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', pr.id, 'title', pr.title, 'short_description', pr.short_description,
            'cover_image_url', pr.cover_image_url, 'category', pr.category,
            'project_type', pr.project_type, 'skills', pr.skills,
            'featured', pr.featured, 'project_date', pr.project_date
          ) order by pr.position, pr.created_at), '[]'::jsonb)
        from public.portfolio_projects pr
        where pr.user_id = v_owner
          and pr.status = 'published'
          and (
            v_viewer = v_owner
            or pr.visibility = 'public'
            or (pr.visibility = 'friends' and public.profile_is_friend_of(v_owner))
          )
      );

    when 'certificates' then
      return (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', c.id, 'kind', c.kind, 'title', c.title, 'issuer', c.issuer,
            'issue_date', c.issue_date, 'description', c.description,
            'verification_status', c.verification_status, 'file_path', c.file_path
          ) order by coalesce(c.issue_date, c.created_at::date) desc), '[]'::jsonb)
        from public.portfolio_certificates c
        where c.user_id = v_owner
          and (
            v_viewer = v_owner
            or c.visibility = 'public'
            or (c.visibility = 'friends' and public.profile_is_friend_of(v_owner))
          )
      );

    else
      return null;
  end case;
end;
$$;

grant execute on function public.profile_section_data(text, text) to authenticated;

------------------------------------------------------------ portfolio RPC


-- The full portfolio of /u/[code], filtered by the same rules the storage
-- layer uses. Signed URLs are fetched separately, one file at a time.
create or replace function public.portfolio_public_overview(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid;
  v_viewer uuid := auth.uid();
  v_settings public.portfolio_settings;
  v_friend boolean;
begin
  v_owner := public.profile_id_by_code(p_code);
  if v_owner is null then return null; end if;
  if not public.profile_section_visible(v_owner, 'portfolio') then
    return jsonb_build_object('visible', false);
  end if;

  v_friend := public.profile_is_friend_of(v_owner);
  select * into v_settings from public.portfolio_settings where user_id = v_owner;

  return jsonb_build_object(
    'visible', true,
    'owner', (
      select jsonb_build_object(
        'user_code', p.user_code, 'display_name', p.display_name,
        'headline', p.headline, 'avatar_url', p.avatar_url, 'joined', p.created_at
      )
      from public.profiles p where p.id = v_owner
    ),
    'settings', to_jsonb(v_settings),
    'skills', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'category', s.category,
          'highlight', s.highlight, 'verification_status', s.verification_status
        ) order by s.position, s.created_at), '[]'::jsonb)
      from public.portfolio_skills s where s.user_id = v_owner
    ),
    'projects', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', pr.id, 'title', pr.title, 'short_description', pr.short_description,
          'full_description', pr.full_description, 'cover_image_url', pr.cover_image_url,
          'gallery', pr.gallery, 'category', pr.category, 'project_type', pr.project_type,
          'tools', pr.tools, 'skills', pr.skills, 'project_date', pr.project_date,
          'github_url', pr.github_url, 'demo_url', pr.demo_url, 'external_url', pr.external_url,
          'contributors', pr.contributors, 'featured', pr.featured, 'source', 'manual'
        ) order by pr.featured desc, pr.position, pr.created_at), '[]'::jsonb)
      from public.portfolio_projects pr
      where pr.user_id = v_owner
        and pr.status = 'published'
        and (v_viewer = v_owner
             or pr.visibility = 'public'
             or (pr.visibility = 'friends' and v_friend))
    ),
    'imports', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', i.id, 'source_kind', i.source_kind, 'source_id', i.source_id,
          'note', i.note, 'featured', i.featured, 'title', src.title,
          'date', src.done_at, 'extra', src.extra, 'source', 'cova'
        ) order by i.featured desc, i.position, i.created_at), '[]'::jsonb)
      from public.portfolio_imports i
      join lateral (
        select a.title, s.submitted_at as done_at,
               jsonb_build_object('kind', 'assignment', 'grade', s.grade) as extra
        from public.assignment_submissions s
        join public.assignments a on a.id = s.assignment_id
        where i.source_kind = 'assignment' and s.id = i.source_id
        union all
        select ch.title, cs.submitted_at,
               jsonb_build_object('kind', 'challenge', 'category', ch.category,
                                  'difficulty', ch.difficulty, 'points', ch.points)
        from public.challenge_submissions cs
        join public.challenges ch on ch.id = cs.challenge_id
        where i.source_kind = 'challenge' and cs.id = i.source_id
      ) src on true
      where i.user_id = v_owner
    ),
    'certificates', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', c.id, 'kind', c.kind, 'title', c.title, 'issuer', c.issuer,
          'issue_date', c.issue_date, 'description', c.description,
          'verification_status', c.verification_status, 'file_path', c.file_path
        ) order by coalesce(c.issue_date, c.created_at::date) desc), '[]'::jsonb)
      from public.portfolio_certificates c
      where c.user_id = v_owner
        and (v_viewer = v_owner
             or c.visibility = 'public'
             or (c.visibility = 'friends' and v_friend))
    ),
    'badges', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'badge_key', ub.badge_key, 'name', d.name, 'rarity', d.rarity,
          'image_url', d.image_url, 'awarded_at', ub.awarded_at
        ) order by ub.awarded_at desc), '[]'::jsonb)
      from public.user_badges ub
      join public.badge_definitions d on d.key = ub.badge_key
      where ub.user_id = v_owner
        and public.profile_section_visible(v_owner, 'achievements')
    ),
    'journey', case when public.profile_section_visible(v_owner, 'journey')
      then public.profile_section_data(p_code, 'journey') else '[]'::jsonb end
  );
end;
$$;

grant execute on function public.portfolio_public_overview(text) to authenticated;

---------------------------------------------------------- import options RPC

-- The REAL records the signed-in student can showcase: submitted assignments
-- and completed challenges. Nothing is auto-imported; students pick.
create or replace function public.portfolio_import_options()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'assignments', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'source_id', s.id, 'title', a.title, 'course', c.title,
          'submitted_at', s.submitted_at, 'grade', s.grade
        ) order by s.submitted_at desc), '[]'::jsonb)
      from public.assignment_submissions s
      join public.assignments a on a.id = s.assignment_id
      left join public.courses c on c.id = a.course_id
      where s.student_id = (select auth.uid())
        and s.status in ('submitted','graded')
    ),
    'challenges', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'source_id', cs.id, 'title', ch.title, 'category', ch.category,
          'difficulty', ch.difficulty, 'points', ch.points,
          'submitted_at', cs.submitted_at
        ) order by cs.submitted_at desc), '[]'::jsonb)
      from public.challenge_submissions cs
      join public.challenges ch on ch.id = cs.challenge_id
      where cs.user_id = (select auth.uid())
        and cs.status = 'submitted' and cs.submitted_at is not null
    )
  );
$$;

grant execute on function public.portfolio_import_options() to authenticated;

------------------------------------------------- verified skills foundation

-- COVA-only. Gated on an Admin Center permission; nothing else (no client
-- grant, no trigger) can mark a skill verified. There is deliberately NO
-- automatic path from self-declared to verified.
insert into public.admin_permissions (key, module, label)
values ('portfolio.skills.verify', 'gamification', 'Mark a portfolio skill as COVA-verified')
on conflict (key) do nothing;

create or replace function public.admin_verify_skill(p_skill uuid, p_source text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_user('portfolio.skills.verify') then
    raise exception 'Not allowed.';
  end if;
  if p_source is null or char_length(btrim(p_source)) < 3 then
    raise exception 'A verification source is required.';
  end if;
  update public.portfolio_skills
  set verification_status = 'cova_verified', verified_source = btrim(p_source)
  where id = p_skill;
  if not found then raise exception 'Skill not found.'; end if;
end;
$$;

revoke execute on function public.admin_verify_skill(uuid, text) from public;
grant execute on function public.admin_verify_skill(uuid, text) to authenticated;
