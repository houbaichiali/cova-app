-- COVA ADMIN CENTER — Phase 5: administrative settings.
-- A small, typed, audited configuration store. Only settings that REAL code
-- consumes are registered here — no decorative flags. Sensitive global
-- operations (MFA enforcement, service-role usage, database credentials) are
-- deliberately NOT settings: they stay locked in code/env (the settings UI
-- shows them read-only).
--
-- Registered at launch (consumed by):
--   moderation.xp_review_threshold  -> admin_xp_history needs_review flag
--   gamification.xp_adjust_max      -> admin_xp_adjust amount cap
--   moderation.report_queue_limit   -> admin_reports_list page size
--
-- Writes go through admin_settings_update: key must be registered, value must
-- match the declared type and range, a reason is mandatory, every change is
-- audited with before/after values.

create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  type        text not null check (type in ('integer','boolean','string')),
  category    text not null check (category in ('general','community','moderation','notifications','gamification','content','security','maintenance')),
  description text not null default '',
  min_value   numeric,
  max_value   numeric,
  choices     text[],
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.platform_settings enable row level security;

insert into public.platform_settings (key, value, type, category, description, min_value, max_value) values
  ('moderation.xp_review_threshold', '300', 'integer', 'moderation',
   'XP amounts at or above this value are flagged “needs review” in the admin XP ledger.', 0, 100000),
  ('gamification.xp_adjust_max', '100000', 'integer', 'gamification',
   'Maximum absolute XP per manual administrative adjustment.', 1, 1000000),
  ('moderation.report_queue_limit', '200', 'integer', 'moderation',
   'Maximum number of reports returned per load in the moderation center.', 20, 1000)
on conflict (key) do nothing;

------------------------------------------------------------------------ RPCs

create or replace function public.admin_settings_list()
returns table (
  key text, value jsonb, type text, category text, description text,
  min_value numeric, max_value numeric, choices text[],
  updated_by uuid, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_user() then
    raise exception 'Admin access required';
  end if;
  return query
  select s.key, s.value, s.type, s.category, s.description,
         s.min_value, s.max_value, s.choices, s.updated_by, s.updated_at
  from public.platform_settings s
  order by s.category, s.key;
end;
$$;

create or replace function public.admin_settings_update(
  p_key text, p_value jsonb, p_reason text
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_row   public.platform_settings%rowtype;
  v_int   integer;
  v_bool  boolean;
  v_text  text;
begin
  if not public.is_admin_user('settings.manage') then
    raise exception 'Missing permission: settings.manage';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is mandatory';
  end if;
  select * into v_row from public.platform_settings where key = p_key;
  if not found then raise exception 'Unknown setting'; end if;

  if v_row.type = 'integer' then
    begin
      v_int := (p_value)::text::integer;
    exception when others then
      raise exception 'Value must be an integer';
    end;
    if v_row.min_value is not null and v_int < v_row.min_value then
      raise exception 'Value below the minimum (%)', v_row.min_value;
    end if;
    if v_row.max_value is not null and v_int > v_row.max_value then
      raise exception 'Value above the maximum (%)', v_row.max_value;
    end if;
  elsif v_row.type = 'boolean' then
    begin
      v_bool := (p_value)::text::boolean;
    exception when others then
      raise exception 'Value must be a boolean';
    end;
  else
    begin
      v_text := (p_value)::text;
    exception when others then
      raise exception 'Value must be a string';
    end;
    if v_row.choices is not null and not (v_text = any (v_row.choices)) then
      raise exception 'Value must be one of the allowed choices';
    end if;
  end if;

  update public.platform_settings
    set value = p_value, updated_by = v_actor, updated_at = now()
    where key = p_key;

  perform public.admin_audit('settings.update', 'setting', p_key,
    btrim(p_reason),
    jsonb_build_object('before', v_row.value, 'after', p_value));

  return jsonb_build_object('key', p_key, 'value', p_value);
end;
$$;

-- consumption: the XP review threshold and the adjustment cap now come from
-- the settings table (with the historical values as safe fallbacks).
create or replace function public.admin_setting_int(p_key text, p_default integer)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (value)::text::integer from public.platform_settings where key = p_key),
    p_default)
$$;

revoke all on function public.admin_settings_list() from public, anon;
revoke all on function public.admin_settings_update(text, jsonb, text) from public, anon;
revoke all on function public.admin_setting_int(text, integer) from public, anon;
grant execute on function public.admin_settings_list() to authenticated;
grant execute on function public.admin_settings_update(text, jsonb, text) to authenticated;

-- rewire the two consumers to the settings store
create or replace function public.admin_xp_history(
  p_query text default '', p_only_needs_review boolean default false, p_limit integer default 100
)
returns table (
  id uuid, user_id uuid, user_code text, display_name text,
  event_key text, amount integer, reason text, created_at timestamptz,
  needs_review boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_threshold integer := public.admin_setting_int('moderation.xp_review_threshold', 300);
begin
  if not public.is_admin_user('gamification.xp.adjust') then
    raise exception 'Missing permission: gamification.xp.adjust';
  end if;
  return query
  select l.id, l.user_id, p.user_code, p.display_name,
         l.event_key, l.amount, l.reason, l.created_at,
         (l.event_key like 'admin:%' or l.amount >= v_threshold) as needs_review
  from public.xp_ledger l
  join public.profiles p on p.id = l.user_id
  where (p_query = '' or p.user_code ilike '%' || p_query || '%'
         or p.display_name ilike '%' || p_query || '%'
         or l.event_key ilike '%' || p_query || '%')
    and (not p_only_needs_review or l.event_key like 'admin:%' or l.amount >= v_threshold)
  order by l.created_at desc
  limit least(coalesce(p_limit, 100), 500);
end;
$$;

create or replace function public.admin_xp_adjust(
  p_user uuid, p_amount integer, p_reason text, p_idempotency_key text
)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_key   text;
  v_max   integer := public.admin_setting_int('gamification.xp_adjust_max', 100000);
begin
  if not public.is_admin_user('gamification.xp.adjust') then
    raise exception 'Missing permission: gamification.xp.adjust';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'A reason of at least 5 characters is mandatory';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{6,64}$' then
    raise exception 'Idempotency key required';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > v_max then
    raise exception 'Amount must be a non-zero integer within ±%', v_max;
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_user and not pr.is_sample) then
    raise exception 'Unknown student';
  end if;

  v_key := 'admin:' || p_idempotency_key;
  begin
    insert into public.xp_ledger (user_id, event_key, amount, reason)
    values (p_user, v_key, p_amount, '[admin] ' || btrim(p_reason));
  exception when unique_violation then
    raise exception 'This exact adjustment was already applied (idempotency key replay)';
  end;

  update public.profiles set xp = coalesce(xp, 0) + p_amount where id = p_user;

  perform public.admin_audit('gamification.xp_adjust', 'user', p_user::text,
    btrim(p_reason), jsonb_build_object('amount', p_amount, 'ledger_event', v_key));
  return p_amount;
end;
$$;

revoke all on function public.admin_xp_history(text, boolean, integer) from public, anon;
grant execute on function public.admin_xp_history(text, boolean, integer) to authenticated;
revoke all on function public.admin_xp_adjust(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_xp_adjust(uuid, integer, text, text) to authenticated;
