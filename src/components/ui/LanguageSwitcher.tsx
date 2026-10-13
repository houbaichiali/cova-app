"use client";

import { Globe } from "lucide-react";
import { LOCALES, LOCALE_NAMES, isLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Compact language picker. Saves the choice in a cookie so server-rendered pages follow it. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("lang.label")}</span>
      <Globe
        className="pointer-events-none absolute start-2.5 h-4 w-4 text-cova-mute"
        aria-hidden="true"
      />
      <select
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
        className="h-9 appearance-none rounded-lg border border-cova-line bg-white ps-8 pe-3 text-sm font-medium text-cova-ink hover:bg-cova-pale"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
