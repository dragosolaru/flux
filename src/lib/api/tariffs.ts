import { apiFetch } from "@/lib/api-fetch";

const BASE = "/api/tariffs";

export function prices<T>(): Promise<T> {
  return apiFetch<T>(`${BASE}/prices`);
}

export function settings<T>(): Promise<T> {
  return apiFetch<T>(`${BASE}/settings`);
}

export function updateSettings<T = unknown>(providerId: string): Promise<T> {
  return apiFetch<T>(`${BASE}/settings`, {
    method: "PUT",
    body: JSON.stringify({ providerId }),
  });
}
