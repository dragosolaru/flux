import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";

async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headerList = await headers();
  const acceptLang = headerList.get("accept-language") ?? "";
  const first = acceptLang.split(",")[0]?.split("-")[0]?.toLowerCase();
  if (isLocale(first)) return first;

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`./locales/${locale}.json`)).default as Record<string, string>;
  return { locale, messages };
});
