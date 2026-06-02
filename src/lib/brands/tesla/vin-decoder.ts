export interface VinInfo {
  brand: "tesla";
  model: string;
  variant: string;
  year: number | null;
}

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
  if (!normalized.startsWith("5YJ")) return null;

  const modelChar = normalized[3];
  const variantChar = normalized[4];
  const yearChar = normalized[9];

  const model = MODEL_MAP[modelChar ?? ""] ?? null;
  if (!model) return null;

  const variant = VARIANT_MAP[variantChar ?? ""] ?? "Unknown variant";
  const year = YEAR_MAP[yearChar ?? ""] ?? null;

  return { brand: "tesla", model, variant, year };
}
