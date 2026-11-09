"use client";

/**
 * Profile appearance — the client-side twin of the CHECK constraints in
 * migration 20261106000001_profile_portfolio.sql. Every value the editor can
 * produce is whitelisted here; nothing free-form (no CSS, no HTML) ever
 * reaches the database. Colors are validated with the same ^#[0-9a-f]{6}$
 * rule the database enforces.
 */

export type FontKey = "sans" | "serif" | "rounded" | "display" | "mono";
export type WeightKey = "normal" | "medium" | "semibold" | "bold";
export type AlignKey = "start" | "center" | "end";
export type ThemeKey =
  | "default"
  | "minimal"
  | "dark"
  | "ocean"
  | "sunset"
  | "neon"
  | "nature"
  | "elegant";
export type CoverPreset =
  | "aurora"
  | "dusk"
  | "mint"
  | "ember"
  | "royal"
  | "sand"
  | "slate"
  | "rose";
export type MarqueePreset = "translucent" | "paper" | "night" | "sky" | "blossom";
export type BorderKey = "none" | "solid" | "dashed" | "glow";

/** Approved font families — system stacks only, no network font loading. */
export const FONT_STACKS: Record<FontKey, string> = {
  sans: "var(--font-sans)",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "'Segoe UI', 'Avenir Next', 'Nunito', system-ui, sans-serif",
  display: "'Trebuchet MS', 'Verdana', system-ui, sans-serif",
  mono: "var(--font-mono)",
};

export const FONT_LABEL_KEYS: Record<FontKey, string> = {
  sans: "appearance.font.sans",
  serif: "appearance.font.serif",
  rounded: "appearance.font.rounded",
  display: "appearance.font.display",
  mono: "appearance.font.mono",
};

export const WEIGHTS: WeightKey[] = ["normal", "medium", "semibold", "bold"];
export const WEIGHT_CLASS: Record<WeightKey, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

export const ALIGNS: AlignKey[] = ["start", "center", "end"];
export const ALIGN_CLASS: Record<AlignKey, string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
};

export const THEMES: ThemeKey[] = [
  "default",
  "minimal",
  "dark",
  "ocean",
  "sunset",
  "neon",
  "nature",
  "elegant",
];

export const COVER_PRESETS: CoverPreset[] = [
  "aurora",
  "dusk",
  "mint",
  "ember",
  "royal",
  "sand",
  "slate",
  "rose",
];

/** Cover gradient classes (Tailwind). Used for both preview and render. */
export const COVER_PRESET_CLASS: Record<CoverPreset, string> = {
  aurora: "bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400",
  dusk: "bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500",
  mint: "bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200",
  ember: "bg-gradient-to-r from-orange-400 via-red-400 to-rose-500",
  royal: "bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-600",
  sand: "bg-gradient-to-r from-amber-100 via-orange-100 to-yellow-200",
  slate: "bg-gradient-to-r from-slate-600 via-slate-500 to-slate-400",
  rose: "bg-gradient-to-r from-rose-300 via-pink-300 to-fuchsia-300",
};

/** Text color that stays readable on top of each cover preset. */
export const COVER_PRESET_TEXT: Record<CoverPreset, string> = {
  aurora: "#0b2534",
  dusk: "#ffffff",
  mint: "#0b2534",
  ember: "#ffffff",
  royal: "#ffffff",
  sand: "#4a2f0b",
  slate: "#ffffff",
  rose: "#4a0b22",
};

export const MARQUEE_PRESETS: MarqueePreset[] = [
  "translucent",
  "paper",
  "night",
  "sky",
  "blossom",
];

export const MARQUEE_PRESET_CLASS: Record<MarqueePreset, string> = {
  translucent: "bg-cova-pale/70 border border-cova-line",
  paper: "bg-amber-50 border border-amber-200",
  night: "bg-slate-900 border border-slate-700",
  sky: "bg-gradient-to-r from-sky-100 to-cyan-100 border border-sky-200",
  blossom: "bg-gradient-to-r from-rose-100 to-pink-100 border border-rose-200",
};

/** Text color that stays readable on each marquee preset. */
export const MARQUEE_PRESET_TEXT: Record<MarqueePreset, string> = {
  translucent: "#243447",
  paper: "#4a2f0b",
  night: "#e2e8f0",
  sky: "#0b2534",
  blossom: "#4a0b22",
};

