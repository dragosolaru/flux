"use client";

import { Clock, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-fetch";
import { computeSmartCharge } from "@/lib/external/tariffs/recommend";
import { getModelSpec } from "@/lib/brands/models";
import type { TariffForecast } from "@/lib/external/tariffs/types";
import type { VehicleListItem } from "@/hooks/useVehicles";
import type { VehicleState } from "@/types/vehicle";
import type { BrandKey } from "@/lib/brands/types";

interface SmartChargeCardProps {
  forecast: TariffForecast | null;
}

function VehicleRecommendation({
  vehicle,
  forecast,
}: {
  vehicle: VehicleListItem;
  forecast: TariffForecast;
}) {
  const { data: state } = useQuery({
    queryKey: ["vehicle-state", vehicle.id],
    queryFn: () => apiFetch<VehicleState>(`/api/vehicles/${vehicle.id}/state`),
    staleTime: 30_000,
  });

  if (!state) return null;

  // Only recommend for plugged/parked vehicles that aren't already full
  const isPlugged =
    state.chargingState === "charging" ||
    state.chargingState === "complete" ||
    state.chargingState === "stopped" ||
    state.motionState === "plugged-idle";

  if (!isPlugged) return null;

  const batteryLevel = state.batteryLevel ?? 80;
  const chargeLimit = state.chargeLimit ?? 80;
  if (batteryLevel >= chargeLimit) return null;

  const spec = getModelSpec(vehicle.brand as BrandKey, vehicle.model);
  const rec = computeSmartCharge(
    batteryLevel,
    chargeLimit,
    spec.maxAcChargingRateKw,
    spec.batteryCapacityKwh,
    forecast.prices,
  );

  if (!rec) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-chart-2/15">
        <Clock className="size-4 text-chart-2" />
      </div>
      <div>
        <p className="text-sm font-medium">
          {vehicle.nickname ?? vehicle.displayName}
        </p>
        <p className="text-sm text-muted-foreground">
          Start charging at{" "}
          <span className="font-medium text-chart-2">
            {String(rec.startAtHour).padStart(2, "0")}:00
          </span>{" "}
          — save{" "}
          <span className="font-medium text-chart-2">€{rec.savingsEur.toFixed(2)}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Now: €{rec.currentCostEur.toFixed(2)} · Optimal: €{rec.optimalCostEur.toFixed(2)}
          {" · "}~{Math.round(rec.hoursNeeded * 10) / 10}h to target
        </p>
      </div>
    </div>
  );
}

export function SmartChargeCard({ forecast }: SmartChargeCardProps) {
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => apiFetch<VehicleListItem[]>("/api/vehicles"),
    staleTime: 60_000,
  });

  if (!forecast || !vehicles || vehicles.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          <Zap className="size-3.5" />
          Smart-charge recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {vehicles.map((v) => (
          <VehicleRecommendation key={v.id} vehicle={v} forecast={forecast} />
        ))}
        <p className="text-xs text-muted-foreground">
          Only shown for plugged-in vehicles that haven&apos;t reached their charge limit.
        </p>
      </CardContent>
    </Card>
  );
}
