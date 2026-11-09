-- COVA ADMIN CENTER — Phase 5: educational content quality review.
-- Non-destructive: one new table + one additive column. No content is ever
-- modified silently — the review module records DECISIONS; the only content
-- mutations it performs are visibility changes (quiz -> private, resource ->
-- hidden), both reversible and audited. Quiz questions and answer keys are
-- NEVER touched by this module.
--
-- Distinction of concerns (required by the spec):
--   * community moderation     -> /admin/moderation (reports, sanctions)
--   * educational quality      -> /admin/content (this module, permission
--                                 content.review held by content_manager)
--   * content editing          -> stays with authors (course/quiz editors);
--                                 reviewers do not need write access to content
--                                 tables and get none.
--
-- content_reviews references existing content polymorphically (content_type +
-- content_id): no duplicate content system, no FK that would block the live
-- tables. A title/category snapshot is stored for display only.

create table if not exists public.content_reviews (
  id            uuid primary key default gen_random_uuid(),
  content_type  text not null check (content_type in ('quiz', 'resource')),
  content_id    uuid not null,
  title         text not null default '',
  category      text not null default '',
  author_id     uuid references auth.users (id) on delete set null,
  status        text not null default 'pending'
                check (status in ('pending','approved','correction_requested','flagged','hidden','removed')),
  reviewer_id   uuid references auth.users (id) on delete set null,
  review_note   text not null default '' check (char_length(review_note) <= 2000),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  updated_at    timestamptz not null default now(),
  unique (content_type, content_id)
);
create index if not exists content_reviews_status_idx
  on public.content_reviews (status, content_type, updated_at desc);

alter table public.content_reviews enable row level security;
-- No direct grants: staff access goes through the definer RPCs below.

-------------------------------------------------- additive: resource hiding
-- `hidden` lets an authorized reviewer take a resource out of the student
-- view without deleting anything. Owner and admins keep read access.
alter table public.shared_resources
  add column if not exists hidden boolean not null default false;

-- Restrictive change (NOT a weakening): previously every authenticated user
-- could read every resource; hidden rows are now limited to their owner and
-- the admin staff. Re-run safe (drops and recreates the same policy name).
drop policy if exists "Authenticated users can view shared resources" on public.shared_resources;
create policy "Authenticated users can view shared resources"
  on public.shared_resources for select to authenticated using (
    not hidden
    or uploaded_by = (select auth.uid())
    or public.is_admin_user()
  );

------------------------------------------------------------------------ RPCs

