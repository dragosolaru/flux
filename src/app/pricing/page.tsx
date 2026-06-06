import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ensureSupabaseUserId } from "@/lib/supabase/ensure-user";
import { UpgradeButton } from "@/components/billing/UpgradeButton";

export const metadata = {
  title: "Pricing · Flux",
  description: "Simple, transparent pricing for EV owners.",
};

const FREE_FEATURE_KEYS = [
  "free_vehicle", "free_ocr", "free_dashboard", "free_map",
  "free_trip", "free_scheduler", "free_tariff",
];

const PRO_FEATURE_KEYS = [
  "pro_vehicles", "pro_ocr", "pro_ai", "pro_whatsapp", "pro_email",
  "pro_battery", "pro_digest", "pro_export", "pro_support",
];

export default async function PricingPage() {
  const t = await getTranslations("pricing");
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
          <h1 className="text-4xl font-bold tracking-tight">{t("heading")}</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            {t("subheading")}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Free tier */}
          <div className="flex flex-col rounded-2xl border bg-card p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">{t("freeTier")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("freeDesc")}
              </p>
              <div className="mt-4">
                <span className="text-4xl font-bold">€0</span>
                <span className="text-muted-foreground"> {t("perMonth")}</span>
              </div>
            </div>

            <ul className="mb-8 flex-1 space-y-3">
              {FREE_FEATURE_KEYS.map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
                  {t(`feature.${k}`)}
                </li>
              ))}
            </ul>

            {session?.user ? (
              <div className="rounded-lg border bg-muted/30 px-4 py-2 text-center text-sm text-muted-foreground">
                {currentTier === "free" ? t("currentPlan") : t("includedInPro")}
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-lg border px-4 py-2 text-center text-sm font-medium transition-colors hover:bg-muted"
              >
                {t("getStartedFree")}
              </Link>
            )}
          </div>

          {/* Pro tier */}
          <div className="flex flex-col rounded-2xl border-2 border-primary bg-card p-8 shadow-lg">
            <div className="mb-6">
              <div className="mb-2 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {t("mostPopular")}
              </div>
              <h2 className="text-xl font-semibold">{t("proTier")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("proDesc")}
              </p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-bold">€4.99</span>
                <span className="text-muted-foreground">{t("perMonth")}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("annualNote")}
              </p>
            </div>

            <ul className="mb-8 flex-1 space-y-3">
              {PRO_FEATURE_KEYS.map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  {t(`feature.${k}`)}
                </li>
              ))}
            </ul>

            {session?.user ? (
              currentTier === "pro" ? (
                <div className="rounded-lg bg-primary/10 px-4 py-2 text-center text-sm font-medium text-primary">
                  {t("currentPlan")}
                </div>
              ) : (
                <UpgradeButton />
              )
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("getStarted")}
              </Link>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          {t("disclaimer")}{" "}
          <Link href="/dashboard" className="underline underline-offset-2">
            {t("backToApp")}
          </Link>
        </p>
      </div>
    </div>
  );
}
