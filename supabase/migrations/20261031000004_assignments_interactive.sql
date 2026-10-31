-- Interactive assignments: two creation modes (external file drop / in-COVA
-- interactive exam), attempts with a SERVER-side timer, autosave, and grading.
--
-- Existing submissions and their flow are untouched: external assignments keep
-- the assignment_submissions path (protect_assignment_submission still grades
-- them). Interactive assignments run through assignment_attempts below.

--------------------------------------------------------------- new columns

alter table public.assignments
  add column if not exists mode text not null default 'external'
    check (mode in ('external', 'interactive')),
  add column if not exists summary text not null default '',
  add column if not exists category text not null default '',
  add column if not exists subject text not null default '',
  add column if not exists level text not null default '',
  add column if not exists difficulty text
    check (difficulty is null or difficulty in ('easy', 'medium', 'hard')),
  add column if not exists estimated_minutes integer,
  add column if not exists available_from timestamptz,
  add column if not exists submission_formats text[] not null default '{}',
  add column if not exists max_file_mb integer,
  add column if not exists submission_instructions text not null default '',
  add column if not exists lesson_title text not null default '',
  add column if not exists section_title text not null default '',
  add column if not exists thumbnail_path text,
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'published')),
  add column if not exists time_limit_minutes integer,
  add column if not exists attempts_allowed integer not null default 1
    check (attempts_allowed between 1 and 10),
  add column if not exists randomize_questions boolean not null default false,
  add column if not exists show_results_immediately boolean not null default true,
  add column if not exists allow_review boolean not null default true,
  add column if not exists access_type text not null default 'all';

-- Assignments that were already built from exercises are interactive.
update public.assignments
set mode = 'interactive'
where mode = 'external'
  and jsonb_array_length(questions) > 0
  and exercise_type not in ('file');

grant update (status) on public.assignments to authenticated;

------------------------------------------------------------------- attempts

create table if not exists public.assignment_attempts (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments (id) on delete cascade,
  student_id     uuid not null references auth.users (id) on delete cascade,
  attempt_number integer not null,
  started_at     timestamptz not null default now(),
  deadline_at    timestamptz,
  autosaved_at   timestamptz,
  answers        jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  submitted_at   timestamptz,
  score          numeric(8, 2),
  feedback       text not null default '',
  status         text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'graded')),
  unique (assignment_id, student_id, attempt_number)
);
create index if not exists assignment_attempts_assignment_idx
  on public.assignment_attempts (assignment_id, status, submitted_at desc);

alter table public.assignment_attempts enable row level security;
grant select on public.assignment_attempts to authenticated;

drop policy if exists "Students and owners read attempts" on public.assignment_attempts;
create policy "Students and owners read attempts"
  on public.assignment_attempts for select to authenticated
  using (
    student_id = (select auth.uid())
    or exists (select 1 from public.assignments a where a.id = assignment_id and a.created_by = (select auth.uid()))
  );

-- Students act through the RPCs below (server timer + grading); owners grade
-- directly with the columns they own.
drop policy if exists "Owners grade attempts" on public.assignment_attempts;
create policy "Owners grade attempts"
  on public.assignment_attempts for update to authenticated
  using (
    exists (select 1 from public.assignments a where a.id = assignment_id and a.created_by = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.assignments a where a.id = assignment_id and a.created_by = (select auth.uid()))
  );
grant update (score, feedback, status) on public.assignment_attempts to authenticated;

--------------------------------------------------------------- RPCs (server)

