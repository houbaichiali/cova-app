/**
 * Level curve — the single source of truth for XP levels.
 * Pure module (no imports) so the same formula backs the UI, tests and any
 * server script.
 *
 * Level 0 starts at 0 XP; reaching level n+1 costs 500 + (n * 100) more XP
 * than reaching level n, so the cumulative threshold for level n is
 * 50n² + 450n (L1 = 500, L2 = 1100, L3 = 1800, L4 = 2600, …, open-ended).
 * XP totals are never reset: the level is always derived from total XP.
 */
const LEVEL_NAMES = [
  "Beginner",
  "Explorer",
  "Learner",
  "Achiever",
  "Scholar",
  "Expert",
  "Master",
  "Legend",
] as const;

/** Cumulative XP required to BE at `level`. */
export function levelThreshold(level: number): number {
  return 50 * level * level + 450 * level;
}

/** XP required to go from `level` to `level + 1`. */
export function levelStep(level: number): number {
  return 500 + level * 100;
}

export function levelName(level: number): string {
  return LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length - 1)] ?? "Beginner";
}

export function levelForXp(xp: number): { level: number; name: string; into: number; needed: number } {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let level = 0;
  while (safeXp >= levelThreshold(level + 1)) level += 1;
  const floorXp = levelThreshold(level);
  const nextXp = levelThreshold(level + 1);
  return {
    level,
    name: levelName(level),
    into: safeXp - floorXp,
    needed: nextXp - floorXp,
  };
}
