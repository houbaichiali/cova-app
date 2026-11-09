# Student Profile & Portfolio — Audit and Enhancement Plan

Status: audit complete on `main` @ `c274763` (Admin Center merged).
Rule of the project: **enhance the existing profile, never rebuild it.**

## 1. What exists today (verified against the code)

### Real, Supabase-backed profile stack

| Piece | Location | Notes |
| --- | --- | --- |
| Own-profile editor | `/profile` → `src/components/profile/ProfileEditor.tsx` + `src/lib/profile.ts` | Edits `display_name`, `headline`, `domain`, `prog_languages[]`, `spoken_languages[]`, `bio`; avatar upload to the public `avatars` bucket (2 MB, mime-limited, own-folder). Working — preserve. |
| Identity | `profiles` table: `id`, `public_id`, `user_code` (live-DB column, e.g. `CV-XXXXXXXX`), `display_name`, `headline`, `tone`, `avatar_url`, `xp` (live-DB), `bio` (live-DB), `domain`, `prog_languages[]`, `spoken_languages[]`, `is_sample`, `locale` | `user_code` is the natural public handle for URLs. |
| XP + levels | `profiles.xp` (server-only writes), `xp_ledger` (idempotent `event_key`), `src/lib/level-curve.ts` = `50n² + 450n` (L0=0, L1=500, L2=1100, L3=1800, L4=2600, L5=3500 …), SQL twin `level_for_xp()` | Matches the product spec exactly. **Do not create a second curve.** |
| Badges | `badge_definitions` (rarity `common…legendary`, categories, editions, `image_url` added by the Admin Center), `user_badges` (`pinned`, `awarded_at`, recipient number), `my_badge_metrics()`, `evaluate_badges()` | Real, server-granted. 3-badge pinned showcase exists. |
| Badge collection UI | `/leaderboard?tab=badges` (`LeaderboardPageContent`) with category/rarity/state filters, progress, friend compare | Reuse as the "full collection" surface for self. |
| Achievements card | `src/components/learning/AchievementsCard.tsx` on `/profile` | Badges unlocked %, level, pinned showcase, recent wins. Enhance. |
| Privacy foundation | `user_settings`: `profile_visibility ('public'\|'private')`, `info_visibility ('everyone'\|'friends'\|'nobody')`, `allow_friend_requests`, `show_online_status`; RPC `get_visible_profiles()` enforces server-side | Extend, don't reinvent. |
| Friends | `friendships` table (pending/accepted, one row per pair) + `src/lib/social-store.ts` | Real. Needed for "friends-only" visibility. |
| Study groups | `spaces` (`kind='group'`, live-DB) + `space_members`; communities in `communities`/`community_members` | Display memberships with permission checks. |
| Learning activity | `lesson_completions` (live-DB, text lesson ids), `quiz_attempts` (finished_at, score), `course_enrollments` (live-DB), `learning_days` (streaks) | Real sources for learning statistics and the journey timeline. |
| Level/XP display | `Header.tsx`, `ProfileEditor` sidebar, `AchievementsCard`, `/leaderboard` | Consistent curve everywhere. |
| i18n | `src/i18n/messages/{en,fr,ar}.ts`, 1,800 aligned keys, `useT`/`getT` | All new UI must add keys to all three files. |
| Design system | Tailwind 4 `@theme` tokens (`cova-*`), `Card`, `Button`, `Badge`, `Modal`, `Tabs`, `EmptyState`, `Skeleton`, `Toast`, `ProgressBar`, dark mode, RTL | Reuse; no new primitives unless missing. |

### Demo/mock data (must not be confused with real profiles)

| Piece | Location | Notes |
| --- | --- | --- |
| Mock student page | `/profile/[id]` renders `@/data/students` (static demo) via `ProfileView.tsx` | Static demo content, linked from demo cards. Preserve as-is; real profiles get a new `/u/[user_code]` route so no URL is broken. |
| Mock groups/leaderboard | `@/data/groups`, `xpBreakdown(DemoState)` in `src/lib/progress.ts` | Demo mode only. `levelFor()` already aliases the real curve. |

### Live-database caveats (from `supabase/tests/05_base_schema_stub.sql`)

`profiles.bio`, `profiles.user_code`, `profiles.xp`, the `spaces` family,
`courses`/`course_enrollments`/`lesson_completions` exist in the **live
database** but their base DDL was never committed to this repository. The test
harness stubs them. Consequences for this project:

- New work must be **additive migrations only** — never recreate live tables/columns.
- Anything referencing `spaces`, `lesson_completions`, `course_enrollments`
  must tolerate the live shapes (e.g. `lesson_completions.lesson_id` is `text`).

