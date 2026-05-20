"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { RefreshCw, Zap } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriceCurveChart } from "@/components/energy/PriceCurveChart";
import { SmartChargeCard } from "@/components/energy/SmartChargeCard";
import { apiFetch } from "@/lib/api-fetch";
import type { TariffForecast } from "@/lib/external/tariffs/types";

interface TariffResponse extends TariffForecast {
  providerId: string;
  providerName: string;
}

interface SettingsResponse {
  activeProvider: string;
  providers: { id: string; displayName: string }[];
}

export function EnergyClient() {
  const qc = useQueryClient();

  const { data: forecast, isLoading: fLoading, refetch } = useQuery({
    queryKey: ["tariff-prices"],
    queryFn: () => apiFetch<TariffResponse>("/api/tariffs/prices"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings, isLoading: sLoading } = useQuery({
    queryKey: ["tariff-settings"],
    queryFn: () => apiFetch<SettingsResponse>("/api/tariffs/settings"),
    staleTime: 60 * 1000,
  });

  const switchMutation = useMutation({
    mutationFn: (providerId: string) =>
      apiFetch<SettingsResponse>("/api/tariffs/settings", {
        method: "PUT",
        body: JSON.stringify({ providerId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tariff-settings"] });
      qc.invalidateQueries({ queryKey: ["tariff-prices"] });
    },
  });

  const handleProviderChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      switchMutation.mutate(e.target.value);
    },
    [switchMutation],
  );

  const currentHour = new Date().getHours();
  const currentPrice = forecast?.currentPrice;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Energy</h1>
          <p className="text-sm text-muted-foreground">Today&apos;s tariff prices &amp; smart-charge recommendations</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={fLoading}>
          <RefreshCw className={`size-4 ${fLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Provider selector + current price */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Tariff provider
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sLoading ? (
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
            ) : (
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={settings?.activeProvider ?? ""}
                onChange={handleProviderChange}
                disabled={switchMutation.isPending}
              >
                {settings?.providers.map((p: { id: string; displayName: string }) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              <Zap className="size-3.5" />
              Current price
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fLoading ? (
              <div className="h-9 animate-pulse rounded bg-muted" />
            ) : (
              <div className="flex items-end gap-1">
                <span className="text-3xl font-semibold tabular-nums">
                  {currentPrice != null ? (currentPrice * 100).toFixed(1) : "—"}
                </span>
                <span className="mb-0.5 text-sm text-muted-foreground">ct/kWh</span>
                <span className="mb-0.5 ml-2 text-xs text-muted-foreground">
                  {String(currentHour).padStart(2, "0")}:00
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 24-hour price chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            24-hour price curve
            {forecast && (
              <span className="ml-2 font-normal normal-case text-muted-foreground/60">
                · {forecast.providerName}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fLoading || !forecast ? (
            <div className="h-44 animate-pulse rounded bg-muted" />
          ) : (
            <PriceCurveChart
              prices={forecast.prices}
              currentHour={currentHour}
              cheapestWindowStart={forecast.cheapestWindowStart}
              cheapestWindowEnd={forecast.cheapestWindowEnd}
            />
          )}
        </CardContent>
      </Card>

      {/* Cheapest window summary */}
      {forecast && (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-8 items-center justify-center rounded-full bg-chart-2/15">
              <Zap className="size-4 text-chart-2" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Cheapest window:{" "}
                <span className="text-chart-2">
                  {String(forecast.cheapestWindowStart).padStart(2, "0")}:00
                  {" – "}
                  {String(forecast.cheapestWindowEnd).padStart(2, "0")}:00
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                avg {(forecast.cheapestAvgPrice * 100).toFixed(1)} ct/kWh
                {" · "}
                saves {((forecast.currentPrice - forecast.cheapestAvgPrice) * 100).toFixed(1)} ct/kWh vs now
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-vehicle recommendations pulled from garage */}
      <SmartChargeCard forecast={forecast ?? null} />
    </div>
  );
}
