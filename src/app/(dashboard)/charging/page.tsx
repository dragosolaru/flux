import { redirect } from "next/navigation";

import { ChargingClient } from "./charging-client";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Charging · Flux",
};

export interface ChargingSessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  energy_added_kwh: number | null;
  start_soc: number | null;
  end_soc: number | null;
  network: string | null;
  cost_eur: number | null;
  cost_ron: number | null;
  max_charging_rate_kw: number | null;
  location_name: string | null;
}

export default async function ChargingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const supabase = createSupabaseAdminClient();

  const { data: firstVehicle } = await supabase
    .from("vehicles")
    .select("id, display_name, nickname")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstVehicle) redirect("/garage");

  const vehicle = firstVehicle as { id: string; display_name: string; nickname: string | null };

  const { data: history } = await supabase
    .from("charging_sessions")
    .select(
      "id, started_at, ended_at, energy_added_kwh, start_soc, end_soc, network, cost_eur, cost_ron, max_charging_rate_kw, location_name"
    )
    .eq("vehicle_id", vehicle.id)
    .order("started_at", { ascending: false })
    .limit(20);

  return (
    <ChargingClient
      initialHistory={(history ?? []) as ChargingSessionRow[]}
    />
  );
}
