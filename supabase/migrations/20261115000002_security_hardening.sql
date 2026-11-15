-- =============================================================================
-- COVA — Community security hardening (additive, non-destructive).
--
-- Closes the P0 findings of the Phase 0 audit (docs/rewards-badges-audit.md):
--   1. public.quiz_grant_xp is EXECUTE-grantable to PUBLIC (its twin grant_xp
--      is properly revoked) — any signed-in user could mint XP via PostgREST.
--   2. `dm-media` and `space-media` buckets are PUBLIC and readable by anon;
--      direct-message media leaks to anyone holding the URL. They also have
--      no server-side size limit (25 MB cap is client-only) and their insert
--      policies let any authenticated user write ANY path.
--   3. Moderation sanctions (restriction/suspension) only gate the UI shell —
--      no policy references moderation_sanctions, so suspended users can keep
--      posting, messaging and friending through the raw API.
--   4. portfolio_skills has no UPDATE grant/policy, so the portfolio
--      highlight toggle (PortfolioManager.tsx) fails with permission denied.
--   5. submit_challenge credits profiles.xp directly, bypassing xp_ledger —
--      challenge XP is invisible to period leaderboards and XP analytics.
--
-- Behaviour note for (5): XP per challenge is now idempotent — a user earns a
-- challenge's XP once, ever (event_key `challenge:<challenge_id>`), and only
-- when at least one answer is correct. Re-taking a challenge no longer re-awards
-- XP, matching the spec rule "one activity must not award its reward twice".
-- profiles.xp is NOT recomputed from the ledger: historical challenge XP that
-- predates the ledger is preserved as-is.
-- =============================================================================

------------------------------------------------------------- 1. XP privilege fix
-- quiz_grant_xp is only called by quiz_attempt_finish / quiz_award_live_xp,
-- both SECURITY DEFINER — revoking client execution does not affect them.
-- The quiz API route calls quiz_award_live_xp (not quiz_grant_xp) directly.
revoke all on function public.quiz_grant_xp(p_user uuid, p_event text, p_amount integer, p_reason text)
  from public, anon, authenticated;

----------------------------------------------------------- 2. Media storage fixes
-- Both buckets go private with the 25 MB limit the client already enforces.
-- MIME whitelisting is deliberately NOT added: storage compares against the
-- client-declared content type, which is not a security boundary, and the
-- composer accepts arbitrary file attachments.
update storage.buckets
  set public = false, file_size_limit = 26214400  -- 25 MB, matches MAX_MEDIA_BYTES
  where id in ('space-media', 'dm-media');

-- Reads: signed-in members only (was: authenticated, anon).
drop policy if exists "space media read" on storage.objects;
create policy "space media read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'space-media');

drop policy if exists "dm media read" on storage.objects;
create policy "dm media read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'dm-media');

-- Helper: first path segment as uuid, or null when it is not one. Storage
-- policies run per row, so a raw `::uuid` cast on a stray folder name would
-- raise and fail the whole upload instead of evaluating to false.
create or replace function public.storage_uuid_folder(p_name text)
returns uuid
language sql
stable
as $$
  select case
    when (storage.foldername(p_name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
    else null
  end
$$;

-- Uploads into space-media must target a space the user belongs to or owns
-- (the client already uploads to `<spaceId>/<file>` — media-upload.ts).
drop policy if exists "space media insert" on storage.objects;
create policy "space media insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'space-media'
    and (
      public.is_space_member(public.storage_uuid_folder(name))
      or exists (
        select 1 from public.spaces s
        where s.id = public.storage_uuid_folder(name)
          and s.owner_id = (select auth.uid())
      )
    )
  );

-- Uploads into dm-media must live in the sender's own folder
-- (`<uid>/<file>` — ChatComposer now passes the sender id as the prefix).
drop policy if exists "dm media insert" on storage.objects;
create policy "dm media insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dm-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Delete stays owner-only (unchanged semantics, recreated for clarity).
drop policy if exists "space media delete" on storage.objects;
create policy "space media delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'space-media' and owner = auth.uid());

drop policy if exists "dm media delete" on storage.objects;
create policy "dm media delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'dm-media' and owner = auth.uid());

------------------------------------------------------ 3. Sanctions gating (server-side)
-- me_sanctions() returns the caller's ACTIVE restriction/suspension/ban rows
-- (20261104000006_moderation.sql). Bans already block at the auth layer; from
-- now on restrictions and suspensions also block social WRITES at RLS level.

-- No new friend requests while sanctioned.
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    from_id = auth.uid()
    and status = 'pending'
    and not exists (select 1 from public.me_sanctions())
  );

-- Cannot accept a request while sanctioned (cancel/decline stay allowed so the
-- person can still clean up their queue).
drop policy if exists friendships_accept on public.friendships;
create policy friendships_accept on public.friendships
  for update to authenticated
  using (
    to_id = auth.uid()
    and status = 'pending'
    and not exists (select 1 from public.me_sanctions())
  )
  with check (
    to_id = auth.uid()
    and status = 'accepted'
    and not exists (select 1 from public.me_sanctions())
  );

