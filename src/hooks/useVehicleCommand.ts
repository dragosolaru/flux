"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { CommandName } from "@/types/history";
import type { VehicleState } from "@/types/vehicle";

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

const MAPPED_ERROR_KEYS = ["error_rate_limit", "error_vcp_required", "error_not_supported"] as const;

// Translate a non-OK command response to a stable i18n key token. Raw upstream
// (Tesla Fleet API) error text is never surfaced — unknown failures fall back to
// the generic "error" key so we don't leak internal detail.
function commandErrorKey(status: number, data: CommandResult): string {
  if (status === 429) return "error_rate_limit";
  if (status === 412 || data.code === "VCP_REQUIRED") return "error_vcp_required";
  if (data.message === "command-not-supported" || data.message === "command-not-supported-live") {
    return "error_not_supported";
  }
  return "error";
}

interface MutationContext {
  previous: VehicleState | undefined;
  key: readonly unknown[];
}

// Map a command to the vehicle-state fields it changes so the UI reflects the
// new state instantly. Sub-2s feedback is the #1 driver of EV-app satisfaction
// (JD Power 2025); the server response later confirms or rolls back.
function optimisticPatch(
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
    case "set_charge_limit": {
      const limit = args?.limitPct;
      return typeof limit === "number" && limit >= 0 && limit <= 100
        ? { chargeLimit: limit }
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
      const key = ["vehicle", vehicleId] as const;
      // Stop in-flight refetches so they don't clobber the optimistic value.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<VehicleState>(key);
      const patch = optimisticPatch(command, args);
      if (previous && patch) {
        queryClient.setQueryData<VehicleState>(key, { ...previous, ...patch });
      }
      return { previous, key };
    },
    onSuccess: (data, _variables, context) => {
      if (data.success) {
        toast.success(t("success"));
      } else {
        // Server rejected the command (HTTP 200, success:false) — undo the
        // optimistic change and surface the car-provided reason if any.
        if (context?.previous) {
          queryClient.setQueryData(context.key, context.previous);
        }
        toast.error(data.message ?? data.result ?? t("error"));
      }
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
      const key = (MAPPED_ERROR_KEYS as readonly string[]).includes(err.message)
        ? (err.message as (typeof MAPPED_ERROR_KEYS)[number])
        : "error";
      toast.error(t(key));
    },
    onSettled: (_data, _err, variables) => {
      // Reconcile with the real server state regardless of outcome.
      queryClient.invalidateQueries({ queryKey: ["vehicle", variables.vehicleId] });
    },
  });
}
