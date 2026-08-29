"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useHere } from "@/hooks/useHere";
import { List, SlidersHorizontal } from "lucide-react";

import * as chargersApi from "@/lib/api/chargers";
import { ChargerDetailSheet } from "@/components/charging-map/ChargerDetailSheet";
import { StationListSheet } from "@/components/charging-map/StationListSheet";
import type { Charger, ConnectorType } from "@/lib/chargers/types";
import type { ViewportBBox } from "@/components/charging-map/StationMap";

// Minimal debounce for the search input — avoids a request per keystroke.
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export type { Charger };

// Filter options. Power is a minimum-kW threshold; connector maps to the
// canonical ConnectorType the /nearby endpoint accepts.
const POWER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "filter_all" },
  { value: 50, label: "50+ kW" },
  { value: 150, label: "150+ kW" },
  { value: 350, label: "350 kW" },
];

const CONNECTOR_OPTIONS: { value: ConnectorType | "all"; label: string }[] = [
  { value: "all", label: "filter_all" },
  { value: "ccs2", label: "CCS" },
  { value: "type2", label: "Type 2" },
  { value: "chademo", label: "CHAdeMO" },
  { value: "tesla", label: "Tesla" },
];

const StationMap = dynamic(() => import("@/components/charging-map/StationMap"), { ssr: false });

// Default centre: Romania (Bucharest)
const DEFAULT_LAT = 44.4268;
const DEFAULT_LNG = 26.1025;

// Initial bbox: ~50 km around the default centre
const DEFAULT_BBOX: ViewportBBox = {
  minLat: DEFAULT_LAT - 0.5,
  minLng: DEFAULT_LNG - 0.7,
  maxLat: DEFAULT_LAT + 0.5,
  maxLng: DEFAULT_LNG + 0.7,
};

function toBBox(lat: number, lng: number): ViewportBBox {
  return { minLat: lat - 0.5, minLng: lng - 0.7, maxLat: lat + 0.5, maxLng: lng + 0.7 };
}

interface GeoCoords {
  lat: number;
  lng: number;
}


