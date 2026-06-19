"use client";

import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import {
  CURRENCY_LABELS,
  SUPPORTED_CURRENCIES,
  type Currency,
} from "@/lib/currency/format";
import { usePreferences, useUpdatePreferences } from "@/hooks/usePreferences";

export function CurrencyPicker() {
  const t = useTranslations();
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();

  const current = (prefs?.displayCurrency ?? "RON") as Currency;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("settings.currency.description")}</p>
      <div className="relative w-full max-w-xs">
        <select
          id="currency-picker"
          aria-label={t("settings.currency.label")}
          disabled={update.isPending}
          value={current}
          onChange={(e) => update.mutate({ displayCurrency: e.target.value as Currency })}
          className="w-full appearance-none rounded-lg border border-border bg-card px-3 py-2 pr-8 text-sm text-foreground disabled:opacity-50"
        >
          {SUPPORTED_CURRENCIES.map((cur) => (
            <option key={cur} value={cur}>
              {cur} — {CURRENCY_LABELS[cur]}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}
