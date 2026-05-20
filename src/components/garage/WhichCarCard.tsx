"use client";

import { useState, type ChangeEvent } from "react";
import { Car, Trophy } from "lucide-react";
import { useQueries } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-fetch";
import { getModelSpec } from "@/lib/brands/models";
import type { VehicleListItem } from "@/hooks/useVehicles";
import type { VehicleState } from "@/types/vehicle";
import type { BrandKey } from "@/lib/brands/types";
import { cn } from "@/lib/utils";

function useVehicleStates(vehicles: VehicleListItem[]): (VehicleState | null)[] {
  const queries = useQueries({
    queries: vehicles.map((v) => ({
      queryKey: ["vehicle-state", v.id],
      queryFn: () => apiFetch<VehicleState>(`/api/vehicles/${v.id}/state`),
      staleTime: 30_000,
    })),
  });
  return queries.map((q: { data?: VehicleState }) => q.data ?? null);
}

interface Ranked {
  vehicle: VehicleListItem;
  rangeKm: number;
  stopsNeeded: number;
  verdict: string;
}

function rank(vehicles: VehicleListItem[], states: (VehicleState | null)[], distKm: number): Ranked[] {
  return vehicles
    .map((v, i) => {
      const state = states[i];
      const spec = getModelSpec(v.brand as BrandKey, v.model);
      const rangeKm = state?.batteryRangeKm ?? 0;
      const stopsNeeded = rangeKm >= distKm ? 0 : Math.ceil((distKm - rangeKm) / (spec.batteryCapacityKwh / spec.efficiencyKwhPer100km * 100 * 0.8));
      const verdict =
        rangeKm === 0
          ? "No range data"
          : rangeKm >= distKm
            ? "No charging stop needed"
            : stopsNeeded === 1
              ? "1 charging stop"
              : `${stopsNeeded} charging stops`;
      return { vehicle: v, rangeKm, stopsNeeded, verdict };
    })
    .sort((a, b) => a.stopsNeeded - b.stopsNeeded || b.rangeKm - a.rangeKm);
}

const PRESETS = [50, 120, 300, 600];

interface WhichCarCardProps {
  vehicles: VehicleListItem[];
}

export function WhichCarCard({ vehicles }: WhichCarCardProps) {
  const [distKm, setDistKm] = useState(120);
  const [custom, setCustom] = useState("");
  const states = useVehicleStates(vehicles);
  const ranked = rank(vehicles, states, distKm);

  if (vehicles.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          <Car className="size-3.5" />
          Which car?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Distance picker */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((d) => (
            <button
              key={d}
              onClick={() => { setDistKm(d); setCustom(""); }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                distKm === d && custom === ""
                  ? "bg-primary text-primary-foreground"
                  : "border hover:bg-muted",
              )}
            >
              {d} km
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              placeholder="Custom km"
              value={custom}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setCustom(e.target.value);
                const n = parseInt(e.target.value);
                if (n > 0) setDistKm(n);
              }}
              className="w-24 rounded-md border bg-background px-2 py-1 text-xs"
            />
          </div>
        </div>

        {/* Rankings */}
        <div className="space-y-2">
          {ranked.map((r, i) => (
            <div
              key={r.vehicle.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3",
                i === 0 && "border-chart-2/40 bg-chart-2/5",
              )}
            >
              <div className="flex size-6 shrink-0 items-center justify-center">
                {i === 0 ? (
                  <Trophy className="size-4 text-chart-2" />
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground">#{i + 1}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {r.vehicle.nickname ?? r.vehicle.displayName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.rangeKm > 0 ? `${Math.round(r.rangeKm)} km range · ` : ""}{r.verdict}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
