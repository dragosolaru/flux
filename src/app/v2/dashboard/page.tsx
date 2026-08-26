import { redirect } from "next/navigation";

import { DashboardV2Client } from "./dashboard-client";
import { auth } from "@/lib/auth";
import { teslaVirtualKeyUrl } from "@/lib/tesla/constants";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Mașina · Flux v2" };

export default async function DashboardV2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const supabase = createSupabaseAdminClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .limit(1);

  if (!vehicles || vehicles.length === 0) redirect("/garage");

  // Per domain, not per car — but every car has to be approved separately
  // by whoever sits in it. Server-only env var, so it is passed down.
  return <DashboardV2Client virtualKeyUrl={teslaVirtualKeyUrl()} />;
}
