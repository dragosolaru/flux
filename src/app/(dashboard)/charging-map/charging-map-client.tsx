"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import type { ChargingStation } from "@/app/api/charging-stations/route";

export type { ChargingStation };

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

export function ChargingMapClient() {
  const t = useTranslations("chargingMap");
  const [selected, setSelected] = useState<ChargingStation | null>(null);
  const [center, setCenter] = useState<GeoCoords>({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [userLocation, setUserLocation] = useState<GeoCoords | null>(null);

  const handleLocate = useCallback((lat: number, lng: number) => {
    setCenter({ lat, lng });
    setUserLocation({ lat, lng });
  }, []);

  const handleSilentLocate = useCallback((coords: GeoCoords) => {
    setCenter(coords);
    setUserLocation(coords);
  }, []);

  useSilentAutoLocate(handleSilentLocate);

  const {
    data: stations = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["charging-stations", center.lat, center.lng],
    queryFn: () =>
      apiFetch<ChargingStation[]>(
        `/api/charging-stations?lat=${center.lat}&lng=${center.lng}`,
      ),
    staleTime: 300_000,
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Charging Map</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading stations…"
              : isError
                ? "Could not load stations"
                : `${stations.length} stations near you`}
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
                    Failed to load stations
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {error instanceof Error ? error.message : "Unknown error"}
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
                />
              )}
            </div>
          </Card>
        </div>

        {/* Detail panel */}
        <div>
          {selected ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{selected.name}</CardTitle>
                {selected.town && (
                  <p className="text-sm text-muted-foreground">{selected.town}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max power</span>
                  <span className="font-medium">
                    {selected.maxPowerKw != null ? `${selected.maxPowerKw} kW` : "Unknown"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Connectors</span>
                  <span className="font-medium">{selected.connectorCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className={`font-medium ${
                      selected.isOperational ? "text-chart-2" : "text-destructive"
                    }`}
                  >
                    {selected.isOperational ? "Operational" : "Out of service"}
                  </span>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="w-full rounded-md border py-1.5 text-xs hover:bg-muted"
                >
                  Close
                </button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                Click a station on the map to see details
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
