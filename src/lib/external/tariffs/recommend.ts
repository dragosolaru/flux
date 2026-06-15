import type { HourlyPrice, SmartChargeRecommendation, TariffForecast } from "./types";

/**
 * Find the cheapest contiguous N-hour window starting at or after `fromHour`.
 * Only future hours are considered — early-AM hours that have already passed
 * today are excluded so we never recommend a window that starts in the past.
 * An optional `beforeHour` cap filters out windows that start at or after the
 * departure time (so the car is ready by the time the user leaves).
 */
export function findCheapestWindow(
  prices: HourlyPrice[],
  hoursNeeded: number,
  fromHour: number = new Date().getHours(),
  beforeHour?: number,
): { startHour: number; avgPrice: number } {
  const n = Math.max(1, Math.round(hoursNeeded));
  const ceiling = beforeHour !== undefined ? Math.min(24, beforeHour) : 24;
  const candidates: { startHour: number; avgPrice: number }[] = [];

  for (let start = fromHour; start + n <= ceiling; start++) {
    const window = prices.slice(start, start + n);
    const avg = window.reduce((s, p) => s + p.priceEurKwh, 0) / window.length;
    candidates.push({ startHour: start, avgPrice: avg });
  }

  if (candidates.length === 0) return { startHour: fromHour, avgPrice: prices[fromHour]?.priceEurKwh ?? 0 };

  return candidates.reduce((best, c) => (c.avgPrice < best.avgPrice ? c : best));
}

export function buildForecast(
  prices: HourlyPrice[],
  hoursNeeded: number,
): TariffForecast {
  const now = new Date();
  const currentHour = now.getHours();
  const currentPrice = prices[currentHour]?.priceEurKwh ?? 0;
  const { startHour, avgPrice } = findCheapestWindow(prices, hoursNeeded, currentHour);

  return {
    prices,
    currentPrice,
    cheapestWindowStart: startHour,
    cheapestWindowEnd: Math.min(24, startHour + Math.round(hoursNeeded)),
    cheapestAvgPrice: avgPrice,
  };
}

/**
 * Compute a smart-charge recommendation for a single vehicle.
 * Returns null when charging is already done or no benefit.
 * Pass `departureHour` to exclude windows that start at or after departure —
 * without it the algorithm may recommend hours the car won't be ready in time.
 */
export function computeSmartCharge(
  batteryLevel: number,
  chargeLimit: number,
  chargingRateKw: number,
  batteryCapacityKwh: number,
  prices: HourlyPrice[],
  departureHour?: number,
): SmartChargeRecommendation | null {
  if (batteryLevel >= chargeLimit) return null;

  const kwhNeeded = ((chargeLimit - batteryLevel) / 100) * batteryCapacityKwh;
  const hoursNeeded = kwhNeeded / chargingRateKw;

  const currentHour = new Date().getHours();
  const currentPrice = prices[currentHour]?.priceEurKwh ?? 0;
  const currentCostEur = kwhNeeded * currentPrice;

  const { startHour, avgPrice } = findCheapestWindow(prices, hoursNeeded, currentHour, departureHour);
  const optimalCostEur = kwhNeeded * avgPrice;
  const savingsEur = currentCostEur - optimalCostEur;

  // Only recommend if savings are meaningful (> €0.20) and window is in the future
  if (savingsEur < 0.20 || startHour === currentHour) return null;

  return {
    startAtHour: startHour,
    hoursNeeded,
    savingsEur: Math.round(savingsEur * 100) / 100,
    currentCostEur: Math.round(currentCostEur * 100) / 100,
    optimalCostEur: Math.round(optimalCostEur * 100) / 100,
  };
}
