import { redirect } from "next/navigation";

import { ChargingV2Client } from "./charging-client";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ChargingSessionRow } from "@/hooks/useChargingHistory";

export const metadata = { title: "Încărcare · Flux v2" };

export default async function ChargingV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const supabase = createSupabaseAdminClient();

  const { data: firstVehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstVehicle) redirect("/garage");
  const vehicle = firstVehicle as { id: string };

  // Initial data for THIS car only. The client re-queries for whichever car is
  // actually selected — see useChargingHistory.
  const { data: history } = await supabase
    .from("charging_sessions")
    .select(
      "id, started_at, ended_at, energy_added_kwh, start_soc, end_soc, network, cost_eur, cost_ron, max_charging_rate_kw, location_name",
    )
    .eq("vehicle_id", vehicle.id)
    .order("started_at", { ascending: false })
    .limit(20);

  return (
    <ChargingV2Client
      initialHistory={(history ?? []) as ChargingSessionRow[]}
      initialVehicleId={vehicle.id}
    />
  );
}
