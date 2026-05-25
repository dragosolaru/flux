"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import type { ChargingStation } from "@/app/api/charging-stations/route";

export type { ChargingStation };

const StationMap = dynamic(() => import("@/components/charging-map/StationMap"), { ssr: false });

// Default centre: central Europe
const DEFAULT_LAT = 48.5;
const DEFAULT_LNG = 14.0;

interface UserLocation {
  lat: number;
  lng: number;
}

function useUserLocation() {
  const [location, setLocation] = useState<UserLocation>({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
  });

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // Permission denied or unavailable — keep default
      },
    );
  }, []);

  return location;
}

export function ChargingMapClient() {
  const [selected, setSelected] = useState<ChargingStation | null>(null);
  const location = useUserLocation();

  const {
    data: stations = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["charging-stations", location.lat, location.lng],
    queryFn: () =>
      apiFetch<ChargingStation[]>(
        `/api/charging-stations?lat=${location.lat}&lng=${location.lng}`,
      ),
    staleTime: 300_000, // 5 minutes
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
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
                  center={location}
                  selected={selected}
                  onSelect={setSelected}
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
