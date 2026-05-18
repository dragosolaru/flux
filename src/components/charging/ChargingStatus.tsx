"use client";

import { BatteryCharging, BatteryFull, Plug, Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { VehicleState } from "@/types/vehicle";

interface ChargingStatusProps {
  state: VehicleState | undefined;
  isLoading: boolean;
}

export function ChargingStatus({ state, isLoading }: ChargingStatusProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Charging</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !state ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-2 w-full" />
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3">
              <StatusIcon chargingState={state.chargingState} />
              <div>
                <div className="font-medium capitalize">
                  {(state.chargingState ?? "disconnected").replace(/_/g, " ")}
                </div>
                {state.chargingState === "charging" && (
                  <div className="text-sm text-muted-foreground">
                    {state.chargingRateKw?.toFixed(1) ?? "—"} kW · ETA{" "}
                    {formatMinutes(state.timeToFullMinutes)}
                  </div>
                )}
                {state.chargingState !== "charging" && state.chargeLimit != null && (
                  <div className="text-sm text-muted-foreground">
                    Charge limit {state.chargeLimit}%
                  </div>
                )}
              </div>
            </div>
            {state.batteryLevel != null && (
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 transition-all",
                    state.chargingState === "charging"
                      ? "bg-chart-2"
                      : "bg-primary/60",
                  )}
                  style={{ width: `${Math.round(state.batteryLevel ?? 0)}%` }}
                />
                {state.chargeLimit != null && (
                  <div
                    className="absolute inset-y-0 w-px bg-foreground/40"
                    style={{ left: `${state.chargeLimit}%` }}
                    aria-label="Charge limit"
                  />
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusIcon({
  chargingState,
}: {
  chargingState: VehicleState["chargingState"];
}) {
  if (chargingState === "charging")
    return <BatteryCharging className="size-6 text-chart-2" />;
  if (chargingState === "complete")
    return <BatteryFull className="size-6 text-chart-2" />;
  if (chargingState === "stopped" || chargingState === "no_power")
    return <Zap className="size-6 text-destructive" />;
  return <Plug className="size-6 text-muted-foreground" />;
}

function formatMinutes(min: number | null | undefined): string {
  if (min == null || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
