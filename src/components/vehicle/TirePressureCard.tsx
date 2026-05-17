"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TirePressures } from "@/types/vehicle";

const NOMINAL_KPA = 240; // ~2.4 bar / ~35 psi
const WARN_LOW_KPA = 210;
const WARN_HIGH_KPA = 280;

function TireBar({
  label,
  kpa,
}: {
  label: string;
  kpa: number;
}) {
  const isLow = kpa < WARN_LOW_KPA;
  const isHigh = kpa > WARN_HIGH_KPA;
  const psi = Math.round(kpa * 0.145038);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "text-base font-semibold tabular-nums",
          isLow || isHigh ? "text-destructive" : "text-foreground",
        )}
      >
        {psi}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">psi</span>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

interface TirePressureCardProps {
  tirePressures: TirePressures;
}

export function TirePressureCard({ tirePressures: t }: TirePressureCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Tire Pressure
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <TireBar label="FL" kpa={t.frontLeftKpa} />
          <TireBar label="FR" kpa={t.frontRightKpa} />
          <TireBar label="RL" kpa={t.rearLeftKpa} />
          <TireBar label="RR" kpa={t.rearRightKpa} />
        </div>
        {Math.min(t.frontLeftKpa, t.frontRightKpa, t.rearLeftKpa, t.rearRightKpa) <
          WARN_LOW_KPA && (
          <p className="mt-3 text-xs text-destructive">Low pressure detected</p>
        )}
      </CardContent>
    </Card>
  );
}
