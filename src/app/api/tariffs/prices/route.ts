import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { DEFAULT_PROVIDER_ID, getProvider } from "@/lib/external/tariffs/registry";
import { buildForecast } from "@/lib/external/tariffs/recommend";

// Default hours needed when no vehicle data is available
const DEFAULT_HOURS_NEEDED = 3;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = await ensureSupabaseUserId(session);
  if (!userId) {
    return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();

  // Resolve active provider for this user
  const { data: settings } = await supabase
    .from("user_settings")
    .select("tariff_provider")
    .eq("user_id", userId)
    .maybeSingle();

  const providerId = settings?.tariff_provider ?? DEFAULT_PROVIDER_ID;
  const provider = getProvider(providerId);
  const prices = provider.getTodayPrices();

  const forecast = buildForecast(prices, DEFAULT_HOURS_NEEDED);

  return NextResponse.json({
    providerId,
    providerName: provider.displayName,
    ...forecast,
  });
}
