"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { FeatureGate } from "@/components/layout/FeatureGate";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { PriceCurveChart } from "@/components/energy/PriceCurveChart";
import { SmartChargeCard } from "@/components/energy/SmartChargeCard";
import { DepartureCard } from "@/components/vehicle/DepartureCard";
import { apiFetch } from "@/lib/api-fetch";
import { cardVariants } from "@/lib/animations/variants";
import type { TariffForecast } from "@/lib/external/tariffs/types";

interface TariffResponse extends TariffForecast {
  providerId: string;
  providerName: string;
}

interface SettingsResponse {
  activeProvider: string;
  providers: { id: string; displayName: string }[];
}

interface VehicleItem {
  id: string;
}

export function EnergyClient() {
  const t = useTranslations("energy");
  const qc = useQueryClient();
  const [departureOpen, setDepartureOpen] = useState(false);

  const {
    data: forecast,
    isLoading: fLoading,
    refetch,
  } = useQuery({
    queryKey: ["tariff-prices"],
    queryFn: () => apiFetch<TariffResponse>("/api/tariffs/prices"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings, isLoading: sLoading } = useQuery({
    queryKey: ["tariff-settings"],
    queryFn: () => apiFetch<SettingsResponse>("/api/tariffs/settings"),
    staleTime: 60 * 1000,
  });

  const switchMutation = useMutation({
    mutationFn: (providerId: string) =>
      apiFetch<SettingsResponse>("/api/tariffs/settings", {
        method: "PUT",
        body: JSON.stringify({ providerId }),
      }),
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

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => apiFetch<VehicleItem[]>("/api/vehicles"),
    staleTime: 60_000,
  });

  const currentHour = new Date().getHours();
  const currentPrice = forecast?.currentPrice;
  const firstVehicleId = vehicles?.[0]?.id;

  return (
    <FeatureGate capability="TARIFF">
      <PageWrapper className="mx-auto max-w-2xl">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("page_title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("page_subtitle")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={fLoading}
            className="shrink-0"
          >
            <RefreshCw
              className={`size-4 ${fLoading ? "animate-spin" : ""}`}
            />
            <span className="sr-only">{t("refresh")}</span>
          </Button>
        </div>

        {/* Smart charge hero card — most prominent element */}
        <SmartChargeCard forecast={forecast ?? null} isLoading={fLoading} />

        {/* 24-hour price chart */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-5" animate={false}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {t("price_curve_title")}
                {forecast && (
                  <span className="ml-2 font-normal text-muted-foreground/60">
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
              <div className="h-40 animate-pulse rounded-xl bg-white/5" />
            ) : (
              <PriceCurveChart
                prices={forecast.prices}
                currentHour={currentHour}
                cheapestWindowStart={forecast.cheapestWindowStart}
                cheapestWindowEnd={forecast.cheapestWindowEnd}
              />
            )}
          </GlassCard>
        </motion.div>

        {/* Cheapest window summary */}
        {forecast && (
          <motion.div variants={cardVariants}>
            <GlassCard className="p-4" animate={false}>
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-chart-2/15">
                  <Zap className="size-4 text-chart-2" />
                </div>
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
                    {(
                      (forecast.currentPrice - forecast.cheapestAvgPrice) *
                      100
                    ).toFixed(1)}{" "}
                    ct/kWh {t("cheapest_window_saves")}
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Tariff provider selector */}
        <motion.div variants={cardVariants}>
          <GlassCard className="p-4" animate={false}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("tariff_provider_label")}
            </p>
            {sLoading ? (
              <div className="h-9 animate-pulse rounded-xl bg-white/5" />
            ) : (
              <select
                className="w-full rounded-xl border border-white/8 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            )}
          </GlassCard>
        </motion.div>

        {/* Departure & Preconditioning — collapsible */}
        <motion.div variants={cardVariants}>
          <GlassCard className="overflow-hidden" animate={false}>
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
                  <div className="border-t border-white/8 px-4 pb-4 pt-3">
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
          </GlassCard>
        </motion.div>

      </PageWrapper>
    </FeatureGate>
  );
}
