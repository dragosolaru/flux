"use client";

import { Fan, Lock, MapPin, Moon, RadioTower, Sunrise, Unlock } from "lucide-react";
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
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { ApiError } from "@/lib/api-fetch";
import { mockLocationLabel } from "@/lib/mock/location-label";
import { setSleepMode, useSleepMode } from "@/lib/vehicle-sleep";
import * as vehiclesApi from "@/lib/api/vehicles";
import type { CommandName } from "@/types/history";

/** SOC → arc colour. Charging is its own state and outranks the level. */
function arcColor(soc: number, charging: boolean): string {
  if (charging) return "var(--chart-2)";
  if (soc > 50) return "var(--chart-2)";
  if (soc > 20) return "var(--chart-3)";
  return "var(--destructive)";
}

export function DashboardV2Client() {
  const t = useTranslations("v2");
  const tc = useTranslations("commands");
  const td = useTranslations("dashboard");

  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicle = vehicles?.find((v) => v.id === selectedVehicleId);
  const vehicleId = selectedVehicleId ?? "";
  const isLive = vehicle?.dataSource === "live";

  const { data: state, isLoading, isError, error, refetch, polling } = useVehicle(vehicleId, isLive);
  const { mutate, isPending, variables } = useVehicleCommand();
  const sleeping = useSleepMode();
  const queryClient = useQueryClient();

  // The car reports it is not online, so what is on screen is the last reading
  // rather than the current one.
  const asleep = state != null && state.isOnline === false;

  const wake = useMutation({
    mutationFn: () => vehiclesApi.wake(vehicleId),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["vehicle", vehicleId], fresh);
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
    {
      key: "status",
      label: t("status"),
      value: charging
        ? t("motion_charging")
        : state?.motionState === "driving"
          ? t("motion_driving")
          : state?.motionState === "plugged-idle"
            ? t("motion_plugged")
            : t("motion_parked"),
    },
  ].filter((v) => v !== null);

  return (
    <Screen>
      <ScreenHeader
        title={vehicle ? (vehicle.nickname ?? vehicle.displayName) : ""}
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

      <div className="mt-6">
        <Arc
          value={soc ?? 0}
          limit={state?.chargeLimit}
          color={arcColor(soc ?? 0, charging)}
          animate={soc != null}
        >
          {soc == null ? (
            <Mono className="text-muted-foreground">
              {isError ? t("no_answer") : td("contacting_car")}
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
      </div>

      <div className="mt-3.5">
        <ValueTable items={values} />
      </div>

      <Spacer />

      {isError ? (
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
                ? `/map?lat=${state.latitude}&lng=${state.longitude}&car=1`
                : undefined
            }
            disabled={state?.latitude == null}
            reason={t("no_position")}
            last={!isLive}
          />
          {isLive && asleep && !sleeping && (
            // Only shown when the car is actually asleep. Waking costs real
            // battery, so it is an action the driver chooses — nothing in the
            // app does it on their behalf any more.
            <Row
              icon={<Sunrise strokeWidth={1.5} className="text-chart-3" />}
              label={t("wake_car")}
              value={state?.lastSeenAt ? t("reading_from") : undefined}
              valueTone="amber"
              pending={wake.isPending}
              pendingLabel={t("waking")}
              onClick={() => wake.mutate()}
            />
          )}
          {isLive && (
            // The app-wide switch, on the screen where the car is. Persisted:
            // turning it off here keeps it off on every other screen, in every
            // tab, and after a reload.
            <Row
              icon={sleeping ? <Moon strokeWidth={1.5} /> : <RadioTower strokeWidth={1.5} />}
              label={sleeping ? t("undisturbed") : t("live_updates")}
              value={sleeping ? t("state_off") : polling.active ? t("state_on") : t("state_off")}
              valueTone={sleeping ? "muted" : polling.active ? "green" : "muted"}
              disabled={isLoading}
              onClick={() => {
                if (sleeping) {
                  setSleepMode(false);
                  polling.resume();
                  void refetch();
                } else {
                  // The switch, not the per-hook pause: that one died on the
                  // next navigation, so pressing it promised more than it did.
                  setSleepMode(true);
                }
              }}
              last
            />
          )}
        </Rows>
      )}

      <NavBar />
    </Screen>
  );
}