### Gaps (does not exist today)

Cover image, profile appearance customization, draft preview, badge marquee,
public profile page for real users, portfolio (about/skills/projects/certificates),
section-level privacy, learning goals, favorite subjects, journey timeline,
PDF export, share actions.

## 2. Audit table — required action per feature

| Feature | Current state | Required action |
| --- | --- | --- |
| Profile header (avatar, name, bio, level, XP) | Working in editor sidebar; no public view | **Enhance**: add cover, location/education fields context, XP progress, portfolio link; render via shared `ProfilePageView` |
| Public profile of a real user | Missing (only mock `/profile/[id]`) | **Add**: `/u/[user_code]` built on existing tables + RPCs; keep `/profile/[id]` untouched |
| Profile editor | Working (`ProfileEditor`) | **Preserve** form; **Enhance** with tabs (Identity / Appearance / Sections / Privacy) + Preview button |
| Appearance customization | Missing | **Add**: `profile_appearance` table (whitelist-validated), themes, presets, live preview; no arbitrary CSS/HTML |
| Preview Profile | Missing | **Add**: draft preview overlay (desktop/tablet/mobile) fed by editor state; public view stays separate |
| Badge marquee | Missing | **Add**: continuous loop, pause on hover, reduced-motion, details modal, only earned badges, empty state |
| View All Badges | Exists for self (`/leaderboard?tab=badges`) | **Preserve**; marquee links to grid modal for others |
| XP / level display | Working, single curve | **Preserve** (reuse `levelForXp`) |
| Learning statistics | Partial (achievements card, dashboard) | **Add**: `profile_learning_stats()` RPC from real tables; no fabricated numbers |
| Favorite subjects | Missing | **Add** (`profile_subjects`) |
| Learning goals | Missing | **Add** (`profile_goals`) |
| Study groups display | Mock on demo profile | **Add**: real `spaces` memberships, visibility-checked |
| Skills (mixed self/verified) | Editor has `prog_languages` tags only | **Add**: `portfolio_skills` with `verification_status`; verified settable only server-side (foundation, no invented records) |
| Projects (manual) | Missing | **Add**: `portfolio_projects` CRUD |
| Projects (COVA import) | Missing | **Add**: `portfolio_imports` selecting real submissions (assignments, challenges) |
| Achievements | Pinned badges (3) exist | **Enhance**: showcase badges + certificates + featured projects; keep sources labeled |
| Learning journey | Missing | **Add**: timeline from real events (joined, badges, first lesson) + clearly-labeled manual milestones |
| Certificates & documents | Missing | **Add**: `portfolio_certificates` + **private** storage bucket with signed-URL RPC |
| Section privacy | Global `user_settings` only | **Add**: `profile_privacy` per-section (`public/friends/private`), enforced by security-definer RPCs + RLS (no direct grants on new tables) |
| Portfolio page | Missing | **Add**: `/u/[user_code]/portfolio`, academic/professional modes |
| Share / PDF | Missing | **Add**: copy-link actions; print-optimized route (`/portfolio/print`) using browser Save-as-PDF, privacy-filtered server-side |
| i18n / RTL / dark mode | Working | **Preserve**; all new strings in en/fr/ar; RTL-safe layout (logical properties) |

## 3. Design decisions

1. **URLs**: new routes `/u/[user_code]` and `/u/[user_code]/portfolio` (+ `/print`).
   Existing URLs unchanged (`/profile`, `/profile/[id]` demo, `/leaderboard?tab=badges`).
2. **Server-side privacy**: new tables get RLS with owner-only SELECT/write;
   non-owners read exclusively through security-definer RPCs that apply
   `profile_privacy` + `friendships` + row visibility. Nothing private is ever
   returned to an unauthorized browser.
3. **Appearance safety**: whitelisted fonts/presets/themes, `^#[0-9a-f]{6}$`
   colors, length-capped emoji prefixes, CHECK constraints + validating RPC;
   React renders values as text (no HTML injection). Contrast warnings client-side.
4. **No duplicate gamification**: XP/levels/badges keep the existing curve,
   tables and hooks; the profile only *displays* them.
5. **Verified skills**: `verification_status='cova_verified'` can only be set by
   a security-definer RPC gated on an Admin Center permission
   (`portfolio.skills.verify`). Nothing seeds fake verifications; the UI labels
   self-declared skills explicitly.
6. **Imports preserve authenticity**: imported projects join the original
   `assignments`/`challenges` rows for title/date; students only add optional
   notes, featuring and ordering.
7. **Additive migrations**: one migration file adds new tables, the
   `portfolio-documents` private bucket, RPCs and RLS; no existing table is
   altered destructively, no live column is recreated.
