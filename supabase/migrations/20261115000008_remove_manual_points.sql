-- =============================================================================
-- COVA — Remove manual reward inputs from the server path (additive).
--
-- Phase 6 of the community/rewards overhaul:
--   1. challenges.points becomes a derived DISPLAY ceiling: the column drops
--      NOT NULL and a BEFORE INSERT trigger derives it from the difficulty
--      (Easy 50 / Medium 100 / Hard 200 — mirroring the reward_rules seeds).
--      Authors never type an amount any more; legacy clients that still send
--      one keep working (the explicit value wins, CHECK 1..1000 still applies).
--      No existing row is modified.
--   2. submit_challenge now pays XP through the reward rules engine: the
--      active rule for (challenges, submit, <difficulty>) sets the maximum XP,
--      scaled by the answer ratio (partial credit preserved), credited through
--      grant_xp with a rule:-prefixed ledger key, once per challenge per user.
--      Legacy fallback: when no active rule exists, the behaviour from the
--      hardening migration is kept (round(points * ratio), key challenge:<id>)
--      so disabling all rules restores the pre-engine behaviour exactly.
-- =============================================================================

---------------------------------------------- 1. derive challenge display points
alter table public.challenges alter column points drop not null;

create or replace function public.derive_challenge_points()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.points is null then
    new.points := case new.difficulty
      when 'Easy' then 50
      when 'Hard' then 200
      else 100
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_points_derive on public.challenges;
create trigger challenge_points_derive
  before insert on public.challenges
  for each row execute function public.derive_challenge_points();

------------------------------------- 2. submit_challenge pays through the rules
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
  v_diff text;
  v_rule_xp integer;
  v_max integer;
  v_amount integer;
  v_event_key text;
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

  -- XP through the reward rules: active rule for this difficulty sets the
  -- maximum; partial credit scales it. Falls back to the legacy points
  -- column when no rule covers the activity.
  if answer_count > 0 and correct_count > 0 then
    v_diff := lower(challenge_row.difficulty);
    select r.global_xp into v_rule_xp
      from public.reward_rules r
      where r.category = 'challenges' and r.activity = 'submit' and r.active
        and r.difficulty in (v_diff, 'standard')
      order by case when r.difficulty = v_diff then 0 else 1 end
      limit 1;
    if found and v_rule_xp > 0 then
      v_max := v_rule_xp;
      v_event_key := 'rule:challenges:submit:' || v_diff || ':' || p_challenge_id::text;
    else
      v_max := greatest(1, round(coalesce(challenge_row.points, 0)));
      v_event_key := 'challenge:' || p_challenge_id::text;
    end if;
    v_amount := greatest(1, round(v_max * correct_count::numeric / answer_count))::int;
    if not exists (
      select 1 from public.xp_ledger l
      where l.user_id = current_user_id and l.event_key = v_event_key
    ) then
      perform public.grant_xp(current_user_id, v_event_key, v_amount,
        'challenge: ' || challenge_row.title);
      perform public.notify(current_user_id, 'xp_earned', current_user_id,
        '/challenges/' || p_challenge_id::text, challenge_row.title,
        v_amount::text);
    end if;
  end if;

  return awarded;
end;
$$;

revoke all on function public.submit_challenge(uuid, jsonb, text, text, text) from public;
grant execute on function public.submit_challenge(uuid, jsonb, text, text, text) to authenticated;
