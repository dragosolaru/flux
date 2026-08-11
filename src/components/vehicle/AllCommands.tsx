"use client";

import {
  BatteryCharging,
  Loader2,
  MapPin,
  Minus,
  Play,
  Plug,
  PlugZap,
  Plus,
  Shield,
  Snowflake,
  Square,
  Thermometer,
  Timer,
  Wind,
  X,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/ui-kit";
import { ConfirmCommandDialog, SENSITIVE_COMMANDS } from "@/components/vehicle/ConfirmCommandDialog";
import { useBrandCapabilities } from "@/hooks/useBrandCapabilities";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { minutesFromMidnight, minutesToHhmm } from "@/lib/time";
import type { CommandName } from "@/types/history";
import type { VehicleBrand, VehicleState } from "@/types/vehicle";

interface AllCommandsProps {
  vehicleId: string;
  brand: VehicleBrand;
  state: VehicleState | undefined;
}

type Cap = keyof ReturnType<typeof useBrandCapabilities>["commands"];

/**
 * One row of the grid. `on` drives the active treatment, and for a pair of
 * opposing commands it also decides which one is sent — a single button that
 * says what the car is currently doing, rather than two identical-looking
 * buttons and no way to tell which one you need.
 */
interface Action {
  key: string;
  cmd: CommandName;
  cap: Cap;
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** null when the car has not reported the underlying state. */
  on: boolean | null;
  args?: Record<string, unknown>;
}

/**
 * Every command the Tesla adapter can send that the dashboard's quick row does
 * not already cover.
 *
 * Deliberately NOT a button per command. The first version rendered all
 * sixteen, so "Sentry on" and "Sentry off" sat 8px apart looking identical,
 * nothing changed appearance after a command succeeded, and the screen could
 * not answer the only question you open it to ask — did that work. Opposing
 * pairs are one stateful toggle now, which also removes four buttons and the
 * label truncation that came with them.
 *
 * lock/unlock and climate on/off are absent on purpose: CommandPanel owns
 * those, and rendering them here too meant two independent mutations for the
 * same command 40px apart.
 */
export function AllCommands({ vehicleId, brand, state }: AllCommandsProps) {
  const t = useTranslations("commands");
  const caps = useBrandCapabilities(brand);
  const { mutate, isPending, variables, isError, error } = useVehicleCommand();

  const [confirming, setConfirming] = useState<Action | null>(null);
  // Seeded from the car, then left alone: re-syncing on every poll would drag
  // a control out from under a thumb. Seeding matters more than it looks —
  // showing a hardcoded 21 °C beside an Apply button misrepresents the car, and
  // one tap then sets the cabin to a temperature nobody chose.
  const [limit, setLimit] = useState<number | null>(null);
  const [amps, setAmps] = useState<number | null>(null);
  const [temp, setTemp] = useState<number | null>(null);
  const [chargeAt, setChargeAt] = useState<string | null>(null);
  const [departAt, setDepartAt] = useState<string | null>(null);

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

  // A skeleton, not fabricated defaults. Every control below either reflects
  // the car or should not be shown yet.
  if (!state) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const charging = state.chargingState === "charging";
  const windowsOpen = state.windowsOpen
    ? Object.values(state.windowsOpen).some(Boolean)
    : null;

  const groups: { title: string; actions: Action[] }[] = [
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
          key: "precondition",
          cmd: "precondition_max",
          cap: "preconditionMax",
          icon: Snowflake,
          label: state.isBatteryPreconditioning
            ? t("precondition_max_off")
            : t("precondition_max"),
          on: state.isBatteryPreconditioning,
          // The off path existed in the command map and the mock engine from
          // the start and had no button, so max defrost could be started and
          // never stopped.
          args: { on: !state.isBatteryPreconditioning },
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
        },
      ],
    },
    {
      title: t("group_security"),
      actions: [
        {
          key: "sentry",
          cmd: state.isSentryMode ? "deactivate_sentry" : "activate_sentry",
          cap: state.isSentryMode ? "deactivateSentry" : "activateSentry",
          icon: Shield,
          label: state.isSentryMode ? t("deactivate_sentry") : t("activate_sentry"),
          on: state.isSentryMode,
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
  ];

  return (
    <div className="space-y-5">
      <ConfirmCommandDialog
        command={confirming?.cmd ?? null}
        onConfirm={() => {
          const action = confirming;
          setConfirming(null);
          if (action) send(action.cmd, action.args);
        }}
        onCancel={() => setConfirming(null)}
      />

      {groups.map((g) => {
        const available = g.actions.filter((a) => caps.commands[a.cap]);
        if (available.length === 0) return null;
        return (
          <section key={g.title} className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {g.title}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {available.map((a) => (
                <button
                  key={a.key}
                  onClick={() => request(a)}
                  disabled={inFlight(a.cmd)}
                  // The full string, because the label truncates at ~13
                  // characters in a two-column grid and several locales are
                  // longer than that.
                  title={a.label}
                  className={[
                    "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm transition-colors disabled:opacity-60",
                    a.on
                      ? "border-primary/50 bg-primary/15 text-foreground"
                      : "border-border bg-muted/40 hover:bg-muted",
                  ].join(" ")}
                >
                  {inFlight(a.cmd) ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <a.icon
                      className={`size-4 shrink-0 ${a.on ? "text-primary" : "text-muted-foreground"}`}
                    />
                  )}
                  <span className="truncate">{a.label}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {caps.commands.setChargeLimit && (
        <ChipRow
          label={t("set_charge_limit")}
          unit="%"
          values={[50, 60, 70, 80, 90, 100]}
          current={limit ?? state.chargeLimit ?? null}
          busy={inFlight("set_charge_limit")}
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
          // Tesla's own ladder. A slider offered 48 stops for a setting with
          // eight real answers, and 27px of travel per step on a phone.
          values={[5, 8, 12, 16, 24, 32, 40, 48]}
          current={amps}
          busy={inFlight("set_charge_amps")}
          onPick={(v) => {
            setAmps(v);
            send("set_charge_amps", { amps: v });
          }}
        />
      )}

      {caps.commands.setClimateTemp && (
        <StepperRow
          label={t("set_climate_temp")}
          icon={Thermometer}
          value={temp ?? Math.round(state.driverTempC ?? 21)}
          min={15}
          max={28}
          unit="°C"
          busy={inFlight("set_climate_temp")}
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
          action={t("apply")}
          onChange={setDepartAt}
          onApply={(v) => {
            const time = minutesFromMidnight(v);
            if (time != null) send("schedule_departure", { time });
          }}
        />
      )}

      {caps.commands.shareNavigation && (
        <NavigateRow onSend={send} busy={inFlight("share_navigation")} />
      )}

      {/* Inline, not only a toast. This panel is tall enough that a toast can
          be scrolled past or dismissed before it is read, leaving no trace of
          a failed command. */}
      {isError && (
        <p role="alert" className="text-xs text-destructive">
          {t(
            error && ["error_rate_limit", "error_vcp_required", "error_proxy_missing", "error_not_supported"].includes(error.message)
              ? error.message
              : "error",
          )}
        </p>
      )}
    </div>
  );
}

/**
 * A setting with a handful of real answers, as tappable values.
 *
 * Replaces a range input. Charge limit had eleven stops across 298px — 27px of
 * travel per 5% — inside a vertically scrolling page, on a control iOS often
 * reads as a scroll gesture. Tapping the value IS the command, which also
 * removes the Apply step and the near-invisible button that came with it.
 */
function ChipRow({
  label,
  unit,
  values,
  current,
  busy,
  onPick,
}: {
  label: string;
  unit: string;
  values: number[];
  current: number | null;
  busy: boolean;
  onPick: (v: number) => void;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{label}</span>
        {busy && <Loader2 className="size-4 animate-spin text-primary" />}
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <Chip
            key={v}
            label={`${v}${unit}`}
            active={current === v}
            onClick={() => onPick(v)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * A continuous setting, as two 44px targets around the number.
 *
 * Temperature has 14 valid values and a meaningful "one more degree", which is
 * the case a stepper serves and a chip row does not.
 */
function StepperRow({
  label,
  icon: Icon,
  value,
  min,
  max,
  unit,
  busy,
  action,
  onChange,
  onApply,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  value: number;
  min: number;
  max: number;
  unit: string;
  busy: boolean;
  action: string;
  onChange: (v: number) => void;
  onApply: (v: number) => void;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <span className="flex items-center gap-2 text-sm">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`${label} −`}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card disabled:opacity-40"
        >
          <Minus className="size-4" />
        </button>
        <span className="flex-1 text-center font-mono text-lg tabular-nums">
          {value}
          {unit}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`${label} +`}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
        {/* bg-primary, not bg-secondary: secondary on card is about 1.25:1 in
            the dark theme, so the one control that commits the value was a
            near-invisible rectangle in daylight. */}
        <button
          onClick={() => onApply(value)}
          disabled={busy}
          className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {action}
        </button>
      </div>
    </section>
  );
}

function TimeRow({
  label,
  value,
  busy,
  action,
  onChange,
  onApply,
}: {
  label: string;
  value: string;
  busy: boolean;
  action: string;
  onChange: (v: string) => void;
  onApply: (v: string) => void;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <span className="flex items-center gap-2 text-sm">
        <Timer className="size-4 text-muted-foreground" />
        {label}
      </span>
      <div className="flex gap-2">
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
        />
        <button
          onClick={() => onApply(value)}
          // A cleared time input yields "", which parsed to 0 and silently
          // scheduled charging for midnight.
          disabled={busy || !/^\d{1,2}:\d{2}$/.test(value)}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {action}
        </button>
      </div>
    </section>
  );
}

/**
 * Send a destination to the car's navigation.
 *
 * Tesla's navigation_gps_request takes coordinates, not an address, so the
 * typed text goes through the app's own geocoding endpoint first.
 */
function NavigateRow({
  onSend,
  busy,
}: {
  onSend: (cmd: CommandName, args?: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const t = useTranslations("commands");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  async function go() {
    if (!query.trim()) return;
    setResolving(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      // Checked, because /api/geocode answers 401 when the session has expired
      // and 429 over its hourly budget. Both parse as JSON without `results`,
      // so every failure was reported as "address not found" — the one thing
      // it was not.
      if (!res.ok) {
        setError(t(res.status === 429 ? "nav_rate_limited" : "nav_failed"));
        return;
      }
      const body = (await res.json()) as {
        results?: { name: string; lat: number; lng: number }[];
      };
      const hit = body.results?.[0];
      if (!hit) {
        setError(t("nav_not_found"));
        return;
      }
      onSend("share_navigation", { destination: { lat: hit.lat, lng: hit.lng } });
    } catch {
      setError(t("nav_failed"));
    } finally {
      setResolving(false);
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <span className="flex items-center gap-2 text-sm">
        <MapPin className="size-4 text-muted-foreground" />
        {t("share_navigation")}
      </span>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("nav_placeholder")}
          className="min-h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
        />
        <button
          onClick={() => void go()}
          disabled={busy || resolving || !query.trim()}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {(busy || resolving) && <Loader2 className="size-4 animate-spin" />}
          {t("nav_send")}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
