export interface FuelComparison {
  lPer100km: number;
  priceEurL: number;
}

const KEY = "flux_fuel_comparison";
const DEFAULTS: FuelComparison = { lPer100km: 8, priceEurL: 1.65 };

export function getFuelComparison(): FuelComparison {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<FuelComparison>;
    return {
      lPer100km:
        typeof parsed.lPer100km === "number" && parsed.lPer100km > 0
          ? parsed.lPer100km
          : DEFAULTS.lPer100km,
      priceEurL:
        typeof parsed.priceEurL === "number" && parsed.priceEurL > 0
          ? parsed.priceEurL
          : DEFAULTS.priceEurL,
    };
  } catch {
    return DEFAULTS;
  }
}

export function setFuelComparison(v: FuelComparison): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
