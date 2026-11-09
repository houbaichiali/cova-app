"use client";

import { useState } from "react";
import { Check, Image as ImageIcon, Palette, RotateCcw, Type } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/FormField";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  ALIGNS,
  ALIGN_CLASS,
  BORDER_CLASS,
  BORDERS,
  COVER_PRESETS,
  COVER_PRESET_CLASS,
  COVER_PRESET_TEXT,
  DEFAULT_APPEARANCE,
  EMOJI_CHOICES,
  FONT_LABEL_KEYS,
  FONT_STACKS,
  MARQUEE_PRESETS,
  MARQUEE_PRESET_CLASS,
  THEME_PRESETS,
  THEMES,
  WEIGHTS,
  WEIGHT_CLASS,
  contrastRatio,
  isHexColor,
  nameOnCover,
  type AlignKey,
  type Appearance,
  type BorderKey,
  type CoverPreset,
  type FontKey,
  type MarqueePreset,
  type ThemeKey,
  type WeightKey,
} from "@/lib/appearance";

/**
 * Appearance editor — live preview, whitelisted options only.
 * Changes stay in the DRAFT until "Save changes"; Cancel reverts; Reset
 * restores the COVA defaults (also only after Save).
 */

interface ColorFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [hex, setHex] = useState(value ?? "");
  const effective = value ?? "";
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-cova-mute">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHexColor(effective) ? effective : "#243447"}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="h-9 w-12 cursor-pointer rounded-lg border border-cova-line bg-white p-1"
        />
        <input
          type="text"
          value={hex}
          placeholder="#243447"
          onChange={(event) => {
            const raw = event.target.value.trim();
            setHex(raw);
            onChange(isHexColor(raw) ? raw : null);
          }}
          maxLength={7}
          aria-label={`${label} (HEX)`}
          className="h-9 w-24 rounded-lg border border-cova-line bg-white px-2 font-mono text-sm"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setHex("");
              onChange(null);
            }}
            className="text-xs text-cova-mute underline underline-offset-2 hover:text-cova-ink"
          >
            ✕
          </button>
        )}
      </div>
      {hex !== "" && !isHexColor(hex) && (
        <p className="mt-1 text-[11px] text-red-600">#RRGGBB</p>
      )}
    </div>
  );
}

