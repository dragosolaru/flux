"use client";

import { TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import type { BatteryHealthPoint } from "@/app/api/vehicles/[vehicleId]/battery-health/route";

interface BatteryDegradationChartProps {
  vehicleId: string;
}

const W = 480;
const H = 140;
const PAD = 8;

export function BatteryDegradationChart({ vehicleId }: BatteryDegradationChartProps) {
  const t = useTranslations("battery_health");
  const { data, isPending } = useQuery<BatteryHealthPoint[]>({
    queryKey: ["battery-health", vehicleId],
    queryFn: () => apiFetch<BatteryHealthPoint[]>(`/api/vehicles/${vehicleId}/battery-health`),
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          <TrendingDown className="size-3.5" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-[140px] w-full" />
        ) : !data || data.length < 2 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("collecting")}</p>
        ) : (
          <Chart points={data} latestLabel={t("latest")} />
        )}
      </CardContent>
    </Card>
  );
}

function Chart({ points, latestLabel }: { points: BatteryHealthPoint[]; latestLabel: string }) {
  const values = points.map((p) => p.sohPct);
  const max = Math.min(100, Math.ceil(Math.max(...values)));
  const min = Math.floor(Math.min(...values) - 1);
  const range = max - min || 1;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / range) * (H - 2 * PAD);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.sohPct).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(1)} ${H - PAD} Z`;

  const latest = points[points.length - 1]!;
  const first = points[0]!;
  const dropPct = (first.sohPct - latest.sohPct).toFixed(1);

  return (
    <div className="w-full">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums text-chart-2">
          {latest.sohPct.toFixed(1)}<span className="text-sm text-muted-foreground"> %</span>
        </span>
        <span className="text-xs text-muted-foreground">−{dropPct}% / 12 {latestLabel}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Battery SoH over time">
        <path d={area} fill="hsl(var(--chart-2) / 0.12)" />
        <path d={line} fill="none" stroke="hsl(var(--chart-2))" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(latest.sohPct)} r={3} fill="hsl(var(--chart-2))" />
      </svg>
    </div>
  );
}
