"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Charger } from "@/lib/chargers/types";

// Power-tier fill colours.
const TIER_COLORS: Record<string, string> = {
  ultra:   "#ef4444", // 350+ kW
  fast:    "#f97316", // 150–349 kW
  medium:  "#16a34a", // 50–149 kW
  slow:    "#3b82f6", // <50 kW
  offline: "#6b7280",
};

function getPowerTier(maxPowerKw: number | null | undefined, availability: Charger["availability"]): string {
  // Only an explicit offline status greys a pin — most OCM rows are "unknown"
  // or "stale", and greying those out would wash the whole map grey.
  if (availability === "offline") return "offline";
  if (!maxPowerKw) return "slow";
  if (maxPowerKw >= 350) return "ultra";
  if (maxPowerKw >= 150) return "fast";
  if (maxPowerKw >= 50) return "medium";
  return "slow";
}

// Plain-CSS DivIcon (no SVG — SVG DivIcons render blank on mobile WebKit).
// A coloured dot plus an AmpWhere-style label pill showing price · power.
// Cached per color+label+selected so panning doesn't re-allocate icons.
const iconCache = new Map<string, L.DivIcon>();

// "1.79 RON · 22 kW" — price only when known, power always when known.
function pinLabel(maxPowerKw: number | null, pricing: Charger["pricing"]): string {
  const parts: string[] = [];
  if (pricing && Number.isFinite(pricing.perKwh)) parts.push(`${pricing.perKwh.toFixed(2)} ${pricing.currency}`);
  if (maxPowerKw) parts.push(`${Math.round(maxPowerKw)} kW`);
  return parts.join(" · ");
}

// First letter of the operator (or ⚡ when unknown) — a lightweight "logo" glyph
// inside the pin, AmpWhere-style, without shipping per-operator logo assets.
function pinGlyph(operator: string | null): string {
  const ch = operator?.trim()?.[0];
  return ch ? ch.toUpperCase() : "⚡";
}

function stationIcon(
  color: string,
  selected: boolean,
  maxPowerKw: number | null,
  pricing: Charger["pricing"],
  operator: string | null,
): L.DivIcon {
  const label = pinLabel(maxPowerKw, pricing);
  const glyph = pinGlyph(operator);
  const key = `${color}:${selected ? 1 : 0}:${label}:${glyph}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const size = selected ? 30 : 26;
  const font = selected ? 14 : 12;
  const dot = `<div style="width:${size}px;height:${size}px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;background:${color};color:#fff;font-size:${font}px;font-weight:700;line-height:1;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.45)">${glyph}</div>`;
  const pill = label
    ? `<span style="background:rgba(17,24,39,.9);color:#fff;font-size:11px;font-weight:600;line-height:1;padding:3px 6px;border-radius:7px;box-shadow:0 1px 4px rgba(0,0,0,.35);white-space:nowrap">${label}</span>`
    : "";

  const icon = L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;gap:4px;width:max-content">${dot}${pill}</div>`,
    // Anchor on the dot's centre so the label floats to the right of the point.
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

// Cluster bubble — primary-blue pill with white count, clean and prominent.
function clusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 32 : count < 100 ? 38 : 46;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:oklch(0.62 0.19 250 / 0.9);color:#fff;font-size:12px;font-weight:600;border-radius:9999px;box-shadow:0 2px 8px rgba(0,0,0,0.4)">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ---------------------------------------------------------------------------
// Auto-fit: when the first batch of stations loads, fit the map bounds so all
// markers are visible. After that the user controls the viewport freely.
// ---------------------------------------------------------------------------
function FitStations({ stations }: { stations: Charger[] }) {
  const map = useMap();
  const prevCount = useRef(0);

  useEffect(() => {
    const prev = prevCount.current;
    prevCount.current = stations.length;
    if (prev === 0 && stations.length > 0) {
      const bounds = L.latLngBounds(stations.map((s) => [s.lat, s.lng] as [number, number]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
      }
    }
  }, [stations, map]);

  return null;
}

// ---------------------------------------------------------------------------
// SetView: pan to the user's resolved location ONCE. Does not override user
// zoom or any subsequent map interactions.
// ---------------------------------------------------------------------------
interface CentreProps {
  centre: { lat: number; lng: number };
}

function SetView({ centre }: CentreProps) {
  const map = useMap();
  const centred = useRef(false);

  useEffect(() => {
    if (centred.current) return;
    // Pan without changing zoom so FitStations can choose the right zoom.
    map.panTo([centre.lat, centre.lng]);
    centred.current = true;
  }, [centre.lat, centre.lng, map]);

  return null;
}

// ---------------------------------------------------------------------------
// MoveWatcher: refetch when the user pans or zooms. Passes the actual map
// viewport bounds so the query always matches exactly what is visible.
// Both moveend and zoomend are handled — mobile pinch zoom fires zoomend
// but may not fire moveend when the centre stays fixed.
// ---------------------------------------------------------------------------
export interface ViewportBBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

interface MoveWatcherProps {
  onAreaChange: (bbox: ViewportBBox) => void;
}

function MoveWatcher({ onAreaChange }: MoveWatcherProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<ViewportBBox | null>(null);

  function schedule(m: L.Map) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const b = m.getBounds();
      const next: ViewportBBox = {
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast(),
      };
      // Skip no-op / micro moves (map settle, resize, sheet open) so we don't
      // churn the query and rebuild markers — that caused pins to flicker.
      const p = last.current;
      const eps = 1e-4; // ~11 m
      if (
        p &&
        Math.abs(p.minLat - next.minLat) < eps &&
        Math.abs(p.minLng - next.minLng) < eps &&
        Math.abs(p.maxLat - next.maxLat) < eps &&
        Math.abs(p.maxLng - next.maxLng) < eps
      ) {
        return;
      }
      last.current = next;
      onAreaChange(next);
    }, 500);
  }

  const map = useMapEvents({
    moveend() { schedule(map); },
    zoomend() { schedule(map); },
  });

  return null;
}

