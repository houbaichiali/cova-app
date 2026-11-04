"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Crown, Lock, Medal, Trophy } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs } from "@/components/ui/Tabs";
import { XpAnalytics } from "@/components/learning/XpAnalytics";
import { useI18n } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { useS } from "@/i18n/spaces";
import { friendsOf, useSocial } from "@/lib/social-store";
import { periodEnd, periodStart, type XpEntry, type XpPeriodKind } from "@/lib/xp-analytics";
import {
  buildBadgeList,
  CATEGORIES,
  fetchFriendsLeaderboard,
  levelForXp,
  RARITIES,
  useGamification,
  type BadgeWithState,
  type Rarity,
} from "@/lib/gamification";
import { cn } from "@/lib/utils";

const RARITY_STYLE: Record<Rarity, string> = {
  common: "bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950",
  uncommon: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900",
  rare: "bg-gradient-to-br from-yellow-200 to-yellow-500 text-yellow-950",
  epic: "bg-gradient-to-br from-indigo-200 to-indigo-500 text-indigo-950",
  legendary: "bg-gradient-to-br from-neutral-800 via-yellow-600 to-neutral-800 text-yellow-100",
};

function rarityKey(rarity: Rarity) {
  return `gm.rarity.${rarity}` as const;
}

function BadgeChip({ state, compact }: { state: BadgeWithState; compact?: boolean }) {
  const t = useS();
  const { definition, awarded, metricValue } = state;
  const locked = !awarded;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center",
        locked ? "border-cova-line bg-cova-bg opacity-70 grayscale" : "border-cova-line bg-white",
      )}
    >
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full text-lg shadow-inner",
          locked ? "bg-cova-pale text-cova-mute" : RARITY_STYLE[definition.rarity],
        )}
        aria-hidden="true"
      >
        {locked ? <Lock className="h-5 w-5" /> : <Trophy className="h-5 w-5" />}
      </span>
      <span className="line-clamp-1 text-xs font-semibold">{definition.name}</span>
      {awarded?.recipient_number && <span className="text-[10px] text-cova-mute">#{awarded.recipient_number}</span>}
      {!compact && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-cova-muted">{t(rarityKey(definition.rarity))}</span>
      )}
      {!awarded && metricValue !== null && (
        <div className="w-full">
          <ProgressBar value={Math.min(metricValue, definition.threshold)} max={definition.threshold} label={definition.name} className="h-1.5" />
          <span className="mt-0.5 block text-[10px] text-cova-mute">{Math.min(metricValue, definition.threshold)} / {definition.threshold}</span>
        </div>
      )}
      <span className="text-[10px] text-cova-mute">+{definition.xp_reward} XP</span>
    </div>
  );
}

export function LeaderboardPageContent() {
  const t = useS();
  const { formatTag } = useI18n();
  const social = useSocial();
  const meId = social.meId ?? "";
  const [tab, setTab] = useState<"xp" | "badges">("xp");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchFriendsLeaderboard>>>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [rarity, setRarity] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<"all" | "unlocked" | "locked" | "progress">("all");
  const [query, setQuery] = useState("");
  const [compareFriend, setCompareFriend] = useState<string>("");
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(null);

  // Period selection shared by the chart and both rankings.
  const [periodKind, setPeriodKind] = useState<XpPeriodKind>("week");
  const [periodAnchor, setPeriodAnchor] = useState<Date>(() => periodStart("week", new Date()));
  // Full personal ledger (chart), per-period sums (rankings), global rank.
  const [ledgerFull, setLedgerFull] = useState<XpEntry[] | null>(null);
  const [periodSums, setPeriodSums] = useState<Record<string, number> | null>(null);
  const [sumsError, setSumsError] = useState(false);
  const [globalRank, setGlobalRank] = useState<number | null>(null);

  const { definitions, myBadges, metrics, ledger, xp, togglePin } = useGamification();
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

  const badgeList = useMemo(
    () => (definitions && myBadges && metrics ? buildBadgeList(definitions, myBadges, metrics) : []),
    [definitions, myBadges, metrics],
  );
  const myLevel = useMemo(() => levelForXp(xp ?? 0), [xp]);

  const visibleBadges = badgeList.filter((state) => {
    const { definition, awarded, metricValue } = state;
    if (category !== "all" && definition.category !== category) return false;
    if (rarity !== "all" && definition.rarity !== rarity) return false;
    if (stateFilter === "unlocked" && !awarded) return false;
    if (stateFilter === "locked" && awarded) return false;
    if (stateFilter === "progress" && (awarded || metricValue === null || metricValue <= 0)) return false;
    return !query.trim() || definition.name.toLowerCase().includes(query.trim().toLowerCase());
  });

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
          <div className="flex flex-wrap items-center gap-3">
            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={t("gm.filter.category")} className="h-9 rounded-lg border border-cova-line bg-white px-2 text-sm">
              <option value="all">{t("gm.filter.allCategories")}</option>
              {CATEGORIES.map((item) => <option key={item} value={item}>{t(`gm.category.${item}` as never)}</option>)}
            </select>
            <select value={rarity} onChange={(event) => setRarity(event.target.value)} aria-label={t("gm.filter.rarity")} className="h-9 rounded-lg border border-cova-line bg-white px-2 text-sm">
              <option value="all">{t("gm.filter.allRarities")}</option>
              {RARITIES.map((item) => <option key={item} value={item}>{t(rarityKey(item))}</option>)}
            </select>
            <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)} aria-label={t("gm.filter.state")} className="h-9 rounded-lg border border-cova-line bg-white px-2 text-sm">
              <option value="all">{t("gm.filter.allStates")}</option>
              <option value="unlocked">{t("gm.filter.unlocked")}</option>
              <option value="locked">{t("gm.filter.locked")}</option>
              <option value="progress">{t("gm.filter.progress")}</option>
            </select>
            <div className="min-w-40 flex-1">
              <SearchInput label={t("gm.search")} placeholder={t("gm.search")} value={query} onChange={setQuery} />
            </div>
          </div>

          {meId && (
            <Card>
              <CardBody className="flex flex-wrap items-center gap-4">
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-semibold">{t("gm.yourLevel", { name: myLevel.name, level: myLevel.level })}</p>
                  <ProgressBar value={myLevel.needed > 0 ? myLevel.into : 1} max={myLevel.needed > 0 ? myLevel.needed : 1} label={t("gm.yourLevel", { name: myLevel.name, level: myLevel.level })} className="mt-1.5" />
                  <p className="mt-1 text-xs text-cova-mute">{xp?.toLocaleString(formatTag)} XP{myLevel.needed > 0 && ` · ${t("gm.xpToNext", { into: myLevel.into, needed: myLevel.needed })}`}</p>
                </div>
                <div className="text-end">
                  <p className="text-sm text-cova-mute">{t("gm.badgesUnlocked")}</p>
                  <p className="text-xl font-semibold">{myBadges?.length ?? 0} <span className="text-sm text-cova-mute">/ {definitions?.length ?? 0}</span></p>
                </div>
              </CardBody>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {visibleBadges.map((state) => {
              const awarded = state.awarded;
              const isPinned = awarded?.pinned ?? false;
              return (
                <div key={state.definition.key} className="space-y-1">
                  <BadgeChip state={state} />
                  {awarded && (
                    <Button
                      size="sm"
                      variant={isPinned ? "primary" : "ghost"}
                      className="w-full"
                      onClick={() => void togglePin(state.definition.key, !isPinned)}
                    >
                      {isPinned ? t("gm.unpin") : t("gm.pin")}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

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
