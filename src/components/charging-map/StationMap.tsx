"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useRef, useState } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Charger } from "@/lib/chargers/types";

// Fix Leaflet default icon paths broken by webpack — done once per mount instead
// of on module load to avoid HMR races and SSR side effects.
function useLeafletIconFix() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
    done.current = true;
  }, []);
}

// Green = likely operational (confidence >= 0.5), grey = low confidence.
// Selected marker is drawn larger with a blue border.
const OPERATIONAL_COLOR = "#16a34a";
const OFFLINE_COLOR = "#6b7280";
const SELECTED_COLOR = "#2563eb";

// Icon cache keyed by "<state>-<powerLabel>" to avoid per-marker re-allocation.
// Power label (e.g. "50kW", "250kW") is used as suffix so the cache stays bounded
// relative to the number of distinct rounded power values in the data.
const iconCache = new Map<string, L.DivIcon>();

function powerLabel(powerKw: number | null | undefined): string {
  if (!powerKw) return "?";
  if (powerKw >= 1000) return `${Math.round(powerKw / 1000)}MW`;
  return `${Math.round(powerKw)}kW`;
}

function makeIcon(
  likelyOperational: boolean,
  selected: boolean,
  powerKw: number | null | undefined,
): L.DivIcon {
  const label = powerLabel(powerKw);
  const state = selected ? "s" : likelyOperational ? "o" : "x";
  const key = `${state}-${label}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const color = selected ? SELECTED_COLOR : likelyOperational ? OPERATIONAL_COLOR : OFFLINE_COLOR;
  const fontSize = selected ? 10 : 9;
  const padH = 5;
  const charWidth = fontSize * 0.65;
  const textW = Math.max(20, label.length * charWidth);
  const width = Math.round(textW + padH * 2);
  const height = selected ? 22 : 18;
  const textY = Math.round(height * 0.70);
  const strokeW = selected ? 2 : 1.5;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect x="${strokeW / 2}" y="${strokeW / 2}" rx="4" ry="4" width="${width - strokeW}" height="${height - strokeW}" fill="${color}" stroke="white" stroke-width="${strokeW}"/>
    <text x="${width / 2}" y="${textY}" fill="white" font-size="${fontSize}" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,sans-serif" text-anchor="middle">${label}</text>
  </svg>`;

  const icon = L.divIcon({
    html: svg,
    className: "",
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), height],
    popupAnchor: [0, -height],
  });
  iconCache.set(key, icon);
  return icon;
}

const USER_MARKER_ICON = L.divIcon({
  html: '<div class="w-4 h-4 bg-blue-500 border-2 border-white rounded-full shadow-lg"></div>',
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface CentreProps {
  centre: { lat: number; lng: number };
}

function SetView({ centre }: CentreProps) {
  const map = useMap();
  useEffect(() => {
    map.setView([centre.lat, centre.lng], 11);
  }, [centre.lat, centre.lng, map]);
  return null;
}

interface MoveWatcherProps {
  onAreaChange: (lat: number, lng: number, radiusKm: number) => void;
}

// Refetch stations for the visible area whenever the user pans/zooms.
// Radius = distance from centre to the NE corner, clamped to a sane range.
function MoveWatcher({ onAreaChange }: MoveWatcherProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const map = useMapEvents({
    moveend() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const c = map.getCenter();
        const ne = map.getBounds().getNorthEast();
        const radiusKm = Math.min(100, Math.max(5, map.distance(c, ne) / 1000));
        onAreaChange(c.lat, c.lng, radiusKm);
      }, 500);
    },
  });

  return null;
}

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
        map.flyTo([lat, lng], 13);
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
          className="flex items-center justify-center bg-background/80 backdrop-blur-sm border border-white/10 rounded-lg p-2 shadow-lg hover:bg-background/90 transition-colors"
          style={{ width: "34px", height: "34px" }}
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

interface StationMapProps {
  stations: Charger[];
  center: { lat: number; lng: number };
  selected: Charger | null;
  onSelect: (s: Charger) => void;
  userLocation?: { lat: number; lng: number } | null;
  onUserLocate?: (lat: number, lng: number) => void;
  onAreaChange?: (lat: number, lng: number, radiusKm: number) => void;
}

export default function StationMap({ stations, center, selected, onSelect, userLocation, onUserLocate, onAreaChange }: StationMapProps) {
  useLeafletIconFix();
  const t = useTranslations("chargingMap");

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={11}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <SetView centre={center} />
      {onAreaChange && <MoveWatcher onAreaChange={onAreaChange} />}
      <LocationButton
        onLocate={onUserLocate ?? (() => undefined)}
        errorMessage={t("location_error")}
      />
      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={USER_MARKER_ICON}
        >
          <Popup>
            <div className="text-xs font-medium">{t("locate_me")}</div>
          </Popup>
        </Marker>
      )}
      {stations.map((s) => {
        const likelyOperational = s.confidence >= 0.5;
        const isSelected = selected?.id === s.id;
        return (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={makeIcon(likelyOperational, isSelected, s.maxPowerKw)}
            zIndexOffset={isSelected ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(s) }}
          />
        );
      })}
    </MapContainer>
  );
}
