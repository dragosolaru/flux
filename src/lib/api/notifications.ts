import { apiFetch } from "@/lib/api-fetch";
import type { NotificationPreferences } from "@/types/notifications";

export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>("/api/me/notification-preferences");
}

export function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/me/notification-preferences", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function getVapidPublicKey(): Promise<{ publicKey: string }> {
  return apiFetch<{ publicKey: string }>("/api/push/vapid-public-key");
}

interface PushKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function subscribePush(sub: PushKeys): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(sub),
  });
}

export function unsubscribePush(endpoint: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

export function sendTestPush(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/push/test", { method: "POST" });
}
