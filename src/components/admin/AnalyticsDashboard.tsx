"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useI18n, useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface AnalyticsSummary {
  days: number;
  users: { total: number; new: number; new_prev: number; active: number; active_prev: number; retained: number };
  education: {
    quiz_attempts: number; quiz_attempts_prev: number; quiz_games: number; quiz_participations: number;
    avg_accuracy: number | null; assignment_submissions: number; challenge_submissions: number;
    resources_added: number; popular_categories: { category: string; n: number }[];
  };
  gamification: {
    xp_total: number; xp_prev: number; badges_unlocked: number;
    badge_top: { key: string; name: string; n: number }[];
    levels: { level: number; n: number }[];
  };
  moderation: {
    reports: number; reports_open: number; reports_by_status: Record<string, number>;
    sanctions: number; sanctions_by_type: Record<string, number>; appeals: number;
    avg_report_resolution_hours: number | null;
    moderator_activity: { name: string | null; actions: number }[];
  };
  series: {
    registrations: { day: string; n: number }[];
    xp: { day: string; n: number }[];
  };
}

const PERIODS = [7, 30, 90, 365] as const;

function pct(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const delta = Math.round(((current - previous) / previous) * 100);
  return `${delta > 0 ? "+" : ""}${delta}%`;
}

function Trend({ current, previous }: { current: number; previous: number }) {
  const t = useT();
  const p = pct(current, previous);
  if (p === null) return <span className="text-xs text-cova-mute">—</span>;
  const up = !p.startsWith("-");
  return (
    <span className={cn("text-xs font-semibold", up ? "text-emerald-700" : "text-red-800")}>
      {p} <span className="font-normal text-cova-mute">{t("admin.analytics.vsPrev")}</span>
    </span>
  );
}

/** Compact inline SVG bar chart (same visual language as XpAnalytics). */
function BarChart({ data, label, color }: { data: { day: string; n: number }[]; label: string; color: string }) {
  const W = 640;
  const H = 140;
  const M = { left: 34, right: 4, top: 8, bottom: 16 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const max = Math.max(1, ...data.map((d) => d.n));
  const step = plotW / Math.max(1, data.length);
  const grid = [0.5, 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
      {grid.map((r) => (
        <g key={r}>
          <line x1={M.left} x2={W - M.right} y1={M.top + plotH * (1 - r)} y2={M.top + plotH * (1 - r)} className="stroke-cova-line" strokeWidth="1" />
          <text x={M.left - 5} y={M.top + plotH * (1 - r) + 3} textAnchor="end" className="fill-cova-mute" fontSize="9">
            {Math.round(max * r)}
          </text>
        </g>
      ))}
      <line x1={M.left} x2={W - M.right} y1={M.top + plotH} y2={M.top + plotH} className="stroke-cova-line" strokeWidth="1" />
      {data.map((d, i) => {
        const h = (d.n / max) * plotH;
        return (
          <rect
            key={d.day}
            x={M.left + i * step + Math.max(0.4, step * 0.15)}
            y={M.top + plotH - h}
            width={Math.max(1, step * 0.7)}
            height={Math.max(d.n > 0 ? 1.5 : 0, h)}
            rx={1.5}
            fill={color}
          >
            <title>{`${d.day}: ${d.n}`}</title>
          </rect>
        );
      })}
      {data.length > 1 && data[0] && (
        <text x={M.left} y={H - 3} className="fill-cova-mute" fontSize="9">
          {data[0].day}
        </text>
      )}
    </svg>
  );
}

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) => r.map((c) => (typeof c === "string" && (c.includes(",") || c.includes('"')) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(","))
    .join("\n");
}

