import { redirect } from "next/navigation";

import { ChargingClient } from "./charging-client";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Charging · Flux",
};

export default async function ChargingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const supabase = createSupabaseAdminClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, display_name")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!vehicle) redirect("/connect/tesla");

  const { data: history } = await supabase
    .from("vehicle_snapshots")
    .select(
      "id, battery_level, charging_rate_kw, is_charging, recorded_at",
    )
    .eq("vehicle_id", vehicle.id)
    .eq("is_charging", true)
    .order("recorded_at", { ascending: false })
    .limit(10);

  return (
    <ChargingClient
      vehicleId={vehicle.id}
      vehicleName={vehicle.display_name}
      history={(history ?? []).map((row) => ({
        id: row.id,
        batteryLevel: row.battery_level,
        chargingRateKw: row.charging_rate_kw,
        recordedAt: row.recorded_at,
      }))}
    />
  );
}
