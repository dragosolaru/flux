import { redirect } from "next/navigation";

import { DashboardV2Client } from "./dashboard-client";
import { auth } from "@/lib/auth";
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

  return <DashboardV2Client />;
}
