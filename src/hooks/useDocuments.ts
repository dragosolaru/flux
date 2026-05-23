"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import type { Document } from "@/types/costs";

export function useDocuments(vehicleId: string) {
  return useQuery<Document[]>({
    queryKey: ["documents", vehicleId],
    queryFn: () => apiFetch<Document[]>(`/api/documents?vehicleId=${vehicleId}`),
    refetchInterval: (query) => {
      const hasPending = query.state.data?.some(
        (d) => d.status === "pending" || d.status === "processing",
      );
      // Fast poll when processing; slow poll always so email docs appear automatically.
      return hasPending ? 3000 : 15000;
    },
    staleTime: 5000,
  });
}

export function useUploadDocument(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("vehicleId", vehicleId);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json() as { message?: string };
        throw new Error(data.message ?? "Upload failed");
      }
      return res.json() as Promise<{ id: string; status: string }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", vehicleId] });
    },
  });
}

export function useRecoverDocuments(vehicleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ recovered: number; vehicleId: string }>("/api/documents/recover", {
      method: "POST",
    }),
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
    }) => apiFetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", vehicleId] });
      void qc.invalidateQueries({ queryKey: ["costs", vehicleId] });
    },
  });
}
