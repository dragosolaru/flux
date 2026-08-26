"use client";

import { Fan, KeyRound, Lock, MapPin, RadioTower, Sunrise, Unlock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Arc,
  HeroValue,
  Mono,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  Spacer,
  ValueTable,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { VehicleSwitch } from "@/components/v2/vehicle-switch";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { ApiError } from "@/lib/api-fetch";
import { mockLocationLabel } from "@/lib/mock/location-label";
import { setSleepMode, useSleepMode } from "@/lib/vehicle-sleep";
import * as vehiclesApi from "@/lib/api/vehicles";
import type { CommandName } from "@/types/history";

/**
 * SOC → arc colour.
 *
 * An asleep car outranks everything: the number on screen is a memory, not a
 * reading, and colouring a memory green says the battery is fine *now*. Grey
 * says "this is the last thing it told us", which is the truth.
 */
function arcColor(soc: number, charging: boolean, asleep: boolean): string {
  if (asleep) return "var(--v2-soft)";
  if (charging) return "var(--chart-2)";
  if (soc > 50) return "var(--chart-2)";
  if (soc > 20) return "var(--chart-3)";
  return "var(--destructive)";
}

/** "acum 3 h" — how old the reading is, in the coarsest unit that is honest. */
function ageLabel(iso: string | null | undefined, t: (k: string, v?: Record<string, number>) => string): string | null {
  if (!iso) return null;
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 2) return t("time_now");
  if (minutes < 60) return t("time_min_ago", { m: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time_hour_ago", { h: hours });
  return t("time_day_ago", { d: Math.floor(hours / 24) });
}

export function DashboardV2Client({ virtualKeyUrl }: { virtualKeyUrl: string | null }) {
  const t = useTranslations("v2");
  const tc = useTranslations("commands");
  const td = useTranslations("dashboard");

  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicle = vehicles?.find((v) => v.id === selectedVehicleId);
  const vehicleId = selectedVehicleId ?? "";
  const isLive = vehicle?.dataSource === "live";

  const { data: state, isLoading, isError, error, refetch, polling } = useVehicle(vehicleId, isLive);
  const { mutate, isPending, variables, error: commandError } = useVehicleCommand();
  const sleeping = useSleepMode();
  const queryClient = useQueryClient();

  // Three different things, and the screen used to conflate the first two.
  //
  //   sleeping  — WE are not contacting the car. Deliberate, switched on by the
  //               driver. Values on screen are the last ones we stored.
  //   asleep    — we did contact it and it is asleep. Same staleness, different
  //               cause, and only this one can be answered by waking it.
  //   neither   — live.
  //
  // Saying "contacting the car…" while sleeping was the exact opposite of the
  // truth: the whole point of the switch is that we are not.
  const asleep = state != null && state.isOnline === false;
  const stale = sleeping || asleep;
  const lastReadingAge = stale && state ? ageLabel(state.lastSeenAt ?? state.recordedAt, td) : null;
  // A cached read of a car we have never stored fails with NO_CACHED_STATE.
  // That is not an error, it is "nothing to show yet, and we are not asking".
  const nothingStored = sleeping && isError;

  // Every signed command fails with "your public key has not been paired with
  // the vehicle" until this is done, and nothing in /v2 said so — the driver saw
  // controls that all refused for a reason printed nowhere.
  //
  // Two ways to know, and the second is why this row was invisible: the flag is
  // only corrected once a command has failed AND the vehicles query has
  // refetched. The error already in hand says the same thing immediately.
  const keyRefused =
    commandError instanceof Error && commandError.message === "error_vcp_required";
  const needsPairing =
    isLive && virtualKeyUrl != null && (vehicle?.virtualKeyPaired === false || keyRefused);

  const wake = useMutation({
    mutationFn: () => vehiclesApi.wake(vehicleId),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["vehicle", vehicleId, "live"], fresh);
      toast.success(t("woke_up"));
    },
    onError: () => toast.error(t("wake_failed")),
  });

  const needsReauth = error instanceof ApiError && error.code === "TESLA_REAUTH_REQUIRED";
  const inFlight = (...cmds: CommandName[]) =>
    isPending && variables?.command != null && cmds.includes(variables.command);

  const soc = typeof state?.batteryLevel === "number" ? Math.round(state.batteryLevel) : null;
  const charging = state?.chargingState === "charging";
  const sending = t("sending");

  const values = [
    state?.exteriorTempC != null
      ? { key: "out", label: t("outside"), value: `${state.exteriorTempC.toFixed(0)}°` }
      : null,
    state?.interiorTempC != null
      ? { key: "in", label: t("cabin"), value: `${state.interiorTempC.toFixed(0)}°` }
      : null,
    // Only when the car actually told us. This fell through to "Parcată" for a
    // null state, so a screen with no data at all still asserted the car was
    // parked — a fabricated fact, printed in the same type as the real ones.
    state != null
      ? {
          key: "status",
          label: t("status"),
          value: charging
            ? t("motion_charging")
            : state.motionState === "driving"
              ? t("motion_driving")
              : state.motionState === "plugged-idle"
                ? t("motion_plugged")
                : t("motion_parked"),
        }
      : null,
  ].filter((v) => v !== null);

  return (
    <Screen>
      <ScreenHeader
        title={<VehicleSwitch compact />}
        meta={
          !isLive
            ? t("demo")
            : sleeping
              ? t("undisturbed")
              : asleep
                ? t("asleep")
                : polling.active
                  ? t("live")
                  : t("paused")
        }
        metaTone={!isLive ? "amber" : sleeping || asleep ? "muted" : polling.active ? "accent" : "muted"}
      />

      <div className={`mt-6 ${stale ? "opacity-70" : ""}`}>
        <Arc
          value={soc ?? 0}
          limit={state?.chargeLimit}
          color={arcColor(soc ?? 0, charging, stale)}
          animate={soc != null}
        >
          {soc == null ? (
            <Mono className="text-muted-foreground">
              {sleeping
                ? t("not_asking")
                : isError
                  ? t("no_answer")
                  : td("contacting_car")}
            </Mono>
          ) : (
            <HeroValue
              value={String(soc)}
              unit="%"
              sub={state?.batteryRangeKm != null ? `${Math.round(state.batteryRangeKm)} km` : undefined}
            />
          )}
        </Arc>
        {charging && (
          <div className="mt-1 text-center">
            <Mono className="text-chart-2">
              {td("charging_active")}
              {state?.chargingRateKw != null && ` · ${state.chargingRateKw.toFixed(1)} kW`}
            </Mono>
          </div>
        )}
        {nothingStored && (
          // We are not asking, and we have never stored a reading for this car.
          // Saying so beats an empty circle that looks like a failure.
          <div className="mt-1 text-center">
            <Mono className="text-muted-foreground">{t("nothing_stored")}</Mono>
          </div>
        )}
        {stale && lastReadingAge && (
          // The one line that turns a stale screen into an honest one. Without
          // it every value above reads as current, and none of them is.
          <div className="mt-1 text-center">
            <Mono className="text-muted-foreground">
              {`${t("reading_from")} · ${lastReadingAge}`}
            </Mono>
          </div>
        )}
      </div>

      <div className="mt-3.5">
        <ValueTable items={values} />
      </div>

      <Spacer />

      {isError && !sleeping ? (
        // A failure is a row like any other. It says what happened and what the
        // one useful action is — no card, no icon the size of a fist.
        <Rows>
          <Row
            label={needsReauth ? td("reauth_title") : td("error_title")}
            value={needsReauth ? td("reauth_action") : td("retry")}
            valueTone="accent"
            href={needsReauth ? "/connect/tesla?reauth=1" : undefined}
            onClick={needsReauth ? undefined : () => void refetch()}
            last
          />
        </Rows>
      ) : (
        <Rows>
          {needsPairing && (
            // Above everything, including the wake row: nothing below it can
            // succeed until the key is in the car.
            <Row
              icon={<KeyRound strokeWidth={1.5} className="text-chart-3" />}
              label={t("pair_key")}
              value={t("not_paired")}
              valueTone="amber"
              href={virtualKeyUrl ?? undefined}
            />
          )}
          {isLive && stale && (
            // First, not last. It is the only action that changes anything
            // about the rows under it, and putting it after them asks the
            // driver to read four stale values before being told they are
            // stale.
            //
            // Two states, two labels, and they must not be confusable. Switching
            // updates back on sends NOTHING to the car; waking sends wake_up and
            // costs battery. A single label covering both read as "wake" and
            // produced a wake that never happened — and then a debug panel with
            // no wake in it, which looked like the panel was broken.
            <Row
              icon={<Sunrise strokeWidth={1.5} className="text-chart-3" />}
              label={sleeping ? t("resume_updates") : t("wake_car")}
              value={sleeping ? t("updates_off") : t("asleep")}
              // Only the wake half touches the car, so only it counts as one.
              valueTone="amber"
              pending={wake.isPending}
              pendingLabel={t("waking")}
              onClick={() => {
                if (sleeping) {
                  setSleepMode(false);
                  polling.resume();
                  void refetch();
                  return;
                }
                wake.mutate();
              }}
            />
          )}
          <Row
            icon={state?.isLocked === false ? <Unlock strokeWidth={1.5} /> : <Lock strokeWidth={1.5} />}
            label={state?.isLocked === false ? tc("lock") : tc("unlock")}
            value={state?.isLocked === false ? t("state_unlocked") : t("state_locked")}
            pending={inFlight("lock", "unlock")}
            pendingLabel={sending}
            disabled={!state || isPending}
            onClick={() =>
              mutate({ vehicleId, command: state?.isLocked === false ? "lock" : "unlock" })
            }
          />
          <Row
            icon={<Fan strokeWidth={1.5} />}
            label={state?.isClimateOn ? tc("climate_off") : tc("climate_on")}
            value={state?.isClimateOn ? t("state_on") : t("state_off")}
            valueTone={state?.isClimateOn ? "green" : "muted"}
            pending={inFlight("climate_on", "climate_off")}
            pendingLabel={sending}
            disabled={!state || isPending}
            onClick={() =>
              mutate({ vehicleId, command: state?.isClimateOn ? "climate_off" : "climate_on" })
            }
          />
          <Row
            icon={<MapPin strokeWidth={1.5} className="text-primary" />}
            label={td("find_car")}
            value={
              state?.latitude != null && state.longitude != null
                ? mockLocationLabel(state.latitude, state.longitude)
                : undefined
            }
            valueTone="accent"
            href={
              state?.latitude != null && state.longitude != null
                ? "/v2/map"
                : undefined
            }
            disabled={state?.latitude == null}
            reason={t("no_position")}
            last={!isLive}
          />
          {isLive && !sleeping && (
            // The app-wide switch. Persisted: turning it off here keeps it off
            // on every other screen, in every tab, and after a reload.
            //
            // The label stays put and the VALUE carries the state, like every
            // other row in the app. Swapping the label too produced "Lăsată în
            // pace — OPRITĂ", which reads as the leaving-alone being off.
            <Row
              icon={<RadioTower strokeWidth={1.5} />}
              label={t("live_updates")}
              value={polling.active ? t("state_on") : t("state_off")}
              valueTone={polling.active ? "green" : "muted"}
              disabled={isLoading}
              // The switch, not the per-hook pause: that one died on the next
              // navigation, so pressing it promised more than it did.
              onClick={() => setSleepMode(true)}
              last
            />
          )}
        </Rows>
      )}

      <NavBar />
    </Screen>
  );
}
