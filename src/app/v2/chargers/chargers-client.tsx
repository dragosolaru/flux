"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Map, Navigation, Route as RouteIcon, Send } from "lucide-react";
import { useState } from "react";
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
import { useHere } from "@/hooks/useHere";
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

  const [minKw, setMinKw] = useState(0);

  // Live, because this screen is opened in a moving car. A one-shot fix taken
  // when the screen opened is wrong by the length of a slip road, and the
  // browser gives a fresh one ten times a second at ±1–2 m for free — it never
  // touches Tesla's API, so none of it is charged against the vehicle's daily
  // read budget. useHere throttles the commits; see the hook for why.
  const { here, state: locate } = useHere({ live: true });
  // Three states, not two: still asking where we are, asked and refused, or
  // done. Collapsing the first into the last is what printed "no stations
  // found" a second after the screen opened.
  const locating = locate === "asking";

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

  // Grouped by site, because a site with four stalls arrives as four rows with
  // the same name, the same distance and the same power — and a list that says
  // "iHunt 110 M 200 KW" twice reads as broken rather than as two bays. Three
  // decimal places of latitude is about 100 m, which is one car park.
  //
  // The group opens the best point at that site rather than the first one the
  // query happened to return: highest power, then whichever we trust more.
  const nearest = centre
    ? Object.values(
        [...chargers]
          .map((c) => ({ charger: c, meters: haversineMeters(centre, c) }))
          .reduce<Record<string, { charger: Charger; meters: number; points: number }>>(
            (sites, entry) => {
              const key = `${entry.charger.name ?? "?"}|${entry.charger.lat.toFixed(3)}|${entry.charger.lng.toFixed(3)}`;
              const seen = sites[key];
              if (!seen) {
                sites[key] = { ...entry, points: 1 };
                return sites;
              }
              seen.points += 1;
              const better =
                (entry.charger.maxPowerKw ?? 0) > (seen.charger.maxPowerKw ?? 0) ||
                ((entry.charger.maxPowerKw ?? 0) === (seen.charger.maxPowerKw ?? 0) &&
                  entry.charger.confidence > seen.charger.confidence);
              if (better) {
                seen.charger = entry.charger;
                seen.meters = entry.meters;
              }
              return sites;
            },
            {},
          ),
      )
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

  // The road to the selection, drawn on the map. Asked for only once a station
  // is picked and only when we know where we are — a route from nowhere is not
  // a shorter route, it is a wrong one.
  const { data: road } = useQuery({
    queryKey: ["route", centre?.lat, centre?.lng, selected?.id],
    queryFn: async () => {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: centre, to: { lat: selected!.lat, lng: selected!.lng } }),
      });
      if (!res.ok) throw new Error("route");
      return (await res.json()) as {
        distanceKm: number;
        drivingMinutes: number;
        line: [number, number][];
      };
    },
    enabled: centre != null && selected != null,
    staleTime: 5 * 60_000,
    retry: false,
  });

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

      {/* The other two questions this tab now answers. They were three separate
          menu entries — a map, a planner and a station list — which is three
          places to look for one thing: where am I going and where do I charge. */}
      <div className="mt-4">
        <Rows>
          <Row
            icon={<RouteIcon strokeWidth={1.5} className="text-primary" />}
            label={<span className="text-primary">{tv("plan_trip")}</span>}
            href="/v2/trip"
          />
          <Row
            icon={<Navigation strokeWidth={1.5} />}
            label={tv("find_car_link")}
            href="/v2/map"
            last
          />
        </Rows>
      </div>

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
              routeLine={road?.line}
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
            {nearest.map(({ charger, meters, points }, i) => (
              <Row
                key={charger.id}
                label={
                  points > 1
                    ? `${charger.name ?? t("station_fallback")} · ${t("points_count", { count: points })}`
                    : (charger.name ?? t("station_fallback"))
                }
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
                // NOT distance_km — that key is the phrase "la {km} km", a
                // whole sentence with a placeholder in it, and used as a bare
                // label next-intl printed the placeholder: the row read
                // "la {km} km · 720 M".
                label={t("distance_label")}
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
                // The label is the field; address_unknown is what to say when
                // there ISN'T one. Used as the label it claimed the address was
                // unavailable while printing the address next to it.
                label={t("address_label")}
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
