"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-fetch";
import type { ChargingStation, NetworkId, PlugType, StationAvailability } from "@/lib/external/charging-networks/types";
import type { NetworkMeta } from "@/lib/external/charging-networks/types";

const StationMap = dynamic(() => import("@/components/charging-map/StationMap"), { ssr: false });

export interface StationWithMeta extends ChargingStation {
  networkMeta: NetworkMeta;
  availability: StationAvailability | null;
}

const NETWORKS: { id: string; label: string }[] = [
  { id: "all",      label: "All networks" },
  { id: "ionity",   label: "Ionity" },
  { id: "tesla-sc", label: "Tesla SC" },
  { id: "enbw",     label: "EnBW" },
  { id: "allego",   label: "Allego" },
  { id: "fastned",  label: "Fastned" },
];

const KW_PRESETS = [
  { label: "Any", value: 0 },
  { label: "≥50 kW", value: 50 },
  { label: "≥150 kW", value: 150 },
  { label: "≥300 kW", value: 300 },
];

export function ChargingMapClient() {
  const [network, setNetwork] = useState("all");
  const [minKw, setMinKw] = useState(0);
  const [selected, setSelected] = useState<StationWithMeta | null>(null);

  const { data: stations = [], isLoading } = useQuery({
    queryKey: ["charging-map", network, minKw],
    queryFn: () => {
      const params = new URLSearchParams();
      if (network !== "all") params.set("network", network);
      if (minKw > 0) params.set("minKw", String(minKw));
      return apiFetch<StationWithMeta[]>(`/api/charging-map?${params}`);
    },
    staleTime: 2 * 60 * 1000,
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Charging Map</h1>
        <p className="text-sm text-muted-foreground">
          {stations.length} stations · mock data
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1">
          {NETWORKS.map((n) => (
            <button
              key={n.id}
              onClick={() => setNetwork(n.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                network === n.id
                  ? "bg-primary text-primary-foreground"
                  : "border hover:bg-muted"
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {KW_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setMinKw(p.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                minKw === p.value
                  ? "bg-primary text-primary-foreground"
                  : "border hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Map */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="h-[500px]">
              {isLoading ? (
                <div className="flex h-full items-center justify-center bg-muted">
                  <div className="text-sm text-muted-foreground">Loading map…</div>
                </div>
              ) : (
                <StationMap
                  stations={stations}
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
                <div
                  className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
                  style={{ background: selected.networkMeta.color }}
                >
                  {selected.networkMeta.displayName}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max power</span>
                  <span className="font-medium">{selected.maxKw} kW</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Available stalls</span>
                  <span className={`font-medium ${
                    (selected.availability?.availableStalls ?? 0) > 0
                      ? "text-chart-2"
                      : "text-destructive"
                  }`}>
                    {selected.availability?.availableStalls ?? "?"} / {selected.totalStalls}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium">
                    {selected.priceEurKwh != null
                      ? `€${selected.priceEurKwh}/kWh`
                      : "Subscription"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plugs</span>
                  <span className="font-medium">{selected.plugTypes.join(", ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-medium text-right">
                    {selected.addressCity}, {selected.addressCountry}
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