export const BORDERS: BorderKey[] = ["none", "solid", "dashed", "glow"];

export const BORDER_CLASS: Record<BorderKey, string> = {
  none: "",
  solid: "border",
  dashed: "border border-dashed",
  glow: "border-0 ring-2",
};

/** Curated emoji palette for name decoration (optional, max 16 chars). */
export const EMOJI_CHOICES = [
  "🚀", "✨", "🌟", "💪", "🧠", "📚", "🎓", "🔬", "💻", "🎨",
  "🌍", "🎵", "⚡", "🔥", "🌱", "🏆", "🛠️", "🧪", "📐", "🦉",
] as const;

export interface Appearance {
  theme: ThemeKey;
  name_color: string | null;
  name_font: FontKey;
  name_weight: WeightKey;
  name_italic: boolean;
  name_prefix_emoji: string;
  name_suffix_emoji: string;
  bio_color: string | null;
  bio_font: FontKey;
  bio_align: AlignKey;
  cover_kind: "preset" | "color" | "image";
  cover_preset: CoverPreset;
  cover_color: string | null;
  cover_image_url: string | null;
  cover_position: "center" | "top" | "bottom";
  marquee_kind: "default" | "color" | "preset";
  marquee_color: string | null;
  marquee_preset: MarqueePreset;
  marquee_border: BorderKey;
  marquee_border_color: string | null;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "default",
  name_color: null,
  name_font: "sans",
  name_weight: "semibold",
  name_italic: false,
  name_prefix_emoji: "",
  name_suffix_emoji: "",
  bio_color: null,
  bio_font: "sans",
  bio_align: "start",
  cover_kind: "preset",
  cover_preset: "aurora",
  cover_color: null,
  cover_image_url: null,
  cover_position: "center",
  marquee_kind: "default",
  marquee_color: null,
  marquee_preset: "translucent",
  marquee_border: "none",
  marquee_border_color: null,
};

export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

/**
 * WCAG contrast ratio between two hex colors (1.0 – 21.0).
 * Used to warn about unreadable combinations — the user keeps the final say.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  if (!isHexColor(hexA) || !isHexColor(hexB)) return 21;
  const lum = (hex: string) => {
    const channels = [1, 3, 5].map((i) => {
      const raw = parseInt(hex.slice(i, i + 2), 16) / 255;
      return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
    });
    const r = channels[0] ?? 0;
    const g = channels[1] ?? 0;
    const b = channels[2] ?? 0;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(hexA);
  const b = lum(hexB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Normalizes any partial row (e.g. `to_jsonb(profile_appearance)`) to defaults. */
export function resolveAppearance(raw: unknown): Appearance {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_APPEARANCE };
  const r = raw as Record<string, unknown>;
  const pick = <K extends keyof Appearance>(key: K, valid: readonly unknown[]): Appearance[K] => {
    const value = r[key as string];
    return (valid.includes(value) ? value : DEFAULT_APPEARANCE[key]) as Appearance[K];
  };
  const hex = (key: string): string | null => {
    const value = r[key];
    return typeof value === "string" && isHexColor(value) ? value : null;
  };
  const emoji = (key: string): string => {
    const value = r[key];
    return typeof value === "string" ? [...value].slice(0, 16).join("") : "";
  };
  const coverKind = r.cover_kind;
  const marqueeKind = r.marquee_kind;
  return {
    theme: pick("theme", THEMES),
    name_color: hex("name_color"),
    name_font: pick("name_font", Object.keys(FONT_STACKS)),
    name_weight: pick("name_weight", WEIGHTS),
    name_italic: r.name_italic === true,
    name_prefix_emoji: emoji("name_prefix_emoji"),
    name_suffix_emoji: emoji("name_suffix_emoji"),
    bio_color: hex("bio_color"),
    bio_font: pick("bio_font", Object.keys(FONT_STACKS)),
    bio_align: pick("bio_align", ALIGNS),
    cover_kind:
      coverKind === "color" || coverKind === "image" ? coverKind : "preset",
    cover_preset: pick("cover_preset", COVER_PRESETS),
    cover_color: hex("cover_color"),
    cover_image_url:
      typeof r.cover_image_url === "string" && /^https?:\/\/|^\//.test(r.cover_image_url)
        ? r.cover_image_url
        : null,
    cover_position: pick("cover_position", ["center", "top", "bottom"]),
    marquee_kind:
      marqueeKind === "color" || marqueeKind === "preset" ? marqueeKind : "default",
    marquee_color: hex("marquee_color"),
    marquee_preset: pick("marquee_preset", MARQUEE_PRESETS),
    marquee_border: pick("marquee_border", BORDERS),
    marquee_border_color: hex("marquee_border_color"),
  };
}

