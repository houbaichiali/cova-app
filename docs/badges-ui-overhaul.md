# COVA — Badges UI overhaul: evolving badges, ranks, showcase & detail view

**Branche :** `feat/community-rewards-badges-overhaul` (base `b7784b9`) · **Statut :** implémenté, vérifié (typecheck/lint/build/tests verts) · **Base de données : non contactée, aucune migration appliquée.**

Ce document accompagne la refonte de l'expérience badges exigée après la Phase 8/9 SQL de `docs/rewards-badges-audit.md`. La couche données (rangs, récompenses, visibilité) était livrée ; la couche produit ne l'exposait pas.

## 1. Why the badge interface remained unchanged

The previous overhaul shipped Phases 8–9 **as SQL only** (`20261115000009_badge_ranks.sql`, `20261115000010_admin_badge_ranks.sql`): `badge_definitions.ranks` (jsonb 8-ladder), `badge_rank_awards`, `evaluate_badge_ranks()`, `my_badge_ranks()`, `visibility_mode`. **No frontend file consumed any of it.** Concretely:

- `src/lib/gamification.ts` fetched `badge_definitions` + `user_badges` only; `buildBadgeList` rendered **one card per definition row**, and progressive tiers ARE separate rows (`bookworm`, `bookworm-unc`, …) → up to 5 "Bookworm" cards. The comment "editions of a reached higher tier hide lower unreached editions" (gamification.ts:137 pre-change) was never implemented.
- `my_badge_ranks` was consumed by exactly one component (`AchievementsCard`) as raw text chips (no colors, no progression).
- No detail view existed; clicking a card only pinned it.
- Rank naming existed in three incompatible places (SQL `Novice…Mythic`, edition names `Silver/Gold/Platinum/Legendary`, no UI identity at all).
- `RARITY_STYLE` was duplicated in two files with `common` (amber) ≈ `rare` (yellow) nearly identical.
- `/leaderboard?tab=badges` deep links ignored `?tab` (hardcoded `useState("xp")`).

## 2. What was missing

Rank identity (names/colors), one-card-per-achievement aggregation, the 8-rank detail experience, profile showcase, rank-level friend comparison, data-driven categories, deep-link support, XP-first visual hierarchy.

## 3. Files modified

| File | Change |
|---|---|
| `src/lib/gamification.ts` | Fetches `my_badge_ranks()` in parallel; `BadgeDefinition` gains `sort_order`, `image_url`, `visibility_mode`, `ranks`; new `togglePinFamily()` (pin a collapsed achievement: pins the highest achieved edition, unpins the whole family, enforces the 3-slot showcase across achievements); re-exports rarity/category identity from `badge-ranks.ts` (single source). Existing `togglePin`, `buildBadgeList`, `xpTypeOf`, friends leaderboard untouched. |
| `src/components/learning/LeaderboardPageContent.tsx` | Badge Achievements tab rebuilt around `BadgeShowcase`; XP tab untouched; `?tab=badges` deep link honored; friend comparison adds per-achievement rank rows (`badge_rank_awards` is public to authenticated; friend edition rows follow RLS — only visible data is compared). |
| `src/components/learning/AchievementsCard.tsx` | Pinned showcase and rank chips now show real names with rank colors (was raw `badge_key` chips). |
| `src/components/profile/BadgeMarquee.tsx` | Collapses editions to one chip per achievement with the latest rank's identity; click opens the full `BadgeDetailModal`, graceful fallback to the legacy earned-on modal when definitions/awards are unavailable (anonymous viewers). |
| `src/components/profile/ProfilePageView.tsx` · `src/components/portfolio/PortfolioView.tsx` | Load `badge_definitions` once and pass them + owner code to the marquee. |
| `src/components/ui/Modal.tsx` | Additive `size?: "md" \| "lg"` prop (default unchanged). |
| `src/app/globals.css` | `cova-badge-shine` keyframes + `prefers-reduced-motion` guard. |
| `src/i18n/spaces.ts` | 38 new keys × en/fr/ar (cards, detail view, stats, showcase, 12 metric labels, rank comparison). |

## 4. New components

- **`src/lib/badge-ranks.ts`** — the shared rank identity: `Bronze, Silver, Gold, Platinum, Diamond, Master, Prestige, Heroic` (8 distinct gradients/rings/chips), the deduplicated rarity identity (5 distinct colors), category list. Pure module, no imports.
- **`src/lib/badge-collection.ts`** — the aggregation engine (pure, testable): `buildAchievements(definitions, badges, rankAwards, metrics)` → one `Achievement` per logical success with `tiers[≤8]`, `currentRank`, `next`, progress, real per-tier XP, pin target, visibility. Plus `isVisibleAchievement()` (secret/hidden until earned; private owner-only) and `tierAwardCount()`.
- **`src/components/badges/BadgeCard.tsx`** — the evolving card: trophy in the current rank's gradient, `Rank N · Name` chip, rarity chip, edition number for limited badges, progress bar to the next rank, XP to earn, pin control.
- **`src/components/badges/BadgeDetailModal.tsx`** — the game-style progression view: hero trophy (current rank color + shine), current stat (`{value} {metric}`), progress bar to the next rank, the complete path (2/4 columns responsive) with unlocked ✅ / current 🔔 ring / locked 🔒 states, XP per milestone, and the evolution history with dates.
- **`src/components/badges/BadgeShowcase.tsx`** — shared collection surface (Leaderboard + Profile): XP header FIRST, then completion stats; data-driven category chips; rarity/state/search filters; loading skeleton, honest empty/no-match states (`EmptyState`).
- **`scripts/test-badge-progression.ts`** (+ `scripts/badge-alias.mjs` alias hook) — 20 pure-logic tests.

