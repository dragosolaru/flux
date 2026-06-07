"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { apiFetch } from "@/lib/api-fetch";
import { ChargerDetailSheet } from "@/components/charging-map/ChargerDetailSheet";
import type { Charger, ConnectorType } from "@/lib/chargers/types";

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

interface GeoCoords {
  lat: number;
  lng: number;
}

function useSilentAutoLocate(onSuccess: (coords: GeoCoords) => void) {
  useEffect(() => {
    if (!navigator.geolocation) return;
    // Silent one-shot locate on mount — 3s timeout, no error shown on denial.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onSuccess({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => undefined,
      { timeout: 3000 },
    );
  // onSuccess is stable (useCallback in parent), so this runs once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

interface QueryArea {
  lat: number;
  lng: number;
  radiusKm: number;
}

export function ChargingMapClient() {
  const t = useTranslations("chargingMap");
  const [selected, setSelected] = useState<Charger | null>(null);
  const [center, setCenter] = useState<GeoCoords>({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [userLocation, setUserLocation] = useState<GeoCoords | null>(null);
  // The query follows the visible map area; updated on pan/zoom via MoveWatcher.
  const [area, setArea] = useState<QueryArea>({ lat: DEFAULT_LAT, lng: DEFAULT_LNG, radiusKm: 25 });
  const [minKw, setMinKw] = useState(0);
  const [connector, setConnector] = useState<ConnectorType | "all">("all");

  const handleLocate = useCallback((lat: number, lng: number) => {
    setCenter({ lat, lng });
    setUserLocation({ lat, lng });
  }, []);

  const handleSilentLocate = useCallback((coords: GeoCoords) => {
    setCenter(coords);
    setUserLocation(coords);
  }, []);

  const handleAreaChange = useCallback((lat: number, lng: number, radiusKm: number) => {
    setArea({ lat, lng, radiusKm });
  }, []);

  useSilentAutoLocate(handleSilentLocate);

  const {
    data: stations = [],
    isFetching,
  } = useQuery({
    queryKey: [
      "chargers-nearby",
      area.lat.toFixed(2),
      area.lng.toFixed(2),
      Math.round(area.radiusKm),
      minKw,
      connector,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        lat: String(area.lat),
        lng: String(area.lng),
        radius: String(Math.round(area.radiusKm)),
      });
      if (minKw > 0) params.set("minKw", String(minKw));
      if (connector !== "all") params.set("connector", connector);
      return apiFetch<Charger[]>(`/api/chargers/nearby?${params}`);
    },
    staleTime: 300_000,
    placeholderData: keepPreviousData,
  });

  return (
    // Root: fills full main area — parent <main> has `position: relative`.
    <div className="absolute inset-0 overflow-hidden">
      {/* Map fills entire area */}
      <StationMap
        stations={stations}
        center={center}
        selected={selected}
        onSelect={setSelected}
        userLocation={userLocation}
        onUserLocate={handleLocate}
        onAreaChange={handleAreaChange}
      />

      {/* Floating filter bar — two compact rows */}
      <div className="absolute left-3 right-3 top-3 z-[1000] space-y-1.5">
        {/* Power filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-background/80 px-3 py-1.5 shadow-xl backdrop-blur-xl scrollbar-none">
          {POWER_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => setMinKw(opt.value)}
              aria-pressed={minKw === opt.value}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                minKw === opt.value
                  ? "border-primary bg-primary/10 font-semibold text-foreground"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {opt.label === "filter_all" ? t("filter_all") : opt.label}
            </button>
          ))}
        </div>

        {/* Connector filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-background/80 px-3 py-1.5 shadow-xl backdrop-blur-xl scrollbar-none">
          {CONNECTOR_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => setConnector(opt.value)}
              aria-pressed={connector === opt.value}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                connector === opt.value
                  ? "border-primary bg-primary/10 font-semibold text-foreground"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {opt.label === "filter_all" ? t("filter_all") : opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Station count — floating bottom-left, above BottomNav */}
      <div className="absolute bottom-3 left-3 z-[1000]">
        <span className="rounded-full bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          {isFetching
            ? t("updating", { count: stations.length })
            : t("stations_count", { count: stations.length })}
        </span>
      </div>

      {/* Station detail sheet — slides up on tap */}
      {selected && (
        <ChargerDetailSheet charger={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
