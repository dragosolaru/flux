"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Route,
  Loader2,
  AlertCircle,
  Navigation,
  AlertTriangle,
  ChevronUp,
  ChevronRight,
  Zap,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { GeocodingSearch, type GeoPoint } from "@/components/trip/GeocodingSearch";
import { StopCard, needsPreconditioning, isSuperchargerNetwork } from "@/components/trip/StopCard";
import { CostSummary } from "@/components/trip/CostSummary";
import { SegmentedControl, DesktopSidebar, LIST_ROW, SECTION_TITLE } from "@/components/map/map-ui";
import { Compass } from "lucide-react";
import { StationDetailSheet } from "@/components/trip/StationDetailSheet";
import { ChargerDetailSheet } from "@/components/charging-map/ChargerDetailSheet";
import { apiFetch } from "@/lib/api-fetch";
import { useVehicles } from "@/hooks/useVehicles";
import { useCurrency } from "@/hooks/useCurrency";
import type { TripPlan, TripVariant, ChargingStop } from "@/lib/external/routing/types";
import type { Charger, ConnectorType } from "@/lib/chargers/types";
import type { ViewportBBox } from "@/components/charging-map/StationMap";
import type { RouteLine } from "@/components/trip/TripMap";

const TripMap = dynamic(() => import("@/components/trip/TripMap"), { ssr: false });
const StationMap = dynamic(() => import("@/components/charging-map/StationMap"), { ssr: false });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MapMode = "explore" | "plan";

interface TripResponse {
  plan: TripPlan;
  variants: TripVariant[];
  vehicle: { id: string; displayName: string; brand: string; model: string | null } | null;
  deratingPct: number;
}

const POWER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "filter_all" },
  { value: 50, label: "50+ kW" },
  { value: 150, label: "150+ kW" },
  { value: 350, label: "350 kW" },
];

const CONNECTOR_OPTIONS: { value: ConnectorType | "all"; label: string }[] = [
  { value: "all", label: "filter_all" },
  { value: "ccs2", label: "CCS" },
  { value: "type2", label: "Type 2" },
  { value: "chademo", label: "CHAdeMO" },
  { value: "tesla", label: "Tesla" },
];

// ---------------------------------------------------------------------------
// Bottom sheet geometry
// ---------------------------------------------------------------------------

// Collapsed height is measured from the rendered peek (grabber + summary line);
// this fallback only covers SSR / first paint before the ResizeObserver fires.
const PEEK_FALLBACK = 88;

// iOS Safari's window.innerHeight counts the area behind the URL/toolbar, so we
// prefer visualViewport.height (the truly visible region) and fall back to
// innerHeight only when it is unavailable.
function visibleViewportHeight(): number {
  if (typeof window === "undefined") return 800;
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

// ---------------------------------------------------------------------------
// Trip helper
// ---------------------------------------------------------------------------

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const res = await apiFetch<{ name: string | null }>(
    `/api/geocode?reverse=1&lat=${lat}&lon=${lon}`
  );
  if (!res.name) throw new Error("reverse geocode failed");
  return res.name;
}

interface VariantLabel {
  key: "fastest" | "fewest_stops" | "cheapest";
  color: "accent" | "green" | "yellow";
}

function getVariantLabel(variant: TripVariant, allVariants: TripVariant[]): VariantLabel | null {
  if (allVariants.length < 2) return null;
  const allMinutes = allVariants.map((v) => v.plan.totalMinutes);
  const allStops = allVariants.map((v) => v.plan.stops.length);
  const allCosts = allVariants.map((v) => v.plan.tripEnergyCostEur);
  const winsUniquely = (arr: number[], val: number) => {
    const min = Math.min(...arr);
    return val === min && arr.filter((x) => x === min).length < arr.length;
  };
  if (winsUniquely(allMinutes, variant.plan.totalMinutes)) return { key: "fastest", color: "accent" };
  if (winsUniquely(allStops, variant.plan.stops.length)) return { key: "fewest_stops", color: "green" };
  if (winsUniquely(allCosts, variant.plan.tripEnergyCostEur)) return { key: "cheapest", color: "yellow" };
  return null;
}

// ---------------------------------------------------------------------------
// Explore-mode station state
// ---------------------------------------------------------------------------

// Central Europe — neutral default before geolocation resolves.
// The map requests geolocation on mount and updates this immediately.
const DEFAULT_LAT = 48.0;
const DEFAULT_LNG = 14.0;
const DEFAULT_BBOX: ViewportBBox = {
  minLat: DEFAULT_LAT - 5,
  minLng: DEFAULT_LNG - 8,
  maxLat: DEFAULT_LAT + 5,
  maxLng: DEFAULT_LNG + 8,
};

