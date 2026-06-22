import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as vehiclesApi from "@/lib/api/vehicles";

export function useChargingHistorySync(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => vehiclesApi.syncChargingHistory(vehicleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charging-sessions", vehicleId] });
    },
  });
}
