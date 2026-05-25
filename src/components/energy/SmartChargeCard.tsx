"use client";

import { CheckCircle2, Clock, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-fetch";
import { computeSmartCharge } from "@/lib/external/tariffs/recommend";
import { getModelSpec } from "@/lib/brands/models";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import type { TariffForecast } from "@/lib/external/tariffs/types";
import type { VehicleListItem } from "@/hooks/useVehicles";
import type { VehicleState } from "@/types/vehicle";
import type { BrandKey } from "@/lib/brands/types";

interface SmartChargeCardProps {
  forecast: TariffForecast | null;
}

function VehicleRecommendation({
  vehicle,
  forecast,
}: {
  vehicle: VehicleListItem;
  forecast: TariffForecast;
}) {
  const t = useTranslations("energy");
  const [scheduled, setScheduled] = useState(false);
  const { mutate, isPending } = useVehicleCommand();

  const { data: state } = useQuery({
    queryKey: ["vehicle-state", vehicle.id],
    queryFn: () => apiFetch<VehicleState>(`/api/vehicles/${vehicle.id}/state`),
    staleTime: 30_000,
  });

  if (!state) return null;

  const isPlugged =
    state.chargingState === "charging" ||
    state.chargingState === "complete" ||
    state.chargingState === "stopped" ||
    state.motionState === "plugged-idle";

  if (!isPlugged) return null;

  const batteryLevel = state.batteryLevel ?? 80;
  const chargeLimit = state.chargeLimit ?? 80;
  if (batteryLevel >= chargeLimit) return null;

  const spec = getModelSpec(vehicle.brand as BrandKey, vehicle.model);
  const rec = computeSmartCharge(
    batteryLevel,
    chargeLimit,
    spec.maxAcChargingRateKw,
    spec.batteryCapacityKwh,
    forecast.prices,
  );

  if (!rec) return null;

  const startTimeMinutes = rec.startAtHour * 60;

  function handleSchedule() {
    mutate(
      { vehicleId: vehicle.id, command: "schedule_charging", args: { time: startTimeMinutes } },
      {
        onSuccess: () => {
          setScheduled(true);
          setTimeout(() => setScheduled(false), 10_000);
        },
      },
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-chart-2/15">
        <Clock className="size-4 text-chart-2" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {vehicle.nickname ?? vehicle.displayName}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("start_at")}{" "}
          <span className="font-medium text-chart-2">
            {String(rec.startAtHour).padStart(2, "0")}:00
          </span>{" "}
          — {t("save")}{" "}
          <span className="font-medium text-chart-2">€{rec.savingsEur.toFixed(2)}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("now")}: €{rec.currentCostEur.toFixed(2)} · {t("optimal")}: €{rec.optimalCostEur.toFixed(2)}
          {" · "}~{Math.round(rec.hoursNeeded * 10) / 10}h {t("to_target")}
        </p>
      </div>
      <Button
        variant={scheduled ? "default" : "outline"}
        size="sm"
        className="shrink-0 h-8 text-xs"
        onClick={handleSchedule}
        disabled={isPending || scheduled}
      >
        {scheduled ? (
          <>
            <CheckCircle2 className="size-3 mr-1" />
            {t("scheduled")}
          </>
        ) : (
          t("schedule_btn")
        )}
      </Button>
    </div>
  );
}

export function SmartChargeCard({ forecast }: SmartChargeCardProps) {
  const t = useTranslations("energy");
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => apiFetch<VehicleListItem[]>("/api/vehicles"),
    staleTime: 60_000,
  });

  if (!forecast || !vehicles || vehicles.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          <Zap className="size-3.5" />
          {t("smart_charge_title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {vehicles.map((v: VehicleListItem) => (
          <VehicleRecommendation key={v.id} vehicle={v} forecast={forecast} />
        ))}
        <p className="text-xs text-muted-foreground">
          {t("smart_charge_hint")}
        </p>
      </CardContent>
    </Card>
  );
}
