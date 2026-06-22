import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { CostsClient } from "./costs-client";

export default async function CostsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = await ensureSupabaseUserId(session);
  if (!userId) redirect("/login");

  return <CostsClient />;
}