## 5. How the eight-rank progression works

- When `badge_definitions.ranks` is configured (today: `bookworm`, thresholds 10/25/50/100/200/400/800/1600), **that ladder is authoritative**: tier positions map 1:1 to the rank identity, and a tier is achieved when `badge_rank_awards` holds the award **or** when the same counter the server uses (`my_badge_metrics`) satisfies the server's own predicate (`metric ≥ threshold`). XP per tier is the real `xp_reward` the DB grants per rank award.
- Otherwise, the family's **edition rows** (shared display stem, e.g. `On Fire · Gold`) become the tiers: real thresholds, real edition names, real per-edition XP — position in the family maps to the rank color. Nothing is invented; unlock conditions and XP are exactly as seeded.
- The server keeps granting: editions via `evaluate_badges` (`badge:<key>`), ranks via `evaluate_badge_ranks` (`badge_rank:<key>:<rank>`), both idempotent (unique constraints). The UI never writes XP.

## 6. How one-card-per-badge is guaranteed

All rows are grouped by **name stem** (`badgeStem`: everything before "·"). Every surface (Leaderboard tab, Profile marquee, dashboard card, friend comparison) renders `buildAchievements` output — one card per stem, showing only the highest achieved tier. Unit tests assert it (test 5), including the Bookworm case: editions 10/25/50/100/250 + the 8-ladder collapse into ONE card with 8 tiers.

## 7. How the badge detail view works

Clicking any card/chip opens `BadgeDetailModal` (native `<dialog>` via `Modal`, focus trap, Escape). It renders the ten required elements (§ Phase 2C). For profile marquees it lazily resolves `badge_definitions` + the owner's `badge_rank_awards` on first click, caching both; if unresolvable (anonymous viewer), it falls back to the legacy earned-on modal instead of faking data.

## 8. How Leaderboard and Profile share the same data/logic

Both render through `badge-collection.ts` + `badge-ranks.ts` + the same components (`BadgeShowcase`, `BadgeDetailModal`). The Leaderboard passes the signed-in member's own rows (RLS: own `user_badges`); profiles pass the viewed member's visible rows (portfolio RPC + pinned editions via RLS + public rank awards). No second badge system exists.

## 9. XP preservation & duplication protection

Zero changes to XP math, ledger, levels, graphs or leaderboard logic (regression suite 29/29 still green). Badge/rank XP remains server-side and idempotent: `xp_ledger.unique(user_id, event_key)` + `badge_rank_awards.unique(user, badge_key, rank)` + the exists-check in `evaluate_badge_ranks`. The UI displays only DB-side rewards (`xp_reward` of the tier source) and never sums speculative totals; no XP resets, no client writes to `xp_ledger`/`profiles.xp`.

## 10. Database migration required (file only — NOT applied)

**`supabase/migrations/20261115000013_badge_rank_labels.sql`** — aligns `badge_rank_label()` with the new identity (`Rank 1 · Bronze` … `Rank 8 · Heroic`) so server strings (`my_badge_ranks`, ledger reasons, notifications) stop mixing the old `Novice…Mythic` naming with the UI. Additive `create or replace function`; no tables/policies/triggers touched; historical ledger reasons keep their original wording. Apply manually: `psql "$DATABASE_URL" -f supabase/migrations/20261115000013_badge_rank_labels.sql`.

Known divergences documented (no silent changes): (a) rank labels beyond the seeded ladder are admin-configured (`gm.detail.partialLadder` explains it in-app); (b) the 10-category spec never fully materialized in the DB (sections 7 and 9 of the original seed were never seeded) — the UI category list is now **data-driven**, so it shows exactly what exists; adding the two missing categories requires new badges, not UI hardcoding; (c) `bookworm` edition 250 vs ladder rank 5 at 200 coexist by design — the ladder governs ranks, editions remain the XP history.

## 11. Test results & limitations

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 error |
| `npm run lint` | ✅ 0 error (9 pre-existing warnings, unchanged) |
| `npm run build` | ✅ compiled, 51/51 pages |
| `scripts/test-badge-progression.ts` (new) | ✅ 20/20 (identity, one-card, latest rank, ladder vs editions, awards, XP per tier, pinning, visibility, progress math) |
| `scripts/test-xp-levels.ts` (regression) | ✅ 29/29 |
| SQL RLS harness | unchanged, still owner-run (no PostgreSQL in sandbox; nothing executed against Supabase) |

Limitations: (1) the rank identity is fixed in `badge-ranks.ts`; localized rank names would require a product decision (kept identical across locales to avoid mixing systems); (2) friend edition badges beyond pinned rows are RLS-hidden by design — comparison uses rank awards (public) + pinned rows only, and says so; (3) live rendering was validated statically (types/build/tests), not in a running browser in this sandbox; (4) nothing was committed, pushed, or executed against the production database.
