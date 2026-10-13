"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LOCALE_COOKIE, LOCALE_DIR, LOCALE_FORMAT, type Locale } from "@/i18n/config";
import { makeT, type TFunction } from "@/i18n/translate";

interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: TFunction;
  /** BCP-47 tag for Intl / toLocaleString. */
  formatTag: string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Keep <html lang dir> in sync when the person switches language without a reload.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALE_DIR[locale];
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      // One year. Read by the server so the first paint already uses the right language.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      router.refresh(); // re-render server components in the new language
    },
    [router],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: LOCALE_DIR[locale],
      t: makeT(locale),
      formatTag: LOCALE_FORMAT[locale],
      setLocale,
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}
