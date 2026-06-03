"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { ChargerHealthCard } from "@/components/settings/ChargerHealthCard";
import { WhatsAppPhonePicker } from "@/components/settings/WhatsAppPhonePicker";
import { InactiveVehiclesList } from "@/components/settings/InactiveVehiclesList";
import { DeactivateButton } from "@/components/settings/DeactivateButton";
import { VehicleSectionBoundary } from "@/components/settings/VehicleSectionBoundary";
import { DangerZone } from "./danger-zone";
import { TariffProviderPicker } from "./tariff-provider-picker";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import { apiFetch } from "@/lib/api-fetch";
import type { CapabilityContext } from "@/lib/capabilities";

interface SettingsClientProps {
  userId: string;
  userName: string | null;
  userEmail: string | null;
}

interface VehicleListItemWithActive {
  id: string;
  brand: string;
  displayName: string;
  nickname: string | null;
  model: string | null;
  year: number | null;
  dataSource: "mock" | "live";
  virtualKeyPaired: boolean;
  isActive: boolean;
  scenarioId?: string | null;
}

interface TariffSettings {
  activeProvider: string;
  providers: { id: string; displayName: string }[];
}

export function SettingsClient({ userName, userEmail }: SettingsClientProps) {
  const t = useTranslations("settings");

  const {
    data: allVehicles,
    isLoading: vehiclesLoading,
  } = useQuery({
    queryKey: ["vehicles", "all"],
    queryFn: () => apiFetch<VehicleListItemWithActive[]>("/api/vehicles?include_inactive=true"),
    staleTime: 60_000,
  });

  const {
    data: tariffSettings,
    isLoading: tariffLoading,
  } = useQuery({
    queryKey: ["tariff-settings"],
    queryFn: () => apiFetch<TariffSettings>("/api/tariffs/settings"),
    staleTime: 60_000,
  });

  const {
    data: capabilities,
    isLoading: capabilitiesLoading,
  } = useQuery({
    queryKey: ["capabilities"],
    queryFn: () => apiFetch<CapabilityContext>("/api/me/capabilities"),
    staleTime: 60_000,
  });

  const isLoading = vehiclesLoading || tariffLoading || capabilitiesLoading;

  if (isLoading) {
    return (
      <PageWrapper className="mx-auto max-w-2xl pb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </PageWrapper>
    );
  }

  const activeVehicles = (allVehicles ?? []).filter((v) => v.isActive);
  const inactiveVehicles = (allVehicles ?? []).filter((v) => !v.isActive);

  const isPro = capabilities?.hasProSubscription ?? false;
  const subscriptionTier: "free" | "pro" = isPro ? "pro" : "free";

  const hasActiveFreeSlot = isPro || activeVehicles.length < 1;

  const scenarioByVehicleId: Record<string, string | null> = Object.fromEntries(
    (allVehicles ?? [])
      .filter((v) => v.dataSource === "mock")
      .map((v) => [v.id, v.scenarioId ?? null]),
  );

  const activeProvider = tariffSettings?.activeProvider ?? "tibber-mock";
  const providers = tariffSettings?.providers ?? [];

  const inactiveForList = inactiveVehicles.map((v) => ({
    id: v.id,
    display_name: v.displayName,
    nickname: v.nickname,
    data_source: v.dataSource,
  }));

  return (
    <PageWrapper className="mx-auto max-w-2xl pb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {/* Account section */}
      <section>
        <SectionHeader label={t("section.account")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRow
            icon={<User className="size-4 text-blue-400" />}
            iconBg="bg-blue-500/20"
            label={t("account.name")}
            value={userName ?? "—"}
          />
          <SettingsRow
            icon={<Mail className="size-4 text-purple-400" />}
            iconBg="bg-purple-500/20"
            label={t("account.email")}
            value={userEmail ?? "—"}
          />
        </GlassCard>
      </section>

      {/* Preferences section */}
      <section>
        <SectionHeader label={t("section.preferences")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRow
            icon={<Globe className="size-4 text-green-400" />}
            iconBg="bg-green-500/20"
            label={t("locale.label")}
            control={<LocalePicker />}
          />
          <SettingsRow
            icon={<DollarSign className="size-4 text-yellow-400" />}
            iconBg="bg-yellow-500/20"
            label={t("currency.label")}
            control={<CurrencyPicker />}
          />
        </GlassCard>
      </section>

      {/* Location section */}
      <section id="home-location">
        <SectionHeader label={t("section.location")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRowExpanded
            icon={<MapPin className="size-4 text-red-400" />}
            iconBg="bg-red-500/20"
            label={t("home_location.label")}
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
        <SectionHeader label={t("section.vehicles")} />
        <VehicleSectionBoundary
          fallback={
            <GlassCard className="divide-y divide-white/5">
              <Link href="/garage" className="block">
                <SettingsRow
                  icon={<ChevronRight className="size-4 text-muted-foreground" />}
                  iconBg="bg-white/5"
                  label={t("vehicles.go_to_garage")}
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
                label={t("vehicles.empty")}
              />
            ) : (
              activeVehicles.map((v) =>
                v.dataSource === "mock" ? (
                  <SettingsRowExpanded
                    key={v.id}
                    icon={<Car className="size-4 text-blue-400" />}
                    iconBg="bg-blue-500/20"
                    label={v.nickname ?? v.displayName}
                  >
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">
                        {t("scenario.help")}
                      </p>
                      <ScenarioPicker
                        vehicleId={v.id}
                        currentScenarioId={scenarioByVehicleId[v.id] ?? null}
                      />
                      <div className="mt-1">
                        <DeactivateButton vehicleId={v.id} label={t("deactivate")} />
                      </div>
                    </div>
                  </SettingsRowExpanded>
                ) : (
                  <div key={v.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                      <Car className="size-4 text-blue-400" />
                    </div>
                    <span className="flex-1 text-sm font-medium">
                      {v.nickname ?? v.displayName}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {v.brand}{v.model ? ` · ${v.model}` : ""}
                    </span>
                    <DeactivateButton vehicleId={v.id} label={t("deactivate")} />
                  </div>
                ),
              )
            )}
            <Link href="/garage" className="block">
              <SettingsRow
                icon={<ChevronRight className="size-4 text-muted-foreground" />}
                iconBg="bg-white/5"
                label={t("vehicles.go_to_garage")}
                chevron
              />
            </Link>
          </GlassCard>

          {inactiveVehicles.length > 0 && (
            <InactiveVehiclesList
              inactiveVehicles={inactiveForList}
              hasActiveFreeSlot={hasActiveFreeSlot}
            />
          )}
        </VehicleSectionBoundary>
      </section>

      {/* Energy tariff section */}
      <section id="tariff">
        <SectionHeader label={t("section.tariff")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRowExpanded
            icon={<Zap className="size-4 text-yellow-400" />}
            iconBg="bg-yellow-500/20"
            label={t("tariff.label")}
          >
            <TariffProviderPicker activeProvider={activeProvider} providers={providers} />
          </SettingsRowExpanded>
        </GlassCard>
      </section>

      {/* Charger data health section */}
      <section id="charger-health">
        <SectionHeader label={t("section.charger")} />
        <GlassCard className="divide-y divide-white/5">
          <SettingsRowExpanded
            icon={<Zap className="size-4 text-amber-400" />}
            iconBg="bg-amber-500/20"
            label={t("charger.label")}
          >
            <ChargerHealthCard />
          </SettingsRowExpanded>
        </GlassCard>
      </section>

      {/* Subscription section */}
      <section id="billing">
        <SectionHeader label={t("section.billing")} />
        <GlassCard className="divide-y divide-white/5">
          <div className="flex min-h-[52px] items-center gap-3 px-4 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <CreditCard className="size-4 text-primary" />
            </div>
            <div className="flex flex-1 items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {subscriptionTier === "pro"
                    ? t("billing.plan_pro")
                    : t("billing.plan_free")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {subscriptionTier === "pro"
                    ? t("billing.plan_pro_desc")
                    : t("billing.plan_free_desc")}
                </p>
              </div>
              {subscriptionTier === "pro" ? (
                <ManageSubscriptionButton />
              ) : (
                <UpgradeButton size="sm" label={t("billing.upgrade_label")} />
              )}
            </div>
          </div>
          {subscriptionTier === "free" && (
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {t("billing.pro_unlock_note")}{" "}
                <a href="/pricing" className="underline underline-offset-2">
                  {t("billing.see_all_features")}
                </a>
              </p>
            </div>
          )}
        </GlassCard>
      </section>

      {/* Danger zone section */}
      <section>
        <SectionHeader label={t("section.danger")} />
        <GlassCard>
          <div className="flex min-h-[52px] items-center gap-3 px-4 py-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/20">
              <Trash2 className="size-4 text-destructive" />
            </div>
            <span className="flex-1 text-sm font-medium text-destructive">
              {t("danger_zone.delete_button")}
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
