"use client";

import { useState } from "react";
import { AlertTriangle, Fuel } from "lucide-react";
import { useTranslations } from "next-intl";
import { getFuelComparison, setFuelComparison } from "@/lib/fuel-comparison";
import { useCurrency } from "@/hooks/useCurrency";

interface CostSummaryProps {
  origin: string;
  destination: string;
  totalDistanceKm: number;
  drivingMinutes: number;
  chargingMinutes: number;
  // Total energy consumed over the route + its cost at home price. These are
  // non-zero even when no charging stop is needed — driving is never free.
  tripEnergyKwh: number;
  tripEnergyCostEur: number;
  stopsCount: number;
  approxRoute: boolean;
  // Live-traffic delay already included in drivingMinutes (TomTom). 0 = none.
  trafficDelayMinutes?: number;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function CostSummary({
  origin,
  destination,
  totalDistanceKm,
  drivingMinutes,
  chargingMinutes,
  tripEnergyKwh,
  tripEnergyCostEur,
  stopsCount,
  approxRoute,
  trafficDelayMinutes = 0,
}: CostSummaryProps) {
  const t = useTranslations("trip");
  const { fromEUR } = useCurrency();
  const [showFuel, setShowFuel] = useState(false);
  const [fuel, setFuel] = useState(getFuelComparison);

  function updateFuel(patch: Partial<typeof fuel>): void {
    const next = { ...fuel, ...patch };
    setFuel(next);
    setFuelComparison(next);
  }

  const totalMinutes = drivingMinutes + chargingMinutes;
  const petrolCostEur = (totalDistanceKm / 100) * fuel.lPer100km * fuel.priceEurL;
  const savingsEur = petrolCostEur - tripEnergyCostEur;

  const stopsLabel =
    stopsCount === 0
      ? t("stops_count_zero")
      : stopsCount === 1
        ? t("stops_count_one")
        : t("stops_count_other", { count: stopsCount });

  return (
    <div className="space-y-1.5">
      {/* Route header — compact single line */}
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="truncate text-sm font-semibold leading-tight">
          {origin} → {destination}
        </h2>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDuration(totalMinutes)} · {Math.round(totalDistanceKm)} km
        </span>
      </div>

      {/* Live-traffic note — only when a traffic-aware provider reported a delay */}
      {trafficDelayMinutes > 0 && (
        <p className="text-xs text-amber-400">
          {t("traffic_delay", { minutes: trafficDelayMinutes })}
        </p>
      )}

      {/* Stats chips + fuel toggle on one line */}
      <div className="flex items-center gap-1 text-xs">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          <span className="rounded-full border border-white/8 bg-white/5 px-2 py-0.5 font-medium">
            {stopsLabel}
          </span>
          <span className="rounded-full border border-white/8 bg-white/5 px-2 py-0.5 font-medium">
            {tripEnergyKwh.toFixed(1)} kWh
          </span>
          <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 font-medium text-green-400">
            {fromEUR(tripEnergyCostEur)}
          </span>
          {chargingMinutes > 0 && (
            <span className="rounded-full border border-white/8 bg-white/5 px-2 py-0.5 font-medium">
              {t("charging_time_label", { duration: formatDuration(chargingMinutes) })}
            </span>
          )}
        </div>
        {/* Fuel toggle as icon-only button at end of row */}
        <button
          onClick={() => setShowFuel((v) => !v)}
          title={t("fuel_comparison")}
          aria-label={t("fuel_comparison")}
          aria-pressed={showFuel}
          className={`shrink-0 rounded-full p-2.5 transition-colors ${showFuel ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
        >
          <Fuel className="size-3.5" />
        </button>
      </div>

      {/* Approx route warning */}
      {approxRoute && (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
          <AlertTriangle className="size-3 shrink-0" />
          {t("approx_route_warning")}
        </div>
      )}

      {showFuel && (
        <div className="space-y-1.5 rounded-xl border border-white/8 bg-white/5 p-3 text-sm backdrop-blur-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("ev_cost_label")}</span>
            <span className="font-medium text-green-400">{fromEUR(tripEnergyCostEur)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("petrol_label", {
                lPer100km: fuel.lPer100km,
                pricePerL: fuel.priceEurL,
              })}
            </span>
            <span className="font-medium">{fromEUR(petrolCostEur)}</span>
          </div>
          <div className="h-px bg-white/8" />
          <div className="flex justify-between font-semibold">
            <span>{t("savings_label")}</span>
            <span className="text-green-400">{fromEUR(savingsEur)}</span>
          </div>

          <div className="h-px bg-white/8" />
          <p className="text-xs text-muted-foreground">{t("fuel.edit")}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("fuel.consumption")}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={fuel.lPer100km}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n) && n > 0) updateFuel({ lPer100km: n });
                }}
                className="w-16 rounded border border-white/8 bg-transparent px-2 py-1 text-sm"
                aria-label={t("fuel.consumption")}
              />
              <span className="text-muted-foreground">{t("fuel.per_100km")}</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("fuel.price")}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={fuel.priceEurL}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n) && n > 0) updateFuel({ priceEurL: n });
                }}
                className="w-16 rounded border border-white/8 bg-transparent px-2 py-1 text-sm"
                aria-label={t("fuel.price")}
              />
              <span className="text-muted-foreground">{t("fuel.per_liter")}</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
