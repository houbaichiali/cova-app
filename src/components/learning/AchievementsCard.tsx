"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useS } from "@/i18n/spaces";
import { cn } from "@/lib/utils";
import { levelForXp, useGamification } from "@/lib/gamification";
import { buildAchievements } from "@/lib/badge-collection";
import { rankName, rankStyle } from "@/lib/badge-ranks";

/** Achievements summary on the profile page: badges, XP, level, ranks, recent wins. */
export function AchievementsCard() {
  const t = useS();
  const { definitions, myBadges, rankAwards, metrics, xp } = useGamification();

  const achievements = useMemo(
    () =>
      definitions && myBadges && rankAwards
        ? buildAchievements(definitions, myBadges, rankAwards, metrics)
        : [],
    [definitions, myBadges, rankAwards, metrics],
  );
  const nameByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const definition of definitions ?? [])
      map.set(definition.key, (definition.name.split("·")[0] ?? definition.name).trim());
    return map;
  }, [definitions]);

  if (!myBadges || !definitions) return null;

  const level = levelForXp(xp ?? 0);
  const pinned = achievements.filter((achievement) => achievement.pinned);
  const ranks = (rankAwards ?? []).slice(0, 6);
  const pct = definitions.length > 0 ? Math.round((myBadges.length / definitions.length) * 100) : 0;
  const recent = [...achievements]
    .filter((achievement) => achievement.currentRank !== null)
    .sort((a, b) =>
      (b.tiers.find((tier) => tier.position === b.currentRank)?.awardedAt ?? "").localeCompare(
        a.tiers.find((tier) => tier.position === a.currentRank)?.awardedAt ?? "",
      ),
    )
    .slice(0, 4);

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Trophy className="h-5 w-5 text-cova-muted" aria-hidden="true" />
            {t("gm.profile.title")}
          </h2>
          <Link href="/leaderboard?tab=badges" className="text-sm font-medium underline-offset-2 hover:underline">
            {t("gm.profile.viewAll")}
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-cova-mute">{t("gm.badgesUnlocked")}</p>
            <p className="text-xl font-semibold">
              {myBadges.length} / {definitions.length} <span className="text-sm text-cova-mute">({pct}%)</span>
            </p>
            <ProgressBar
              value={myBadges.length}
              max={Math.max(1, definitions.length)}
              label={t("gm.badgesUnlocked")}
              className="mt-1.5"
            />
          </div>
          <div>
            <p className="text-sm text-cova-mute">{t("gm.profile.level")}</p>
            <p className="text-xl font-semibold">
              {level.name} · {level.level}
            </p>
            <p className="text-xs text-cova-mute">{(xp ?? 0).toLocaleString()} XP</p>
          </div>
          <div>
            <p className="text-sm text-cova-mute">{t("gm.profile.showcase")}</p>
            {pinned.length === 0 ? (
              <p className="text-sm text-cova-mute">{t("gm.profile.showcaseEmpty")}</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {pinned.map((achievement) => {
                  const style = rankStyle(achievement.currentRank ?? 1);
                  return (
                    <span
                      key={achievement.key}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        achievement.currentRank ? style.chip : "bg-cova-pale text-cova-mute",
                      )}
                    >
                      {achievement.name}
                      {achievement.currentRank ? ` · ${rankName(achievement.currentRank)}` : ""}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {ranks.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">{t("gm.profile.ranks")}</p>
            <ul className="flex flex-wrap gap-2 text-xs">
              {ranks.map((row) => {
                const style = rankStyle(row.rank);
                return (
                  <li key={`${row.badge_key}-${row.rank}`} className={cn("rounded-full px-3 py-1 font-medium", style.chip)}>
                    {nameByKey.get(row.badge_key) ?? row.badge_key} · {rankName(row.rank)}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {recent.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">{t("gm.profile.recent")}</p>
            <ul className="flex flex-wrap gap-2 text-xs">
              {recent.map((achievement) => {
                const style = rankStyle(achievement.currentRank ?? 1);
                return (
                  <li
                    key={achievement.key}
                    className={cn(
                      "rounded-full px-3 py-1 font-medium",
                      achievement.currentRank ? style.chip : "bg-cova-pale text-cova-mute",
                    )}
                  >
                    {achievement.name}
                    {achievement.currentRank ? ` · ${rankName(achievement.currentRank)}` : ""}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
