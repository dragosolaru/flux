"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
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
// Minimalist ABRP/AmpWhere-style marker: a clean tier-coloured chip showing
// just the kW number (the most useful at-a-glance fact). Price/operator move
// into the detail sheet on tap so the map stays uncluttered.
// Cached per color+kw+selected so panning doesn't re-allocate icons.
const iconCache = new Map<string, L.DivIcon>();

function stationIcon(
  color: string,
  selected: boolean,
  maxPowerKw: number | null,
): L.DivIcon {
  const kw = maxPowerKw ? Math.round(maxPowerKw) : null;
  const key = `${color}:${selected ? 1 : 0}:${kw ?? "-"}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const ring = selected ? "border:2.5px solid #fff;box-shadow:0 0 0 2px " + color + ",0 2px 6px rgba(0,0,0,.4)" : "border:1.5px solid rgba(255,255,255,.9);box-shadow:0 1px 3px rgba(0,0,0,.35)";

  let html: string;
  let size: [number, number];
  let anchor: [number, number];

  if (kw) {
    const h = selected ? 22 : 19;
    const font = selected ? 12 : 11;
    // The unit is rendered, not implied. A cluster bubble also shows a bare
    // number, so "22" alone read as either 22 kW or 22 stations depending on
    // which pill you happened to be looking at.
    html = `<div style="display:flex;align-items:baseline;gap:1px;justify-content:center;height:${h}px;min-width:${h}px;padding:0 6px;background:${color};color:#fff;font-size:${font}px;font-weight:700;line-height:1;border-radius:9999px;${ring}">${kw}<span style="font-size:${font - 3}px;font-weight:600;opacity:.85">kW</span></div>`;
    size = [h, h];
    anchor = [h / 2, h / 2];
  } else {
    const d = selected ? 16 : 13;
    html = `<div style="width:${d}px;height:${d}px;background:${color};border-radius:9999px;${ring}"></div>`;
    size = [d, d];
    anchor = [d / 2, d / 2];
  }

  const icon = L.divIcon({
    className: "",
    html: `<div style="display:flex;width:max-content">${html}</div>`,
    iconSize: size,
    iconAnchor: anchor,
  });
  iconCache.set(key, icon);
  return icon;
}

// Cluster bubble.
//
// Deliberately NOT tier-coloured: it used to be primary blue, the same blue the
// sub-50 kW tier uses, so a blue pill reading "22" was either a 22 kW station or
// 22 grouped stations with nothing to tell them apart. The dark fill and white
// ring carry that distinction on their own now that station pills render their
// unit — a written-out label was redundant and cluttered the map.
function clusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 32 : count < 100 ? 38 : 46;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.92);color:#fff;font-size:12px;font-weight:700;border-radius:9999px;border:2px solid rgba(255,255,255,.85);box-shadow:0 2px 8px rgba(0,0,0,0.45)">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ---------------------------------------------------------------------------
// Auto-fit: when the first batch of stations loads, fit the map bounds so all
// markers are visible. Disabled once we have the user's location — fitting to
// every station in a ~100 km bbox would zoom out and bury the "you are here"
// dot, which is exactly the disorientation we want to avoid.
// ---------------------------------------------------------------------------
function FitStations({ stations, enabled }: { stations: Charger[]; enabled: boolean }) {
  const map = useMap();
  const prevCount = useRef(0);

  useEffect(() => {
    const prev = prevCount.current;
    prevCount.current = stations.length;
    if (!enabled) return;
    if (prev === 0 && stations.length > 0) {
      const bounds = L.latLngBounds(stations.map((s) => [s.lat, s.lng] as [number, number]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
      }
    }
  }, [stations, map, enabled]);

  return null;
}

// ---------------------------------------------------------------------------
// CenterOnUser: as soon as the user's location resolves, centre on it ONCE at
// a city-level zoom that keeps the "you are here" dot in view. Runs once, so it
// never fights subsequent panning, the locate button, or list selection.
// ---------------------------------------------------------------------------
function CenterOnUser({ userLocation }: { userLocation: { lat: number; lng: number } | null }) {
  const map = useMap();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !userLocation) return;
    map.setView([userLocation.lat, userLocation.lng], 12);
    done.current = true;
  }, [userLocation, map]);

  return null;
}

// ---------------------------------------------------------------------------
// FitCarAndWalker: frame the walk, not the region.
//
// The default view is zoom 10 — tens of kilometres across, which is the right
// scale for browsing chargers and useless for the one question this mode
// answers: which way do I walk. With both points known it fits them with room
// to spare and stops at 17, close enough to read street names; with only the
// car it drops straight to 17 on the car.
//
// Runs once per pair of coordinates, so panning afterwards is never undone —
// but a late geolocation fix (they arrive seconds after the map) does re-fit,
// which is what someone waiting for the blue dot expects.
// ---------------------------------------------------------------------------
function FitCarAndWalker({
  carLocation,
  userLocation,
}: {
  carLocation: { lat: number; lng: number } | null;
  userLocation: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  const lastFit = useRef<string | null>(null);

  useEffect(() => {
    if (!carLocation) return;
    const key = userLocation
      ? `${carLocation.lat},${carLocation.lng}|${userLocation.lat},${userLocation.lng}`
      : `${carLocation.lat},${carLocation.lng}`;
    if (lastFit.current === key) return;
    lastFit.current = key;

    if (userLocation) {
      const bounds = L.latLngBounds([
        [carLocation.lat, carLocation.lng],
        [userLocation.lat, userLocation.lng],
      ]);
      // Asymmetric, because the map is not empty. The find-my-car banner and
      // the mode card cover the top ~160px and the nav pill plus the locate
      // control cover the bottom ~96px; uniform 70px padding put the northern
      // pin at y=70, behind the banner telling you how far away it was.
      map.fitBounds(bounds, {
        paddingTopLeft: [24, 175],
        paddingBottomRight: [24, 96],
        maxZoom: 17,
      });
    } else {
      map.setView([carLocation.lat, carLocation.lng], 17);
    }
  }, [carLocation, userLocation, map]);

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
  /**
   * False when something else owns the viewport — find-my-car frames the car
   * and the walker together, and flying to zoom 11 (~20km) threw that away
   * with no way back, because FitCarAndWalker will not re-fit for coordinates
   * it has already handled.
   */
  recenter?: boolean;
  onLocate: (lat: number, lng: number) => void;
  errorMessage: string;
}

function LocationButton({ onLocate, errorMessage, recenter = true }: LocationButtonProps) {
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
        if (recenter) map.flyTo([lat, lng], 11);
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
  /** The car, when the map was opened to go and find it. */
  carLocation?: { lat: number; lng: number } | null;
  onUserLocate?: (lat: number, lng: number) => void;
  onAreaChange?: (bbox: ViewportBBox) => void;
  isFetching?: boolean;
}

// Car pin. Deliberately unlike the blue user dot and unlike a charger marker:
// when the point of the screen is walking towards it, telling the two dots
// apart at a glance is the whole feature.
function carLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;background:#22c55e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2l.64-2.54a6 6 0 0 0-.4-4.06l-1.1-2.4A2 2 0 0 0 18.32 7H5.68a2 2 0 0 0-1.82 1l-1.1 2.4a6 6 0 0 0-.4 4.06L3 17h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// User-location pin: a blue dot with an optional pulsing ring while loading.
function userLocationIcon(fetching: boolean): L.DivIcon {
  const ring = fetching
    ? `<div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid #3b82f6;animation:flux-user-pulse 1.4s cubic-bezier(0,0,0.2,1) infinite;pointer-events:none"></div>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:18px;height:18px;display:flex;align-items:center;justify-content:center">${ring}<div style="width:14px;height:14px;background:#3b82f6;border:2.5px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.45);position:relative;z-index:1"></div></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function StationMap({
  stations,
  center,
  selected,
  onSelect,
  userLocation,
  carLocation,
  onUserLocate,
  onAreaChange,
  isFetching = false,
}: StationMapProps) {
  const t = useTranslations("chargingMap");

  // Inject keyframes for the user-location pulse ring once per page.
  useEffect(() => {
    const id = "flux-user-pulse";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent =
      "@keyframes flux-user-pulse{0%{transform:scale(.8);opacity:.8}70%,100%{transform:scale(2.2);opacity:0}}";
    document.head.appendChild(s);
  }, []);

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
            icon={stationIcon(color, isSelected, s.maxPowerKw)}
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

      {/* Both of these would fight the walk framing — one centres on the user at
          zoom 12, the other fits every charger in the bbox. */}
      {!carLocation && <CenterOnUser userLocation={userLocation ?? null} />}
      <FitStations stations={stations} enabled={!userLocation && !carLocation} />
      <FitCarAndWalker
        carLocation={carLocation ?? null}
        userLocation={userLocation ?? null}
      />
      {onAreaChange && <MoveWatcher onAreaChange={onAreaChange} />}

      <LocationButton
        onLocate={onUserLocate ?? (() => undefined)}
        errorMessage={t("location_error")}
        recenter={!carLocation}
      />

      {/* Straight line, deliberately dashed: it is a bearing and a distance, not
          a route. Drawing a solid line would promise a footpath we have not
          computed — the "walk there" button hands that to a maps app. */}
      {carLocation && userLocation && (
        <Polyline
          positions={[
            [userLocation.lat, userLocation.lng],
            [carLocation.lat, carLocation.lng],
          ]}
          pathOptions={{ color: "#22c55e", weight: 3, dashArray: "6 8", opacity: 0.9 }}
        />
      )}

      {carLocation && (
        <Marker
          position={[carLocation.lat, carLocation.lng]}
          icon={carLocationIcon()}
          zIndexOffset={1100}
        />
      )}

      {/* User location dot — pulse ring animates while stations are loading */}
      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={userLocationIcon(isFetching)}
          zIndexOffset={1000}
        >
          <Popup>
            <div className="text-xs font-medium">{t("locate_me")}</div>
          </Popup>
        </Marker>
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
