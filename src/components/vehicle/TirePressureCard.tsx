"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import type { TirePressures } from "@/types/vehicle";

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
          "text-base font-light tabular-nums",
          isLow || isHigh ? "text-destructive" : "text-foreground",
        )}
      >
        {psi}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">psi</span>
      </div>
      <div className="text-xs tracking-[0.12em] uppercase text-muted-foreground/70">{label}</div>
    </div>
  );
}

interface TirePressureCardProps {
  tirePressures: TirePressures;
}

export function TirePressureCard({ tirePressures: t }: TirePressureCardProps) {
  return (
    <GlassCard>
      <div className="p-4 space-y-3">
        <span className="text-xs tracking-[0.12em] uppercase text-muted-foreground/70">
          Tire Pressure
        </span>
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
      </div>
    </GlassCard>
  );
}
