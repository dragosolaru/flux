export interface TempBucket {
  label: string;
  avgWhPerKm: number;
  count: number;
}

export interface MileagePeriod {
  period: string;
  km: number;
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
}
