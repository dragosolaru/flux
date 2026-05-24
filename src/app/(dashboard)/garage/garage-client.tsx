"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PlusCircle, Sparkles, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";

import { AddVehicleModal } from "@/components/onboarding/AddVehicleModal";
import { Button } from "@/components/ui/button";
import { FleetTotalsCard } from "@/components/garage/FleetTotalsCard";
import { WhichCarCard } from "@/components/garage/WhichCarCard";
import { VehicleListCard } from "@/components/vehicle/VehicleListCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useVehicles, type VehicleListItem } from "@/hooks/useVehicles";
import { apiFetch } from "@/lib/api-fetch";
import { cardVariants, floatLoop, pageVariants, staggerContainer } from "@/lib/animations/variants";
import type { TariffForecast } from "@/lib/external/tariffs/types";

interface TariffResponse extends TariffForecast {
  providerId: string;
  providerName: string;
}

export function GarageClient() {
  const t = useTranslations();
  const { data: vehicles, isLoading } = useVehicles();
  const { data: caps } = useCapabilities();

  const { data: tariff } = useQuery({
    queryKey: ["tariff-prices"],
    queryFn: () => apiFetch<TariffResponse>("/api/tariffs/prices"),
    staleTime: 5 * 60 * 1000,
    // Only fetch when a real (non-mock) tariff is configured.
    enabled: Boolean(caps?.hasTariff),
  });

  // First-visit onboarding hero — no vehicles at all
  if (!isLoading && vehicles && vehicles.length === 0) {
    return <OnboardingHero />;
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-3xl"
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("garage.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {vehicles?.length
              ? `${vehicles.length} ${vehicles.length === 1 ? "vehicle" : "vehicles"}`
              : t("common.loading")}
          </p>
        </div>
        <AddVehicleModal />
      </div>

      {/* Cheapest tariff hint — only when user has a real tariff configured */}
      {caps?.hasTariff && tariff && tariff.cheapestAvgPrice < tariff.currentPrice && (
        <motion.div
          variants={cardVariants}
          className="mb-4 flex items-center gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 px-3 py-2 text-sm text-chart-2"
        >
          <Zap className="size-3.5 shrink-0" />
          <span>
            Cheapest plug-in:{" "}
            <strong>
              {String(tariff.cheapestWindowStart).padStart(2, "0")}:00
              {" – "}
              {String(tariff.cheapestWindowEnd).padStart(2, "0")}:00
            </strong>
            {" · "}save {((tariff.currentPrice - tariff.cheapestAvgPrice) * 100).toFixed(1)} ct/kWh vs now
          </span>
        </motion.div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          <div className="space-y-3">
            {vehicles?.map((v: VehicleListItem) => (
              <motion.div key={v.id} variants={cardVariants}>
                <VehicleListCard vehicle={v} />
              </motion.div>
            ))}
          </div>
          <motion.div variants={cardVariants} className="grid gap-4 lg:grid-cols-2">
            <FleetTotalsCard vehicles={vehicles ?? []} />
            <WhichCarCard vehicles={vehicles ?? []} />
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

function OnboardingHero() {
  const t = useTranslations();

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-16 text-center sm:py-24"
    >
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
              <PlusCircle className="size-4" />
              {t("onboarding.cta_secondary")}
            </Button>
          }
        />
      </div>
    </motion.div>
  );
}
