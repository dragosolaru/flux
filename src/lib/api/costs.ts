import { apiFetch } from "@/lib/api-fetch";
import type { CostAggregation } from "@/types/costs";
import type { Currency } from "@/lib/currency/format";

export interface CostsResponse extends CostAggregation {
  petrolEquivalentCostRon: number;
  totalKm: number;
}

export interface ExchangeRates {
  display: Currency;
  ronPerEur: number;
  ronPerDisplay: number;
}

export function get(
  vehicleId: string,
  from?: string,
  to?: string,
): Promise<CostsResponse> {
  const params = new URLSearchParams({ vehicleId });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return apiFetch<CostsResponse>(`/api/costs?${params}`);
}

export function exchangeRates(): Promise<ExchangeRates> {
  return apiFetch<ExchangeRates>("/api/exchange-rates");
}
