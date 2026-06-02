"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  BatteryCharging,
  Fan,
  Lock,
  MapPin,
  RefreshCw,
  Thermometer,
  Unlock,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { CircularProgress } from "@/components/ui/circular-progress";
import { GlassCard } from "@/components/ui/glass-card";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleNotifications } from "@/components/notifications/VehicleNotifications";
import { GettingStartedCard, type ChecklistData } from "@/components/onboarding/GettingStartedCard";
import { useBrandCapabilities } from "@/hooks/useBrandCapabilities";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { cardVariants, staggerContainer } from "@/lib/animations/variants";
import type { BrandKey } from "@/lib/brands/types";
import type { CommandName } from "@/types/history";
import type { VehicleState } from "@/types/vehicle";

interface DashboardClientProps {
  vehicleId: string;
  vehicleName: string;
  brand: BrandKey;
  model?: string;
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

function getSocColor(level: number): string {
  if (level > 50) return "bg-emerald-500";
  if (level > 20) return "bg-amber-500";
  return "bg-red-500";
}

// --------------------------------------------------------------------------
// Hero card
// --------------------------------------------------------------------------
function HeroCard({ state, isLoading, vehicleName }: { state: VehicleState | undefined; isLoading: boolean; vehicleName: string }) {
  const td = useTranslations("dashboard");
  const soc = state?.batteryLevel ?? 0;
  const fresh = state ? isDataFresh(state.recordedAt) : false;

  return (
    <GlassCard
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950/80 to-slate-900/80 p-6"
      animate={false}
    >
      {/* glassmorphism overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/10 bg-white/[0.03]" />

      {/* Header row */}
      <div className="relative mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">{vehicleName}</h1>
        {isLoading ? (
          <Skeleton className="h-5 w-14 rounded-full" />
        ) : (
          <LiveBadge fresh={fresh} label={td("live_label")} />
        )}
      </div>

      {/* SOC % */}
      <div className="relative flex flex-col items-center gap-2">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-32 rounded-xl" />
            <Skeleton className="h-6 w-24 rounded-xl" />
          </>
        ) : (
          <>
            <div className="text-7xl font-bold tabular-nums leading-none">
              {soc}
              <span className="ml-1 text-3xl text-muted-foreground">%</span>
            </div>
            {state?.batteryRangeKm != null && (
              <div className="text-2xl text-muted-foreground">
                {Math.round(state.batteryRangeKm)} km
              </div>
            )}
          </>
        )}
      </div>

      {/* SOC progress bar */}
      <div className="relative mt-6 h-2.5 overflow-hidden rounded-full bg-white/10">
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
          className="mt-2 text-center text-xs font-medium uppercase tracking-wider text-emerald-400"
        >
          {td("charging_active")} · {state.chargingRateKw?.toFixed(1) ?? "—"} kW
        </motion.div>
      )}
    </GlassCard>
  );
}

function LiveBadge({ fresh, label }: { fresh: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        fresh
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-white/8 text-muted-foreground"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          fresh ? "animate-pulse bg-emerald-400" : "bg-muted-foreground"
        }`}
      />
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

function StatChips({ state, isLoading }: { state: VehicleState | undefined; isLoading: boolean }) {
  const td = useTranslations("dashboard");

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-28 shrink-0 rounded-2xl" />
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
          value: `${state.latitude.toFixed(2)}, ${state.longitude.toFixed(2)}`,
          label: td("chip_location"),
        }
      : null,
    state.exteriorTempC != null
      ? {
          key: "temp",
          icon: <Thermometer className="size-4 text-amber-400" />,
          value: `${state.exteriorTempC.toFixed(0)}°C`,
          label: td("chip_temp"),
        }
      : null,
    state.odometerKm != null
      ? {
          key: "odometer",
          icon: <Zap className="size-4 text-blue-400" />,
          value: `${Math.round(state.odometerKm).toLocaleString()} km`,
          label: td("chip_odometer"),
        }
      : null,
    state.lastSeenAt != null
      ? {
          key: "lastseen",
          icon: <RefreshCw className="size-4 text-muted-foreground" />,
          value: formatRelativeTime(state.lastSeenAt),
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
      className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x"
    >
      {chips.map((chip) => (
        <motion.div key={chip.key} variants={cardVariants} className="snap-center">
          <GlassCard
            animate={false}
            className="flex w-[112px] shrink-0 flex-col items-center gap-1.5 p-4"
          >
            {chip.icon}
            <div className="text-center text-sm font-semibold tabular-nums leading-tight">
              {chip.value}
            </div>
            <div className="text-center text-xs text-muted-foreground">{chip.label}</div>
          </GlassCard>
        </motion.div>
      ))}
    </motion.div>
  );
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

// --------------------------------------------------------------------------
// Quick actions
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
    <div className="grid grid-cols-3 gap-3">
      {actions.map((action) => (
        <motion.button
          key={action.key}
          whileTap={{ scale: 0.95 }}
          disabled={action.disabled}
          onClick={() => {
            if (action.href) {
              window.location.href = action.href;
              return;
            }
            if (action.cmd) send(action.cmd);
          }}
          className={`glass-card flex min-h-[52px] flex-col items-center justify-center gap-1.5 rounded-2xl p-3 transition-colors disabled:opacity-50 ${
            action.active
              ? "border-primary/40 bg-primary/15 text-primary"
              : "text-foreground hover:bg-white/5"
          }`}
        >
          {action.inFlight ? (
            <RefreshCw className="size-5 animate-spin" />
          ) : (
            action.icon
          )}
          <span className="text-xs font-medium">{action.label}</span>
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
      <GlassCard animate={false} className="p-5">
        <div className="flex items-center gap-4">
          <CircularProgress value={soc} size={80} strokeWidth={6} color="oklch(0.68 0.18 162)">
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
export function DashboardClient({ vehicleId, vehicleName, brand, model: _model, checklist }: DashboardClientProps) {
  const { data, isLoading, isError, refetch } = useVehicle(vehicleId);
  const td = useTranslations("dashboard");

  return (
    <PageWrapper className="mx-auto max-w-xl gap-4 px-0">
      <VehicleNotifications vehicleId={vehicleId} />

      <GettingStartedCard data={checklist} />

      <HeroCard state={data} isLoading={isLoading} vehicleName={vehicleName} />

      <StatChips state={data} isLoading={isLoading} />

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
