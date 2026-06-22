import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { InsightsClient } from "./insights-client";

export const metadata = { title: "Insights · Flux" };

export default async function InsightsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = await ensureSupabaseUserId(session);
  if (!userId) redirect("/login");

  return <InsightsClient />;
}
