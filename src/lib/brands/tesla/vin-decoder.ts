export interface VinInfo {
  brand: "tesla";
  model: string;
  /**
   * Body style. NOT the trim — the VIN position this comes from is the body,
   * and reading it as a drivetrain is how a Performance came to be labelled a
   * Standard Range. The trim comes from the car (`vehicle_config.trim_badging`).
   */
  body: string | null;
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

/**
 * Position 5 is the BODY, not the drivetrain.
 *
 * This map read it as a trim and was confidently wrong about it: on
 * `LRW3E7EL0PC661169` — a Model 3 Performance — position 5 is `E`, which the
 * map called "Standard Range RWD". The add-a-vehicle screen therefore
 * introduced a Performance to its owner as a Standard Range.
 *
 * `E` means a four-door left-hand-drive saloon. That is all this position says,
 * and the drivetrain lives at position 8, which this decoder does not attempt:
 * one worked example is not a mapping, and the trim is available from the car
 * itself as `vehicle_config.trim_badging`, which is authoritative rather than
 * inferred.
 */
const BODY_MAP: Record<string, string> = {
  A: "Hatchback, 5 uși",
  B: "Hatchback, 5 uși",
  C: "Coupé",
  E: "Sedan, 4 uși",
  G: "SUV, 5 uși",
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
  const bodyChar = normalized[4];
  const yearChar = normalized[9];

  const model = MODEL_MAP[modelChar ?? ""] ?? null;
  if (!model) return null;

  const body = BODY_MAP[bodyChar ?? ""] ?? null;
  const year = YEAR_MAP[yearChar ?? ""] ?? null;

  return { brand: "tesla", model, body, year };
}
