"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-fetch";
import type { TeslaCommand } from "@/types/tesla";

interface CommandInput {
  vehicleId: string;
  command: TeslaCommand;
  params?: Record<string, unknown>;
}

interface CommandResult {
  success: boolean;
  result: string;
}

export function useVehicleCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CommandInput) =>
      apiFetch<CommandResult>("/api/tesla/command", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data, variables) => {
      if (data.success) {
        toast.success(`Command sent: ${variables.command.replace(/_/g, " ")}`);
      } else {
        toast.error(`Command failed: ${data.result}`);
      }
      queryClient.invalidateQueries({
        queryKey: ["vehicle", variables.vehicleId],
      });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
