/**
 * COVA — Badge collection aggregation (pure module, no React, no Supabase).
 *
 * Implements the product rule: ONE ACHIEVEMENT = ONE CARD in the main
 * collection; all eight ranks live inside that card's detail view.
 *
 * Data sources (all real, nothing invented):
 *  - badge_definitions rows: each row is a "single" badge or an "edition" of a
 *    progressive family (editions share the display stem, e.g.
 *    "Bookworm · Silver"). A row may also carry the 8-rank ladder in `ranks`
 *    (jsonb [{rank, threshold}]) — when present that ladder is authoritative.
 *  - user_badges rows: achieved edition keys (+ recipient_number, pinned).
 *  - badge_rank_awards rows: achieved rank positions for ranks-configured
 *    badges (evaluated server-side by evaluate_badge_ranks, XP via grant_xp).
 *  - my_badge_metrics(): the same counters the SQL engine uses. For another
 *    member's collection pass `metrics = null` — tiers are then only marked
 *    achieved from real award rows, never from guessed progress.
 */

import { RANK_COUNT, rankName } from "@/lib/badge-ranks";
import type { BadgeDefinition, MyBadge } from "@/lib/gamification";

export interface RankAward {
  badge_key: string;
  rank: number;
  awarded_at: string;
}

export interface BadgeTier {
  /** Display position 1..8 on the progression path. */
  position: number;
  threshold: number;
  /** XP the database grants (or granted) for this tier — never a guess. */
  xp: number;
  /** Edition/definition key backing this tier (pin + history references). */
  definitionKey: string;
  source: "rank" | "edition";
  /** Display name of the tier: rank identity for ladders, edition name otherwise. */
  label: string;
  achieved: boolean;
  awardedAt: string | null;
  recipientNumber: number | null;
}

export interface Achievement {
  /** Stable group key (lowercased name stem). One card per key everywhere. */
  key: string;
  name: string;
  description: string;
  category: string;
  metric: string;
  metricValue: number | null;
  /** Progression path, sorted by threshold ascending (1..8 entries). */
  tiers: BadgeTier[];
  /** Highest achieved position (1..8), or null when nothing is achieved. */
  currentRank: number | null;
  next: BadgeTier | null;
  /** current stat value clamped to the next tier's threshold (progress bar). */
  progressValue: number | null;
  progressTarget: number | null;
  /** Rarity of the highest achieved tier, else the anchor's rarity. */
  rarity: string;
  pinned: boolean;
  /** The user_badges.badge_key a pin toggle should target for this card. */
  pinKey: string | null;
  /** Every achieved definition key of the family (for unpin-all semantics). */
  familyKeys: string[];
  secret: boolean;
  limited: boolean;
  visibilityMode: "public" | "private" | "hidden";
  imageUrl: string | null;
  /** True when the authoritative ladder comes from definitions.ranks. */
  hasRankLadder: boolean;
  /** Anchor definition sort_order (stable card ordering). */
  sortOrder: number;
}

/** "Bookworm · Silver" -> "bookworm"; "On Fire" -> "on fire". */
export function badgeStem(name: string): string {
  return (name.split("·")[0] ?? name).trim().toLowerCase();
}

