"use client";

import { Zap } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  Arc,
  ChipRow,
  HeroValue,
  Mono,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
  TimeRow,
  ValueTable,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { VehicleSwitch } from "@/components/v2/vehicle-switch";
import { useChargingHistory, type ChargingSessionRow } from "@/hooks/useChargingHistory";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { minutesFromMidnight, minutesToHhmm } from "@/lib/time";

function formatMinutes(min: number | null | undefined): string {
  if (min == null || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

function sessionEnergy(row: ChargingSessionRow): string {
  return row.energy_added_kwh != null ? `${row.energy_added_kwh.toFixed(1)} kWh` : "—";
}

export function ChargingV2Client({
  initialHistory,
  initialVehicleId,
}: {
  initialHistory: ChargingSessionRow[];
  initialVehicleId: string;
}) {
  const tc = useTranslations("charging");
  const t = useTranslations("commands");
  const tv = useTranslations("v2");

  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicleId = selectedVehicleId ?? "";
  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  const isLive = vehicle?.dataSource === "live";

  // Polled ONLY while charging. A charging car is awake anyway — the session
  // is what is keeping it up — so refreshing costs nothing. A plugged-in car
  // that has finished, or an unplugged one, is left alone. The first fetch
  // still happens; only the interval is conditional.
  const { data: state } = useVehicle(
    vehicleId,
    isLive,
    (s) => s?.chargingState === "charging",
  );
  const { mutate, isPending, variables } = useVehicleCommand();
  const { data: history = [] } = useChargingHistory(
    vehicleId,
    vehicleId === initialVehicleId ? initialHistory : undefined,
  );

  const [limit, setLimit] = useState<number | null>(null);
  const [scheduleAt, setScheduleAt] = useState<string | null>(null);

  const inFlight = (cmd: string) => isPending && variables?.command === cmd;
  const sending = tv("sending");

  const soc = typeof state?.batteryLevel === "number" ? Math.round(state.batteryLevel) : null;
  const target = limit ?? state?.chargeLimit ?? null;
  const charging = state?.chargingState === "charging";

  const values = [
    { key: "power", label: tc("ring_power"), value: state?.chargingRateKw != null ? `${state.chargingRateKw.toFixed(1)} kW` : "—" },
    { key: "left", label: tc("ring_time_remaining"), value: formatMinutes(state?.timeToFullMinutes) },
    { key: "target", label: tc("ring_target"), value: target != null ? `${target}%` : "—" },
  ];

  return (
    <Screen>
      <ScreenHeader
        switcher={<VehicleSwitch />}
        title={tc("page_title")}
        meta={charging ? tv("motion_charging") : tv("state_off")}
        metaTone={charging ? "green" : "muted"}
      />

      <div className="mt-6">
        {/* The arc's second legitimate home: a session IS a level filling up.
            Green rather than the level colour, because while charging the
            number is going the right way whatever it currently reads. */}
        <Arc
          value={soc ?? 0}
          limit={target}
          color={charging ? "var(--chart-2)" : "var(--v2-soft)"}
          animate={soc != null}
        >
          {soc == null ? (
            <Mono className="text-muted-foreground">{tv("waiting_for_car")}</Mono>
          ) : (
            <HeroValue
              value={String(soc)}
              unit="%"
              sub={target != null ? `→ ${target}%` : undefined}
            />
          )}
        </Arc>
      </div>

      <div className="mt-3.5">
        <ValueTable items={values} />
      </div>

      {/* Directly under the session, because "where do I get more" is the other
          half of the same question and used to be two taps into another tab. */}
      <div className="mt-5">
        <Rows>
          <Row
            icon={<Zap strokeWidth={1.5} className="text-primary" />}
            label={<span className="text-primary">{tv("stations_nearby")}</span>}
            href="/v2/chargers"
            last
          />
        </Rows>
      </div>

      {state && (
        <div className="mt-6">
          <SectionLabel>{tc("limit_title")}</SectionLabel>
          <div className="mt-2">
            <ChipRow
              label={tc("limit_label")}
              unit="%"
              values={[50, 60, 70, 80, 90, 100]}
              current={target}
              busy={inFlight("set_charge_limit")}
              busyLabel={sending}
              onPick={(v) => {
                setLimit(v);
                mutate({ vehicleId, command: "set_charge_limit", args: { percent: v } });
              }}
            />
            <TimeRow
              label={tc("scheduled_title")}
              value={
                scheduleAt ??
                (state.scheduledChargingStartMinutes != null
                  ? minutesToHhmm(state.scheduledChargingStartMinutes)
                  : "23:00")
              }
              busy={inFlight("schedule_charging")}
              busyLabel={sending}
              action={t("apply")}
              onChange={setScheduleAt}
              onApply={(v) => {
                const time = minutesFromMidnight(v);
                if (time != null) {
                  mutate({ vehicleId, command: "schedule_charging", args: { enable: true, time } });
                }
              }}
              last
            />
          </div>
        </div>
      )}

      <div className="mt-7 pb-8">
        <SectionLabel>{tc("history_title")}</SectionLabel>
        {history.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {tc("history_empty_hint")}
          </p>
        ) : (
          <Rows className="mt-2">
            {history.slice(0, 8).map((row, i) => (
              <Row
                key={row.id}
                label={row.location_name ?? tc("history_home")}
                value={sessionEnergy(row)}
                last={i === Math.min(history.length, 8) - 1}
              />
            ))}
          </Rows>
        )}
      </div>

      <NavBar />
    </Screen>
  );
}
