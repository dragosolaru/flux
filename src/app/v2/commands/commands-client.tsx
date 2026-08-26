"use client";

import {
  BatteryCharging,
  Fan,
  KeyRound,
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
import { useState, type ComponentType, type ReactNode } from "react";
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
import { CarDiagram } from "@/components/v2/car-diagram";
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

/**
 * A setting, not a command: charge limit, amperage, temperature, a schedule.
 *
 * These used to live in one "Settings" block at the bottom, which put the
 * charge limit four scroll-lengths away from the charging switch it governs.
 * They belong with the thing they configure, so a group now holds both, in one
 * unbroken run of hairlines — hence `render(last)` rather than a plain node.
 */
interface Control {
  key: string;
  cap: Cap;
  render: (last: boolean) => ReactNode;
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
/**
 * How old the reading is, in the coarsest unit that is honest.
 *
 * This screen does not poll — deliberately, since polling wakes the car. So a
 * car unlocked with the physical key, or from Tesla's own app, leaves every
 * toggle here showing what was true when the screen was opened, with nothing
 * saying so. A row that quietly reports the past is worse than one that admits
 * it, because it looks exactly like one that is current.
 */
function ageLabel(
  iso: string | null | undefined,
  t: (key: string, values?: Record<string, number>) => string,
): string | null {
  if (!iso) return null;
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 2) return t("time_now");
  if (minutes < 60) return t("time_min_ago", { m: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time_hour_ago", { h: hours });
  return t("time_day_ago", { d: Math.floor(hours / 24) });
}

export function CommandsV2Client({ virtualKeyUrl }: { virtualKeyUrl: string | null }) {
  const t = useTranslations("commands");
  const tv = useTranslations("v2");
  const td = useTranslations("dashboard");

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
  const { data: state, isFetching, refetch } = useVehicle(vehicleId, isLive, false);
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
  // The screen where the refusals happen. Shown before the groups, because a
  // row that cannot work is worse than a row that is missing.
  const keyRefused = error instanceof Error && error.message === "error_vcp_required";
  const needsPairing =
    isLive && virtualKeyUrl != null && (vehicle?.virtualKeyPaired === false || keyRefused);

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
  const portOpen = state?.isChargePortOpen ?? null;
  const remoteStarted = state?.isRemoteStartActive ?? null;
  const on = tv("state_on");
  const off = tv("state_off");

  // A row whose state the car has not reported says nothing on the right.
  // Rendering "BLOCATĂ" for a null reads exactly like a reading, and there is
  // no way to tell it from one — which is how a locked-looking row ended up on
  // a car that had never told us either way.
  const reads = (value: boolean | null | undefined, yes: string, no: string) =>
    value == null ? undefined : value ? yes : no;

  const groups: { title: string; actions: Action[]; controls?: Control[] }[] = [
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
          state: reads(state?.isLocked, tv("state_locked"), tv("state_unlocked")),
        },
        {
          key: "sentry",
          cmd: state?.isSentryMode ? "deactivate_sentry" : "activate_sentry",
          cap: state?.isSentryMode ? "deactivateSentry" : "activateSentry",
          icon: Shield,
          label: state?.isSentryMode ? t("deactivate_sentry") : t("activate_sentry"),
          on: state?.isSentryMode ?? null,
          state: reads(state?.isSentryMode, on, off),
        },
        {
          // Not a toggle, however much it looks like one here: Tesla has no
          // command that cancels a remote start. It is a two-minute window
          // that expires on its own, so the row reports whether it is open and
          // tapping it opens another one — it never offers to close it.
          key: "remote_start",
          cmd: "remote_start",
          cap: "remoteStart",
          icon: Play,
          label: t("remote_start"),
          on: remoteStarted,
          state: reads(remoteStarted, on, off),
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
          key: "charge_port",
          cmd: portOpen ? "close_charge_port" : "open_charge_port",
          cap: portOpen ? "closeChargePort" : "openChargePort",
          icon: portOpen ? PlugZap : Plug,
          label: portOpen ? t("close_charge_port") : t("open_charge_port"),
          on: portOpen,
          state: reads(portOpen, tv("state_open"), tv("state_closed")),
        },
      ],
      controls: [
        {
          key: "charge_limit",
          cap: "setChargeLimit",
          render: (last) => (
            <ChipRow
              label={t("set_charge_limit")}
              unit="%"
              values={[50, 60, 70, 80, 90, 100]}
              current={limit ?? state?.chargeLimit ?? null}
              busy={inFlight("set_charge_limit")}
              busyLabel={sending}
              onPick={(v) => {
                setLimit(v);
                send("set_charge_limit", { percent: v });
              }}
              last={last}
            />
          ),
        },
        {
          key: "charge_amps",
          cap: "setChargeAmps",
          render: (last) => (
            <ChipRow
              label={t("set_charge_amps")}
              unit="A"
              // Tesla's own ladder. A slider offered 48 stops for a setting
              // with eight real answers.
              values={[5, 8, 12, 16, 24, 32, 40, 48]}
              // Seeded from the car now that it reports the requested current.
              // Before, no chip was lit on arrival, so the setting looked unset
              // on a car that had one.
              current={amps ?? state?.chargeAmps ?? null}
              busy={inFlight("set_charge_amps")}
              busyLabel={sending}
              onPick={(v) => {
                setAmps(v);
                send("set_charge_amps", { amps: v });
              }}
              last={last}
            />
          ),
        },
        {
          key: "schedule_charging",
          cap: "scheduleCharging",
          render: (last) => (
            <TimeRow
              label={t("schedule_charging")}
              value={
                chargeAt ??
                (state?.scheduledChargingStartMinutes != null
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
              last={last}
            />
          ),
        },
        {
          key: "schedule_departure",
          cap: "scheduleDeparture",
          render: (last) => (
            <TimeRow
              label={t("schedule_departure")}
              value={
                departAt ??
                (state?.scheduledDepartureMinutes != null
                  ? minutesToHhmm(state.scheduledDepartureMinutes)
                  : "08:00")
              }
              busy={inFlight("schedule_departure")}
              busyLabel={sending}
              action={t("apply")}
              onChange={setDepartAt}
              onApply={(v) => {
                const time = minutesFromMidnight(v);
                if (time != null) send("schedule_departure", { time });
              }}
              last={last}
            />
          ),
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
          state: reads(state?.isClimateOn, on, off),
        },
        {
          key: "precondition",
          cmd: "precondition_max",
          cap: "preconditionMax",
          icon: Snowflake,
          label: state?.isBatteryPreconditioning ? t("precondition_max_off") : t("precondition_max"),
          on: state?.isBatteryPreconditioning ?? null,
          state: reads(state?.isBatteryPreconditioning, on, off),
          args: { on: !state?.isBatteryPreconditioning },
        },
      ],
      controls: [
        {
          key: "climate_temp",
          cap: "setClimateTemp",
          render: (last) => (
            <StepperRow
              label={t("set_climate_temp")}
              value={temp ?? Math.round(state?.driverTempC ?? 21)}
              min={15}
              max={28}
              unit="°"
              busy={inFlight("set_climate_temp")}
              busyLabel={sending}
              action={t("apply")}
              onChange={setTemp}
              onApply={(v) => send("set_climate_temp", { temp: v })}
              last={last}
            />
          ),
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
          state: reads(windowsOpen, tv("state_open"), tv("state_closed")),
        },
      ],
    },
  ];

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
      />

      {/* What is open and what is running, at a glance. Every value it shows is
          also a row below — except the per-corner door and window state, which
          arrives from the car and had nowhere to go. */}
      <div className="mt-3">
        <CarDiagram state={state} />
      </div>

      {/* When these values are from. One tap re-reads — a deliberate act, so it
          is allowed to contact the car; nothing here happens on a timer. */}
      {state && (
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="mt-1 flex min-h-11 items-center gap-2 transition-opacity duration-[80ms] active:opacity-60 disabled:opacity-40"
        >
          <Mono className="text-muted-foreground">
            {`${tv("updated")} ${ageLabel(state.recordedAt, td) ?? ""} · ${
              isFetching ? tv("loading") : tv("refresh_state")
            }`}
          </Mono>
        </button>
      )}

      {/* No skeleton rectangles: a row whose state is unknown is disabled and
          says so, which is the truth and also stops a tap that would be sent
          against a car we have not heard from. */}
      {!state && (
        <div className="mt-4">
          <Mono className="text-muted-foreground">{tv("waiting_for_car")}</Mono>
        </div>
      )}

      {needsPairing && (
        <div className="mt-4">
          <Rows>
            <Row
              icon={<KeyRound strokeWidth={1.5} className="text-chart-3" />}
              label={tv("pair_key")}
              value={tv("not_paired")}
              valueTone="amber"
              href={virtualKeyUrl ?? undefined}
              last
            />
          </Rows>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {tv("pair_key_hint")}
          </p>
        </div>
      )}

      <div className="pb-8">
        {groups.map((group) => {
          const available = group.actions.filter((a) => caps.commands[a.cap]);
          // Controls read the car's current value, so they wait for one rather
          // than showing a default that looks like a setting.
          const controls = state
            ? (group.controls ?? []).filter((c) => caps.commands[c.cap])
            : [];
          const total = available.length + controls.length;
          if (total === 0) return null;
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
                    last={available.length + controls.length === i + 1}
                  />
                ))}
                {controls.map((control, i) => (
                  <div key={control.key}>
                    {control.render(available.length + i === total - 1)}
                  </div>
                ))}
              </Rows>
            </div>
          );
        })}

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
