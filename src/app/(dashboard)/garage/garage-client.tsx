"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Sparkles, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AddVehicleModal } from "@/components/onboarding/AddVehicleModal";
import { Button } from "@/components/ui/button";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleModelImage } from "@/components/vehicle/VehicleModelImage";
import { VehicleCardMenu } from "@/components/garage/VehicleCardMenu";
import { Card, EmptyState, PageHeader, TAP } from "@/components/ui-kit";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useVehicles, type VehicleListItem } from "@/hooks/useVehicles";
import { apiFetch } from "@/lib/api-fetch";
import { cardVariants, fadeInUp, staggerContainer } from "@/lib/animations/variants";
import type { TariffForecast } from "@/lib/external/tariffs/types";

interface TariffResponse extends TariffForecast {
  providerId: string;
  providerName: string;
}

// Gradient per brand/model — blue → teal default, variants per model
function getCardGradient(brand: string, model: string | null): string {
  if (brand === "tesla") {
    const m = model?.toLowerCase() ?? "";
    if (m === "model s") return "from-indigo-900/90 to-blue-800/80";
    if (m === "model x") return "from-slate-900/90 to-blue-900/80";
    if (m === "cybertruck") return "from-slate-900/90 to-zinc-800/80";
  }
  return "from-blue-950/90 to-teal-900/80";
}

function VehicleHeroCard({
  vehicle,
  onDeactivated,
}: {
  vehicle: VehicleListItem;
  onDeactivated: () => void;
}) {
  const tg = useTranslations("garage");
  const gradient = getCardGradient(vehicle.brand, vehicle.model);
  const displayName = vehicle.nickname ?? vehicle.displayName;
  const subtitle = [vehicle.model, vehicle.year?.toString()].filter(Boolean).join(" · ");

  return (
    <motion.div variants={cardVariants} className="relative">
      <Link href={`/dashboard?v=${vehicle.id}`} className="block">
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={TAP}
          className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} aspect-[16/7]`}
          style={{ minHeight: 0 }}
        >
          {/* Subtle border overlay */}
          <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/6" />

          {/* Content */}
          <div className="relative flex h-full flex-col justify-between overflow-hidden py-4 px-5">
            {/* Top row: name + demo badge */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-2xl font-bold leading-tight tracking-tight">
                  {displayName}
                </h2>
                {subtitle && (
                  <p className="mt-0.5 truncate text-sm text-white/60">{subtitle}</p>
                )}
              </div>
              {vehicle.dataSource === "mock" && (
                <span className="shrink-0 rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/60">
                  {tg("mock_label")}
                </span>
              )}
            </div>

            {/* Vehicle silhouette — slightly more visible at 30% */}
            {vehicle.model && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 w-[48%] opacity-30 text-white pointer-events-none">
                <VehicleModelImage model={vehicle.model} className="w-full h-auto" />
              </div>
            )}

            {/* Bottom hint */}
            <p className="relative truncate text-xs text-white/35">{tg("tap_to_open")}</p>
          </div>
        </motion.div>
      </Link>

      {/* Menu button — outside the Link so clicks don't navigate */}
      <VehicleCardMenu
        vehicleId={vehicle.id}
        vehicleName={displayName}
        onDeactivated={onDeactivated}
      />
    </motion.div>
  );
}

function AddVehicleCard() {
  const tg = useTranslations("garage");

  return (
    <motion.div variants={cardVariants}>
      <AddVehicleModal
        trigger={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={TAP}
            className="flex aspect-[16/7] w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-border bg-muted/40 transition-colors hover:bg-muted"
            style={{ minHeight: 0 }}
          >
            <Plus className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              {tg("add_vehicle")}
            </span>
          </motion.button>
        }
      />
    </motion.div>
  );
}

export function GarageClient({ teslaLive }: { teslaLive: boolean }) {
  const tg = useTranslations("garage");
  const queryClient = useQueryClient();
  const { data: vehicles, isLoading } = useVehicles();
  const { data: caps } = useCapabilities();

  const { data: tariff } = useQuery({
    queryKey: ["tariff-prices"],
    queryFn: () => apiFetch<TariffResponse>("/api/tariffs/prices"),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(caps?.hasTariff),
  });

  function handleDeactivated() {
    void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  }

  if (!isLoading && vehicles && vehicles.length === 0) {
    return <OnboardingHero teslaLive={teslaLive} />;
  }

  const count = vehicles?.length ?? 0;
  const countLabel =
    count === 1 ? tg("vehicles_count_one") : tg("vehicles_count_other", { count });

  return (
    <PageWrapper className="mx-auto max-w-xl gap-2.5 px-0">
      {/* Header */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <PageHeader title={tg("title")} subtitle={isLoading ? "…" : countLabel} />
      </motion.div>

      {/* Tariff hint */}
      {caps?.hasTariff && tariff && tariff.cheapestAvgPrice < tariff.currentPrice && (
        <motion.div variants={fadeInUp} initial="hidden" animate="visible">
          <Card variant="surface" className="flex items-center gap-2.5 p-4 text-sm">
            <Zap className="size-4 shrink-0 text-chart-2" />
            <span className="min-w-0 flex-1 text-muted-foreground">
              {tg("tariff_hint_cheapest")}{" "}
              <strong className="text-foreground tabular-nums">
                {String(tariff.cheapestWindowStart).padStart(2, "0")}:00
                {" – "}
                {String(tariff.cheapestWindowEnd).padStart(2, "0")}:00
              </strong>
              {" · "}
              {tg("tariff_hint_save")}{" "}
              <span className="tabular-nums text-chart-2">
                {((tariff.currentPrice - tariff.cheapestAvgPrice) * 100).toFixed(1)}
              </span>{" "}
              {tg("tariff_hint_unit")}
            </span>
          </Card>
        </motion.div>
      )}

      {/* Vehicle list */}
      {isLoading ? (
        <div className="space-y-2.5">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[16/7] w-full rounded-3xl" />
          ))}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-2.5"
        >
          {vehicles?.map((v: VehicleListItem) => (
            <VehicleHeroCard key={v.id} vehicle={v} onDeactivated={handleDeactivated} />
          ))}
          <AddVehicleCard />
        </motion.div>
      )}
    </PageWrapper>
  );
}

function OnboardingHero({ teslaLive }: { teslaLive: boolean }) {
  const t = useTranslations();

  return (
    <PageWrapper className="mx-auto flex max-w-2xl flex-col justify-center px-4">
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <EmptyState
          icon={Sparkles}
          title={t("onboarding.title")}
          hint={t("onboarding.subtitle")}
          action={
            <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {teslaLive ? (
                <>
                  {/* Live integration on: real Tesla connect leads. */}
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <Link href="/connect/tesla">
                      <Zap className="size-4" />
                      {t("onboarding.cta_primary")}
                    </Link>
                  </Button>
                  <AddVehicleModal
                    trigger={
                      <Button variant="outline" size="lg" className="w-full sm:w-auto">
                        <Plus className="size-4" />
                        {t("onboarding.cta_secondary")}
                      </Button>
                    }
                  />
                </>
              ) : (
                // Demo-first default: the Tesla connect flow is a dead end without
                // the live integration, so the demo vehicle is the primary CTA.
                <AddVehicleModal
                  trigger={
                    <Button size="lg" className="w-full sm:w-auto">
                      <Plus className="size-4" />
                      {t("onboarding.cta_secondary")}
                    </Button>
                  }
                />
              )}
            </div>
          }
        />
      </motion.div>
    </PageWrapper>
  );
}
