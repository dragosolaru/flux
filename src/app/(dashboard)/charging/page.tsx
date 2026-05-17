import { redirect } from "next/navigation";

import { ChargingClient } from "./charging-client";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Charging · Flux",
};

export default async function ChargingPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { v: vehicleId } = await searchParams;
  if (!vehicleId) redirect("/garage");

  const supabase = createSupabaseAdminClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, display_name, nickname")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!vehicle) redirect("/garage");

  const { data: history } = await supabase
    .from("charging_sessions")
    .select("id, started_at, ended_at, energy_added_kwh, start_soc, end_soc, network")
    .eq("vehicle_id", vehicle.id)
    .order("started_at", { ascending: false })
    .limit(10);

  return (
    <ChargingClient
      vehicleId={vehicle.id}
      vehicleName={vehicle.nickname ?? vehicle.display_name}
      history={(history ?? []).map((row) => ({
        id: row.id,
        batteryLevel: row.end_soc,
        chargingRateKw: null,
        recordedAt: row.started_at,
      }))}
    />
  );
}
