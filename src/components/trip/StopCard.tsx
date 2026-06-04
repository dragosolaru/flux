"use client";

import { Zap, Clock, MapPin, Thermometer } from "lucide-react";
import { useTranslations } from "next-intl";

// A stop benefits from battery preconditioning when it's a DC fast charger
// (warming the pack before a fast charge cuts charge time). Tesla does this
// automatically when navigating to a Supercharger; other networks are a manual
// recommendation surfaced here.
const PRECONDITION_MIN_KW = 50;

export function needsPreconditioning(maxKw: number): boolean {
  return maxKw >= PRECONDITION_MIN_KW;
}

export function isSuperchargerNetwork(networkId: string): boolean {
  return networkId === "tesla-sc";
}

interface StopCardProps {
  stop: {
    station: {
      name: string;
      networkId: string;
      lat: number;
      lng: number;
      priceEurKwh: number | null;
      maxKw: number;
    };
    arriveSoc: number;
    departSoc: number;
    energyAddedKwh: number;
    chargingMinutes: number;
    costEur: number;
    distanceFromStartKm: number;
  };
  index: number;
  /** True when the app auto-sent a precondition_max command for this stop. */
  preconditioned?: boolean;
}

export function StopCard({ stop, index, preconditioned = false }: StopCardProps) {
  const t = useTranslations("trip");
  const { station, arriveSoc, departSoc, energyAddedKwh, chargingMinutes, costEur, distanceFromStartKm } = stop;
  const precondition = needsPreconditioning(station.maxKw);
  // Treat as auto when it's a Supercharger OR the app already sent precondition_max.
  const autoPrecondition = isSuperchargerNetwork(station.networkId) || preconditioned;

  return (
    <div className="flex gap-3 rounded-xl border border-white/8 bg-white/5 p-3 backdrop-blur-sm">
      {/* Step number */}
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/80 text-xs font-bold text-white">
        {index + 1}
      </div>

      <div className="min-w-0 flex-1">
        {/* Station header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{station.name}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-muted-foreground">
                {station.networkId}
              </span>
              <span className="text-xs text-muted-foreground">{station.maxKw} kW</span>
            </div>
          </div>
          <span className="shrink-0 text-sm font-semibold text-green-400">€{costEur.toFixed(2)}</span>
        </div>

        {/* Stats row */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {/* Battery range */}
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-sm bg-amber-400/80" />
            {arriveSoc}% → {departSoc}%
          </span>

          <span className="flex items-center gap-1">
            <Zap className="size-3" />
            {energyAddedKwh.toFixed(1)} kWh
          </span>

          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {chargingMinutes} min
          </span>

          <span className="flex items-center gap-1">
            <MapPin className="size-3" />
            km {distanceFromStartKm}
          </span>
        </div>

        {/* Battery preconditioning hint for fast-charging stops */}
        {precondition && (
          <div
            className={`mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${
              autoPrecondition
                ? "bg-blue-500/15 text-blue-300"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            <Thermometer className="size-3" />
            {autoPrecondition ? t("precondition_auto") : t("precondition_manual")}
          </div>
        )}
      </div>
    </div>
  );
}
