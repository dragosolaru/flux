"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiFetch } from "@/lib/api-fetch";
import { formatMoney, type Currency } from "@/lib/currency/format";
import type { Locale } from "@/lib/i18n/config";

interface ExchangeRates {
  display: Currency;
  ronPerEur: number;
  ronPerDisplay: number;
}

/**
 * Display-layer currency conversion. Amounts stay canonical in storage and
 * APIs (costs in RON, trip estimates in EUR); this hook converts them to the
 * user's preferred display currency at render time.
 *
 * Until rates load (or if they fail), amounts are formatted in their canonical
 * currency so a value is never shown with the wrong symbol.
 */
export function useCurrency() {
  const locale = useLocale() as Locale;
  const { data } = useQuery<ExchangeRates>({
    queryKey: ["exchange-rates"],
    queryFn: () => apiFetch<ExchangeRates>("/api/exchange-rates"),
    staleTime: 3_600_000,
    gcTime: 3_600_000,
    retry: 1,
  });

  // Guard against a bad/zero rate payload — dividing by 0 would render
  // "∞"/"NaN" everywhere, so fall back to the canonical currency instead.
  const valid = !!data && data.ronPerDisplay > 0 && data.ronPerEur > 0;

  function fromRON(amount: number, maxFractionDigits?: number): string {
    if (!valid) return formatMoney(amount, "RON", locale, maxFractionDigits);
    return formatMoney(amount / data!.ronPerDisplay, data!.display, locale, maxFractionDigits);
  }

  function fromEUR(amount: number, maxFractionDigits?: number): string {
    if (!valid) return formatMoney(amount, "EUR", locale, maxFractionDigits);
    return formatMoney(
      (amount * data!.ronPerEur) / data!.ronPerDisplay,
      data!.display,
      locale,
      maxFractionDigits,
    );
  }

  return { currency: valid ? data!.display : null, fromRON, fromEUR };
}
