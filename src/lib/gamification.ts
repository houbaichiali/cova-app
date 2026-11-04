"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { ChallengeType } from "@/data/challenges";

/* ------------------------------------------------------------------ model */

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
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

export interface BadgeDefinition {
  key: string;
  base_key: string;
  category: string;
  name: string;
  description: string;
  metric: string;
  threshold: number;
  rarity: Rarity;
  xp_reward: number;
  secret: boolean;
  limited: boolean;
}

export interface MyBadge {
  badge_key: string;
  recipient_number: number | null;
  pinned: boolean;
  awarded_at: string;
}

export interface LedgerEntry {
  event_key: string;
  amount: number;
  reason: string;
  created_at: string;
}

/**
 * Level curve lives in level-curve.ts (pure, no imports): one formula backs
 * the UI, the SQL function and the tests. Re-exported here so existing call
 * sites keep working.
 */
export { levelForXp, levelThreshold, levelStep, levelName } from "@/lib/level-curve";

/* ---------------------------------------------------------------- fetching */

export function useGamification() {
  const [definitions, setDefinitions] = useState<BadgeDefinition[] | null>(null);
  const [myBadges, setMyBadges] = useState<MyBadge[] | null>(null);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [xp, setXp] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const [defsResult, badgesResult, metricsResult, ledgerResult, profileResult] = await Promise.all([
        supabase.from("badge_definitions").select("*").eq("enabled", true).order("sort_order"),
        supabase.from("user_badges").select("badge_key,recipient_number,pinned,awarded_at"),
        supabase.rpc("my_badge_metrics"),
        supabase.from("xp_ledger").select("event_key,amount,reason,created_at").order("created_at", { ascending: false }).limit(50),
        supabase.from("profiles").select("xp").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle(),
      ]);
      setDefinitions((defsResult.data ?? []) as BadgeDefinition[]);
      setMyBadges((badgesResult.data ?? []) as MyBadge[]);
      setMetrics((metricsResult.data ?? null) as Record<string, number> | null);
      setLedger((ledgerResult.data ?? []) as LedgerEntry[]);
      setXp((profileResult.data as { xp: number | null } | null)?.xp ?? 0);
    } catch (error) {
      console.error("Unable to load gamification data:", error);
      setDefinitions([]);
      setMyBadges([]);
      setMetrics({});
      setLedger([]);
      setXp(0);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount into component state
    void load();
  }, [load]);

  async function togglePin(badgeKey: string, pinned: boolean) {
    const { error } = await getSupabase()
      .from("user_badges")
      .update({ pinned })
      .eq("badge_key", badgeKey);
    if (error) throw error;
    if (!pinned) return;
    // Enforce the 3-badge showcase locally (server policy allows own rows only).
    const pinnedRows = (myBadges ?? []).filter((badge) => badge.pinned && badge.badge_key !== badgeKey);
    if (pinnedRows.length >= 3) {
      const oldest = pinnedRows.sort((a, b) => a.awarded_at.localeCompare(b.awarded_at))[0];
      if (oldest) await getSupabase().from("user_badges").update({ pinned: false }).eq("badge_key", oldest.badge_key);
    }
    await load();
  }

  return { definitions, myBadges, metrics, ledger, xp, reload: load, togglePin };
}

export interface BadgeWithState {
  definition: BadgeDefinition;
  awarded: MyBadge | null;
  /** Progress for locked progressive badges: metricValue / threshold. */
  metricValue: number | null;
}

export function buildBadgeList(
  definitions: BadgeDefinition[],
  myBadges: MyBadge[],
  metrics: Record<string, number> | null,
): BadgeWithState[] {
  const awardedByKey = new Map(myBadges.map((badge) => [badge.badge_key, badge]));
  return definitions
    .map((definition) => {
      const awarded = awardedByKey.get(definition.key) ?? null;
      const metricValue = awarded ? null : metrics?.[definition.metric] ?? null;
      return { definition, awarded, metricValue };
    })
    .filter(({ definition, awarded }) => {
      if (awarded) return true;
      if (definition.secret) return false;
      // Editions of a reached higher tier hide lower unreached editions.
      return true;
    });
}

/* ------------------------------------------------------- friends leaderboard */

export interface FriendRankingRow {
  userCode: string;
  displayName: string;
  xp: number;
  isMe: boolean;
  rank: number;
}

export async function fetchFriendsLeaderboard(meId: string, friendCodes: string[]): Promise<FriendRankingRow[]> {
  const supabase = getSupabase();
  const codes = [meId, ...friendCodes.filter((code) => code !== meId)];
  if (codes.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("user_code,display_name,xp")
    .in("user_code", codes);
  if (error) throw error;
  const rows = ((data ?? []) as Array<{ user_code: string | null; display_name: string | null; xp: number | null }>)
    .filter((row) => row.user_code)
    .map((row) => ({
      userCode: row.user_code as string,
      displayName: row.display_name?.trim() || "Student",
      xp: row.xp ?? 0,
      isMe: row.user_code === meId,
      rank: 0,
    }))
    .sort((a, b) => b.xp - a.xp)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  return rows;
}

export function xpTypeOf(eventKey: string): ChallengeType | "badge" | "level" | "other" {
  if (eventKey.startsWith("badge:")) return "badge";
  if (eventKey.startsWith("level:")) return "level";
  return "other";
}
