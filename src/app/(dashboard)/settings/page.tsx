import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  User,
  Mail,
  Globe,
  DollarSign,
  MapPin,
  MessageCircle,
  Zap,
  CreditCard,
  Car,
  ChevronRight,
  Trash2,
} from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { CurrencyPicker } from "@/components/settings/CurrencyPicker";
import { HomeLocationPicker } from "@/components/settings/HomeLocationPicker";
import { LocalePicker } from "@/components/settings/LocalePicker";
import { ScenarioPicker } from "@/components/settings/ScenarioPicker";
import { WhatsAppPhonePicker } from "@/components/settings/WhatsAppPhonePicker";
import { InactiveVehiclesList } from "@/components/settings/InactiveVehiclesList";
import { DeactivateButton } from "@/components/settings/DeactivateButton";
import { VehicleSectionBoundary } from "@/components/settings/VehicleSectionBoundary";
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

  // Fetch all settings data defensively — a single DB hiccup must never take
  // down the whole settings screen.
  type VehicleRow = {
    id: string;
    display_name: string;
    nickname: string | null;
    brand: string;
    model: string | null;
    data_source: string;
    is_active: boolean;
  };
  let allVehicles: VehicleRow[] = [];
  let tariffProvider: string | null = null;
  let subscriptionTier: "free" | "pro" = "free";
  let scenarioByVehicleId: Record<string, string | null> = {};

  try {
    const [{ data: vehicleRows }, { data: userSettings }, { data: profile }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, display_name, nickname, brand, model, data_source, is_active")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_settings")
        .select("tariff_provider")
        .eq("user_id", session.user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", session.user.id)
        .maybeSingle(),
    ]);

    allVehicles = (vehicleRows ?? []) as VehicleRow[];
    tariffProvider = userSettings?.tariff_provider ?? null;
    subscriptionTier = (
      (profile as { subscription_tier?: string } | null)?.subscription_tier ?? "free"
    ) as "free" | "pro";

    const mockVehicleIds = allVehicles
      .filter((v) => v.data_source === "mock" && v.is_active)
      .map((v) => v.id);
    if (mockVehicleIds.length > 0) {
      const { data: mockStates } = await supabase
        .from("mock_vehicle_state")
        .select("vehicle_id, scenario_id")
        .in("vehicle_id", mockVehicleIds);
      scenarioByVehicleId = Object.fromEntries(
        (mockStates ?? []).map((s: { vehicle_id: string; scenario_id: string | null }) => [
          s.vehicle_id,
          s.scenario_id,
        ]),
      );
    }
  } catch (err) {
    console.error("[settings] data fetch failed", err);
  }

  const activeVehicles = allVehicles.filter((v) => v.is_active);
  const inactiveVehicles = allVehicles.filter((v) => !v.is_active);

  const hasActiveFreeSlot =
    subscriptionTier === "pro" ||
    (subscriptionTier === "free" && activeVehicles.length < 1);

  const activeProvider = tariffProvider ?? DEFAULT_PROVIDER_ID;
  const providers = listProviders().map((p) => ({ id: p.id, displayName: p.displayName }));

  return (
    <PageWrapper className="mx-auto max-w-2xl pb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>

      {/* Account section */}
      <section>
        <SectionHeader label={t("settings.section.account")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRow
            icon={<User className="size-4 text-blue-400" />}
            iconBg="bg-blue-500/20"
            label={t("settings.account.name")}
            value={session.user.name ?? "—"}
          />
          <SettingsRow
            icon={<Mail className="size-4 text-purple-400" />}
            iconBg="bg-purple-500/20"
            label={t("settings.account.email")}
            value={session.user.email ?? "—"}
          />
        </GlassCard>
      </section>

      {/* Preferences section */}
      <section>
        <SectionHeader label={t("settings.section.preferences")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRow
            icon={<Globe className="size-4 text-green-400" />}
            iconBg="bg-green-500/20"
            label={t("settings.locale.label")}
            control={<LocalePicker />}
          />
          <SettingsRow
            icon={<DollarSign className="size-4 text-yellow-400" />}
            iconBg="bg-yellow-500/20"
            label={t("settings.currency.label")}
            control={<CurrencyPicker />}
          />
        </GlassCard>
      </section>

      {/* Location section */}
      <section id="home-location">
        <SectionHeader label={t("settings.section.location")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRowExpanded
            icon={<MapPin className="size-4 text-red-400" />}
            iconBg="bg-red-500/20"
            label={t("settings.home_location.label")}
          >
            <HomeLocationPicker />
          </SettingsRowExpanded>
          <SettingsRowExpanded
            icon={<MessageCircle className="size-4 text-green-400" />}
            iconBg="bg-green-500/20"
            label="WhatsApp"
          >
            <WhatsAppPhonePicker />
          </SettingsRowExpanded>
        </GlassCard>
      </section>

      {/* Vehicles section */}
      <section>
        <SectionHeader label={t("settings.section.vehicles")} />
        <VehicleSectionBoundary
          fallback={
            <GlassCard className="divide-y divide-white/5">
              <Link href="/garage" className="block">
                <SettingsRow
                  icon={<ChevronRight className="size-4 text-muted-foreground" />}
                  iconBg="bg-white/5"
                  label={t("settings.vehicles.go_to_garage")}
                  chevron
                />
              </Link>
            </GlassCard>
          }
        >
          <GlassCard className="divide-y divide-white/5">
            {activeVehicles.length === 0 ? (
              <SettingsRow
                icon={<Car className="size-4 text-blue-400" />}
                iconBg="bg-blue-500/20"
                label={t("settings.vehicles.empty")}
              />
            ) : (
              activeVehicles.map((v) =>
                v.data_source === "mock" ? (
                  <SettingsRowExpanded
                    key={v.id}
                    icon={<Car className="size-4 text-blue-400" />}
                    iconBg="bg-blue-500/20"
                    label={v.nickname ?? v.display_name}
                  >
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">
                        {t("settings.scenario.help")}
                      </p>
                      <ScenarioPicker
                        vehicleId={v.id}
                        currentScenarioId={scenarioByVehicleId[v.id] ?? null}
                      />
                      <div className="mt-1">
                        <DeactivateButton vehicleId={v.id} label={t("settings.deactivate")} />
                      </div>
                    </div>
                  </SettingsRowExpanded>
                ) : (
                  <div key={v.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                      <Car className="size-4 text-blue-400" />
                    </div>
                    <span className="flex-1 text-sm font-medium">
                      {v.nickname ?? v.display_name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {v.brand}{v.model ? ` · ${v.model}` : ""}
                    </span>
                    <DeactivateButton vehicleId={v.id} label={t("settings.deactivate")} />
                  </div>
                ),
              )
            )}
            <Link href="/garage" className="block">
              <SettingsRow
                icon={<ChevronRight className="size-4 text-muted-foreground" />}
                iconBg="bg-white/5"
                label={t("settings.vehicles.go_to_garage")}
                chevron
              />
            </Link>
          </GlassCard>

          {inactiveVehicles.length > 0 && (
            <InactiveVehiclesList
              inactiveVehicles={inactiveVehicles}
              hasActiveFreeSlot={hasActiveFreeSlot}
            />
          )}
        </VehicleSectionBoundary>
      </section>

      {/* Energy tariff section */}
      <section id="tariff">
        <SectionHeader label={t("settings.section.tariff")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRowExpanded
            icon={<Zap className="size-4 text-yellow-400" />}
            iconBg="bg-yellow-500/20"
            label={t("settings.tariff.label")}
          >
            <TariffProviderPicker activeProvider={activeProvider} providers={providers} />
          </SettingsRowExpanded>
        </GlassCard>
      </section>

      {/* Subscription section */}
      <section id="billing">
        <SectionHeader label={t("settings.section.billing")} />
        <GlassCard className="divide-y divide-white/5">
          <div className="flex min-h-[52px] items-center gap-3 px-4 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <CreditCard className="size-4 text-primary" />
            </div>
            <div className="flex flex-1 items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {subscriptionTier === "pro"
                    ? t("settings.billing.plan_pro")
                    : t("settings.billing.plan_free")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {subscriptionTier === "pro"
                    ? t("settings.billing.plan_pro_desc")
                    : t("settings.billing.plan_free_desc")}
                </p>
              </div>
              {subscriptionTier === "pro" ? (
                <ManageSubscriptionButton />
              ) : (
                <UpgradeButton size="sm" label={t("settings.billing.upgrade_label")} />
              )}
            </div>
          </div>
          {subscriptionTier === "free" && (
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {t("settings.billing.pro_unlock_note")}{" "}
                <a href="/pricing" className="underline underline-offset-2">
                  {t("settings.billing.see_all_features")}
                </a>
              </p>
            </div>
          )}
        </GlassCard>
      </section>

      {/* Danger zone section */}
      <section>
        <SectionHeader label={t("settings.section.danger")} />
        <GlassCard>
          <div className="flex min-h-[52px] items-center gap-3 px-4 py-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/20">
              <Trash2 className="size-4 text-destructive" />
            </div>
            <span className="flex-1 text-sm font-medium text-destructive">
              {t("settings.danger_zone.delete_button")}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <DangerZone />
            </div>
          </div>
        </GlassCard>
      </section>
    </PageWrapper>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
  );
}

interface SettingsRowProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value?: string;
  control?: React.ReactNode;
  chevron?: boolean;
}

function SettingsRow({ icon, iconBg, label, value, control, chevron }: SettingsRowProps) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
      <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </div>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {value && <span className="text-sm text-muted-foreground">{value}</span>}
      {control && <div className="shrink-0">{control}</div>}
      {chevron && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </div>
  );
}

interface SettingsRowExpandedProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  children: React.ReactNode;
}

function SettingsRowExpanded({ icon, iconBg, label, children }: SettingsRowExpandedProps) {
  return (
    <div className="px-4 py-3">
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="ml-11">{children}</div>
    </div>
  );
}
