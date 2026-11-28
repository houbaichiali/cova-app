import type { MessageKey } from "@/i18n/translate";

/**
 * The 11 officially approved COVA palettes. Soft Blue is the default for every
 * account; users change it only in Settings → Appearance. This module is the
 * single source of truth for the palette *identities* (ids, labels, picker
 * swatches); the actual token values live in `src/app/globals.css` (see the
 * palette system section) and every pair there is WCAG-verified by
 * `scripts/palette_charter.py`.
 */
export type Palette =
  | "soft-blue"
  | "three-blue"
  | "academic-tech-premium"
  | "forest-copper"
  | "midnight-lavender"
  | "arctic-minimal"
  | "burgundy-champagne"
  | "sage-stone"
  | "sand-terracotta"
  | "graphite-mint"
  | "mono-creative";

export const DEFAULT_PALETTE: Palette = "soft-blue";

export const PALETTE_STORAGE_KEY = "cova-palette";

const PALETTE_IDS: readonly Palette[] = [
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

export function isPalette(value: string | undefined | null): value is Palette {
  return !!value && (PALETTE_IDS as readonly string[]).includes(value);
}

/** Picker order: Soft Blue first (default), then the approved catalog order. */
export const PALETTES: ReadonlyArray<{
  id: Palette;
  labelKey: MessageKey;
  /** Cosmetic preview for the Settings picker (kept in sync with globals.css). */
  swatch: { bg: string; primary: string; accent: string };
}> = [
  { id: "soft-blue", labelKey: "palette.softBlue", swatch: { bg: "#dcecf7", primary: "#3e6c99", accent: "#6f9fba" } },
  { id: "three-blue", labelKey: "palette.threeBlue", swatch: { bg: "#dfeaf5", primary: "#1f5a96", accent: "#3e9ad2" } },
  { id: "academic-tech-premium", labelKey: "palette.academicTechPremium", swatch: { bg: "#e5e9f0", primary: "#23486f", accent: "#6455d8" } },
  { id: "forest-copper", labelKey: "palette.forestCopper", swatch: { bg: "#e0ebdb", primary: "#2e5c3a", accent: "#b26a35" } },
  { id: "midnight-lavender", labelKey: "palette.midnightLavender", swatch: { bg: "#e7e3f4", primary: "#5e4fa3", accent: "#9d7be0" } },
  { id: "arctic-minimal", labelKey: "palette.arcticMinimal", swatch: { bg: "#e6eef4", primary: "#2e6f96", accent: "#38a3c5" } },
  { id: "burgundy-champagne", labelKey: "palette.burgundyChampagne", swatch: { bg: "#f1e0e3", primary: "#6e1f3b", accent: "#b9965c" } },
  { id: "sage-stone", labelKey: "palette.sageStone", swatch: { bg: "#e4eade", primary: "#4e6b48", accent: "#9a8670" } },
  { id: "sand-terracotta", labelKey: "palette.sandTerracotta", swatch: { bg: "#f3e4d2", primary: "#a34f30", accent: "#d97b46" } },
  { id: "graphite-mint", labelKey: "palette.graphiteElectricMint", swatch: { bg: "#e3e9e7", primary: "#34424e", accent: "#0ca678" } },
  { id: "mono-creative", labelKey: "palette.monoCreative", swatch: { bg: "#f0f0ee", primary: "#252525", accent: "#ff6338" } },
];
