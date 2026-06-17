import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { InsightsClient } from "./insights-client";

interface PageProps {
  searchParams: Promise<{ v?: string }>;
}

export const metadata = { title: "Insights · Flux" };

export default async function InsightsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = await ensureSupabaseUserId(session);
  if (!userId) redirect("/login");

  const params = await searchParams;
  const vehicleId = params.v;

  const supabase = createSupabaseAdminClient();

  if (!vehicleId) {
    const { data: first } = await supabase
      .from("vehicles")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (first) redirect(`/insights?v=${(first as { id: string }).id}`);
    redirect("/garage");
  }

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, nickname, display_name")
    .eq("id", vehicleId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!vehicle) redirect("/garage");

  const v = vehicle as { id: string; nickname: string | null; display_name: string };
  return <InsightsClient vehicleId={v.id} vehicleName={v.nickname ?? v.display_name} />;
}
