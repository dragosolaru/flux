import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CurrencyPicker } from "@/components/settings/CurrencyPicker";
import { HomeLocationPicker } from "@/components/settings/HomeLocationPicker";
import { LocalePicker } from "@/components/settings/LocalePicker";
import { DangerZone } from "./danger-zone";
import { TariffProviderPicker } from "./tariff-provider-picker";
import { auth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { DEFAULT_PROVIDER_ID, listProviders } from "@/lib/external/tariffs/registry";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";

export const metadata = {
  title: "Settings · Flux",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations();

  const supabase = createSupabaseAdminClient();

  const [{ data: vehicles }, { data: userSettings }, { data: profile }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, display_name, brand, model, data_source")
      .eq("user_id", session.user.id)
      .eq("is_active", true),
    supabase
      .from("user_settings")
      .select("tariff_provider")
      .eq("user_id", session.user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", session.user.id)
      .single(),
  ]);

  const subscriptionTier = ((profile as { subscription_tier?: string } | null)?.subscription_tier ?? "free") as "free" | "pro";

  const activeProvider = userSettings?.tariff_provider ?? DEFAULT_PROVIDER_ID;
  const providers = listProviders().map((p) => ({ id: p.id, displayName: p.displayName }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.section.preferences")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <LocalePicker />
          <CurrencyPicker />
        </CardContent>
      </Card>

      <Card id="home-location">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.section.location")}</CardTitle>
        </CardHeader>
        <CardContent>
          <HomeLocationPicker />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.section.account")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <Row label="Name" value={session.user.name ?? "—"} />
          <Row label="Email" value={session.user.email ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vehicles</CardTitle>
          <CardDescription>Your fleet of connected vehicles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(vehicles ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No vehicles added yet. Visit the Garage to add one.</p>
          ) : (
            (vehicles ?? []).map((v: { id: string; display_name: string; brand: string; model: string | null; data_source: string }) => (
              <div
                key={v.id}
                className="flex flex-col gap-1 rounded-lg border p-4"
              >
                <div className="font-medium">{v.display_name}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {v.brand}{v.model ? ` · ${v.model}` : ""} · {v.data_source}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card id="tariff">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.section.tariff")}</CardTitle>
          <CardDescription>
            Choose your electricity provider for price curves and smart-charge recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TariffProviderPicker activeProvider={activeProvider} providers={providers} />
        </CardContent>
      </Card>

      <Card id="billing">
        <CardHeader>
          <CardTitle className="text-base">Subscription</CardTitle>
          <CardDescription>
            Manage your Flux plan and billing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {subscriptionTier === "pro" ? "Flux Pro" : "Free plan"}
              </p>
              <p className="text-xs text-muted-foreground">
                {subscriptionTier === "pro"
                  ? "Unlimited vehicles and documents, AI features enabled."
                  : "1 vehicle, 3 documents/month."}
              </p>
            </div>
            {subscriptionTier === "pro" ? (
              <ManageSubscriptionButton />
            ) : (
              <UpgradeButton size="sm" label="Upgrade to Pro — €4.99/mo" />
            )}
          </div>
          {subscriptionTier === "free" && (
            <p className="text-xs text-muted-foreground">
              Pro unlocks: unlimited vehicles, unlimited OCR, battery health tracking, weekly email digest.{" "}
              <a href="/pricing" className="underline underline-offset-2">See all features →</a>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Permanently deletes your account and all associated data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DangerZone />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
