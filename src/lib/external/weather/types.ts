export interface WeatherSnapshot {
  tempC: number;
  windSpeedMs: number;
  windDirDeg: number;      // 0=N, 90=E, 180=S, 270=W
  precipMmH: number;       // mm/h — 0 = dry
  cloudCoverPct: number;   // 0–100
  humidityPct: number;     // 0–100
  conditionLabel: string;  // "Clear", "Cloudy", "Rain", "Snow", etc.
}

export interface WeatherProvider {
  id: string;
  displayName: string;
  getCurrent(lat: number, lng: number): WeatherSnapshot;
}

export interface RangeDerating {
  idealKm: number;
  deratedKm: number;
  totalPct: number;          // negative = reduction
  factors: {
    tempPct: number;
    windPct: number;
    precipPct: number;
  };
}
