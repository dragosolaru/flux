import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { UpgradeButton } from "@/components/billing/UpgradeButton";

export const metadata = {
  title: "Pricing · Flux",
  description: "Simple, transparent pricing for EV owners.",
};

const FREE_FEATURES = [
  "1 vehicle (mock or live)",
  "3 OCR documents / month",
  "Full charging dashboard",
  "Charging map",
  "Trip planner",
  "Smart charge scheduler",
  "Energy tariff prices",
];

const PRO_FEATURES = [
  "Unlimited vehicles",
  "Unlimited OCR documents",
  "Energy bill analysis via AI",
  "WhatsApp document ingest",
  "Email document ingest",
  "Battery health tracking",
  "Weekly cost digest email",
  "Export cost data (CSV)",
  "Priority support",
];

export default async function PricingPage() {
  const session = await auth();
  let currentTier: "free" | "pro" = "free";

  if (session?.user) {
    const userId = await ensureSupabaseUserId(session);
    if (userId) {
      const supabase = createSupabaseAdminClient();
      const { data } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", userId)
        .single();
      currentTier = ((data as { subscription_tier?: string } | null)?.subscription_tier ?? "free") as "free" | "pro";
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Simple pricing</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Start free. Upgrade when you need more.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Free tier */}
          <div className="flex flex-col rounded-2xl border bg-card p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Free</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Full access to core features
              </p>
              <div className="mt-4">
                <span className="text-4xl font-bold">€0</span>
                <span className="text-muted-foreground"> / month</span>
              </div>
            </div>

            <ul className="mb-8 flex-1 space-y-3">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
                  {f}
                </li>
              ))}
            </ul>

            {session?.user ? (
              <div className="rounded-lg border bg-muted/30 px-4 py-2 text-center text-sm text-muted-foreground">
                {currentTier === "free" ? "Current plan" : "Included in Pro"}
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-lg border px-4 py-2 text-center text-sm font-medium transition-colors hover:bg-muted"
              >
                Get started free
              </Link>
            )}
          </div>

          {/* Pro tier */}
          <div className="flex flex-col rounded-2xl border-2 border-primary bg-card p-8 shadow-lg">
            <div className="mb-6">
              <div className="mb-2 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Most popular
              </div>
              <h2 className="text-xl font-semibold">Pro</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Unlimited everything + AI features
              </p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-bold">€4.99</span>
                <span className="text-muted-foreground">/ month</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                or €39 / year (save 35%)
              </p>
            </div>

            <ul className="mb-8 flex-1 space-y-3">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>

            {session?.user ? (
              currentTier === "pro" ? (
                <div className="rounded-lg bg-primary/10 px-4 py-2 text-center text-sm font-medium text-primary">
                  Current plan
                </div>
              ) : (
                <UpgradeButton />
              )
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Get started
              </Link>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Prices in EUR. VAT may apply. Cancel anytime.{" "}
          <Link href="/dashboard" className="underline underline-offset-2">
            Back to app
          </Link>
        </p>
      </div>
    </div>
  );
}
