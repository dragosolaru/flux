"use client";

import { HeartPulse } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BatteryHealthCardProps {
  batteryHealthPct: number | null;
  cellVoltages: number[] | null;
  showCells: boolean;
}

export function BatteryHealthCard({
  batteryHealthPct,
  cellVoltages,
  showCells,
}: BatteryHealthCardProps) {
  const minCell = cellVoltages ? Math.min(...cellVoltages) : null;
  const maxCell = cellVoltages ? Math.max(...cellVoltages) : null;
  const spread = minCell != null && maxCell != null ? maxCell - minCell : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          <HeartPulse className="size-3.5" />
          Battery Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {batteryHealthPct != null && (
          <div>
            <div className="flex items-end gap-1">
              <span
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  batteryHealthPct >= 90
                    ? "text-chart-2"
                    : batteryHealthPct >= 80
                      ? "text-yellow-500"
                      : "text-destructive",
                )}
              >
                {batteryHealthPct.toFixed(1)}
              </span>
              <span className="mb-0.5 text-sm text-muted-foreground">% SoH</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  batteryHealthPct >= 90
                    ? "bg-chart-2"
                    : batteryHealthPct >= 80
                      ? "bg-yellow-500"
                      : "bg-destructive",
                )}
                style={{ width: `${batteryHealthPct}%` }}
              />
            </div>
          </div>
        )}
        {showCells && cellVoltages && cellVoltages.length > 0 && (
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Cells</span>
              <span>{cellVoltages.length}</span>
            </div>
            {minCell != null && (
              <div className="flex justify-between">
                <span>Min</span>
                <span className="tabular-nums">{minCell.toFixed(3)} V</span>
              </div>
            )}
            {maxCell != null && (
              <div className="flex justify-between">
                <span>Max</span>
                <span className="tabular-nums">{maxCell.toFixed(3)} V</span>
              </div>
            )}
            {spread != null && (
              <div className="flex justify-between">
                <span>Spread</span>
                <span
                  className={cn(
                    "tabular-nums",
                    spread > 0.05 ? "text-yellow-500" : "",
                  )}
                >
                  {(spread * 1000).toFixed(1)} mV
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
