"use client";

import { useState } from "react";
import { AlertTriangle, Fuel, ChevronDown, ChevronUp } from "lucide-react";

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
  const [showFuel, setShowFuel] = useState(false);

  const totalMinutes = drivingMinutes + chargingMinutes;
  const petrolCostEur = (totalDistanceKm / 100) * PETROL_L_PER_100KM * PETROL_PRICE_EUR_L;
  const savingsEur = petrolCostEur - totalChargingCostEur;

  return (
    <div className="space-y-2">
      {/* Route header */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Traseu planificat</p>
        <h2 className="text-base font-semibold leading-tight">
          {origin} → {destination}
        </h2>
        <p className="text-sm text-muted-foreground">
          {formatDuration(totalMinutes)} total · {Math.round(totalDistanceKm)} km
        </p>
      </div>

      {/* Stats chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
          {stopsCount === 0 ? "Fără opriri" : `${stopsCount} ${stopsCount === 1 ? "oprire" : "opriri"}`}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
          {totalEnergyKwh.toFixed(1)} kWh
        </span>
        <span className="rounded-full bg-green-100 px-2.5 py-1 font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          €{totalChargingCostEur.toFixed(2)} cost încărcare
        </span>
        {chargingMinutes > 0 && (
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
            +{formatDuration(chargingMinutes)} încărcare
          </span>
        )}
      </div>

      {/* Approx route warning */}
      {approxRoute && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          Rută aproximativă — OSRM indisponibil momentan
        </div>
      )}

      {/* Fuel comparison toggle */}
      <button
        onClick={() => setShowFuel((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Fuel className="size-3.5" />
        Cât ar costa cu benzină?
        {showFuel ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>

      {showFuel && (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cost EV (încărcare)</span>
            <span className="font-medium text-green-600">€{totalChargingCostEur.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Benzină ({PETROL_L_PER_100KM}L/100km × €{PETROL_PRICE_EUR_L}/L)
            </span>
            <span className="font-medium">€{petrolCostEur.toFixed(2)}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between font-semibold">
            <span>Economii</span>
            <span className="text-green-600">€{savingsEur.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
