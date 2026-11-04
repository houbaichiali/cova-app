"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { useI18n } from "@/i18n/client";
import { useS } from "@/i18n/spaces";
import {
  bucketGains,
  compareSeries,
  periodEnd,
  periodIsCurrent,
  periodStart,
  shiftPeriod,
  type DaySeries,
  type XpEntry,
  type XpPeriodKind,
} from "@/lib/xp-analytics";
import { cn } from "@/lib/utils";

/** Functional chart colors (same approach as the quiz answer palette). */
const SERIES_COLORS = ["#6F9FBA", "#D9A441", "#5E8C61"];
const MAX_SERIES = 3;
const KINDS = ["week", "month", "year"] as const;

const W = 720;
const H = 240;
const M = { left: 46, right: 8, top: 12, bottom: 28 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

function niceMax(value: number): number {
  if (value <= 10) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= value) return m * pow;
  }
  return 10 * pow;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

interface XpAnalyticsProps {
  entries: XpEntry[];
  loading: boolean;
  /** Controlled period selection so rankings can follow the same range. */
  kind: XpPeriodKind;
  anchor: Date;
  onKindChange: (kind: XpPeriodKind) => void;
  onAnchorChange: (anchor: Date) => void;
}

/** Interactive XP-per-day chart with week / month / year filters and
 * same-duration period comparison (up to MAX_SERIES periods). */
