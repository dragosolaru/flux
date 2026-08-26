"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { CommandName } from "@/types/history";
import type { VehicleState } from "@/types/vehicle";
import { vehicleQueryPrefix } from "@/hooks/useVehicle";

interface CommandInput {
  vehicleId: string;
  command: CommandName;
  args?: Record<string, unknown> | null;
}

interface CommandResult {
  success: boolean;
  message?: string;
  result?: string;
  code?: string;
}

/**
 * How long the car is given to apply a command before we read it back.
 *
 * Four seconds is what a lock/unlock takes to show up in vehicle_data in
 * practice. Too short and the optimistic value is undone by a stale read; too
 * long and a failed command sits looking successful.
 */
const RECONCILE_DELAY_MS = 4000;

const MAPPED_ERROR_KEYS = [
  "error_rate_limit",
  "error_vcp_required",
  "error_proxy_missing",
  "error_not_supported",
] as const;

// Translate a non-OK command response to a stable i18n key token. Raw upstream
// (Tesla Fleet API) error text is never surfaced — unknown failures fall back to
// the generic "error" key so we don't leak internal detail.
function commandErrorKey(status: number, data: CommandResult): string {
  if (status === 429) return "error_rate_limit";
  if (data.code === "PROXY_NOT_CONFIGURED") return "error_proxy_missing";
  if (status === 412 || data.code === "VCP_REQUIRED") return "error_vcp_required";
  if (data.message === "command-not-supported" || data.message === "command-not-supported-live") {
    return "error_not_supported";
  }
  return "error";
}

interface MutationContext {
  /** Every matching entry and its value, so a rollback restores all of them. */
  previous: [readonly unknown[], VehicleState | undefined][];
}

// Map a command to the vehicle-state fields it changes so the UI reflects the
// new state instantly. Sub-2s feedback is the #1 driver of EV-app satisfaction
// (JD Power 2025); the server response later confirms or rolls back.
export function optimisticPatch(
  command: CommandName,
  args?: Record<string, unknown> | null,
): Partial<VehicleState> | null {
  switch (command) {
    case "lock":
      return { isLocked: true };
    case "unlock":
      return { isLocked: false };
    case "climate_on":
      return { isClimateOn: true };
    case "climate_off":
      return { isClimateOn: false };
    case "start_charging":
      return { chargingState: "charging" };
    case "stop_charging":
      return { chargingState: "stopped" };
    case "open_charge_port":
      return { isChargePortOpen: true };
    case "close_charge_port":
      return { isChargePortOpen: false };
    case "activate_sentry":
      return { isSentryMode: true };
    case "deactivate_sentry":
      return { isSentryMode: false };
    case "remote_start":
      return { isRemoteStartActive: true };
    case "vent_windows":
      return {
        windowsOpen: { frontLeft: true, frontRight: true, rearLeft: false, rearRight: false },
      };
    case "close_windows":
      return {
        windowsOpen: { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false },
      };
    case "precondition_max":
      return typeof args?.on === "boolean" ? { isBatteryPreconditioning: args.on } : null;
    case "set_charge_limit": {
      const limit = args?.percent;
      return typeof limit === "number" && limit >= 0 && limit <= 100
        ? { chargeLimit: limit }
        : null;
    }
    case "set_charge_amps": {
      const amps = args?.amps;
      return typeof amps === "number" && amps >= 0 ? { chargeAmps: amps } : null;
    }
    case "set_climate_temp": {
      const temp = args?.temp;
      return typeof temp === "number" ? { driverTempC: temp } : null;
    }
    case "schedule_charging": {
      const time = args?.time;
      return typeof time === "number"
        ? { scheduledChargingEnabled: args?.enable !== false, scheduledChargingStartMinutes: time }
        : null;
    }
    case "schedule_departure": {
      const time = args?.time;
      return typeof time === "number"
        ? { scheduledDepartureEnabled: true, scheduledDepartureMinutes: time }
        : null;
    }
    default:
      return null;
  }
}

export function useVehicleCommand() {
  const queryClient = useQueryClient();
  const t = useTranslations("commands");

  return useMutation<CommandResult, Error, CommandInput, MutationContext>({
    mutationFn: async ({ vehicleId, command, args }): Promise<CommandResult> => {
      const res = await fetch(`/api/vehicles/${vehicleId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, args }),
      });
      if (res.status === 401 && typeof window !== "undefined") {
        window.location.href = "/login";
        await new Promise(() => {});
      }
      const data = (await res.json().catch(() => ({}))) as CommandResult;
      if (!res.ok) {
        throw new Error(commandErrorKey(res.status, data));
      }
      return data;
    },
    onMutate: async ({ vehicleId, command, args }) => {
      // The PREFIX, not one exact key. A vehicle's state is cached under two
      // keys — the live read and the cached-only one — and writing to a single
      // hardcoded key patched an entry nothing was observing.
      const prefix = vehicleQueryPrefix(vehicleId);
      // Stop in-flight refetches so they don't clobber the optimistic value.
      await queryClient.cancelQueries({ queryKey: prefix });
      const previous = queryClient.getQueriesData<VehicleState>({ queryKey: prefix });
      const patch = optimisticPatch(command, args);
      if (patch) {
        queryClient.setQueriesData<VehicleState>({ queryKey: prefix }, (current) =>
          current ? { ...current, ...patch } : current,
        );
      }
      return { previous };
    },
    onSuccess: (data, _variables, context) => {
      if (data.success) {
        toast.success(t("success"));
      } else {
        // Server rejected the command (HTTP 200, success:false) — undo the
        // optimistic change and surface the car-provided reason if any.
        rollback(queryClient, context);
        toast.error(data.message ?? data.result ?? t("error"));
      }
    },
    onError: (err, _variables, context) => {
      rollback(queryClient, context);
      const key = (MAPPED_ERROR_KEYS as readonly string[]).includes(err.message)
        ? (err.message as (typeof MAPPED_ERROR_KEYS)[number])
        : "error";
      toast.error(t(key));
    },
    onSettled: (_data, _err, variables) => {
      // Reconcile with the real server state regardless of outcome — but not
      // instantly. Tesla acknowledges a command before the car has applied it,
      // so a read fired the moment the request returns comes back with the OLD
      // value and overwrites the optimistic one: you unlock the car and the row
      // flips to UNLOCKED and then back to LOCKED.
      //
      // One delayed read rather than an immediate one plus a later correction:
      // two reads is two calls to the car, and this is the hook every command
      // goes through.
      const patch = optimisticPatch(variables.command, variables.args);
      const settle = () =>
        queryClient.invalidateQueries({ queryKey: vehicleQueryPrefix(variables.vehicleId) });
      if (patch) setTimeout(settle, RECONCILE_DELAY_MS);
      else settle();
      // And the vehicle LIST, which carries virtual_key_paired. The server
      // clears or sets that flag on the command's outcome, so without this the
      // pairing prompt stayed on screen after a successful pairing — the list
      // is cached for a minute and nothing was asking it to look again.
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}

/** Puts back every entry the optimistic patch touched. */
function rollback(
  queryClient: ReturnType<typeof useQueryClient>,
  context: MutationContext | undefined,
): void {
  for (const [key, value] of context?.previous ?? []) {
    if (value) queryClient.setQueryData(key, value);
  }
}
