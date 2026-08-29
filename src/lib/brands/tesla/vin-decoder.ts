export interface VinInfo {
  brand: "tesla";
  model: string;
  variant: string;
  year: number | null;
}

/** Fremont, Shanghai, Berlin, Austin. */
const TESLA_WMI = new Set(["5YJ", "LRW", "XP7", "7SA"]);

const MODEL_MAP: Record<string, string> = {
  "3": "Model 3",
  Y: "Model Y",
  S: "Model S",
  X: "Model X",
  C: "Cybertruck",
};

const VARIANT_MAP: Record<string, string> = {
  E: "Standard Range RWD",
  F: "Dual Motor AWD",
  G: "Performance AWD",
  P: "Performance",
  N: "Long Range RWD",
  R: "All-Wheel Drive",
  S: "Standard",
  T: "Standard Range RWD",
};

const YEAR_MAP: Record<string, number> = {
  K: 2019,
  L: 2020,
  M: 2021,
  N: 2022,
  P: 2023,
  R: 2024,
  S: 2025,
};

export function decodeTeslaVin(vin: string): VinInfo | null {
  const normalized = vin.trim().toUpperCase();

  if (normalized.length !== 17) return null;
  // Tesla builds in four places, and this accepted one of them. `LRW` is
  // Shanghai and `XP7` is Berlin — between them, every European and Chinese
  // car — so the decoder returned null for exactly the cars this app has.
  if (!TESLA_WMI.has(normalized.slice(0, 3))) return null;

  const modelChar = normalized[3];
  const variantChar = normalized[4];
  const yearChar = normalized[9];

  const model = MODEL_MAP[modelChar ?? ""] ?? null;
  if (!model) return null;

  // The VIN cannot settle the trim: this position is the body/platform, not the
  // drivetrain, and a Model 3 Performance and a Standard Range can share it.
  // Anything that needs the real trim reads `vehicle_config.trim_badging` from
  // the car instead — see estimateSoH. This stays a rough label, and says so.
  const variant = VARIANT_MAP[variantChar ?? ""] ?? "Unknown variant";
  const year = YEAR_MAP[yearChar ?? ""] ?? null;

  return { brand: "tesla", model, variant, year };
}
