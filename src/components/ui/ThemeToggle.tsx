"use client";

import { useT } from "@/i18n/client";
import { useUserSettings } from "@/lib/user-settings";

/** Light/dark switch (the dark mode setting): sun and moon on a sliding knob. */
export function ThemeToggle() {
  const { settings, update } = useUserSettings();
  const t = useT();
  const dark = settings.theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? t("settings.lightMode") : t("settings.darkMode")}
      data-theme={settings.theme}
      onClick={() => update({ theme: dark ? "light" : "dark" }, () => t("settings.saveError"))}
      className="theme-toggle"
    >
      <span className="theme-toggle__knob">
        <svg
          className="theme-toggle__sun"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
          <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
          <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
          <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
          <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
        </svg>
        <svg
          className="theme-toggle__moon"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      </span>
    </button>
  );
}
