/**
 * XP analytics: period ranges, per-day bucketing and period comparisons.
 * Pure functions — no Supabase, no React — so the math is testable in
 * isolation. All ranges are computed in the viewer's LOCAL timezone: a
 * "day" means the user's calendar day.
 */

export type XpPeriodKind = "week" | "month" | "year";

export interface XpEntry {
  amount: number;
  createdAt: string; // ISO timestamp
}

export interface DaySeries {
  /** Local midnight starting the period. */
  start: Date;
  /** Number of day buckets in the period (7 for a week, 28-31 a month…). */
  dayCount: number;
  /** XP gained per day bucket (weekly buckets when kind is "year"). */
  values: number[];
  total: number;
}

const DAY_MS = 86_400_000;

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday-based week start. */
export function startOfLocalWeek(date: Date): Date {
  const day = startOfLocalDay(date);
  const weekday = (day.getDay() + 6) % 7; // 0 = Monday
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - weekday);
}

/** Local midnight starting the period that contains `date`. */
export function periodStart(kind: XpPeriodKind, date: Date): Date {
  const day = startOfLocalDay(date);
  if (kind === "week") return startOfLocalWeek(day);
  if (kind === "month") return new Date(day.getFullYear(), day.getMonth(), 1);
  return new Date(day.getFullYear(), 0, 1);
}

/** Day buckets the period is divided into (weeks: 7, months: 28-31, year: weekly buckets). */
export function periodBucketCount(kind: XpPeriodKind, start: Date): number {
  const end = periodEnd(kind, start);
  if (kind === "year") return Math.ceil((end.getTime() - start.getTime()) / (7 * DAY_MS));
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/** Local midnight ending the period (exclusive). */
export function periodEnd(kind: XpPeriodKind, start: Date): Date {
  if (kind === "week") return new Date(start.getTime() + 7 * DAY_MS);
  if (kind === "month") return new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return new Date(start.getFullYear() + 1, 0, 1);
}

/** Move a period anchor by whole periods (-1 = previous). */
export function shiftPeriod(kind: XpPeriodKind, start: Date, delta: number): Date {
  if (kind === "week") return new Date(start.getTime() + delta * 7 * DAY_MS);
  if (kind === "month") return new Date(start.getFullYear(), start.getMonth() + delta, 1);
  return new Date(start.getFullYear() + delta, 0, 1);
}

/** True when the period still contains today (nothing to show after it). */
export function periodIsCurrent(kind: XpPeriodKind, start: Date, now = new Date()): boolean {
  return periodEnd(kind, start).getTime() > now.getTime();
}

/**
 * Sum entries into the period's day buckets. Timestamps are converted to the
 * viewer's local calendar day before bucketing.
 */
export function bucketGains(entries: XpEntry[], kind: XpPeriodKind, start: Date): DaySeries {
  if (kind === "year") return bucketYear(entries, start);
  const dayCount = periodBucketCount(kind, start);
  const values = new Array<number>(dayCount).fill(0);
  const firstDay = startOfLocalDay(start).getTime();
  for (const entry of entries) {
    const at = new Date(entry.createdAt);
    const dayIndex = Math.round((startOfLocalDay(at).getTime() - firstDay) / DAY_MS);
    if (dayIndex >= 0 && dayIndex < dayCount) {
      values[dayIndex] = (values[dayIndex] ?? 0) + entry.amount;
    }
  }
  return { start, dayCount, values, total: values.reduce((sum, v) => sum + v, 0) };
}

/** A year is charted as weekly buckets so 365 days stay readable. */
function bucketYear(entries: XpEntry[], start: Date): DaySeries {
  const weekCount = periodBucketCount("year", start);
  const values = new Array<number>(weekCount).fill(0);
  const end = periodEnd("year", start);
  for (const entry of entries) {
    const at = new Date(entry.createdAt);
    if (at < start || at >= end) continue;
    const weekIndex = Math.min(
      weekCount - 1,
      Math.floor((at.getTime() - start.getTime()) / (7 * DAY_MS)),
    );
    values[weekIndex] = (values[weekIndex] ?? 0) + entry.amount;
  }
  return { start, dayCount: weekCount, values, total: values.reduce((sum, v) => sum + v, 0) };
}

export interface SeriesComparison {
  /** current total minus compared total. */
  diff: number;
  /** Percent change of the current period vs the compared one (null when impossible). */
  percent: number | null;
}

export function compareSeries(current: DaySeries, compared: DaySeries): SeriesComparison {
  const diff = current.total - compared.total;
  const percent = compared.total > 0 ? Math.round((diff / compared.total) * 1000) / 10 : null;
  return { diff, percent };
}
