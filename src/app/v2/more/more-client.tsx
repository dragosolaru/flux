"use client";

import {
  Car,
  FileText,
  Gauge,
  MapPin,
  Plug,
  Receipt,
  Route,
  Settings as SettingsIcon,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Row, Rows, Screen, ScreenHeader, SectionLabel } from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";

/**
 * The fourth tab. Four labels on the nav is a deliberate ceiling — a five- or
 * six-tab bar on a 375 phone truncates every label — so everything else lives
 * one tap deep, as rows.
 */
export function MoreV2Client() {
  const t = useTranslations("nav");
  const tv = useTranslations("v2");

  return (
    <Screen>
      <ScreenHeader title={t("more")} />

      <div className="mt-6">
        <SectionLabel>{t("section.car")}</SectionLabel>
        <Rows className="mt-2">
          <Row icon={<MapPin strokeWidth={1.5} />} label={t("map")} href="/v2/map" />
          <Row icon={<Car strokeWidth={1.5} />} label={t("garage")} href="/v2/garage" />
          <Row icon={<FileText strokeWidth={1.5} />} label={t("documents")} href="/v2/documents" last />
        </Rows>
      </div>

      <div className="mt-7">
        <SectionLabel>{t("section.money")}</SectionLabel>
        <Rows className="mt-2">
          <Row icon={<Receipt strokeWidth={1.5} />} label={t("costs")} href="/v2/costs" />
          <Row icon={<Zap strokeWidth={1.5} />} label={t("energy")} href="/v2/energy" />
          <Row icon={<Gauge strokeWidth={1.5} />} label={t("insights")} href="/v2/insights" last />
        </Rows>
      </div>

      <div className="mt-7">
        <SectionLabel>{t("section.planning")}</SectionLabel>
        <Rows className="mt-2">
          <Row icon={<Route strokeWidth={1.5} />} label={t("trip")} href="/v2/trip" />
          <Row icon={<Plug strokeWidth={1.5} />} label={t("charging_map")} href="/v2/chargers" />
          <Row
            icon={<SettingsIcon strokeWidth={1.5} />}
            label={t("settings")}
            href="/v2/settings"
            last
          />
        </Rows>
      </div>

      <div className="mt-7 pb-8">
        <Rows>
          <Row label={tv("index_back_to_app")} value="v1" href="/dashboard" />
          <Row label={tv("index_title")} value={tv("index_screens")} href="/v2" last />
        </Rows>
      </div>

      <NavBar />
    </Screen>
  );
}
