export interface TempBucket {
  label: string;
  avgWhPerKm: number;
  count: number;
}

export interface MileagePeriod {
  period: string;
  km: number;
}

/**
 * What a month actually cost, in energy.
 *
 * Distance was already aggregated per month and energy was not, though every
 * trip carries `energy_used_kwh` — so the app knew how far the car had gone and
 * never said what that took. `kwhPer100km` is derived from the month's totals
 * rather than averaged from each trip's own figure: averaging ratios weights a
 * two-kilometre errand the same as a four-hundred-kilometre drive.
 */
export interface ConsumptionPeriod {
  period: string;
  km: number;
  kwh: number;
  /** null when a month has distance but no energy recorded against it. */
  kwhPer100km: number | null;
}

export interface VehicleStatsResponse {
  totalDrivingKm: number;
  totalDrivingH: number;
  tripCount: number;
  avgTripKm: number | null;
  totalChargingH: number;
  totalEnergyAddedKwh: number;
  chargingSessionCount: number;
  avgWhPerKm: number | null;
  efficiencyByTemp: TempBucket[];
  vampireDrainPctPerH: number | null;
  mileageByMonth: MileagePeriod[];
  consumptionByMonth: ConsumptionPeriod[];
}
