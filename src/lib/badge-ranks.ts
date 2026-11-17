/**
 * COVA — Badge rank identity (pure module, no imports).
 *
 * The eight-rank progression shared by the Leaderboard "Badge Achievements"
 * tab, the Profile Badge Showcase, the badge detail view and the friend
 * comparison. One identity everywhere: same names, same colors, same order.
 *
 * The SQL function badge_rank_label() historically returned
 * "Novice…Mythic"; the product now standardizes on the visual identity below
 * (migration 20261115000013 aligns the server-side labels). Client UI always
 * renders THESE names so old and new never mix on screen.
 */

export const RANK_COUNT = 8;

export type BadgeRankName =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Master"
  | "Prestige"
  | "Heroic";

/** Index 0 = rank 1 (Bronze) … index 7 = rank 8 (Heroic). */
export const RANK_NAMES: readonly BadgeRankName[] = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Master",
  "Prestige",
  "Heroic",
] as const;

export function rankName(rank: number): string {
  return RANK_NAMES[Math.min(Math.max(rank, 1), RANK_COUNT) - 1] ?? "Bronze";
}

export interface RankStyle {
  /** Trophy gradient (bg-gradient-to-br classes). */
  gradient: string;
  /** Text color readable on the gradient. */
  text: string;
  /** Ring/halo used on the active rank. */
  ring: string;
  /** Soft chip background (badges list, history). */
  chip: string;
}

/**
 * Distinctive color per rank. Tailwind utility strings so Tailwind's JIT can
 * see them (no dynamic class construction).
 */
export const RANK_STYLE: Record<BadgeRankName, RankStyle> = {
  Bronze: {
    gradient: "from-orange-300 via-amber-500 to-amber-700",
    text: "text-amber-950",
    ring: "ring-amber-400",
    chip: "bg-amber-100 text-amber-900",
  },
  Silver: {
    gradient: "from-slate-200 via-slate-400 to-slate-500",
    text: "text-slate-900",
    ring: "ring-slate-300",
    chip: "bg-slate-100 text-slate-700",
  },
  Gold: {
    gradient: "from-yellow-200 via-yellow-400 to-yellow-600",
    text: "text-yellow-950",
    ring: "ring-yellow-400",
    chip: "bg-yellow-100 text-yellow-800",
  },
  Platinum: {
    gradient: "from-teal-100 via-teal-400 to-teal-600",
    text: "text-teal-950",
    ring: "ring-teal-400",
    chip: "bg-teal-50 text-teal-800",
  },
  Diamond: {
    gradient: "from-sky-200 via-sky-400 to-blue-600",
    text: "text-sky-950",
    ring: "ring-sky-400",
    chip: "bg-sky-50 text-sky-800",
  },
  Master: {
    gradient: "from-violet-300 via-violet-500 to-purple-700",
    text: "text-violet-950",
    ring: "ring-violet-400",
    chip: "bg-violet-50 text-violet-800",
  },
  Prestige: {
    gradient: "from-fuchsia-300 via-pink-500 to-rose-600",
    text: "text-rose-950",
    ring: "ring-pink-400",
    chip: "bg-pink-50 text-pink-800",
  },
  Heroic: {
    gradient: "from-red-300 via-rose-600 to-red-800",
    text: "text-red-950",
    ring: "ring-red-400",
    chip: "bg-red-50 text-red-800",
  },
};

export function rankStyle(rank: number): RankStyle {
  return RANK_STYLE[rankName(rank) as BadgeRankName];
}

/** Rarity identity (kept distinct from ranks; one table, no duplicates). */
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export const RARITIES: readonly Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"] as const;

export interface RarityStyle {
  gradient: string;
  chip: string;
}

export const RARITY_STYLE: Record<Rarity, RarityStyle> = {
  common: { gradient: "from-stone-200 to-stone-400", chip: "bg-stone-100 text-stone-700" },
  uncommon: { gradient: "from-emerald-200 to-emerald-500", chip: "bg-emerald-50 text-emerald-800" },
  rare: { gradient: "from-cyan-200 to-cyan-500", chip: "bg-cyan-50 text-cyan-800" },
  epic: { gradient: "from-indigo-200 to-indigo-500", chip: "bg-indigo-50 text-indigo-800" },
  legendary: { gradient: "from-amber-300 via-orange-500 to-rose-600", chip: "bg-amber-50 text-amber-800" },
};

export function rarityStyle(rarity: string): RarityStyle {
  return RARITY_STYLE[(rarity as Rarity) in RARITY_STYLE ? (rarity as Rarity) : "common"];
}

/** Badge categories — seeded set (see gamification.sql). The UI lists these. */
export const CATEGORIES = [
  "getting-started",
  "learning",
  "consistency",
  "excellence",
  "challenges",
  "community",
  "coding",
  "special",
] as const;
