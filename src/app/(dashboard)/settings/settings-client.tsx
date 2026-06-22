"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { toast } from "sonner";
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
  Settings2,
  SlidersHorizontal,
} from "lucide-react";

import { PageWrapper } from "@/components/layout/page-wrapper";
import {
  Card,
  EmptyState,
  ListRow,
  PageHeader,
  SectionHeader,
  TAP,
} from "@/components/ui-kit";
import { CurrencyPicker } from "@/components/settings/CurrencyPicker";
import { HomeLocationPicker } from "@/components/settings/HomeLocationPicker";
import { LocalePicker } from "@/components/settings/LocalePicker";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { ScenarioPicker } from "@/components/settings/ScenarioPicker";
import { ChargerHealthCard } from "@/components/settings/ChargerHealthCard";
import { WhatsAppPhonePicker } from "@/components/settings/WhatsAppPhonePicker";
import { NotificationsCard } from "@/components/settings/NotificationsCard";
import { isNotificationsEnabled } from "@/lib/feature-flags";
import { InactiveVehiclesList } from "@/components/settings/InactiveVehiclesList";
import { DeactivateButton } from "@/components/settings/DeactivateButton";
import { VehicleSectionBoundary } from "@/components/settings/VehicleSectionBoundary";
import { DangerZone } from "./danger-zone";
import { TariffProviderPicker } from "./tariff-provider-picker";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import * as vehiclesApi from "@/lib/api/vehicles";
import * as tariffsApi from "@/lib/api/tariffs";
import * as meApi from "@/lib/api/me";

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
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;
    toast.success(t("billing.checkout_success"));
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [searchParams, t]);

  const {
    data: allVehicles,
    isLoading: vehiclesLoading,
  } = useQuery({
    queryKey: ["vehicles", "all"],
    queryFn: () => vehiclesApi.list<VehicleListItemWithActive>(true),
    staleTime: 60_000,
  });

  const {
    data: tariffSettings,
    isLoading: tariffLoading,
  } = useQuery({
    queryKey: ["tariff-settings"],
    queryFn: () => tariffsApi.settings<TariffSettings>(),
    staleTime: 60_000,
  });

  const {
    data: capabilities,
    isLoading: capabilitiesLoading,
  } = useQuery({
    queryKey: ["capabilities"],
    queryFn: () => meApi.capabilities(),
    staleTime: 60_000,
  });

  const isLoading = vehiclesLoading || tariffLoading || capabilitiesLoading;

  if (isLoading) {
    return (
      <PageWrapper className="mx-auto max-w-2xl pb-8">
        <PageHeader title={t("title")} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/40" />
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
      <PageHeader title={t("title")} />

      {/* Preferences */}
      <section className="flex flex-col gap-2">
        <SectionHeader title={t("section.preferences")} icon={SlidersHorizontal} />
        <Card className="divide-y divide-border">
          <SettingRow icon={Globe} label={t("locale.label")}>
            <LocalePicker />
          </SettingRow>
          <SettingRow icon={DollarSign} label={t("currency.label")}>
            <CurrencyPicker />
          </SettingRow>
          <SettingRow icon={Smartphone} label={t("install_app.label")}>
            <InstallAppButton />
          </SettingRow>
        </Card>
      </section>

      {/* Home location */}
      <section id="home-location" className="flex flex-col gap-2">
        <SectionHeader title={t("section.location")} icon={MapPin} />
        <Card className="divide-y divide-border">
          <SettingRow icon={MapPin} label={t("home_location.label")}>
            <HomeLocationPicker />
          </SettingRow>
        </Card>
      </section>

      {/* Energy tariff */}
      <section id="tariff" className="flex flex-col gap-2">
        <SectionHeader title={t("section.tariff")} icon={Zap} />
        <Card className="divide-y divide-border">
          <SettingRow icon={Zap} label={t("tariff.label")}>
            <TariffProviderPicker activeProvider={activeProvider} providers={providers} />
          </SettingRow>
        </Card>
      </section>

      {/* Notifications (behind feature flag) */}
      {isNotificationsEnabled() && <NotificationsCard />}

      {/* Vehicles */}
      <section className="flex flex-col gap-2">
        <SectionHeader title={t("section.vehicles")} icon={Car} />
        <VehicleSectionBoundary
          fallback={
            <Link href="/garage" className="block">
              <ListRow
                leading={<Car className="size-4 text-muted-foreground" />}
                title={t("vehicles.go_to_garage")}
                trailing={<ChevronRight className="size-4 text-muted-foreground" />}
              />
            </Link>
          }
        >
          <div className="flex flex-col gap-2">
            {activeVehicles.length === 0 ? (
              <Card>
                <EmptyState icon={Car} title={t("vehicles.empty")} />
              </Card>
            ) : (
              activeVehicles.map((v) =>
                v.dataSource === "mock" ? (
                  <Card key={v.id} className="p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <Car className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {v.nickname ?? v.displayName}
                      </span>
                      <DeactivateButton vehicleId={v.id} label={t("deactivate")} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">{t("scenario.help")}</p>
                      <ScenarioPicker
                        vehicleId={v.id}
                        currentScenarioId={scenarioByVehicleId[v.id] ?? null}
                      />
                    </div>
                  </Card>
                ) : (
                  <ListRow
                    key={v.id}
                    leading={<Car className="size-4 text-muted-foreground" />}
                    title={v.nickname ?? v.displayName}
                    meta={`${v.brand}${v.model ? ` · ${v.model}` : ""}${v.year ? ` · ${v.year}` : ""}`}
                    trailing={<DeactivateButton vehicleId={v.id} label={t("deactivate")} />}
                  />
                ),
              )
            )}
            <Link href="/garage" className="block">
              <ListRow
                leading={<Car className="size-4 text-muted-foreground" />}
                title={t("vehicles.go_to_garage")}
                trailing={<ChevronRight className="size-4 text-muted-foreground" />}
              />
            </Link>
          </div>

          {inactiveVehicles.length > 0 && (
            <div className="mt-2 opacity-70">
              <InactiveVehiclesList
                inactiveVehicles={inactiveForList}
                hasActiveFreeSlot={hasActiveFreeSlot}
              />
            </div>
          )}
        </VehicleSectionBoundary>
      </section>

      {/* Account & Billing — collapsible */}
      <CollapsibleSection
        titleKey="section.account_billing"
        icon={CreditCard}
        storageKey="settings-billing-open"
        defaultOpen={false}
      >
        <section className="flex flex-col gap-2">
          <SectionHeader title={t("section.account")} icon={User} />
          <Card className="divide-y divide-border">
            <ListRow
              leading={<User className="size-4 text-muted-foreground" />}
              title={t("account.name")}
              trailing={
                <span className="max-w-[12rem] truncate text-sm text-muted-foreground">
                  {userName ?? "—"}
                </span>
              }
            />
            <ListRow
              leading={<Mail className="size-4 text-muted-foreground" />}
              title={t("account.email")}
              trailing={
                <span className="max-w-[12rem] truncate text-sm text-muted-foreground">
                  {userEmail ?? "—"}
                </span>
              }
            />
          </Card>
        </section>

        <section id="billing" className="mt-3 flex flex-col gap-2">
          <SectionHeader title={t("section.billing")} icon={CreditCard} />
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
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
              </div>
              <div className="shrink-0">
                {subscriptionTier === "pro" ? (
                  <ManageSubscriptionButton />
                ) : (
                  <UpgradeButton size="sm" label={t("billing.upgrade_label")} />
                )}
              </div>
            </div>
            {subscriptionTier === "free" && (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                {t("billing.pro_unlock_note")}{" "}
                <a href="/pricing" className="text-primary underline underline-offset-2">
                  {t("billing.see_all_features")}
                </a>
              </p>
            )}
          </Card>
        </section>

        <section className="mt-3 flex flex-col gap-2">
          <SectionHeader title={t("section.danger")} icon={Trash2} />
          <Card className="border-destructive/40 bg-destructive/5 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Trash2 className="size-4 shrink-0 text-destructive" />
              <span className="min-w-0 flex-1 text-sm font-medium text-destructive">
                {t("danger_zone.delete_button")}
              </span>
              <DangerZone />
            </div>
          </Card>
        </section>
      </CollapsibleSection>

      {/* Advanced — collapsible */}
      <CollapsibleSection
        titleKey="section.advanced"
        icon={Settings2}
        storageKey="settings-advanced-open"
        defaultOpen={false}
      >
        <section id="whatsapp" className="flex flex-col gap-2">
          <SectionHeader title="WhatsApp" icon={MessageCircle} />
          <Card className="p-4">
            <WhatsAppPhonePicker />
          </Card>
        </section>

        <section id="charger-health" className="mt-3 flex flex-col gap-2">
          <SectionHeader title={t("section.charger")} icon={Zap} />
          <Card className="p-4">
            <ChargerHealthCard />
          </Card>
        </section>
      </CollapsibleSection>
    </PageWrapper>
  );
}

function CollapsibleSection({
  titleKey,
  icon: Icon,
  children,
  storageKey,
  defaultOpen = false,
}: {
  titleKey: string;
  icon: React.ComponentType<{ className?: string }>;
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
    <section className="flex flex-col gap-2">
      <motion.button
        type="button"
        onClick={toggle}
        whileTap={{ scale: 0.98 }}
        transition={TAP}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-1"
      >
        <span className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" />
          {t(titleKey)}
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </motion.button>
      {open && <div className="flex flex-col gap-2">{children}</div>}
    </section>
  );
}

function SettingRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="ml-auto min-w-0 shrink-0">{children}</div>
    </div>
  );
}
