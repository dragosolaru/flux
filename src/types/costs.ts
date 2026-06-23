export type DocumentSource = "upload" | "email" | "whatsapp" | "vault-upload" | "manual";
export type DocumentType = "home_bill" | "public_receipt" | "gas_bill" | "petrol_receipt" | "other" | "unknown" | "rca" | "casco" | "itp" | "rovinieta" | "vignette" | "bridge_toll" | "car_tax" | "service" | "parking" | "fuel" | "tires" | "fine" | "highway_toll" | "car_wash" | "leasing" | "roadside_assistance" | "spare_parts" | "ferry" | "talon";
export type DocumentStatus = "pending" | "processing" | "done" | "error" | "needs_review";

export interface Document {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  source: DocumentSource;
  document_type: DocumentType | null;
  storage_path: string;
  mime_type: string;
  original_filename: string | null;
  parsed_json: ParsedDocument | null;
  status: DocumentStatus;
  error_message: string | null;
  confidence: number | null;
  created_at: string;
  processed_at: string | null;
  view_url: string | null;
}

export interface EnergyCost {
  id: string;
  document_id: string;
  vehicle_id: string;
  document_type: "home_bill" | "public_receipt";
  period_start: string;
  period_end: string;
  total_kwh: number | null;
  vehicle_kwh_attributed: number | null;
  original_amount: number;
  original_currency: string;
  exchange_rate: number;
  cost_ron: number;
  provider_name: string | null;
  charger_network: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  charging_session_id: string | null;
  is_manually_edited: boolean;
  created_at: string;
}

export interface ParsedDocument {
  document_type: DocumentType;
  has_non_electricity_items: boolean;
  provider_name: string | null;
  period_start: string | null;
  period_end: string | null;
  session_timestamp: string | null;
  total_kwh: number | null;
  price_per_kwh: number | null;
  electricity_cost: number | null;
  cost_total: number | null;
  currency: string;
  charger_network: string | null;
  location_name: string | null;
  plate_number?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  issuer?: string | null;
  seria_polita?: string | null;
  bonus_malus?: string | null;
  confidence: {
    document_type: number;
    total_kwh: number;
    cost_total: number;
    period_start: number;
    session_timestamp: number;
    valid_until?: number;
  };
}

export interface VaultDocument {
  id: string;
  document_type: DocumentType | null;
  original_filename: string | null;
  mime_type: string;
  status: DocumentStatus;
  is_non_vehicle: boolean;
  view_url: string | null;
  created_at: string;
  processed_at: string | null;
  plate_number: string | null;
  valid_from: string | null;
  valid_until: string | null;
  amount_ron: number | null;
  issuer: string | null;
  days_until_expiry: number | null;
}

export interface CostAggregation {
  totalCostRon: number;
  totalKwh: number;
  homeKwh: number;
  publicKwh: number;
  homeCostRon: number;
  publicCostRon: number;
  costPerKmHome: number | null;
  costPerKmPublic: number | null;
  costPerKmBlended: number | null;
  whPerKm: number | null;
  monthlyTrend: MonthlyBucket[];
}

export interface MonthlyBucket {
  month: string;
  costRon: number;
  kwh: number;
  homeKwh: number;
  publicKwh: number;
}

export interface ExchangeRate {
  rate_date: string;
  currency: string;
  rate_to_ron: number;
}
