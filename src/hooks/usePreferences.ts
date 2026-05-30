"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-fetch";

export interface UserPreferences {
  locale: string;
  displayCurrency: string;
  homeAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
  whatsappPhone: string | null;
}

const DEFAULT_PREFS: UserPreferences = {
  locale: "ro",
  displayCurrency: "RON",
  homeAddress: null,
  homeLat: null,
  homeLng: null,
  whatsappPhone: null,
};

export function usePreferences() {
  return useQuery<UserPreferences>({
    queryKey: ["me", "preferences"],
    queryFn: () => apiFetch<UserPreferences>("/api/me/preferences"),
    staleTime: 60_000,
    placeholderData: DEFAULT_PREFS,
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserPreferences>) =>
      apiFetch<{ ok: true }>("/api/me/preferences", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me", "preferences"] });
    },
  });
}
