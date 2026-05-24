import { redirect } from "next/navigation";

import { DashboardClient } from "./dashboard-client";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { BrandKey } from "@/lib/brands/types";

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
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, display_name, brand, nickname, model")
    .eq("id", vehicleId)
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!vehicle) redirect("/garage");

  return (
    <DashboardClient
      vehicleId={vehicle.id}
      vehicleName={vehicle.nickname ?? vehicle.display_name}
      brand={vehicle.brand as BrandKey}
      model={vehicle.model ?? undefined}
    />
  );
}
