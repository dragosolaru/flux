"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Activity, BatteryFull, Gauge, Leaf } from "lucide-react";

import { PageWrapper } from "@/components/layout/page-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeader,
  SectionHeader,
  Card,
  StatTile,
  EmptyState,
  SegmentedControl,
} from "@/components/ui-kit";
import { useCosts } from "@/hooks/useCosts";
import { useStats } from "@/hooks/useStats";
import { useVehicle } from "@/hooks/useVehicle";
import { useCurrency } from "@/hooks/useCurrency";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { cardVariants, staggerContainer } from "@/lib/animations/variants";
import type { BatteryHealthPoint } from "@/app/api/vehicles/[vehicleId]/battery-health/route";
import { useQuery } from "@tanstack/react-query";
import * as vehiclesApi from "@/lib/api/vehicles";
import type { ConsumptionPeriod, MileagePeriod, TempBucket } from "@/types/stats";

// ─── Constants ────────────────────────────────────────────────────────────────

// Romanian national average: 7 L petrol per 100 km, 2.36 kg CO₂ per litre
const PETROL_L_PER_100KM = 7;
const CO2_KG_PER_L_PETROL = 2.36;
// Average temperate-climate tree absorbs ~21 kg CO₂ per year
const CO2_KG_PER_TREE_YEAR = 21;

type Period = "7d" | "30d" | "1y" | "all";

