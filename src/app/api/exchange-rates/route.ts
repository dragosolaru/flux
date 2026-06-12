import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { checkRateLimit } from "@/lib/rate-limit";
import { getExchangeRate } from "@/lib/external/bnr/client";
import { isCurrency, type Currency } from "@/lib/currency/format";

interface ExchangeRatesResponse {
  display: Currency;
  ronPerEur: number;
  ronPerDisplay: number;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  if (!(await checkRateLimit(userId, "exchange-rates", 30))) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_currency")
    .eq("id", userId)
    .maybeSingle();

  const raw = (data as { display_currency: string | null } | null)?.display_currency;
  const display: Currency = isCurrency(raw) ? raw : "RON";

  try {
    const now = new Date();
    const [ronPerEur, ronPerDisplay] = await Promise.all([
      getExchangeRate("EUR", now),
      getExchangeRate(display, now),
    ]);
    return NextResponse.json({
      display,
      ronPerEur,
      ronPerDisplay,
    } satisfies ExchangeRatesResponse);
  } catch {
    // BNR unavailable and no cached rate — client falls back to canonical
    // currencies (RON for costs, EUR for trips) rather than guessing a rate.
    return NextResponse.json({ message: "Exchange rates unavailable" }, { status: 503 });
  }
}
