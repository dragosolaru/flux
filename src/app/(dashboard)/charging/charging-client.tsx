"use client";

import { useState, useEffect, useRef, type ChangeEvent } from "react";

import { motion } from "framer-motion";
import { BatteryCharging, RefreshCw, Clock, Zap, Home, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
import { GlassCard } from "@/components/ui/glass-card";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  staggerContainer,
  fadeInUp,
  tapShrink,
} from "@/lib/animations/variants";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useChargingHistorySync } from "@/hooks/useChargingHistorySync";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import type { ChargingSessionRow } from "./page";

interface ChargingClientProps {
  vehicleId: string;
  vehicleName: string;
  history: ChargingSessionRow[];
}

function formatMinutes(min: number | null | undefined): string {
  if (min == null || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "—";
  const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (diffMs <= 0) return "—";
  const totalMin = Math.round(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function ringColor(chargingState: string | null | undefined): string {
  if (chargingState === "charging") return "oklch(0.68 0.18 162)";  // green
  if (chargingState === "complete") return "oklch(0.68 0.18 162)";  // green
  if (chargingState === "stopped")  return "oklch(0.75 0.18 85)";   // amber
  return "oklch(0.45 0.01 265)";  // grey
}

export function ChargingClient({
  vehicleId,
  vehicleName,
  history,
}: ChargingClientProps) {
  const { data, isLoading, isError } = useVehicle(vehicleId);
  const { mutate, isPending } = useVehicleCommand();
  const { data: caps } = useCapabilities();
  const syncMutation = useChargingHistorySync(vehicleId);
  const tc = useTranslations("charging");

  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (caps?.hasLiveVehicle && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      syncMutation.mutate();
    }
  }, [caps?.hasLiveVehicle]); // eslint-disable-line

  const [limit, setLimit] = useState<number>(80);
  const [scheduled, setScheduled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("23:00");

  const prevServerLimitRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const serverLimit = data?.chargeLimit;
    if (serverLimit != null && serverLimit !== prevServerLimitRef.current) {
      prevServerLimitRef.current = serverLimit;
      setLimit(serverLimit);
    }
  }, [data?.chargeLimit]);

  const effectiveLimit = data?.chargeLimit ?? limit;
  const isCharging = data?.chargingState === "charging";

  function saveChargeLimit() {
    mutate({
      vehicleId,
      command: "set_charge_limit",
      args: { limitPct: limit },
    });
  }

  function ringStatusLabel(): string {
    const state = data?.chargingState;
    if (state === "charging")     return tc("ring_status_charging");
    if (state === "complete")     return tc("ring_status_complete");
    if (state === "stopped")      return tc("ring_status_stopped");
    return tc("ring_status_disconnected");
  }

  return (
    <PageWrapper className="mx-auto max-w-lg gap-5 pb-8">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tc("page_title")}</h1>
        <p className="text-sm text-muted-foreground">{vehicleName}</p>
      </div>

      {/* Active charge ring */}
      <GlassCard className="p-6 flex flex-col items-center gap-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="size-[180px] rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground">{tc("limit_error")}</p>
        ) : (
          <>
            <CircularProgress
              value={data.batteryLevel ?? 0}
              size={180}
              strokeWidth={12}
              color={ringColor(data.chargingState)}
            >
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span className="text-4xl font-bold tabular-nums leading-none">
                  {data.batteryLevel ?? 0}%
                </span>
                {isCharging && (
                  <>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {data.chargingRateKw != null
                        ? `${data.chargingRateKw.toFixed(1)} kW`
                        : "— kW"}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatMinutes(data.timeToFullMinutes)}
                    </span>
                  </>
                )}
              </div>
            </CircularProgress>

            <p
              className={`text-sm font-medium ${
                isCharging ? "text-chart-2" : "text-muted-foreground"
              }`}
            >
              {ringStatusLabel()}
            </p>

            {isCharging && (
              <div className="flex w-full justify-around text-center">
                <div>
                  <p className="text-xs text-muted-foreground">{tc("ring_target")}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {data.chargeLimit != null ? `${data.chargeLimit}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{tc("ring_power")}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {data.chargingRateKw != null
                      ? `${data.chargingRateKw.toFixed(1)} kW`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{tc("ring_time_remaining")}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMinutes(data.timeToFullMinutes)}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </GlassCard>

      {/* Charge limit slider */}
      <GlassCard className="p-5 flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold">{tc("limit_title")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{tc("limit_description")}</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-6 w-full" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground">{tc("limit_error")}</p>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{tc("limit_label")}</span>
              <span className="text-base font-semibold tabular-nums">{limit}%</span>
            </div>
            <Slider
              value={[limit]}
              onValueChange={(v: number[]) => setLimit(v[0] ?? effectiveLimit)}
              min={50}
              max={100}
              step={1}
            />
            <motion.div {...tapShrink}>
              <Button
                onClick={saveChargeLimit}
                disabled={isPending || limit === data.chargeLimit}
                className="w-full min-h-[44px]"
              >
                {isPending ? tc("limit_saving") : tc("limit_save")}
              </Button>
            </motion.div>
          </>
        )}
      </GlassCard>

      {/* Scheduled charging */}
      <GlassCard className="p-5 flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold">{tc("scheduled_title")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{tc("scheduled_description")}</p>
        </div>
        <div className="flex items-center justify-between min-h-[44px]">
          <span className="text-sm">{tc("scheduled_enabled")}</span>
          <Switch checked={scheduled} onCheckedChange={setScheduled} />
        </div>
        {scheduled && (
          <div className="flex items-center gap-3">
            <label htmlFor="charge-time" className="text-sm text-muted-foreground">
              {tc("scheduled_start_at")}
            </label>
            <input
              id="charge-time"
              type="time"
              value={scheduleTime}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setScheduleTime(e.target.value)
              }
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
        )}
      </GlassCard>

      {/* Charging history */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{tc("history_title")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{tc("history_description")}</p>
          </div>
          {caps?.hasLiveVehicle && (
            <motion.div {...tapShrink}>
              <Button
                variant="outline"
                size="sm"
                disabled={syncMutation.isPending}
                onClick={() => {
                  syncMutation.mutate(undefined, {
                    onSuccess: (result) => {
                      toast.success(`Synced ${result.synced} sessions`);
                    },
                  });
                }}
                className="min-h-[44px]"
              >
                <RefreshCw
                  className={syncMutation.isPending ? "animate-spin" : ""}
                  size={14}
                />
                <span className="ml-1">
                  {syncMutation.isPending
                    ? tc("history_syncing")
                    : tc("history_sync")}
                </span>
              </Button>
            </motion.div>
          )}
        </div>

        {history.length === 0 ? (
          <GlassCard className="p-8 flex flex-col items-center gap-3 text-center">
            <BatteryCharging className="size-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              {tc("history_empty_title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {tc("history_empty_hint")}
            </p>
          </GlassCard>
        ) : (
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-3"
          >
            {history.map((row) => (
              <HistoryCard key={row.id} row={row} tc={tc} />
            ))}
          </motion.ul>
        )}
      </div>
    </PageWrapper>
  );
}

function HistoryCard({
  row,
  tc,
}: {
  row: ChargingSessionRow;
  tc: ReturnType<typeof useTranslations<"charging">>;
}) {
  const isHome =
    !row.location_name || row.location_name.toLowerCase().includes("home");

  const date = new Date(row.started_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const duration = formatDuration(row.started_at, row.ended_at);

  return (
    <motion.li variants={fadeInUp}>
      <GlassCard className="p-4 flex items-start gap-4">
        {/* Icon */}
        <div
          className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${
            isHome
              ? "bg-chart-2/15 text-chart-2"
              : "bg-primary/15 text-primary"
          }`}
        >
          {isHome ? <Home size={18} /> : <MapPin size={18} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Top row: date + duration */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-medium truncate">{date}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Clock size={12} />
              {duration}
            </span>
          </div>
          {/* Bottom row: kWh + cost */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Zap size={12} />
              {row.energy_added_kwh != null
                ? `${row.energy_added_kwh.toFixed(1)} kWh`
                : `— ${tc("history_kwh")}`}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.cost_eur != null ? `€${row.cost_eur.toFixed(2)}` : "—"}
            </span>
          </div>
          {/* Location label */}
          <p className="mt-1 text-xs text-muted-foreground/70">
            {isHome
              ? tc("history_home")
              : (row.location_name ?? tc("history_public"))}
          </p>
        </div>
      </GlassCard>
    </motion.li>
  );
}
