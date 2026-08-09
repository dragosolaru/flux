"use client";

import {
  BatteryCharging,
  Fan,
  Gauge,
  Loader2,
  Lock,
  MapPin,
  Megaphone,
  Play,
  Plug,
  PlugZap,
  Power,
  Shield,
  ShieldOff,
  Snowflake,
  Sparkles,
  Square,
  Thermometer,
  Timer,
  Unlock,
  Wind,
  X,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";

import { useBrandCapabilities } from "@/hooks/useBrandCapabilities";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import type { CommandName } from "@/types/history";
import type { VehicleBrand, VehicleState } from "@/types/vehicle";

interface AllCommandsProps {
  vehicleId: string;
  brand: VehicleBrand;
  state: VehicleState | undefined;
}

type Cap = keyof ReturnType<typeof useBrandCapabilities>["commands"];

interface Action {
  cmd: CommandName;
  cap: Cap;
  icon: ComponentType<{ className?: string }>;
  args?: Record<string, unknown>;
}

/**
 * Every command the Tesla adapter can send, not the four that fit on the
 * dashboard.
 *
 * Eighteen of the twenty-two were mapped, capability-flagged, rate-limited and
 * audited end to end, and had no button anywhere in the app — the backend has
 * been able to vent the windows and set the charge limit since the brand
 * profile was written. This is the missing half of that work, not new
 * plumbing.
 *
 * Grouped rather than listed: "unlock" next to "set charge amps" is a list of
 * capabilities, not a way to drive a car. Anything that opens the vehicle or
 * lets it move keeps the confirmation step from CommandPanel.
 */
export function AllCommands({ vehicleId, brand, state }: AllCommandsProps) {
  const t = useTranslations("commands");
  const tc = useTranslations("common");
  const caps = useBrandCapabilities(brand);
  const { mutate, isPending, variables } = useVehicleCommand();

  const [confirming, setConfirming] = useState<Action | null>(null);
  // Seeded from the car so the slider opens where the car actually is, and
  // uncontrolled afterwards: re-syncing on every poll would drag the handle out
  // from under a thumb mid-drag.
  const [limit, setLimit] = useState<number | null>(null);
  const [amps, setAmps] = useState<number | null>(null);
  const [temp, setTemp] = useState<number | null>(null);
  const [chargeAt, setChargeAt] = useState("23:00");
  const [departAt, setDepartAt] = useState("08:00");

  const SENSITIVE: ReadonlySet<CommandName> = new Set(["unlock", "remote_start"]);

  function send(cmd: CommandName, args?: Record<string, unknown>) {
    mutate({ vehicleId, command: cmd, args });
  }

  function request(action: Action) {
    if (SENSITIVE.has(action.cmd)) {
      setConfirming(action);
      return;
    }
    send(action.cmd, action.args);
  }

  const inFlight = (cmd: CommandName) => isPending && variables?.command === cmd;

  // Tesla treats lat/lon on window_control as "is the sender near the car",
  // and refuses `close` when they are wrong. The car's own position is the one
  // coordinate pair we can be sure passes that test.
  const here =
    state?.latitude != null && state?.longitude != null
      ? { lat: state.latitude, lng: state.longitude }
      : undefined;

  const groups: { title: string; actions: Action[] }[] = [
    {
      title: t("group_access"),
      actions: [
        { cmd: "lock", cap: "lock", icon: Lock },
        { cmd: "unlock", cap: "unlock", icon: Unlock },
        { cmd: "honk", cap: "honk", icon: Megaphone },
        { cmd: "flash", cap: "flash", icon: Sparkles },
      ],
    },
    {
      title: t("group_charging"),
      actions: [
        { cmd: "start_charging", cap: "startCharging", icon: BatteryCharging },
        { cmd: "stop_charging", cap: "stopCharging", icon: Square },
        { cmd: "open_charge_port", cap: "openChargePort", icon: PlugZap },
        { cmd: "close_charge_port", cap: "closeChargePort", icon: Plug },
      ],
    },
    {
      title: t("group_climate"),
      actions: [
        { cmd: "climate_on", cap: "climateOn", icon: Fan },
        { cmd: "climate_off", cap: "climateOff", icon: Power },
        { cmd: "precondition_max", cap: "preconditionMax", icon: Snowflake, args: { on: true } },
      ],
    },
    {
      title: t("group_windows"),
      actions: [
        { cmd: "vent_windows", cap: "ventWindows", icon: Wind, args: here },
        { cmd: "close_windows", cap: "closeWindows", icon: X, args: here },
      ],
    },
    {
      title: t("group_security"),
      actions: [
        { cmd: "activate_sentry", cap: "activateSentry", icon: Shield },
        { cmd: "deactivate_sentry", cap: "deactivateSentry", icon: ShieldOff },
        { cmd: "remote_start", cap: "remoteStart", icon: Play },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setConfirming(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-4 shadow-2xl"
          >
            <p className="text-sm font-semibold text-foreground">
              {t(`confirm.${confirming.cmd}.title`)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(`confirm.${confirming.cmd}.body`)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const action = confirming;
                  setConfirming(null);
                  send(action.cmd, action.args);
                }}
                className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-destructive px-3 text-sm font-semibold text-destructive-foreground"
              >
                {t(`confirm.${confirming.cmd}.action`)}
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted"
              >
                {tc("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  key={a.cmd}
                  onClick={() => request(a)}
                  disabled={inFlight(a.cmd)}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {inFlight(a.cmd) ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <a.icon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{t(a.cmd)}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {caps.commands.setChargeLimit && (
        <SliderRow
          icon={Gauge}
          label={t("set_charge_limit")}
          value={limit ?? state?.chargeLimit ?? 80}
          min={50}
          max={100}
          step={5}
          unit="%"
          busy={inFlight("set_charge_limit")}
          action={t("apply")}
          onChange={setLimit}
          onApply={(v) => send("set_charge_limit", { percent: v })}
        />
      )}

      {caps.commands.setChargeAmps && (
        <SliderRow
          icon={Gauge}
          label={t("set_charge_amps")}
          value={amps ?? 16}
          min={1}
          max={48}
          step={1}
          unit="A"
          busy={inFlight("set_charge_amps")}
          action={t("apply")}
          onChange={setAmps}
          onApply={(v) => send("set_charge_amps", { amps: v })}
        />
      )}

      {caps.commands.setClimateTemp && (
        <SliderRow
          icon={Thermometer}
          label={t("set_climate_temp")}
          value={temp ?? 21}
          min={15}
          max={28}
          step={1}
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
          value={chargeAt}
          busy={inFlight("schedule_charging")}
          action={t("apply")}
          onChange={setChargeAt}
          // Tesla counts scheduling in minutes past local midnight.
          onApply={(v) => send("schedule_charging", { enable: true, time: minutesFromMidnight(v) })}
        />
      )}

      {caps.commands.scheduleDeparture && (
        <TimeRow
          label={t("schedule_departure")}
          value={departAt}
          busy={inFlight("schedule_departure")}
          action={t("apply")}
          onChange={setDepartAt}
          onApply={(v) => send("schedule_departure", { time: minutesFromMidnight(v) })}
        />
      )}

      {caps.commands.shareNavigation && <NavigateRow onSend={send} busy={inFlight("share_navigation")} />}
    </div>
  );
}

function minutesFromMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function SliderRow({
  icon: Icon,
  label,
  value,
  min,
  max,
  step,
  unit,
  busy,
  action,
  onChange,
  onApply,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  busy: boolean;
  action: string;
  onChange: (v: number) => void;
  onApply: (v: number) => void;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" />
          {label}
        </span>
        <span className="font-mono text-sm text-primary">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full accent-primary"
      />
      <button
        onClick={() => onApply(value)}
        disabled={busy}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-medium disabled:opacity-60"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {action}
      </button>
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
          disabled={busy}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-medium disabled:opacity-60"
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
 * typed text goes through the app's own geocoder first — the same one the trip
 * planner uses.
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
      setError(t("nav_not_found"));
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
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-medium disabled:opacity-60"
        >
          {(busy || resolving) && <Loader2 className="size-4 animate-spin" />}
          {t("nav_send")}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
