"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BatteryCharging,
  Fan,
  History,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Thermometer,
  Unlock,
  Zap,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { CircularProgress } from "@/components/ui/circular-progress";
import { GlassCard } from "@/components/ui/glass-card";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleNotifications } from "@/components/notifications/VehicleNotifications";
import { type ChecklistData } from "@/components/onboarding/GettingStartedCard";
import { OnboardingOverlay } from "@/components/onboarding/OnboardingOverlay";
import { useBrandCapabilities } from "@/hooks/useBrandCapabilities";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { cardVariants, staggerContainer } from "@/lib/animations/variants";
import type { BrandKey } from "@/lib/brands/types";
import { mockLocationLabel } from "@/lib/mock/location-label";
import type { CommandName } from "@/types/history";
import type { VehicleState } from "@/types/vehicle";

interface LastCharge {
  endedAt: string;
  energyKwh: number | null;
  startSoc: number | null;
  endSoc: number | null;
}

interface DashboardClientProps {
  vehicleId: string;
  vehicleName: string;
  brand: BrandKey;
  model?: string;
  checklist: ChecklistData;
  lastCharge?: LastCharge;
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

function getSocColor(level: number): string {
  if (level > 50) return "bg-emerald-500";
  if (level > 20) return "bg-amber-500";
  return "bg-red-500";
}

// --------------------------------------------------------------------------
// Hero card — floats directly on the page background (no card chrome)
// --------------------------------------------------------------------------
function HeroCard({ state, isLoading, isFetching, vehicleName }: { state: VehicleState | undefined; isLoading: boolean; isFetching: boolean; vehicleName: string }) {
  const td = useTranslations("dashboard");
  const rawSoc = state?.batteryLevel;
  const displayBattery =
    typeof rawSoc === "number" && rawSoc >= 0 && rawSoc <= 100
      ? Math.round(rawSoc)
      : "—";
  const soc = typeof displayBattery === "number" ? displayBattery : 0;
  const fresh = state ? isDataFresh(state.recordedAt) : false;

  return (
    <div className="relative overflow-hidden px-4 py-4 md:px-6 md:py-6">
      {/* Header row */}
      <div className="relative mb-2 flex items-center justify-between gap-2 md:mb-6">
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{vehicleName}</h1>
        {isLoading ? (
          <Skeleton className="h-5 w-14 rounded-full" />
        ) : (
          <LiveBadge fresh={fresh} isFetching={isFetching} label={td("live_label")} />
        )}
      </div>

      {/* SOC % — ambient numbers hero */}
      <div className="relative flex flex-col items-center gap-0.5">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-36 rounded-xl" />
            <Skeleton className="h-6 w-24 rounded-xl" />
          </>
        ) : (
          <>
            <div className="text-7xl font-thin tracking-tight tabular-nums leading-none">
              {displayBattery}
              {typeof displayBattery === "number" && (
                <span className="ml-1 text-xl text-muted-foreground">%</span>
              )}
            </div>
            {state?.batteryRangeKm != null && (
              <div className="text-lg font-light text-muted-foreground">
                {Math.round(state.batteryRangeKm)} km
              </div>
            )}
          </>
        )}
      </div>

