"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { TeslaCommand } from "@/types/tesla";

interface CommandInput {
  vehicleId: string;
  command: TeslaCommand;
  params?: Record<string, unknown>;
}

interface CommandResult {
  success: boolean;
  result: string;
  code?: "VCP_REQUIRED";
}

export function useVehicleCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CommandInput): Promise<CommandResult> => {
      const res = await fetch("/api/tesla/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await res.json()) as CommandResult;
      // Pass non-OK responses through to the success handler so we can
      // distinguish between transport errors and known command failures.
      return body;
    },
    onSuccess: (data, variables) => {
      if (data.code === "VCP_REQUIRED") {
        toast.error(
          "Tesla blocks REST commands on this car — needs Vehicle Command Proxy + Virtual Key pairing. See dashboard banner.",
          { duration: 8_000 },
        );
        return;
      }
      if (data.success) {
        toast.success(`Command sent: ${variables.command.replace(/_/g, " ")}`);
        queryClient.invalidateQueries({
          queryKey: ["vehicle", variables.vehicleId],
        });
      } else {
        toast.error(`Command failed: ${data.result}`);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
