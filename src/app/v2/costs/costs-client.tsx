"use client";

import { Home, Plus, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Bars,
  Mono,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { VehicleSwitch } from "@/components/v2/vehicle-switch";
import { useCosts } from "@/hooks/useCosts";
import { useVehicleContext } from "@/contexts/vehicle";

/**
 * "2026-08" → "Aug", from the localized month array the costs namespace already
 * carries. Falls back to the raw string rather than inventing a label.
 */
function monthLabel(month: string, names: string[]): string {
  const index = Number(month.slice(5, 7)) - 1;
  return names[index] ?? month;
}

export function CostsV2Client() {
  const t = useTranslations("costs");
  const tv = useTranslations("v2");
  const { selectedVehicleId } = useVehicleContext();
  const vehicleId = selectedVehicleId ?? "";
  const { data, isLoading } = useCosts(vehicleId);
  const monthNames = t.raw("months") as string[];

  const months = (data?.monthlyTrend ?? []).slice(-6);
  const average =
    months.length > 0 ? months.reduce((sum, m) => sum + m.costRon, 0) / months.length : null;
  const current = months.at(-1);

  const perKm = data?.costPerKmBlended;
  // Only claimed when both sides are known. A "−63% vs petrol" printed off a
  // missing petrol figure is a number the app made up.
  const vsFuel =
    data && data.petrolEquivalentCostRon > 0 && data.totalCostRon > 0
      ? Math.round((1 - data.totalCostRon / data.petrolEquivalentCostRon) * 100)
      : null;

  return (
    <Screen>
      <ScreenHeader
        switcher={<VehicleSwitch />} title={t("page_title")} meta={tv("last_months", { count: months.length })} />

      <div className="mt-6">
        <SectionLabel>{t("kpi_cost_per_km")}</SectionLabel>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span
            className="font-light leading-[0.9] tracking-[-0.045em] tabular-nums"
            style={{ fontSize: "clamp(48px, 16vw, 64px)" }}
          >
            {perKm != null ? perKm.toFixed(2) : "—"}
          </span>
          <span className="text-lg font-light" style={{ color: "var(--v2-soft)" }}>
            lei
          </span>
          <span className="flex-1" />
          {vsFuel != null && vsFuel > 0 && (
            <Mono className="text-[12px] text-chart-2">{tv("vs_petrol", { pct: vsFuel })}</Mono>
          )}
        </div>
      </div>

      {months.length > 0 ? (
        <div className="mt-7">
          <Bars
            items={months.map((m) => ({
              key: m.month,
              label: monthLabel(m.month, monthNames),
              value: m.costRon,
            }))}
            footerLeft={average != null ? `${tv("average")} ${Math.round(average)} lei` : undefined}
            footerRight={
              current
                ? `${monthLabel(current.month, monthNames)} ${Math.round(current.costRon)} lei`
                : undefined
            }
          />
        </div>
      ) : (
        !isLoading && (
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{t("no_chart_data")}</p>
        )
      )}

      <div className="mt-7">
        <SectionLabel>{tv("from_what")}</SectionLabel>
        <Rows className="mt-2">
          <Row
            icon={<Home strokeWidth={1.5} />}
            label={t("home")}
            value={data ? `${Math.round(data.homeCostRon)} lei` : "—"}
          />
          <Row
            icon={<Zap strokeWidth={1.5} />}
            label={t("public")}
            value={data ? `${Math.round(data.publicCostRon)} lei` : "—"}
            last
          />
        </Rows>
      </div>

      <div className="mt-7 pb-8">
        <Rows>
          <Row
            icon={<Plus strokeWidth={1.5} className="text-primary" />}
            label={<span className="text-primary">{t("add_receipt")}</span>}
            value={tv("photo_or_email")}
            href="/v2/documents"
            last
          />
        </Rows>
      </div>

      <NavBar />
    </Screen>
  );
}
