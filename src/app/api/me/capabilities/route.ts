import { NextResponse } from "next/server";

import { getSubscriptionTier } from "@/lib/subscription";

import { auth } from "@/lib/auth";
import type { CapabilityContext } from "@/lib/capabilities";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";

const EMPTY_CONTEXT: CapabilityContext = {
  hasVehicle: false,
  hasTariff: false,
  hasProSubscription: false,
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json(EMPTY_CONTEXT);

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json(EMPTY_CONTEXT);

  const supabase = createSupabaseAdminClient();

  const [{ data: vehicles }, { data: settings }, subscriptionTier] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, data_source, virtual_key_paired")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("user_settings")
      .select("tariff_provider")
      .eq("user_id", userId)
      .maybeSingle(),
    // Not a raw `profiles.subscription_tier` read. That was a second source of
    // truth for "is this user pro", and it disagreed with the first: the
    // ADMIN_EMAILS override in getSubscriptionTier lifted the vehicle cap while
    // every capability here still reported free, so the same account was pro
    // and not pro depending on which code asked.
    getSubscriptionTier(userId),
  ]);

  const vehicleRows = (vehicles ?? []) as Array<{
    id: string;
    data_source: "mock" | "real";
    virtual_key_paired: boolean;
  }>;

  // The default tariff is "tibber-mock" — treat that as "no real tariff configured".
  // Phase B.1 will add real RO suppliers (Enel, E.ON, etc.) and this check will
  // start returning true for users with one of those selected.
  const tariffProvider = (settings as { tariff_provider?: string | null } | null)
    ?.tariff_provider ?? null;
  const hasRealTariff = tariffProvider != null && !tariffProvider.endsWith("-mock");



  const ctx: CapabilityContext = {
    hasVehicle: vehicleRows.length > 0,
    hasTariff: hasRealTariff,
    hasProSubscription: subscriptionTier === "pro",
  };

  return NextResponse.json(ctx);
}
