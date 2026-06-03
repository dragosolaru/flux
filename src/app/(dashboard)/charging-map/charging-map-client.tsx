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
import type { Charger } from "@/lib/chargers/types";

export type { Charger };

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
    queryKey: ["chargers-nearby", area.lat.toFixed(2), area.lng.toFixed(2), Math.round(area.radiusKm)],
    queryFn: () =>
      apiFetch<Charger[]>(
        `/api/chargers/nearby?lat=${area.lat}&lng=${area.lng}&radius=${Math.round(area.radiusKm)}`,
      ),
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
