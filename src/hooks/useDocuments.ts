"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as documentsApi from "@/lib/api/documents";
import type { Document } from "@/types/costs";

export function useDocuments(vehicleId: string) {
  return useQuery<Document[]>({
    queryKey: ["documents", vehicleId],
    queryFn: () => documentsApi.list(vehicleId),
    refetchInterval: (query) => {
      const hasPending = query.state.data?.some(
        (d) => d.status === "pending" || d.status === "processing",
      );
      // Fast poll when processing; slow poll so email docs appear automatically.
      return hasPending ? 3000 : 15000;
    },
    refetchIntervalInBackground: false,
    staleTime: 5000,
  });
}

export function useUploadDocument(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => documentsApi.upload(vehicleId, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", vehicleId] });
    },
  });
}

export function useRecoverDocuments(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => documentsApi.recover(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", vehicleId] });
      void qc.invalidateQueries({ queryKey: ["costs", vehicleId] });
    },
  });
}

export function useEditDocument(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      documentId,
      updates,
    }: {
      documentId: string;
      updates: Record<string, unknown>;
    }) => documentsApi.update(documentId, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", vehicleId] });
      void qc.invalidateQueries({ queryKey: ["costs", vehicleId] });
    },
  });
}

export function useDeleteDocument(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => documentsApi.remove(documentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", vehicleId] });
      void qc.invalidateQueries({ queryKey: ["costs", vehicleId] });
    },
  });
}
