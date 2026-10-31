-- Courses become MODULES: a module contains ordered lessons; resources attach
-- to the module (existing shared_resources/course_resources) or to a lesson
-- (new lesson_files); assignments attach to the module (course_id) and may
-- point at a lesson. Everything is defensive: existing rows keep working.

--------------------------------------------------------------- modules

alter table public.courses
  add column if not exists summary text not null default '',
  add column if not exists cover_path text,
  add column if not exists language text not null default '',
  add column if not exists objectives text not null default '',
  add column if not exists prerequisites text not null default '',
  add column if not exists estimated_minutes integer,
  add column if not exists difficulty text,
  add column if not exists access_type text not null default 'enrollment',
  add column if not exists visibility text not null default 'public',
  add column if not exists module_status text not null default 'published'
    check (module_status in ('draft', 'published', 'archived')),
  add column if not exists creation_type text not null default 'native'
    check (creation_type in ('external', 'native'));

grant update (summary, cover_path, language, objectives, prerequisites, estimated_minutes,
  difficulty, access_type, visibility, module_status, creation_type)
  on public.courses to authenticated;

---------------------------------------------------------------- lessons

alter table public.lessons
  add column if not exists lesson_type text not null default 'external'
    check (lesson_type in ('external', 'native')),
  add column if not exists position integer not null default 0,
  add column if not exists lesson_status text not null default 'published'
    check (lesson_status in ('draft', 'published')),
  add column if not exists content_blocks jsonb not null default '[]'::jsonb
    check (jsonb_typeof(content_blocks) = 'array'),
  add column if not exists objectives text not null default '',
  add column if not exists duration_minutes integer;

grant update (title, summary, content, lesson_type, position, lesson_status,
  content_blocks, objectives, duration_minutes) on public.lessons to authenticated;
grant insert (course_id, title, summary, content, lesson_type, position, lesson_status,
  content_blocks, objectives, duration_minutes) on public.lessons to authenticated;
grant delete on public.lessons to authenticated;

do $$
begin
  if to_regclass('public.lessons') is not null and to_regclass('public.courses') is not null then
    -- Teachers manage the lessons of their own modules; students read the
    -- published ones. Permissive policies combine with whatever exists.
    drop policy if exists "Course owners manage their lessons" on public.lessons;
    create policy "Course owners manage their lessons"
      on public.lessons for all to authenticated
      using (exists (select 1 from public.courses c where c.id = course_id and c.created_by = (select auth.uid())))
      with check (exists (select 1 from public.courses c where c.id = course_id and c.created_by = (select auth.uid())));

    drop policy if exists "Authenticated read published lessons" on public.lessons;
    create policy "Authenticated read published lessons"
      on public.lessons for select to authenticated
      using (
        lesson_status = 'published'
        or exists (select 1 from public.courses c where c.id = course_id and c.created_by = (select auth.uid()))
      );
  end if;
end $$;

------------------------------------------------------- lesson files (storage)

create table if not exists public.lesson_files (
  -- text on purpose: lessons.id is text in deployed databases.
  lesson_id    text not null,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null default 'application/octet-stream',
  file_size    integer not null default 0,
  position     integer not null default 0,
  can_download boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.lesson_files enable row level security;
grant select, insert, delete on public.lesson_files to authenticated;

do $$
begin
  if to_regclass('public.lesson_files') is not null then
    drop policy if exists "Course members read lesson files" on public.lesson_files;
    create policy "Course members read lesson files"
      on public.lesson_files for select to authenticated
      using (true);

    drop policy if exists "Course owners manage lesson files" on public.lesson_files;
    create policy "Course owners manage lesson files"
      on public.lesson_files for all to authenticated
      using (
        exists (
          select 1 from public.lessons l join public.courses c on c.id = l.course_id
          where l.id::text = lesson_files.lesson_id and c.created_by = (select auth.uid())
        )
      )
      with check (
        exists (
          select 1 from public.lessons l join public.courses c on c.id = l.course_id
          where l.id::text = lesson_files.lesson_id and c.created_by = (select auth.uid())
        )
      );
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('lesson-files', 'lesson-files', false, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "Module owners upload lesson files" on storage.objects;
create policy "Module owners upload lesson files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lesson-files'
    and exists (
      select 1 from public.lessons l join public.courses c on c.id = l.course_id
      where l.id::text = (storage.foldername(name))[1]
        and c.created_by = (select auth.uid())
    )
  );

drop policy if exists "Module owners delete lesson files" on storage.objects;
create policy "Module owners delete lesson files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lesson-files'
    and exists (
      select 1 from public.lessons l join public.courses c on c.id = l.course_id
      where l.id::text = (storage.foldername(name))[1]
        and c.created_by = (select auth.uid())
    )
  );

drop policy if exists "Authenticated read lesson files" on storage.objects;
create policy "Authenticated read lesson files"
  on storage.objects for select to authenticated
  using (bucket_id = 'lesson-files');

------------------------------------------------- activities: lesson attachment

alter table public.assignments
  add column if not exists lesson_id text;

grant update (lesson_id) on public.assignments to authenticated;
