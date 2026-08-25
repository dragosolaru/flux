"use client";

import { useTranslations } from "next-intl";

import {
  Bars,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
  ValueTable,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { VehicleSwitch } from "@/components/v2/vehicle-switch";
import { useStats } from "@/hooks/useStats";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleContext } from "@/contexts/vehicle";

export function InsightsV2Client() {
  const t = useTranslations("insights");
  const tv = useTranslations("v2");
  const { selectedVehicleId } = useVehicleContext();
  const vehicleId = selectedVehicleId ?? "";
  const { data, isLoading } = useStats(vehicleId);
  // State of health comes from the car, not from the trip statistics — it is a
  // property of the pack, and the stats endpoint has never carried it.
  const { data: vehicleState } = useVehicle(vehicleId, true, false);
  const soh = vehicleState?.batteryHealthPct ?? null;

  const months = (data?.mileageByMonth ?? []).slice(-6);

  const values = [
    { key: "km", label: t("driving_km"), value: data ? `${Math.round(data.totalDrivingKm)}` : "—" },
    { key: "trips", label: t("trips"), value: data ? String(data.tripCount) : "—" },
    {
      key: "kwh",
      label: t("energy_charged"),
      value: data ? `${Math.round(data.totalEnergyAddedKwh)}` : "—",
    },
  ];

  return (
    <Screen>
      <ScreenHeader
        switcher={<VehicleSwitch />}
        title={t("title")}
        meta={t("period_all")}
      />

      <div className="mt-6">
        <SectionLabel>{t("avg_wh_per_km")}</SectionLabel>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span
            className="font-light leading-[0.9] tracking-[-0.045em] tabular-nums"
            style={{ fontSize: "clamp(48px, 16vw, 64px)" }}
          >
            {data?.avgWhPerKm != null ? Math.round(data.avgWhPerKm) : "—"}
          </span>
          <span className="text-lg font-light" style={{ color: "var(--v2-soft)" }}>
            Wh/km
          </span>
        </div>
      </div>

      <div className="mt-5">
        <ValueTable items={values} />
      </div>

      {months.length > 0 ? (
        <div className="mt-7">
          <SectionLabel>{t("states_title")}</SectionLabel>
          <div className="mt-3">
            <Bars
              items={months.map((m) => ({ key: m.period, label: m.period.slice(5), value: m.km }))}
              footerRight={`${Math.round(months.at(-1)?.km ?? 0)} km`}
            />
          </div>
        </div>
      ) : (
        !isLoading && (
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            {t("no_activity_data")}
          </p>
        )
      )}

      <div className="mt-7 pb-8">
        <SectionLabel>{t("battery_title")}</SectionLabel>
        <Rows className="mt-2">
          {/* Each row reads its OWN field. This one used to decide whether to
              show state-of-health from the vampire-drain value, and then claim
              "needs telemetry" — while the same car reports 84.7% and the v1
              screen shows it. Two separate mistakes in four lines: the wrong
              source, and a confident explanation for the wrong result. */}
          <Row
            label={t("battery_soh")}
            value={soh != null ? `${soh.toFixed(1)}%` : undefined}
            valueTone={soh != null && soh < 85 ? "amber" : "muted"}
            disabled={soh == null}
            reason={tv("needs_driving")}
          />
          <Row
            label={t("vampire_drain")}
            value={
              data?.vampireDrainPctPerH != null
                ? `${data.vampireDrainPctPerH.toFixed(2)} %/h`
                : undefined
            }
            disabled={data?.vampireDrainPctPerH == null}
            reason={tv("needs_driving")}
            last
          />
        </Rows>
      </div>

      <NavBar />
    </Screen>
  );
}
