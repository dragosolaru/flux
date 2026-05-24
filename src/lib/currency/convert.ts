import { getExchangeRate } from "@/lib/external/bnr/client";

import type { Currency } from "./format";

/**
 * Convert an amount from any currency to any other, going through RON as canonical.
 *
 * - getExchangeRate(currency, date) returns the number of RON per 1 unit of currency
 *   on that date (e.g. EUR → 4.97 means 1 EUR = 4.97 RON)
 * - To go RON → X: divide by the rate
 * - To go X → RON: multiply by the rate
 * - To go X → Y: X → RON → Y
 */
export async function convertCurrency(
  amount: number,
  from: Currency,
  to: Currency,
  date: Date = new Date(),
): Promise<number> {
  if (from === to) return amount;

  const fromRate = from === "RON" ? 1 : await getExchangeRate(from, date);
  const toRate = to === "RON" ? 1 : await getExchangeRate(to, date);

  const amountInRon = amount * fromRate;
  return amountInRon / toRate;
}

/**
 * Synchronous version that takes pre-fetched rates. Use this in batch
 * conversions (e.g. an aggregation over many rows) to avoid hammering the DB.
 *
 * Both rates are "currency → RON" (matching getExchangeRate semantics).
 */
export function convertCurrencySync(
  amount: number,
  fromRate: number,
  toRate: number,
): number {
  const amountInRon = amount * fromRate;
  return amountInRon / toRate;
}
