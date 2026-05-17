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
  ],
  bmw: [
    {
      modelName: "i4 eDrive35",
      batteryCapacityKwh: 70.2,
      efficiencyKwhPer100km: 18,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 180,
      maxRangeKm: 483,
      defaultChargeLimit: 80,
    },
    {
      modelName: "i4 M50",
      batteryCapacityKwh: 80.7,
      efficiencyKwhPer100km: 21,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 205,
      maxRangeKm: 465,
      defaultChargeLimit: 80,
    },
    {
      modelName: "iX xDrive40",
      batteryCapacityKwh: 71,
      efficiencyKwhPer100km: 19,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 150,
      maxRangeKm: 426,
      defaultChargeLimit: 80,
    },
    {
      modelName: "iX M60",
      batteryCapacityKwh: 105.2,
      efficiencyKwhPer100km: 23,
      maxAcChargingRateKw: 22,
      maxDcChargingRateKw: 195,
      maxRangeKm: 561,
      defaultChargeLimit: 80,
    },
  ],
  polestar: [
    {
      modelName: "Polestar 2",
      batteryCapacityKwh: 78,
      efficiencyKwhPer100km: 17,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 205,
      maxRangeKm: 551,
      defaultChargeLimit: 80,
    },
    {
      modelName: "Polestar 3",
      batteryCapacityKwh: 111,
      efficiencyKwhPer100km: 21,
      maxAcChargingRateKw: 22,
      maxDcChargingRateKw: 250,
      maxRangeKm: 631,
      defaultChargeLimit: 80,
    },
  ],
  mercedes: [
    {
      modelName: "EQE 300",
      batteryCapacityKwh: 90.6,
      efficiencyKwhPer100km: 17,
      maxAcChargingRateKw: 22,
      maxDcChargingRateKw: 170,
      maxRangeKm: 654,
      defaultChargeLimit: 80,
    },
    {
      modelName: "EQE 43 AMG",
      batteryCapacityKwh: 90.6,
      efficiencyKwhPer100km: 21,
      maxAcChargingRateKw: 22,
      maxDcChargingRateKw: 170,
      maxRangeKm: 516,
      defaultChargeLimit: 80,
    },
    {
      modelName: "EQS 450+",
      batteryCapacityKwh: 107.8,
      efficiencyKwhPer100km: 18,
      maxAcChargingRateKw: 22,
      maxDcChargingRateKw: 200,
      maxRangeKm: 782,
      defaultChargeLimit: 80,
    },
  ],
  vw: [
    {
      modelName: "ID.3",
      batteryCapacityKwh: 58,
      efficiencyKwhPer100km: 15,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 130,
      maxRangeKm: 430,
      defaultChargeLimit: 80,
    },
    {
      modelName: "ID.4",
      batteryCapacityKwh: 77,
      efficiencyKwhPer100km: 17,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 135,
      maxRangeKm: 529,
      defaultChargeLimit: 80,
    },
    {
      modelName: "ID.7",
      batteryCapacityKwh: 77,
      efficiencyKwhPer100km: 16,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 170,
      maxRangeKm: 621,
      defaultChargeLimit: 80,
    },
  ],
  hyundai: [
    {
      modelName: "Ioniq 5",
      batteryCapacityKwh: 77.4,
      efficiencyKwhPer100km: 17,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 230,
      maxRangeKm: 507,
      defaultChargeLimit: 80,
    },
    {
      modelName: "Ioniq 6",
      batteryCapacityKwh: 77.4,
      efficiencyKwhPer100km: 14,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 230,
      maxRangeKm: 614,
      defaultChargeLimit: 80,
    },
    {
      modelName: "EV6",
      batteryCapacityKwh: 77.4,
      efficiencyKwhPer100km: 16,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 230,
      maxRangeKm: 528,
      defaultChargeLimit: 80,
    },
    {
      modelName: "EV9",
      batteryCapacityKwh: 99.8,
      efficiencyKwhPer100km: 21,
      maxAcChargingRateKw: 11,
      maxDcChargingRateKw: 230,
      maxRangeKm: 563,
      defaultChargeLimit: 80,
    },
  ],
  renault: [
    {
      modelName: "Megane E-Tech",
      batteryCapacityKwh: 60,
      efficiencyKwhPer100km: 16,
      maxAcChargingRateKw: 22,
      maxDcChargingRateKw: 130,
      maxRangeKm: 450,
      defaultChargeLimit: 80,
    },
    {
      modelName: "Scenic E-Tech",
      batteryCapacityKwh: 87,
      efficiencyKwhPer100km: 17,
      maxAcChargingRateKw: 22,
      maxDcChargingRateKw: 150,
      maxRangeKm: 620,
      defaultChargeLimit: 80,
    },
  ],
};

export function getModelSpec(brand: BrandKey, modelName: string | null): ModelSpec {
  const models = BRAND_MODELS[brand];
  return (
    models.find((m) => m.modelName === modelName) ??
    models[0]!
  );
}
