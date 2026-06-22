import { apiFetch } from "@/lib/api-fetch";

export interface TripPlanRequest {
  vehicleId?: string;
  origin: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string };
  startSoc: number;
  arrivalSocPct: number;
}

export function plan<T>(body: TripPlanRequest): Promise<T> {
  return apiFetch<T>("/api/trip-plan", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const res = await apiFetch<{ name: string | null }>(
    `/api/geocode?reverse=1&lat=${lat}&lon=${lon}`,
  );
  if (!res.name) throw new Error("reverse geocode failed");
  return res.name;
}