function toBBox(lat: number, lng: number): ViewportBBox {
  return { minLat: lat - 0.5, minLng: lng - 0.7, maxLat: lat + 0.5, maxLng: lng + 0.7 };
}

// ---------------------------------------------------------------------------
// MapClient
// ---------------------------------------------------------------------------

export function MapClient() {
  const tMap = useTranslations("map");
  const tTrip = useTranslations("trip");
  const tCharging = useTranslations("chargingMap");
  const { fromEUR } = useCurrency();

  const searchParams = useSearchParams();
  const initialMode: MapMode = searchParams.get("mode") === "plan" ? "plan" : "explore";
  const [mode, setMode] = useState<MapMode>(initialMode);

  // ---- 3-state bottom sheet (height-driven) ----
  // The sheet is a flex column whose *height* is the single source of truth:
  // collapsed hugs the measured peek, mid/full are fractions of the visible
  // viewport. The scroll area is `flex-1`, so content can never leave a dead
  // gap — the panel is always exactly as tall as its current snap.
  type SheetState = "collapsed" | "mid" | "full";
  const [sheetState, setSheetState] = useState<SheetState>(
    initialMode === "plan" ? "mid" : "collapsed",
  );

  // Visible viewport height (tracks iOS toolbar show/hide via visualViewport).
  const [vh, setVh] = useState(() => visibleViewportHeight());
  const midH = Math.round(vh * 0.5);
  const fullH = Math.round(vh * 0.9);

  // Collapsed height = the real rendered peek, measured from the DOM so the
  // panel hugs it exactly (no hand-tuned constant, no dead space).
  const peekRef = useRef<HTMLDivElement>(null);
  const [collapsedH, setCollapsedH] = useState(PEEK_FALLBACK);

  const heightFor = useCallback(
    (s: SheetState) => (s === "collapsed" ? collapsedH : s === "mid" ? midH : fullH),
    [collapsedH, midH, fullH],
  );

  // Live height while dragging (null = settled on a snap).
  const [dragH, setDragH] = useState<number | null>(null);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  function applySheetState(state: SheetState) {
    setSheetState(state);
  }

  function cycleSheetState() {
    applySheetState(
      sheetState === "collapsed" ? "mid" : sheetState === "mid" ? "full" : "collapsed",
    );
  }

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    dragStartY.current = e.clientY;
    dragStartH.current = heightFor(sheetState);
    setDragH(dragStartH.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!(e.buttons & 1)) return;
    // Drag up (smaller clientY) grows the sheet.
    const next = dragStartH.current + (dragStartY.current - e.clientY);
    setDragH(Math.max(collapsedH, Math.min(next, fullH)));
  }

  function onDragEnd() {
    const h = dragH ?? heightFor(sheetState);
    const snaps: [SheetState, number][] = [
      ["collapsed", collapsedH],
      ["mid", midH],
      ["full", fullH],
    ];
    const nearest = snaps.reduce((best, cur) =>
      Math.abs(cur[1] - h) < Math.abs(best[1] - h) ? cur : best,
    );
    setSheetState(nearest[0]);
    setDragH(null);
  }

  // ---- Explore mode state ----
  const [exploreCenter, setExploreCenter] = useState({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [exploreUserLoc, setExploreUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [exploreArea, setExploreArea] = useState<ViewportBBox>(DEFAULT_BBOX);
  const [minKw, setMinKw] = useState(0);
  const [connector, setConnector] = useState<ConnectorType | "all">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStation, setSelectedStation] = useState<Charger | null>(null);
  const [exploreResetKey, setExploreResetKey] = useState(0);
  const hasActiveFilter = minKw > 0 || connector !== "all";

  const handleExploreLocate = useCallback((lat: number, lng: number) => {
    setExploreCenter({ lat, lng });
    setExploreUserLoc({ lat, lng });
    setExploreArea(toBBox(lat, lng));
    setExploreResetKey((k) => k + 1);
  }, []);

  const handleExploreAreaChange = useCallback((bbox: ViewportBBox) => {
    setExploreArea(bbox);
  }, []);

  // Silent auto-locate on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleExploreLocate(pos.coords.latitude, pos.coords.longitude);
      },
      () => undefined,
      { timeout: 3000 },
    );
  // handleExploreLocate is stable (useCallback)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: stations = [], isFetching } = useQuery({
    queryKey: [
      "chargers-bbox-map",
      exploreResetKey,
      exploreArea.minLat.toFixed(2),
      exploreArea.minLng.toFixed(2),
      exploreArea.maxLat.toFixed(2),
      exploreArea.maxLng.toFixed(2),
      minKw,
      connector,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        bbox: `${exploreArea.minLng},${exploreArea.minLat},${exploreArea.maxLng},${exploreArea.maxLat}`,
        limit: "2000",
      });
      if (minKw > 0) params.set("minKw", String(minKw));
      if (connector !== "all") params.set("connector", connector);
      return apiFetch<Charger[]>(`/api/chargers?${params}`);
    },
    staleTime: 300_000,
    placeholderData: keepPreviousData,
    enabled: mode === "explore",
  });

  // ---- Plan mode state ----
  const { data: vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState("");
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [startSoc, setStartSoc] = useState(80);
  const [arrivalSoc, setArrivalSoc] = useState(10);
  const [plan, setPlan] = useState<TripResponse | null>(null);
  const [activeVariant, setActiveVariant] = useState(0);
  const [loading, setLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharedRoute, setSharedRoute] = useState(false);
  const [selectedStop, setSelectedStop] = useState<ChargingStop | null>(null);

  const canPlan = origin !== null && destination !== null;

  // Geocode bias: searches rank results near the user first ("Florești" →
  // the one nearby, not the wrong county). Destination favors the origin so
  // results lean toward the travel direction.
  const originBias = exploreUserLoc ?? exploreCenter;
  const destinationBias = origin ? { lat: origin.lat, lng: origin.lng } : originBias;

  function handleLocateOrigin() {
    if (!navigator.geolocation) {
      toast.error(tTrip("use_my_location"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const name = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          setOrigin({ name, lat: pos.coords.latitude, lng: pos.coords.longitude });
        } catch {
          toast.error(tTrip("use_my_location"));
        } finally {
          setLocating(false);
        }
      },
      () => {
        toast.error(tTrip("use_my_location"));
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }

  async function handlePlan() {
    if (!canPlan) return;
    setLoading(true);
    setPlanError(null);
    try {
      const result = await apiFetch<TripResponse>("/api/trip-plan", {
        method: "POST",
        body: JSON.stringify({
          ...(vehicleId ? { vehicleId } : {}),
          origin: { lat: origin.lat, lng: origin.lng, label: origin.name },
          startSoc,
          arrivalSocPct: arrivalSoc,
          destination: { lat: destination.lat, lng: destination.lng, label: destination.name },
        }),
      });
      setPlan(result);
      setActiveVariant(0);
      setSharedRoute(false);
      // Collapse to summary peek so the route is visible on the map —
      // details stay one drag away (Google Maps pattern).
      applySheetState("collapsed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const isNetworkError = !navigator.onLine || msg === "Failed to fetch";
      setPlanError(isNetworkError ? tTrip("network_error") : msg || tTrip("infeasible_hint"));
    } finally {
      setLoading(false);
    }
  }

  const variants = useMemo(() => plan?.variants ?? [], [plan?.variants]);
  const activePlan = variants[activeVariant]?.plan ?? plan?.plan ?? null;

  // One line per unique physical road (deduped by roadIndex). The active road
  // is whichever the selected variant uses. Returns [] for a single road so
  // TripMap falls back to the plain active-polyline render.
  const activeRoadIndex = variants[activeVariant]?.roadIndex ?? null;
  const routeLines = useMemo<RouteLine[]>(() => {
    const byRoad = new Map<number, TripVariant>();
    for (const v of variants) {
      if (!v.plan.polyline) continue;
      if (!byRoad.has(v.roadIndex)) byRoad.set(v.roadIndex, v);
    }
    if (byRoad.size < 2) return [];
    return [...byRoad.values()].map((v) => ({
      index: v.roadIndex,
      coordinates: v.plan.polyline!.coordinates,
      active: v.roadIndex === activeRoadIndex,
    }));
  }, [variants, activeRoadIndex]);

  function handleRouteSelect(roadIndex: number) {
    const idx = variants.findIndex((v) => v.roadIndex === roadIndex);
    if (idx >= 0) setActiveVariant(idx);
  }

  const teslaVehicle = plan?.vehicle?.brand === "tesla" ? plan.vehicle : null;
  const canShare = teslaVehicle !== null && activePlan !== null && activePlan.feasible !== false;

  async function handleShareToTesla() {
    if (!teslaVehicle || !activePlan || !destination) return;
    setSharing(true);
    try {
      const firstStop = activePlan.stops[0] ?? null;
      const willPrecondition =
        firstStop !== null &&
        needsPreconditioning(firstStop.station.maxKw) &&
        !isSuperchargerNetwork(firstStop.station.networkId);

      const navCmd = apiFetch(`/api/vehicles/${teslaVehicle.id}/commands`, {
        method: "POST",
        body: JSON.stringify({
          command: "share_navigation",
          args: {
            stops: activePlan.stops.map((s) => ({
              lat: s.station.lat,
              lng: s.station.lng,
              name: s.station.name,
            })),
            destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
          },
        }),
      });
      const precondCmd = willPrecondition
        ? apiFetch(`/api/vehicles/${teslaVehicle.id}/commands`, {
            method: "POST",
            body: JSON.stringify({ command: "precondition_max", args: { on: true } }),
          })
        : Promise.resolve();

      await Promise.all([navCmd, precondCmd]);
      setSharedRoute(true);
      toast.success(willPrecondition ? tTrip("share_success_preconditioned") : tTrip("share_success"));
    } catch {
      toast.error(tTrip("share_error"));
    } finally {
      setSharing(false);
    }
  }

  const tripStops =
    activePlan?.stops.map((s) => ({
      lat: s.station.lat,
      lng: s.station.lng,
      name: s.station.name,
      network: s.station.networkId,
      fullStop: s,
    })) ?? [];

  const originShort = origin?.name.split(",")[0] ?? "";
  const destinationShort = destination?.name.split(",")[0] ?? "";

  // Track the visible viewport so mid/full stay correct when the iOS toolbar
  // shows/hides or on rotation.
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setVh(visibleViewportHeight());
    update();
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // Measure the collapsed peek so the panel hugs it exactly. Only measure while
  // collapsed — when expanded the peek also holds the mode tabs, which we don't
  // want baked into the collapsed height.
  useEffect(() => {
    if (sheetState !== "collapsed") return;
    const el = peekRef.current;
    if (!el) return;
    const measure = () => setCollapsedH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, plan, sheetState]);

  // ---- Mode switch ----
  function switchMode(next: MapMode) {
    setMode(next);
    if (next === "plan") {
      applySheetState(plan ? "collapsed" : "mid");
    } else {
      applySheetState("collapsed");
    }
  }

  // The sheet shows its scrollable body whenever it's past the collapsed snap —
  // either settled at mid/full, or dragged up far enough from collapsed.
  const expanded =
    sheetState !== "collapsed" || (dragH != null && dragH > collapsedH + 24);

  // ---- Render ----
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* LAYER 1: Map — full-screen on mobile, offset by the sidebar on desktop */}
      <div className="absolute inset-0 lg:left-[380px] xl:left-[400px]">
        {mode === "plan" ? (
          <TripMap
            origin={origin}
            destination={destination}
            stops={tripStops}
            polyline={activePlan?.polyline ?? null}
            className="h-full w-full"
            onStationSelect={setSelectedStop}
            routes={routeLines}
            onRouteSelect={handleRouteSelect}
          />
        ) : (
          <StationMap
            stations={stations}
            center={exploreCenter}
            selected={selectedStation}
            onSelect={setSelectedStation}
            userLocation={exploreUserLoc}
            onUserLocate={handleExploreLocate}
            onAreaChange={handleExploreAreaChange}
          />
        )}
      </div>

      {/* LAYER 2: Floating top controls (explore mode filters) — mobile only */}
      {mode === "explore" && (
        <div className="absolute left-3 top-3 z-[1000] lg:hidden">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`pill-float flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              hasActiveFilter
                ? "!border-primary/40 !bg-primary/15 text-foreground"
                : "text-muted-foreground"
            }`}
          >
            <SlidersHorizontal className="size-3.5" />
            {showFilters ? tCharging("hide_filters") : tCharging("show_filters")}
            {hasActiveFilter && <span className="size-1.5 rounded-full bg-primary" />}
          </button>
        </div>
      )}

      {mode === "explore" && showFilters && (
        <div className="absolute left-3 right-3 top-16 z-[1000] space-y-1.5 lg:hidden">
          <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-border bg-card/90 px-3 py-1.5 shadow-xl backdrop-blur-md scrollbar-none">
            {POWER_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setMinKw(opt.value)}
                aria-pressed={minKw === opt.value}
                className={`h-9 shrink-0 rounded-full border px-3 text-xs transition-colors ${
                  minKw === opt.value
                    ? "border-primary/50 bg-primary/15 font-semibold text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.label === "filter_all" ? tCharging("filter_all") : opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-border bg-card/90 px-3 py-1.5 shadow-xl backdrop-blur-md scrollbar-none">
            {CONNECTOR_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setConnector(opt.value)}
                aria-pressed={connector === opt.value}
                className={`h-9 shrink-0 rounded-full border px-3 text-xs transition-colors ${
                  connector === opt.value
                    ? "border-primary/50 bg-primary/15 font-semibold text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.label === "filter_all" ? tCharging("filter_all") : opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* LAYER 3: Bottom sheet */}
      {/* Collapsed: anchored above the floating BottomNav pill (14px gap +
          ~50px pill + safe area) so the summary strip stays visible/tappable.
          Mid/full: anchored at the screen bottom edge and slides over the nav. */}
      {/* Frosted dock behind the floating nav — fades the map out at the bottom
          so station markers never clutter around the pill when collapsed. Sits
          above the (isolated) map context but below the nav (z-50). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[45] h-[calc(env(safe-area-inset-bottom)+104px)] bg-gradient-to-t from-background from-55% via-background/80 to-transparent lg:hidden" />

      <motion.div
        className={`absolute inset-x-0 z-[900] mx-auto flex w-full max-w-[480px] flex-col overflow-hidden rounded-t-[20px] border-t border-border bg-background/92 shadow-2xl backdrop-blur-2xl transition-[bottom] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-px before:bg-border lg:hidden ${
          sheetState === "collapsed"
            ? "bottom-[calc(env(safe-area-inset-bottom)+78px)]"
            : "bottom-0"
        }`}
        animate={{ height: dragH ?? heightFor(sheetState) }}
        transition={
          dragH != null ? { duration: 0 } : { type: "spring", stiffness: 350, damping: 38 }
        }
      >
        {/* Peek — grabber + (collapsed summary line | mode tabs). The whole strip
            is the drag handle. Measured (collapsed only) so the panel hugs it. */}
        <div
          ref={peekRef}
          className="shrink-0 cursor-grab touch-none select-none"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
        >
          {/* Grabber — compact tappable strip, cycles collapsed → mid → full */}
          <button
            onClick={cycleSheetState}
            className="mx-auto flex w-full cursor-pointer items-center justify-center pb-1.5 pt-2.5"
            aria-label={tMap("drag_to_expand")}
          >
            <div className="h-1 w-9 rounded-full bg-border transition-colors active:bg-muted-foreground/40" />
          </button>

          {/* Collapsed: single dense summary line. */}
          {!expanded && (
            mode === "plan" && plan && activePlan ? (
              <button
                onClick={() => applySheetState("mid")}
                className="mx-3 mb-2.5 mt-0.5 flex w-[calc(100%-1.5rem)] items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-left active:bg-muted"
              >
                <p className="min-w-0 truncate">
                  <span className="text-xs font-semibold tabular-nums">
                    {Math.floor(activePlan.totalMinutes / 60)}h {activePlan.totalMinutes % 60}min
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {" "}· {Math.round(activePlan.totalDistanceKm)} km ·{" "}
                    {activePlan.stops.length === 0
                      ? tTrip("stops_count_zero")
                      : activePlan.stops.length === 1
                        ? tTrip("stops_count_one")
                        : tTrip("stops_count_other", { count: activePlan.stops.length })}
                  </span>
                </p>
                <span className="ml-2 flex shrink-0 items-center gap-1.5">
                  <span className="text-xs font-semibold text-green-400 tabular-nums">
                    {fromEUR(activePlan.tripEnergyCostEur)}
                  </span>
                  <ChevronUp className="size-3.5 text-muted-foreground" />
                </span>
              </button>
            ) : (
              <button
                onClick={cycleSheetState}
                className="mx-3 mb-2.5 mt-0.5 flex w-[calc(100%-1.5rem)] items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-left active:bg-muted"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {mode === "explore" && stations.length > 0 && (
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-2xs font-semibold tabular-nums text-foreground">
                      {tCharging("stations_count", { count: stations.length })}
                    </span>
                  )}
                  <span className="truncate text-xs text-muted-foreground">
                    {mode === "explore"
                      ? stations.length > 0
                        ? `${stations[0].name ?? tCharging("station_fallback")}${stations[0].maxPowerKw != null ? ` · ${stations[0].maxPowerKw} kW` : ""}`
                        : tMap("explore_hint")
                      : tMap("plan_hint")}
                  </span>
                </span>
                <ChevronUp className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
              </button>
            )
          )}

          {/* Mode tabs — only when expanded, so the collapsed peek stays slim. */}
          {expanded && (
            <div className="mx-3 mb-2 mt-1">
              <SegmentedControl<MapMode>
                layoutId="map-mode-thumb-mobile"
                value={mode}
                onChange={switchMode}
                options={[
                  { value: "explore", label: tMap("tab_explore"), icon: Compass },
                  { value: "plan", label: tMap("tab_plan"), icon: Route },
                ]}
              />
            </div>
          )}
        </div>

        {/* Sheet content — fills the remaining height (flex-1) and scrolls, so
            there's never a dead gap. Bottom padding clears the floating nav. */}
        {expanded && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom)+96px)] [touch-action:pan-y]">
            {mode === "explore" ? (
              <ExploreContent
                stations={stations}
                isFetching={isFetching}
                onStationSelect={setSelectedStation}
                tCharging={tCharging}
                tMap={tMap}
              />
            ) : (
              <PlanContent
                vehicles={vehicles ?? []}
                vehicleId={vehicleId}
                setVehicleId={setVehicleId}
                origin={origin}
                setOrigin={setOrigin}
                destination={destination}
                setDestination={setDestination}
                originBias={originBias}
                destinationBias={destinationBias}
                startSoc={startSoc}
                setStartSoc={setStartSoc}
                arrivalSoc={arrivalSoc}
                setArrivalSoc={setArrivalSoc}
                plan={plan}
                activePlan={activePlan}
                variants={variants}
                activeVariant={activeVariant}
                setActiveVariant={setActiveVariant}
                loading={loading}
                planError={planError}
                canPlan={canPlan}
                canShare={canShare}
                sharing={sharing}
                sharedRoute={sharedRoute}
                onLocateOrigin={handleLocateOrigin}
                locating={locating}
                onPlan={handlePlan}
                onShareToTesla={handleShareToTesla}
                originShort={originShort}
                destinationShort={destinationShort}
                tTrip={tTrip}
              />
            )}
          </div>
        )}
      </motion.div>

      {/* DESKTOP: left sidebar (lg+) — same content, no drag */}
      <DesktopSidebar title={tMap("title")} icon={Route}>
        <div className="shrink-0 px-5">
          <SegmentedControl<MapMode>
            layoutId="map-mode-thumb-desktop"
            value={mode}
            onChange={switchMode}
            options={[
              { value: "explore", label: tMap("tab_explore"), icon: Compass },
              { value: "plan", label: tMap("tab_plan"), icon: Route },
            ]}
          />
          <div className="mt-4 h-px bg-border" />
        </div>

        {/* Explore filters live in the sidebar on desktop */}
        {mode === "explore" && (
          <div className="shrink-0 space-y-1.5 px-5 pt-3">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {POWER_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setMinKw(opt.value)}
                  aria-pressed={minKw === opt.value}
                  className={`h-8 shrink-0 rounded-full border px-2.5 text-xs transition-colors ${
                    minKw === opt.value
                      ? "border-primary/50 bg-primary/15 font-semibold text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label === "filter_all" ? tCharging("filter_all") : opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4 scrollbar-none">
          {mode === "explore" ? (
            <ExploreContent
              stations={stations}
              isFetching={isFetching}
              onStationSelect={setSelectedStation}
              tCharging={tCharging}
              tMap={tMap}
            />
          ) : (
            <PlanContent
              vehicles={vehicles ?? []}
              vehicleId={vehicleId}
              setVehicleId={setVehicleId}
              origin={origin}
              setOrigin={setOrigin}
              destination={destination}
              setDestination={setDestination}
              originBias={originBias}
              destinationBias={destinationBias}
              startSoc={startSoc}
              setStartSoc={setStartSoc}
              arrivalSoc={arrivalSoc}
              setArrivalSoc={setArrivalSoc}
              plan={plan}
              activePlan={activePlan}
              variants={variants}
              activeVariant={activeVariant}
              setActiveVariant={setActiveVariant}
              loading={loading}
              planError={planError}
              canPlan={canPlan}
              canShare={canShare}
              sharing={sharing}
              sharedRoute={sharedRoute}
              onLocateOrigin={handleLocateOrigin}
              locating={locating}
              onPlan={handlePlan}
              onShareToTesla={handleShareToTesla}
              originShort={originShort}
              destinationShort={destinationShort}
              tTrip={tTrip}
            />
          )}
        </div>
      </DesktopSidebar>

      {/* Station detail sheet (explore) */}
      {selectedStation && (
        <ChargerDetailSheet charger={selectedStation} onClose={() => setSelectedStation(null)} />
      )}

      {/* Stop detail sheet (plan) */}
      {selectedStop && (
        <StationDetailSheet stop={selectedStop} onClose={() => setSelectedStop(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExploreContent
// ---------------------------------------------------------------------------

interface ExploreContentProps {
  stations: Charger[];
  isFetching: boolean;
  onStationSelect: (s: Charger) => void;
  tCharging: ReturnType<typeof useTranslations>;
  tMap: ReturnType<typeof useTranslations>;
}

function ExploreContent({ stations, isFetching, onStationSelect, tCharging, tMap }: ExploreContentProps) {
  const list = stations.slice(0, 50);

  return (
    <div className="space-y-2.5 pt-1">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className={SECTION_TITLE}>
          {isFetching
            ? tCharging("updating", { count: stations.length })
            : tCharging("stations_count", { count: stations.length })}
        </span>
      </div>

      {list.length === 0 && !isFetching && (
        <p className="py-6 text-center text-sm text-muted-foreground">{tMap("no_stations")}</p>
      )}

      {list.length > 0 && (
        <motion.ul
          className="space-y-2"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.025 } } }}
        >
          {list.map((s) => {
            const dot =
              s.availability === "operational"
                ? "#22c55e"
                : s.availability === "offline"
                  ? "#f87171"
                  : "#9ca3af";
            return (
              <motion.li
                key={s.id}
                variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
              >
                <motion.button
                  whileTap={{ scale: 0.985 }}
                  onClick={() => onStationSelect(s)}
                  className={`${LIST_ROW} w-full`}
                >
                  <span className="relative flex size-2.5 shrink-0">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: dot }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {s.name ?? s.operator ?? tCharging("station_fallback")}
                    </p>
                    {s.address.city && (
                      <p className="truncate text-2xs text-muted-foreground">{s.address.city}</p>
                    )}
                  </div>
                  {s.maxPowerKw != null && (
                    <span className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-2xs font-semibold tabular-nums text-foreground">
                      <Zap className="size-3 text-primary" />
                      {s.maxPowerKw} kW
                    </span>
                  )}
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
                </motion.button>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlanContent
// ---------------------------------------------------------------------------

interface Vehicle {
  id: string;
  nickname: string | null;
  displayName: string;
}

interface PlanContentProps {
  vehicles: Vehicle[];
  vehicleId: string;
  setVehicleId: (v: string) => void;
  origin: GeoPoint | null;
  setOrigin: (p: GeoPoint | null) => void;
  destination: GeoPoint | null;
  setDestination: (p: GeoPoint | null) => void;
  originBias: { lat: number; lng: number } | null;
  destinationBias: { lat: number; lng: number } | null;
  startSoc: number;
  setStartSoc: (v: number) => void;
  arrivalSoc: number;
  setArrivalSoc: (v: number) => void;
  plan: TripResponse | null;
  activePlan: TripPlan | null;
  variants: TripVariant[];
  activeVariant: number;
  setActiveVariant: (i: number) => void;
  loading: boolean;
  planError: string | null;
  canPlan: boolean;
  canShare: boolean;
  sharing: boolean;
  sharedRoute: boolean;
  onLocateOrigin: () => void;
  locating: boolean;
  onPlan: () => void;
  onShareToTesla: () => void;
  originShort: string;
  destinationShort: string;
  tTrip: ReturnType<typeof useTranslations>;
}

function PlanContent({
  vehicles,
  vehicleId,
  setVehicleId,
  origin,
  setOrigin,
  destination,
  setDestination,
  originBias,
  destinationBias,
  startSoc,
  setStartSoc,
  arrivalSoc,
  setArrivalSoc,
  plan,
  activePlan,
  variants,
  activeVariant,
  setActiveVariant,
  loading,
  planError,
  canPlan,
  canShare,
  sharing,
  sharedRoute,
  onLocateOrigin,
  locating,
  onPlan,
  onShareToTesla,
  originShort,
  destinationShort,
  tTrip,
}: PlanContentProps) {
  return (
    <div className="space-y-3">
      {/* Origin */}
      <GeocodingSearch
        placeholder={tTrip("origin_placeholder")}
        value={origin}
        onChange={setOrigin}
        icon={<Navigation className="size-4" />}
        onLocate={onLocateOrigin}
        locating={locating}
        locateTitle={locating ? tTrip("locating") : tTrip("use_my_location")}
        bias={originBias}
      />

      {/* Destination */}
      <GeocodingSearch
        placeholder={tTrip("destination_placeholder")}
        value={destination}
        onChange={setDestination}
        bias={destinationBias}
      />

      {/* SOC sliders */}
      <div className="space-y-2">
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{tTrip("battery_label")}</span>
            <span className="font-medium text-foreground">{startSoc}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={startSoc}
            onChange={(e) => setStartSoc(Number(e.target.value))}
            className="mt-1 w-full h-1 appearance-none rounded-full bg-muted [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{tTrip("arrival_soc")}</span>
            <span className="font-medium text-foreground">{arrivalSoc}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={5}
            value={arrivalSoc}
            onChange={(e) => setArrivalSoc(Number(e.target.value))}
            className="mt-1 w-full h-1 appearance-none rounded-full bg-muted [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>
      </div>

      {/* Vehicle picker */}
      {vehicles.length > 0 && (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{tTrip("vehicle_label")}</label>
          <div className="relative">
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="auth-input w-full appearance-none pr-5"
            >
              <option value="">{tTrip("vehicle_default")}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nickname ?? v.displayName}
                </option>
              ))}
            </select>
            <ChevronUp className="pointer-events-none absolute right-0 top-1/2 size-3.5 -translate-y-1/2 rotate-180 text-muted-foreground/60" />
          </div>
        </div>
      )}

      {/* Plan button */}
      <button
        onClick={onPlan}
        disabled={!canPlan || loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {tTrip("planning")}
          </>
        ) : (
          <>
            <Route className="size-4" />
            {tTrip("plan_btn")}
          </>
        )}
      </button>

      {planError && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          {planError}
        </div>
      )}

      {/* Trip results */}
      {plan && activePlan && (
        <div className="space-y-3 border-t border-border pt-3">
          {variants.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {variants.map((v, i) => {
                const h = Math.floor(v.plan.totalMinutes / 60);
                const m = v.plan.totalMinutes % 60;
                const active = i === activeVariant;
                const label = getVariantLabel(v, variants);
                const chipTitle = label
                  ? tTrip(`variant.${label.key}`)
                  : `${tTrip("route_label")} ${String.fromCharCode(65 + i)}`;
                return (
                  <button
                    key={v.id}
                    onClick={() => setActiveVariant(i)}
                    aria-pressed={active}
                    className={`flex w-[calc(50vw-1.5rem)] max-w-[11rem] shrink-0 flex-col items-start rounded-xl border px-2.5 py-1.5 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    <span
                      className={`truncate text-xs font-semibold ${
                        label?.color === "accent"
                          ? "text-primary"
                          : label?.color === "green"
                            ? "text-green-400"
                            : label?.color === "yellow"
                              ? "text-yellow-400"
                              : "text-foreground"
                      }`}
                    >
                      {chipTitle}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {h}h {m}min · {Math.round(v.plan.totalDistanceKm)} km ·{" "}
                      {v.plan.stops.length === 0
                        ? tTrip("stops_count_zero")
                        : v.plan.stops.length === 1
                          ? tTrip("stops_count_one")
                          : tTrip("stops_count_other", { count: v.plan.stops.length })}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {activePlan.feasible === false ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-amber-400">{tTrip("infeasible_title")}</p>
                  {activePlan.warning && (
                    <p className="text-xs text-amber-400/80">{activePlan.warning}</p>
                  )}
                  <p className="text-xs text-amber-500/70">{tTrip("infeasible_hint")}</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <CostSummary
                origin={originShort}
                destination={destinationShort}
                totalDistanceKm={activePlan.totalDistanceKm}
                drivingMinutes={activePlan.drivingMinutes}
                chargingMinutes={activePlan.chargingMinutes}
                tripEnergyKwh={activePlan.tripEnergyKwh}
                tripEnergyCostEur={activePlan.tripEnergyCostEur}
                stopsCount={activePlan.stops.length}
                approxRoute={activePlan.approxRoute}
              />

              {canShare && (
                <button
                  onClick={onShareToTesla}
                  disabled={sharing}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {sharing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {tTrip("share_to_tesla")}
                </button>
              )}

              {activePlan.warning && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  <AlertCircle className="size-3.5 shrink-0" />
                  {activePlan.warning}
                </div>
              )}

              {activePlan.stops.length > 0 ? (
                <div className="space-y-1.5">
                  {activePlan.stops.map((stop, i) => (
                    <StopCard
                      key={i}
                      stop={stop}
                      index={i}
                      preconditioned={
                        sharedRoute &&
                        i === 0 &&
                        needsPreconditioning(stop.station.maxKw) &&
                        !isSuperchargerNetwork(stop.station.networkId)
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400">
                  {tTrip("no_stops")}
                </div>
              )}
            </>
          )}

          {plan.deratingPct < 0 && (
            <p className="text-xs text-muted-foreground">
              {tTrip("derate_note", { pct: Math.abs(plan.deratingPct) })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
