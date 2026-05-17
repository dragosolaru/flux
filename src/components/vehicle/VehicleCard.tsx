"use client";

import { Lock, MapPin, Unlock } from "lucide-react";

import { BatteryGauge } from "./BatteryGauge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { VehicleState } from "@/types/vehicle";

interface VehicleCardProps {
  state: VehicleState | undefined;
  isLoading: boolean;
}

export function VehicleCard({ state, isLoading }: VehicleCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          {isLoading || !state ? (
            <>
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-5 w-24" />
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {state.displayName}
                </h2>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    state.isOnline
                      ? "bg-chart-2/15 text-chart-2"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      state.isOnline ? "bg-chart-2" : "bg-muted-foreground",
                    )}
                  />
                  {state.isOnline ? "Online" : "Asleep"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {state.isLocked !== false ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <Unlock className="h-3.5 w-3.5 text-destructive" />
                )}
                <span>{state.isLocked === false ? "Unlocked" : "Locked"}</span>
                {state.latitude != null && state.longitude != null && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="tabular-nums">
                      {state.latitude.toFixed(3)}, {state.longitude.toFixed(3)}
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-end justify-center">
          {isLoading || !state ? (
            <Skeleton className="h-32 w-56 rounded-xl" />
          ) : (
            <BatteryGauge
              level={state.batteryLevel ?? 0}
              isCharging={state.chargingState === "charging"}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
