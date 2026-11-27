"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Crown, Medal } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Tabs } from "@/components/ui/Tabs";
import { XpAnalytics } from "@/components/learning/XpAnalytics";
import { useI18n } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { useS } from "@/i18n/spaces";
import { friendsOf, useSocial } from "@/lib/social-store";
import { periodEnd, periodStart, type XpEntry, type XpPeriodKind } from "@/lib/xp-analytics";
import {
  buildAchievements,
  isVisibleAchievement,
  type Achievement,
} from "@/lib/badge-collection";
import { rankName, rankStyle } from "@/lib/badge-ranks";
import { BadgeShowcase } from "@/components/badges/BadgeShowcase";
import {
  fetchFriendsLeaderboard,
  levelForXp,
  useGamification,
  type MyBadge,
  type RankAwardRow,
} from "@/lib/gamification";
import { cn } from "@/lib/utils";

interface FriendRankCompare {
  name: string;
  top: { key: string; name: string; rank: number }[];
}

export function LeaderboardPageContent() {
  const t = useS();
  const { formatTag } = useI18n();
  const social = useSocial();
  const meId = social.meId ?? "";
  // Deep link: /leaderboard?tab=badges opens the Badge Achievements tab.
  const [tab, setTab] = useState<"xp" | "badges">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "badges"
      ? "badges"
      : "xp",
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchFriendsLeaderboard>>>([]);
  const [loading, setLoading] = useState(true);
  const [compareFriend, setCompareFriend] = useState<string>("");
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(null);
  const [friendRanks, setFriendRanks] = useState<FriendRankCompare | null>(null);

  // Period selection shared by the chart and both rankings.
  const [periodKind, setPeriodKind] = useState<XpPeriodKind>("week");
  const [periodAnchor, setPeriodAnchor] = useState<Date>(() => periodStart("week", new Date()));
  // Full personal ledger (chart), per-period sums (rankings), global rank.
  const [ledgerFull, setLedgerFull] = useState<XpEntry[] | null>(null);
  const [periodSums, setPeriodSums] = useState<Record<string, number> | null>(null);
  const [sumsError, setSumsError] = useState(false);
  const [globalRank, setGlobalRank] = useState<number | null>(null);

  const { definitions, myBadges, rankAwards, metrics, ledger, xp, togglePinFamily } = useGamification();
  const friends = useMemo(() => (meId ? friendsOf(social, meId) : []), [social, meId]);
  const friendCodes = useMemo(() => friends.map((friend) => friend.id), [friends]);

  useEffect(() => {
    if (!social.ready || !meId) return;
    void fetchFriendsLeaderboard(meId, friendCodes)
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch(() => {
        setRows([]);
        setLoading(false);
      });
  }, [social.ready, meId, friendCodes.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps -- refetch when the friend set changes

  // Full personal XP history: the chart and period stats use real gains,
  // never a delta of the current total.
  useEffect(() => {
    if (!meId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await getSupabase()
        .from("xp_ledger")
        .select("amount,created_at")
        .order("created_at")
        .limit(2000);
      if (cancelled) return;
      const entries: XpEntry[] = (data ?? []).map((row) => ({
        amount: Number(row.amount),
        createdAt: String(row.created_at),
      }));
      setLedgerFull(error ? [] : entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [meId]);

  // Per-period gains for me + friends (server-side aggregate, RLS-safe).
  const periodKey = `${periodKind}-${periodAnchor.getTime()}`;
  useEffect(() => {
    if (!meId) return;
    let cancelled = false;
    void (async () => {
      try {
        const start = periodStart(periodKind, periodAnchor);
        const end = periodEnd(periodKind, periodAnchor);
        const { data, error } = await getSupabase().rpc("xp_period_sums", {
          p_start: start.toISOString(),
          p_end: end.toISOString(),
        });
        if (cancelled) return;
        if (error) throw error;
        const map: Record<string, number> = {};
        for (const row of (data ?? []) as Array<{ user_code: string | null; xp_gained: number }>) {
          if (row.user_code) map[row.user_code] = Number(row.xp_gained);
        }
        setPeriodSums(map);
        setSumsError(false);
      } catch {
        if (!cancelled) {
          setPeriodSums(null);
          setSumsError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meId, periodKey]); // eslint-disable-line react-hooks/exhaustive-deps -- periodKey covers the range

  // Global rank: how many profiles hold more total XP than me.
  useEffect(() => {
    if (xp === null || !meId) return;
    let cancelled = false;
    void (async () => {
      const { count, error } = await getSupabase()
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gt("xp", xp);
      if (cancelled) return;
      setGlobalRank(error ? null : (count ?? 0) + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [xp, meId]);

  // Derived views (no cascading state): signed-out clears the chart and rank.
  const chartEntries = meId ? (ledgerFull ?? []) : [];
  const chartLoading = !!meId && ledgerFull === null;
  const effectiveRank = meId && xp !== null ? globalRank : null;

  // One achievement = one card: the shared aggregation collapses edition
  // families and rank ladders (see src/lib/badge-collection.ts).
  const achievements = useMemo(
    () =>
      definitions && myBadges && rankAwards && metrics
        ? buildAchievements(definitions, myBadges, rankAwards, metrics)
        : null,
    [definitions, myBadges, rankAwards, metrics],
  );
  const myAchievementByKey = useMemo(() => {
    const map = new Map<string, Achievement>();
    for (const item of achievements ?? []) map.set(item.key, item);
    return map;
  }, [achievements]);
  const myLevel = useMemo(() => levelForXp(xp ?? 0), [xp]);

  async function handleTogglePin(achievement: Achievement) {
    try {
      await togglePinFamily(achievement.familyKeys, achievement.pinKey, !achievement.pinned);
    } catch {
      // The server policy is authoritative; a failed pin leaves the state as-is.
    }
  }

  const meRow = rows.find((row) => row.isMe);
  const totalFriends = rows.length - (meRow ? 1 : 0);
  const tabXp = t("lb.tab.xp");
  const tabBadges = t("lb.tab.badges");

  // Ranking over the selected period: me + friends, best gains first.
  // When period sums are unavailable the total XP order is the fallback.
  const rankedRows = useMemo(() => {
    const sorted = [...rows];
    if (sumsError) {
      sorted.sort((a, b) => b.xp - a.xp);
    } else {
      sorted.sort(
        (a, b) => (periodSums?.[b.userCode] ?? 0) - (periodSums?.[a.userCode] ?? 0) || b.xp - a.xp,
      );
    }
    return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
  }, [rows, periodSums, sumsError]);

  const periodGainedFor = (userCode: string): number | "—" =>
    sumsError ? "—" : periodSums?.[userCode] ?? 0;
  const periodHasData = !sumsError && rankedRows.some((row) => (periodSums?.[row.userCode] ?? 0) > 0);

  async function loadComparison(friendCode: string) {
    setCompareFriend(friendCode);
    setFriendRanks(null);
    if (!friendCode) {
      setComparison(null);
      return;
    }
    try {
      const { data, error } = await getSupabase().rpc("badge_compare", { p_friend_code: friendCode });
      if (error) throw error;
      setComparison((data ?? null) as Record<string, unknown> | null);
    } catch {
      setComparison(null);
    }
    // Rank-level comparison: badge_rank_awards is public to authenticated
    // members; edition rows follow RLS (own + pinned), so only visible data
    // is compared — never guessed.
    try {
      const { data: profile } = await getSupabase()
        .from("profiles")
        .select("id,display_name")
        .eq("user_code", friendCode)
        .maybeSingle();
      if (!profile?.id || !definitions) return;
      const [badgesRes, ranksRes] = await Promise.all([
        getSupabase()
          .from("user_badges")
          .select("badge_key,recipient_number,pinned,awarded_at")
          .eq("user_id", (profile as { id: string }).id),
        getSupabase()
          .from("badge_rank_awards")
          .select("badge_key,rank,awarded_at")
          .eq("user_id", (profile as { id: string }).id),
      ]);
      const theirs = buildAchievements(
        definitions,
        (badgesRes.data ?? []) as MyBadge[],
        (ranksRes.data ?? []) as unknown as RankAwardRow[],
        null,
      ).filter((item) => isVisibleAchievement(item, false) && item.currentRank !== null);
      setFriendRanks({
        name: (profile as { display_name: string | null }).display_name ?? friendCode,
        top: theirs
          .sort((a, b) => (b.currentRank ?? 0) - (a.currentRank ?? 0))
          .slice(0, 12)
          .map((item) => ({ key: item.key, name: item.name, rank: item.currentRank ?? 0 })),
      });
    } catch {
      setFriendRanks(null);
    }
  }

  function compareRow(labelKey: string, mine: unknown, theirs: unknown) {
    return (
      <li className="flex items-center justify-between gap-3 border-b border-cova-line py-1.5 text-sm">
        <span className="text-cova-mute">{t(labelKey as never)}</span>
        <span className="flex items-center gap-6 font-medium">
          <span>{String(mine)}</span>
          <span className="w-12 text-end">{String(theirs)}</span>
        </span>
      </li>
    );
  }

  return (
    <>
      <PageHeader title={t("lb.title")} description={t("lb.friendsDesc")} />

      {!social.ready ? (
        <p className="mb-4 rounded-lg bg-cova-pale px-4 py-3 text-sm">{t("lb.loading")}</p>
      ) : !meId ? (
        <div className="mb-4 flex flex-col gap-3 rounded-lg bg-cova-pale px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{t("lb.signin")}</span>
          <Link href="/login" className="inline-flex h-9 items-center rounded-lg border border-cova-line px-4 text-sm font-medium hover:bg-cova-pale">
            {t("lb.signinBtn")}
          </Link>
        </div>
      ) : null}

      <div className="mb-4">
        <Tabs
          tabs={[tabXp, tabBadges]}
          value={tab === "xp" ? tabXp : tabBadges}
          onChange={(value) => setTab(value === tabBadges ? "badges" : "xp")}
          label={t("lb.title")}
        />
      </div>

      {tab === "xp" ? (
        <div className="space-y-4">
          <XpAnalytics
            entries={chartEntries}
            loading={chartLoading}
            kind={periodKind}
            anchor={periodAnchor}
            onKindChange={setPeriodKind}
            onAnchorChange={setPeriodAnchor}
          />

          {meRow && (
            <Card>
              <CardHeader title={t("lb.mine.title")} />
              <CardBody className="flex flex-wrap items-center gap-5">
                <Avatar name={meRow.displayName} size="lg" />
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-semibold text-cova-ink">
                    {meRow.displayName} <span className="text-cova-mute">({t("lb.you")})</span>
                  </p>
                  <p className="text-xs text-cova-mute">
                    {t("lb.mine.level", { level: myLevel.level })} ·{" "}
                    {t("lb.mine.progress", {
                      into: myLevel.into,
                      needed: myLevel.needed,
                      next: myLevel.level + 1,
                    })}
                  </p>
                  <ProgressBar
                    value={myLevel.into}
                    max={myLevel.needed}
                    label={t("lb.mine.level", { level: myLevel.level })}
                    className="mt-1.5"
                  />
                </div>
                <dl className="grid grid-cols-3 gap-4 text-center text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-cova-mute">{t("lb.mine.globalRank")}</dt>
                    <dd className="text-xl font-semibold tabular-nums text-cova-ink">
                      {effectiveRank ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-cova-mute">{t("lb.mine.total")}</dt>
                    <dd className="text-xl font-semibold tabular-nums text-cova-ink">
                      {(meRow.xp ?? 0).toLocaleString(formatTag)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-cova-mute">{t("lb.mine.gained")}</dt>
                    <dd className="text-xl font-semibold tabular-nums text-cova-ink">
                      {typeof (periodGainedFor(meRow.userCode)) === "number"
                        ? (periodGainedFor(meRow.userCode) as number).toLocaleString(formatTag)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader
              title={t("lb.friends.title")}
              description={
                sumsError
                  ? t("lb.friends.fallback")
                  : t("lb.friendsCount", { count: Math.max(0, totalFriends) })
              }
            />
            <CardBody className="p-0">
              {loading ? (
                <p className="p-5 text-sm text-cova-mute">{t("lb.loading")}</p>
              ) : rows.length === 0 ? (
                <p className="p-5 text-sm text-cova-mute">{t("lb.noFriendsYet")}</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="border-b border-cova-line bg-cova-bg text-start text-cova-mute">
                      <tr>
                        <th scope="col" className="w-16 px-4 py-3 text-start font-medium">{t("lb.rank")}</th>
                        <th scope="col" className="px-4 py-3 text-start font-medium">{t("lb.student")}</th>
                        <th scope="col" className="hidden px-4 py-3 text-start font-medium sm:table-cell">{t("lb.level")}</th>
                        <th scope="col" className="px-4 py-3 text-end font-medium">{t("lb.friends.periodXp")}</th>
                        <th scope="col" className="px-4 py-3 text-end font-medium">{t("lb.friends.totalXp")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cova-line">
                      {rankedRows.map((row) => {
                        const level = levelForXp(row.xp);
                        const gained = periodGainedFor(row.userCode);
                        return (
                          <tr key={row.userCode} className={cn(row.isMe && "bg-cova-pale/60")}>
                            <td className="px-4 py-3 font-medium">
                              {row.rank <= 3 ? (
                                <span className="flex items-center gap-1.5">
                                  {row.rank === 1 ? <Crown className="h-4 w-4 text-yellow-500" aria-hidden="true" /> : <Medal className="h-4 w-4 text-cova-muted" aria-hidden="true" />}
                                  {row.rank}
                                </span>
                              ) : row.rank}
                            </td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-3">
                                <Avatar name={row.displayName} size="sm" />
                                <span className="font-medium">{row.displayName}{row.isMe && ` (${t("lb.you")})`}</span>
                              </span>
                            </td>
                            <td className="hidden px-4 py-3 text-cova-mute sm:table-cell">{level.name} · {level.level}</td>
                            <td className="px-4 py-3 text-end font-medium">
                              {typeof gained === "number" ? gained.toLocaleString(formatTag) : gained}
                            </td>
                            <td className="px-4 py-3 text-end text-cova-mute">{row.xp.toLocaleString(formatTag)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!periodHasData && !sumsError && (
                    <p className="border-t border-cova-line px-4 py-3 text-xs text-cova-mute">
                      {t("lb.friends.empty")}
                    </p>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <BadgeShowcase
            achievements={achievements}
            isOwner={!!meId}
            onTogglePin={meId ? handleTogglePin : undefined}
            xpHeader={
              meId && xp !== null
                ? {
                    levelName: myLevel.name,
                    level: myLevel.level,
                    into: myLevel.into,
                    needed: myLevel.needed,
                    xp,
                  }
                : null
            }
          />

          {meId && friends.length > 0 && (
            <Card>
              <CardBody className="space-y-3">
                <h2 className="text-lg font-semibold">{t("gm.compare.title")}</h2>
                <select value={compareFriend} onChange={(event) => void loadComparison(event.target.value)} aria-label={t("gm.compare.pick")} className="h-10 w-full max-w-xs rounded-lg border border-cova-line bg-white px-3 text-sm">
                  <option value="">{t("gm.compare.pick")}</option>
                  {friends.map((friend) => <option key={friend.id} value={friend.id}>{friend.displayName}</option>)}
                </select>
                {comparison && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 text-sm font-semibold">
                      <span>{t("gm.compare.achievement")}</span>
                      <span>{t("gm.compare.you")}</span>
                      <span>{String((comparison.friend as Record<string, unknown>)?.code ?? "")}</span>
                    </div>
                    <ul>
                      {compareRow("gm.compare.badges", (comparison.me as Record<string, unknown>).badges, (comparison.friend as Record<string, unknown>).badges)}
                      {compareRow("gm.compare.xp", (comparison.me as Record<string, unknown>).xp, (comparison.friend as Record<string, unknown>).xp)}
                      {compareRow("gm.compare.common", (comparison.me as Record<string, unknown>).common, (comparison.friend as Record<string, unknown>).common)}
                      {compareRow("gm.compare.uncommon", (comparison.me as Record<string, unknown>).uncommon, (comparison.friend as Record<string, unknown>).uncommon)}
                      {compareRow("gm.compare.rare", (comparison.me as Record<string, unknown>).rare, (comparison.friend as Record<string, unknown>).rare)}
                      {compareRow("gm.compare.epic", (comparison.me as Record<string, unknown>).epic, (comparison.friend as Record<string, unknown>).epic)}
                      {compareRow("gm.compare.legendary", (comparison.me as Record<string, unknown>).legendary, (comparison.friend as Record<string, unknown>).legendary)}
                      {compareRow("gm.compare.shared", comparison.shared, comparison.shared)}
                    </ul>
                  </div>
                )}
                {friendRanks && friendRanks.top.length > 0 && (
                  <div className="pt-2">
                    <h3 className="mb-2 text-sm font-semibold">{t("gm.compare.ranks")}</h3>
                    <ul className="space-y-1.5">
                      {friendRanks.top.map((row) => {
                        const mine = myAchievementByKey.get(row.key);
                        return (
                          <li
                            key={row.key}
                            className="flex items-center justify-between gap-3 rounded-lg border border-cova-line px-3 py-2 text-sm"
                          >
                            <span className="min-w-0 truncate font-medium text-cova-ink">{row.name}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              {mine?.currentRank ? (
                                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", rankStyle(mine.currentRank).chip)}>
                                  {t("gm.compare.you")}: {rankName(mine.currentRank)}
                                </span>
                              ) : (
                                <span className="rounded-full bg-cova-pale px-2 py-0.5 text-xs text-cova-mute">
                                  {t("gm.compare.you")}: —
                                </span>
                              )}
                              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", rankStyle(row.rank).chip)}>
                                {friendRanks.name}: {rankName(row.rank)}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {ledger && ledger.length > 0 && (
            <Card>
              <CardBody>
                <h2 className="mb-2 text-lg font-semibold">{t("gm.history")}</h2>
                <ul className="divide-y divide-cova-line text-sm">
                  {ledger.slice(0, 15).map((entry) => (
                    <li key={entry.event_key} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{entry.reason || entry.event_key}</span>
                        <span className="text-xs text-cova-mute">{new Date(entry.created_at).toLocaleString(formatTag)}</span>
                      </span>
                      <span className="shrink-0 font-semibold">+{entry.amount} XP</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
