"use client";

import type { ComponentType } from "react";
import { Gauge, MapPin, Snowflake, Thermometer, Wind } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { VehicleState } from "@/types/vehicle";

interface StatsGridProps {
  state: VehicleState;
}

export function StatsGrid({ state }: StatsGridProps) {
  // Temperature tile: show both interior + exterior when both exist
  const tempTile = (() => {
    if (state.interiorTempC != null && state.exteriorTempC != null) {
      return {
        label: "Temperature",
        value: `${state.interiorTempC.toFixed(0)}°C in / ${state.exteriorTempC.toFixed(0)}°C out`,
        icon: Thermometer,
      };
    }
    if (state.interiorTempC != null) {
      return { label: "Interior", value: `${state.interiorTempC.toFixed(1)} °C`, icon: Thermometer };
    }
    if (state.exteriorTempC != null) {
      return {
        label: "Exterior",
        value: `${state.exteriorTempC.toFixed(1)} °C`,
        icon: state.exteriorTempC < 5 ? Snowflake : Wind,
      };
    }
    return null;
  })();

  const stats = [
    state.batteryRangeKm != null && {
      label: "Range",
      value: `${Math.round(state.batteryRangeKm)} km`,
      icon: Gauge,
    },
    state.odometerKm != null && {
      label: "Odometer",
      value: `${Math.round(state.odometerKm).toLocaleString()} km`,
      icon: Gauge,
    },
    tempTile,
    state.latitude != null && state.longitude != null && {
      label: "Location",
      value: `📍 ${state.latitude.toFixed(3)}, ${state.longitude.toFixed(3)}`,
      icon: MapPin,
    },
  ].filter(Boolean) as { label: string; value: string; icon: ComponentType<{ className?: string }> }[];

  if (stats.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.label}>
            <CardContent className="flex flex-col gap-1 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {s.label}
              </div>
              <div className="text-xl font-semibold tabular-nums">
                {s.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
