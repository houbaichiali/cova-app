import { en, type MessageKey } from "@/i18n/messages/en";
import { fr } from "@/i18n/messages/fr";
import { ar } from "@/i18n/messages/ar";
import type { Locale } from "@/i18n/config";

export type { MessageKey };
export type Vars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: Vars) => string;

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, fr, ar };

/** Looks up a message, falling back to English, then to the key itself. Replaces {name} placeholders. */
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const template = catalogs[locale][key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function makeT(locale: Locale): TFunction {
  return (key, vars) => translate(locale, key, vars);
}
