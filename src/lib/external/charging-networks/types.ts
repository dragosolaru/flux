export type PlugType = "CCS" | "CHAdeMO" | "Type2" | "Tesla";
export type NetworkId = "ionity" | "tesla-sc" | "enbw" | "allego" | "fastned" | "other";

export interface ChargingStation {
  id: string;
  networkId: NetworkId;
  name: string;
  lat: number;
  lng: number;
  maxKw: number;
  totalStalls: number;
  plugTypes: PlugType[];
  priceEurKwh: number | null;  // null = included in subscription
  addressCity: string;
  addressCountry: string;
}

export interface StationAvailability {
  stationId: string;
  availableStalls: number;
  totalStalls: number;
  updatedAt: string;
}

export interface NetworkMeta {
  id: NetworkId;
  displayName: string;
  color: string;        // hex for map pin
  plugTypes: PlugType[];
}
