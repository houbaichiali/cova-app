-- =============================================================================
-- COVA — Badge rank labels aligned with the new visual identity (additive).
--
-- The badge UI (src/lib/badge-ranks.ts) renders the shared eight-rank
-- identity: Bronze, Silver, Gold, Platinum, Diamond, Master, Prestige, Heroic.
-- This migration updates badge_rank_label() so every SERVER-produced string
-- (my_badge_ranks labels, XP ledger reasons from evaluate_badge_ranks,
-- badge_rank notifications) uses the same names — no mixing of the old
-- "Novice…Mythic" labels with the new identity.
--
-- Additive only: no table, column, policy or trigger changes; historical
-- xp_ledger.reason strings keep the wording they were written with (they are
-- history, not configuration).
--
-- Manual application (never executed by the app):
--   psql "$DATABASE_URL" -f supabase/migrations/20261115000013_badge_rank_labels.sql
-- =============================================================================

create or replace function public.badge_rank_label(p_rank integer)
returns text
language sql
immutable
as $$
  select case p_rank
    when 1 then 'Rank 1 · Bronze'
    when 2 then 'Rank 2 · Silver'
    when 3 then 'Rank 3 · Gold'
    when 4 then 'Rank 4 · Platinum'
    when 5 then 'Rank 5 · Diamond'
    when 6 then 'Rank 6 · Master'
    when 7 then 'Rank 7 · Prestige'
    when 8 then 'Rank 8 · Heroic'
    else 'Rank ' || p_rank
  end
$$;
