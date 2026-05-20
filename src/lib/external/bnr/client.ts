import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { BNRRates } from "./types";

const BNR_URL = "https://www.bnr.ro/nbrfxrates.xml";

function parseBNRXml(xml: string): BNRRates {
  const dateMatch = xml.match(/<Date>(\d{4}-\d{2}-\d{2})<\/Date>/);
  const date = dateMatch?.[1] ?? new Date().toISOString().slice(0, 10);

  const rates: Record<string, number> = {};
  const rateRe = /<Rate currency="([A-Z]+)"(?:\s+multiplier="(\d+)")?>([\d.]+)<\/Rate>/g;
  let m: RegExpExecArray | null;
  while ((m = rateRe.exec(xml)) !== null) {
    const currency = m[1];
    const multiplier = m[2] ? parseInt(m[2]) : 1;
    const value = parseFloat(m[3]);
    if (currency && !isNaN(value) && multiplier > 0) {
      rates[currency] = value / multiplier;
    }
  }

  return { date, rates };
}

async function fetchBNRRates(): Promise<BNRRates> {
  const res = await fetch(BNR_URL, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`BNR fetch failed: ${res.status}`);
  const xml = await res.text();
  return parseBNRXml(xml);
}

export async function getExchangeRate(
  currency: string,
  date: Date,
): Promise<number> {
  if (currency === "RON") return 1;

  const supabase = createSupabaseAdminClient();
  const dateStr = date.toISOString().slice(0, 10);

  const { data: cached } = await supabase
    .from("exchange_rates")
    .select("rate_to_ron")
    .eq("rate_date", dateStr)
    .eq("currency", currency)
    .single();

  if (cached) return cached.rate_to_ron;

  // Try fetching for requested date; BNR may not publish on weekends/holidays
  // so we try up to 5 previous days
  for (let offset = 0; offset <= 5; offset++) {
    const tryDate = new Date(date);
    tryDate.setDate(tryDate.getDate() - offset);
    const tryDateStr = tryDate.toISOString().slice(0, 10);

    if (offset > 0) {
      const { data: prevCached } = await supabase
        .from("exchange_rates")
        .select("rate_to_ron")
        .eq("rate_date", tryDateStr)
        .eq("currency", currency)
        .single();
      if (prevCached) {
        await supabase.from("exchange_rates").upsert({
          rate_date: dateStr,
          currency,
          rate_to_ron: prevCached.rate_to_ron,
        });
        return prevCached.rate_to_ron;
      }
    }

    try {
      const bnrData = await fetchBNRRates();
      const rate = bnrData.rates[currency];
      if (rate) {
        await supabase.from("exchange_rates").upsert({
          rate_date: dateStr,
          currency,
          rate_to_ron: rate,
        });
        return rate;
      }
    } catch {
      // continue to next offset
    }
  }

  throw new Error(`Cannot resolve exchange rate for ${currency} on ${dateStr}`);
}