      {/* SOC progress bar */}
      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/10 md:mt-6">
        <motion.div
          className={`h-full rounded-full ${isLoading ? "bg-white/20" : getSocColor(soc)}`}
          initial={{ width: 0 }}
          animate={{ width: isLoading ? "30%" : `${soc}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        {state?.chargeLimit != null && (
          <div
            className="absolute inset-y-0 w-px bg-white/40"
            style={{ left: `${state.chargeLimit}%` }}
          />
        )}
      </div>

      {/* Charging state label */}
      {state?.chargingState === "charging" && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-center text-xs font-medium uppercase tracking-wider text-emerald-400"
        >
          {td("charging_active")} · {state.chargingRateKw?.toFixed(1) ?? "—"} kW
        </motion.div>
      )}
    </div>
  );
}

function LiveBadge({ fresh, isFetching, label }: { fresh: boolean; isFetching?: boolean; label: string }) {
  const dotColor = isFetching ? "bg-blue-400" : fresh ? "bg-emerald-400" : "bg-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        fresh
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-white/8 text-muted-foreground"
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
          className={`size-1.5 rounded-full transition-colors ${fresh ? "animate-pulse bg-emerald-400" : "bg-muted-foreground"}`}
        />
      )}
      {label}
    </span>
  );
}

// --------------------------------------------------------------------------
// Stat chips row
// --------------------------------------------------------------------------
interface ChipData {
  key: string;
  icon: React.ReactNode;
  value: string;
  label: string;
}

function StatChips({ state, isLoading, lastCharge }: { state: VehicleState | undefined; isLoading: boolean; lastCharge?: LastCharge }) {
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
                  ? "text-blue-400"
                  : state.exteriorTempC <= 20
                    ? "text-muted-foreground"
                    : "text-amber-400"
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
          icon: <Zap className="size-4 text-blue-400" />,
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
    lastCharge
      ? {
          key: "lastcharge",
          icon: <History className="size-4 text-emerald-400" />,
          value: lastCharge.energyKwh != null
            ? `+${lastCharge.energyKwh.toFixed(1)} kWh`
            : formatRelativeTime(lastCharge.endedAt, td),
          label: td("chip_last_charge"),
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
          <div className="flex w-[96px] shrink-0 flex-col items-center gap-1 rounded-2xl bg-white/[0.04] border border-white/6 p-2.5">
            {chip.icon}
            <div className="w-full text-center text-sm font-semibold tabular-nums leading-tight truncate">
              {chip.value}
            </div>
            <div className="text-center text-xs text-muted-foreground">{chip.label}</div>
          </div>
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
// Quick actions — circular icon-only buttons
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
      href: `/charging?v=${vehicleId}`,
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
          whileTap={{ scale: 0.9 }}
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
          className={`size-9 rounded-full backdrop-blur-sm transition-colors disabled:opacity-50 flex items-center justify-center ${
            action.active
              ? "bg-primary/20 text-primary"
              : "bg-white/8 text-foreground hover:bg-white/[0.14]"
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
// Charging overlay card
// --------------------------------------------------------------------------
function ChargingOverlayCard({ state }: { state: VehicleState }) {
  const td = useTranslations("dashboard");
  const soc = state.batteryLevel ?? 0;
  const target = state.chargeLimit ?? 100;

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <GlassCard animate={false} className="p-4">
        <div className="flex items-center gap-4">
          <CircularProgress value={soc} size={72} strokeWidth={6} color="oklch(0.68 0.18 162)">
            <span className="text-sm font-bold tabular-nums">{soc}%</span>
          </CircularProgress>
          <div className="flex-1 space-y-1">
            <div className="font-semibold text-emerald-400">
              {td("charging_active")}
            </div>
            <div className="text-sm text-muted-foreground">
              {soc}% → {target}%
            </div>
            {state.chargingRateKw != null && (
              <div className="text-sm text-muted-foreground">
                {state.chargingRateKw.toFixed(1)} kW
              </div>
            )}
            {state.timeToFullMinutes != null && state.timeToFullMinutes > 0 && (
              <div className="text-sm text-muted-foreground">
                {formatMinutes(state.timeToFullMinutes)} {td("charging_remaining")}
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// --------------------------------------------------------------------------
// Main export
// --------------------------------------------------------------------------
export function DashboardClient({ vehicleId, vehicleName, brand, model: _model, checklist: _checklist, lastCharge }: DashboardClientProps) {
  const { data, isLoading, isFetching, isError, refetch } = useVehicle(vehicleId);
  const td = useTranslations("dashboard");
  const containerRef = useRef<HTMLElement>(null);
  const { isPulling } = usePullToRefresh(containerRef, refetch, { disabled: isFetching });

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

  return (
    <PageWrapper className="relative mx-auto max-w-xl gap-4 px-0">
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

      <HeroCard state={data} isLoading={isLoading} isFetching={isFetching} vehicleName={vehicleName} />

      <StatChips state={data} isLoading={isLoading} lastCharge={lastCharge} />

      {isError ? (
        <GlassCard animate={false} className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle className="size-8 text-destructive" />
          <div>
            <div className="font-medium">{td("error_title")}</div>
            <p className="mt-1 text-sm text-muted-foreground">{td("error_subtitle")}</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => refetch()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {td("retry")}
          </motion.button>
        </GlassCard>
      ) : (
        <>
          <QuickActions vehicleId={vehicleId} brand={brand} state={data} />

          {data?.chargingState === "charging" && (
            <ChargingOverlayCard state={data} />
          )}
        </>
      )}
    </PageWrapper>
  );
}
