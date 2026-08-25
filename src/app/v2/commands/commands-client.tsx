"use client";

import {
  BatteryCharging,
  Fan,
  Lock,
  Play,
  Plug,
  PlugZap,
  Shield,
  Snowflake,
  Square,
  Unlock,
  Wind,
  X,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";

import {
  ChipRow,
  Mono,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
  StepperRow,
  TimeRow,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { VehicleSwitch } from "@/components/v2/vehicle-switch";
import { ConfirmCommandDialog, SENSITIVE_COMMANDS } from "@/components/vehicle/ConfirmCommandDialog";
import { useBrandCapabilities } from "@/hooks/useBrandCapabilities";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { minutesFromMidnight, minutesToHhmm } from "@/lib/time";
import type { BrandKey } from "@/lib/brands/types";
import type { CommandName } from "@/types/history";

type Cap = keyof ReturnType<typeof useBrandCapabilities>["commands"];

interface Action {
  key: string;
  cmd: CommandName;
  cap: Cap;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  /** null when the car has not reported the underlying state. */
  on: boolean | null;
  /** What the right of the row reads. Absent for one-shot commands. */
  state?: string;
  args?: Record<string, unknown>;
}

const MAPPED_ERRORS = [
  "error_rate_limit",
  "error_vcp_required",
  "error_proxy_missing",
  "error_not_supported",
];

/**
 * Every command, as rows.
 *
 * The v1 screen is a two-column grid of bordered buttons. Two columns halves
 * the width available to a label, so several locales truncate at ~13
 * characters, and a button whose text is cut is a button you have to guess at.
 * One column, full width, means the longest German string still fits.
 */
export function CommandsV2Client() {
  const t = useTranslations("commands");
  const tv = useTranslations("v2");

  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicle = vehicles?.find((v) => v.id === selectedVehicleId);
  const vehicleId = selectedVehicleId ?? "";
  const brand = (vehicle?.brand ?? "tesla") as BrandKey;
  const isLive = vehicle?.dataSource === "live";

  // poll: false. Every control here reflects state the car reports, but
  // useVehicleCommand invalidates ["vehicle", id] on settle, so the screen
  // refreshes after a command without an interval that keeps the car awake for
  // as long as someone has the screen open.
  const { data: state } = useVehicle(vehicleId, isLive, false);
  const caps = useBrandCapabilities(brand);
  const { mutate, isPending, variables, isError, error } = useVehicleCommand();

  const [confirming, setConfirming] = useState<Action | null>(null);
  // Seeded from the car, then left alone: re-syncing on every poll would drag a
  // control out from under a thumb.
  const [limit, setLimit] = useState<number | null>(null);
  const [amps, setAmps] = useState<number | null>(null);
  const [temp, setTemp] = useState<number | null>(null);
  const [chargeAt, setChargeAt] = useState<string | null>(null);
  const [departAt, setDepartAt] = useState<string | null>(null);

  const sending = tv("sending");

  function send(cmd: CommandName, args?: Record<string, unknown>) {
    mutate({ vehicleId, command: cmd, args });
  }

  function request(action: Action) {
    if (SENSITIVE_COMMANDS.has(action.cmd)) {
      setConfirming(action);
      return;
    }
    send(action.cmd, action.args);
  }

  const inFlight = (...cmds: CommandName[]) =>
    isPending && cmds.some((c) => variables?.command === c);

  const charging = state?.chargingState === "charging";
  const windowsOpen = state?.windowsOpen ? Object.values(state.windowsOpen).some(Boolean) : null;
  const on = tv("state_on");
  const off = tv("state_off");

  const groups: { title: string; actions: Action[] }[] = [
    {
      title: t("group_security"),
      actions: [
        {
          key: "lock",
          cmd: state?.isLocked === false ? "lock" : "unlock",
          cap: state?.isLocked === false ? "lock" : "unlock",
          icon: state?.isLocked === false ? Unlock : Lock,
          label: state?.isLocked === false ? t("lock") : t("unlock"),
          on: state?.isLocked ?? null,
          state: state?.isLocked === false ? tv("state_unlocked") : tv("state_locked"),
        },
        {
          key: "sentry",
          cmd: state?.isSentryMode ? "deactivate_sentry" : "activate_sentry",
          cap: state?.isSentryMode ? "deactivateSentry" : "activateSentry",
          icon: Shield,
          label: state?.isSentryMode ? t("deactivate_sentry") : t("activate_sentry"),
          on: state?.isSentryMode ?? null,
          state: state?.isSentryMode ? on : off,
        },
        {
          key: "remote_start",
          cmd: "remote_start",
          cap: "remoteStart",
          icon: Play,
          label: t("remote_start"),
          on: null,
        },
      ],
    },
    {
      title: t("group_charging"),
      actions: [
        {
          key: "charging",
          cmd: charging ? "stop_charging" : "start_charging",
          cap: charging ? "stopCharging" : "startCharging",
          icon: charging ? Square : BatteryCharging,
          label: charging ? t("stop_charging") : t("start_charging"),
          on: charging,
          state: charging ? on : off,
        },
        {
          key: "port_open",
          cmd: "open_charge_port",
          cap: "openChargePort",
          icon: PlugZap,
          label: t("open_charge_port"),
          on: null,
        },
        {
          key: "port_close",
          cmd: "close_charge_port",
          cap: "closeChargePort",
          icon: Plug,
          label: t("close_charge_port"),
          on: null,
        },
      ],
    },
    {
      title: t("group_climate"),
      actions: [
        {
          key: "climate",
          cmd: state?.isClimateOn ? "climate_off" : "climate_on",
          cap: state?.isClimateOn ? "climateOff" : "climateOn",
          icon: Fan,
          label: state?.isClimateOn ? t("climate_off") : t("climate_on"),
          on: state?.isClimateOn ?? null,
          state: state?.isClimateOn ? on : off,
        },
        {
          key: "precondition",
          cmd: "precondition_max",
          cap: "preconditionMax",
          icon: Snowflake,
          label: state?.isBatteryPreconditioning ? t("precondition_max_off") : t("precondition_max"),
          on: state?.isBatteryPreconditioning ?? null,
          state: state?.isBatteryPreconditioning ? on : off,
          args: { on: !state?.isBatteryPreconditioning },
        },
      ],
    },
    {
      title: t("group_windows"),
      actions: [
        {
          key: "windows",
          cmd: windowsOpen ? "close_windows" : "vent_windows",
          cap: windowsOpen ? "closeWindows" : "ventWindows",
          icon: windowsOpen ? X : Wind,
          label: windowsOpen ? t("close_windows") : t("vent_windows"),
          on: windowsOpen,
          state: windowsOpen ? tv("state_open") : tv("state_closed"),
        },
      ],
    },
  ];

  const settingsAvailable =
    caps.commands.setChargeLimit ||
    caps.commands.setChargeAmps ||
    caps.commands.setClimateTemp ||
    caps.commands.scheduleCharging ||
    caps.commands.scheduleDeparture;

  return (
    <Screen>
      <ConfirmCommandDialog
        command={confirming?.cmd ?? null}
        onConfirm={() => {
          const action = confirming;
          setConfirming(null);
          if (action) send(action.cmd, action.args);
        }}
        onCancel={() => setConfirming(null)}
      />

      <ScreenHeader
        switcher={<VehicleSwitch />}
        title={t("title")}
        meta={vehicle ? (vehicle.nickname ?? vehicle.displayName) : undefined}
      />

      {/* No skeleton rectangles: a row whose state is unknown is disabled and
          says so, which is the truth and also stops a tap that would be sent
          against a car we have not heard from. */}
      {!state && (
        <div className="mt-4">
          <Mono className="text-muted-foreground">{tv("waiting_for_car")}</Mono>
        </div>
      )}

      <div className="pb-8">
        {groups.map((group) => {
          const available = group.actions.filter((a) => caps.commands[a.cap]);
          if (available.length === 0) return null;
          return (
            <div key={group.title} className="mt-6">
              <SectionLabel>{group.title}</SectionLabel>
              <Rows className="mt-2">
                {available.map((action, i) => (
                  <Row
                    key={action.key}
                    icon={
                      <action.icon
                        strokeWidth={1.5}
                        className={action.on ? "text-primary" : undefined}
                      />
                    }
                    label={action.label}
                    value={action.state}
                    valueTone={action.on ? "accent" : "muted"}
                    pending={inFlight(action.cmd)}
                    pendingLabel={sending}
                    disabled={!state || isPending}
                    reason={!state ? tv("no_answer") : undefined}
                    onClick={() => request(action)}
                    last={i === available.length - 1}
                  />
                ))}
              </Rows>
            </div>
          );
        })}

        {settingsAvailable && state && (
          <div className="mt-7">
            <SectionLabel>{tv("group_settings")}</SectionLabel>
            <div className="mt-2">
              {caps.commands.setChargeLimit && (
                <ChipRow
                  label={t("set_charge_limit")}
                  unit="%"
                  values={[50, 60, 70, 80, 90, 100]}
                  current={limit ?? state.chargeLimit ?? null}
                  busy={inFlight("set_charge_limit")}
                  busyLabel={sending}
                  onPick={(v) => {
                    setLimit(v);
                    send("set_charge_limit", { percent: v });
                  }}
                />
              )}
              {caps.commands.setChargeAmps && (
                <ChipRow
                  label={t("set_charge_amps")}
                  unit="A"
                  // Tesla's own ladder. A slider offered 48 stops for a setting
                  // with eight real answers.
                  values={[5, 8, 12, 16, 24, 32, 40, 48]}
                  current={amps}
                  busy={inFlight("set_charge_amps")}
                  busyLabel={sending}
                  onPick={(v) => {
                    setAmps(v);
                    send("set_charge_amps", { amps: v });
                  }}
                />
              )}
              {caps.commands.setClimateTemp && (
                <StepperRow
                  label={t("set_climate_temp")}
                  value={temp ?? Math.round(state.driverTempC ?? 21)}
                  min={15}
                  max={28}
                  unit="°"
                  busy={inFlight("set_climate_temp")}
                  busyLabel={sending}
                  action={t("apply")}
                  onChange={setTemp}
                  onApply={(v) => send("set_climate_temp", { temp: v })}
                />
              )}
              {caps.commands.scheduleCharging && (
                <TimeRow
                  label={t("schedule_charging")}
                  value={
                    chargeAt ??
                    (state.scheduledChargingStartMinutes != null
                      ? minutesToHhmm(state.scheduledChargingStartMinutes)
                      : "23:00")
                  }
                  busy={inFlight("schedule_charging")}
                  busyLabel={sending}
                  action={t("apply")}
                  onChange={setChargeAt}
                  onApply={(v) => {
                    const time = minutesFromMidnight(v);
                    if (time != null) send("schedule_charging", { enable: true, time });
                  }}
                />
              )}
              {caps.commands.scheduleDeparture && (
                <TimeRow
                  label={t("schedule_departure")}
                  value={departAt ?? "08:00"}
                  busy={inFlight("schedule_departure")}
                  busyLabel={sending}
                  action={t("apply")}
                  onChange={setDepartAt}
                  onApply={(v) => {
                    const time = minutesFromMidnight(v);
                    if (time != null) send("schedule_departure", { time });
                  }}
                  last
                />
              )}
            </div>
          </div>
        )}

        {/* Inline, not only a toast: this screen is tall enough that a toast can
            be scrolled past before it is read, leaving no trace of a failure. */}
        {isError && (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {t(error && MAPPED_ERRORS.includes(error.message) ? error.message : "error")}
          </p>
        )}
      </div>

      <NavBar />
    </Screen>
  );
}
