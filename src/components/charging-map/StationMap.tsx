"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useRef, useState } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Charger } from "@/lib/chargers/types";

// Power-tier fill colours for CircleMarker (Leaflet native renderer — no DivIcon)
const TIER_COLORS: Record<string, string> = {
  ultra:   "#ef4444", // 350+ kW
  fast:    "#f97316", // 150–349 kW
  medium:  "#16a34a", // 50–149 kW
  slow:    "#3b82f6", // <50 kW
  offline: "#6b7280", // offline / unknown
};

function getPowerTier(maxPowerKw: number | null | undefined, likelyOperational: boolean): string {
  if (!likelyOperational) return "offline";
  if (!maxPowerKw) return "slow";
  if (maxPowerKw >= 350) return "ultra";
  if (maxPowerKw >= 150) return "fast";
  if (maxPowerKw >= 50) return "medium";
  return "slow";
}

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

      {/* User location — blue pulsing dot */}
      {userLocation && (
        <CircleMarker
          center={[userLocation.lat, userLocation.lng]}
          radius={8}
          pathOptions={{
            fillColor: "#3b82f6",
            color: "white",
            weight: 2.5,
            fillOpacity: 1,
            opacity: 1,
          }}
        >
          <Popup>
            <div className="text-xs font-medium">{t("locate_me")}</div>
          </Popup>
        </CircleMarker>
      )}

      {/* Station markers — CircleMarker uses Leaflet's own SVG/Canvas renderer,
          bypassing all DivIcon/WebKit issues. */}
      {stations.map((s) => {
        const tier = getPowerTier(s.maxPowerKw, s.confidence >= 0.5);
        const isSelected = selected?.id === s.id;
        const color = isSelected ? "#2563eb" : (TIER_COLORS[tier] ?? "#6b7280");

        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={isSelected ? 12 : 8}
            pathOptions={{
              fillColor: color,
              color: "white",
              weight: isSelected ? 3 : 2,
              fillOpacity: 0.95,
              opacity: 1,
            }}
            eventHandlers={{ click: () => onSelect(s) }}
          />
        );
      })}
    </MapContainer>
  );
}
