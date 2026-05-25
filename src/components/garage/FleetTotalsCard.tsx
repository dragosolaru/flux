"use client";

import type { ComponentType } from "react";
import { BatteryCharging, Leaf, MapPin, Zap } from "lucide-react";
import { useQueries } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-fetch";
import type { VehicleListItem } from "@/hooks/useVehicles";
import type { VehicleState } from "@/types/vehicle";

// kWh per 100km for average ICE (petrol) → CO₂: ~2.31 kg/litre, ~8 l/100km
const ICE_CO2_KG_PER_100KM = 0.184; // kg CO₂ per km
const EV_CO2_KG_PER_KWH = 0.04;     // EU average grid ~400g CO₂/kWh → per km

function StatRow({ icon: Icon, label, value, note }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-semibold tabular-nums">{value}</div>
        {note && <div className="text-[10px] text-muted-foreground/60">{note}</div>}
      </div>
    </div>
  );
}

interface FleetTotalsCardProps {
  vehicles: VehicleListItem[];
}

export function FleetTotalsCard({ vehicles }: FleetTotalsCardProps) {
  // useQueries: variable-length parallel queries — Rules-of-Hooks safe
  const stateQueries = useQueries({
    queries: vehicles.map((v) => ({
      queryKey: ["vehicle-state", v.id],
      queryFn: () => apiFetch<VehicleState>(`/api/vehicles/${v.id}/state`),
      staleTime: 30_000,
    })),
  });

  const states = stateQueries.map((q: { data?: VehicleState }) => q.data ?? null);
  const loadedCount = states.filter(Boolean).length;
  const isAnyPending = stateQueries.some((q: { isPending: boolean }) => q.isPending);

  if (isAnyPending && loadedCount === 0) {
    return (
      <Card>
        <CardContent className="flex h-24 items-center justify-center">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (loadedCount === 0) {
    return (
      <Card>
        <CardContent className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          Fleet data unavailable
        </CardContent>
      </Card>
    );
  }

  // Combined available range
  const rangeStates = states.filter((s: VehicleState | null) => s?.batteryRangeKm != null);
  const totalRangeKm = rangeStates.reduce((sum: number, s: VehicleState | null) => sum + (s!.batteryRangeKm ?? 0), 0);
  const rangeNote =
    rangeStates.length < loadedCount
      ? `${loadedCount - rangeStates.length} vehicle(s) excluded (range not reported)`
      : undefined;

  // Odometer total (proxy for lifetime kWh/CO₂)
  const odometerStates = states.filter((s: VehicleState | null) => s?.odometerKm != null);
  const totalOdoKm = odometerStates.reduce((sum: number, s: VehicleState | null) => sum + (s!.odometerKm ?? 0), 0);

  // CO₂ saved vs ICE baseline over total odometer
  const co2SavedKg = totalOdoKm * ICE_CO2_KG_PER_100KM;

  // Average battery level
  const batteryStates = states.filter((s: VehicleState | null) => s?.batteryLevel != null);
  const avgBattery =
    batteryStates.length > 0
      ? Math.round(batteryStates.reduce((s: number, v: VehicleState | null) => s + (v!.batteryLevel ?? 0), 0) / batteryStates.length)
      : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Fleet totals
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <StatRow
          icon={MapPin}
          label="Combined range"
          value={`${Math.round(totalRangeKm).toLocaleString()} km`}
          note={rangeNote}
        />
        {avgBattery != null && (
          <StatRow
            icon={BatteryCharging}
            label="Avg battery"
            value={`${avgBattery}%`}
          />
        )}
        <StatRow
          icon={Zap}
          label="Total odometer"
          value={`${Math.round(totalOdoKm).toLocaleString()} km`}
        />
        <StatRow
          icon={Leaf}
          label="CO₂ saved vs ICE"
          value={`${co2SavedKg < 1000 ? co2SavedKg.toFixed(1) + " kg" : (co2SavedKg / 1000).toFixed(2) + " t"}`}
          note="vs 184g CO₂/km petrol baseline"
        />
      </CardContent>
    </Card>
  );
}
