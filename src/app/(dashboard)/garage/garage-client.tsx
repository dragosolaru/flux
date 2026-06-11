"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Sparkles, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AddVehicleModal } from "@/components/onboarding/AddVehicleModal";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleModelImage } from "@/components/vehicle/VehicleModelImage";
import { VehicleCardMenu } from "@/components/garage/VehicleCardMenu";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useVehicles, type VehicleListItem } from "@/hooks/useVehicles";
import { apiFetch } from "@/lib/api-fetch";
import { cardVariants, fadeInUp, floatLoop, staggerContainer } from "@/lib/animations/variants";
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
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} aspect-[16/7]`}
          style={{ minHeight: 0 }}
        >
          {/* Subtle border overlay */}
          <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/6" />

          {/* Content */}
          <div className="relative flex h-full flex-col justify-between p-5">
            {/* Top row: name + demo badge */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold leading-tight tracking-tight">
                  {displayName}
                </h2>
                {subtitle && (
                  <p className="mt-0.5 text-sm text-white/60">{subtitle}</p>
                )}
              </div>
              {vehicle.dataSource === "mock" && (
                <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/60">
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
            <p className="text-xs text-white/35">{tg("tap_to_open")}</p>
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
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-full aspect-[16/7] rounded-3xl border-2 border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/25 transition-colors flex flex-col items-center justify-center gap-2"
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

export function GarageClient() {
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
    return <OnboardingHero />;
  }

  const count = vehicles?.length ?? 0;
  const countLabel =
    count === 1 ? tg("vehicles_count_one") : tg("vehicles_count_other", { count });

  return (
    <PageWrapper className="mx-auto max-w-xl gap-4 px-0">
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        className="flex items-center justify-between px-1"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tg("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "…" : countLabel}
          </p>
        </div>
      </motion.div>

      {/* Tariff hint */}
      {caps?.hasTariff && tariff && tariff.cheapestAvgPrice < tariff.currentPrice && (
        <GlassCard animate={false} className="flex items-center gap-2 px-3 py-2 text-sm text-chart-2 border-white/6 bg-white/[0.03]">
          <Zap className="size-3.5 shrink-0" />
          <span>
            {tg("tariff_hint_cheapest")}{" "}
            <strong>
              {String(tariff.cheapestWindowStart).padStart(2, "0")}:00
              {" – "}
              {String(tariff.cheapestWindowEnd).padStart(2, "0")}:00
            </strong>
            {" · "}{tg("tariff_hint_save")}{" "}
            {((tariff.currentPrice - tariff.cheapestAvgPrice) * 100).toFixed(1)} {tg("tariff_hint_unit")}
          </span>
        </GlassCard>
      )}

      {/* Vehicle list */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[16/7] w-full rounded-3xl" />
          ))}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-4"
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

function OnboardingHero() {
  const t = useTranslations();

  return (
    <PageWrapper className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-16 text-center sm:py-24">
      <motion.div
        animate={floatLoop.animate}
        transition={floatLoop.transition}
        className="mb-8 flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500/20 via-violet-500/20 to-fuchsia-500/20 ring-1 ring-indigo-500/20"
      >
        <Sparkles className="size-10 text-indigo-300" />
      </motion.div>

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("onboarding.title")}
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
        {t("onboarding.subtitle")}
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
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
      </div>
    </PageWrapper>
  );
}
