"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { StationWithMeta } from "@/app/(dashboard)/charging-map/charging-map-client";

// Fix Leaflet default icon paths broken by webpack
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function makeIcon(color: string, available: boolean) {
  const opacity = available ? 1 : 0.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path fill="${color}" fill-opacity="${opacity}" stroke="white" stroke-width="1.5"
      d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"/>
    <circle cx="12" cy="12" r="5" fill="white" fill-opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

function FitBounds({ stations }: { stations: StationWithMeta[] }) {
  const map = useMap();
  useEffect(() => {
    if (stations.length === 0) return;
    const bounds = L.latLngBounds(stations.map((s) => [s.lat, s.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
  }, [stations.length, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

interface StationMapProps {
  stations: StationWithMeta[];
  selected: StationWithMeta | null;
  onSelect: (s: StationWithMeta) => void;
}

export default function StationMap({ stations, selected, onSelect }: StationMapProps) {
  return (
    <MapContainer
      center={[50.0, 12.0]}
      zoom={5}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds stations={stations} />
      {stations.map((s) => {
        const available = (s.availability?.availableStalls ?? 0) > 0;
        return (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={makeIcon(s.networkMeta.color, available)}
            eventHandlers={{ click: () => onSelect(s) }}
          >
            <Popup>
              <div className="text-xs">
                <strong>{s.name}</strong><br />
                {s.maxKw} kW · {s.availability?.availableStalls ?? "?"}/{s.totalStalls} stalls
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
