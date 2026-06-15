"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, CircleMarker, Polyline, useMap } from "react-leaflet";
import { useEffect, useMemo, useRef } from "react";
import type { ChargingStop } from "@/lib/external/routing/types";
import type { Charger } from "@/lib/chargers/types";

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

export interface TripStop {
  lat: number;
  lng: number;
  name: string;
  network: string;
  fullStop?: ChargingStop;
}

interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface RouteLine {
  index: number;
  coordinates: [number, number][]; // [lng, lat]
  active: boolean;
}

interface TripMapProps {
  origin: MapPoint | null;
  destination: MapPoint | null;
  stops: TripStop[];
  polyline: { type: "LineString"; coordinates: [number, number][] } | null;
  className?: string;
  onStationSelect?: (stop: ChargingStop | null) => void;
  // All chargers near the corridor (from the station platform) shown as subtle
  // context dots so the planner map reflects real coverage like the main map.
  nearbyStations?: Charger[];
  // All variant roads. Inactive ones are drawn subtly and are clickable to
  // select; the active one is drawn prominently on top.
  routes?: RouteLine[];
  onRouteSelect?: (index: number) => void;
}

// Color a context dot by power tier (offline greyed), matching the main map.
function tierColor(maxKw: number | null, availability: Charger["availability"]): string {
  if (availability === "offline") return "#9ca3af";
  if (!maxKw) return "#3b82f6";
  if (maxKw >= 350) return "#ef4444";
  if (maxKw >= 150) return "#f97316";
  if (maxKw >= 50) return "#16a34a";
  return "#3b82f6";
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

export default function TripMap({ origin, destination, stops, polyline, className, onStationSelect, nearbyStations, routes, onRouteSelect }: TripMapProps) {
  useLeafletIconFix();

  // Drop context dots that coincide with a numbered planned stop (~80 m) so the
  // prominent stop pins aren't doubled. Memoized so the layer is stable.
  const contextStations = useMemo(() => {
    const list = nearbyStations ?? [];
    if (stops.length === 0) return list;
    return list.filter(
      (c) =>
        !stops.some(
          (s) => Math.abs(s.lat - c.lat) < 0.0007 && Math.abs(s.lng - c.lng) < 0.0007,
        ),
    );
  }, [nearbyStations, stops]);

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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />

      {allPoints.length >= 2 && <FitBounds points={allPoints} />}

      {/* Context layer: every charger near the corridor as a small dot, drawn
          before the route + stops so those stay prominent (airy, uncluttered). */}
      {contextStations.map((c) => (
        <CircleMarker
          key={c.id}
          center={[c.lat, c.lng]}
          radius={3.5}
          pathOptions={{
            fillColor: tierColor(c.maxPowerKw, c.availability),
            color: "#ffffff",
            weight: 1,
            fillOpacity: 0.85,
            opacity: 0.6,
          }}
        />
      ))}

      {/* Alternative roads: inactive drawn subtly + clickable, active on top. */}
      {routes && routes.length > 0 ? (
        <>
          {routes
            .filter((r) => !r.active)
            .map((r) => {
              const positions = r.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
              if (positions.length < 2) return null;
              return (
                <Polyline
                  key={`alt-${r.index}`}
                  positions={positions}
                  // weight:8 gives a finger-sized tap target; opacity > 0 keeps
                  // SVG pointer-events:visibleStroke active (opacity:0 = untappable).
                  pathOptions={{ color: "#94a3b8", weight: 8, opacity: 0.28, dashArray: "6 10" }}
                  eventHandlers={onRouteSelect ? { click: () => onRouteSelect(r.index) } : undefined}
                />
              );
            })}
          {routes
            .filter((r) => r.active)
            .map((r) => {
              const positions = r.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
              if (positions.length < 2) return null;
              return (
                <Polyline
                  key={`active-${r.index}`}
                  positions={positions}
                  pathOptions={{ color: "#7c3aed", weight: 5, opacity: 0.95 }}
                />
              );
            })}
        </>
      ) : (
        routePositions.length >= 2 && (
          <Polyline positions={routePositions} color="#7c3aed" weight={4} opacity={0.9} />
        )
      )}

      {origin && (
        <Marker position={[origin.lat, origin.lng]} icon={makeDotIcon("#16a34a")} />
      )}

      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={makeDotIcon("#dc2626")} />
      )}

      {stops.map((stop, i) => (
        <Marker
          key={i}
          position={[stop.lat, stop.lng]}
          icon={makeDotIcon("#d97706", String(i + 1))}
          eventHandlers={
            onStationSelect && stop.fullStop
              ? { click: () => onStationSelect(stop.fullStop!) }
              : undefined
          }
        />
      ))}
    </MapContainer>
  );
}
