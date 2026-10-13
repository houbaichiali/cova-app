-- Preferred site language, saved on the account so it follows the person to any device.
-- The people who can change it are the same as for the other profile fields (RLS: own row only).

alter table public.profiles
  add column if not exists locale text
  check (locale is null or locale in ('en', 'fr', 'ar'));

grant update (locale) on public.profiles to authenticated;
