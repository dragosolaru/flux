"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/api/notifications";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/types/notifications";

export function useNotificationPreferences() {
  return useQuery<NotificationPreferences>({
    queryKey: ["me", "notification-preferences"],
    queryFn: () => api.getNotificationPreferences(),
    staleTime: 60_000,
    placeholderData: DEFAULT_NOTIFICATION_PREFERENCES,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) =>
      api.updateNotificationPreferences(patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me", "notification-preferences"] });
    },
  });
}
