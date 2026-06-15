"use client";

import Link from "next/link";
import { useState } from "react";
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
  ChevronDown,
  Trash2,
  Smartphone,
} from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { CurrencyPicker } from "@/components/settings/CurrencyPicker";
import { HomeLocationPicker } from "@/components/settings/HomeLocationPicker";
import { LocalePicker } from "@/components/settings/LocalePicker";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
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

      {/* Esențial — Preferences */}
      <section>
        <SectionHeader label={t("section.preferences")} />
        <GlassCard className="divide-y divide-white/[0.04]">
          <SettingsRowExpanded
            icon={<Globe className="size-4 text-muted-foreground shrink-0" />}
            label={t("locale.label")}
          >
            <LocalePicker />
          </SettingsRowExpanded>
          <SettingsRowExpanded
            icon={<DollarSign className="size-4 text-muted-foreground shrink-0" />}
            label={t("currency.label")}
          >
            <CurrencyPicker />
          </SettingsRowExpanded>
          <SettingsRowExpanded
            icon={<Smartphone className="size-4 text-muted-foreground shrink-0" />}
            label={t("install_app.label")}
          >
            <InstallAppButton />
          </SettingsRowExpanded>
        </GlassCard>
      </section>

      {/* Home location */}
      <section id="home-location">
        <SectionHeader label={t("section.location")} />
        <GlassCard className="divide-y divide-white/[0.04]">
          <SettingsRowExpanded
            icon={<MapPin className="size-4 text-muted-foreground shrink-0" />}
            label={t("home_location.label")}
          >
            <HomeLocationPicker />
          </SettingsRowExpanded>
        </GlassCard>
      </section>

      {/* Energy tariff */}
      <section id="tariff">
        <SectionHeader label={t("section.tariff")} />
        <GlassCard className="divide-y divide-white/[0.04]">
          <SettingsRowExpanded
            icon={<Zap className="size-4 text-muted-foreground shrink-0" />}
            label={t("tariff.label")}
          >
            <TariffProviderPicker activeProvider={activeProvider} providers={providers} />
          </SettingsRowExpanded>
        </GlassCard>
      </section>

      {/* Vehicles */}
      <section>
        <SectionHeader label={t("section.vehicles")} />
        <VehicleSectionBoundary
          fallback={
            <GlassCard className="divide-y divide-white/[0.04]">
              <Link href="/garage" className="block">
                <SettingsRow
                  icon={<ChevronRight className="size-4 text-muted-foreground shrink-0" />}
                  label={t("vehicles.go_to_garage")}
                  chevron
                />
              </Link>
            </GlassCard>
          }
        >
          <GlassCard className="divide-y divide-white/[0.04]">
            {activeVehicles.length === 0 ? (
              <SettingsRow
                icon={<Car className="size-4 text-muted-foreground shrink-0" />}
                label={t("vehicles.empty")}
              />
            ) : (
              activeVehicles.map((v) =>
                v.dataSource === "mock" ? (
                  <SettingsRowExpanded
                    key={v.id}
                    icon={<Car className="size-4 text-muted-foreground shrink-0" />}
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
                  <div key={v.id} className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                    <Car className="size-4 text-muted-foreground shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {v.nickname ?? v.displayName}
                    </span>
                    <span className="hidden text-sm text-muted-foreground sm:block">
                      {v.brand}{v.model ? ` · ${v.model}` : ""}
                    </span>
                    <DeactivateButton vehicleId={v.id} label={t("deactivate")} />
                  </div>
                ),
              )
            )}
            <Link href="/garage" className="block">
              <SettingsRow
                icon={<ChevronRight className="size-4 text-muted-foreground shrink-0" />}
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

      {/* Contul & Billing — collapsible */}
      <CollapsibleSection
        titleKey="section.account_billing"
        storageKey="settings-billing-open"
        defaultOpen={false}
      >
        <section>
          <GlassCard className="divide-y divide-white/[0.04]">
            <SettingsRow
              icon={<User className="size-4 text-muted-foreground shrink-0" />}
              label={t("account.name")}
              value={userName ?? "—"}
            />
            <SettingsRow
              icon={<Mail className="size-4 text-muted-foreground shrink-0" />}
              label={t("account.email")}
              value={userEmail ?? "—"}
            />
          </GlassCard>
        </section>

        <section id="billing" className="mt-3">
          <GlassCard className="divide-y divide-white/[0.04]">
            <div className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <CreditCard className="size-4 text-muted-foreground shrink-0" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-2">
                <div className="min-w-0">
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
                <div className="shrink-0">
                  {subscriptionTier === "pro" ? (
                    <ManageSubscriptionButton />
                  ) : (
                    <UpgradeButton size="sm" label={t("billing.upgrade_label")} />
                  )}
                </div>
              </div>
            </div>
            {subscriptionTier === "free" && (
              <div className="px-4 py-2.5">
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

        <section className="mt-3">
          <GlassCard>
            <div className="flex flex-wrap items-center gap-3 px-4 py-4">
              <Trash2 className="size-4 text-destructive shrink-0" />
              <span className="min-w-0 flex-1 text-sm font-medium text-destructive">
                {t("danger_zone.delete_button")}
              </span>
              <DangerZone />
            </div>
          </GlassCard>
        </section>
      </CollapsibleSection>

      {/* Avansat — collapsible */}
      <CollapsibleSection
        titleKey="section.advanced"
        storageKey="settings-advanced-open"
        defaultOpen={false}
      >
        <section id="whatsapp">
          <GlassCard className="divide-y divide-white/[0.04]">
            <SettingsRowExpanded
              icon={<MessageCircle className="size-4 text-muted-foreground shrink-0" />}
              label="WhatsApp"
            >
              <WhatsAppPhonePicker />
            </SettingsRowExpanded>
          </GlassCard>
        </section>

        <section id="charger-health" className="mt-3">
          <GlassCard className="divide-y divide-white/[0.04]">
            <SettingsRowExpanded
              icon={<Zap className="size-4 text-muted-foreground shrink-0" />}
              label={t("charger.label")}
            >
              <ChargerHealthCard />
            </SettingsRowExpanded>
          </GlassCard>
        </section>
      </CollapsibleSection>
    </PageWrapper>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-xs tracking-[0.12em] uppercase text-muted-foreground/60 px-1 mb-1 mt-5 first:mt-0">
      {label}
    </p>
  );
}

function CollapsibleSection({
  titleKey,
  children,
  storageKey,
  defaultOpen = false,
}: {
  titleKey: string;
  children: React.ReactNode;
  storageKey: string;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === "true" : defaultOpen;
  });

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  };

  return (
    <section>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between px-1 mb-1 mt-5 first:mt-0"
      >
        <span className="text-xs tracking-[0.12em] uppercase text-muted-foreground/60">
          {t(titleKey)}
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && children}
    </section>
  );
}

interface SettingsRowProps {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  value?: string;
  control?: React.ReactNode;
  chevron?: boolean;
}

function SettingsRow({ icon, label, value, control, chevron }: SettingsRowProps) {
  return (
    <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {value && <span className="max-w-[40%] truncate text-sm text-muted-foreground">{value}</span>}
      {control && <div className="shrink-0">{control}</div>}
      {chevron && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </div>
  );
}

interface SettingsRowExpandedProps {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  children: React.ReactNode;
}

function SettingsRowExpanded({ icon, label, children }: SettingsRowExpandedProps) {
  return (
    <div className="px-4 py-3.5">
      <div className="mb-3 flex items-center gap-3">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="ml-7">{children}</div>
    </div>
  );
}
