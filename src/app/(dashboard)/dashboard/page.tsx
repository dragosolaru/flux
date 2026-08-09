import { redirect } from "next/navigation";

import { DashboardClient } from "./dashboard-client";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { teslaVirtualKeyUrl } from "@/lib/tesla/constants";
import type { ChecklistData } from "@/components/onboarding/GettingStartedCard";

export const metadata = { title: "Dashboard · Flux" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const supabase = createSupabaseAdminClient();

  const [
    { data: profile },
    { count: docCount },
    { data: allVehicles },
  ] = await Promise.all([
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
      .from("vehicles")
      .select("data_source")
      .eq("user_id", session.user.id)
      .eq("is_active", true),
  ]);

  if (!allVehicles || allVehicles.length === 0) redirect("/garage");

  const checklist: ChecklistData = {
    hasVehicle: true,
    hasDocument: (docCount ?? 0) > 0,
    hasHomeLocation: (profile as { home_lat?: number | null } | null)?.home_lat != null,
    hasMockVehicle: (allVehicles ?? []).some(
      (v: { data_source: string }) => v.data_source === "mock",
    ),
  };

  // Per-domain, not per-vehicle — the same link pairs every car, but each car
  // has to be approved separately by whoever sits in it. Computed here rather
  // than read client-side because it derives from a server-only env var.
  return (
    <DashboardClient checklist={checklist} virtualKeyUrl={teslaVirtualKeyUrl()} />
  );
}