-- The review queue with the current content facts joined in (titles never go
-- stale in the UI; the snapshot columns cover deleted content).
create or replace function public.admin_content_queue(
  p_type text default '', p_status text default 'pending'
)
returns table (
  id uuid, content_type text, content_id uuid, title text, category text,
  author_id uuid, status text, reviewer_id uuid, review_note text,
  created_at timestamptz, reviewed_at timestamptz,
  live_title text, live_exists boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user('content.review') then
    raise exception 'Missing permission: content.review';
  end if;
  return query
  select r.id, r.content_type, r.content_id, r.title, r.category,
         r.author_id, r.status, r.reviewer_id, r.review_note,
         r.created_at, r.reviewed_at,
         coalesce(q.title, res.title, r.title),
         (q.id is not null or res.id is not null)
  from public.content_reviews r
  left join public.quizzes q on r.content_type = 'quiz' and q.id = r.content_id
  left join public.shared_resources res on r.content_type = 'resource' and res.id = r.content_id
  where (p_type = '' or r.content_type = p_type)
    and (p_status = '' or r.status = p_status)
  order by r.updated_at desc
  limit 200;
end;
$$;

-- Browse content that is NOT in the queue yet, so a reviewer can add it.
create or replace function public.admin_content_browse(p_type text, p_query text default '')
returns table (
  content_id uuid, title text, category text, author_id uuid, created_at timestamptz,
  extra text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user('content.review') then
    raise exception 'Missing permission: content.review';
  end if;
  if p_type = 'quiz' then
    return query
    select q.id, q.title, q.category, q.created_by, q.created_at,
           q.question_count::text || ' questions'
    from public.quizzes q
    where not exists (
      select 1 from public.content_reviews r where r.content_type = 'quiz' and r.content_id = q.id
    )
    and (p_query = '' or q.title ilike '%' || p_query || '%')
    order by q.created_at desc
    limit 100;
  elsif p_type = 'resource' then
    return query
    select s.id, s.title, s.category, s.uploaded_by, s.created_at,
           s.type
    from public.shared_resources s
    where not exists (
      select 1 from public.content_reviews r where r.content_type = 'resource' and r.content_id = s.id
    )
    and (p_query = '' or s.title ilike '%' || p_query || '%')
    order by s.created_at desc
    limit 100;
  else
    raise exception 'Unknown content type';
  end if;
end;
$$;

-- Add an existing content item to the review queue.
create or replace function public.admin_content_enqueue(p_type text, p_content uuid)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_id     uuid;
  v_title  text;
  v_cat    text;
  v_author uuid;
begin
  if not public.is_admin_user('content.review') then
    raise exception 'Missing permission: content.review';
  end if;
  if p_type = 'quiz' then
    select title, category, created_by into v_title, v_cat, v_author
    from public.quizzes where id = p_content;
  elsif p_type = 'resource' then
    select title, category, uploaded_by into v_title, v_cat, v_author
    from public.shared_resources where id = p_content;
  else
    raise exception 'Unknown content type';
  end if;
  if v_title is null then raise exception 'Content not found'; end if;

  insert into public.content_reviews (content_type, content_id, title, category, author_id)
  values (p_type, p_content, v_title, coalesce(v_cat, ''), v_author)
  on conflict (content_type, content_id) do nothing
  returning id into v_id;

  if v_id is null then raise exception 'Already in the review queue'; end if;
  perform public.admin_audit('content.enqueue', p_type, p_content::text, v_title);
  return v_id;
end;
$$;

-- Assign the review to the current admin.
create or replace function public.admin_content_assign(p_review uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  if not public.is_admin_user('content.review') then
    raise exception 'Missing permission: content.review';
  end if;
  update public.content_reviews
    set reviewer_id = v_actor, updated_at = now()
    where id = p_review;
  if not found then raise exception 'Review not found'; end if;
  perform public.admin_audit('content.assign', 'review', p_review::text);
end;
$$;

-- Decide. Approved / correction / flag never touch the content itself.
-- hide / remove are visibility-only, reversible, and audited.
create or replace function public.admin_content_decide(
  p_review uuid, p_action text, p_note text default ''
)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_row    public.content_reviews%rowtype;
  v_status text;
begin
  if not public.is_admin_user('content.review') then
    raise exception 'Missing permission: content.review';
  end if;
  select * into v_row from public.content_reviews where id = p_review;
  if not found then raise exception 'Review not found'; end if;

  if p_action in ('approve', 'request_correction', 'flag') then
    v_status := case p_action
      when 'approve' then 'approved'
      when 'request_correction' then 'correction_requested'
      else 'flagged' end;
  elsif p_action = 'hide' then
    if v_row.content_type = 'quiz' then
      update public.quizzes set visibility = 'private' where id = v_row.content_id;
    elsif v_row.content_type = 'resource' then
      update public.shared_resources set hidden = true where id = v_row.content_id;
    end if;
    v_status := 'hidden';
  elsif p_action = 'unhide' then
    if v_row.content_type = 'quiz' then
      update public.quizzes set visibility = 'public' where id = v_row.content_id;
    elsif v_row.content_type = 'resource' then
      update public.shared_resources set hidden = false where id = v_row.content_id;
    end if;
    v_status := 'pending';
  elsif p_action = 'remove' then
    -- Removal = the strongest visibility action, still reversible (no delete).
    if v_row.content_type = 'quiz' then
      update public.quizzes set visibility = 'private' where id = v_row.content_id;
    elsif v_row.content_type = 'resource' then
      update public.shared_resources set hidden = true where id = v_row.content_id;
    end if;
    v_status := 'removed';
  else
    raise exception 'Unknown action';
  end if;

  update public.content_reviews set
    status = v_status,
    reviewer_id = v_actor,
    review_note = coalesce(btrim(p_note), review_note),
    reviewed_at = now(),
    updated_at = now()
    where id = p_review;

  perform public.admin_audit('content.' || p_action, v_row.content_type,
    v_row.content_id::text, coalesce(btrim(p_note), ''));
  return v_status;
end;
$$;

revoke all on function public.admin_content_queue(text, text) from public, anon;
revoke all on function public.admin_content_browse(text, text) from public, anon;
revoke all on function public.admin_content_enqueue(text, uuid) from public, anon;
revoke all on function public.admin_content_assign(uuid) from public, anon;
revoke all on function public.admin_content_decide(uuid, text, text) from public, anon;
grant execute on function public.admin_content_queue(text, text) to authenticated;
grant execute on function public.admin_content_browse(text, text) to authenticated;
grant execute on function public.admin_content_enqueue(text, uuid) to authenticated;
grant execute on function public.admin_content_assign(uuid) to authenticated;
grant execute on function public.admin_content_decide(uuid, text, text) to authenticated;
