import type { HourlyPrice, TariffProvider } from "../types";

// aWATTar-style: Central European spot market, solar midday dip, flatter curve
// Slightly cheaper overnight, prominent solar dip 11:00–15:00
function generatePrices(date: Date): HourlyPrice[] {
  const day = date.getDay();
  const weekendFactor = day === 0 || day === 6 ? 0.75 : 1.0;

  const BASE = [
    0.08, 0.07, 0.07, 0.06, 0.07, 0.09,  // 0–5
    0.13, 0.18, 0.21, 0.19, 0.16, 0.12,  // 6–11 (solar starts noon)
    0.10, 0.09, 0.09, 0.11, 0.18, 0.24,  // 12–17 (solar dip 12–14, peak 17)
    0.26, 0.22, 0.17, 0.13, 0.10, 0.08,  // 18–23
  ];

  const dateJitter = ((date.getDate() * 11) % 9) * 0.003;

  return BASE.map((base, hour) => ({
    hour,
    priceEurKwh: Math.round((base * weekendFactor + dateJitter) * 1000) / 1000,
  }));
}

export const awattarMock: TariffProvider = {
  id: "awattar-mock",
  displayName: "aWATTar (mock)",
  getTodayPrices: (date = new Date()) => generatePrices(date),
};
