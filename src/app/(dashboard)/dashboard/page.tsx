import { redirect } from "next/navigation";

import { DashboardClient } from "./dashboard-client";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { BrandKey } from "@/lib/brands/types";
import type { ChecklistData } from "@/components/onboarding/GettingStartedCard";

export const metadata = { title: "Dashboard · Flux" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { v: vehicleId } = await searchParams;
  if (!vehicleId) redirect("/garage");

  const supabase = createSupabaseAdminClient();

  const [{ data: vehicle }, { data: vehicles }, { data: profile }, { count: docCount }, { data: lastChargeRow }] =
    await Promise.all([
      supabase
        .from("vehicles")
        .select("id, display_name, brand, nickname, model")
        .eq("id", vehicleId)
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("vehicles")
        .select("data_source")
        .eq("user_id", session.user.id)
        .eq("is_active", true),
      supabase
        .from("profiles")
        .select("home_lat")
        .eq("id", session.user.id)
        .maybeSingle(),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id),
      supabase
        .from("charging_sessions")
        .select("ended_at, energy_added_kwh, start_soc, end_soc")
        .eq("vehicle_id", vehicleId)
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!vehicle) redirect("/garage");

  const checklist: ChecklistData = {
    hasVehicle: true,
    hasDocument: (docCount ?? 0) > 0,
    hasHomeLocation: (profile as { home_lat?: number | null } | null)?.home_lat != null,
    hasMockVehicle: (vehicles ?? []).some(
      (v: { data_source: string }) => v.data_source === "mock",
    ),
  };

  const lastCharge = lastChargeRow
    ? {
        endedAt: lastChargeRow.ended_at as string,
        energyKwh: lastChargeRow.energy_added_kwh as number | null,
        startSoc: lastChargeRow.start_soc as number | null,
        endSoc: lastChargeRow.end_soc as number | null,
      }
    : undefined;

  return (
    <DashboardClient
      vehicleId={vehicle.id}
      vehicleName={vehicle.nickname ?? vehicle.display_name}
      brand={vehicle.brand as BrandKey}
      model={vehicle.model ?? undefined}
      checklist={checklist}
      lastCharge={lastCharge}
    />
  );
}
