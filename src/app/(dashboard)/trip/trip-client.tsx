"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Route, Loader2, AlertCircle, Navigation } from "lucide-react";

import { GeocodingSearch, type GeoPoint } from "@/components/trip/GeocodingSearch";
import { StopCard } from "@/components/trip/StopCard";
import { CostSummary } from "@/components/trip/CostSummary";
import { apiFetch } from "@/lib/api-fetch";
import { useVehicles } from "@/hooks/useVehicles";
import type { TripPlan } from "@/lib/external/routing/types";

const TripMap = dynamic(() => import("@/components/trip/TripMap"), { ssr: false });

interface TripResponse {
  plan: TripPlan;
  vehicle: { id: string; displayName: string; brand: string; model: string | null } | null;
  deratingPct: number;
}

export function TripClient() {
  const { data: vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState<string>("");
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [startSoc, setStartSoc] = useState(80);
  const [plan, setPlan] = useState<TripResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const canPlan = origin !== null && destination !== null;

  async function handlePlan() {
    if (!canPlan) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<TripResponse>("/api/trip-plan", {
        method: "POST",
        body: JSON.stringify({
          ...(vehicleId ? { vehicleId } : {}),
          origin: { lat: origin.lat, lng: origin.lng, label: origin.name },
          startSoc,
          destination: { lat: destination.lat, lng: destination.lng, label: destination.name },
        }),
      });
      setPlan(result);
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu s-a putut planifica traseul.");
    } finally {
      setLoading(false);
    }
  }

  const stops = plan?.plan.stops.map((s) => ({
    lat: s.station.lat,
    lng: s.station.lng,
    name: s.station.name,
    network: s.station.networkId,
  })) ?? [];

  return (
    <div className="relative" style={{ height: "calc(100vh - 4rem)" }}>
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <TripMap
          origin={origin}
          destination={destination}
          stops={stops}
          polyline={plan?.plan.polyline ?? null}
          className="h-full w-full"
        />
      </div>

      {/* Search overlay — top left */}
      <div className="absolute left-3 top-3 z-[1000] w-80 max-w-[calc(100vw-1.5rem)]">
        <div className="rounded-2xl border bg-background/90 p-4 shadow-xl backdrop-blur-sm space-y-3">
          <div className="flex items-center gap-2">
            <Route className="size-4 text-primary" />
            <h1 className="text-sm font-semibold">Trip Planner</h1>
          </div>

          <GeocodingSearch
            placeholder="De unde pleci?"
            value={origin}
            onChange={setOrigin}
            icon={<Navigation className="size-4" />}
          />

          <GeocodingSearch
            placeholder="Unde mergi?"
            value={destination}
            onChange={setDestination}
          />

          {/* Battery slider */}
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Baterie la plecare</span>
              <span className="font-medium text-foreground">{startSoc}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={startSoc}
              onChange={(e) => setStartSoc(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {/* Vehicle selector */}
          {vehicles && vehicles.length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Vehicul (opțional)</label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">Spec implicită (Model 3 LR)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nickname ?? v.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handlePlan}
            disabled={!canPlan || loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Se calculează…
              </>
            ) : (
              <>
                <Route className="size-4" />
                Planifică traseul
              </>
            )}
          </button>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Results panel — bottom slide-up */}
      {plan && (
        <div
          ref={panelRef}
          className="absolute bottom-0 left-0 right-0 z-[1000] max-h-[55vh] overflow-y-auto rounded-t-2xl border-t bg-background shadow-2xl"
        >
          {/* Drag handle */}
          <div className="sticky top-0 flex justify-center bg-background pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          <div className="space-y-4 px-4 pb-6 pt-2">
            <CostSummary
              origin={origin?.name.split(",")[0] ?? ""}
              destination={destination?.name.split(",")[0] ?? ""}
              totalDistanceKm={plan.plan.totalDistanceKm}
              drivingMinutes={plan.plan.drivingMinutes}
              chargingMinutes={plan.plan.chargingMinutes}
              totalEnergyKwh={plan.plan.totalEnergyKwh}
              totalChargingCostEur={plan.plan.totalChargingCostEur}
              stopsCount={plan.plan.stops.length}
              approxRoute={plan.plan.approxRoute}
            />

            {plan.plan.warning && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                <AlertCircle className="size-3.5 shrink-0" />
                {plan.plan.warning}
              </div>
            )}

            {plan.plan.stops.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Opriri la încărcare
                </p>
                {plan.plan.stops.map((stop, i) => (
                  <StopCard key={i} stop={stop} index={i} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                Bateria suficientă — ajungi fără opriri la încărcare. 🎉
              </div>
            )}

            {plan.deratingPct < 0 && (
              <p className="text-xs text-muted-foreground">
                * Autonomia redusă cu {Math.abs(plan.deratingPct)}% din cauza temperaturilor.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
