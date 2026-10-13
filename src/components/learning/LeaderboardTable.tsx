"use client";

import { useState } from "react";
import Link from "next/link";
import { Medal } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { buttonStyles } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { getStudent } from "@/data/students";
import { useI18n } from "@/i18n/client";
import { useS } from "@/i18n/spaces";
import { useDemoState } from "@/lib/demo-store";
import { buildLeaderboard, levelFor, xpBreakdown } from "@/lib/progress";
import { cn } from "@/lib/utils";

/** XP ranking linked to the signed-in account (name + XP come from the account, not a fixed demo user). */
export function LeaderboardTable() {
  const t = useS();
  const { formatTag } = useI18n();
  const state = useDemoState();
  const [top5, setTop5] = useState(false);
  const signedIn = !!state.session;

  const breakdown = xpBreakdown(state);
  const name = state.session?.name ?? state.settings.displayName;
  const everyone = buildLeaderboard(breakdown.total, name);
  const all = signedIn
    ? everyone
    : everyone.filter((r) => !r.isMe).map((r, i) => ({ ...r, rank: i + 1 }));
  const rows = top5 ? all.slice(0, 5) : all;
  const me = all.find((r) => r.isMe);
  const fmt = (n: number) => n.toLocaleString(formatTag);
  const tabAll = t("lb.all");
  const tabTop = t("lb.top5");

  const parts: Array<[string, number]> = [
    [t("lb.b.base"), breakdown.base],
    [t("lb.b.learning"), breakdown.learning],
    [t("lb.b.voice"), breakdown.voice],
    [t("lb.b.hosted"), breakdown.hosted],
    [t("lb.b.chat"), breakdown.chat],
  ];

  return (
    <>
      <PageHeader title={t("lb.title")} description={t("lb.desc")} />

      {signedIn && me ? (
        <p className="mb-4 rounded-lg bg-cova-pale px-4 py-3 text-sm">
          {t("lb.ranked", { name, rank: me.rank, xp: fmt(me.xp) })}
        </p>
      ) : (
        <div className="mb-4 flex flex-col gap-3 rounded-lg bg-cova-pale px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{t("lb.signin")}</span>
          <Link href="/login" className={buttonStyles({ size: "sm", variant: "secondary" })}>
            {t("lb.signinBtn")}
          </Link>
        </div>
      )}

      {signedIn && (
        <Card className="mb-4">
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold">{t("lb.breakdown")}</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {parts.map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-3 border-b border-cova-line pb-1.5"
                >
                  <dt className="text-cova-mute">{label}</dt>
                  <dd className="font-medium">{fmt(value)}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      )}

      <div className="mb-4">
        <Tabs
          tabs={[tabAll, tabTop]}
          value={top5 ? tabTop : tabAll}
          onChange={(v) => setTop5(v === tabTop)}
          label={t("lb.title")}
        />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("lb.title")}</caption>
          <thead className="border-b border-cova-line bg-cova-bg text-start text-cova-mute">
            <tr>
              <th scope="col" className="w-16 px-4 py-3 text-start font-medium">
                {t("lb.rank")}
              </th>
              <th scope="col" className="px-4 py-3 text-start font-medium">
                {t("lb.student")}
              </th>
              <th scope="col" className="hidden px-4 py-3 text-start font-medium sm:table-cell">
                {t("lb.level")}
              </th>
              <th scope="col" className="px-4 py-3 text-end font-medium">
                {t("lb.xp")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cova-line">
            {rows.map((r) => {
              const s = getStudent(r.id);
              return (
                <tr key={r.id} className={cn(r.isMe && "bg-cova-pale/60")}>
                  <td className="px-4 py-3 font-medium">
                    {r.rank <= 3 ? (
                      <span className="flex items-center gap-1.5">
                        <Medal className="h-4 w-4 text-cova-muted" aria-hidden="true" />
                        {r.rank}
                      </span>
                    ) : (
                      r.rank
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={r.name} tone={s?.tone ?? "soft"} size="sm" />
                      <span className="font-medium">
                        {r.name}
                        {r.isMe && ` (${t("lb.you")})`}
                      </span>
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-cova-mute sm:table-cell">
                    {levelFor(r.xp).level}
                  </td>
                  <td className="px-4 py-3 text-end font-medium">{fmt(r.xp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
