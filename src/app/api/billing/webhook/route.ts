import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[billing/webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ message: "Webhook not configured" }, { status: 503 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ message: "Missing signature" }, { status: 400 });

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch {
    return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;

      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (!customerId) break;

      await supabase
        .from("profiles")
        .update({
          subscription_tier: "pro",
          subscription_started_at: new Date().toISOString(),
          subscription_ends_at: null,
        })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;

      if (sub.status === "active" || sub.status === "trialing") {
        await supabase
          .from("profiles")
          .update({ subscription_tier: "pro", subscription_ends_at: null })
          .eq("stripe_customer_id", customerId);
      } else if (sub.status === "past_due" || sub.status === "unpaid") {
        // keep pro for now — Stripe retries; downgrade only on deletion
      } else if (sub.status === "canceled" || sub.status === "incomplete_expired") {
        const endsAt = sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : new Date().toISOString();
        await supabase
          .from("profiles")
          .update({ subscription_tier: "free", subscription_ends_at: endsAt })
          .eq("stripe_customer_id", customerId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await supabase
        .from("profiles")
        .update({
          subscription_tier: "free",
          subscription_ends_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