function download(name: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Platform analytics: real aggregates from admin_analytics_summary, period
 * comparison, CSV export of the loaded series. */
export function AnalyticsDashboard() {
  const t = useT();
  const { formatTag } = useI18n();
  const toast = useToast();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async (p: number) => {
    setError(false);
    setData(null);
    const { data: result, error: rpcError } = await getSupabase().rpc("admin_analytics_summary", { p_days: p });
    if (rpcError) {
      setError(true);
      return;
    }
    setData(result as AnalyticsSummary);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on period change (same pattern as AdminUsers)
    void load(days);
  }, [days, load]);

  const fmt = useCallback((n: number) => n.toLocaleString(formatTag), [formatTag]);

  const exportSeries = useCallback(() => {
    if (!data) return;
    const rows: (string | number)[][] = [["day", "registrations", "xp_earned"]];
    const byDay = new Map<string, [string | number, string | number]>();
    for (const r of data.series.registrations) byDay.set(r.day, [r.n, 0]);
    for (const r of data.series.xp) {
      const prev = byDay.get(r.day) ?? [0, 0];
      byDay.set(r.day, [prev[0], r.n]);
    }
    for (const [day, [reg, xp]] of [...byDay.entries()].sort()) rows.push([day, reg, xp]);
    download(`cova-analytics-${days}d.csv`, toCsv(rows));
    toast.push(t("admin.analytics.exported"));
  }, [data, days, t, toast]);

  const topLevels = useMemo(() => (data?.gamification.levels ?? []).slice(0, 8), [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={days === p}
            onClick={() => setDays(p)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              days === p ? "bg-cova-ink text-white" : "bg-white text-cova-mute hover:bg-cova-pale",
            )}
          >
            {t(`admin.analytics.p.${p}` as never)}
          </button>
        ))}
        <div className="ml-auto">
          <Button variant="secondary" onClick={exportSeries} disabled={!data}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("admin.analytics.export")}
          </Button>
        </div>
      </div>

      {error ? (
        <Card>
          <CardBody>
            <p role="alert" className="text-sm font-medium text-red-800">{t("admin.analytics.loadError")}</p>
          </CardBody>
        </Card>
      ) : !data ? (
        <div className="space-y-3" aria-busy="true">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {/* users */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.analytics.users")}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.totalUsers")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.users.total)}</p>
              </CardBody></Card>
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.newUsers")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.users.new)}</p>
                <Trend current={data.users.new} previous={data.users.new_prev} />
              </CardBody></Card>
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.activeUsers")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.users.active)}</p>
                <Trend current={data.users.active} previous={data.users.active_prev} />
              </CardBody></Card>
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.retention")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">
                  {data.users.active_prev > 0 ? `${Math.round((data.users.retained / data.users.active_prev) * 100)}%` : "—"}
                </p>
                <p className="text-xs text-cova-mute">{t("admin.analytics.retentionHint")}</p>
              </CardBody></Card>
            </div>
            <Card>
              <CardBody>
                <p className="mb-2 text-sm font-semibold text-cova-ink">{t("admin.analytics.registrationsChart")}</p>
                <BarChart data={data.series.registrations} label={t("admin.analytics.registrationsChart")} color="#6F9FBA" />
              </CardBody>
            </Card>
          </section>

          {/* education */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.analytics.education")}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.quizAttempts")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.education.quiz_attempts)}</p>
                <Trend current={data.education.quiz_attempts} previous={data.education.quiz_attempts_prev} />
              </CardBody></Card>
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.quizParticipations")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.education.quiz_participations)}</p>
              </CardBody></Card>
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.avgAccuracy")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{data.education.avg_accuracy !== null ? `${data.education.avg_accuracy}%` : "—"}</p>
              </CardBody></Card>
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.submissions")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.education.assignment_submissions + data.education.challenge_submissions)}</p>
              </CardBody></Card>
            </div>
            <Card>
              <CardBody>
                <p className="mb-2 text-sm font-semibold text-cova-ink">{t("admin.analytics.popularCategories")}</p>
                {(data.education.popular_categories.length === 0) ? (
                  <p className="text-sm text-cova-mute">{t("admin.analytics.noData")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.education.popular_categories.map((c) => (
                      <li key={c.category} className="flex items-center gap-3 text-sm">
                        <span className="w-40 truncate text-cova-ink">{c.category}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-cova-pale">
                          <span className="block h-full rounded-full bg-cova-muted" style={{ width: `${(c.n / Math.max(1, data.education.popular_categories[0]?.n ?? 1)) * 100}%` }} />
                        </span>
                        <span className="w-10 text-right text-cova-mute">{c.n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </section>

          {/* gamification */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.analytics.gamification")}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.xpEarned")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.gamification.xp_total)}</p>
                <Trend current={data.gamification.xp_total} previous={data.gamification.xp_prev} />
              </CardBody></Card>
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.badgesUnlocked")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.gamification.badges_unlocked)}</p>
              </CardBody></Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardBody>
                  <p className="mb-2 text-sm font-semibold text-cova-ink">{t("admin.analytics.xpChart")}</p>
                  <BarChart data={data.series.xp} label={t("admin.analytics.xpChart")} color="#D9A441" />
                </CardBody>
              </Card>
              <Card>
                <CardBody>
                  <p className="mb-2 text-sm font-semibold text-cova-ink">{t("admin.analytics.levelsChart")}</p>
                  {topLevels.length === 0 ? (
                    <p className="text-sm text-cova-mute">{t("admin.analytics.noData")}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {topLevels.map((l) => {
                        const maxN = Math.max(...topLevels.map((x) => x.n));
                        return (
                          <li key={l.level} className="flex items-center gap-3 text-sm">
                            <span className="w-24 text-cova-ink">{t("admin.gamif.level")} {l.level}</span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-cova-pale">
                              <span className="block h-full rounded-full bg-cova-soft" style={{ width: `${(l.n / maxN) * 100}%` }} />
                            </span>
                            <span className="w-10 text-right text-cova-mute">{l.n}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </div>
          </section>

          {/* moderation */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">{t("admin.analytics.moderation")}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.reports")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.moderation.reports)}</p>
                <p className="text-xs text-cova-mute">{t("admin.analytics.reportsOpen")}: {fmt(data.moderation.reports_open)}</p>
              </CardBody></Card>
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.sanctions")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.moderation.sanctions)}</p>
              </CardBody></Card>
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.appeals")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{fmt(data.moderation.appeals)}</p>
              </CardBody></Card>
              <Card><CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">{t("admin.analytics.avgResolution")}</p>
                <p className="mt-1 text-2xl font-bold text-cova-ink">{data.moderation.avg_report_resolution_hours !== null ? `${data.moderation.avg_report_resolution_hours}h` : "—"}</p>
              </CardBody></Card>
            </div>
            <Card>
              <CardBody>
                <p className="mb-2 text-sm font-semibold text-cova-ink">{t("admin.analytics.moderatorActivity")}</p>
                {data.moderation.moderator_activity.length === 0 ? (
                  <p className="text-sm text-cova-mute">{t("admin.analytics.noData")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.moderation.moderator_activity.map((m) => (
                      <li key={m.name ?? "?"} className="flex items-center justify-between text-sm">
                        <span className="text-cova-ink">{m.name ?? "—"}</span>
                        <span className="text-cova-mute">{m.actions}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
