"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Map, Navigation, Route as RouteIcon, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  Bleed,
  ChipRow,
  Mono,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
  Sheet,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { VehicleSwitch } from "@/components/v2/vehicle-switch";
import * as chargersApi from "@/lib/api/chargers";
import * as vehiclesApi from "@/lib/api/vehicles";
import { haversineMeters } from "@/lib/chargers/dedup";
import { isTeslaOwnNetwork, needsPreconditioning } from "@/lib/trip/precondition";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import type { Charger } from "@/lib/chargers/types";

const StationMap = dynamic(() => import("@/components/charging-map/StationMap"), { ssr: false });

const POWER_STEPS = [0, 50, 150, 350];

/** Street and town, when the source carried them. Never a half-address. */
function addressLine(charger: Charger): string | null {
  const parts = [charger.address?.street, charger.address?.city].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

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
  // poll: false. Only used as a fallback map centre when location is denied.
  const { data: state } = useVehicle(vehicleId, vehicle?.dataSource === "live", false);

  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [minKw, setMinKw] = useState(0);
  // Three states, not two: still asking the phone where we are, asked and
  // refused, or done. Collapsing the first into the last is what printed
  // "no stations found" a second after the screen opened.
  const [locating, setLocating] = useState(true);

  // Silent one-shot locate. On denial the screen falls back to the car's own
  // position, which is the next most useful centre and needs no permission.
  useEffect(() => {
    if (!navigator.geolocation) {
      queueMicrotask(() => setLocating(false));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
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
  /** The station the map is centred on, when it was opened from a list row. */
  const [focused, setFocused] = useState<Charger | null>(null);

  // "Nothing found" is a conclusion. It may only be drawn once we know where we
  // are AND the query has come back — anything earlier is a guess presented as
  // an answer.
  const busy = locating || (centre != null && isLoading);
  // List first, map on request. The list answers "which one, how far, how fast"
  // without a gesture; the map answers "what is the shape of this city", which
  // is a real question but not the one you have with 12% left.
  const [showMap, setShowMap] = useState(false);

  return (
    <Screen>
      <ScreenHeader
        switcher={<VehicleSwitch />}
        title={t("nearby_title")}
        meta={
          locating
            ? tv("locating")
            : centre == null
              ? t("location_error")
              : isLoading
                ? t("loading")
                : t("stations_count", { count: chargers.length })
        }
        metaTone={!locating && centre == null ? "amber" : "muted"}
      />

      <div className="mt-4">
        <ChipRow
          label={t("filter_power")}
          unit=" kW"
          values={POWER_STEPS}
          current={minKw}
          onPick={setMinKw}
          // 0 is not a power, it is the absence of a filter. A chip reading "0"
          // asks for chargers of no power at all, which is the opposite of what
          // it does.
          format={(v) => (v === 0 ? t("filter_all") : `${v} kW`)}
          last
        />
      </div>

      {showMap && centre && (
        <Bleed>
          <div className="mt-4 h-[42dvh] w-full">
            <StationMap
              stations={chargers}
              center={focused ?? centre}
              selected={selected}
              onSelect={setSelected}
              userLocation={here}
              isFetching={isLoading}
            />
          </div>
        </Bleed>
      )}

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <SectionLabel>{t("nearby_title")}</SectionLabel>
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            disabled={centre == null}
            className="min-h-11 transition-colors duration-[80ms] active:opacity-60 disabled:opacity-40"
          >
            <Mono className="text-primary">
              {showMap ? t("list_button") : t("map_button")}
            </Mono>
          </button>
        </div>
        {busy ? (
          // Skeleton rows, not a sentence. The list is about to be rows, and a
          // paragraph that gets replaced by rows moves everything underneath it.
          <div className="mt-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center border-t border-border"
                style={{ minHeight: "var(--v2-row)" }}
              >
                <span
                  className="h-3 animate-pulse rounded bg-white/10"
                  style={{ width: `${58 - i * 6}%` }}
                />
              </div>
            ))}
          </div>
        ) : nearest.length === 0 ? (
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
        // A sheet, not a section below the list. The selection can be made on
        // the map — three screens above this point — and rendering the answer
        // further down made a tap on a pin look like it did nothing.
        <Sheet onClose={() => setSelected(null)} label={selected.name ?? t("station_fallback")}>
          <div className="pb-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[17px] font-medium">
                {selected.name ?? t("station_fallback")}
              </span>
              <Mono className="shrink-0 text-primary">
                {selected.maxPowerKw != null ? `${Math.round(selected.maxPowerKw)} kW` : "—"}
              </Mono>
            </div>
            {selected.operator && (
              <div className="mt-1">
                <Mono className="text-muted-foreground">{selected.operator}</Mono>
              </div>
            )}

            <Rows className="mt-4">
              <Row
                label={t("distance_km")}
                value={
                  centre ? formatDistance(haversineMeters(centre, selected)) : undefined
                }
                disabled={centre == null}
                reason={t("location_error")}
              />
              <Row
                label={t("connectors_label")}
                value={
                  selected.connectors.length > 0
                    ? selected.connectors.map((c) => c.type.toUpperCase()).join(" · ")
                    : undefined
                }
                disabled={selected.connectors.length === 0}
                reason={t("status_unknown")}
              />
              <Row
                label={t("status")}
                value={selected.availability === "offline" ? t("out_of_service") : t("operational")}
                valueTone={selected.availability === "offline" ? "red" : "green"}
              />
              <Row
                label={t("address_unknown")}
                value={addressLine(selected) ?? undefined}
                disabled={addressLine(selected) == null}
                reason={t("address_unknown")}
                last
              />
            </Rows>

            <Rows className="mt-4">
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
                icon={<Map strokeWidth={1.5} />}
                label={tv("show_on_map")}
                onClick={() => {
                  setFocused(selected);
                  setShowMap(true);
                  setSelected(null);
                }}
              />
              <Row
                icon={<RouteIcon strokeWidth={1.5} />}
                label={tv("route_here")}
                // The planner, with this station already as the destination —
                // it knows the car's battery and where it will need to stop,
                // which a maps app cannot.
                href={`/v2/trip?lat=${selected.lat}&lng=${selected.lng}&name=${encodeURIComponent(
                  selected.name ?? t("station_fallback"),
                )}`}
              />
              <Row
                icon={<Navigation strokeWidth={1.5} />}
                label={t("directions")}
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                last
              />
            </Rows>
          </div>
        </Sheet>
      )}

      <div className="mt-7 pb-8">
        <p className="text-xs leading-relaxed text-muted-foreground">{t("disclaimer")}</p>
      </div>

      <NavBar />
    </Screen>
  );
}
