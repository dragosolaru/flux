import type { TariffProvider } from "../types";

// E.ON Duo ToU tariff (approx. 2025 prices)
const PEAK_EUR_KWH     = 0.172; // ~0.86 RON/kWh, 07:00–23:00
const OFF_PEAK_EUR_KWH = 0.098; // ~0.49 RON/kWh, 23:00–07:00

function isOffPeak(hour: number): boolean {
  return hour < 7 || hour >= 23;
}

export const eonRo: TariffProvider = {
  id: "eon-ro",
  displayName: "E.ON Energie România (ToU)",
  getTodayPrices: (_date = new Date()) =>
    Array.from({ length: 24 }, (_, hour) => ({
      hour,
      priceEurKwh: isOffPeak(hour) ? OFF_PEAK_EUR_KWH : PEAK_EUR_KWH,
    })),
};