// ---------------------------------------------------------------------------
// LocationButton
// ---------------------------------------------------------------------------
interface LocationButtonProps {
  onLocate: (lat: number, lng: number) => void;
  errorMessage: string;
}

function LocationButton({ onLocate, errorMessage }: LocationButtonProps) {
  const map = useMap();
  const t = useTranslations("chargingMap");
  const [locating, setLocating] = useState(false);

  function handleClick() {
    if (!navigator.geolocation) {
      toast.error(errorMessage);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Zoom 11 ≈ city view (~20 km across) — wide enough to show nearby stations.
        map.flyTo([lat, lng], 11);
        onLocate(lat, lng);
        setLocating(false);
      },
      () => {
        toast.error(errorMessage);
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }

  return (
    <div className="leaflet-bottom leaflet-right" style={{ marginBottom: "80px" }}>
      <div className="leaflet-control">
        <button
          onClick={handleClick}
          title={t("locate_me")}
          className="flex items-center justify-center rounded-xl bg-card/90 border border-border p-2 shadow-lg hover:bg-card transition-colors backdrop-blur-md"
          style={{ width: "44px", height: "44px" }}
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin text-foreground" />
          ) : (
            <LocateFixed className="size-4 text-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StationMap
// ---------------------------------------------------------------------------
interface StationMapProps {
  stations: Charger[];
  center: { lat: number; lng: number };
  selected: Charger | null;
  onSelect: (s: Charger) => void;
  userLocation?: { lat: number; lng: number } | null;
  onUserLocate?: (lat: number, lng: number) => void;
  onAreaChange?: (bbox: ViewportBBox) => void;
}

export default function StationMap({
  stations,
  center,
  selected,
  onSelect,
  userLocation,
  onUserLocate,
  onAreaChange,
}: StationMapProps) {
  const t = useTranslations("chargingMap");

  // Memoize markers so the cluster layer only rebuilds when the stations or the
  // selection actually change — not on every parent re-render (pan/fetch/badge),
  // which made pins flicker (appear/disappear) as the cluster tore down + re-added.
  const selectedId = selected?.id ?? null;
  const markers = useMemo(
    () =>
      stations.map((s) => {
        const tier = getPowerTier(s.maxPowerKw, s.availability);
        const isSelected = selectedId === s.id;
        const color = isSelected ? "#2563eb" : (TIER_COLORS[tier] ?? "#6b7280");
        return (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={stationIcon(color, isSelected, s.maxPowerKw, s.pricing, s.operator)}
            eventHandlers={{ click: () => onSelect(s) }}
          />
        );
      }),
    [stations, selectedId, onSelect],
  );

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={10}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />

      <SetView centre={center} />
      <FitStations stations={stations} />
      {onAreaChange && <MoveWatcher onAreaChange={onAreaChange} />}

      <LocationButton
        onLocate={onUserLocate ?? (() => undefined)}
        errorMessage={t("location_error")}
      />

      {/* User location dot */}
      {userLocation && (
        <CircleMarker
          center={[userLocation.lat, userLocation.lng]}
          radius={8}
          pathOptions={{ fillColor: "#3b82f6", color: "white", weight: 2.5, fillOpacity: 1, opacity: 1 }}
        >
          <Popup>
            <div className="text-xs font-medium">{t("locate_me")}</div>
          </Popup>
        </CircleMarker>
      )}

      {/* Station markers — clustered so dense/overlapping sites collapse into a
          single counted bubble that splits apart as you zoom in. */}
      <MarkerClusterGroup
        iconCreateFunction={clusterIcon}
        showCoverageOnHover={false}
        maxClusterRadius={50}
        spiderfyOnMaxZoom
      >
        {markers}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
