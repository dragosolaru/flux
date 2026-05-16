import { redirect } from "next/navigation";

import { ConnectTeslaStep } from "@/components/onboarding/ConnectTeslaStep";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Connect your Tesla · Flux",
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function ConnectTeslaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const supabase = createSupabaseAdminClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .limit(1);

  if (vehicles && vehicles.length > 0) {
    redirect("/dashboard");
  }

  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <ConnectTeslaStep errorCode={error} />
    </div>
  );
}