export function ChargingMapClient() {
  const t = useTranslations("chargingMap");
  const [selected, setSelected] = useState<Charger | null>(null);
  const [center, setCenter] = useState<GeoCoords>({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  // bbox follows the visible map viewport; updated on pan/zoom via MoveWatcher.
  const [area, setArea] = useState<ViewportBBox>(DEFAULT_BBOX);
  const [minKw, setMinKw] = useState(0);
  const [connector, setConnector] = useState<ConnectorType | "all">("all");
  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilter = minKw > 0 || connector !== "all";
  // Incremented on location jumps to drop stale cross-area keepPreviousData.
  const [resetKey, setResetKey] = useState(0);

  // The button still recentres on demand. It no longer sets the user marker —
  // that follows the live fix now, so the two cannot disagree.
  const handleLocate = useCallback((lat: number, lng: number) => {
    setCenter({ lat, lng });
    setArea(toBBox(lat, lng));
    setResetKey((k) => k + 1);
  }, []);

  // Live rather than one-shot. Measured on the car's own screen: the browser
  // gives a fix every ~0.1 s at ±1–2 m, and it never touches Tesla's API, so
  // none of it is charged against the vehicle's daily read budget. A position
  // taken when the screen opened is wrong by the length of a slip road by the
  // time you have finished reading the list. useHere throttles the commits.
  const { here } = useHere({ live: true });

  // The map recentres on the FIRST fix only. Recentring on every one would drag
  // the view out from under a thumb that had panned somewhere else on purpose.
  const centredRef = useRef(false);
  useEffect(() => {
    if (!here || centredRef.current) return;
    centredRef.current = true;
    setCenter({ lat: here.lat, lng: here.lng });
    setArea(toBBox(here.lat, here.lng));
    setResetKey((k) => k + 1);
  }, [here]);

  // The road to whatever is selected, drawn on the map. The app already had
  // four routing providers wired up for the trip planner and none of them
  // reached this screen; POST /api/route is the small answer — a line, a
  // distance and a time — rather than a full plan.
  const { data: road } = useQuery({
    queryKey: ["route", here?.lat, here?.lng, selected?.id],
    queryFn: async () => {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: { lat: here!.lat, lng: here!.lng },
          to: { lat: selected!.lat, lng: selected!.lng },
        }),
      });
      if (!res.ok) throw new Error("route");
      return (await res.json()) as { distanceKm: number; drivingMinutes: number; line: [number, number][] };
    },
    enabled: here != null && selected != null,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const handleAreaChange = useCallback((bbox: ViewportBBox) => {
    setArea(bbox);
  }, []);

  const {
    data: stations = [],
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [
      "chargers-bbox",
      resetKey,
      area.minLat.toFixed(2),
      area.minLng.toFixed(2),
      area.maxLat.toFixed(2),
      area.maxLng.toFixed(2),
      minKw,
      connector,
    ],
    queryFn: () => chargersApi.inBBox(area, { minKw, connector }),
    staleTime: 300_000,
    placeholderData: keepPreviousData,
  });

  // Cold areas return empty immediately while the server ingests in the
  // background. Poll a few times at short intervals to surface the freshly
  // stored stations without making the user pan again, and show an indicator
  // so the empty map reads as "loading" rather than "no stations here".
  const COLD_POLL_ATTEMPTS = 3;
  const areaKey = `${resetKey}:${area.minLat.toFixed(2)},${area.minLng.toFixed(2)}`;
  const [coldPolls, setColdPolls] = useState<Record<string, number>>({});
  // Only unfiltered queries signal a cold area — an empty result under an
  // active filter is a real "no matches", not data still being ingested.
  const ingesting =
    !isFetching &&
    !hasActiveFilter &&
    stations.length === 0 &&
    (coldPolls[areaKey] ?? 0) < COLD_POLL_ATTEMPTS;
  useEffect(() => {
    if (!ingesting) return;
    const id = setTimeout(() => {
      setColdPolls((m) => ({ ...m, [areaKey]: (m[areaKey] ?? 0) + 1 }));
      void refetch();
    }, 4000);
    return () => clearTimeout(id);
  }, [ingesting, areaKey, refetch]);

  // Station search (name/operator) — queried server-side, debounced.
  const [showList, setShowList] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounced(searchInput, 350);
  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["chargers-search", debouncedSearch],
    queryFn: () => chargersApi.search(debouncedSearch),
    enabled: debouncedSearch.trim().length >= 2,
    staleTime: 300_000,
  });

  const listStations = debouncedSearch.trim().length >= 2 ? searchResults : stations;

  const handleListSelect = useCallback((s: Charger) => {
    setSelected(s);
    setCenter({ lat: s.lat, lng: s.lng });
    setShowList(false);
  }, []);

  return (
    // Root: fills full main area (parent <main> has position:relative).
    // No overflow-hidden here so ChargerDetailSheet can sit at the bottom of
    // <main> without covering the BottomNav below it.
    <div className="absolute inset-0">
      {/* Inner div clips Leaflet tiles to the map bounds */}
      <div className="absolute inset-0 overflow-hidden">
        <StationMap
          stations={stations}
          center={center}
          selected={selected}
          routeLine={road?.line}
          onSelect={setSelected}
          userLocation={here ? { lat: here.lat, lng: here.lng } : null}
          onUserLocate={handleLocate}
          onAreaChange={handleAreaChange}
        />

        {/* Filter toggle — always visible top-left */}
        <div className="absolute left-3 top-3 z-[1000]">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`pill-float flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              hasActiveFilter
                ? "!border-primary/50 !bg-primary/15 text-foreground font-semibold"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            <SlidersHorizontal className="size-3.5" />
            {showFilters ? t("hide_filters") : t("show_filters")}
            {hasActiveFilter && <span className="size-1.5 rounded-full bg-primary" />}
          </button>
        </div>

        {/* List + search toggle — top-right */}
        <div className="absolute right-3 top-3 z-[1000]">
          <button
            onClick={() => setShowList(true)}
            className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 text-xs font-medium text-muted-foreground shadow-xl backdrop-blur-xl transition-colors hover:text-foreground"
          >
            <List className="size-3.5" />
            {t("list_button")}
          </button>
        </div>

        {/* Floating filter rows — collapsed by default */}
        {showFilters && (
          <div className="absolute left-3 right-3 top-16 z-[1000] space-y-1.5">
            {/* Power filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-border bg-card/95 px-3 py-1.5 shadow-xl backdrop-blur-xl scrollbar-none">
              {POWER_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setMinKw(opt.value)}
                  aria-pressed={minKw === opt.value}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    minKw === opt.value
                      ? "border-primary/50 bg-primary/15 font-semibold text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {opt.label === "filter_all" ? t("filter_all") : opt.label}
                </button>
              ))}
            </div>

            {/* Connector filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-border bg-card/95 px-3 py-1.5 shadow-xl backdrop-blur-xl scrollbar-none">
              {CONNECTOR_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setConnector(opt.value)}
                  aria-pressed={connector === opt.value}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    connector === opt.value
                      ? "border-primary/50 bg-primary/15 font-semibold text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {opt.label === "filter_all" ? t("filter_all") : opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Station count badge — floating bottom-left */}
        <div className="absolute bottom-3 left-3 z-[1000]">
          <span className={`pill-float px-3 py-1 text-xs text-muted-foreground ${ingesting ? "animate-pulse" : ""}`}>
            {ingesting
              ? t("ingesting_area")
              : isFetching
                ? t("updating", { count: stations.length })
                : t("stations_count", { count: stations.length })}
          </span>
        </div>
      </div>

      {/* ChargerDetailSheet sits at bottom of <main>, not the full viewport,
          so the BottomNav underneath remains accessible. */}
      {selected && (
        <ChargerDetailSheet charger={selected} onClose={() => setSelected(null)} />
      )}

      {showList && (
        <StationListSheet
          stations={listStations}
          center={center}
          query={searchInput}
          onQueryChange={setSearchInput}
          searching={searching}
          onSelect={handleListSelect}
          onClose={() => setShowList(false)}
        />
      )}
    </div>
  );
}