-- Starts (or resumes) an attempt. The deadline is computed HERE, so reloading
-- the page or editing the browser cannot extend the time.
create or replace function public.start_assignment_attempt(p_assignment_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := (select auth.uid());
  a public.assignments%rowtype;
  previous public.assignment_attempts%rowtype;
  attempt_count integer;
  deadline timestamptz;
begin
  if sid is null then raise exception 'Sign in first.'; end if;
  select * into a from public.assignments where id = p_assignment_id;
  if not found then raise exception 'Assignment not found'; end if;
  if a.created_by = sid then raise exception 'Authors cannot take their own assignment'; end if;
  if a.status <> 'published' then raise exception 'This assignment is not published yet'; end if;
  if a.available_from is not null and now() < a.available_from then
    raise exception 'This assignment opens later';
  end if;
  if a.due_at < now() then raise exception 'The deadline has passed'; end if;

  select * into previous from public.assignment_attempts
  where assignment_id = p_assignment_id and student_id = sid
  order by attempt_number desc limit 1;

  if found and previous.status = 'in_progress' then
    return jsonb_build_object('attempt', to_jsonb(previous), 'server_time', now());
  end if;

  select count(*) into attempt_count
  from public.assignment_attempts
  where assignment_id = p_assignment_id and student_id = sid;
  if attempt_count >= coalesce(a.attempts_allowed, 1) then
    raise exception 'No attempts left';
  end if;

  deadline := case
    when a.time_limit_minutes is null then null
    else least(now() + make_interval(mins => a.time_limit_minutes), a.due_at)
  end;

  insert into public.assignment_attempts (assignment_id, student_id, attempt_number, deadline_at)
  values (p_assignment_id, sid, attempt_count + 1, deadline)
  returning * into previous;

  return jsonb_build_object('attempt', to_jsonb(previous), 'server_time', now());
end;
$$;
grant execute on function public.start_assignment_attempt(uuid) to authenticated;

-- Autosave: own in-progress attempt, before its deadline (+45s of tolerance).
create or replace function public.save_assignment_attempt(p_attempt_id uuid, p_answers jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  att public.assignment_attempts%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first.'; end if;
  select * into att from public.assignment_attempts where id = p_attempt_id;
  if not found or att.student_id <> (select auth.uid()) then raise exception 'Attempt not found'; end if;
  if att.status <> 'in_progress' then raise exception 'This attempt is already submitted'; end if;
  if att.deadline_at is not null and now() > att.deadline_at + interval '45 seconds' then
    raise exception 'Time is over';
  end if;
  update public.assignment_attempts
  set answers = coalesce(p_answers, '[]'::jsonb), autosaved_at = now()
  where id = p_attempt_id;
end;
$$;
grant execute on function public.save_assignment_attempt(uuid, jsonb) to authenticated;

-- Submits and grades an attempt. Past the deadline (+45s tolerance) the last
-- autosaved answers are used, whatever the client sends.
create or replace function public.submit_assignment_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := (select auth.uid());
  att public.assignment_attempts%rowtype;
  a public.assignments%rowtype;
  keys jsonb;
  key_count integer := 0;
  question_count integer;
  objective_count integer := 0;
  correct_count integer := 0;
  i integer;
  given jsonb;
  want jsonb;
  answer jsonb;
  score numeric;
begin
  if sid is null then raise exception 'Sign in first.'; end if;
  select * into att from public.assignment_attempts where id = p_attempt_id;
  if not found or att.student_id <> sid then raise exception 'Attempt not found'; end if;
  if att.status <> 'in_progress' then raise exception 'This attempt is already submitted'; end if;

  select * into a from public.assignments where id = att.assignment_id;

  if att.deadline_at is not null and now() > att.deadline_at + interval '45 seconds' then
    given := att.answers;
  else
    given := coalesce(p_answers, att.answers);
  end if;

  select k.answer_key into keys from public.assignment_answer_keys k where k.assignment_id = att.assignment_id;
  key_count := coalesce(jsonb_array_length(keys), 0);
  question_count := coalesce(jsonb_array_length(a.questions), 0);

  for i in 0..greatest(key_count, 1) - 1 loop
    want := keys -> i;
    if want is null or want = 'null'::jsonb then continue; end if;
    objective_count := objective_count + 1;
    answer := case when i < coalesce(jsonb_array_length(given), 0) then given -> i else null end;
    if answer is null then continue; end if;
    if jsonb_typeof(want) = 'string' then
      -- Short answer: the key holds "expected|accepted variant|..." (case-insensitive).
      if lower(btrim(answer #>> '{}')) = any (
        select lower(btrim(part)) from unnest(string_to_array(want #>> '{}', '|')) as part
      ) then correct_count := correct_count + 1; end if;
    elsif jsonb_typeof(want) = 'array' and jsonb_typeof(answer) = 'array' then
      if (
        select jsonb_agg(v order by v::numeric) from jsonb_array_elements_text(want) v
      ) = (
        select jsonb_agg(v order by v::numeric) from jsonb_array_elements_text(answer) v
      ) then correct_count := correct_count + 1; end if;
    elsif answer = want then
      correct_count := correct_count + 1;
    end if;
  end loop;

  score := case
    when objective_count > 0 then round(a.points * correct_count::numeric / objective_count, 2)
    else null
  end;

  update public.assignment_attempts
  set status = 'submitted', submitted_at = now(), answers = given, score = score
  where id = p_attempt_id;

  return jsonb_build_object(
    'score', score,
    'points', a.points,
    'needs_manual', question_count > objective_count,
    'objective_total', objective_count,
    'correct', correct_count
  );
end;
$$;
grant execute on function public.submit_assignment_attempt(uuid, jsonb) to authenticated;

-- Owner grading for the manual parts (written answers, code): final score and
-- feedback, then the student is notified.
create or replace function public.grade_assignment_attempt(p_attempt_id uuid, p_score numeric, p_feedback text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  att public.assignment_attempts%rowtype;
  a public.assignments%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first.'; end if;
  select * into att from public.assignment_attempts where id = p_attempt_id;
  if not found then raise exception 'Attempt not found'; end if;
  select * into a from public.assignments where id = att.assignment_id;
  if a.created_by <> (select auth.uid()) then raise exception 'Only the assignment author can grade'; end if;
  if att.status = 'in_progress' then raise exception 'The attempt is not submitted yet'; end if;
  if p_score is not null and (p_score < 0 or p_score > a.points) then
    raise exception 'Score must be between 0 and the assignment points';
  end if;

  update public.assignment_attempts
  set score = p_score, feedback = coalesce(p_feedback, ''), status = 'graded'
  where id = p_attempt_id;

  perform public.notify(att.student_id, 'assignment_graded', (select auth.uid()),
    '/assignments/' || att.assignment_id::text, a.title,
    rtrim(rtrim(coalesce(p_score, 0)::text, '0'), '.'));
end;
$$;
grant execute on function public.grade_assignment_attempt(uuid, numeric, text) to authenticated;

-- The author hears about a new submission.
create or replace function public.notify_on_attempt_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a_title text;
  student_name text;
begin
  if tg_op = 'UPDATE' and old.status = 'submitted' then return null; end if;
  if new.status <> 'submitted' then return null; end if;
  select title into a_title from public.assignments where id = new.assignment_id;
  select display_name into student_name from public.profiles where id = new.student_id;
  perform public.notify(
    (select created_by from public.assignments where id = new.assignment_id),
    'attempt_submitted', new.student_id,
    '/assignments/' || new.assignment_id::text,
    coalesce(a_title, ''), coalesce(student_name, ''));
  return null;
end;
$$;

do $$
begin
  if to_regclass('public.assignment_attempts') is not null then
    drop trigger if exists attempt_submit_notify on public.assignment_attempts;
    create trigger attempt_submit_notify
    after insert or update on public.assignment_attempts
    for each row execute function public.notify_on_attempt_write();
  end if;
end $$;

-- The new notification kind respects the "Assignments" preference.
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
    when 'attempt_submitted' then notify_assignments
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