function periodFrom(p: Period): string | undefined {
  if (p === "all") return undefined;
  const days = p === "7d" ? 7 : p === "30d" ? 30 : 365;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const ROW_SCROLL = "flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

// ─── Savings section ──────────────────────────────────────────────────────────

interface SavingsSectionProps {
  vehicleId: string;
  from: string | undefined;
}

function SavingsSection({ vehicleId, from }: SavingsSectionProps) {
  const t = useTranslations("insights");
  const { fromRON } = useCurrency();
  const { data, isLoading } = useCosts(vehicleId, from);

  if (isLoading) return <Skeleton className="h-20 w-full rounded-2xl" />;

  const totalKm = data?.totalKm ?? 0;
  const electricCostRon = data?.totalCostRon ?? 0;
  const petrolCostRon = data?.petrolEquivalentCostRon ?? 0;
  const savedRon = petrolCostRon - electricCostRon;
  const fuelSavedL = (totalKm * PETROL_L_PER_100KM) / 100;
  const co2SavedKg = fuelSavedL * CO2_KG_PER_L_PETROL;
  const treesEq = co2SavedKg / CO2_KG_PER_TREE_YEAR;

  const hasData = totalKm > 0;

  return (
    <div className={ROW_SCROLL}>
      <StatTile
        className="min-w-[100px] flex-1 snap-start"
        value={hasData ? fromRON(Math.max(0, savedRon), 0) : "—"}
        label={t("saved_ron")}
        accent="text-chart-2"
      />
      <StatTile
        className="min-w-[100px] flex-1 snap-start"
        value={hasData ? `${fuelSavedL.toFixed(0)} L` : "—"}
        label={t("fuel_saved")}
        accent="text-chart-3"
      />
      <StatTile
        className="min-w-[100px] flex-1 snap-start"
        value={hasData ? `${co2SavedKg.toFixed(0)} kg` : "—"}
        label={t("co2_avoided")}
        accent="text-chart-2"
      />
      <StatTile
        className="min-w-[100px] flex-1 snap-start"
        value={hasData ? `${treesEq.toFixed(1)}` : "—"}
        label={t("trees_equivalent")}
        accent="text-chart-2"
      />
      <StatTile
        className="min-w-[100px] flex-1 snap-start"
        value={totalKm > 0 ? `${Math.round(totalKm).toLocaleString()} km` : "—"}
        label={t("electric_km")}
      />
    </div>
  );
}

// ─── Activity section ─────────────────────────────────────────────────────────

interface ActivitySectionProps {
  vehicleId: string;
  from: string | undefined;
}

/**
 * What each month cost in energy, and what that worked out to per 100 km.
 *
 * Distance was already charted per month and energy was not, though every trip
 * carries it — so the app said how far the car had gone and never what that
 * took. The bars are kWh; the number under the total is the month's own
 * kWh/100km, computed from its totals rather than averaged across trips, so a
 * two-kilometre errand does not weigh the same as a four-hundred-kilometre run.
 */
function ConsumptionChart({ months }: { months: ConsumptionPeriod[] }) {
  const t = useTranslations("insights");
  const visible = months.slice(-12);
  if (visible.length === 0) return null;
  const maxKwh = Math.max(...visible.map((m) => m.kwh), 1);
  const SHORT = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Totals over the visible window, not an average of averages.
  const totalKwh = visible.reduce((sum, m) => sum + m.kwh, 0);
  const totalKm = visible.reduce((sum, m) => sum + m.km, 0);
  const overall = totalKm > 0 ? (totalKwh / totalKm) * 100 : null;

  return (
    <Card variant="surface" className="p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium">{t("consumption_title")}</span>
        {overall != null && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {overall.toFixed(1)} kWh/100 km
          </span>
        )}
      </div>
      <div className="flex h-24 items-end gap-1.5 pb-5">
        {visible.map((m) => {
          const monthIdx = parseInt(m.period.slice(5)) - 1;
          const label = SHORT[monthIdx] ?? m.period.slice(5);
          return (
            <div
              key={m.period}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
              title={`${m.kwh} kWh · ${m.km} km${
                m.kwhPer100km != null ? ` · ${m.kwhPer100km} kWh/100km` : ""
              }`}
            >
              <div
                className="w-full rounded-t"
                style={{
                  height: `${(m.kwh / maxKwh) * 100}%`,
                  minHeight: m.kwh > 0 ? 3 : 0,
                  background: "linear-gradient(to bottom, var(--chart-3), var(--chart-1))",
                  opacity: 0.8,
                }}
              />
              <span className="absolute -bottom-5 left-0 right-0 text-center text-2xs text-muted-foreground tabular-nums">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MileageChart({ months }: { months: MileagePeriod[] }) {
  const visible = months.slice(-12);
  if (visible.length === 0) return null;
  const maxKm = Math.max(...visible.map((m) => m.km), 1);

  return (
    <Card variant="surface" className="p-3">
      <div className="flex h-24 items-end gap-1.5 pb-5">
        {visible.map((m) => {
          const monthIdx = parseInt(m.period.slice(5)) - 1;
          const SHORT = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const label = SHORT[monthIdx] ?? m.period.slice(5);
          const heightPct = (m.km / maxKm) * 100;
          return (
            <div
              key={m.period}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
            >
              <div
                className="w-full rounded-t"
                style={{
                  height: `${heightPct}%`,
                  minHeight: m.km > 0 ? 3 : 0,
                  background: "linear-gradient(to bottom, var(--chart-1), var(--chart-2))",
                  opacity: 0.8,
                }}
              />
              <span className="absolute -bottom-5 left-0 right-0 text-center text-2xs text-muted-foreground tabular-nums">
                {label}
              </span>
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-border bg-background/80 px-2.5 py-1.5 text-2xs tabular-nums shadow-lg backdrop-blur-sm group-hover:block">
                {Math.round(m.km)} km
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ActivitySection({ vehicleId, from }: ActivitySectionProps) {
  const t = useTranslations("insights");
  const { data, isLoading } = useStats(vehicleId, from);

  if (isLoading) return <Skeleton className="h-28 w-full rounded-2xl" />;

  const hasData = (data?.tripCount ?? 0) > 0 || (data?.chargingSessionCount ?? 0) > 0;

  if (!hasData) return <EmptyState icon={Activity} title={t("no_activity_data")} />;

  const drivingH = data?.totalDrivingH ?? 0;
  const drivingHLabel = drivingH < 1
    ? `${Math.round(drivingH * 60)} min`
    : `${drivingH.toFixed(1)} h`;

  return (
    <div className="space-y-3">
      <div className={ROW_SCROLL}>
        <StatTile
          className="min-w-[100px] flex-1 snap-start"
          value={data ? `${Math.round(data.totalDrivingKm).toLocaleString()} km` : "—"}
          label={t("driving_km")}
          accent="text-primary"
        />
        <StatTile
          className="min-w-[100px] flex-1 snap-start"
          value={data ? drivingHLabel : "—"}
          label={t("driving_hours")}
        />
        <StatTile
          className="min-w-[100px] flex-1 snap-start"
          value={data ? String(data.tripCount) : "—"}
          label={t("trips")}
        />
        <StatTile
          className="min-w-[100px] flex-1 snap-start"
          value={data?.totalEnergyAddedKwh ? `${data.totalEnergyAddedKwh.toFixed(1)} kWh` : "—"}
          label={t("energy_charged")}
          accent="text-chart-2"
        />
      </div>
      {data && data.mileageByMonth.length > 1 && (
        <MileageChart months={data.mileageByMonth} />
      )}
      {data && data.consumptionByMonth.length > 1 && (
        <ConsumptionChart months={data.consumptionByMonth} />
      )}
    </div>
  );
}

// ─── Battery health section ───────────────────────────────────────────────────

function BatteryHealthSparkline({ points }: { points: BatteryHealthPoint[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.sohPct);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const range = max - min || 1;
  const W = 280;
  const H = 56;

  const pathD = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <path
        d={pathD}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface BatterySectionProps {
  vehicleId: string;
}

function BatterySection({ vehicleId }: BatterySectionProps) {
  const t = useTranslations("insights");
  const { data: vehicleState } = useVehicle(vehicleId, true, false);
  const { data: history, isLoading } = useQuery<BatteryHealthPoint[]>({
    queryKey: ["battery-health", vehicleId],
    queryFn: () => vehiclesApi.getBatteryHealth<BatteryHealthPoint>(vehicleId),
    staleTime: 5 * 60_000,
  });
  const { data: stats } = useStats(vehicleId);

  if (isLoading) return <Skeleton className="h-28 w-full rounded-2xl" />;

  const currentSoh =
    history && history.length > 0
      ? history[history.length - 1].sohPct
      : (vehicleState?.batteryHealthPct ?? null);

  const vampire = stats?.vampireDrainPctPerH ?? null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <StatTile
          className="flex-1"
          value={currentSoh != null ? `${currentSoh.toFixed(1)}%` : "—"}
          label={t("battery_soh")}
          accent={
            currentSoh == null
              ? undefined
              : currentSoh >= 90
                ? "text-chart-2"
                : currentSoh >= 80
                  ? "text-chart-3"
                  : "text-destructive"
          }
        />
        <StatTile
          className="flex-1"
          value={vampire != null ? `${vampire.toFixed(3)}%/h` : "—"}
          label={t("vampire_drain")}
        />
      </div>
      {history && history.length >= 2 ? (
        <Card variant="surface" className="p-3">
          <BatteryHealthSparkline points={history} />
        </Card>
      ) : (
        <EmptyState icon={BatteryFull} title={t("no_battery_data")} />
      )}
    </div>
  );
}

// ─── Efficiency section ───────────────────────────────────────────────────────

function TempChart({ buckets }: { buckets: TempBucket[] }) {
  const maxWh = Math.max(...buckets.map((b) => b.avgWhPerKm), 1);
  return (
    <Card variant="surface" className="p-3">
      <div className="flex h-20 items-end gap-2 pb-5">
        {buckets.map((b) => {
          const heightPct = (b.avgWhPerKm / maxWh) * 100;
          return (
            <div
              key={b.label}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
            >
              <div
                className="w-full rounded-t"
                style={{
                  height: `${heightPct}%`,
                  minHeight: 4,
                  background: "linear-gradient(to bottom, var(--chart-2), var(--primary))",
                  opacity: 0.8,
                }}
              />
              <span className="absolute -bottom-5 left-0 right-0 text-center text-2xs text-muted-foreground whitespace-nowrap">
                {b.label}
              </span>
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-border bg-background/80 px-2.5 py-1.5 text-2xs tabular-nums shadow-lg backdrop-blur-sm group-hover:block">
                {Math.round(b.avgWhPerKm)} Wh/km
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

interface EfficiencySectionProps {
  vehicleId: string;
  from: string | undefined;
}

function EfficiencySection({ vehicleId, from }: EfficiencySectionProps) {
  const t = useTranslations("insights");
  const { data: stats, isLoading } = useStats(vehicleId, from);
  const { data: vehicleState } = useVehicle(vehicleId, true, false);

  if (isLoading) return <Skeleton className="h-20 w-full rounded-2xl" />;

  const avgWh = stats?.avgWhPerKm ?? null;
  const projected = vehicleState?.batteryRangeKm ?? null;
  const byTemp = stats?.efficiencyByTemp ?? [];

  const hasData = avgWh != null || projected != null || byTemp.length > 0;
  if (!hasData) return <EmptyState icon={Gauge} title={t("no_efficiency_data")} />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <StatTile
          className="flex-1"
          value={avgWh != null ? `${Math.round(avgWh)} Wh/km` : "—"}
          label={t("avg_wh_per_km")}
          accent="text-chart-3"
        />
        <StatTile
          className="flex-1"
          value={projected != null ? `${Math.round(projected)} km` : "—"}
          label={t("projected_range")}
          accent="text-primary"
        />
      </div>
      {byTemp.length >= 2 && <TempChart buckets={byTemp} />}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InsightsClient() {
  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicleId = selectedVehicleId ?? "";
  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  const vehicleName = vehicle ? (vehicle.nickname ?? vehicle.displayName) : "";

  const t = useTranslations("insights");
  const [period, setPeriod] = useState<Period>("30d");
  const from = useMemo(() => periodFrom(period), [period]);

  const periodOptions = [
    { value: "7d" as const, label: t("period_7d") },
    { value: "30d" as const, label: t("period_30d") },
    { value: "1y" as const, label: t("period_1y") },
    { value: "all" as const, label: t("period_all") },
  ];

  return (
    <PageWrapper className="mx-auto max-w-2xl gap-3 pb-28">
      <PageHeader title={t("title")} subtitle={vehicleName} />

      <SegmentedControl
        options={periodOptions}
        value={period}
        onChange={setPeriod}
        layoutId="insights-period"
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Savings & CO₂ */}
        <motion.div variants={cardVariants} className="space-y-3">
          <SectionHeader icon={Leaf} title={t("savings_title")} />
          <SavingsSection vehicleId={vehicleId} from={from} />
        </motion.div>

        {/* Activity */}
        <motion.div variants={cardVariants} className="space-y-3">
          <SectionHeader icon={Activity} title={t("states_title")} />
          <ActivitySection vehicleId={vehicleId} from={from} />
        </motion.div>

        {/* Battery health */}
        <motion.div variants={cardVariants} className="space-y-3">
          <SectionHeader icon={BatteryFull} title={t("battery_title")} />
          <BatterySection vehicleId={vehicleId} />
        </motion.div>

        {/* Efficiency */}
        <motion.div variants={cardVariants} className="space-y-3">
          <SectionHeader icon={Gauge} title={t("efficiency_title")} />
          <EfficiencySection vehicleId={vehicleId} from={from} />
        </motion.div>
      </motion.div>
    </PageWrapper>
  );
}
