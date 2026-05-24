import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";

interface SyncResult { synced: number; total: number }

export function useChargingHistorySync(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<SyncResult>(`/api/vehicles/${vehicleId}/charging-history`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charging-sessions", vehicleId] });
    },
  });
}
