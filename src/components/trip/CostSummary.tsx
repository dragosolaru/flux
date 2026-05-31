"use client";

import { useState } from "react";
import { AlertTriangle, Fuel, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";

interface CostSummaryProps {
  origin: string;
  destination: string;
  totalDistanceKm: number;
  drivingMinutes: number;
  chargingMinutes: number;
  totalEnergyKwh: number;
  totalChargingCostEur: number;
  stopsCount: number;
  approxRoute: boolean;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

const PETROL_L_PER_100KM = 8;
const PETROL_PRICE_EUR_L = 1.65;

export function CostSummary({
  origin,
  destination,
  totalDistanceKm,
  drivingMinutes,
  chargingMinutes,
  totalEnergyKwh,
  totalChargingCostEur,
  stopsCount,
  approxRoute,
}: CostSummaryProps) {
  const t = useTranslations("trip");
  const [showFuel, setShowFuel] = useState(false);

  const totalMinutes = drivingMinutes + chargingMinutes;
  const petrolCostEur = (totalDistanceKm / 100) * PETROL_L_PER_100KM * PETROL_PRICE_EUR_L;
  const savingsEur = petrolCostEur - totalChargingCostEur;

  const stopsLabel =
    stopsCount === 0
      ? t("stops_count_zero")
      : stopsCount === 1
        ? t("stops_count_one")
        : t("stops_count_other", { count: stopsCount });

  return (
    <div className="space-y-2">
      {/* Route header */}
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("route_label")}</p>
        <h2 className="text-base font-semibold leading-tight">
          {origin} → {destination}
        </h2>
        <p className="text-sm text-muted-foreground">
          {formatDuration(totalMinutes)} total · {Math.round(totalDistanceKm)} km
        </p>
      </div>

      {/* Stats chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 font-medium">
          {stopsLabel}
        </span>
        <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 font-medium">
          {totalEnergyKwh.toFixed(1)} kWh
        </span>
        <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 font-medium text-green-400">
          €{totalChargingCostEur.toFixed(2)}
        </span>
        {chargingMinutes > 0 && (
          <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 font-medium">
            {t("charging_time_label", { duration: formatDuration(chargingMinutes) })}
          </span>
        )}
      </div>

      {/* Approx route warning */}
      {approxRoute && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 backdrop-blur-sm">
          <AlertTriangle className="size-3.5 shrink-0" />
          {t("approx_route_warning")}
        </div>
      )}

      {/* Fuel comparison toggle */}
      <button
        onClick={() => setShowFuel((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
      >
        <Fuel className="size-3.5" />
        {t("fuel_comparison")}
        {showFuel ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>

      {showFuel && (
        <div className="space-y-1.5 rounded-xl border border-white/8 bg-white/5 p-3 text-sm backdrop-blur-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("ev_cost_label")}</span>
            <span className="font-medium text-green-400">€{totalChargingCostEur.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("petrol_label", {
                lPer100km: PETROL_L_PER_100KM,
                pricePerL: PETROL_PRICE_EUR_L,
              })}
            </span>
            <span className="font-medium">€{petrolCostEur.toFixed(2)}</span>
          </div>
          <div className="h-px bg-white/8" />
          <div className="flex justify-between font-semibold">
            <span>{t("savings_label")}</span>
            <span className="text-green-400">€{savingsEur.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
