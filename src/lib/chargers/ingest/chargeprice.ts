import type { ChargerPricing, RawCharger } from "../types";

const CHARGEPRICE_BASE = "https://api.chargeprice.app";

interface ChargePriceAttributes {
  price?: number | null;
  currency?: string | null;
}

interface ChargePriceData {
  attributes?: ChargePriceAttributes | null;
}

interface ChargePriceResponse {
  data?: ChargePriceData[] | null;
}

function extractPricing(data: unknown): ChargerPricing | null {
  if (typeof data !== "object" || data === null) return null;
  const list = (data as ChargePriceResponse).data;
  if (!Array.isArray(list) || list.length === 0) return null;

  for (const item of list) {
    const attrs = item?.attributes;
    const price = attrs?.price;
    const currency = attrs?.currency;
    if (typeof price === "number" && typeof currency === "string") {
      return { perKwh: price, currency, source: "chargeprice" };
    }
  }
  return null;
}

async function lookupPricing(
  ocmId: string,
  apiKey: string,
): Promise<ChargerPricing | null> {
  try {
    const res = await fetch(`${CHARGEPRICE_BASE}/v1/charge_prices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": apiKey,
      },
      body: JSON.stringify({ data: { type: "charge_price_request", ocm_id: ocmId } }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return extractPricing(data);
  } catch {
    return null;
  }
}

/**
 * Pricing enrichment for OCM-sourced chargers. ChargePrice's API is keyed and
 * complex; if the key is missing or any call fails, inputs pass through
 * unchanged. This must NEVER break ingestion.
 */
export async function enrichPricing(
  raws: RawCharger[],
): Promise<RawCharger[]> {
  const apiKey = process.env.CHARGEPRICE_API_KEY;
  if (!apiKey) return raws;

  return Promise.all(
    raws.map(async (raw) => {
      if (raw.source !== "ocm" || raw.pricing !== null) return raw;
      const pricing = await lookupPricing(raw.sourceRef, apiKey);
      return pricing ? { ...raw, pricing } : raw;
    }),
  );
}
