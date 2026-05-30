import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Lazily construct the Stripe client. The SDK throws on an empty key, so
 * instantiating at module load would crash `next build` (route modules are
 * imported during page-data collection without runtime env vars set).
 */
export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    client = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
  }
  return client;
}
