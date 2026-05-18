import type { StationAvailability } from "./types";
import { STATIONS } from "./stations";

/**
 * Deterministic availability simulator using Poisson-inspired occupancy.
 * Each stall is independently "occupied" with probability that varies by
 * station, time of day, and a slow-changing pseudo-random seed.
 * Result is stable for ~2 minutes (rounded epoch / 120s).
 */
export function getAvailability(stationId: string): StationAvailability | null {
  const station = STATIONS.find((s) => s.id === stationId);
  if (!station) return null;

  const now = new Date();
  const hour = now.getHours();
  const epoch2m = Math.floor(Date.now() / 120_000);

  // Peak occupancy: 08–10 and 17–20
  const peakHour = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);
  const baseOccupancy = peakHour ? 0.65 : 0.30;

  // Deterministic per-stall occupancy using station id hash + epoch
  let occupied = 0;
  for (let stall = 0; stall < station.totalStalls; stall++) {
    const seed = (stationId.charCodeAt(stall % stationId.length) * 31 + stall * 97 + epoch2m * 7) % 100;
    if (seed < baseOccupancy * 100) occupied++;
  }

  return {
    stationId,
    availableStalls: station.totalStalls - occupied,
    totalStalls: station.totalStalls,
    updatedAt: new Date().toISOString(),
  };
}

export function getAllAvailability(): StationAvailability[] {
  return STATIONS.map((s) => getAvailability(s.id)!);
}
