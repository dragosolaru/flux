"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  Loader2,
  MapPin,
  RefreshCw,
  Thermometer,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect} from "react";
import { useTranslations } from "next-intl";

import { CircularProgress } from "@/components/ui/circular-progress";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleRecordCard } from "@/components/vehicle/VehicleRecordCard";
import { VehicleNotifications } from "@/components/notifications/VehicleNotifications";
import { GettingStartedCard, type ChecklistData } from "@/components/onboarding/GettingStartedCard";
import { OnboardingOverlay } from "@/components/onboarding/OnboardingOverlay";
import { Card, ListRow} from "@/components/ui-kit";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { cardVariants, staggerContainer } from "@/lib/animations/variants";
import { mockLocationLabel } from "@/lib/mock/location-label";
import type { VehicleState } from "@/types/vehicle";

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
  footer,
}: {
  state: VehicleState | undefined;
  isLoading: boolean;
  isFetching: boolean;
  vehicleName: string;
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
  const charging = state?.chargingState === "charging";

  return (
    <div className="relative overflow-hidden px-4 py-4 md:px-6 md:py-6">
      {/* Header row */}
      <div className="relative mb-2 flex items-center justify-between gap-2 md:mb-6">
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{vehicleName}</h1>
        {isLoading ? (
          <Skeleton className="h-5 w-14 rounded-full" />
        ) : (
          <DemoBadge isFetching={isFetching} />
        )}
      </div>

      {/* SOC % — ambient numbers hero */}
      <div className="relative flex flex-col items-center gap-0.5">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-36 rounded-xl" />
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
 * Says this is the simulator.
 *
 * It used to be a LiveBadge with two modes, and the second one is why an empty
 * screen shipped wearing a green "Live" label: `fresh` is about the timestamp,
 * not the source, and the simulator always produces a current one — so a car we
 * never read looked freshly reported. Only the demo reaches this now, so the
 * mode that could lie is deleted rather than left unreachable.
 */
function DemoBadge({ isFetching }: { isFetching?: boolean }) {
  const td = useTranslations("dashboard");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400">
      {isFetching ? (
        <motion.span
          className="size-1.5 animate-pulse rounded-full bg-amber-400"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <span className="size-1.5 rounded-full bg-amber-400" />
      )}
      {td("demo_label")}
    </span>
  );
}

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
  const router = useRouter();
  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicle = vehicles?.find((v) => v.id === selectedVehicleId);
  const vehicleId = selectedVehicleId ?? "";
  const vehicleName = vehicle ? (vehicle.nickname ?? vehicle.displayName) : "";

  const isReal = vehicle?.dataSource === "real";
  // A linked car is a record with no telemetry: nothing about it changes, so
  // there is nothing to poll for. The simulator does change, and is our own
  // database, so it polls.
  const { data, isLoading, isFetching, isError, refetch } = useVehicle(
    vehicleId,
    !isReal,
  );
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

      {isError ? (
        // Without this the screen showed "—" and nothing else on a failed read,
        // which is indistinguishable from a car with no data — and one of those
        // is worth retrying. The reauth banner that used to live here went with
        // the Tesla integration and took the whole error branch with it.
        <Card variant="surface" className="flex flex-col items-center gap-3 p-10 text-center">
          <div>
            <div className="font-medium">{td("error_title")}</div>
            <p className="mt-1 text-sm text-muted-foreground">{td("error_subtitle")}</p>
          </div>
          <button
            onClick={() => void refetch()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {td("retry")}
          </button>
        </Card>
      ) : (
        <>
      {isReal ? (
        // Two different things share this screen. A real car is a record — its
        // first screen is what the paperwork says. The simulator is the demo,
        // and a battery hero is exactly what a demo should show.
        <>
          <div className="px-1 pb-3 pt-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">{vehicleName}</h1>
          </div>
          <VehicleRecordCard vehicleId={vehicleId} />
        </>
      ) : (
        <>
          <HeroCard
            state={data}
            isLoading={isLoading}
            isFetching={isFetching}
            vehicleName={vehicleName}
          />

          {data?.chargingState === "charging" && <ChargingOverlayCard state={data} />}

          <StatChips state={data} isLoading={isLoading} />
        </>
      )}

      {!isReal && showLocation && data && (
        // Tappable. It showed a coordinate-derived label and did nothing,
        // which is the wrong half of "where is my car" — the question is
        // almost always asked while walking towards it.
        <ListRow
          leading={<MapPin className="size-4 text-primary" />}
          title={mockLocationLabel(data.latitude!, data.longitude!)}
          meta={td("find_car")}
          trailing={<ChevronRight className="size-4 text-muted-foreground" />}
          onClick={() =>
            router.push(`/map?lat=${data.latitude}&lng=${data.longitude}&car=1`)
          }
        />
      )}
        </>
      )}
    </PageWrapper>
  );
}