export function XpAnalytics({ entries, loading, kind, anchor, onKindChange, onAnchorChange }: XpAnalyticsProps) {
  const s = useS();
  const { formatTag } = useI18n();
  const [extra, setExtra] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  const changeKind = (next: string) => {
    const k = (KINDS.find((item) => item === next) ?? "week") as XpPeriodKind;
    onKindChange(k);
    onAnchorChange(periodStart(k, new Date()));
    setExtra(0);
    setHovered(null);
  };

  const series = useMemo(() => {
    const list: DaySeries[] = [];
    for (let i = 0; i <= extra; i += 1) {
      list.push(bucketGains(entries, kind, shiftPeriod(kind, anchor, -i)));
    }
    return list;
  }, [entries, kind, anchor, extra]);

  const maxLen = Math.max(...series.map((item) => item.dayCount));
  const maxY = niceMax(Math.max(10, ...series.flatMap((item) => item.values)));
  const canNext = !periodIsCurrent(kind, anchor);
  const navigate = (delta: number) => onAnchorChange(shiftPeriod(kind, anchor, delta));
  const slotW = PLOT_W / maxLen;
  const groupW = slotW * 0.72;
  const barW = series.length > 0 ? groupW / series.length : 0;

  const dayFormatter = useMemo(() => new Intl.DateTimeFormat(formatTag, { day: "numeric", month: "short" }), [formatTag]);
  const monthFormatter = useMemo(() => new Intl.DateTimeFormat(formatTag, { month: "short" }), [formatTag]);
  const monthYearFormatter = useMemo(
    () => new Intl.DateTimeFormat(formatTag, { month: "short", year: "numeric" }),
    [formatTag],
  );
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(formatTag, { weekday: "narrow" }),
    [formatTag],
  );

  function seriesLabel(index: number): string {
    const start = series[index]?.start;
    if (!start) return "";
    if (index === 0) {
      return kind === "week"
        ? s("lb.chart.thisWeek")
        : kind === "month"
          ? s("lb.chart.thisMonth")
          : s("lb.chart.thisYear");
    }
    if (kind === "week") return s("lb.chart.weekOf", { date: dayFormatter.format(start) });
    return s("lb.chart.of", { date: kind === "month" ? monthYearFormatter.format(start) : String(start.getFullYear()) });
  }

  function bucketLabel(index: number): string {
    const current = series[0];
    if (!current) return "";
    if (kind === "week") return dayFormatter.format(addDays(current.start, index));
    if (kind === "month") {
      const day = addDays(current.start, index);
      return dayFormatter.format(day);
    }
    const from = addDays(current.start, index * 7);
    const to = addDays(current.start, index * 7 + 6);
    return `${dayFormatter.format(from)} – ${dayFormatter.format(to)}`;
  }

  const xLabels = useMemo(() => {
    const labels: Array<{ index: number; text: string }> = [];
    const base = series[0];
    if (!base) return labels;
    if (kind === "week") {
      for (let i = 0; i < maxLen; i += 1) {
        labels.push({ index: i, text: weekdayFormatter.format(addDays(base.start, i)) });
      }
    } else if (kind === "month") {
      const step = Math.max(1, Math.ceil(maxLen / 8));
      for (let i = 0; i < maxLen; i += step) {
        labels.push({ index: i, text: String(i + 1) });
      }
    } else {
      let lastMonth = -1;
      for (let i = 0; i < maxLen; i += 1) {
        const month = addDays(base.start, i * 7).getMonth();
        if (month !== lastMonth) {
          labels.push({ index: i, text: monthFormatter.format(addDays(base.start, i * 7)) });
          lastMonth = month;
        }
      }
    }
    return labels;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the series change
  }, [series, kind, maxLen, formatTag]);

  const totals = series.map((item) => item.total);
  const nothingGained = totals.every((total) => total === 0);

  return (
    <Card>
      <CardHeader
        title={s("lb.chart.title")}
        action={
          <Tabs
            tabs={[s("lb.chart.week"), s("lb.chart.month"), s("lb.chart.year")]}
            value={s(`lb.chart.${kind}` as const)}
            onChange={changeKind}
            label={s("lb.chart.title")}
          />
        }
      />
      <CardBody className="space-y-4">
        {/* navigation */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label={s("lb.chart.prev")}
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <p className="text-sm font-medium text-cova-ink">
            {periodEnd(kind, anchor) === new Date(periodEnd(kind, anchor).getFullYear(), periodEnd(kind, anchor).getMonth(), periodEnd(kind, anchor).getDate())
              ? seriesLabel(0)
              : `${dayFormatter.format(anchor)} – ${dayFormatter.format(addDays(periodEnd(kind, anchor), -1))}`}
          </p>
          <Button
            variant="secondary"
            size="sm"
            aria-label={s("lb.chart.next")}
            disabled={!canNext}
            onClick={() => navigate(1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* chart */}
        {loading ? (
          <div className="h-60 animate-pulse rounded-xl bg-cova-pale" aria-busy="true" />
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={s("lb.chart.title")}
            className="h-auto w-full touch-none"
            onPointerLeave={() => setHovered(null)}
          >
            {/* gridlines */}
            {[0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = M.top + PLOT_H * (1 - ratio);
              return (
                <g key={ratio}>
                  <line x1={M.left} x2={W - M.right} y1={y} y2={y} stroke="#E5EDF3" strokeWidth="1" />
                  <text x={M.left - 6} y={y + 4} textAnchor="end" className="fill-cova-mute" fontSize="10">
                    {Math.round(maxY * ratio)}
                  </text>
                </g>
              );
            })}
            <text x={M.left - 6} y={M.top + PLOT_H + 4} textAnchor="end" className="fill-cova-mute" fontSize="10">
              0
            </text>

            {/* bars + hover zones */}
            {series.map((item, seriesIndex) =>
              item.values.map((value, bucket) => {
                const barH = (value / maxY) * PLOT_H;
                const x = M.left + bucket * slotW + (slotW - groupW) / 2 + seriesIndex * barW;
                return (
                  <rect
                    key={`${seriesIndex}-${bucket}`}
                    x={x}
                    y={M.top + PLOT_H - barH}
                    width={Math.max(1.5, barW - 1.5)}
                    height={Math.max(0, barH)}
                    rx={Math.min(2.5, Math.max(1, barW / 4))}
                    fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
                    opacity={hovered === null || hovered === bucket ? 1 : 0.45}
                  />
                );
              }),
            )}
            {Array.from({ length: maxLen }, (_, bucket) => (
              <rect
                key={`hover-${bucket}`}
                x={M.left + bucket * slotW}
                y={M.top}
                width={slotW}
                height={PLOT_H}
                fill="transparent"
                onPointerEnter={() => setHovered(bucket)}
                onClick={() => setHovered(bucket)}
              />
            ))}

            {/* x labels */}
            {xLabels.map(({ index, text }) => (
              <text
                key={index}
                x={M.left + index * slotW + slotW / 2}
                y={H - 8}
                textAnchor="middle"
                className="fill-cova-mute"
                fontSize="10"
              >
                {text}
              </text>
            ))}
          </svg>
        )}

        {/* hovered bucket details (touch friendly) */}
        <div className="min-h-6 text-xs text-cova-mute" aria-live="polite">
          {hovered !== null && series[0] ? (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium text-cova-ink">{bucketLabel(hovered)}</span>
              {series.map((item, seriesIndex) => (
                <span key={seriesIndex} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: SERIES_COLORS[seriesIndex % SERIES_COLORS.length] }}
                    aria-hidden="true"
                  />
                  {item.values[hovered] ?? 0} XP
                </span>
              ))}
            </span>
          ) : nothingGained && !loading ? (
            s("lb.chart.empty")
          ) : (
            ""
          )}
        </div>

        {/* legend + comparison */}
        <div className="space-y-2">
          {series.map((item, seriesIndex) => {
            const chip = (
              <span className="inline-flex items-center gap-2 rounded-full border border-cova-line bg-white px-3 py-1 text-xs font-medium text-cova-ink">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: SERIES_COLORS[seriesIndex % SERIES_COLORS.length] }}
                  aria-hidden="true"
                />
                {seriesLabel(seriesIndex)}
                <span className="text-cova-mute">{s("lb.chart.total", { total: item.total.toLocaleString(formatTag) })}</span>
                {seriesIndex > 0 &&
                  series[0] &&
                  (() => {
                    const cmp = compareSeries(series[0], item);
                    return (
                      <span className={cn(cmp.diff >= 0 ? "text-emerald-700" : "text-red-800")}>
                        {cmp.diff >= 0 ? "+" : ""}
                        {cmp.diff} XP
                        {cmp.percent !== null && ` (${cmp.percent > 0 ? "+" : ""}${cmp.percent}%)`}
                      </span>
                    );
                  })()}
              </span>
            );
            return (
              <div key={seriesIndex} className="flex items-center gap-2">
                {chip}
                {seriesIndex > 0 && (
                  <button
                    type="button"
                    aria-label={s("lb.chart.remove")}
                    className="rounded p-1 text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
                    onClick={() => setExtra(seriesIndex - 1)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
          {extra + 1 < MAX_SERIES && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExtra((prev) => Math.min(prev + 1, MAX_SERIES - 1))}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {s("lb.chart.compare")}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
