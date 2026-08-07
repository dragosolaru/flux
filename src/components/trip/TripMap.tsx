"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import { useEffect, useMemo, useRef } from "react";
import type { ChargingStop } from "@/lib/external/routing/types";
import type { Charger } from "@/lib/chargers/types";

// How far off the driven line a charger can sit and still count as "on the way".
// Wide enough to include a station one motorway exit away, narrow enough that a
// long route does not drag in a whole region.
const CORRIDOR_KM = 5;

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
  /** Long-press (or right-click) on the map — "fetch chargers around here". */
  onAreaRequest?: (lat: number, lng: number) => void;
  /** Centre of the area currently being fetched, so it can be shown loading. */
  loadingArea?: { lat: number; lng: number } | null;
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

/**
 * Turns a long-press into an area request. Leaflet raises `contextmenu` for
 * both a touch long-press and a desktop right-click, so one handler covers
 * both without a custom gesture recogniser.
 */
function AreaRequestHandler({ onRequest }: { onRequest: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => {
      // Without this a desktop right-click opens the browser's own context menu
      // on top of the request we just started.
      L.DomEvent.preventDefault(e.originalEvent);
      // A selection may already have started before the CSS took effect (or in
      // a browser that ignores it); drop it so the press does not leave text
      // highlighted across the screen.
      window.getSelection()?.removeAllRanges();
      onRequest(e.latlng.lat, e.latlng.lng);
    };
    map.on("contextmenu", handler);
    return () => {
      map.off("contextmenu", handler);
    };
  }, [map, onRequest]);
  return null;
}

export default function TripMap({ origin, destination, stops, polyline, className, onStationSelect, nearbyStations, routes, onRouteSelect, onAreaRequest, loadingArea }: TripMapProps) {
  useLeafletIconFix();

  // Stations shown alongside the planned stops: the ones actually on the way.
  //
  // The query behind `nearbyStations` fetches by the route's bounding box, which
  // on a long trip is an enormous rectangle — most of it nowhere near the road.
  // Filtering by real distance to the driven line is what makes this "chargers
  // along my route" rather than "chargers somewhere in this region".
  const contextStations = useMemo(() => {
    const list = nearbyStations ?? [];
    if (list.length === 0) return list;

    // Sample the polyline instead of testing every vertex: a full-geometry line
    // can carry thousands of points, and 1 km of sampling is far finer than the
    // corridor width being tested for.
    const line = polyline?.coordinates ?? [];
    const sampled: [number, number][] = [];
    if (line.length > 0) {
      const step = Math.max(1, Math.floor(line.length / 400));
      for (let i = 0; i < line.length; i += step) {
        const [lng, lat] = line[i];
        sampled.push([lat, lng]);
      }
    }

    const nearRoute = (c: { lat: number; lng: number }) => {
      if (sampled.length === 0) return true; // no line yet — show everything
      // Degrees, not metres: cheap, and the latitude correction keeps the
      // corridor from widening as the route runs north.
      const latTol = CORRIDOR_KM / 111;
      const cosLat = Math.cos((c.lat * Math.PI) / 180) || 1;
      const lngTol = CORRIDOR_KM / (111 * cosLat);
      return sampled.some(
        ([lat, lng]) => Math.abs(lat - c.lat) < latTol && Math.abs(lng - c.lng) < lngTol,
      );
    };

    // Drop context dots that coincide with a numbered planned stop (~80 m) so
    // the prominent stop pins aren't doubled.
    return list.filter(
      (c) =>
        nearRoute(c) &&
        !stops.some(
          (s) => Math.abs(s.lat - c.lat) < 0.0007 && Math.abs(s.lng - c.lng) < 0.0007,
        ),
    );
  }, [nearbyStations, stops, polyline]);

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
      scrollWheelZoom
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />

      {allPoints.length >= 2 && <FitBounds points={allPoints} />}

      {onAreaRequest && <AreaRequestHandler onRequest={onAreaRequest} />}

      {/* Where the user asked for chargers, while that area is being fetched.
          Anchored to the map rather than shown as a toast so it is obvious
          WHICH area is loading when several taps happen in a row. */}
      {loadingArea && (
        <CircleMarker
          center={[loadingArea.lat, loadingArea.lng]}
          radius={26}
          className="animate-pulse"
          pathOptions={{
            fillColor: "#38bdf8",
            fillOpacity: 0.15,
            color: "#38bdf8",
            weight: 2,
            opacity: 0.8,
          }}
        />
      )}

      {/* Context layer: every charger near the corridor as a small dot, drawn
          before the route + stops so those stay prominent (airy, uncluttered). */}
      {contextStations.map((c) => (
        <CircleMarker
          key={c.id}
          center={[c.lat, c.lng]}
          // 3.5 px was effectively invisible on a phone. Big enough to see and
          // to hit, still clearly subordinate to the numbered stop pins.
          radius={6}
          pathOptions={{
            fillColor: tierColor(c.maxPowerKw, c.availability),
            color: "#ffffff",
            weight: 1.5,
            fillOpacity: 0.9,
            opacity: 0.9,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={1}>
            <span className="text-xs font-medium">
              {c.name ?? "—"}
              {c.maxPowerKw ? ` · ${Math.round(c.maxPowerKw)} kW` : ""}
            </span>
          </Tooltip>
        </CircleMarker>
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
