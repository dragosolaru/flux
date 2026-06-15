"use client";

import { CheckCircle2, Clock, Loader2, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GlassCard } from "@/components/ui/glass-card";
import { apiFetch } from "@/lib/api-fetch";
import { computeSmartCharge } from "@/lib/external/tariffs/recommend";
import { getModelSpec } from "@/lib/brands/models";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useCurrency } from "@/hooks/useCurrency";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { cardVariants } from "@/lib/animations/variants";
import type { TariffForecast } from "@/lib/external/tariffs/types";
import type { VehicleListItem } from "@/hooks/useVehicles";
import type { VehicleState } from "@/types/vehicle";
import type { BrandKey } from "@/lib/brands/types";

interface SmartChargeCardProps {
  forecast: TariffForecast | null;
  isLoading?: boolean;
}

function VehicleRecommendation({
  vehicle,
  forecast,
}: {
  vehicle: VehicleListItem;
  forecast: TariffForecast;
}) {
  const t = useTranslations("energy");
  const { fromEUR } = useCurrency();
  const [scheduled, setScheduled] = useState(false);
  const { mutate, isPending } = useVehicleCommand();
  const { data: caps } = useCapabilities();

  const hasCommandsReady = caps?.hasCommandsReady ?? false;

  const { data: state } = useQuery({
    queryKey: ["vehicle", vehicle.id],
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
      {
        vehicleId: vehicle.id,
        command: "schedule_charging",
        args: { time: startTimeMinutes },
      },
      {
        // Confirm only on a real success — the hook toasts rejections
        // (success:false) and errors centrally. Keep the confirmed state
        // rather than auto-reverting, which read as "not scheduled".
        onSuccess: (data) => {
          if (data.success) setScheduled(true);
        },
      },
    );
  }

  const scheduleButton = (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={hasCommandsReady ? handleSchedule : undefined}
      disabled={!hasCommandsReady || isPending || scheduled}
      className={[
        "mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-[10px] text-sm font-semibold transition-all",
        scheduled
          ? "bg-chart-2 text-white"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        (!hasCommandsReady || isPending || scheduled) &&
          "cursor-not-allowed opacity-60",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : scheduled ? (
        <>
          <CheckCircle2 className="size-4" />
          {t("scheduled")}
        </>
      ) : (
        <>
          <Zap className="size-4" />
          {t("schedule_btn")}
        </>
      )}
    </motion.button>
  );

  return (
    <div className="space-y-1">
      {/* Vehicle name */}
      <p className="text-xs font-medium text-muted-foreground">
        {vehicle.nickname ?? vehicle.displayName}
      </p>

      {/* Key recommendation details */}
      <div className="flex items-center gap-3">
        <Clock className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold">
            {t("start_at")}{" "}
            <span className="text-chart-2">
              {String(rec.startAtHour).padStart(2, "0")}:00
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {t("save")}{" "}
            <span className="font-semibold text-chart-2">
              {fromEUR(rec.savingsEur)}
            </span>{" "}
            · ~{Math.round(rec.hoursNeeded * 10) / 10}h {t("to_target")}
          </p>
        </div>
      </div>

      {/* Schedule CTA */}
      {hasCommandsReady ? (
        scheduleButton
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block">{scheduleButton}</span>
            </TooltipTrigger>
            <TooltipContent>{t("schedule_no_virtual_key")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

export function SmartChargeCard({
  forecast,
  isLoading = false,
}: SmartChargeCardProps) {
  const t = useTranslations("energy");
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => apiFetch<VehicleListItem[]>("/api/vehicles"),
    staleTime: 60_000,
  });

  return (
    <motion.div variants={cardVariants}>
      <GlassCard className="p-5" animate={false}>
        {/* Header row */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{t("smart_charge_title")}</h2>
          </div>
          <span className="rounded-full bg-chart-2/15 px-2.5 py-0.5 text-xs font-medium text-chart-2">
            {t("recommended_badge")}
          </span>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-10 animate-pulse rounded-xl bg-white/5" />
            <div className="h-12 animate-pulse rounded-xl bg-white/5" />
          </div>
        ) : !forecast || !vehicles || vehicles.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {t("no_recommendation")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              {t("no_recommendation_hint")}
            </p>
          </div>
        ) : (
          <div className="space-y-4 divide-y divide-white/5">
            {vehicles.map((v: VehicleListItem) => (
              <div key={v.id} className="pt-4 first:pt-0">
                <VehicleRecommendation vehicle={v} forecast={forecast} />
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground/60">
          {t("smart_charge_hint")}
        </p>
      </GlassCard>
    </motion.div>
  );
}
