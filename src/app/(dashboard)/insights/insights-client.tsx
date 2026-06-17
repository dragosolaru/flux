"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Activity, BatteryFull, Gauge, Leaf } from "lucide-react";

import { PageWrapper } from "@/components/layout/page-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { useCosts } from "@/hooks/useCosts";
import { useStats } from "@/hooks/useStats";
import { useVehicle } from "@/hooks/useVehicle";
import { useCurrency } from "@/hooks/useCurrency";
import { cardVariants, staggerContainer } from "@/lib/animations/variants";
import type { BatteryHealthPoint } from "@/app/api/vehicles/[vehicleId]/battery-health/route";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import type { MileagePeriod, TempBucket } from "@/app/api/vehicles/[vehicleId]/stats/route";

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
        {title}
      </h2>
    </div>
  );
}

function StatChip({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: string;
}) {
  return (
    <div className="glass-card flex min-w-[100px] flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-3 text-center">
      <span className={`text-lg font-thin tabular-nums leading-none ${accent ?? ""}`}>
        {value}
      </span>
      <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="py-4 text-center text-xs text-muted-foreground/60">{text}</p>
  );
}

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
    <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <StatChip
        value={hasData ? fromRON(Math.max(0, savedRon), 0) : "—"}
        label={t("saved_ron")}
        accent="text-chart-2"
      />
      <StatChip
        value={hasData ? `${fuelSavedL.toFixed(0)} L` : "—"}
        label={t("fuel_saved")}
        accent="text-chart-3"
      />
      <StatChip
        value={hasData ? `${co2SavedKg.toFixed(0)} kg` : "—"}
        label={t("co2_avoided")}
        accent="text-chart-2"
      />
      <StatChip
        value={hasData ? `${treesEq.toFixed(1)}` : "—"}
        label={t("trees_equivalent")}
        accent="text-chart-2"
      />
      <StatChip
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

