import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import { isCurrency } from "@/lib/currency/format";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { checkRateLimit } from "@/lib/rate-limit";

interface PreferencesResponse {
  locale: string;
  displayCurrency: string;
  homeAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
  whatsappPhone: string | null;
}

const DEFAULT_PREFS: PreferencesResponse = {
  locale: "ro",
  displayCurrency: "RON",
  homeAddress: null,
  homeLat: null,
  homeLng: null,
  whatsappPhone: null,
};

// E.164: leading + and 7–15 digits.
const E164 = /^\+[1-9]\d{6,14}$/;

const PatchSchema = z.object({
  locale: z.string().refine(isLocale).optional(),
  displayCurrency: z.string().refine(isCurrency).optional(),
  homeAddress: z.string().min(3).max(500).nullable().optional(),
  homeLat: z.number().gte(-90).lte(90).nullable().optional(),
  homeLng: z.number().gte(-180).lte(180).nullable().optional(),
  whatsappPhone: z.string().regex(E164).nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json(DEFAULT_PREFS);

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json(DEFAULT_PREFS);

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("locale, display_currency, home_address, home_lat, home_lng, whatsapp_phone")
    .eq("id", userId)
    .maybeSingle();

  const row = data as {
    locale: string;
    display_currency: string;
    home_address: string | null;
    home_lat: number | null;
    home_lng: number | null;
    whatsapp_phone: string | null;
  } | null;

  return NextResponse.json({
    locale: row?.locale ?? "ro",
    displayCurrency: row?.display_currency ?? "RON",
    homeAddress: row?.home_address ?? null,
    homeLat: row?.home_lat ?? null,
    homeLng: row?.home_lng ?? null,
    whatsappPhone: row?.whatsapp_phone ?? null,
  } satisfies PreferencesResponse);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  if (!await checkRateLimit(userId, "preferences", 30)) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Record<string, string | number | null> = {};
  if (parsed.data.locale !== undefined) updates.locale = parsed.data.locale;
  if (parsed.data.displayCurrency !== undefined)
    updates.display_currency = parsed.data.displayCurrency;
  if (parsed.data.homeAddress !== undefined) updates.home_address = parsed.data.homeAddress;
  if (parsed.data.homeLat !== undefined) updates.home_lat = parsed.data.homeLat;
  if (parsed.data.homeLng !== undefined) updates.home_lng = parsed.data.homeLng;
  if (parsed.data.whatsappPhone !== undefined) updates.whatsapp_phone = parsed.data.whatsappPhone;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: "No updates" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...updates }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Mirror locale to cookie so server-side resolution picks it up next request
  // without needing another DB hit.
  if (parsed.data.locale) {
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, parsed.data.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return NextResponse.json({ ok: true });
}
