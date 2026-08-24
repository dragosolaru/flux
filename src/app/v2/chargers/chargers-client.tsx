"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Navigation, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  ChipRow,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import * as chargersApi from "@/lib/api/chargers";
import * as vehiclesApi from "@/lib/api/vehicles";
import { haversineMeters } from "@/lib/chargers/dedup";
import { isTeslaOwnNetwork, needsPreconditioning } from "@/lib/trip/precondition";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import type { Charger } from "@/lib/chargers/types";

const POWER_STEPS = [0, 50, 150, 350];

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Chargers near you, as a list rather than a map.
 *
 * The v1 screen is map-first with a list behind a sheet. On a phone, standing
 * somewhere with 12% left, the question is "which one, how far, how fast" —
 * three values that a sorted list answers directly and a map makes you pinch
 * at. The map is one row away; it is not the default.
 */
export function ChargersV2Client() {
  const t = useTranslations("chargingMap");
  const tv = useTranslations("v2");

  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicleId = selectedVehicleId ?? "";
  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  const { data: state } = useVehicle(vehicleId, vehicle?.dataSource === "live");

  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [minKw, setMinKw] = useState(0);

  // Silent one-shot locate. On denial the screen falls back to the car's own
  // position, which is the next most useful centre and needs no permission.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { timeout: 5000, maximumAge: 60_000 },
    );
  }, []);

  const centre =
    here ??
    (state?.latitude != null && state.longitude != null
      ? { lat: state.latitude, lng: state.longitude }
      : null);

  const { data: chargers = [], isLoading } = useQuery({
    queryKey: ["chargers-near", centre?.lat, centre?.lng, minKw],
    queryFn: () =>
      chargersApi.inBBox(
        {
          minLat: centre!.lat - 0.25,
          minLng: centre!.lng - 0.35,
          maxLat: centre!.lat + 0.25,
          maxLng: centre!.lng + 0.35,
        },
        { limit: 200, minKw },
      ),
    enabled: centre != null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const nearest = centre
    ? [...chargers]
        .map((c) => ({ charger: c, meters: haversineMeters(centre, c) }))
        .sort((a, b) => a.meters - b.meters)
        .slice(0, 12)
    : [];

  const sendTo = useMutation({
    mutationFn: (charger: Charger) =>
      vehiclesApi.shareNavigation(
        vehicleId,
        {
          destination: {
            lat: charger.lat,
            lng: charger.lng,
            name: charger.name ?? t("station_fallback"),
          },
        },
        {
          // Same rule as the planner: Tesla warms the pack itself for its own
          // network, so a command there is wasted quota.
          precondition:
            needsPreconditioning(charger.maxPowerKw ?? 0) &&
            !isTeslaOwnNetwork({ operatorId: charger.operatorId }),
        },
      ),
    onSuccess: () => toast.success(t("send_to_car_success")),
    onError: () => toast.error(t("send_to_car_error")),
  });

  const [selected, setSelected] = useState<Charger | null>(null);

  return (
    <Screen>
      <ScreenHeader
        title={t("nearby_title")}
        meta={
          centre == null
            ? t("location_error")
            : isLoading
              ? t("loading")
              : t("stations_count", { count: chargers.length })
        }
        metaTone={centre == null ? "amber" : "muted"}
      />

      <div className="mt-4">
        <ChipRow
          label={t("filter_power")}
          unit=" kW"
          values={POWER_STEPS}
          current={minKw}
          onPick={setMinKw}
          last
        />
      </div>

      <div className="mt-6">
        <SectionLabel>{t("nearby_title")}</SectionLabel>
        {nearest.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {centre == null ? t("location_error") : t("no_results")}
          </p>
        ) : (
          <Rows className="mt-2">
            {nearest.map(({ charger, meters }, i) => (
              <Row
                key={charger.id}
                label={charger.name ?? t("station_fallback")}
                value={`${formatDistance(meters)} · ${
                  charger.maxPowerKw != null ? `${Math.round(charger.maxPowerKw)} kW` : "—"
                }`}
                valueTone={
                  charger.availability === "offline"
                    ? "red"
                    : (charger.maxPowerKw ?? 0) >= 150
                      ? "accent"
                      : "muted"
                }
                onClick={() => setSelected(charger)}
                last={i === nearest.length - 1}
              />
            ))}
          </Rows>
        )}
      </div>

      {selected && (
        <div className="mt-7">
          <SectionLabel>{selected.name ?? t("station_fallback")}</SectionLabel>
          <Rows className="mt-2">
            <Row
              label={t("connectors_label")}
              value={
                selected.connectors.length > 0
                  ? selected.connectors.map((c) => c.type).join(" · ")
                  : undefined
              }
              disabled={selected.connectors.length === 0}
              reason={t("status_unknown")}
            />
            <Row
              label={t("status")}
              value={
                selected.availability === "offline" ? t("out_of_service") : t("operational")
              }
              valueTone={selected.availability === "offline" ? "red" : "green"}
            />
            <Row
              icon={<Send strokeWidth={1.5} className="text-primary" />}
              label={<span className="text-primary">{t("send_to_car")}</span>}
              pending={sendTo.isPending}
              pendingLabel={tv("sending")}
              disabled={vehicleId === ""}
              reason={tv("no_answer")}
              onClick={() => sendTo.mutate(selected)}
            />
            <Row
              icon={<Navigation strokeWidth={1.5} />}
              label={t("directions")}
              href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
              last
            />
          </Rows>
        </div>
      )}

      <div className="mt-7 pb-8">
        <Rows>
          <Row label={t("map_button")} value="v1" href="/charging-map" last />
        </Rows>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("disclaimer")}</p>
      </div>

      <NavBar />
    </Screen>
  );
}
