"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";

export interface SavedRoute {
  id: string;
  user_id: string;
  name: string;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  stops: unknown;
  plan_snapshot: unknown;
  created_at: string;
}

export interface CreateSavedRouteInput {
  name: string;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  stops: unknown;
  plan_snapshot: unknown;
}

export function useSavedRoutes() {
  return useQuery<SavedRoute[]>({
    queryKey: ["saved-routes"],
    queryFn: () => apiFetch<SavedRoute[]>("/api/saved-routes"),
    staleTime: 30_000,
  });
}

export function useCreateSavedRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSavedRouteInput) =>
      apiFetch<SavedRoute>("/api/saved-routes", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["saved-routes"] });
    },
  });
}

export function useRenameSavedRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch<SavedRoute>(`/api/saved-routes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["saved-routes"] });
    },
  });
}

export function useDeleteSavedRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/saved-routes/${id}`, { method: "DELETE" }).then((res) => {
        if (!res.ok && res.status !== 204) {
          throw new Error("Failed to delete route");
        }
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["saved-routes"] });
    },
  });
}
