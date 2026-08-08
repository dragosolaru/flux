import { redirect } from "next/navigation";

import { ConnectTeslaStep } from "@/components/onboarding/ConnectTeslaStep";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Connect your Tesla · Flux",
};

interface PageProps {
  searchParams: Promise<{ error?: string; reauth?: string }>;
}

export default async function ConnectTeslaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { error, reauth } = await searchParams;

  // The guard below exists to stop someone who already has a car from wandering
  // back into onboarding. It cannot apply to these two cases, and applying it
  // did real damage:
  //
  //   reauth — re-authorising an EXISTING car is the whole point of arriving
  //            here, so bouncing to /dashboard made the "Reconnect Tesla"
  //            button a loop back to the screen that offered it.
  //   error  — every failure in the OAuth callback redirects here with a
  //            reason. With a vehicle on the account those redirects were
  //            swallowed too, so a failed link silently returned the driver to
  //            a dashboard showing stale data and never said why. That is how
  //            `no_vehicles` went unseen.
  const explicitVisit = reauth != null || error != null;

  if (!explicitVisit) {
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
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <ConnectTeslaStep errorCode={error} reauth={reauth != null} />
    </div>
  );
}
