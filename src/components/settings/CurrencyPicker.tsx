"use client";

import { useTranslations } from "next-intl";

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
      <label htmlFor="currency-picker" className="text-sm font-medium">
        {t("settings.currency.label")}
      </label>
      <p className="text-xs text-muted-foreground">{t("settings.currency.description")}</p>
      <select
        id="currency-picker"
        disabled={update.isPending}
        value={current}
        onChange={(e) => update.mutate({ displayCurrency: e.target.value as Currency })}
        className="w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
      >
        {SUPPORTED_CURRENCIES.map((cur) => (
          <option key={cur} value={cur}>
            {cur} — {CURRENCY_LABELS[cur]}
          </option>
        ))}
      </select>
    </div>
  );
}
