import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from "@/i18n/config";
import { makeT, type TFunction } from "@/i18n/translate";

/** Locale for the current request: saved choice first, then the browser's language. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return matchAcceptLanguage((await headers()).get("accept-language"));
}

export async function getT(): Promise<TFunction> {
  return makeT(await getLocale());
}
