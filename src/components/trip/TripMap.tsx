"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { useEffect, useRef } from "react";

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

function makeDotIcon(color: string, label?: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path fill="${color}" stroke="white" stroke-width="1.5"
      d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"/>
    ${label ? `<text x="12" y="15" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="sans-serif">${label}</text>` : `<circle cx="12" cy="12" r="5" fill="white" fill-opacity="0.9"/>`}
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [24, 36], iconAnchor: [12, 36], popupAnchor: [0, -38] });
}

interface TripStop {
  lat: number;
  lng: number;
  name: string;
  network: string; // networkId value
}

interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
}

interface TripMapProps {
  origin: MapPoint | null;
  destination: MapPoint | null;
  stops: TripStop[];
  polyline: { type: "LineString"; coordinates: [number, number][] } | null;
  className?: string;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map(([lat, lng]) => [lat, lng]));
    map.fitBounds(bounds, { padding: [48, 48] });
  }, [map, points]);
  return null;
}

export default function TripMap({ origin, destination, stops, polyline, className }: TripMapProps) {
  useLeafletIconFix();

  const allPoints: [number, number][] = [
    ...(origin ? [[origin.lat, origin.lng] as [number, number]] : []),
    ...stops.map((s) => [s.lat, s.lng] as [number, number]),
    ...(destination ? [[destination.lat, destination.lng] as [number, number]] : []),
  ];

  const routePositions: [number, number][] = polyline
    ? polyline.coordinates.map(([lng, lat]) => [lat, lng])
    : allPoints;

  return (
    <MapContainer
      center={[48, 12]}
      zoom={5}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
      className={className}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {allPoints.length >= 2 && <FitBounds points={allPoints} />}

      {routePositions.length >= 2 && (
        <Polyline positions={routePositions} color="#2563eb" weight={4} opacity={0.8} />
      )}

      {origin && (
        <Marker position={[origin.lat, origin.lng]} icon={makeDotIcon("#16a34a")}>
          <Popup>{origin.label ?? "Start"}</Popup>
        </Marker>
      )}

      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={makeDotIcon("#dc2626")}>
          <Popup>{destination.label ?? "Destinație"}</Popup>
        </Marker>
      )}

      {stops.map((stop, i) => (
        <Marker key={i} position={[stop.lat, stop.lng]} icon={makeDotIcon("#d97706", String(i + 1))}>
          <Popup>
            <strong>{stop.name}</strong>
            <br />
            {stop.network}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
