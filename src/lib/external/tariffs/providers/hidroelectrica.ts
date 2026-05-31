import type { TariffProvider } from "../types";

const PRICE_EUR_KWH = 0.130; // ~0.65 RON/kWh (competitive green tariff)

export const hidroelectrica: TariffProvider = {
  id: "hidroelectrica",
  displayName: "Hidroelectrica Energie",
  getTodayPrices: (_date = new Date()) =>
    Array.from({ length: 24 }, (_, hour) => ({ hour, priceEurKwh: PRICE_EUR_KWH })),
};
