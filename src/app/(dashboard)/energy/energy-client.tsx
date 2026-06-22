"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { FeatureGate } from "@/components/layout/FeatureGate";
import { PriceCurveChart } from "@/components/energy/PriceCurveChart";
import { SmartChargeCard } from "@/components/energy/SmartChargeCard";
import { DepartureCard } from "@/components/vehicle/DepartureCard";
import * as tariffsApi from "@/lib/api/tariffs";
import { useVehicleContext } from "@/contexts/vehicle";
import { cardVariants, pageVariants } from "@/lib/animations/variants";
import { Card, PageHeader } from "@/components/ui-kit";
import type { TariffForecast } from "@/lib/external/tariffs/types";

interface TariffResponse extends TariffForecast {
  providerId: string;
  providerName: string;
}

interface SettingsResponse {
  activeProvider: string;
  providers: { id: string; displayName: string }[];
}

export function EnergyClient() {
  const t = useTranslations("energy");
  const qc = useQueryClient();
  const [departureOpen, setDepartureOpen] = useState(false);
  const { selectedVehicleId } = useVehicleContext();

  const {
    data: forecast,
    isLoading: fLoading,
    refetch,
  } = useQuery({
    queryKey: ["tariff-prices"],
    queryFn: () => tariffsApi.prices<TariffResponse>(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings, isLoading: sLoading } = useQuery({
    queryKey: ["tariff-settings"],
    queryFn: () => tariffsApi.settings<SettingsResponse>(),
    staleTime: 60 * 1000,
  });

  const switchMutation = useMutation({
    mutationFn: (providerId: string) =>
      tariffsApi.updateSettings<SettingsResponse>(providerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tariff-settings"] });
      qc.invalidateQueries({ queryKey: ["tariff-prices"] });
    },
  });

  const handleProviderChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      switchMutation.mutate(e.target.value);
    },
    [switchMutation],
  );

  const currentHour = new Date().getHours();
  const currentPrice = forecast?.currentPrice;
  const firstVehicleId = selectedVehicleId;

  return (
    <FeatureGate capability="TARIFF">
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-2xl px-4 pb-6 space-y-4"
      >
        {/* Page header */}
        <PageHeader
          title={t("page_title")}
          subtitle={t("page_subtitle")}
          trailing={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={fLoading}
            >
              <RefreshCw
                className={`size-4 ${fLoading ? "animate-spin" : ""}`}
              />
              <span className="sr-only">{t("refresh")}</span>
            </Button>
          }
        />

        {/* Smart charge hero card — most prominent element */}
        <SmartChargeCard forecast={forecast ?? null} isLoading={fLoading} />

        {/* 24-hour price chart */}
        <motion.div variants={cardVariants}>
          <Card variant="surface" className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {t("price_curve_title")}
                {forecast && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    · {forecast.providerName}
                  </span>
                )}
              </h2>
              {currentPrice != null && (
                <div className="flex items-end gap-1">
                  <span className="text-xl font-semibold tabular-nums">
                    {(currentPrice * 100).toFixed(1)}
                  </span>
                  <span className="mb-0.5 text-xs text-muted-foreground">
                    ct/kWh
                  </span>
                </div>
              )}
            </div>

            {fLoading || !forecast ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : (
              <PriceCurveChart
                prices={forecast.prices}
                currentHour={currentHour}
                cheapestWindowStart={forecast.cheapestWindowStart}
                cheapestWindowEnd={forecast.cheapestWindowEnd}
              />
            )}
          </Card>
        </motion.div>

        {/* Cheapest window summary */}
        {forecast && (
          <motion.div variants={cardVariants}>
            <Card variant="surface" className="p-4">
              <div className="flex items-center gap-3">
                <Zap className="size-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {t("cheapest_window_label")}:{" "}
                    <span className="text-chart-2">
                      {String(forecast.cheapestWindowStart).padStart(2, "0")}
                      :00
                      {" – "}
                      {String(forecast.cheapestWindowEnd).padStart(2, "0")}:00
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("avg_label")}{" "}
                    {(forecast.cheapestAvgPrice * 100).toFixed(1)} ct/kWh ·{" "}
                    {Math.max(
                      0,
                      (forecast.currentPrice - forecast.cheapestAvgPrice) * 100,
                    ).toFixed(1)}{" "}
                    ct/kWh {t("cheapest_window_saves")}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Tariff provider selector */}
        <motion.div variants={cardVariants}>
          <Card variant="surface" className="p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("tariff_provider_label")}
            </p>
            {sLoading ? (
              <div className="h-9 animate-pulse rounded-xl bg-muted" />
            ) : (
              <div className="relative">
                <select
                  aria-label={t("tariff_provider_label")}
                  className="w-full appearance-none rounded-xl border border-border bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={settings?.activeProvider ?? ""}
                  onChange={handleProviderChange}
                  disabled={switchMutation.isPending}
                >
                  {settings?.providers.map(
                    (p: { id: string; displayName: string }) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ),
                  )}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            )}
          </Card>
        </motion.div>

        {/* Departure & Preconditioning — collapsible */}
        <motion.div variants={cardVariants}>
          <Card variant="surface" className="overflow-hidden">
            <button
              className="flex w-full items-center justify-between p-4 text-left"
              onClick={() => setDepartureOpen((v) => !v)}
            >
              <span className="text-sm font-semibold">
                {t("departure_card_title")}
              </span>
              {departureOpen ? (
                <ChevronUp className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )}
            </button>

            <AnimatePresence initial={false}>
              {departureOpen && (
                <motion.div
                  key="departure-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    {firstVehicleId ? (
                      <DepartureCard vehicleId={firstVehicleId} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("no_recommendation")}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>
      </motion.div>
    </FeatureGate>
  );
}
