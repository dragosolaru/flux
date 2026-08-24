"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { Row, Rows, Screen, ScreenHeader, SectionLabel } from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { HomeLocationPicker } from "@/components/settings/HomeLocationPicker";
import { usePreferences, useUpdatePreferences } from "@/hooks/usePreferences";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { SUPPORTED_CURRENCIES, type Currency } from "@/lib/currency/format";

/**
 * Settings as rows that commit on tap.
 *
 * Locale and currency are the two that are genuinely a short list of answers,
 * so they are rows here rather than native selects — the same reasoning that
 * turned charge limit into tappable values. Home location keeps v1's geocoding
 * picker: it owns the debounce and the listbox ARIA, and none of that is
 * presentation.
 *
 * Account deletion stays on the v1 screen. A second path to a destructive
 * action is a second path to get it wrong, and the typed-confirmation guard
 * already lives there.
 */
export function SettingsV2Client() {
  const t = useTranslations("settings");
  const tv = useTranslations("v2");
  const router = useRouter();

  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();
  const [refreshing, startTransition] = useTransition();

  const locale = (prefs?.locale ?? "ro") as Locale;
  const currency = (prefs?.displayCurrency ?? "RON") as Currency;
  const busy = update.isPending || refreshing;

  function pickLocale(next: Locale) {
    // The whole tree is translated on the server, so the language only actually
    // changes after a refresh. Without it the tap looks like it did nothing.
    update.mutate(
      { locale: next },
      { onSuccess: () => startTransition(() => router.refresh()) },
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t("title")} />

      <div className="mt-6">
        <SectionLabel>{t("locale.label")}</SectionLabel>
        <Rows className="mt-2">
          {LOCALES.map((code, i) => (
            <Row
              key={code}
              label={LOCALE_LABELS[code]}
              value={code === locale ? tv("state_on") : undefined}
              valueTone="accent"
              pending={busy && update.variables?.locale === code}
              pendingLabel={tv("sending")}
              disabled={busy}
              onClick={() => pickLocale(code)}
              last={i === LOCALES.length - 1}
            />
          ))}
        </Rows>
      </div>

      <div className="mt-7">
        <SectionLabel>{t("currency.label")}</SectionLabel>
        <Rows className="mt-2">
          {SUPPORTED_CURRENCIES.map((code, i) => (
            <Row
              key={code}
              label={code}
              value={code === currency ? tv("state_on") : undefined}
              valueTone="accent"
              pending={busy && update.variables?.displayCurrency === code}
              pendingLabel={tv("sending")}
              disabled={busy}
              onClick={() => update.mutate({ displayCurrency: code })}
              last={i === SUPPORTED_CURRENCIES.length - 1}
            />
          ))}
        </Rows>
      </div>

      <div className="mt-7">
        <SectionLabel>{t("home_location.label")}</SectionLabel>
        <div className="mt-3">
          <HomeLocationPicker />
        </div>
      </div>

      <div className="mt-7">
        <SectionLabel>{tv("group_car")}</SectionLabel>
        <Rows className="mt-2">
          <Row label={t("section.vehicles")} href="/v2/garage" />
          <Row label={t("section.tariff")} href="/v2/energy" />
          <Row label={t("section.notifications")} value="v1" href="/settings" last />
        </Rows>
      </div>

      <div className="mt-7 pb-8">
        <SectionLabel>{tv("group_account")}</SectionLabel>
        <Rows className="mt-2">
          <Row label={t("section.account")} value="v1" href="/settings" />
          <Row label={t("section.billing")} href="/pricing" />
          <Row
            label={t("section.danger")}
            value="v1"
            valueTone="red"
            href="/settings"
            last
          />
        </Rows>
      </div>

      <NavBar />
    </Screen>
  );
}
