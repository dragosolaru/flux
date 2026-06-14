"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { ChevronDown } from "lucide-react";

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
      <p className="text-xs text-muted-foreground">{t("settings.locale.description")}</p>
      <div className="relative w-full max-w-xs">
        <select
          id="locale-picker"
          aria-label={t("settings.locale.label")}
          disabled={busy}
          value={current}
          onChange={(e) => onChange(e.target.value as Locale)}
          className="w-full appearance-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-8 text-sm disabled:opacity-50"
        >
          {LOCALES.map((loc) => (
            <option key={loc} value={loc}>
              {LOCALE_FLAGS[loc]}  {LOCALE_LABELS[loc]}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}
