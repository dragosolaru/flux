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

  const [{ data: vehicle }, { data: vehicles }, { data: userSettings }, { count: docCount }] =
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
        .from("user_settings")
        .select("home_lat")
        .eq("user_id", session.user.id)
        .maybeSingle(),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id),
    ]);

  if (!vehicle) redirect("/garage");

  const checklist: ChecklistData = {
    hasVehicle: true,
    hasDocument: (docCount ?? 0) > 0,
    hasHomeLocation: userSettings?.home_lat != null,
    hasMockVehicle: (vehicles ?? []).some(
      (v: { data_source: string }) => v.data_source === "mock",
    ),
  };

  return (
    <DashboardClient
      vehicleId={vehicle.id}
      vehicleName={vehicle.nickname ?? vehicle.display_name}
      brand={vehicle.brand as BrandKey}
      model={vehicle.model ?? undefined}
      checklist={checklist}
    />
  );
}