-- No direct messages while sanctioned. Two policies exist historically
-- (20261012000002 and 20261031000003 recreated dm_insert_own) — both must gate.
drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages
  for insert to authenticated
  with check (
    from_id = auth.uid()
    and not exists (select 1 from public.me_sanctions())
  );

drop policy if exists dm_insert_own on public.direct_messages;
create policy dm_insert_own on public.direct_messages
  for insert to authenticated
  with check (
    from_id = (select auth.uid())
    and not exists (select 1 from public.me_sanctions())
  );

-- No space/community posts while sanctioned (v3 semantics + sanctions gate).
do $$
begin
  if to_regclass('public.space_posts') is not null then
    drop policy if exists space_posts_insert_v3 on public.space_posts;
    create policy space_posts_insert_v3 on public.space_posts
      for insert to authenticated
      with check (
        author_id = auth.uid()
        and public.is_space_member(space_id)
        and not exists (select 1 from public.me_sanctions())
      );
  end if;
end
$$;

------------------------------------------------------- 4. portfolio_skills UPDATE fix
-- Clients may edit their own rows but only through the granted columns:
-- verification_status / verified_source are NOT granted, so a user can never
-- flip themselves to 'cova_verified' (only admin_verify_skill() can).
grant update (name, category, highlight, position) on public.portfolio_skills to authenticated;

drop policy if exists "Users update own skills" on public.portfolio_skills;
create policy "Users update own skills"
  on public.portfolio_skills for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

--------------------------------------------------- 5. submit_challenge → xp_ledger
-- Same scoring formula, same author-exclusion and start-first guards; the XP
-- write now goes through grant_xp (idempotent, ledger-visible) instead of a
-- raw profiles.xp update. Rounding: numeric score → integer XP (≥ 1 on any
-- partial success; zero-correct submissions award and notify nothing).
create or replace function public.submit_challenge(
  p_challenge_id uuid,
  p_answers jsonb,
  p_response_text text,
  p_storage_path text,
  p_file_name text
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := (select auth.uid());
  challenge_row public.challenges%rowtype;
  keys jsonb;
  answer_count integer;
  correct_count integer := 0;
  answer_index integer;
  awarded numeric;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select * into challenge_row from public.challenges where id = p_challenge_id;
  if not found then raise exception 'Challenge not found'; end if;
  if challenge_row.created_by = current_user_id then raise exception 'Authors cannot submit their own challenge'; end if;
  if p_storage_path is not null and (split_part(p_storage_path, '/', 1) <> challenge_row.id::text or split_part(p_storage_path, '/', 2) <> current_user_id::text) then
    raise exception 'Challenge file path does not match the user and challenge';
  end if;
  if not exists (select 1 from public.challenge_submissions s where s.challenge_id = p_challenge_id and s.user_id = current_user_id and s.status = 'in_progress') then
    raise exception 'Start the challenge before submitting';
  end if;
  select answer_key into keys from public.challenge_answer_keys where challenge_id = p_challenge_id;
  answer_count := jsonb_array_length(coalesce(keys, '[]'::jsonb));
  if answer_count > 0 then
    for answer_index in 0..answer_count - 1 loop
      if (p_answers -> answer_index) = (keys -> answer_index) then correct_count := correct_count + 1; end if;
    end loop;
    awarded := round(challenge_row.points * correct_count::numeric / answer_count, 2);
  else
    awarded := null;
  end if;
  update public.challenge_submissions set status = 'submitted', answers = coalesce(p_answers, '[]'::jsonb),
    response_text = coalesce(p_response_text, ''), storage_path = p_storage_path, file_name = p_file_name,
    score = awarded, submitted_at = now()
  where challenge_id = p_challenge_id and user_id = current_user_id and status = 'in_progress';
  if awarded is not null and awarded > 0 then
    -- grant_xp is idempotent per (user, 'challenge:<id>'); skip both the grant
    -- and the notification when this challenge already paid out, so a re-take
    -- never sends a misleading "you earned XP" message.
    if not exists (
      select 1 from public.xp_ledger l
      where l.user_id = current_user_id and l.event_key = 'challenge:' || p_challenge_id::text
    ) then
      perform public.grant_xp(
        current_user_id,
        'challenge:' || p_challenge_id::text,
        greatest(1, round(awarded))::int,
        'challenge: ' || challenge_row.title
      );
      perform public.notify(current_user_id, 'xp_earned', current_user_id,
        '/challenges/' || p_challenge_id::text, challenge_row.title,
        rtrim(rtrim(awarded::text, '0'), '.'));
    end if;
  end if;
  return awarded;
end;
$$;

revoke all on function public.submit_challenge(uuid, jsonb, text, text, text) from public;
grant execute on function public.submit_challenge(uuid, jsonb, text, text, text) to authenticated;