function OptionRow<K extends string>({
  label,
  value,
  options,
  onChange,
  renderLabel,
}: {
  label: string;
  value: K;
  options: readonly K[];
  onChange: (value: K) => void;
  renderLabel: (value: K) => string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-cova-mute">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as K)}
        className="h-9 w-full rounded-lg border border-cova-line bg-white px-2 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {renderLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface AppearanceEditorProps {
  draft: Appearance;
  onChange: (next: Appearance) => void;
}

export function AppearanceEditor({ draft, onChange }: AppearanceEditorProps) {
  const t = useT();
  const patch = (partial: Partial<Appearance>) => onChange({ ...draft, ...partial });

  const nameBg =
    draft.cover_kind === "color" && draft.cover_color
      ? draft.cover_color
      : draft.cover_kind === "image"
        ? "#1e293b"
        : undefined;
  const previewNameColor = nameOnCover(draft);
  const bioContrast =
    draft.bio_color && contrastRatio(draft.bio_color, "#FFFFFF") < 3
      ? t("appearance.lowContrast")
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="space-y-6">
        {/* themes */}
        <Card>
          <CardHeader title={t("appearance.themes")} description={t("appearance.themesHint")} />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...DEFAULT_APPEARANCE })}
                className="rounded-lg border border-cova-line px-3 py-1.5 text-sm font-medium hover:bg-cova-pale"
              >
                {t("appearance.theme.default")}
              </button>
              {THEMES.filter((theme) => theme !== "default").map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => onChange({ ...draft, ...THEME_PRESETS[theme as Exclude<ThemeKey, "default">] })}
                  className="rounded-lg border border-cova-line px-3 py-1.5 text-sm font-medium hover:bg-cova-pale"
                >
                  {t(`appearance.theme.${theme}` as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* name */}
        <Card>
          <CardHeader title={t("appearance.name.title")} />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField
                label={t("appearance.name.color")}
                value={draft.name_color}
                onChange={(name_color) => patch({ name_color })}
              />
              <OptionRow<FontKey>
                label={t("appearance.name.font")}
                value={draft.name_font}
                options={Object.keys(FONT_STACKS) as FontKey[]}
                onChange={(name_font) => patch({ name_font })}
                renderLabel={(font) => t(FONT_LABEL_KEYS[font] as Parameters<typeof t>[0])}
              />
              <OptionRow<WeightKey>
                label={t("appearance.name.weight")}
                value={draft.name_weight}
                options={WEIGHTS}
                onChange={(name_weight) => patch({ name_weight })}
                renderLabel={(weight) => t(`appearance.weight.${weight}` as Parameters<typeof t>[0])}
              />
              <div>
                <span className="mb-1 block text-xs font-medium text-cova-mute">
                  {t("appearance.name.italic")}
                </span>
                <Switch
                  checked={draft.name_italic}
                  onChange={(name_italic) => patch({ name_italic })}
                  label={t("appearance.name.italic")}
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-cova-mute">{t("appearance.name.emojis")}</p>
              <div className="flex items-center gap-2">
                <EmojiPicker
                  value={draft.name_prefix_emoji}
                  onChange={(name_prefix_emoji) => patch({ name_prefix_emoji })}
                  label={t("appearance.name.emojiBefore")}
                />
                <span aria-hidden="true" className="text-cova-mute">→</span>
                <EmojiPicker
                  value={draft.name_suffix_emoji}
                  onChange={(name_suffix_emoji) => patch({ name_suffix_emoji })}
                  label={t("appearance.name.emojiAfter")}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* bio */}
        <Card>
          <CardHeader title={t("appearance.bio.title")} />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <ColorField
              label={t("appearance.bio.color")}
              value={draft.bio_color}
              onChange={(bio_color) => patch({ bio_color })}
            />
            <OptionRow<FontKey>
              label={t("appearance.bio.font")}
              value={draft.bio_font}
              options={Object.keys(FONT_STACKS) as FontKey[]}
              onChange={(bio_font) => patch({ bio_font })}
              renderLabel={(font) => t(FONT_LABEL_KEYS[font] as Parameters<typeof t>[0])}
            />
            <OptionRow<AlignKey>
              label={t("appearance.bio.align")}
              value={draft.bio_align}
              options={ALIGNS}
              onChange={(bio_align) => patch({ bio_align })}
              renderLabel={(align) => t(`appearance.align.${align}` as Parameters<typeof t>[0])}
            />
            {bioContrast && <p className="text-xs text-amber-600 sm:col-span-3">{bioContrast}</p>}
          </CardBody>
        </Card>

        {/* cover */}
        <Card>
          <CardHeader title={t("appearance.cover.title")} />
          <CardBody className="space-y-4">
            <OptionRow<"preset" | "color" | "image">
              label={t("appearance.cover.kind")}
              value={draft.cover_kind}
              options={["preset", "color", "image"] as const}
              onChange={(cover_kind) => patch({ cover_kind })}
              renderLabel={(kind) =>
                kind === "preset"
                  ? t("appearance.cover.preset")
                  : kind === "color"
                    ? t("appearance.cover.solid")
                    : t("appearance.cover.image")
              }
            />
            {draft.cover_kind === "preset" && (
              <div>
                <p className="mb-1 text-xs font-medium text-cova-mute">{t("appearance.cover.presets")}</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {COVER_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-label={t(`appearance.coverPreset.${preset}` as Parameters<typeof t>[0])}
                      onClick={() => patch({ cover_preset: preset as CoverPreset })}
                      className={cn(
                        "h-10 rounded-lg border-2 transition-transform hover:scale-105",
                        COVER_PRESET_CLASS[preset],
                        draft.cover_preset === preset ? "border-cova-ink" : "border-transparent",
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
            {draft.cover_kind === "color" && (
              <ColorField
                label={t("appearance.cover.solid")}
                value={draft.cover_color}
                onChange={(cover_color) => patch({ cover_color })}
              />
            )}
            {draft.cover_kind === "image" && (
              <TextField
                id="appearance-cover-url"
                label={t("appearance.cover.imageUrl")}
                value={draft.cover_image_url ?? ""}
                onChange={(event) => patch({ cover_image_url: event.target.value || null })}
                placeholder="https://…"
                hint={t("appearance.cover.imageHint")}
              />
            )}
            <OptionRow<"center" | "top" | "bottom">
              label={t("appearance.cover.position")}
              value={draft.cover_position}
              options={["center", "top", "bottom"] as const}
              onChange={(cover_position) => patch({ cover_position })}
              renderLabel={(position) => t(`appearance.position.${position}` as Parameters<typeof t>[0])}
            />
          </CardBody>
        </Card>

        {/* badge marquee background */}
        <Card>
          <CardHeader
            title={t("appearance.marquee.title")}
            description={t("appearance.marquee.hint")}
          />
          <CardBody className="space-y-4">
            <OptionRow<"default" | "color" | "preset">
              label={t("appearance.marquee.kind")}
              value={draft.marquee_kind}
              options={["default", "color", "preset"] as const}
              onChange={(marquee_kind) => patch({ marquee_kind })}
              renderLabel={(kind) =>
                kind === "default"
                  ? t("appearance.marquee.default")
                  : kind === "color"
                    ? t("appearance.cover.solid")
                    : t("appearance.cover.preset")
              }
            />
            {draft.marquee_kind === "color" && (
              <ColorField
                label={t("appearance.marquee.color")}
                value={draft.marquee_color}
                onChange={(marquee_color) => patch({ marquee_color })}
              />
            )}
            {draft.marquee_kind === "preset" && (
              <div className="grid grid-cols-5 gap-2">
                {MARQUEE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => patch({ marquee_preset: preset as MarqueePreset })}
                    className={cn(
                      "h-10 rounded-lg text-[11px] font-medium",
                      MARQUEE_PRESET_CLASS[preset],
                      draft.marquee_preset === preset && "ring-2 ring-cova-ink",
                    )}
                  >
                    {t(`appearance.marqueePreset.${preset}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <OptionRow<BorderKey>
                label={t("appearance.marquee.border")}
                value={draft.marquee_border}
                options={BORDERS}
                onChange={(marquee_border) => patch({ marquee_border })}
                renderLabel={(border) => t(`appearance.border.${border}` as Parameters<typeof t>[0])}
              />
              {draft.marquee_border !== "none" && (
                <ColorField
                  label={t("appearance.marquee.borderColor")}
                  value={draft.marquee_border_color}
                  onChange={(marquee_border_color) => patch({ marquee_border_color })}
                />
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* live mini preview */}
      <Card className="lg:sticky lg:top-4">
        <CardHeader title={t("appearance.livePreview")} />
        <CardBody className="space-y-3">
          <div
            className={cn(
              "flex h-20 items-end rounded-t-xl",
              draft.cover_kind === "preset" ? COVER_PRESET_CLASS[draft.cover_preset] : "",
            )}
            style={
              draft.cover_kind === "color" && draft.cover_color
                ? { backgroundColor: draft.cover_color }
                : draft.cover_kind === "image" && draft.cover_image_url
                  ? {
                      backgroundImage: `url(${draft.cover_image_url})`,
                      backgroundSize: "cover",
                      backgroundPosition: draft.cover_position,
                    }
                  : undefined
            }
          />
          <div
            className={cn(
              "-mt-6 rounded-b-xl border border-cova-line bg-white p-3",
              draft.marquee_kind !== "default" && "",
            )}
          >
            <p
              className={cn("text-lg", WEIGHT_CLASS[draft.name_weight], draft.name_italic && "italic")}
              style={{
                color: nameBg ? previewNameColor : draft.name_color ?? COVER_PRESET_TEXT[draft.cover_preset],
                fontFamily: FONT_STACKS[draft.name_font],
              }}
            >
              {draft.name_prefix_emoji} Alex Morgan {draft.name_suffix_emoji}
            </p>
            <p
              className={cn("mt-1 text-xs", ALIGN_CLASS[draft.bio_align])}
              style={{
                color: draft.bio_color ?? undefined,
                fontFamily: FONT_STACKS[draft.bio_font],
              }}
            >
              {t("appearance.previewBio")}
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg p-2 text-center text-xs",
              draft.marquee_kind === "preset" ? MARQUEE_PRESET_CLASS[draft.marquee_preset] : "",
              draft.marquee_border !== "none" && BORDER_CLASS[draft.marquee_border],
            )}
            style={
              draft.marquee_kind === "color" && draft.marquee_color
                ? { backgroundColor: draft.marquee_color }
                : draft.marquee_border !== "none" && draft.marquee_border_color
                  ? draft.marquee_border === "glow"
                    ? { boxShadow: `0 0 0 2px ${draft.marquee_border_color}` }
                    : { borderStyle: draft.marquee_border === "dashed" ? "dashed" : "solid", borderColor: draft.marquee_border_color }
                  : undefined
            }
          >
            <Palette className="me-1 inline h-3 w-3" aria-hidden="true" />
            {t("appearance.previewMarquee")}
          </div>
          <p className="text-[11px] text-cova-mute">{t("appearance.previewHint")}</p>
          <ul className="space-y-1 text-[11px] text-cova-mute">
            <li>
              <Type className="me-1 inline h-3 w-3" aria-hidden="true" />
              {t("appearance.safetyFonts")}
            </li>
            <li>
              <ImageIcon className="me-1 inline h-3 w-3" aria-hidden="true" />
              {t("appearance.safetyColors")}
            </li>
            <li>
              <Check className="me-1 inline h-3 w-3" aria-hidden="true" />
              {t("appearance.safetyScope")}
            </li>
          </ul>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => onChange({ ...DEFAULT_APPEARANCE })}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> {t("appearance.reset")}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function EmojiPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-1">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-9 w-28 rounded-lg border border-cova-line bg-white px-2 text-sm"
      >
        <option value="">{t("appearance.emojiNone")}</option>
        {EMOJI_CHOICES.map((emoji) => (
          <option key={emoji} value={emoji}>
            {emoji}
          </option>
        ))}
      </select>
      {value && <span aria-hidden="true">{value}</span>}
    </div>
  );
}
