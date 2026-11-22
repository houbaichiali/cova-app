/**
 * Palette system regression test (pure Node, no deps):
 *  1. palettes.ts, globals.css and the pre-paint script in layout.tsx all
 *     reference exactly the same 11 palette ids.
 *  2. Every non-default palette has BOTH a light and a dark block in
 *     globals.css, each defining the full semantic token set.
 *  3. --coding-neon is defined for the default (:root + html.dark) and for
 *     every palette, in both modes.
 *  4. Re-computes WCAG contrast for the text-critical pairs (ink/mute on
 *     bg/surface, ink on pale) straight from the parsed CSS values — so a
 *     future hex edit that breaks AA fails this test.
 *
 * Run: node scripts/test-palettes.ts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) return;
  failures += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

const PALETTE_IDS = [
  "soft-blue",
  "three-blue",
  "academic-tech-premium",
  "forest-copper",
  "midnight-lavender",
  "arctic-minimal",
  "burgundy-champagne",
  "sage-stone",
  "sand-terracotta",
  "graphite-mint",
  "mono-creative",
] as const;

/* ---------------------------------------------------------------- parsing */

const root = new URL("..", import.meta.url).pathname;
const css = readFileSync(`${root}src/app/globals.css`, "utf8");
const layout = readFileSync(`${root}src/app/layout.tsx`, "utf8");
const palettes = readFileSync(`${root}src/lib/palettes.ts`, "utf8");

function block(selector: string): string | null {
  // Matches `selector` followed by { … } (non-greedy, no nested braces in CSS).
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const match = css.match(re);
  return match ? match[1] : null;
}

function token(blockText: string | null, name: string): string | null {
  if (!blockText) return null;
  const match = blockText.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

/* ------------------------------------------------------- 1. id consistency */

const idsInPalettes = [...palettes.matchAll(/"([a-z-]+)"/g)]
  .map((m) => m[1])
  .filter((v) => PALETTE_IDS.includes(v as (typeof PALETTE_IDS)[number]));
check(
  "palettes.ts lists all 11 ids",
  PALETTE_IDS.every((id) => idsInPalettes.includes(id)),
  `found: ${[...new Set(idsInPalettes)].join(", ")}`,
);

for (const id of PALETTE_IDS) {
  check(`layout.tsx pre-paint script knows "${id}"`, layout.includes(`"${id}"`));
}

/* ------------------------------------------- 2. light+dark blocks complete */

const TOKENS = [
  "color-cova-pale",
  "color-cova-soft",
  "color-cova-muted",
  "color-cova-bg",
  "color-cova-ink",
  "color-cova-mute",
  "color-cova-line",
  "color-cova-surface",
  "color-cova-elevated",
  "color-cova-primary",
  "color-cova-accent",
  "color-cova-success",
  "color-cova-warning",
  "color-cova-error",
  "color-cova-info",
  "color-cova-focus",
  "color-admin-navy",
] as const;

for (const id of PALETTE_IDS) {
  if (id === "soft-blue") continue; // default: lives in @theme / html.dark
  const light = block(`html[data-palette="${id}"]`);
  const dark = block(`html[data-palette="${id}"].dark`);
  check(`palette "${id}" has a light block`, light !== null);
  check(`palette "${id}" has a dark block`, dark !== null);
  for (const name of TOKENS) {
    check(`palette "${id}" light defines --${name}`, light !== null && token(light, name) !== null);
    check(`palette "${id}" dark defines --${name}`, dark !== null && token(dark, name) !== null);
  }
  check(`palette "${id}" light defines --coding-neon`, light !== null && token(light, "coding-neon") !== null);
  check(`palette "${id}" dark defines --coding-neon`, dark !== null && token(dark, "coding-neon") !== null);
  check(`palette "${id}" dark defines --color-white`, dark !== null && token(dark, "color-white") !== null);
}

/* ------------------------------------------------ 3. default (Soft Blue) */

const themeBlock = css.match(/@theme\s*\{([^}]*)\}/)?.[1] ?? null;
const darkBlock = block("html.dark");
check("@theme block exists", themeBlock !== null);
check("html.dark block exists", darkBlock !== null);
for (const name of TOKENS) {
  check(`@theme (soft-blue light) defines --${name}`, themeBlock !== null && token(themeBlock, name) !== null);
  check(`html.dark (soft-blue dark) defines --${name}`, darkBlock !== null && token(darkBlock, name) !== null);
}
check("html.dark defines --coding-neon", darkBlock !== null && token(darkBlock, "coding-neon") !== null);

/* --------------------------------------------------- 4. WCAG re-computation */

function srgb(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function lum(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function ratio(fg: string, bg: string): number {
  const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

type Combo = { label: string; bg: string | null; ink: string | null; mute: string | null; pale: string | null; surface: string | null };
const combos: Combo[] = [
  { label: "soft-blue/light", bg: token(themeBlock, "color-cova-bg"), ink: token(themeBlock, "color-cova-ink"), mute: token(themeBlock, "color-cova-mute"), pale: token(themeBlock, "color-cova-pale"), surface: "#ffffff" },
  { label: "soft-blue/dark", bg: token(darkBlock, "color-cova-bg"), ink: token(darkBlock, "color-cova-ink"), mute: token(darkBlock, "color-cova-mute"), pale: token(darkBlock, "color-cova-pale"), surface: token(darkBlock, "color-cova-surface") },
];
for (const id of PALETTE_IDS) {
  if (id === "soft-blue") continue;
  const light = block(`html[data-palette="${id}"]`);
  const dark = block(`html[data-palette="${id}"].dark`);
  combos.push({ label: `${id}/light`, bg: token(light, "color-cova-bg"), ink: token(light, "color-cova-ink"), mute: token(light, "color-cova-mute"), pale: token(light, "color-cova-pale"), surface: token(light, "color-cova-surface") });
  combos.push({ label: `${id}/dark`, bg: token(dark, "color-cova-bg"), ink: token(dark, "color-cova-ink"), mute: token(dark, "color-cova-mute"), pale: token(dark, "color-cova-pale"), surface: token(dark, "color-cova-surface") });
}

for (const c of combos) {
  const vals = [c.bg, c.ink, c.mute, c.pale, c.surface];
  check(`combo "${c.label}" parsed every token`, vals.every((v) => v !== null && /^#[0-9a-fA-F]{6}$/.test(v)));
  if (vals.some((v) => v === null)) continue;
  const { bg, ink, mute, pale, surface } = c as Required<Combo>;
  check(`${c.label} ink/bg ≥ 7`, ratio(ink, bg) >= 7, ratio(ink, bg).toFixed(2));
  check(`${c.label} ink/surface ≥ 7`, ratio(ink, surface) >= 7, ratio(ink, surface).toFixed(2));
  check(`${c.label} mute/bg ≥ 4.5`, ratio(mute, bg) >= 4.5, ratio(mute, bg).toFixed(2));
  check(`${c.label} mute/surface ≥ 4.5`, ratio(mute, surface) >= 4.5, ratio(mute, surface).toFixed(2));
  check(`${c.label} ink/pale ≥ 4.5`, ratio(ink, pale) >= 4.5, ratio(ink, pale).toFixed(2));
}

/* ------------------------------------------------------------------ verdict */

if (failures > 0) {
  console.error(`\ntest-palettes: ${failures} failure(s)`);
  process.exit(1);
}
console.log(`test-palettes: OK — ${PALETTE_IDS.length} palettes × light/dark verified, WCAG text pairs pass.`);
