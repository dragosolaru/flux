"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import {
  Bars,
  Mono,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import * as tariffsApi from "@/lib/api/tariffs";
import type { TariffForecast } from "@/lib/external/tariffs/types";

interface TariffResponse extends TariffForecast {
  providerId: string;
  providerName: string;
}

interface SettingsResponse {
  activeProvider: string;
  providers: { id: string; displayName: string }[];
}

const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function EnergyV2Client() {
  const t = useTranslations("energy");
  const tv = useTranslations("v2");
  const qc = useQueryClient();

  const { data: forecast } = useQuery({
    queryKey: ["tariff-prices"],
    queryFn: () => tariffsApi.prices<TariffResponse>(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings } = useQuery({
    queryKey: ["tariff-settings"],
    queryFn: () => tariffsApi.settings<SettingsResponse>(),
    staleTime: 60 * 1000,
  });

  const switchProvider = useMutation({
    mutationFn: (providerId: string) => tariffsApi.updateSettings<SettingsResponse>(providerId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tariff-settings"] });
      void qc.invalidateQueries({ queryKey: ["tariff-prices"] });
    },
  });

  const prices = forecast?.prices ?? [];
  const cheapest =
    forecast != null
      ? `${hh(forecast.cheapestWindowStart)}–${hh(forecast.cheapestWindowEnd)}`
      : null;

  return (
    <Screen>
      <ScreenHeader title={t("page_title")} meta={forecast?.providerName} />

      <div className="mt-6">
        <SectionLabel>{t("current_price_label")}</SectionLabel>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span
            className="font-light leading-[0.9] tracking-[-0.045em] tabular-nums"
            style={{ fontSize: "clamp(48px, 16vw, 64px)" }}
          >
            {forecast != null ? forecast.currentPrice.toFixed(2) : "—"}
          </span>
          <span className="text-lg font-light" style={{ color: "var(--v2-soft)" }}>
            €/kWh
          </span>
        </div>
      </div>

      {prices.length > 0 && (
        <div className="mt-7">
          {/* Every third hour is labelled. Twenty-four labels at 9px on a 375
              phone is a grey smear, and the shape is the point here anyway. */}
          <Bars
            items={prices.map((p) => ({
              key: String(p.hour),
              label: p.hour % 3 === 0 ? String(p.hour).padStart(2, "0") : "",
              value: p.priceEurKwh,
            }))}
            footerLeft={cheapest ? `${t("cheapest_window_label")} ${cheapest}` : undefined}
            footerRight={
              forecast != null ? `${forecast.cheapestAvgPrice.toFixed(2)} €/kWh` : undefined
            }
          />
        </div>
      )}

      <div className="mt-7">
        <SectionLabel>{t("tariff_provider_label")}</SectionLabel>
        <Rows className="mt-2">
          {(settings?.providers ?? []).map((provider, i, all) => (
            <Row
              key={provider.id}
              label={provider.displayName}
              value={provider.id === settings?.activeProvider ? tv("state_on") : undefined}
              valueTone="accent"
              pending={switchProvider.isPending && switchProvider.variables === provider.id}
              pendingLabel={tv("sending")}
              onClick={() => switchProvider.mutate(provider.id)}
              last={i === all.length - 1}
            />
          ))}
        </Rows>
      </div>

      <div className="mt-7 pb-8">
        <Mono className="text-muted-foreground">{t("page_subtitle")}</Mono>
      </div>

      <NavBar />
    </Screen>
  );
}
