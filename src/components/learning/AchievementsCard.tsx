"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useS } from "@/i18n/spaces";
import { levelForXp, useGamification } from "@/lib/gamification";

/** Achievements summary on the profile page: badges, XP, level, recent wins. */
export function AchievementsCard() {
  const t = useS();
  const { definitions, myBadges, xp } = useGamification();
  if (!myBadges || !definitions) return null;

  const level = levelForXp(xp ?? 0);
  const recent = myBadges
    .slice()
    .sort((a, b) => b.awarded_at.localeCompare(a.awarded_at))
    .slice(0, 4);
  const pinned = myBadges.filter((badge) => badge.pinned);
  const pct = definitions.length > 0 ? Math.round((myBadges.length / definitions.length) * 100) : 0;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="h-5 w-5 text-cova-muted" aria-hidden="true" />{t("gm.profile.title")}</h2>
          <Link href="/leaderboard?tab=badges" className="text-sm font-medium underline-offset-2 hover:underline">{t("gm.profile.viewAll")}</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-cova-mute">{t("gm.badgesUnlocked")}</p>
            <p className="text-xl font-semibold">{myBadges.length} / {definitions.length} <span className="text-sm text-cova-mute">({pct}%)</span></p>
            <ProgressBar value={myBadges.length} max={Math.max(1, definitions.length)} label={t("gm.badgesUnlocked")} className="mt-1.5" />
          </div>
          <div>
            <p className="text-sm text-cova-mute">{t("gm.profile.level")}</p>
            <p className="text-xl font-semibold">{level.name} · {level.level}</p>
            <p className="text-xs text-cova-mute">{(xp ?? 0).toLocaleString()} XP</p>
          </div>
          <div>
            <p className="text-sm text-cova-mute">{t("gm.profile.showcase")}</p>
            {pinned.length === 0 ? (
              <p className="text-sm text-cova-mute">{t("gm.profile.showcaseEmpty")}</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {pinned.map((badge) => <Badge key={badge.badge_key} tone="soft">{badge.badge_key}</Badge>)}
              </div>
            )}
          </div>
        </div>
        {recent.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">{t("gm.profile.recent")}</p>
            <ul className="flex flex-wrap gap-2 text-xs">
              {recent.map((badge) => (
                <li key={badge.badge_key} className="rounded-full bg-cova-pale px-3 py-1 font-medium">{badge.badge_key}</li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
