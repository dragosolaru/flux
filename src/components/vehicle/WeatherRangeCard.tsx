"use client";

import { Cloud, CloudRain, CloudSnow, Sun, Wind } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { GlassCard } from "@/components/ui/glass-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api-fetch";
import type { RangeDerating, WeatherSnapshot } from "@/lib/external/weather/types";

interface WeatherResponse {
  weather: WeatherSnapshot;
  derating: RangeDerating | null;
}

function WeatherIcon({ condition }: { condition: string }) {
  if (condition.includes("Rain")) return <CloudRain className="size-4 text-muted-foreground shrink-0" />;
  if (condition.includes("Snow")) return <CloudSnow className="size-4 text-muted-foreground shrink-0" />;
  if (condition.includes("Cloudy")) return <Cloud className="size-4 text-muted-foreground shrink-0" />;
  return <Sun className="size-4 text-muted-foreground shrink-0" />;
}

interface WeatherRangeCardProps {
  vehicleId: string;
}

export function WeatherRangeCard({ vehicleId }: WeatherRangeCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["vehicle-weather", vehicleId],
    queryFn: () => apiFetch<WeatherResponse>(`/api/vehicles/${vehicleId}/weather`),
    staleTime: 10 * 60 * 1000,
  });

  return (
    <GlassCard>
      <div className="p-4 space-y-2">
        <span className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground/50">
          Weather &amp; Range
        </span>
        {isLoading || !data ? (
          <div className="h-14 animate-pulse rounded bg-muted" />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <WeatherIcon condition={data.weather.conditionLabel} />
              <span className="font-medium">{data.weather.tempC.toFixed(1)}°C</span>
              <span className="text-muted-foreground">{data.weather.conditionLabel}</span>
              {data.weather.windSpeedMs > 1 && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Wind className="size-3" />
                  {data.weather.windSpeedMs} m/s
                </span>
              )}
            </div>

            {data.derating && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-default space-y-0.5">
                      <div className="text-xl font-thin tabular-nums">
                        {data.derating.deratedKm} km
                        {data.derating.totalPct < -0.5 && (
                          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                            ({data.derating.totalPct.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Ideal: {data.derating.idealKm} km
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="space-y-1 text-xs">
                    <p className="font-medium">Range derating breakdown</p>
                    {data.derating.factors.tempPct !== 0 && (
                      <p>Temperature: {data.derating.factors.tempPct.toFixed(1)}%</p>
                    )}
                    {data.derating.factors.windPct < -0.5 && (
                      <p>Wind: {data.derating.factors.windPct.toFixed(1)}%</p>
                    )}
                    {data.derating.factors.precipPct !== 0 && (
                      <p>Precipitation: {data.derating.factors.precipPct}%</p>
                    )}
                    {data.derating.totalPct === 0 && <p>No derating — ideal conditions</p>}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
