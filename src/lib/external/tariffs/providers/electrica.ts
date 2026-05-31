import type { TariffProvider } from "../types";

const PRICE_EUR_KWH = 0.154; // ~0.77 RON/kWh at 5.0 RON/EUR

export const electricaRo: TariffProvider = {
  id: "electrica-ro",
  displayName: "Electrica Furnizare",
  getTodayPrices: (_date = new Date()) =>
    Array.from({ length: 24 }, (_, hour) => ({ hour, priceEurKwh: PRICE_EUR_KWH })),
};