function byThreshold(a: BadgeDefinition, b: BadgeDefinition): number {
  return a.threshold - b.threshold || (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

function toTier(
  definition: BadgeDefinition,
  position: number,
  source: "rank" | "edition",
  achieved: boolean,
  awardedAt: string | null,
  recipientNumber: number | null,
): BadgeTier {
  return {
    position,
    threshold: definition.threshold,
    xp: definition.xp_reward,
    definitionKey: definition.key,
    source,
    // Edition tiers keep their real DB name ("COVA Member · Year 3"),
    // rank-ladder tiers use the shared rank identity.
    label: source === "rank" ? rankName(position) : definition.name,
    achieved,
    awardedAt,
    recipientNumber,
  };
}

/**
 * Build one card per achievement. All inputs are raw database rows; the same
 * function serves my collection (metrics provided) and another member's
 * visible collection (metrics = null, badges limited to pinned rows by RLS).
 */
export function buildAchievements(
  definitions: BadgeDefinition[],
  badges: MyBadge[],
  rankAwards: RankAward[],
  metrics: Record<string, number> | null,
): Achievement[] {
  const badgeByKey = new Map(badges.map((badge) => [badge.badge_key, badge]));
  const awardsByKey = new Map<string, Map<number, string>>();
  for (const award of rankAwards) {
    let ranks = awardsByKey.get(award.badge_key);
    if (!ranks) {
      ranks = new Map<number, string>();
      awardsByKey.set(award.badge_key, ranks);
    }
    if (!ranks.has(award.rank)) ranks.set(award.rank, award.awarded_at);
  }

  // Group edition rows by display stem; remember the ranks-configured anchor.
  const groups = new Map<
    string,
    { anchor: BadgeDefinition; editions: BadgeDefinition[]; ladder: BadgeDefinition | null }
  >();
  for (const definition of definitions) {
    const stem = badgeStem(definition.name);
    let group = groups.get(stem);
    if (!group) {
      group = { anchor: definition, editions: [], ladder: null };
      groups.set(stem, group);
    }
    if (Array.isArray(definition.ranks) && definition.ranks.length > 0) {
      // A configured ladder wins the anchor; keep the lowest-threshold row as
      // anchor otherwise.
      if (!group.ladder) group.ladder = definition;
      group.anchor = group.ladder;
    } else {
      group.editions.push(definition);
      if (!group.ladder && definition.threshold < group.anchor.threshold) {
        group.anchor = definition;
      }
    }
  }

  const achievements: Achievement[] = [];
  for (const [stem, group] of groups) {
    const { anchor, editions, ladder } = group;
    const sortedEditions = [...editions].sort(byThreshold);
    const tiers: BadgeTier[] = [];
    const familyKeys: string[] = [];

    if (ladder) {
      // Authoritative ladder: definitions.ranks jsonb (e.g. bookworm
      // 10/25/50/100/200/400/800/1600). A tier is achieved when the server
      // granted the rank award, or when the same counter already satisfies
      // the server's own predicate (metric >= threshold) — the DB award then
      // lands on the next triggering event.
      const ladderRanks = [...(ladder.ranks ?? [])]
        .filter((entry) => entry && typeof entry.rank === "number" && typeof entry.threshold === "number")
        .sort((a, b) => a.rank - b.rank);
      const awards = awardsByKey.get(ladder.key) ?? new Map<number, string>();
      const metricValue = metrics?.[ladder.metric] ?? null;
      ladderRanks.slice(0, RANK_COUNT).forEach((entry, index) => {
        const position = index + 1;
        const awardAt = awards.get(entry.rank) ?? null;
        const achieved =
          awardAt !== null || (metricValue !== null && metricValue >= entry.threshold);
        // Edition rows of the same family whose threshold matches this tier
        // provide the earliest "awarded at" evidence.
        const matchingEdition = sortedEditions.find((edition) => edition.threshold === entry.threshold);
        const editionBadge = matchingEdition ? badgeByKey.get(matchingEdition.key) : undefined;
        if (matchingEdition) familyKeys.push(matchingEdition.key);
        tiers.push({
          position,
          threshold: entry.threshold,
          xp: ladder.xp_reward,
          definitionKey: matchingEdition ? matchingEdition.key : ladder.key,
          source: "rank",
          label: rankName(position),
          achieved,
          awardedAt: awardAt ?? editionBadge?.awarded_at ?? null,
          recipientNumber: editionBadge?.recipient_number ?? null,
        });
      });
      if (badgeByKey.has(ladder.key)) familyKeys.push(ladder.key);
    } else {
      // Edition family (or single badge): every row is a real tier the DB
      // granted XP for once — thresholds and XP stay exactly as seeded.
      sortedEditions.slice(0, RANK_COUNT).forEach((edition, index) => {
        const badge = badgeByKey.get(edition.key);
        familyKeys.push(edition.key);
        tiers.push(
          toTier(edition, index + 1, "edition", !!badge, badge?.awarded_at ?? null, badge?.recipient_number ?? null),
        );
      });
    }

    const currentRank = [...tiers].reverse().find((tier) => tier.achieved)?.position ?? null;
    const next = tiers.find((tier) => !tier.achieved) ?? null;
    const metricValue = metrics?.[anchor.metric] ?? null;
    const achievedTiers = tiers.filter((tier) => tier.achieved);
    const topTier = achievedTiers.length > 0 ? achievedTiers[achievedTiers.length - 1] : null;
    // The card wears the rarity of the highest tier the member actually holds:
    // the highest achieved edition row, else the definition behind the top tier.
    const achievedEditions = sortedEditions.filter((edition) => badgeByKey.has(edition.key));
    const topEdition = achievedEditions[achievedEditions.length - 1] ?? null;
    const topDefinition =
      topEdition ??
      (topTier ? (definitions.find((definition) => definition.key === topTier.definitionKey) ?? anchor) : anchor);

    const familyBadges = badges.filter((badge) => familyKeys.includes(badge.badge_key));
    const pinnedBadge = familyBadges.find((badge) => badge.pinned) ?? null;

    achievements.push({
      key: stem,
      name: (anchor.name.split("·")[0] ?? anchor.name).trim(),
      description: anchor.description,
      category: anchor.category,
      metric: anchor.metric,
      metricValue,
      tiers,
      currentRank,
      next,
      progressValue: next && metricValue !== null ? Math.min(metricValue, next.threshold) : null,
      progressTarget: next ? next.threshold : null,
      rarity: topDefinition.rarity,
      pinned: pinnedBadge !== null,
      // Pin the highest achieved edition (falls back to the anchor row).
      pinKey: topTier ? topTier.definitionKey : (sortedEditions[0]?.key ?? anchor.key),
      familyKeys: Array.from(new Set(familyKeys)),
      secret: anchor.secret,
      limited: anchor.limited,
      visibilityMode: anchor.visibility_mode ?? "public",
      imageUrl: topDefinition.image_url ?? anchor.image_url ?? null,
      hasRankLadder: !!ladder,
      sortOrder: anchor.sort_order ?? 0,
    });
  }

  return achievements.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Visibility rules: secrets stay hidden until earned; private rows only for the owner. */
export function isVisibleAchievement(achievement: Achievement, isOwner: boolean): boolean {
  if (achievement.currentRank !== null) return true;
  if (achievement.secret || achievement.visibilityMode === "hidden") return false;
  if (!isOwner && achievement.visibilityMode === "private") return false;
  return true;
}

/** All tiers a rank award points at are granted exactly once by the DB. */
export function tierAwardCount(achievement: Achievement): number {
  return achievement.tiers.filter((tier) => tier.achieved).length;
}
