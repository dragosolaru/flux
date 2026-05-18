"use client";

import { useState } from "react";
import { MapPin, Route } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TripPlanResult } from "@/components/trip/TripPlanResult";
import { TripComparison } from "@/components/trip/TripComparison";
import { apiFetch } from "@/lib/api-fetch";
import { CITIES } from "@/lib/external/routing/cities";
import type { VehicleListItem } from "@/hooks/useVehicles";

export function TripClient() {
  const [vehicleId, setVehicleId] = useState<string>("");
  const [destinationIdx, setDestinationIdx] = useState<number>(-1);
  const [planTrigger, setPlanTrigger] = useState(0);
  const [comparing, setComparing] = useState(false);

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => apiFetch<VehicleListItem[]>("/api/vehicles"),
    staleTime: 60_000,
  });

  const destination = destinationIdx >= 0 ? CITIES[destinationIdx] : null;
  const canPlan = vehicleId && destination;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trip Planner</h1>
        <p className="text-sm text-muted-foreground">
          Plan a trip with automatic charging stops based on your vehicle&apos;s range and weather.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Trip details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="vehicle" className="mb-1 block text-xs font-medium text-muted-foreground">
              Vehicle
            </label>
            <select
              id="vehicle"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a vehicle…</option>
              {vehicles?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nickname ?? v.displayName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="destination" className="mb-1 block text-xs font-medium text-muted-foreground">
              Destination
            </label>
            <select
              id="destination"
              value={destinationIdx}
              onChange={(e) => setDestinationIdx(Number(e.target.value))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value={-1}>Select a city…</option>
              {CITIES.map((c, i) => (
                <option key={c.name + c.country} value={i}>
                  {c.name}, {c.country}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button
              onClick={() => { setPlanTrigger(planTrigger + 1); setComparing(false); }}
              disabled={!canPlan}
            >
              <Route className="size-4" />
              Plan trip
            </Button>
            <Button
              variant="outline"
              onClick={() => { setPlanTrigger(planTrigger + 1); setComparing(true); }}
              disabled={!destination || !vehicles || vehicles.length < 2}
            >
              <MapPin className="size-4" />
              Compare all vehicles
            </Button>
          </div>
        </CardContent>
      </Card>

      {planTrigger > 0 && destination && (
        comparing && vehicles ? (
          <TripComparison
            destination={destination}
            vehicles={vehicles}
            key={`compare-${planTrigger}`}
          />
        ) : vehicleId && destination ? (
          <TripPlanResult
            vehicleId={vehicleId}
            destination={destination}
            key={`single-${planTrigger}`}
          />
        ) : null
      )}
    </div>
  );
}
