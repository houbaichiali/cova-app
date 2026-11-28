"use client";

import { useT } from "@/i18n/client";
import { PALETTES } from "@/lib/palettes";
import { usePalette } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The 11 officially approved palettes as a radiogroup of swatch cards. The
 * choice is applied instantly app-wide (html[data-palette]) and persisted:
 * localStorage for the first paint, user_settings in Supabase for the account.
 */
export function PalettePicker() {
  const t = useT();
  const { palette, setPalette } = usePalette();

  return (
    <div role="radiogroup" aria-label={t("settings.palette")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {PALETTES.map((option) => {
        const active = option.id === palette;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPalette(option.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border p-2 text-start text-sm font-medium transition-colors",
              active
                ? "border-cova-muted bg-cova-pale text-cova-ink"
                : "border-cova-line text-cova-mute hover:border-cova-soft hover:text-cova-ink",
            )}
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 overflow-hidden rounded-md border border-cova-line"
            >
              <span className="h-full w-1/2" style={{ backgroundColor: option.swatch.bg }} />
              <span className="h-full w-1/4" style={{ backgroundColor: option.swatch.primary }} />
              <span className="h-full w-1/4" style={{ backgroundColor: option.swatch.accent }} />
            </span>
            <span className="min-w-0 truncate">{t(option.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
