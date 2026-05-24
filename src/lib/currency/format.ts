import type { Locale } from "@/lib/i18n/config";

export const SUPPORTED_CURRENCIES = [
  "RON",
  "EUR",
  "USD",
  "GBP",
  "HUF",
  "PLN",
  "CHF",
  "NOK",
  "SEK",
] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_LABELS: Record<Currency, string> = {
  RON: "Leu românesc",
  EUR: "Euro",
  USD: "US Dollar",
  GBP: "British Pound",
  HUF: "Forint maghiar",
  PLN: "Złoty polonez",
  CHF: "Franc elvețian",
  NOK: "Coroană norvegiană",
  SEK: "Coroană suedeză",
};

export function isCurrency(value: string | undefined | null): value is Currency {
  return value != null && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Format a numeric amount as a currency string using Intl.NumberFormat.
 * Pass the already-converted amount in the target currency.
 *
 * For display-only formatting (no conversion). Conversion happens in convert.ts.
 */
export function formatMoney(
  amount: number,
  currency: Currency,
  locale: Locale,
): string {
  const intlLocale = locale === "ro" ? "ro-RO" : "en-GB";
  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "HUF" ? 0 : 2,
  }).format(amount);
}

/**
 * Compact format for big numbers — useful for KPI cards on mobile.
 * 1234567 RON → "1,23 mil RON" (ro) or "1.23M RON" (en)
 */
export function formatMoneyCompact(
  amount: number,
  currency: Currency,
  locale: Locale,
): string {
  const intlLocale = locale === "ro" ? "ro-RO" : "en-GB";
  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

/**
 * Format kWh values consistently. Not currency, but groups with money displays.
 */
export function formatKwh(kwh: number, locale: Locale): string {
  const intlLocale = locale === "ro" ? "ro-RO" : "en-GB";
  return `${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(kwh)} kWh`;
}
