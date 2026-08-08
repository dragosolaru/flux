"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BatteryCharging,
  Fan,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Thermometer,
  Unlock,
  Zap,
} from "lucide-react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { CircularProgress } from "@/components/ui/circular-progress";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleNotifications } from "@/components/notifications/VehicleNotifications";
import { GettingStartedCard, type ChecklistData } from "@/components/onboarding/GettingStartedCard";
import { OnboardingOverlay } from "@/components/onboarding/OnboardingOverlay";
import { Card, ListRow, TAP } from "@/components/ui-kit";
import { useBrandCapabilities } from "@/hooks/useBrandCapabilities";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { cardVariants, staggerContainer } from "@/lib/animations/variants";
import type { BrandKey } from "@/lib/brands/types";
import { mockLocationLabel } from "@/lib/mock/location-label";
import type { CommandName } from "@/types/history";
import type { VehicleState } from "@/types/vehicle";
import Link from "next/link";
import { ApiError } from "@/lib/api-fetch";

interface DashboardClientProps {
  checklist: ChecklistData;
}

function formatMinutes(min: number | null | undefined): string {
  if (min == null || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function isDataFresh(recordedAt: string): boolean {
  return Date.now() - new Date(recordedAt).getTime() < 5 * 60 * 1000;
}

// SOC level → token accent class (theme-safe).
function getSocColor(level: number): string {
  if (level > 50) return "bg-chart-2";
  if (level > 20) return "bg-chart-3";
  return "bg-destructive";
}

// --------------------------------------------------------------------------
// Hero card — floats directly on the page background (no card chrome)
// --------------------------------------------------------------------------
function HeroCard({
  state,
  isLoading,
  isFetching,
  vehicleName,
  simulated,
  footer,
}: {
  state: VehicleState | undefined;
  isLoading: boolean;
  isFetching: boolean;
  vehicleName: string;
  simulated: boolean;
  /** Rendered inside the card — the sleep control belongs to this car. */
  footer?: React.ReactNode;
}) {
  const td = useTranslations("dashboard");
  const rawSoc = state?.batteryLevel;
  const displayBattery =
    typeof rawSoc === "number" && rawSoc >= 0 && rawSoc <= 100
      ? Math.round(rawSoc)
      : "—";
  const soc = typeof displayBattery === "number" ? displayBattery : 0;
  const fresh = state ? isDataFresh(state.recordedAt) : false;
  const charging = state?.chargingState === "charging";

  return (
    <div className="relative overflow-hidden px-4 py-4 md:px-6 md:py-6">
      {/* Header row */}
      <div className="relative mb-2 flex items-center justify-between gap-2 md:mb-6">
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{vehicleName}</h1>
        {isLoading ? (
          <Skeleton className="h-5 w-14 rounded-full" />
        ) : (
          <LiveBadge
            fresh={fresh}
            isFetching={isFetching}
            label={simulated ? td("demo_label") : td("live_label")}
            simulated={simulated}
          />
        )}
      </div>

      {/* SOC % — ambient numbers hero */}
      <div className="relative flex flex-col items-center gap-0.5">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-36 rounded-xl" />
            {/* Grey rectangles alone read as a car that is present but broken —
                especially beside live-looking controls. Saying what is
                happening costs one line. */}
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {td("contacting_car")}
            </p>
          </>
        ) : (
          <>
            <motion.div
              key={displayBattery}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="text-7xl font-thin tracking-tight tabular-nums leading-none"
            >
              {displayBattery}
              {typeof displayBattery === "number" && (
                <span className="ml-1 text-xl text-muted-foreground">%</span>
              )}
            </motion.div>
            {state?.batteryRangeKm != null && (
              <div className="text-lg font-light tabular-nums text-muted-foreground">
                {Math.round(state.batteryRangeKm)} km
              </div>
            )}
          </>
        )}
      </div>

      {/* SOC progress bar — slim 2px rail */}
      <div className="relative mt-4 h-0.5 overflow-hidden rounded-full bg-muted md:mt-6">
        <motion.div
          className={`h-full rounded-full ${isLoading ? "bg-muted-foreground/30" : charging ? "bg-chart-2" : getSocColor(soc)}`}
          initial={{ width: 0 }}
          animate={{ width: isLoading ? "30%" : `${soc}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        {state?.chargeLimit != null && (
          <div
            className="absolute inset-y-0 w-px bg-foreground/40"
            style={{ left: `${state.chargeLimit}%` }}
          />
        )}
      </div>

      {/* Charging state label */}
      {charging && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-center text-xs font-medium uppercase tracking-wider text-chart-2"
        >
          {td("charging_active")} · {state?.chargingRateKw?.toFixed(1) ?? "—"} kW
        </motion.div>
      )}

      {footer}
    </div>
  );
}

/**
 * `fresh` is about the timestamp, not the source — and the simulator always
 * produces a current one, so this read "Live" on a mock vehicle forever. That
 * is how a linked car showing Prague and 15 degrees to a driver in Greece
 * looked like a working live integration rather than a bug. `simulated` says
 * which it is; freshness now only chooses how alive the badge looks.
 */
/**
 * Says whether the car is being polled, and lets the driver stop it.
 *
 * Polling a linked car wakes it, so an open dashboard keeps it awake. The
 * counterpart in useVehicle stops on its own after ten idle minutes — this makes
 * that state visible, because silently stopping would look like the app had
 * frozen, and gives an immediate "let it sleep" for someone who is done looking.
 */
function SleepControl({
  active,
  pausedByIdle,
  onPause,
  onResume,
  t,
}: {
  active: boolean;
  pausedByIdle: boolean;
  onPause: () => void;
  onResume: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
      <span
        className={`size-2 shrink-0 rounded-full ${active ? "animate-pulse bg-chart-2" : "bg-muted-foreground"}`}
      />
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {active
          ? t("polling_active")
          : pausedByIdle
            ? t("polling_paused_idle")
            : t("polling_paused")}
      </p>
      <button
        onClick={active ? onPause : onResume}
        className="flex min-h-11 shrink-0 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm font-medium hover:bg-muted"
      >
        {active ? t("let_it_sleep") : t("resume_polling")}
      </button>
    </div>
  );
}

function LiveBadge({
  fresh,
  isFetching,
  label,
  simulated,
}: {
  fresh: boolean;
  isFetching?: boolean;
  label: string;
  simulated?: boolean;
}) {
  const dotColor = isFetching ? "bg-primary" : fresh ? "bg-chart-2" : "bg-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        simulated
          ? "bg-amber-500/15 text-amber-400"
          : fresh
            ? "bg-chart-2/15 text-chart-2"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {isFetching ? (
        <motion.span
          className={`size-1.5 rounded-full ${dotColor} animate-pulse`}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <span
          className={`size-1.5 rounded-full transition-colors ${
            simulated
              ? "bg-amber-400"
              : fresh
                ? "animate-pulse bg-chart-2"
                : "bg-muted-foreground"
          }`}
        />
      )}
      {label}
    </span>
  );
}

// --------------------------------------------------------------------------
// Stat chips row — compact info tiles
// --------------------------------------------------------------------------
interface ChipData {
  key: string;
  icon: React.ReactNode;
  value: string;
  label: string;
}

function StatChips({ state, isLoading }: { state: VehicleState | undefined; isLoading: boolean }) {
  const td = useTranslations("dashboard");

  if (isLoading) {
    return (
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-24 shrink-0 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!state) return null;

  const chips: ChipData[] = [
    state.latitude != null && state.longitude != null
      ? {
          key: "location",
          icon: <MapPin className="size-4 text-primary" />,
          value: mockLocationLabel(state.latitude, state.longitude),
          label: td("chip_location"),
        }
      : null,
    state.exteriorTempC != null
      ? {
          key: "temp",
          icon: (
            <Thermometer
              className={`size-4 ${
                state.exteriorTempC < 5
                  ? "text-primary"
                  : state.exteriorTempC <= 20
                    ? "text-muted-foreground"
                    : "text-chart-3"
              }`}
            />
          ),
          value: `${state.exteriorTempC.toFixed(0)}°C`,
          label: td("chip_temp"),
        }
      : null,
    state.odometerKm != null
      ? {
          key: "odometer",
          icon: <Zap className="size-4 text-primary" />,
          value:
            state.odometerKm > 0
              ? `${state.odometerKm.toFixed(1)} km`
              : "— km",
          label: td("chip_odometer"),
        }
      : null,
    state.lastSeenAt != null
      ? {
          key: "lastseen",
          icon: <RefreshCw className="size-4 text-muted-foreground" />,
          value: formatRelativeTime(state.lastSeenAt, td),
          label: td("chip_last_seen"),
        }
      : null,
  ].filter(Boolean) as ChipData[];

  if (chips.length === 0) return null;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x"
    >
      {chips.map((chip) => (
        <motion.div key={chip.key} variants={cardVariants} className="snap-center">
          <Card variant="muted" className="flex w-[96px] shrink-0 flex-col items-center gap-1 p-3">
            {chip.icon}
            <div className="w-full text-center text-sm font-semibold tabular-nums leading-tight truncate">
              {chip.value}
            </div>
            <div className="text-center text-2xs uppercase tracking-wide text-muted-foreground">{chip.label}</div>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}

function formatRelativeTime(
  isoString: string,
  t: (key: string, values?: Record<string, number>) => string
): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t("time_now");
  if (diffMin < 60) return t("time_min_ago", { m: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("time_hour_ago", { h: diffH });
  return t("time_day_ago", { d: Math.floor(diffH / 24) });
}

// --------------------------------------------------------------------------
// Quick actions — tidy horizontal row of chip/icon buttons
// --------------------------------------------------------------------------
function QuickActions({
  vehicleId,
  brand,
  state,
}: {
  vehicleId: string;
  brand: BrandKey;
  state: VehicleState | undefined;
}) {
  const t = useTranslations("commands");
  const td = useTranslations("dashboard");
  const caps = useBrandCapabilities(brand);
  const { mutate, isPending, variables } = useVehicleCommand();

  function send(command: CommandName) {
    mutate({ vehicleId, command });
  }

  const inFlight = (cmd: CommandName) => isPending && variables?.command === cmd;

  const climateActive = state?.isClimateOn ?? false;
  const climateCmd: CommandName = climateActive ? "climate_off" : "climate_on";
  const lockCmd: CommandName = state?.isLocked === false ? "lock" : "unlock";
  const stateLoaded = state != null;

  const actions = [
    caps.commands.climateOn &&
      caps.commands.climateOff && {
        key: "climate",
        cmd: climateCmd,
        icon: <Fan className="size-5" />,
        label: climateActive ? t("climate_off") : t("climate_on"),
        active: climateActive,
        inFlight: inFlight("climate_on") || inFlight("climate_off"),
        disabled: !stateLoaded || isPending,
      },
    caps.commands.lock &&
      caps.commands.unlock && {
        key: "lock",
        cmd: lockCmd,
        icon:
          stateLoaded && state?.isLocked === false ? (
            <Unlock className="size-5" />
          ) : (
            <Lock className="size-5" />
          ),
        label: stateLoaded ? (lockCmd === "lock" ? t("lock") : t("unlock")) : t("lock"),
        active: false,
        inFlight: inFlight("lock") || inFlight("unlock"),
        disabled: !stateLoaded || isPending,
      },
    {
      key: "charge",
      cmd: null as CommandName | null,
      icon: <BatteryCharging className="size-5" />,
      label: td("action_charge"),
      active: state?.chargingState === "charging",
      inFlight: false,
      disabled: false,
      href: `/charging`,
    },
  ].filter(Boolean) as {
    key: string;
    cmd: CommandName | null;
    icon: React.ReactNode;
    label: string;
    active: boolean;
    inFlight: boolean;
    disabled: boolean;
    href?: string;
  }[];

  return (
    <div className="flex justify-center gap-4">
      {actions.map((action) => (
        <motion.button
          key={action.key}
          whileTap={{ scale: 0.92 }}
          transition={TAP}
          disabled={action.disabled}
          title={action.label}
          aria-label={action.label}
          onClick={() => {
            if (action.href) {
              window.location.href = action.href;
              return;
            }
            if (action.cmd) send(action.cmd);
          }}
          className={`flex size-12 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
            action.active
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-border bg-card text-foreground hover:bg-muted"
          }`}
        >
          {action.inFlight ? (
            <RefreshCw className="size-5 animate-spin" />
          ) : (
            action.icon
          )}
        </motion.button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Charging overlay card — clamps/rounds battery to [0,100] (guard preserved)
// --------------------------------------------------------------------------
function ChargingOverlayCard({ state }: { state: VehicleState }) {
  const td = useTranslations("dashboard");
  const clampSoc = (v: number | null | undefined): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 0;
  const soc = clampSoc(state.batteryLevel);
  const target = clampSoc(state.chargeLimit ?? 100);

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <Card variant="surface" className="p-4">
        <div className="flex items-center gap-4">
          <CircularProgress value={soc} size={72} strokeWidth={6} color="var(--chart-2)">
            <span className="text-sm font-bold tabular-nums">{soc}%</span>
          </CircularProgress>
          <div className="flex-1 space-y-1">
            <div className="font-semibold text-chart-2">
              {td("charging_active")}
            </div>
            <div className="text-sm tabular-nums text-muted-foreground">
              {soc}% → {target}%
            </div>
            {state.chargingRateKw != null && (
              <div className="text-sm tabular-nums text-muted-foreground">
                {state.chargingRateKw.toFixed(1)} kW
              </div>
            )}
            {state.timeToFullMinutes != null && state.timeToFullMinutes > 0 && (
              <div className="text-sm tabular-nums text-muted-foreground">
                {formatMinutes(state.timeToFullMinutes)} {td("charging_remaining")}
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// --------------------------------------------------------------------------
// Main export
// --------------------------------------------------------------------------
export function DashboardClient({ checklist }: DashboardClientProps) {
  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicle = vehicles?.find((v) => v.id === selectedVehicleId);
  const vehicleId = selectedVehicleId ?? "";
  const vehicleName = vehicle ? (vehicle.nickname ?? vehicle.displayName) : "";
  const brand = (vehicle?.brand ?? "tesla") as BrandKey;

  const isLive = vehicle?.dataSource === "live";
  const { data, isLoading, isFetching, isError, error, refetch, polling } = useVehicle(
    vehicleId,
    isLive,
  );
  // Tesla revoked us, as opposed to the car simply not answering.
  const needsTeslaReauth =
    error instanceof ApiError && error.code === "TESLA_REAUTH_REQUIRED";
  const td = useTranslations("dashboard");
  const { isPulling } = usePullToRefresh(null, refetch, { disabled: isFetching });

  // Ambient body tinting based on battery state
  useEffect(() => {
    const body = document.body;
    const allAmbient = ["ambient-full", "ambient-low", "ambient-charging"] as const;

    if (!data) {
      allAmbient.forEach((cls) => body.classList.remove(cls));
      return;
    }

    const level = data.batteryLevel ?? 0;
    const isCharging = data.chargingState === "charging";

    body.classList.remove(...allAmbient);
    if (isCharging) {
      body.classList.add("ambient-charging");
    } else if (level >= 80) {
      body.classList.add("ambient-full");
    } else if (level <= 20) {
      body.classList.add("ambient-low");
    }

    return () => {
      allAmbient.forEach((cls) => body.classList.remove(cls));
    };
  }, [data]);

  const showLocation = data?.latitude != null && data?.longitude != null;

  if (!vehicleId) {
    return (
      <PageWrapper className="relative mx-auto max-w-xl gap-2.5 px-0">
        <OnboardingOverlay />
        <GettingStartedCard data={checklist} />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="relative mx-auto max-w-xl gap-2.5 px-0">
      <OnboardingOverlay />

      <AnimatePresence>
        {(isPulling || isFetching) && (
          <motion.div
            key="ptr-indicator"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-2 left-1/2 z-10 -translate-x-1/2 md:hidden"
          >
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </motion.div>
        )}
      </AnimatePresence>

      <VehicleNotifications vehicleId={vehicleId} />

      <GettingStartedCard data={checklist} />

      <HeroCard
        state={data}
        isLoading={isLoading}
        isFetching={isFetching}
        vehicleName={vehicleName}
        simulated={!isLive}
        footer={
          // Inside the card, because it is a property of this car — it sat
          // beside it as a sibling panel, reading like an app-wide setting.
          //
          // Hidden when the car cannot be reached: polling has stopped anyway
          // (useVehicle drops the interval on error), so "live updates on, this
          // keeps the car awake" printed directly above "we couldn't contact
          // the car" claimed something untrue. The error card's Retry is the
          // control that makes sense there.
          // Also hidden while the first read is in flight: before anything has
          // come back there is nothing being kept awake, and asserting there is
          // — beside a screen of empty placeholders — reads as a car that is
          // present but broken.
          isLive && !isError && !isLoading ? (
            <div className="mt-5">
              <SleepControl
                active={polling.active}
                pausedByIdle={polling.pausedByIdle}
                onPause={polling.pause}
                onResume={() => {
                  polling.resume();
                  void refetch();
                }}
                t={td}
              />
            </div>
          ) : undefined
        }
      />

      {isError && needsTeslaReauth ? (
        // Revoking access from a Tesla account is not a connectivity problem,
        // and "check your connection and try again" is advice that can never
        // work for it. The only way back is re-authorising.
        <Card variant="surface" className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle className="size-8 text-amber-400" />
          <div>
            <div className="font-medium">{td("reauth_title")}</div>
            <p className="mt-1 text-sm text-muted-foreground">{td("reauth_subtitle")}</p>
          </div>
          <Link
            href="/connect/tesla"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {td("reauth_action")}
          </Link>
        </Card>
      ) : isError ? (
        <Card variant="surface" className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle className="size-8 text-destructive" />
          <div>
            <div className="font-medium">{td("error_title")}</div>
            <p className="mt-1 text-sm text-muted-foreground">{td("error_subtitle")}</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            transition={TAP}
            onClick={() => refetch()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {td("retry")}
          </motion.button>
        </Card>
      ) : (
        <>
          <QuickActions vehicleId={vehicleId} brand={brand} state={data} />

          {data?.chargingState === "charging" && (
            <ChargingOverlayCard state={data} />
          )}

          <StatChips state={data} isLoading={isLoading} />

          {showLocation && data && (
            <ListRow
              leading={<MapPin className="size-4 text-primary" />}
              title={mockLocationLabel(data.latitude!, data.longitude!)}
              meta={td("chip_location")}
            />
          )}
        </>
      )}
    </PageWrapper>
  );
}
