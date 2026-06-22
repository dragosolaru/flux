"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as meApi from "@/lib/api/me";

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
    queryFn: () => meApi.preferences(),
    staleTime: 60_000,
    placeholderData: DEFAULT_PREFS,
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserPreferences>) =>
      meApi.updatePreferences(patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me", "preferences"] });
    },
  });
}
