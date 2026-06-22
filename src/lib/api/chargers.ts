import { apiFetch } from "@/lib/api-fetch";
import type { Charger } from "@/lib/chargers/types";

const BASE = "/api/chargers";

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface ChargerStats {
  totalChargers: number;
  fastChargers: number;
  lastRefresh: string | null;
}

export function inBBox(
  bbox: BBox,
  opts: { limit?: number; minKw?: number; connector?: string } = {},
): Promise<Charger[]> {
  const params = new URLSearchParams({
    bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
    limit: String(opts.limit ?? 2000),
  });
  if (opts.minKw && opts.minKw > 0) params.set("minKw", String(opts.minKw));
  if (opts.connector && opts.connector !== "all") {
    params.set("connector", opts.connector);
  }
  return apiFetch<Charger[]>(`${BASE}?${params}`);
}

export function search(query: string, limit = 50): Promise<Charger[]> {
  return apiFetch<Charger[]>(
    `${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}

export function stats(): Promise<ChargerStats> {
  return apiFetch<ChargerStats>(`${BASE}/stats`);
}
