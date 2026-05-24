import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { CapabilityContext } from "@/lib/capabilities";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";

const EMPTY_CONTEXT: CapabilityContext = {
  hasVehicle: false,
  hasLiveVehicle: false,
  hasTariff: false,
  hasCommandsReady: false,
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json(EMPTY_CONTEXT);

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json(EMPTY_CONTEXT);

  const supabase = createSupabaseAdminClient();

  const [{ data: vehicles }, { data: settings }] = await Promise.all([
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
  ]);

  const vehicleRows = (vehicles ?? []) as Array<{
    id: string;
    data_source: "mock" | "live";
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
    hasLiveVehicle: vehicleRows.some((v) => v.data_source === "live"),
    hasTariff: hasRealTariff,
    hasCommandsReady: vehicleRows.some(
      (v) => v.data_source === "live" && v.virtual_key_paired,
    ),
  };

  return NextResponse.json(ctx);
}
