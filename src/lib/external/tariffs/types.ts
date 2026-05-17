export interface HourlyPrice {
  hour: number;        // 0–23, wall-clock hour (user's local day)
  priceEurKwh: number;
}

export interface TariffForecast {
  prices: HourlyPrice[];      // 24 entries, today's hours
  currentPrice: number;       // €/kWh right now
  cheapestWindowStart: number; // hour the cheapest N-hour window begins
  cheapestWindowEnd: number;   // exclusive end hour
  cheapestAvgPrice: number;   // avg €/kWh in that window
}

export interface TariffProvider {
  id: string;
  displayName: string;
  /** Returns today's 24 hourly prices. Deterministic per calendar date. */
  getTodayPrices(date?: Date): HourlyPrice[];
}

export interface SmartChargeRecommendation {
  startAtHour: number;        // recommended start (wall-clock hour)
  hoursNeeded: number;
  savingsEur: number;         // vs starting immediately
  currentCostEur: number;
  optimalCostEur: number;
}
