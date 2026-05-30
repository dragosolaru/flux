import type { TariffProvider } from "../types";

const PRICE_EUR_KWH = 0.144; // ~0.72 RON/kWh

export const enelRo: TariffProvider = {
  id: "enel-ro",
  displayName: "Enel Energie Muntenia",
  getTodayPrices: (_date = new Date()) =>
    Array.from({ length: 24 }, (_, hour) => ({ hour, priceEurKwh: PRICE_EUR_KWH })),
};
