#!/usr/bin/env node
/* Verifies that en/fr/ar message catalogs have exactly the same keys.
 * Run: node scripts/check-i18n-parity.mjs */
import { readFileSync } from "node:fs";

function keysOf(path) {
  const src = readFileSync(path, "utf8");
  const keys = [...src.matchAll(/^\s{2}"([^"]+)":/gm)].map((m) => m[1]);
  return new Set(keys);
}

const en = keysOf("src/i18n/messages/en.ts");
const fr = keysOf("src/i18n/messages/fr.ts");
const ar = keysOf("src/i18n/messages/ar.ts");

let failed = false;
for (const [name, set, others] of [
  ["fr", fr, [["en", en], ["ar", ar]]],
  ["ar", ar, [["en", en], ["fr", fr]]],
  ["en", en, [["fr", fr], ["ar", ar]]],
]) {
  for (const [otherName, other] of others) {
    const missing = [...other].filter((k) => !set.has(k));
    if (missing.length) {
      console.error(`${name} is missing ${missing.length} keys present in ${otherName}:`);
      for (const k of missing.slice(0, 20)) console.error(`  - ${k}`);
      failed = true;
    }
  }
}

console.log(
  `Catalog sizes: en=${en.size} fr=${fr.size} ar=${ar.size} — ` +
    (failed ? "PARITY FAILED" : "parity OK"),
);
process.exit(failed ? 1 : 0);
