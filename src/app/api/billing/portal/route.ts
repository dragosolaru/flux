import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = await ensureSupabaseUserId(session);
  if (!userId) return NextResponse.json({ message: "Failed to resolve user" }, { status: 500 });

  if (!await checkRateLimit(userId, "billing-portal", 10)) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  const customerId = (profile as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({ message: "No active subscription" }, { status: 404 });
  }

  try {
    const origin = process.env.NEXTAUTH_URL ?? "https://flux.daolab.io";
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("[billing/portal]", message);
    return NextResponse.json({ message: "Payment service error" }, { status: 502 });
  }
}
