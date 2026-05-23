// Per-brand model specs used by the mock simulator and seed generator.
// Values are real-world EU-spec figures (WLTP range, max charge rates).

import type { BrandKey } from "./types";
import type { ScenarioVehicle } from "@/lib/mock/types";

export interface ModelSpec extends ScenarioVehicle {
  modelName: string;      // matches the string stored in vehicles.model
  maxRangeKm: number;
  defaultChargeLimit: number; // typical recommended SoC limit
}

export const BRAND_MODELS: Record<BrandKey, ModelSpec[]> = {
  tesla: [
    {
      modelName: "Model 3",
      batteryCapacityKwh: 75,
      efficiencyKwhPer100km: 16,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 250,
      maxRangeKm: 602,
      defaultChargeLimit: 80,
    },
    {
      modelName: "Model Y",
      batteryCapacityKwh: 75,
      efficiencyKwhPer100km: 17,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 250,
      maxRangeKm: 533,
      defaultChargeLimit: 80,
    },
    {
      modelName: "Model S",
      batteryCapacityKwh: 100,
      efficiencyKwhPer100km: 20,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 250,
      maxRangeKm: 600,
      defaultChargeLimit: 90,
    },
    {
      modelName: "Model X",
      batteryCapacityKwh: 100,
      efficiencyKwhPer100km: 22,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 250,
      maxRangeKm: 560,
      defaultChargeLimit: 90,
    },
  ],
};

export function getModelSpec(brand: string, modelName: string | null): ModelSpec {
  // Defensive: legacy DB rows may have brand keys no longer in the registry
  // (e.g. 'bmw' after the Tesla-only refactor). Fall back to Tesla Model 3.
  const models = BRAND_MODELS[brand as BrandKey] ?? BRAND_MODELS.tesla;
  return (
    models.find((m) => m.modelName === modelName) ??
    models[0]!
  );
}
