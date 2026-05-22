import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { CostsClient } from "./costs-client";

interface PageProps {
  searchParams: Promise<{ v?: string }>;
}

function vehicleEmailAddress(vehicleId: string, nickname: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://flux.vercel.app";
  const domain = appUrl.replace(/^https?:\/\//, "").split("/")[0];
  const slug = nickname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
  const shortId = vehicleId.replace(/-/g, "").slice(0, 8);
  return `flux+${slug}-${shortId}@${domain}`;
}

export default async function CostsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = await ensureSupabaseUserId(session);
  if (!userId) redirect("/login");

  const params = await searchParams;
  const vehicleId = params.v;

  if (!vehicleId) {
    const supabase = createSupabaseAdminClient();
    const { data: first } = await supabase
      .from("vehicles")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (first) redirect(`/costs?v=${(first as { id: string }).id}`);
    redirect("/garage");
  }

  const supabase = createSupabaseAdminClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, nickname, display_name")
    .eq("id", vehicleId)
    .eq("user_id", userId)
    .single();

  if (!vehicle) redirect("/garage");

  const v = vehicle as { id: string; nickname: string | null; display_name: string };
  const vehicleName = v.nickname ?? v.display_name;

  return (
    <CostsClient
      vehicleId={v.id}
      vehicleName={vehicleName}
      vehicleEmail={vehicleEmailAddress(v.id, vehicleName)}
    />
  );
}
