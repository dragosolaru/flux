"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import { cardVariants, slideUp } from "@/lib/animations/variants";
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

// A row of mutually-exclusive filter chips. `filter_all` labels are resolved
// through i18n; everything else is a literal (kW thresholds, connector names).
function FilterChips<T extends string | number>({
  label,
  options,
  value,
  onChange,
  allLabel,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  allLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
            value === opt.value
              ? "border-primary bg-primary/10 text-foreground"
              : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
          }`}
        >
          {opt.label === "filter_all" ? allLabel : opt.label}
        </button>
      ))}
    </div>
  );
}

// Mobile (below Tailwind `lg`) panel slides up; desktop fades in.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

export function ChargingMapClient() {
  const t = useTranslations("chargingMap");
  const isDesktop = useIsDesktop();
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
    isLoading,
    isFetching,
    isError,
    error,
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

  const displayName = selected ? (selected.name ?? selected.operator ?? t("station_fallback")) : null;
  const displayCity = selected?.address.city ?? null;
  const displayPower =
    selected != null
      ? (selected.connectors[0]?.powerKw ?? selected.maxPowerKw)
      : null;
  const totalConnectors = selected
    ? selected.connectors.reduce((sum, c) => sum + c.count, 0)
    : 0;
  const isLikelyOperational = selected != null && selected.confidence >= 0.5;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? t("loading")
              : isError
                ? t("load_error")
                : isFetching
                  ? t("updating", { count: stations.length })
                  : t("stations_in_view", { count: stations.length })}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/70">{t("disclaimer")}</p>

      {/* Filter bar — minimum power + connector type */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <FilterChips
          label={t("filter_power")}
          options={POWER_OPTIONS}
          value={minKw}
          onChange={setMinKw}
          allLabel={t("filter_all")}
        />
        <FilterChips
          label={t("filter_connector")}
          options={CONNECTOR_OPTIONS}
          value={connector}
          onChange={setConnector}
          allLabel={t("filter_all")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Map */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="h-[500px]">
              {isLoading ? (
                <Skeleton className="h-full w-full rounded-none" />
              ) : isError ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted">
                  <p className="text-sm font-medium text-destructive">
                    {t("load_error_detail")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {error instanceof Error ? error.message : t("unknown_error")}
                  </p>
                </div>
              ) : (
                <StationMap
                  stations={stations}
                  center={center}
                  selected={selected}
                  onSelect={setSelected}
                  userLocation={userLocation}
                  onUserLocate={handleLocate}
                  onAreaChange={handleAreaChange}
                />
              )}
            </div>
          </Card>
        </div>

        {/* Detail panel */}
        <div>
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.id}
                variants={isDesktop ? cardVariants : slideUp}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{displayName}</CardTitle>
                    {displayCity && (
                      <p className="text-sm text-muted-foreground">{displayCity}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("max_power")}</span>
                      <span className="font-medium">
                        {displayPower != null ? `${displayPower} kW` : t("unknown_power")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("connectors")}</span>
                      <span className="font-medium">{totalConnectors}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("status")}</span>
                      <span
                        className={`font-medium ${
                          isLikelyOperational ? "text-chart-2" : "text-destructive"
                        }`}
                      >
                        {isLikelyOperational ? t("operational") : t("out_of_service")}
                      </span>
                    </div>
                    <button
                      onClick={() => setSelected(null)}
                      className="w-full rounded-md border py-1.5 text-xs hover:bg-muted"
                    >
                      {t("close")}
                    </button>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                variants={isDesktop ? cardVariants : slideUp}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Card>
                  <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    {t("select_hint")}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
