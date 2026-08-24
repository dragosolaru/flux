"use client";

import { useTranslations } from "next-intl";

import { Row, Rows, Screen, ScreenHeader, SectionLabel } from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { usePreferences } from "@/hooks/usePreferences";

const LOCALE_NAMES: Record<string, string> = {
  ro: "Română",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  hu: "Magyar",
};

/**
 * Settings as rows, each showing its current value on the right.
 *
 * Editing is not redrawn here: every row hands over to the v1 screen that owns
 * the control. Rebuilding five pickers in a direction that has not been tested
 * on glass would double the surface being reviewed for no gain — and every one
 * of those controls works today.
 */
export function SettingsV2Client() {
  const t = useTranslations("settings");
  const tv = useTranslations("v2");
  const { data: prefs } = usePreferences();

  return (
    <Screen>
      <ScreenHeader title={t("title")} />

      <div className="mt-6">
        <SectionLabel>{tv("group_preferences")}</SectionLabel>
        <Rows className="mt-2">
          <Row
            label={t("locale")}
            value={prefs ? (LOCALE_NAMES[prefs.locale] ?? prefs.locale) : "—"}
            href="/settings"
          />
          <Row
            label={t("currency")}
            value={prefs?.displayCurrency ?? "—"}
            href="/settings"
          />
          <Row
            label={t("home_location")}
            value={prefs?.homeAddress ?? undefined}
            href="/settings"
            disabled={prefs?.homeAddress == null}
            reason={tv("not_set")}
            last
          />
        </Rows>
      </div>

      <div className="mt-7">
        <SectionLabel>{tv("group_car")}</SectionLabel>
        <Rows className="mt-2">
          <Row label={t("vehicles")} href="/v2/garage" />
          <Row label={t("tariff")} href="/v2/energy" />
          <Row label={t("notifications")} href="/settings" last />
        </Rows>
      </div>

      <div className="mt-7 pb-8">
        <SectionLabel>{tv("group_account")}</SectionLabel>
        <Rows className="mt-2">
          <Row label={t("account")} href="/settings" />
          <Row label={t("billing")} href="/pricing" />
          {/* Destructive actions stay on the v1 screen, where the confirmation
              and the typed-checkbox guard already live. A second path to
              deleting an account is a second path to get that wrong. */}
          <Row
            label={t("danger_zone")}
            value={t("delete_permanently")}
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
