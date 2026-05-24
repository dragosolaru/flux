import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";

export function useVirtualKeyPair(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paired: boolean) =>
      apiFetch(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify({ virtualKeyPaired: paired }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capabilities"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}
