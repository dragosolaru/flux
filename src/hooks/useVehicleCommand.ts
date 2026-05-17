"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { CommandName } from "@/types/history";

interface CommandInput {
  vehicleId: string;
  command: CommandName;
  args?: Record<string, unknown> | null;
}

interface CommandResult {
  success: boolean;
  message?: string;
}

export function useVehicleCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ vehicleId, command, args }: CommandInput): Promise<CommandResult> => {
      const res = await fetch(`/api/vehicles/${vehicleId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, args }),
      });
      return (await res.json()) as CommandResult;
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        toast.success(`Command sent: ${variables.command.replace(/_/g, " ")}`);
        queryClient.invalidateQueries({ queryKey: ["vehicle", variables.vehicleId] });
      } else {
        toast.error(data.message ?? "Command failed");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
