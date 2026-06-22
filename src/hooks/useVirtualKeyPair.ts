import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as vehiclesApi from "@/lib/api/vehicles";

export function useVirtualKeyPair(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paired: boolean) =>
      vehiclesApi.update(vehicleId, { virtualKeyPaired: paired }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capabilities"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}
