import { apiFetch } from "@/lib/api-fetch";
import type { CapabilityContext } from "@/lib/capabilities";
import type { UserPreferences } from "@/hooks/usePreferences";

export function capabilities(): Promise<CapabilityContext> {
  return apiFetch<CapabilityContext>("/api/me/capabilities");
}

export function preferences(): Promise<UserPreferences> {
  return apiFetch<UserPreferences>("/api/me/preferences");
}

export function updatePreferences(
  patch: Partial<UserPreferences>,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
