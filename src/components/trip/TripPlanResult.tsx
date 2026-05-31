"use client";

import { AlertCircle, Battery, Clock, Coins, Plug } from "lucide-react";
import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-fetch";
import type { CityPreset, ChargingStop, TripPlan } from "@/lib/external/routing/types";

interface TripResponse {
  plan: TripPlan;
  vehicle: { id: string; displayName: string; brand: string; model: string | null };
  deratingPct: number;
}

function formatHMin(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface TripPlanResultProps {
  vehicleId: string;
  destination: CityPreset;
}

export function TripPlanResult({ vehicleId, destination }: TripPlanResultProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["trip-plan", vehicleId, destination.name],
    queryFn: () =>
      apiFetch<TripResponse>("/api/trip-plan", {
        method: "POST",
        body: JSON.stringify({
          vehicleId,
          destination: { lat: destination.lat, lng: destination.lng, label: destination.name },
        }),
      }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center">
          <p className="text-sm text-muted-foreground">Planning trip…</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
          <AlertCircle className="size-4" />
          {error instanceof Error ? error.message : "Couldn't plan this trip"}
        </CardContent>
      </Card>
    );
  }

  const { plan, vehicle, deratingPct } = data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {vehicle.displayName} → {destination.name}, {destination.country}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {plan.totalDistanceKm.toFixed(0)} km
          {deratingPct < -0.5 && (
            <span className="ml-1">· range derated {deratingPct.toFixed(1)}% by weather</span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {plan.warning && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{plan.warning}</span>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={Clock} label="Total time" value={formatHMin(plan.totalMinutes)} sub={`Drive ${formatHMin(plan.drivingMinutes)}`} />
          <Stat icon={Plug} label="Stops" value={String(plan.stops.length)} sub={plan.stops.length === 0 ? "No charging" : `${formatHMin(plan.chargingMinutes)} charging`} />
          <Stat icon={Battery} label="Energy added" value={`${plan.totalEnergyKwh.toFixed(0)} kWh`} />
          <Stat icon={Coins} label="Charging cost" value={`€${plan.totalChargingCostEur.toFixed(2)}`} />
        </div>

        {/* Route waypoints */}
        <div className="space-y-2">
          <Waypoint label={plan.origin.label ?? "Start"} sub={`${plan.origin.lat.toFixed(2)}, ${plan.origin.lng.toFixed(2)}`} icon="origin" />
          {plan.stops.map((stop: ChargingStop, i: number) => (
            <Waypoint
              key={i}
              label={`${stop.station.name}`}
              sub={`Arrive ${stop.arriveSoc}% → Depart ${stop.departSoc}% · ${stop.chargingMinutes}m · €${stop.costEur.toFixed(2)} · ${stop.station.maxKw} kW`}
              icon="stop"
              distanceKm={stop.distanceFromStartKm}
            />
          ))}
          <Waypoint label={`${destination.name}, ${destination.country}`} sub="Destination" icon="destination" distanceKm={Math.round(plan.totalDistanceKm)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, sub }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Waypoint({ label, sub, icon, distanceKm }: {
  label: string;
  sub: string;
  icon: "origin" | "stop" | "destination";
  distanceKm?: number;
}) {
  const bg = icon === "origin" ? "bg-primary text-primary-foreground"
           : icon === "destination" ? "bg-chart-2 text-white"
           : "bg-amber-500 text-white";

  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${bg}`}>
        {icon === "origin" ? "A" : icon === "destination" ? "B" : <Plug className="size-3" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      {distanceKm != null && (
        <div className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {distanceKm} km
        </div>
      )}
    </div>
  );
}
