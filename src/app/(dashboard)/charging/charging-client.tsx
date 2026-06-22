"use client";

import { useState, useEffect, useRef, type ChangeEvent } from "react";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BatteryCharging, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  SectionHeader,
  ListRow,
  EmptyState,
} from "@/components/ui-kit";
import {
  staggerContainer,
  fadeInUp,
  tapShrink,
} from "@/lib/animations/variants";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useChargingHistorySync } from "@/hooks/useChargingHistorySync";
import { useCurrency } from "@/hooks/useCurrency";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import type { ChargingSessionRow } from "./page";

interface ChargingClientProps {
  initialHistory: ChargingSessionRow[];
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
  if (chargingState === "charging") return "var(--chart-2)";
  if (chargingState === "complete") return "var(--chart-2)";
  if (chargingState === "stopped") return "var(--chart-3)";
  return "var(--muted-foreground)";
}

export function ChargingClient({
  initialHistory,
}: ChargingClientProps) {
  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicleId = selectedVehicleId ?? "";
  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  const vehicleName = vehicle ? (vehicle.nickname ?? vehicle.displayName) : "";
  const history = initialHistory;

  const { data, isLoading, isError } = useVehicle(vehicleId);
  const { mutate, isPending } = useVehicleCommand();
  const { data: caps } = useCapabilities();
  const syncMutation = useChargingHistorySync(vehicleId);
  const tc = useTranslations("charging");
  const router = useRouter();

  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (caps?.hasLiveVehicle && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      syncMutation.mutate(undefined, { onSuccess: () => router.refresh() });
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

  // Seed the scheduled-charging controls from the persisted vehicle state so a
  // saved schedule survives reloads instead of always showing off / 23:00.
  const prevServerScheduleRef = useRef<boolean | null | undefined>(undefined);
  useEffect(() => {
    const enabled = data?.scheduledChargingEnabled;
    if (enabled == null || enabled === prevServerScheduleRef.current) return;
    prevServerScheduleRef.current = enabled;
    const mins = data?.scheduledChargingStartMinutes;
    queueMicrotask(() => {
      setScheduled(enabled);
      if (mins != null && Number.isFinite(mins)) {
        const h = Math.floor(mins / 60) % 24;
        const m = mins % 60;
        setScheduleTime(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    });
  }, [data?.scheduledChargingEnabled, data?.scheduledChargingStartMinutes]);

  const effectiveLimit = data?.chargeLimit ?? limit;
  const isCharging = data?.chargingState === "charging";

  function saveChargeLimit() {
    mutate({
      vehicleId,
      command: "set_charge_limit",
      args: { limitPct: limit },
    });
  }

  function saveSchedule() {
    const [h, m] = scheduleTime.split(":").map(Number);
    const minutes = (Number.isFinite(h) ? h : 23) * 60 + (Number.isFinite(m) ? m : 0);
    mutate(
      {
        vehicleId,
        command: "schedule_charging",
        args: { enable: scheduled, time: minutes },
      },
      {
        onSuccess: () => toast.success(scheduled ? tc("scheduled_saved") : tc("scheduled_disabled")),
        onError: () => toast.error(tc("scheduled_error")),
      },
    );
  }

  function ringStatusLabel(): string {
    const state = data?.chargingState;
    if (state === "charging") return tc("ring_status_charging");
    if (state === "complete") return tc("ring_status_complete");
    if (state === "stopped") return tc("ring_status_stopped");
    return tc("ring_status_disconnected");
  }

  return (
    <PageWrapper className="mx-auto max-w-lg gap-3 pb-8">
      {/* Page heading */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{tc("page_title")}</h1>
            <p className="truncate text-sm text-muted-foreground">{vehicleName}</p>
          </div>
          {isCharging && (
            <span className="shrink-0 flex items-center gap-1.5 rounded-full border border-chart-2/40 bg-chart-2/10 px-2.5 py-1 text-2xs font-semibold text-chart-2">
              <BatteryCharging className="size-3.5" />
              {tc("ring_status_charging")}
            </span>
          )}
        </div>
      </motion.div>

      {/* Active charge ring */}
      <Card variant="surface" className="flex flex-col items-center gap-3 p-4">
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
              value={Math.round(data.batteryLevel ?? 0)}
              size={180}
              strokeWidth={12}
              color={ringColor(data.chargingState)}
            >
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span className="text-4xl font-thin tabular-nums leading-none">
                  {Math.round(data.batteryLevel ?? 0)}%
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
      </Card>

      {/* Controls: charge limit + scheduled charging */}
      <Card variant="surface" className="flex flex-col gap-1.5 p-4">
        {/* Charge limit */}
        <div className="flex flex-col gap-2.5 py-3">
          <div>
            <p className="text-sm font-semibold">{tc("limit_title")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tc("limit_description")}</p>
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
                min={Math.min(50, limit)}
                max={100}
                step={1}
                aria-label={tc("limit_label")}
              />
              <motion.div {...tapShrink}>
                <Button
                  onClick={saveChargeLimit}
                  disabled={isPending || limit === data.chargeLimit}
                  className="h-10 w-full rounded-xl"
                >
                  {isPending ? tc("limit_saving") : tc("limit_save")}
                </Button>
              </motion.div>
            </>
          )}
        </div>

        <div className="border-t border-border" />

        {/* Scheduled charging */}
        <div className="flex flex-col gap-2.5 py-3">
          <div>
            <p className="text-sm font-semibold">{tc("scheduled_title")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tc("scheduled_description")}</p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">{tc("scheduled_enabled")}</span>
            <Switch checked={scheduled} onCheckedChange={setScheduled} aria-label={tc("scheduled_enabled")} />
          </div>
          {scheduled && (
            <div className="flex flex-wrap items-center gap-3">
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
                className="h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm sm:w-auto"
              />
            </div>
          )}
          <motion.div {...tapShrink}>
            <Button
              onClick={saveSchedule}
              disabled={isPending}
              className="h-10 w-full rounded-xl"
            >
              {isPending ? tc("limit_saving") : tc("scheduled_save")}
            </Button>
          </motion.div>
        </div>
      </Card>

      {/* Charging history */}
      <div className="flex flex-col gap-2.5">
        <SectionHeader
          title={tc("history_title")}
          trailing={
            caps?.hasLiveVehicle ? (
              <motion.div {...tapShrink}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncMutation.isPending}
                  onClick={() => {
                    syncMutation.mutate(undefined, {
                      onSuccess: (result) => {
                        toast.success(tc("syncSuccess", { count: result.synced }));
                        router.refresh();
                      },
                      onError: () => {
                        toast.error(tc("syncError"));
                      },
                    });
                  }}
                  className="h-8 rounded-xl"
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
            ) : undefined
          }
        />

        {history.length === 0 ? (
          <EmptyState
            icon={BatteryCharging}
            title={tc("history_empty_title")}
            hint={tc("history_empty_hint")}
          />
        ) : (
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-2"
          >
            {history.map((row) => (
              <HistoryRow key={row.id} row={row} tc={tc} />
            ))}
          </motion.ul>
        )}
      </div>
    </PageWrapper>
  );
}

function HistoryRow({
  row,
  tc,
}: {
  row: ChargingSessionRow;
  tc: ReturnType<typeof useTranslations<"charging">>;
}) {
  const { fromEUR, fromRON } = useCurrency();
  const locale = useLocale();
  const isHome =
    !row.location_name || row.location_name.toLowerCase().includes("home");

  const date = new Date(row.started_at).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const duration = formatDuration(row.started_at, row.ended_at);

  const energy =
    row.energy_added_kwh != null
      ? `${row.energy_added_kwh.toFixed(1)} kWh`
      : `— ${tc("history_kwh")}`;

  const cost =
    row.cost_ron != null
      ? fromRON(row.cost_ron)
      : row.cost_eur != null
        ? fromEUR(row.cost_eur)
        : "—";

  const title = isHome ? tc("history_home") : (row.location_name ?? tc("history_public"));

  return (
    <motion.li variants={fadeInUp}>
      <ListRow
        leading={
          <span className="flex size-9 items-center justify-center rounded-xl bg-muted/60">
            <BatteryCharging className="size-4 text-chart-2" />
          </span>
        }
        title={title}
        meta={`${date} · ${cost}`}
        trailing={
          <span className="flex flex-col items-end gap-0.5">
            <span className="text-sm font-semibold tabular-nums text-foreground">{energy}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{duration}</span>
          </span>
        }
      />
    </motion.li>
  );
}
