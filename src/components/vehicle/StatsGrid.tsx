"use client";

import { Gauge, Snowflake, Thermometer, Wind } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { VehicleState } from "@/types/vehicle";

interface StatsGridProps {
  state: VehicleState;
}

export function StatsGrid({ state }: StatsGridProps) {
  const stats = [
    {
      label: "Range",
      value: `${Math.round(state.batteryRangeKm)} km`,
      icon: Gauge,
    },
    {
      label: "Odometer",
      value: `${Math.round(state.odometerKm).toLocaleString()} km`,
      icon: Gauge,
    },
    {
      label: "Interior",
      value: `${state.interiorTempC.toFixed(1)} °C`,
      icon: Thermometer,
    },
    {
      label: "Exterior",
      value: `${state.exteriorTempC.toFixed(1)} °C`,
      icon: state.exteriorTempC < 5 ? Snowflake : Wind,
    },
  ];

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
