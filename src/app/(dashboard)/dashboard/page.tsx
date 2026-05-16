import { redirect } from "next/navigation";

import { DashboardClient } from "./dashboard-client";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard · Flux",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const supabase = createSupabaseAdminClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, display_name")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!vehicle) {
    redirect("/connect/tesla");
  }

  return (
    <DashboardClient
      vehicleId={vehicle.id}
      vehicleName={vehicle.display_name}
    />
  );
}
