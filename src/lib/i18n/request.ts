import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";

/**
 * The language the account chose, when this browser has not been told.
 *
 * `PATCH /api/me/preferences` writes the choice to the user row AND mirrors it
 * to a cookie — but a cookie lives in one browser. Signing in on a second one
 * (the car's screen, in this case) meant the stored preference was never
 * consulted and `Accept-Language` won, so an account set to Romanian rendered
 * in English on the car and Romanian on the phone. A preference the user
 * deliberately saved must outrank a header the browser guessed.
 *
 * Only reached when the cookie is absent, so the usual request pays nothing.
 * Any failure here falls through to the header rather than breaking a page: a
 * missing language is a worse page, a thrown one is no page.
 */
async function localeFromAccount(): Promise<Locale | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    // The same mapping the preferences route writes through, so this reads the
    // row that one wrote rather than a plausible-looking different one.
    const userId = await ensureSupabaseUserId(session);
    if (!userId) return null;

    const { data } = await createSupabaseAdminClient()
      .from("profiles")
      .select("locale")
      .eq("id", userId)
      .maybeSingle();

    const stored = (data as { locale?: string } | null)?.locale;
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const fromAccount = await localeFromAccount();
  if (fromAccount) return fromAccount;

  const headerList = await headers();
  const acceptLang = headerList.get("accept-language") ?? "";
  const first = acceptLang.split(",")[0]?.split("-")[0]?.toLowerCase();
  if (isLocale(first)) return first;

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`./locales/${locale}.json`)).default;
  return { locale, messages };
});
