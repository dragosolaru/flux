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

// Power-tier color coding for station pins. The teardrop SVG <path> is the
// proven Leaflet DivIcon approach — both the inline-styled <div> and the
// <rect>+<text> SVG variants rendered invisibly on mobile WebKit.
const TIER_ULTRA_COLOR = "#ef4444"; // 350+ kW (red)
const TIER_FAST_COLOR = "#f97316"; // 150–349 kW (orange)
const TIER_MEDIUM_COLOR = "#16a34a"; // 50–149 kW (green)
const TIER_SLOW_COLOR = "#3b82f6"; // <50 kW (blue)
const TIER_OFFLINE_COLOR = "#6b7280"; // offline / unknown (gray)
const SELECTED_COLOR = "#2563eb"; // selected (blue)

type PowerTier = "ultra" | "fast" | "medium" | "slow" | "offline";

function getPowerTier(maxPowerKw: number | null | undefined, likelyOperational: boolean): PowerTier {
  if (!likelyOperational) return "offline";
  if (!maxPowerKw) return "slow";
  if (maxPowerKw >= 350) return "ultra";
  if (maxPowerKw >= 150) return "fast";
  if (maxPowerKw >= 50) return "medium";
  return "slow";
}

function tierColor(tier: PowerTier): string {
  switch (tier) {
    case "ultra":
      return TIER_ULTRA_COLOR;
    case "fast":
      return TIER_FAST_COLOR;
    case "medium":
      return TIER_MEDIUM_COLOR;
    case "slow":
      return TIER_SLOW_COLOR;
    case "offline":
      return TIER_OFFLINE_COLOR;
  }
}

// Icon cache keyed by "<state>-<tier>" — bounded to at most 10 distinct icons.
const iconCache = new Map<string, L.DivIcon>();

function makeIcon(selected: boolean, tier: PowerTier): L.DivIcon {
  const key = selected ? `s-${tier}` : tier;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const color = selected ? SELECTED_COLOR : tierColor(tier);
  const scale = selected ? 1.3 : 1;
  const w = Math.round(20 * scale);
  const h = Math.round(30 * scale);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 30" width="${w}" height="${h}">
    <path fill="${color}" stroke="white" stroke-width="1.5"
      d="M10 0C4.477 0 0 4.477 0 10c0 7.5 10 20 10 20S20 17.5 20 10C20 4.477 15.523 0 10 0z"/>
    <circle cx="10" cy="10" r="4" fill="white" fill-opacity="0.9"/>
  </svg>`;

  const icon = L.divIcon({
    html: svg,
    className: "",
    iconSize: [w, h],
    iconAnchor: [Math.round(w / 2), h],
    popupAnchor: [0, -h],
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
        const tier = getPowerTier(s.maxPowerKw, s.confidence >= 0.5);
        const isSelected = selected?.id === s.id;
        return (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={makeIcon(isSelected, tier)}
            zIndexOffset={isSelected ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(s) }}
          />
        );
      })}
    </MapContainer>
  );
}
