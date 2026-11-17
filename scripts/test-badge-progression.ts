/* Tests for the evolving badge system: rank identity, one-card-per-achievement
 * aggregation, latest-rank selection, progression math, XP per tier, pinning
 * targets and visibility rules.
 * Run with: node --import ./scripts/badge-alias.mjs scripts/test-badge-progression.ts
 * (Node 22.6+ strips TS types natively; the alias hook maps "@/lib/x" to src.)
 */

import assert from "node:assert/strict";
import {
  buildAchievements,
  badgeStem,
  isVisibleAchievement,
  tierAwardCount,
  type RankAward,
} from "../src/lib/badge-collection.ts";
import { rankName, rankStyle, rarityStyle, RANK_COUNT, RANK_NAMES } from "../src/lib/badge-ranks.ts";
import type { BadgeDefinition, MyBadge } from "../src/lib/gamification.ts";

let passed = 0;
function ok(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok ${passed} - ${label}`);
}

/* ------------------------------------------------------- fixtures (real seed) */
const BOOKWORM_LADDER = [
  { rank: 1, threshold: 10 },
  { rank: 2, threshold: 25 },
  { rank: 3, threshold: 50 },
  { rank: 4, threshold: 100 },
  { rank: 5, threshold: 200 },
  { rank: 6, threshold: 400 },
  { rank: 7, threshold: 800 },
  { rank: 8, threshold: 1600 },
];

function def(partial: Partial<BadgeDefinition> & { key: string; name: string }): BadgeDefinition {
  return {
    key: partial.key,
    base_key: partial.base_key ?? partial.key,
    category: partial.category ?? "learning",
    name: partial.name,
    description: partial.description ?? "",
    metric: partial.metric ?? "lessons_done",
    threshold: partial.threshold ?? 1,
    rarity: partial.rarity ?? "common",
    xp_reward: partial.xp_reward ?? 20,
    secret: partial.secret ?? false,
    limited: partial.limited ?? false,
    sort_order: partial.sort_order ?? 0,
    image_url: partial.image_url ?? null,
    visibility_mode: partial.visibility_mode ?? "public",
    ranks: partial.ranks ?? [],
  } as BadgeDefinition;
}

const DEFINITIONS: BadgeDefinition[] = [
  // Bookworm family (editions) + the authoritative 8-rank ladder on the base row.
  def({ key: "bookworm", name: "Bookworm", threshold: 10, rarity: "common", xp_reward: 20, sort_order: 11, ranks: BOOKWORM_LADDER }),
  def({ key: "bookworm-unc", name: "Bookworm · Silver", threshold: 25, rarity: "uncommon", xp_reward: 50, sort_order: 12 }),
  def({ key: "bookworm-rare", name: "Bookworm · Gold", threshold: 50, rarity: "rare", xp_reward: 100, sort_order: 13 }),
  def({ key: "bookworm-epic", name: "Bookworm · Platinum", threshold: 100, rarity: "epic", xp_reward: 250, sort_order: 14 }),
  def({ key: "bookworm-leg", name: "Bookworm · Legendary", threshold: 250, rarity: "legendary", xp_reward: 500, sort_order: 15 }),
  // On Fire family (editions only, no ladder configured).
  def({ key: "on-fire", name: "On Fire", threshold: 7, rarity: "uncommon", xp_reward: 50, sort_order: 22 }),
  def({ key: "on-fire-rare", name: "On Fire · Gold", threshold: 30, rarity: "rare", xp_reward: 100, sort_order: 23 }),
  def({ key: "on-fire-epic", name: "On Fire · Platinum", threshold: 60, rarity: "epic", xp_reward: 250, sort_order: 24 }),
  def({ key: "on-fire-leg", name: "On Fire · Legendary", threshold: 100, rarity: "legendary", xp_reward: 500, sort_order: 25 }),
  // Single badges.
  def({ key: "first-step", name: "First Step", category: "getting-started", metric: "registered", threshold: 1, sort_order: 1 }),
  def({ key: "night-owl", name: "Night Owl", category: "special", threshold: 3, rarity: "rare", secret: true, sort_order: 80 }),
  def({
    key: "early-adopter",
    name: "Early Adopter",
    category: "special",
    metric: "registered",
    rarity: "legendary",
    limited: true,
    visibility_mode: "private",
    sort_order: 70,
  }),
];

function badge(key: string, at = "2026-11-01T10:00:00Z", pinned = false): MyBadge {
  return { badge_key: key, recipient_number: null, pinned, awarded_at: at };
}

function award(badgeKey: string, rank: number, at = "2026-11-02T09:00:00Z"): RankAward {
  return { badge_key: badgeKey, rank, awarded_at: at };
}

/* ------------------------------------------------------------------ 1. identity */
ok("rank identity: eight ranks Bronze..Heroic", () => {
  assert.equal(RANK_COUNT, 8);
  assert.deepEqual([...RANK_NAMES], ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Prestige", "Heroic"]);
  assert.equal(rankName(1), "Bronze");
  assert.equal(rankName(8), "Heroic");
  assert.equal(rankName(99), "Heroic"); // clamped, never undefined
  assert.equal(rankName(0), "Bronze");
});

ok("rank identity: eight distinct gradients", () => {
  const gradients = RANK_NAMES.map((name) => rankStyle(RANK_NAMES.indexOf(name) + 1).gradient);
  assert.equal(new Set(gradients).size, 8);
});

ok("rarity identity: five distinct gradients", () => {
  const gradients = ["common", "uncommon", "rare", "epic", "legendary"].map((r) => rarityStyle(r).gradient);
  assert.equal(new Set(gradients).size, 5);
  assert.equal(rarityStyle("unknown").gradient, rarityStyle("common").gradient); // safe fallback
});

ok("stem grouping: editions share one stem", () => {
  assert.equal(badgeStem("Bookworm · Silver"), "bookworm");
  assert.equal(badgeStem("Bookworm"), "bookworm");
  assert.equal(badgeStem("On Fire"), "on fire");
  assert.equal(badgeStem("COVA Member · Year 5+"), "cova member");
});

/* ------------------------------------------------- 2. one card per achievement */
const achievements = buildAchievements(DEFINITIONS, [], [], {});

ok("one card per achievement (not per edition)", () => {
  const bookworm = achievements.filter((a) => a.key === "bookworm");
  assert.equal(bookworm.length, 1);
  const onFire = achievements.filter((a) => a.key === "on fire");
  assert.equal(onFire.length, 1);
  assert.equal(achievements.length, 5); // bookworm, on fire, first step, night owl, early adopter
});

ok("bookworm card uses the authoritative 8-rank ladder", () => {
  const bookworm = achievements.find((a) => a.key === "bookworm");
  assert.ok(bookworm);
  assert.equal(bookworm.tiers.length, 8);
  assert.deepEqual(
    bookworm.tiers.map((t) => t.threshold),
    [10, 25, 50, 100, 200, 400, 800, 1600],
  );
  assert.equal(bookworm.tiers[0].label, "Bronze");
  assert.equal(bookworm.tiers[7].label, "Heroic");
  assert.equal(bookworm.hasRankLadder, true);
});

ok("edition family keeps real thresholds and XP", () => {
  const onFire = achievements.find((a) => a.key === "on fire");
  assert.ok(onFire);
  assert.equal(onFire.tiers.length, 4);
  assert.deepEqual(
    onFire.tiers.map((t) => t.threshold),
    [7, 30, 60, 100],
  );
  assert.deepEqual(
    onFire.tiers.map((t) => t.xp),
    [50, 100, 250, 500],
  );
  assert.equal(onFire.tiers[2].label, "On Fire · Platinum"); // real edition name preserved
  assert.equal(onFire.hasRankLadder, false);
});

ok("single badge is a one-tier card", () => {
  const firstStep = achievements.find((a) => a.key === "first step");
  assert.ok(firstStep);
  assert.equal(firstStep.tiers.length, 1);
  assert.equal(firstStep.tiers[0].xp, 20);
});

/* -------------------------------------------- 3. latest rank displayed once */
ok("latest achieved edition collapses into one card (Gold case)", () => {
  // User reached 50 lessons: editions 10/25/50 earned, ladder tiers 1-3 achieved.
  const badges = [badge("bookworm"), badge("bookworm-unc"), badge("bookworm-rare")];
  const result = buildAchievements(DEFINITIONS, badges, [], { lessons_done: 50 }).find((a) => a.key === "bookworm")!;
  assert.equal(result.key, "bookworm");
  assert.equal(result.currentRank, 3); // Gold
  assert.equal(result.tiers.filter((t) => t.achieved).length, 3);
  assert.equal(result.next?.position, 4);
  assert.equal(result.next?.threshold, 100);
  // The card is the ONLY bookworm-shaped card, with the history kept in tiers.
  assert.equal(result.tiers[0].achieved, true);
  assert.equal(result.tiers[2].awardedAt, "2026-11-01T10:00:00Z"); // edition date
});

ok("metric beyond editions maps onto the ladder correctly (250 lessons)", () => {
  const badges = [badge("bookworm"), badge("bookworm-unc"), badge("bookworm-rare"), badge("bookworm-epic"), badge("bookworm-leg")];
  const result = buildAchievements(DEFINITIONS, badges, [], { lessons_done: 250 }).find((a) => a.key === "bookworm")!;
  assert.equal(result.currentRank, 5); // Diamond (200 ≤ 250 < 400)
  assert.equal(result.next?.position, 6);
  assert.equal(result.progressValue, 250); // clamped to the next threshold
  assert.equal(result.progressTarget, 400);
  assert.equal(result.rarity, "legendary"); // rarity of the highest achieved edition
});

ok("rank awards drive the achieved state and dates", () => {
  const result = buildAchievements(DEFINITIONS, [], [award("bookworm", 2)], null).find((a) => a.key === "bookworm")!;
  assert.equal(result.currentRank, 2); // Silver
  assert.equal(result.tiers[1].awardedAt, "2026-11-02T09:00:00Z");
  assert.equal(result.tiers[2].achieved, false);
  assert.equal(result.progressValue, null); // no metrics for another member: no fake progress
});

ok("XP per tier is the real reward, counted once per tier", () => {
  const badges = [badge("bookworm"), badge("bookworm-unc"), badge("bookworm-rare"), badge("bookworm-epic")];
  const result = buildAchievements(DEFINITIONS, badges, [], { lessons_done: 100 }).find((a) => a.key === "bookworm")!;
  assert.equal(tierAwardCount(result), 4);
  assert.deepEqual(result.tiers.map((t) => t.xp), [20, 20, 20, 20, 20, 20, 20, 20]); // ladder xp_reward per rank
  const onFireBadges = [badge("on-fire"), badge("on-fire-rare")];
  const onFire = buildAchievements(DEFINITIONS, onFireBadges, [], { streak: 30 }).find((a) => a.key === "on fire")!;
  assert.equal(tierAwardCount(onFire), 2);
  assert.deepEqual(
    onFire.tiers.filter((t) => t.achieved).map((t) => t.xp),
    [50, 100],
  );
});

/* ------------------------------------------------------------ 4. pinning */
ok("pin targets the highest achieved edition and covers the family", () => {
  const badges = [
    badge("bookworm"),
    badge("bookworm-unc"),
    badge("bookworm-rare", "2026-11-01T10:00:00Z", true),
    badge("bookworm-epic", "2026-11-03T10:00:00Z"),
  ];
  const result = buildAchievements(DEFINITIONS, badges, [], { lessons_done: 100 }).find((a) => a.key === "bookworm")!;
  assert.equal(result.pinned, true); // a pinned edition inside the family shows the card pinned
  assert.equal(result.pinKey, "bookworm-epic"); // toggling pins the top achieved edition
  assert.ok(result.familyKeys.includes("bookworm"));
  assert.ok(result.familyKeys.includes("bookworm-epic"));
});

ok("unachieved card pin falls back to the lowest edition key", () => {
  const onFire = buildAchievements(DEFINITIONS, [], [], {}).find((a) => a.key === "on fire");
  assert.ok(onFire);
  assert.equal(onFire.pinKey, "on-fire");
  assert.equal(onFire.currentRank, null);
});

/* -------------------------------------------------------- 5. visibility */
ok("secret badges are hidden until earned", () => {
  const nightOwl = buildAchievements(DEFINITIONS, [], [], {}).find((a) => a.key === "night owl");
  assert.ok(nightOwl && nightOwl.secret);
  assert.equal(isVisibleAchievement(nightOwl, true), false);
  assert.equal(isVisibleAchievement(nightOwl, false), false);
  const earned = buildAchievements(DEFINITIONS, [badge("night-owl")], [], { lessons_done: 3 }).find(
    (a) => a.key === "night owl",
  )!;
  assert.equal(isVisibleAchievement(earned, false), true);
});

ok("private badges are owner-only until earned", () => {
  const earlyAdopter = buildAchievements(DEFINITIONS, [], [], {}).find((a) => a.key === "early adopter");
  assert.ok(earlyAdopter && earlyAdopter.visibilityMode === "private");
  assert.equal(isVisibleAchievement(earlyAdopter, false), false);
  assert.equal(isVisibleAchievement(earlyAdopter, true), true);
});

/* ----------------------------------------------- 6. progression math sanity */
ok("progress bar reflects the next rank only", () => {
  const result = buildAchievements(DEFINITIONS, [], [], { lessons_done: 64 }).find((a) => a.key === "bookworm")!;
  assert.equal(result.currentRank, 3); // Gold at 50
  assert.equal(result.next?.position, 4);
  assert.equal(result.progressValue, 64);
  assert.equal(result.progressTarget, 100);
});

ok("completed badge has no next tier", () => {
  const result = buildAchievements(DEFINITIONS, [], [], { lessons_done: 1600 }).find((a) => a.key === "bookworm")!;
  assert.equal(result.currentRank, 8);
  assert.equal(result.next, null);
  assert.equal(result.progressValue, null);
});

ok("on-fire streak progression: 30-day streak reaches Gold position", () => {
  const result = buildAchievements(DEFINITIONS, [badge("on-fire"), badge("on-fire-rare")], [], { streak: 30 }).find(
    (a) => a.key === "on fire",
  )!;
  assert.equal(result.currentRank, 2);
  assert.equal(result.next?.threshold, 60);
});

ok("limited edition recipient number is preserved on the card", () => {
  const limitedBadge: MyBadge = { badge_key: "early-adopter", recipient_number: 42, pinned: false, awarded_at: "2026-11-01T00:00:00Z" };
  const result = buildAchievements(DEFINITIONS, [limitedBadge], [], {}).find((a) => a.key === "early adopter")!;
  assert.equal(result.limited, true);
  assert.equal(result.tiers[0].recipientNumber, 42);
  assert.equal(result.currentRank, 1);
});

/* ------------------------------------------------------------------- done */
console.log(`\n${passed} badge progression tests passed.`);
