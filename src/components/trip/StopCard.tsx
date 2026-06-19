"use client";

import { Thermometer } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReliabilityBadge } from "./ReliabilityBadge";
import { useCurrency } from "@/hooks/useCurrency";

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
      isOperational?: boolean;
      lastVerifiedAt?: string;
    };
    arriveSoc: number;
    departSoc: number;
    energyAddedKwh: number;
    chargingMinutes: number;
    costEur: number;
    distanceFromStartKm: number;
  };
  index: number;
  preconditioned?: boolean;
}

export function StopCard({ stop, index, preconditioned = false }: StopCardProps) {
  const t = useTranslations("trip");
  const { fromEUR } = useCurrency();
  const { station, arriveSoc, departSoc, energyAddedKwh, chargingMinutes, costEur, distanceFromStartKm } = stop;
  const precondition = needsPreconditioning(station.maxKw);
  const autoPrecondition = isSuperchargerNetwork(station.networkId) || preconditioned;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-2.5 py-2 backdrop-blur-sm">
      {/* Step number */}
      <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-500/80 text-[9px] font-bold text-white">
        {index + 1}
      </div>

      <div className="min-w-0 flex-1">
        {/* Row 1: name + cost */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium leading-tight">{station.name}</p>
          <span className="shrink-0 text-sm font-semibold text-green-400">{fromEUR(costEur)}</span>
        </div>

        {/* Row 2: all stats in one line */}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <span className="rounded border border-border bg-muted/40 px-1 py-0.5 text-[11px]">{station.networkId}</span>
          <span>{station.maxKw} kW</span>
          <span>{arriveSoc}%→{departSoc}%</span>
          <span>{energyAddedKwh.toFixed(1)} kWh</span>
          <span>{chargingMinutes} min</span>
          <span>km {Math.round(distanceFromStartKm)}</span>
          <ReliabilityBadge station={station} />
        </div>

        {/* Row 3 (conditional): preconditioning badge */}
        {precondition && (
          <div
            className={`mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
              autoPrecondition ? "bg-blue-500/15 text-blue-300" : "bg-amber-500/15 text-amber-300"
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
