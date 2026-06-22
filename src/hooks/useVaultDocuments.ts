"use client";
import { useQuery } from "@tanstack/react-query";
import * as documentsApi from "@/lib/api/documents";
import type { VaultDocument } from "@/types/costs";

export function useVaultDocuments(vehicleId: string | undefined) {
  return useQuery<VaultDocument[]>({
    queryKey: ["vault-documents", vehicleId],
    queryFn: () => documentsApi.listVault(vehicleId!),
    enabled: !!vehicleId,
    staleTime: 60_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasPending = data.some(d => d.status === "pending" || d.status === "processing");
      return hasPending ? 5_000 : false;
    },
  });
}
