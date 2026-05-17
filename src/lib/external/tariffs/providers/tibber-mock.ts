import type { HourlyPrice, TariffProvider } from "../types";

// Tibber-style dynamic pricing: morning & evening peaks, cheap overnight
// Prices vary slightly day-to-day using date as seed.
function generatePrices(date: Date): HourlyPrice[] {
  const day = date.getDay(); // 0=Sun…6=Sat
  const weekendFactor = day === 0 || day === 6 ? 0.85 : 1.0;

  // Base curve: typical EU residential hourly profile
  const BASE = [
    0.09, 0.08, 0.08, 0.07, 0.08, 0.10,  // 0–5
    0.14, 0.22, 0.28, 0.24, 0.20, 0.18,  // 6–11
    0.17, 0.16, 0.17, 0.19, 0.22, 0.29,  // 12–17
    0.31, 0.28, 0.24, 0.20, 0.15, 0.11,  // 18–23
  ];

  const dateJitter = ((date.getDate() * 13) % 7) * 0.005; // ±3.5 ct day-specific

  return BASE.map((base, hour) => ({
    hour,
    priceEurKwh: Math.round((base * weekendFactor + dateJitter) * 1000) / 1000,
  }));
}

export const tibberMock: TariffProvider = {
  id: "tibber-mock",
  displayName: "Tibber (mock)",
  getTodayPrices: (date = new Date()) => generatePrices(date),
};
