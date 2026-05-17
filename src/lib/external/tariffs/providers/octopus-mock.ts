import type { HourlyPrice, TariffProvider } from "../types";

// Octopus Agile-style: very cheap 02:00–05:00, expensive 16:00–19:00
// Slightly lower average than Tibber (UK market bias)
function generatePrices(date: Date): HourlyPrice[] {
  const day = date.getDay();
  const weekendFactor = day === 0 || day === 6 ? 0.80 : 1.0;

  const BASE = [
    0.10, 0.09, 0.06, 0.05, 0.05, 0.08,  // 0–5  (agile cheap window 02–05)
    0.13, 0.20, 0.25, 0.22, 0.18, 0.17,  // 6–11
    0.16, 0.15, 0.16, 0.20, 0.30, 0.32,  // 12–17 (evening peak 16–17)
    0.28, 0.23, 0.19, 0.15, 0.12, 0.10,  // 18–23
  ];

  const dateJitter = ((date.getDate() * 7) % 5) * 0.004;

  return BASE.map((base, hour) => ({
    hour,
    priceEurKwh: Math.round((base * weekendFactor + dateJitter) * 1000) / 1000,
  }));
}

export const octopusMock: TariffProvider = {
  id: "octopus-mock",
  displayName: "Octopus Agile (mock)",
  getTodayPrices: (date = new Date()) => generatePrices(date),
};