/**
 * Themes are starting points: applying one pre-fills the editor fields, which
 * the student can keep adjusting before saving.
 */
export const THEME_PRESETS: Record<Exclude<ThemeKey, "default">, Partial<Appearance>> = {
  minimal: {
    name_font: "sans",
    name_weight: "medium",
    name_color: null,
    cover_kind: "color",
    cover_color: "#F1F5F9",
    bio_font: "sans",
    marquee_kind: "preset",
    marquee_preset: "translucent",
    marquee_border: "solid",
    marquee_border_color: "#E5EDF3",
  },
  dark: {
    name_color: "#E2E8F0",
    cover_kind: "color",
    cover_color: "#0F172A",
    bio_color: "#CBD5E1",
    marquee_kind: "preset",
    marquee_preset: "night",
    marquee_border: "solid",
    marquee_border_color: "#334155",
  },
  ocean: {
    name_color: "#075985",
    cover_kind: "preset",
    cover_preset: "aurora",
    marquee_kind: "preset",
    marquee_preset: "sky",
    marquee_border: "solid",
    marquee_border_color: "#7DD3FC",
  },
  sunset: {
    name_color: "#7C2D12",
    name_font: "display",
    cover_kind: "preset",
    cover_preset: "ember",
    marquee_kind: "preset",
    marquee_preset: "paper",
    marquee_border: "solid",
    marquee_border_color: "#FDBA74",
  },
  neon: {
    name_color: "#7C3AED",
    name_weight: "bold",
    cover_kind: "color",
    cover_color: "#111827",
    marquee_kind: "color",
    marquee_color: "#1F2937",
    marquee_border: "glow",
    marquee_border_color: "#22D3EE",
  },
  nature: {
    name_color: "#14532D",
    name_font: "rounded",
    cover_kind: "preset",
    cover_preset: "mint",
    marquee_kind: "preset",
    marquee_preset: "translucent",
    marquee_border: "dashed",
    marquee_border_color: "#86EFAC",
  },
  elegant: {
    name_color: "#3F3F46",
    name_font: "serif",
    name_italic: true,
    cover_kind: "preset",
    cover_preset: "slate",
    bio_font: "serif",
    marquee_kind: "preset",
    marquee_preset: "paper",
    marquee_border: "solid",
    marquee_border_color: "#D4D4D8",
  },
};

/** Effective text color for the name on top of the cover. */
export function nameOnCover(appearance: Appearance): string {
  if (appearance.name_color) return appearance.name_color;
  if (appearance.cover_kind === "color" && appearance.cover_color)
    return contrastRatio(appearance.cover_color, "#FFFFFF") >= 3
      ? "#FFFFFF"
      : "#243447";
  if (appearance.cover_kind === "image") return "#FFFFFF";
  return COVER_PRESET_TEXT[appearance.cover_preset];
}

/** Effective marquee background class/style. */
export function marqueeBackground(appearance: Appearance): string {
  if (appearance.marquee_kind === "color" && appearance.marquee_color)
    return "";
  if (appearance.marquee_kind === "preset")
    return MARQUEE_PRESET_CLASS[appearance.marquee_preset];
  return "bg-white/60 border border-cova-line";
}

export function marqueeTextColor(appearance: Appearance): string {
  if (appearance.marquee_kind === "color" && appearance.marquee_color)
    return contrastRatio(appearance.marquee_color, "#243447") >= 3
      ? "#243447"
      : "#F8FAFC";
  if (appearance.marquee_kind === "preset")
    return MARQUEE_PRESET_TEXT[appearance.marquee_preset];
  return "#243447";
}
