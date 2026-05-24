"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { LOCALES, LOCALE_FLAGS, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { usePreferences, useUpdatePreferences } from "@/hooks/usePreferences";

export function LocalePicker() {
  const t = useTranslations();
  const router = useRouter();
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();
  const [pending, startTransition] = useTransition();

  function onChange(next: Locale) {
    update.mutate(
      { locale: next },
      {
        onSuccess: () => {
          startTransition(() => {
            router.refresh();
          });
        },
      },
    );
  }

  const current = (prefs?.locale ?? "ro") as Locale;
  const busy = update.isPending || pending;

  return (
    <div className="space-y-2">
      <label htmlFor="locale-picker" className="text-sm font-medium">
        {t("settings.locale.label")}
      </label>
      <p className="text-xs text-muted-foreground">{t("settings.locale.description")}</p>
      <select
        id="locale-picker"
        disabled={busy}
        value={current}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
      >
        {LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_FLAGS[loc]}  {LOCALE_LABELS[loc]}
          </option>
        ))}
      </select>
    </div>
  );
}