function MileageChart({ months }: { months: MileagePeriod[] }) {
  const visible = months.slice(-12);
  if (visible.length === 0) return null;
  const maxKm = Math.max(...visible.map((m) => m.km), 1);

  return (
    <div className="glass-card rounded-2xl p-4">
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
                  background: "linear-gradient(to bottom, oklch(0.62 0.19 250), oklch(0.68 0.18 162))",
                  opacity: 0.8,
                }}
              />
              <span className="absolute -bottom-5 left-0 right-0 text-center text-[9px] text-muted-foreground">
                {label}
              </span>
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-white/8 bg-background/80 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm group-hover:block">
                {Math.round(m.km)} km
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivitySection({ vehicleId, from }: ActivitySectionProps) {
  const t = useTranslations("insights");
  const { data, isLoading } = useStats(vehicleId, from);

  if (isLoading) return <Skeleton className="h-28 w-full rounded-2xl" />;

  const hasData = (data?.tripCount ?? 0) > 0 || (data?.chargingSessionCount ?? 0) > 0;

  if (!hasData) return <EmptyHint text={t("no_activity_data")} />;

  const drivingH = data?.totalDrivingH ?? 0;
  const drivingHLabel = drivingH < 1
    ? `${Math.round(drivingH * 60)} min`
    : `${drivingH.toFixed(1)} h`;

  return (
    <div className="space-y-3">
      <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <StatChip
          value={data ? `${Math.round(data.totalDrivingKm).toLocaleString()} km` : "—"}
          label={t("driving_km")}
          accent="text-primary"
        />
        <StatChip
          value={data ? drivingHLabel : "—"}
          label={t("driving_hours")}
        />
        <StatChip
          value={data ? String(data.tripCount) : "—"}
          label={t("trips")}
        />
        <StatChip
          value={data?.totalEnergyAddedKwh ? `${data.totalEnergyAddedKwh.toFixed(1)} kWh` : "—"}
          label={t("energy_charged")}
          accent="text-chart-2"
        />
      </div>
      {data && data.mileageByMonth.length > 1 && (
        <MileageChart months={data.mileageByMonth} />
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
        stroke="oklch(0.62 0.19 250)"
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
  const { data: vehicleState } = useVehicle(vehicleId);
  const { data: history, isLoading } = useQuery<BatteryHealthPoint[]>({
    queryKey: ["battery-health", vehicleId],
    queryFn: () => apiFetch<BatteryHealthPoint[]>(`/api/vehicles/${vehicleId}/battery-health`),
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
      <div className="flex gap-2.5">
        <StatChip
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
        <StatChip
          value={vampire != null ? `${vampire.toFixed(3)}%/h` : "—"}
          label={t("vampire_drain")}
        />
      </div>
      {history && history.length >= 2 ? (
        <div className="glass-card rounded-2xl px-4 py-3">
          <BatteryHealthSparkline points={history} />
        </div>
      ) : (
        <EmptyHint text={t("no_battery_data")} />
      )}
    </div>
  );
}

// ─── Efficiency section ───────────────────────────────────────────────────────

function TempChart({ buckets }: { buckets: TempBucket[] }) {
  const maxWh = Math.max(...buckets.map((b) => b.avgWhPerKm), 1);
  return (
    <div className="glass-card rounded-2xl p-4">
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
                  background: "linear-gradient(to bottom, oklch(0.68 0.18 162), oklch(0.55 0.20 250))",
                  opacity: 0.8,
                }}
              />
              <span className="absolute -bottom-5 left-0 right-0 text-center text-[9px] text-muted-foreground whitespace-nowrap">
                {b.label}
              </span>
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-white/8 bg-background/80 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm group-hover:block">
                {Math.round(b.avgWhPerKm)} Wh/km
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface EfficiencySectionProps {
  vehicleId: string;
  from: string | undefined;
}

function EfficiencySection({ vehicleId, from }: EfficiencySectionProps) {
  const t = useTranslations("insights");
  const { data: stats, isLoading } = useStats(vehicleId, from);
  const { data: vehicleState } = useVehicle(vehicleId);

  if (isLoading) return <Skeleton className="h-20 w-full rounded-2xl" />;

  const avgWh = stats?.avgWhPerKm ?? null;
  const projected = vehicleState?.batteryRangeKm ?? null;
  const byTemp = stats?.efficiencyByTemp ?? [];

  const hasData = avgWh != null || projected != null || byTemp.length > 0;
  if (!hasData) return <EmptyHint text={t("no_efficiency_data")} />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2.5">
        <StatChip
          value={avgWh != null ? `${Math.round(avgWh)} Wh/km` : "—"}
          label={t("avg_wh_per_km")}
          accent="text-chart-3"
        />
        <StatChip
          value={projected != null ? `${Math.round(projected)} km` : "—"}
          label={t("projected_range")}
          accent="text-primary"
        />
      </div>
      {byTemp.length >= 2 && <TempChart buckets={byTemp} />}
    </div>
  );
}

// ─── Period selector ──────────────────────────────────────────────────────────

const PERIODS: Period[] = ["7d", "30d", "1y", "all"];

function PeriodSelector({
  active,
  onChange,
}: {
  active: Period;
  onChange: (p: Period) => void;
}) {
  const t = useTranslations("insights");
  const labels: Record<Period, string> = {
    "7d": t("period_7d"),
    "30d": t("period_30d"),
    "1y": t("period_1y"),
    all: t("period_all"),
  };

  return (
    <div className="flex gap-1.5 rounded-xl bg-white/[0.04] p-1">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
            active === p
              ? "bg-white/[0.12] text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {labels[p]}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface InsightsClientProps {
  vehicleId: string;
  vehicleName: string;
}

export function InsightsClient({ vehicleId, vehicleName }: InsightsClientProps) {
  const t = useTranslations("insights");
  const [period, setPeriod] = useState<Period>("30d");
  const from = useMemo(() => periodFrom(period), [period]);

  return (
    <PageWrapper className="mx-auto max-w-2xl gap-5 pb-28">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-xs text-muted-foreground">{vehicleName}</p>
      </div>

      <PeriodSelector active={period} onChange={setPeriod} />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Savings & CO₂ */}
        <motion.div variants={cardVariants} className="space-y-3">
          <SectionHeader
            icon={<Leaf className="size-3.5" />}
            title={t("savings_title")}
          />
          <SavingsSection vehicleId={vehicleId} from={from} />
        </motion.div>

        {/* Activity */}
        <motion.div variants={cardVariants} className="space-y-3">
          <SectionHeader
            icon={<Activity className="size-3.5" />}
            title={t("states_title")}
          />
          <ActivitySection vehicleId={vehicleId} from={from} />
        </motion.div>

        {/* Battery health */}
        <motion.div variants={cardVariants} className="space-y-3">
          <SectionHeader
            icon={<BatteryFull className="size-3.5" />}
            title={t("battery_title")}
          />
          <BatterySection vehicleId={vehicleId} />
        </motion.div>

        {/* Efficiency */}
        <motion.div variants={cardVariants} className="space-y-3">
          <SectionHeader
            icon={<Gauge className="size-3.5" />}
            title={t("efficiency_title")}
          />
          <EfficiencySection vehicleId={vehicleId} from={from} />
        </motion.div>
      </motion.div>
    </PageWrapper>
  );
}

