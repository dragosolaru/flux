"use client";

import { Trophy } from "lucide-react";
import { useQueries } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";
import type { CityPreset, TripPlan } from "@/lib/external/routing/types";
import type { VehicleListItem } from "@/hooks/useVehicles";

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

interface TripComparisonProps {
  destination: CityPreset;
  vehicles: VehicleListItem[];
}

export function TripComparison({ destination, vehicles }: TripComparisonProps) {
  const queries = useQueries({
    queries: vehicles.map((v) => ({
      queryKey: ["trip-plan", v.id, destination.name],
      queryFn: () =>
        apiFetch<TripResponse>("/api/trip-plan", {
          method: "POST",
          body: JSON.stringify({
            vehicleId: v.id,
            destination: { lat: destination.lat, lng: destination.lng, label: destination.name },
          }),
        }),
      staleTime: 60_000,
    })),
  });

  const allDone = queries.every((q) => !q.isLoading);
  const ranked = queries
    .map((q, i) => ({ vehicle: vehicles[i]!, data: q.data, error: q.error }))
    .filter((r) => r.data?.plan.feasible)
    .sort((a, b) => (a.data!.plan.totalMinutes) - (b.data!.plan.totalMinutes));

  const infeasible = queries
    .map((q, i) => ({ vehicle: vehicles[i]!, data: q.data, error: q.error }))
    .filter((r) => r.error || !r.data?.plan.feasible);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Compare → {destination.name}, {destination.country}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ranked by total trip time (driving + charging)
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {!allDone && (
          <p className="text-sm text-muted-foreground">Planning trips for all vehicles…</p>
        )}

        {ranked.map((r, i) => {
          const p = r.data!.plan;
          return (
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
                <div className="font-medium">{r.vehicle.nickname ?? r.vehicle.displayName}</div>
                <div className="text-xs text-muted-foreground">
                  {formatHMin(p.totalMinutes)}
                  {" · "}{p.stops.length} {p.stops.length === 1 ? "stop" : "stops"}
                  {" · "}€{p.totalChargingCostEur.toFixed(2)}
                  {" · "}{p.totalDistanceKm.toFixed(0)} km
                </div>
              </div>
            </div>
          );
        })}

        {infeasible.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              {infeasible.length} vehicle(s) couldn&apos;t complete this trip
            </summary>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {infeasible.map((r) => (
                <div key={r.vehicle.id}>
                  <strong>{r.vehicle.nickname ?? r.vehicle.displayName}</strong>:{" "}
                  {r.error instanceof Error
                    ? r.error.message
                    : r.data?.plan.warning ?? "infeasible"}
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
