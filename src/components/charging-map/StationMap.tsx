"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect, useRef } from "react";
import type { ChargingStation } from "@/app/(dashboard)/charging-map/charging-map-client";

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

// Green = operational, grey = out of service
const OPERATIONAL_COLOR = "#16a34a";
const OFFLINE_COLOR = "#6b7280";

function makeIcon(isOperational: boolean) {
  const color = isOperational ? OPERATIONAL_COLOR : OFFLINE_COLOR;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path fill="${color}" stroke="white" stroke-width="1.5"
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

interface StationMapProps {
  stations: ChargingStation[];
  center: { lat: number; lng: number };
  selected: ChargingStation | null;
  onSelect: (s: ChargingStation) => void;
}

export default function StationMap({ stations, center, selected: _selected, onSelect }: StationMapProps) {
  useLeafletIconFix();
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
      {stations.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          icon={makeIcon(s.isOperational)}
          eventHandlers={{ click: () => onSelect(s) }}
        >
          <Popup>
            <div className="text-xs">
              <strong>{s.name}</strong>
              <br />
              {s.maxPowerKw != null ? `${s.maxPowerKw} kW · ` : ""}
              {s.connectorCount} connector{s.connectorCount !== 1 ? "s" : ""}
              {!s.isOperational && (
                <>
                  <br />
                  <span style={{ color: "#dc2626" }}>Out of service</span>
                </>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
