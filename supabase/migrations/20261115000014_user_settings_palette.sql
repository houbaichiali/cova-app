-- Migration 20261115000014_user_settings_palette.sql
--
-- Adds the persisted color palette preference (11 officially approved
-- palettes, Soft Blue default). The client code works WITHOUT this column:
-- it falls back to localStorage until the migration is applied, then the
-- preference syncs across the account's devices through user_settings
-- realtime.
--
-- Owned and applied manually by the project owner (no db push from tooling).
-- No RLS policy change: the column rides the existing user_settings policies
-- (owner-select/owner-update on user_id).
--
-- Risk assessment:
--   * ADD COLUMN ... NOT NULL DEFAULT: online-safe backfill, no table rewrite
--     blocking concerns at this table's size (one row per user).
--   * CHECK constraint guards against client typos; existing rows get the
--     default, nothing is deleted or altered otherwise.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS palette text NOT NULL DEFAULT 'soft-blue';

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_palette_check;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_palette_check CHECK (palette IN (
    'soft-blue',
    'three-blue',
    'academic-tech-premium',
    'forest-copper',
    'midnight-lavender',
    'arctic-minimal',
    'burgundy-champagne',
    'sage-stone',
    'sand-terracotta',
    'graphite-mint',
    'mono-creative'
  ));
