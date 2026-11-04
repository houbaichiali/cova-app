/* Tests for the new XP level curve and the analytics bucketing.
 * Run with: node --experimental-strip-types scripts/test-xp-levels.ts
 * (Node 22.6+ strips TS types natively; no build step required.)
 */

import assert from "node:assert/strict";
import {
  levelForXp,
  levelThreshold,
  levelStep,
} from "../src/lib/level-curve.ts";
import {
  bucketGains,
  compareSeries,
  periodEnd,
  periodStart,
  shiftPeriod,
  type XpEntry,
} from "../src/lib/xp-analytics.ts";

let passed = 0;
function ok(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok - ${label}`);
}

console.log("1) Level curve (spec table)");
// Spec: cumulative XP needed per level.
const SPEC: Array<[number, number]> = [
  [0, 0],
  [1, 500],
  [2, 1100],
  [3, 1800],
  [4, 2600],
  [5, 3500],
  [6, 4500],
  [7, 5600],
  [8, 6800],
  [9, 8100],
  [10, 9500],
];
for (const [level, xp] of SPEC) {
  ok(`levelThreshold(${level}) === ${xp}`, () => assert.equal(levelThreshold(level), xp));
}
ok("levelStep(0) === 500 (500 + 0 * 100)", () => assert.equal(levelStep(0), 500));
ok("levelStep(2) === 700 (500 + 2 * 100)", () => assert.equal(levelStep(2), 700));

console.log("2) levelForXp mapping");
ok("0 XP -> Level 0, into 0, needed 500", () => {
  const r = levelForXp(0);
  assert.deepEqual({ level: r.level, into: r.into, needed: r.needed }, { level: 0, into: 0, needed: 500 });
});
ok("499 XP -> still Level 0", () => assert.equal(levelForXp(499).level, 0));
ok("exactly 500 XP -> Level 1, into 0", () => {
  const r = levelForXp(500);
  assert.equal(r.level, 1);
  assert.equal(r.into, 0);
  assert.equal(r.needed, 600);
});
ok("exactly 1100 XP -> Level 2, into 0", () => {
  const r = levelForXp(1100);
  assert.equal(r.level, 2);
  assert.equal(r.into, 0);
  assert.equal(r.needed, 700);
});
ok("between levels: 1500 XP -> Level 2, into 400 / 700", () => {
  const r = levelForXp(1500);
  assert.deepEqual({ level: r.level, into: r.into, needed: r.needed }, { level: 2, into: 400, needed: 700 });
});
ok("multi-level jump: a 1800 XP single gain from 0 -> Level 3", () => {
  const before = levelForXp(0).level;
  const after = levelForXp(0 + 1800).level;
  assert.equal(after - before, 3);
});
ok("2040 XP (existing user) -> Level 3, XP preserved", () => {
  const r = levelForXp(2040);
  assert.equal(r.level, 3);
  assert.deepEqual({ into: r.into, needed: r.needed }, { into: 240, needed: 800 });
});
ok("negative / NaN XP is clamped to Level 0", () => {
  assert.equal(levelForXp(-50).level, 0);
  assert.equal(levelForXp(Number.NaN).level, 0);
});
ok("level 10 user: no reset, span of level 10 is levelStep(10) = 1500", () => {
  const r = levelForXp(9500);
  assert.equal(r.level, 10);
  assert.equal(r.into, 0);
  assert.equal(r.needed, 1500);
  assert.equal(r.needed, levelStep(10));
});

console.log("3) Period bucketing (local timezone)");
// Fixed local dates: 2026-06-08 is a Monday.
const start = periodStart("week", new Date(2026, 5, 10)); // Wed of the Jun 8 week
assert.equal(start.toDateString(), new Date(2026, 5, 8).toDateString());
console.log("  ok - week starts on Monday (Jun 8, 2026)");
const end = periodEnd("week", start);
assert.equal((end.getTime() - start.getTime()) / 86_400_000, 7);
console.log("  ok - week range is exactly 7 days");

const entries: XpEntry[] = [
  { amount: 100, createdAt: new Date(2026, 5, 8, 9, 0).toISOString() }, // Mon
  { amount: 250, createdAt: new Date(2026, 5, 8, 22, 30).toISOString() }, // Mon late
  { amount: 50, createdAt: new Date(2026, 5, 11, 12, 0).toISOString() }, // Thu
  { amount: 999, createdAt: new Date(2026, 5, 15, 8, 0).toISOString() }, // OUT (next week)
];
const week = bucketGains(entries, "week", start);
ok("week buckets sum per local day", () => {
  assert.equal(week.values[0], 350); // both Monday gains
  assert.equal(week.values[3], 50); // Thursday
  assert.equal(week.total, 400); // out-of-range entry excluded
});
ok("shiftPeriod(week, -1) is the previous Monday", () => {
  const prev = shiftPeriod("week", start, -1);
  assert.equal(prev.toDateString(), new Date(2026, 5, 1).toDateString());
});

const month = bucketGains(entries, "month", periodStart("month", new Date(2026, 5, 10)));
ok("month buckets: 30 days for June 2026, gains on the 8th and the 11th", () => {
  assert.equal(month.dayCount, 30);
  assert.equal(month.values[7], 350); // June 8 = day index 7
  assert.equal(month.values[10], 50); // June 11 = day index 10
  assert.equal(month.total, 1399); // June 15 (999) is outside the test WEEK but inside June
});
ok("year period starts on Jan 1 and ends Dec 31", () => {
  const yStart = periodStart("year", new Date(2026, 5, 10));
  const yEnd = periodEnd("year", yStart);
  assert.equal(yStart.getMonth(), 0);
  assert.equal(yStart.getDate(), 1);
  assert.equal(yEnd.toDateString(), new Date(2027, 0, 1).toDateString());
});

console.log("4) Period comparison (same duration & granularity)");
const thisWeek = bucketGains(
  [{ amount: 400, createdAt: new Date(2026, 5, 9).toISOString() }],
  "week",
  start,
);
const lastWeek = bucketGains(
  [{ amount: 250, createdAt: new Date(2026, 5, 2).toISOString() }],
  "week",
  shiftPeriod("week", start, -1),
);
const cmp = compareSeries(thisWeek, lastWeek);
ok("diff = +150 XP, evolution = +60%", () => {
  assert.equal(cmp.diff, 150);
  assert.equal(cmp.percent, 60);
});
const zeroCmp = compareSeries(thisWeek, bucketGains([], "week", start));
ok("comparison against an empty period: percent null (cannot divide by 0)", () => {
  assert.equal(zeroCmp.diff, thisWeek.total);
  assert.equal(zeroCmp.percent, null);
});
ok("month vs month compare keeps the same granularity", () => {
  const june2025 = bucketGains([], "month", new Date(2025, 5, 1));
  const june2026 = bucketGains([], "month", new Date(2026, 5, 1));
  assert.equal(june2025.dayCount, june2026.dayCount);
});

console.log(`\nAll ${passed} checks passed.`);
