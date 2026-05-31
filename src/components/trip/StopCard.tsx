"use client";

import { Zap, Clock, MapPin } from "lucide-react";

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
}

export function StopCard({ stop, index }: StopCardProps) {
  const { station, arriveSoc, departSoc, energyAddedKwh, chargingMinutes, costEur, distanceFromStartKm } = stop;

  return (
    <div className="flex gap-3 rounded-xl border bg-card p-3">
      {/* Step number */}
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
        {index + 1}
      </div>

      <div className="min-w-0 flex-1">
        {/* Station header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{station.name}</p>
            <p className="text-xs text-muted-foreground">{station.networkId} · {station.maxKw} kW</p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-green-600">€{costEur.toFixed(2)}</span>
        </div>

        {/* Stats row */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {/* Battery arc */}
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-sm bg-amber-400" />
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
      </div>
    </div>
  );
}
