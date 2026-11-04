-- Fix: the live profiles table predates the is_sample column that the repo
-- schema defines (admin statistics filter sample seeds out with it).
-- Additive and safe: every existing real account becomes is_sample = false.

alter table public.profiles
  add column if not exists is_sample boolean not null default false;
