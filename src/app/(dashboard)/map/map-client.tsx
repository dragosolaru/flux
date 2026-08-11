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
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Pencil,
  X,
  Zap,
  Send,
  Share2,
  List,
  CarFront,
  Footprints,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { GeocodingSearch, type GeoPoint } from "@/components/trip/GeocodingSearch";
import { StopCard } from "@/components/trip/StopCard";
import { CostSummary } from "@/components/trip/CostSummary";
import { SegmentedControl, DesktopSidebar, LIST_ROW, SECTION_TITLE } from "@/components/map/map-ui";
import { Compass } from "lucide-react";
import { StationDetailSheet } from "@/components/trip/StationDetailSheet";
import { ChargerDetailSheet } from "@/components/charging-map/ChargerDetailSheet";
import * as chargersApi from "@/lib/api/chargers";
import * as tripApi from "@/lib/api/trip";
import * as vehiclesApi from "@/lib/api/vehicles";
import { ApiError } from "@/lib/api-fetch";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import { useCurrency } from "@/hooks/useCurrency";
import {
  useSavedRoutes,
  useCreateSavedRoute,
  useDeleteSavedRoute,
  type SavedRoute,
} from "@/hooks/useSavedRoutes";
import { SavedRoutesSheet } from "@/components/trip/SavedRoutesSheet";
import { compactSnapshot, parseSnapshot } from "@/lib/trip/snapshot";
import { shareRoute } from "@/lib/trip/share-route";
import { routeNeedsPreconditioning, needsPreconditioning, isTeslaOwnNetwork } from "@/lib/trip/precondition";
import type { TripPlan, TripVariant, ChargingStop } from "@/lib/external/routing/types";
import type { Charger, ConnectorType } from "@/lib/chargers/types";
import { haversineMeters } from "@/lib/chargers/dedup";
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

// Pill style shared across filter chips
const CHIP_BASE =
  "h-7 shrink-0 rounded-full border px-2.5 text-2xs transition-colors";
const CHIP_ON =
  "border-primary/50 bg-primary/15 font-semibold text-foreground";
const CHIP_OFF =
  "border-border bg-transparent text-muted-foreground";

// ---------------------------------------------------------------------------
// Bottom sheet geometry
// ---------------------------------------------------------------------------

function visibleViewportHeight(): number {
  if (typeof window === "undefined") return 800;
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

// ---------------------------------------------------------------------------
// Trip helper
// ---------------------------------------------------------------------------

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

const DEFAULT_LAT = 48.0;
const DEFAULT_LNG = 14.0;
const DEFAULT_BBOX: ViewportBBox = {
  minLat: DEFAULT_LAT - 5,
  minLng: DEFAULT_LNG - 8,
  maxLat: DEFAULT_LAT + 5,
  maxLng: DEFAULT_LNG + 8,
};

// Models the planner has real specs for (src/lib/brands/models.ts). Listed here
// rather than derived so the picker cannot silently offer a model the API would
// then fall back to a Model 3 for.
const PLANNABLE_MODELS = ["Model 3", "Model Y", "Model S", "Model X"] as const;

/**
 * Walking distance, rounded to what is useful on foot.
 *
 * Metres below a kilometre, in tens — "180 m" helps, "183 m" implies a
 * precision consumer GPS does not have. One decimal above that.
 */
function formatWalkDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

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
  const tCommands = useTranslations("commands");
  const { fromEUR } = useCurrency();

  const searchParams = useSearchParams();
  const initialMode: MapMode = searchParams.get("mode") === "plan" ? "plan" : "explore";
  const [mode, setMode] = useState<MapMode>(initialMode);

  // ---- 2-state bottom results sheet (height-driven) ----
  // The sheet only appears when there are results (stations or a trip plan).
  // It snaps between mid (~45 vh) and full (~88 vh).
  type SheetState = "mid" | "full";
  const [sheetState, setSheetState] = useState<SheetState>("mid");

  const [vh, setVh] = useState(() => visibleViewportHeight());
  const midH = Math.round(vh * 0.45);
  const fullH = Math.round(vh * 0.88);

  const heightFor = useCallback(
    (s: SheetState) => (s === "mid" ? midH : fullH),
    [midH, fullH],
  );

  const [dragH, setDragH] = useState<number | null>(null);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    dragStartY.current = e.clientY;
    dragStartH.current = heightFor(sheetState);
    setDragH(dragStartH.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!(e.buttons & 1)) return;
    const next = dragStartH.current + (dragStartY.current - e.clientY);
    // Allow dragging below mid so a downward flick can dismiss the sheet.
    setDragH(Math.max(midH * 0.5, Math.min(next, fullH)));
  }

  function onDragEnd() {
    const h = dragH ?? heightFor(sheetState);
    setDragH(null);
    // Dragged well below mid → dismiss the list back to the map.
    if (h < midH * 0.75) {
      setStationListOpen(false);
      return;
    }
    setSheetState(Math.abs(h - midH) <= Math.abs(h - fullH) ? "mid" : "full");
  }

  // ---- Explore mode state ----
  // ?lat&lng centres the map on arrival — how "where is my car" gets from the
  // dashboard to a map. Read once into initial state rather than an effect, so
  // panning away is not undone on the next render.
  const [exploreCenter, setExploreCenter] = useState(() => {
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
      ? { lat, lng }
      : { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
  });
  const [exploreUserLoc, setExploreUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  // Only pinned when the dashboard sent us here to find the car, so the pin
  // means "your car is there" rather than "a car was here once".
  const carLocation =
    searchParams.get("car") === "1" &&
    Number.isFinite(Number(searchParams.get("lat"))) &&
    Number.isFinite(Number(searchParams.get("lng")))
      ? { lat: Number(searchParams.get("lat")), lng: Number(searchParams.get("lng")) }
      : null;
  const findingCar = carLocation != null;
  const [exploreArea, setExploreArea] = useState<ViewportBBox>(DEFAULT_BBOX);
  const [minKw, setMinKw] = useState(0);
  const [connector, setConnector] = useState<ConnectorType | "all">("all");
  const [selectedStation, setSelectedStation] = useState<Charger | null>(null);
  const [exploreResetKey, setExploreResetKey] = useState(0);
  // The station list is opt-in: the map markers are the stations, so the list
  // stays hidden behind a small pill until the user asks for it.
  const [stationListOpen, setStationListOpen] = useState(false);

  // Plain functions — React Compiler memoizes them; the setters are stable.
  function handleExploreLocate(lat: number, lng: number) {
    setExploreCenter({ lat, lng });
    setExploreUserLoc({ lat, lng });
    setExploreArea(toBBox(lat, lng));
    setExploreResetKey((k) => k + 1);
  }

  function handleExploreAreaChange(bbox: ViewportBBox) {
    setExploreArea(bbox);
  }

  // Silent auto-locate on mount.
  //
  // Two different needs. Browsing chargers wants a rough position quickly, and
  // re-centres on it. Walking to the car wants an accurate one and must NOT
  // re-centre — the view belongs to the car-and-walker fit, and a coarse
  // network fix landing a second later would yank the map away from it. Three
  // seconds is also too short for a GPS fix; someone standing in a car park
  // will wait ten for a dot they can trust.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const findingCar = carLocation != null;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (findingCar) setExploreUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        else handleExploreLocate(pos.coords.latitude, pos.coords.longitude);
      },
      () => undefined,
      findingCar
        ? { timeout: 10_000, enableHighAccuracy: true, maximumAge: 15_000 }
        : { timeout: 3000 },
    );
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
    queryFn: () => chargersApi.inBBox(exploreArea, { minKw, connector }),
    staleTime: 300_000,
    placeholderData: keepPreviousData,
    enabled: mode === "explore",
  });

  // ---- Plan mode state ----
  const { data: vehicles } = useVehicles();
  const { selectedVehicleId } = useVehicleContext();
  const [vehicleId, setVehicleId] = useState(() => selectedVehicleId ?? "");
  // Which model to plan for when no vehicle is selected. The planner used a
  // Model 3 for everyone, so a Model X owner — or anyone with no car in the app
  // — was quoted the range and charge curve of a different vehicle.
  const [assumedModel, setAssumedModel] = useState<string>(PLANNABLE_MODELS[0]);
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  // The planner starts from the car's real battery. It used to start from a
  // fixed 80% — a route planner that does not know your state of charge is
  // guessing, and reading it is the one thing linking the car makes possible.
  //
  // `poll: false` deliberately: the planner needs the value, not a stream, and
  // an interval here would keep a linked car awake for as long as the map is
  // open.
  const planningVehicle = (vehicles ?? []).find((v) => v.id === vehicleId);
  const { data: liveState } = useVehicle(
    vehicleId,
    planningVehicle?.dataSource === "live",
    false,
  );
  // Derived, not synced. An effect copying the live value into state would
  // overwrite the driver mid-plan every time the car reported; expressing "the
  // driver's number wins, otherwise the car's, otherwise 80" as a fallback
  // chain makes that impossible rather than merely unlikely.
  const [startSocOverride, setStartSocOverride] = useState<number | null>(null);
  const liveSoc = liveState?.batteryLevel;
  const startSoc =
    startSocOverride ??
    (typeof liveSoc === "number" && liveSoc > 0 ? Math.round(liveSoc) : 80);
  const handleStartSocChange = setStartSocOverride;
  const [arrivalSoc, setArrivalSoc] = useState(10);
  const [plan, setPlan] = useState<TripResponse | null>(null);
  const [activeVariant, setActiveVariant] = useState(0);
  const [loading, setLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharedRoute, setSharedRoute] = useState(false);
  const [selectedStop, setSelectedStop] = useState<ChargingStop | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Plan-mode form collapse: true = full form, false = compact "A → B" summary
  // bar (set after a plan is computed so the map and routes stay visible).
  const [editingRoute, setEditingRoute] = useState(true);
  // Single 3-state control for the route strip — one button in the tabs row
  // cycles: "compact" (summaries) → "expanded" (details) → "minimized" (hidden).
  type PlanDisplayState = "compact" | "expanded" | "minimized";
  const [planDisplayState, setPlanDisplayState] = useState<PlanDisplayState>("compact");

  // Derived booleans used by the JSX below.
  const variantsExpanded = planDisplayState === "expanded";
  const planMinimized = planDisplayState === "minimized";

  function cyclePlanDisplay() {
    setPlanDisplayState((s) =>
      s === "compact" ? "expanded" : s === "expanded" ? "minimized" : "compact"
    );
  }

  const canPlan = origin !== null && destination !== null;

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
          const name = await tripApi.reverseGeocode(pos.coords.latitude, pos.coords.longitude);
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
      const result = await tripApi.plan<TripResponse>({
        ...(vehicleId ? { vehicleId } : {}),
        origin: { lat: origin.lat, lng: origin.lng, label: origin.name },
        startSoc,
        ...(vehicleId ? {} : { model: assumedModel }),
        arrivalSocPct: arrivalSoc,
        destination: { lat: destination.lat, lng: destination.lng, label: destination.name },
      });
      setPlan(result);
      setRouteSaved(false);
      // Areas pulled in for the previous route are not "on the way" for this one.
      setExtraStations([]);
      setActiveVariant(0);
      setSharedRoute(false);
      setSheetState("mid");
      // Collapse the form to a slim "A → B" bar so the route is visible.
      setEditingRoute(false);
      setPlanDisplayState("compact");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const isNetworkError = !navigator.onLine || msg === "Failed to fetch";
      // Not `msg || infeasible_hint`. That hint is advice about a route the car
      // cannot complete; a request that failed is a different thing entirely,
      // and offering "try a higher battery percentage" for a 504 sends people
      // to adjust a slider that was never the problem. A long international
      // route is the case that times out, so name that.
      const isTimeout = err instanceof ApiError && (err.status === 504 || err.status === 408);
      setPlanError(
        isNetworkError
          ? tTrip("network_error")
          : isTimeout
            ? tTrip("plan_timeout")
            : msg || tTrip("plan_failed"),
      );
    } finally {
      setLoading(false);
    }
  }

  const variants = useMemo(() => plan?.variants ?? [], [plan?.variants]);
  const activePlan = variants[activeVariant]?.plan ?? plan?.plan ?? null;

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

  // Saving stores one variant, so a different variant is a different route.
  function handleVariantChange(index: number) {
    setActiveVariant(index);
    setRouteSaved(false);
  }

  function handleRouteSelect(roadIndex: number) {
    const idx = variants.findIndex((v) => v.roadIndex === roadIndex);
    if (idx >= 0) {
      setActiveVariant(idx);
      // Selecting on the map should reveal the matching card — un-minimize.
      setPlanDisplayState((s) => (s === "minimized" ? "compact" : s));
    }
  }

  // Falls back to the first Tesla in the garage: a trip planned without picking
  // a vehicle is the common case, and the button vanishing there reads as the
  // feature being broken.
  const teslaVehicle = useMemo(() => {
    if (plan?.vehicle && plan.vehicle.brand === "tesla") {
      return { id: plan.vehicle.id, displayName: plan.vehicle.displayName };
    }
    const v = (vehicles ?? []).find((x) => x.brand === "tesla");
    return v ? { id: v.id, displayName: v.nickname ?? v.displayName } : null;
  }, [plan, vehicles]);
  const canShare = teslaVehicle !== null && activePlan !== null && activePlan.feasible !== false;

  /**
   * Hands the whole plan — stops included — to the OS share sheet, so it can go
   * to the Tesla app or any navigation app, and works with no Tesla linked.
   * `share_navigation` stays as the path that pushes waypoints into the car.
   */
  /**
   * Discard the plan and return to exploring. The pencil only edits the
   * endpoints, so without this a planned route could be changed but never put
   * away — the strip, the drawn line and the stop pins stayed for the session.
   */
  const { data: savedRoutes = [] } = useSavedRoutes();
  const createSavedRoute = useCreateSavedRoute();
  const deleteSavedRoute = useDeleteSavedRoute();
  const [routeSaved, setRouteSaved] = useState(false);
  const savingRef = useRef(false);
  const [savedSheetOpen, setSavedSheetOpen] = useState(false);
  const [preconditioningManually, setPreconditioningManually] = useState(false);

  function handleLoadSavedRoute(r: SavedRoute) {
    setOrigin({ name: r.origin_label, lat: r.origin_lat, lng: r.origin_lng });
    setDestination({ name: r.destination_label, lat: r.destination_lat, lng: r.destination_lng });
    const snap = parseSnapshot(r.plan_snapshot);
    setActiveVariant(0);
    setExtraStations([]);
    setSharedRoute(false);
    if (snap) {
      setPlan(snap as TripResponse);
      setRouteSaved(true);
      setEditingRoute(false);
    } else {
      // Unreadable or legacy snapshot: drop the previous plan rather than
      // leaving one route's map under another's labels.
      setPlan(null);
      setRouteSaved(false);
      setEditingRoute(true);
    }
    setSavedSheetOpen(false);
  }

  /**
   * The reason a command failed, not just that it did.
   *
   * A post-2021 car without the signing proxy answers 412 VCP_REQUIRED, and
   * every precondition path here reported that as the generic "share failed"
   * toast — so the one failure with an actionable cause looked identical to a
   * network blip.
   */
  function commandErrorMessage(err: unknown): string {
    if (err instanceof ApiError && err.code === "PROXY_NOT_CONFIGURED") {
      return tCommands("error_proxy_missing");
    }
    if (err instanceof ApiError && (err.status === 412 || err.code === "VCP_REQUIRED")) {
      return tCommands("error_vcp_required");
    }
    if (err instanceof ApiError && err.status === 429) {
      return tCommands("error_rate_limit");
    }
    return tTrip("share_error");
  }

  async function handleManualPrecondition() {
    if (!teslaVehicle) return;
    setPreconditioningManually(true);
    try {
      await vehiclesApi.sendCommand(teslaVehicle.id, "precondition_max", { on: true });
      toast.success(tTrip("precondition_started"));
    } catch (err) {
      toast.error(commandErrorMessage(err));
    } finally {
      setPreconditioningManually(false);
    }
  }

  async function handleSaveRoute() {
    if (!activePlan || !origin || !destination || routeSaved) return;
    // `routeSaved` is only set once the POST resolves, and React state does not
    // update mid-tick, so on a slow connection two taps inside the round-trip
    // both read it as false and both saved. A ref flips synchronously and so
    // actually closes the window. The unique index added in migration 040 is
    // the durable guard — this just avoids the wasted request.
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await createSavedRoute.mutateAsync({
        name: `${origin.name.split(",")[0]} → ${destination.name.split(",")[0]}`,
        origin_label: origin.name,
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        destination_label: destination.name,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        stops: activePlan.stops,
        // Only the chosen variant, polyline thinned — a full three-variant
        // snapshot exceeds the request cap on any real road trip.
        plan_snapshot: plan ? compactSnapshot(plan, activeVariant) : {},
      });
      setRouteSaved(true);
      toast.success(tTrip("saved_route_saved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg === "saved_routes_limit" ? tTrip("saved_route_limit") : tTrip("saved_route_error"),
      );
    } finally {
      savingRef.current = false;
    }
  }

  const [loadingArea, setLoadingArea] = useState<{ lat: number; lng: number } | null>(null);
  const [extraStations, setExtraStations] = useState<Charger[]>([]);

  // Chargers along the planned route. The Explore query is bound to the map
  // viewport and disabled in Plan mode, so without its own query the corridor
  // layer had nothing to draw — and visiting Explore first left it showing that
  // viewport's chargers instead. Padded around the route's bounds and rounded so
  // the key is stable across re-renders.
  const routeBBox = useMemo(() => {
    const coords = activePlan?.polyline?.coordinates;
    const pts: { lat: number; lng: number }[] = coords?.length
      ? coords.map(([lng, lat]) => ({ lat, lng }))
      : [origin, destination].filter((p): p is GeoPoint => p !== null);
    if (pts.length === 0) return null;
    let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
    for (const p of pts) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    }
    const pad = 0.1;
    return {
      minLat: +(minLat - pad).toFixed(2), minLng: +(minLng - pad).toFixed(2),
      maxLat: +(maxLat + pad).toFixed(2), maxLng: +(maxLng + pad).toFixed(2),
    };
  }, [activePlan?.polyline, origin, destination]);

  const { data: corridorStations = [], isFetching: corridorFetching } = useQuery({
    queryKey: ["map-corridor-chargers", routeBBox],
    queryFn: () => chargersApi.inBBox(routeBBox!, { limit: 1000 }),
    enabled: mode === "plan" && routeBBox !== null && plan !== null,
    staleTime: 300_000,
  });

  // TripMap filters this to within 5 km of the driven line; areas the user
  // asked for explicitly are merged in and deliberately exempt from that.
  const planStations = useMemo(() => {
    if (extraStations.length === 0) return corridorStations;
    const seen = new Set(corridorStations.map((c) => c.id));
    return [...corridorStations, ...extraStations.filter((c) => !seen.has(c.id))];
  }, [corridorStations, extraStations]);

  const handleAreaRequest = useCallback(
    async (lat: number, lng: number) => {
      if (loadingArea) return; // one at a time — each can trigger a full ingest
      setLoadingArea({ lat, lng });
      try {
        const pad = 0.22;
        const bbox = { minLat: lat - pad, maxLat: lat + pad, minLng: lng - pad, maxLng: lng + pad };
        const merge = (found: Charger[]) => {
          setExtraStations((prev) => {
            const seen = new Set(prev.map((c) => c.id));
            return [...prev, ...found.filter((c) => !seen.has(c.id))];
          });
          return found.length;
        };
        // The read endpoint answers from what is stored and ingests a cold area
        // in the background, so a first press on virgin ground would otherwise
        // report nothing while the sources were still being fetched.
        let count = merge(await chargersApi.inBBox(bbox, { limit: 500 }));
        for (const delay of [4000, 7000]) {
          await new Promise((r) => setTimeout(r, delay));
          const again = await chargersApi.inBBox(bbox, { limit: 500 });
          if (again.length > count) count = merge(again);
          else break;
        }
        toast.success(tTrip("area_loaded", { count }));
      } catch {
        toast.error(tTrip("area_error"));
      } finally {
        setLoadingArea(null);
      }
    },
    [loadingArea, tTrip],
  );

  function handleClearPlan() {
    setPlan(null);
    setPlanError(null);
    setActiveVariant(0);
    setSharedRoute(false);
    setPlanDisplayState("compact");
    setRouteSaved(false);
    // No plan left to display, so the form is what should be on screen.
    setEditingRoute(true);
    // Areas pulled in for the previous route are no longer "on the way".
    setExtraStations([]);
  }

  async function handleShareRoute() {
    if (!activePlan || !origin || !destination) return;

    // The battery cares about the route, not about which app receives the link.
    if (teslaVehicle && routeNeedsPreconditioning(activePlan.stops)) {
      // Fire-and-forget, but not silent: the share must not be blocked on the
      // car, yet a driver told nothing will stand at a cold charger wondering
      // why. `.catch(() => undefined)` swallowed even the 412 that says the
      // signing proxy is missing.
      void vehiclesApi
        .sendCommand(teslaVehicle.id, "precondition_max", { on: true })
        .catch((err: unknown) => {
          toast.error(commandErrorMessage(err));
        });
    }

    const outcome = await shareRoute({
      origin,
      destination,
      stops: activePlan.stops.map((st) => st.station),
      title: `${origin.name.split(",")[0]} → ${destination.name.split(",")[0]}`,
    });

    if (outcome === "copied") toast.success(tTrip("share_link_copied"));
    else if (outcome === "failed") toast.error(tTrip("share_error"));
  }

  async function handleShareToTesla() {
    if (!teslaVehicle || !activePlan || !destination) return;
    setSharing(true);
    try {
      const willPrecondition = routeNeedsPreconditioning(activePlan.stops);

      await vehiclesApi.shareNavigation(
        teslaVehicle.id,
        {
          destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
          stops: activePlan.stops.map((s) => ({
            lat: s.station.lat,
            lng: s.station.lng,
            name: s.station.name,
          })),
        },
        { precondition: willPrecondition },
      );
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

  // ---- Mode switch ----
  function switchMode(next: MapMode) {
    setMode(next);
    setSheetState("mid");
    setStationListOpen(false);
    if (next === "plan") {
      setEditingRoute(plan === null);
      setPlanDisplayState("compact");
    }
  }

  function openStationList() {
    setSheetState("mid");
    setStationListOpen(true);
  }

  // The bottom sheet is explore-only and opt-in: plan results live in the
  // top-card route accordion, and the station list opens only on request so
  // the map stays uncluttered.
  const showSheet = mode === "explore" && stationListOpen && stations.length > 0;
  // Visible while fetching too, not only once there is something to count.
  // Requiring stations.length > 0 meant the very first load — the one time you
  // genuinely cannot tell whether anything is happening — showed nothing at
  // all: no pill, no spinner, an empty map that looks finished.
  const showListPill =
    mode === "explore" && !stationListOpen && (stations.length > 0 || isFetching);

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
            nearbyStations={planStations}
            onAreaRequest={(lat, lng) => void handleAreaRequest(lat, lng)}
            loadingArea={loadingArea}
          />
        ) : (
          <StationMap
            stations={stations}
            carLocation={carLocation}
            center={exploreCenter}
            selected={selectedStation}
            onSelect={setSelectedStation}
            userLocation={exploreUserLoc}
            onUserLocate={
              findingCar
                ? (lat, lng) => setExploreUserLoc({ lat, lng })
                : handleExploreLocate
            }
            onAreaChange={handleExploreAreaChange}
            isFetching={isFetching}
          />
        )}
      </div>

      {/* Find-my-car banner. Sits above the mode tabs because in this mode the
          tabs are not what the screen is for — the distance and the handoff to
          a walking app are. */}
      {findingCar && carLocation && (
        <div
          className="absolute inset-x-3 z-[1001] flex items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-xl backdrop-blur-xl"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <CarFront className="size-5 shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{tCommands("find_car_title")}</p>
            <p className="truncate text-xs text-muted-foreground">
              {exploreUserLoc
                ? tCommands("find_car_distance", {
                    distance: formatWalkDistance(
                      haversineMeters(exploreUserLoc, carLocation),
                    ),
                  })
                : tCommands("find_car_locating")}
            </p>
          </div>
          {/* Handed off rather than drawn: a real pavement route needs a
              pedestrian router we do not have, and the phone already has one
              that knows about crossings and one-way footpaths. */}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${carLocation.lat},${carLocation.lng}&travelmode=walking`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
          >
            <Footprints className="size-4" />
            {tCommands("find_car_walk")}
          </a>
        </div>
      )}

      {/* LAYER 2: Mobile Top Card (Waze/ABRP pattern)
          Replaces the old floating filter button + pills + collapsed bottom card.
          Single control surface at the top: mode tabs + mode-specific controls.
          No overflow-hidden so GeocodingSearch dropdowns extend below the card. */}
      <div
        className="absolute inset-x-3 z-[1000] lg:hidden"
        style={{
          top: findingCar
            ? "calc(env(safe-area-inset-top, 0px) + 72px)"
            : "calc(env(safe-area-inset-top, 0px) + 12px)",
        }}
      >
        <div className="rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur-xl">
          {/* Mode tabs — compact. When a plan is active, ONE button cycles the route strip:
              compact (summaries) → expanded (details) → minimized (hidden) → compact. */}
          <div className="flex items-center gap-1 p-1">
            <div className="flex-1">
              <SegmentedControl<MapMode>
                dense
                layoutId="map-mode-thumb-mobile"
                value={mode}
                onChange={switchMode}
                options={[
                  { value: "explore", label: tMap("tab_explore"), icon: Compass },
                  { value: "plan", label: tMap("tab_plan"), icon: Route },
                ]}
              />
            </div>
            {mode === "plan" && plan && !editingRoute && (
              <button
                onClick={cyclePlanDisplay}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground active:text-foreground"
              >
                {planDisplayState === "expanded" ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>
            )}
          </div>

          {/* Explore: a single compact filter row (power · connector) */}
          {mode === "explore" && (
            <div className="flex items-center gap-1 overflow-x-auto border-t border-border/40 px-1.5 py-1.5 scrollbar-none">
              {POWER_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setMinKw(opt.value)}
                  aria-pressed={minKw === opt.value}
                  className={`${CHIP_BASE} ${minKw === opt.value ? CHIP_ON : CHIP_OFF}`}
                >
                  {opt.label === "filter_all" ? tCharging("filter_all") : opt.label}
                </button>
              ))}
              <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
              {CONNECTOR_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setConnector(opt.value)}
                  aria-pressed={connector === opt.value}
                  className={`${CHIP_BASE} ${connector === opt.value ? CHIP_ON : CHIP_OFF}`}
                >
                  {opt.label === "filter_all" ? tCharging("filter_all") : opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Plan — planned: slim "A → B" bar + horizontal route strip.
              planMinimized hides the strip to show the map. ChevronUp in tabs row toggles it. */}
          {mode === "plan" && !editingRoute && plan && activePlan && !planMinimized && (
            <div className="border-t border-border/40">
              <div className="flex w-full items-center gap-1 px-3 py-1.5">
                <button
                  onClick={() => setEditingRoute(true)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Navigation className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-foreground">
                    <span className="truncate">{originShort}</span>
                    <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{destinationShort}</span>
                  </span>
                  <Pencil className="size-3 shrink-0 text-muted-foreground" />
                </button>
                <button
                  onClick={() => setSavedSheetOpen(true)}
                  aria-label={tTrip("saved_routes_title")}
                  title={tTrip("saved_routes_title")}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Bookmark className="size-3.5" />
                </button>
                <button
                  onClick={handleClearPlan}
                  aria-label={tTrip("clear_plan")}
                  title={tTrip("clear_plan")}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              <RouteAccordion
                plan={plan}
                variants={variants}
                activeVariant={activeVariant}
                setActiveVariant={handleVariantChange}
                variantsExpanded={variantsExpanded}
                canShare={canShare}
                sharing={sharing}
                sharedRoute={sharedRoute}
                onShareToTesla={handleShareToTesla}
                onShareRoute={() => void handleShareRoute()}
                onSaveRoute={() => void handleSaveRoute()}
                routeSaved={routeSaved}
                savingRoute={createSavedRoute.isPending}
                originShort={originShort}
                destinationShort={destinationShort}
                fromEUR={fromEUR}
                tTrip={tTrip}
              />
            </div>
          )}

          {/* Plan — editing: origin + destination + advanced + plan button */}
          {mode === "plan" && (editingRoute || !plan) && (
            <div className="space-y-1.5 border-t border-border/40 px-2.5 pb-2 pt-1.5">
              <GeocodingSearch
                placeholder={tTrip("origin_placeholder")}
                value={origin}
                onChange={setOrigin}
                icon={<Navigation className="size-4" />}
                onLocate={handleLocateOrigin}
                locating={locating}
                locateTitle={locating ? tTrip("locating") : tTrip("use_my_location")}
                bias={originBias}
              />
              <GeocodingSearch
                placeholder={tTrip("destination_placeholder")}
                value={destination}
                onChange={setDestination}
                bias={destinationBias}
              />

              {/* Advanced (SOC + vehicle) — collapsible */}
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center justify-between py-0.5 text-xs text-muted-foreground"
              >
                <span>{tTrip("advanced_label")}</span>
                {showAdvanced ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>

              {showAdvanced && (
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
                      onChange={(e) => handleStartSocChange(Number(e.target.value))}
                      className="mt-1 h-1 w-full appearance-none rounded-full bg-muted [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
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
                      className="mt-1 h-1 w-full appearance-none rounded-full bg-muted [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
                    />
                  </div>
                  {(vehicles?.length ?? 0) > 0 && (
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        {tTrip("vehicle_label")}
                      </label>
                      {/* One wrapper per select. Nesting both in a single
                          `relative` left the one chevron floating between
                          them, belonging to neither. */}
                      <div className="relative">
                        <select
                          value={vehicleId}
                          onChange={(e) => setVehicleId(e.target.value)}
                          className="auth-input w-full appearance-none pr-5"
                        >
                          <option value="">{tTrip("vehicle_default")}</option>
                          {vehicles?.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.nickname ?? v.displayName}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                      </div>
                      {!vehicleId && (
                        <div className="relative mt-1.5">
                          <select
                            value={assumedModel}
                            onChange={(e) => setAssumedModel(e.target.value)}
                            aria-label={tTrip("assumed_model_label")}
                            className="auth-input w-full appearance-none pr-5"
                          >
                            {PLANNABLE_MODELS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handlePlan}
                disabled={!canPlan || loading}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
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
            </div>
          )}
        </div>
      </div>

      {/* LAYER 3: Mobile Bottom Station Sheet (explore only) — the station list.
          Plan results live in the top-card route accordion instead. */}
      <AnimatePresence>
        {showSheet && (
          <motion.div
            key="results-sheet"
            className="absolute inset-x-0 bottom-0 z-[900] mx-auto flex w-full max-w-[480px] flex-col overflow-hidden rounded-t-[20px] border-t border-border bg-background/95 shadow-2xl backdrop-blur-2xl lg:hidden"
            initial={{ height: 0 }}
            animate={{ height: dragH ?? heightFor(sheetState) }}
            exit={{ height: 0 }}
            transition={
              dragH != null ? { duration: 0 } : { type: "spring", stiffness: 350, damping: 38 }
            }
          >
            {/* Grabber + station count — drag handle */}
            <div
              className="shrink-0 cursor-grab touch-none select-none"
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
            >
              <button
                onClick={() => setSheetState((s) => (s === "mid" ? "full" : "mid"))}
                className="mx-auto flex w-full cursor-pointer items-center justify-center pb-1.5 pt-2.5"
                aria-label={tMap("drag_to_expand")}
              >
                <div className="h-1 w-9 rounded-full bg-border transition-colors active:bg-muted-foreground/40" />
              </button>
              <div className="flex items-center justify-between gap-2 px-4 pb-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  {isFetching && <Loader2 className="size-3 animate-spin text-primary" />}
                  {isFetching
                    ? stations.length === 0
                      ? tCharging("loading_stations")
                      : tCharging("updating", { count: stations.length })
                    : tCharging("stations_count", { count: stations.length })}
                </span>
                <button
                  onClick={() => setStationListOpen(false)}
                  aria-label={tCharging("hide_filters")}
                  className="-m-1.5 p-1.5 text-muted-foreground active:text-foreground"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
            </div>

            {/* Scrollable station list */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom)+96px)] [touch-action:pan-y]">
              <ExploreContent
                stations={stations}
                isFetching={isFetching}
                onStationSelect={setSelectedStation}
                tCharging={tCharging}
                tMap={tMap}
                hideHeader
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating "show list" pill (explore, mobile) — opens the station list on
          demand so the map stays uncluttered. */}
      <AnimatePresence>
        {mode === "plan" && corridorFetching && (
          <motion.div
            key="corridor-loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-[calc(env(safe-area-inset-bottom)+84px)] left-1/2 z-[900] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-2 text-xs font-semibold text-foreground shadow-xl backdrop-blur-xl"
          >
            <Loader2 className="size-3.5 animate-spin text-primary" />
            {tCharging("loading_stations")}
          </motion.div>
        )}

        {showListPill && (
          <motion.button
            key="list-pill"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={openStationList}
            className="absolute bottom-[calc(env(safe-area-inset-bottom)+84px)] left-1/2 z-[900] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-2 text-xs font-semibold text-foreground shadow-xl backdrop-blur-xl lg:hidden"
          >
            {isFetching ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <List className="size-3.5 text-primary" />
            )}
            {isFetching
              ? stations.length === 0
                ? tCharging("loading_stations")
                : tCharging("updating", { count: stations.length })
              : tCharging("stations_count", { count: stations.length })}
          </motion.button>
        )}
      </AnimatePresence>

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
              assumedModel={assumedModel}
              setAssumedModel={setAssumedModel}
              origin={origin}
              setOrigin={setOrigin}
              destination={destination}
              setDestination={setDestination}
              originBias={originBias}
              destinationBias={destinationBias}
              startSoc={startSoc}
              setStartSoc={handleStartSocChange}
              arrivalSoc={arrivalSoc}
              setArrivalSoc={setArrivalSoc}
              plan={plan}
              activePlan={activePlan}
              variants={variants}
              activeVariant={activeVariant}
              setActiveVariant={handleVariantChange}
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
              onShareRoute={() => void handleShareRoute()}
                onSaveRoute={() => void handleSaveRoute()}
                routeSaved={routeSaved}
                savingRoute={createSavedRoute.isPending}
                onOpenSavedRoutes={() => setSavedSheetOpen(true)}
                onClearPlan={handleClearPlan}
                onManualPrecondition={() => void handleManualPrecondition()}
                preconditioningManually={preconditioningManually}
                hasTesla={teslaVehicle !== null}
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

      <SavedRoutesSheet
        open={savedSheetOpen}
        onClose={() => setSavedSheetOpen(false)}
        routes={savedRoutes}
        onLoad={handleLoadSavedRoute}
        onDelete={(id) =>
          deleteSavedRoute.mutate(id, {
            onError: () => toast.error(tTrip("saved_route_error")),
          })
        }
        t={tTrip}
      />
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
  hideHeader?: boolean;
}

function ExploreContent({ stations, isFetching, onStationSelect, tCharging, tMap, hideHeader }: ExploreContentProps) {
  const list = stations.slice(0, 50);

  return (
    <div className="space-y-2.5 pt-1">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <span className={`${SECTION_TITLE} flex items-center gap-1.5`}>
            {isFetching && <Loader2 className="size-3 animate-spin text-primary" />}
            {isFetching
              ? stations.length === 0
                ? tCharging("loading_stations")
                : tCharging("updating", { count: stations.length })
              : tCharging("stations_count", { count: stations.length })}
          </span>
        </div>
      )}

      {list.length === 0 && isFetching && (
        <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {tCharging("loading_stations")}
        </p>
      )}

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
// RouteAccordion — mobile plan results: each route variant is an expandable
// row inside the top card. No bottom sheet; the map stays visible.
// ---------------------------------------------------------------------------

interface RouteAccordionProps {
  plan: { deratingPct: number };
  variants: TripVariant[];
  activeVariant: number;
  setActiveVariant: (i: number) => void;
  variantsExpanded: boolean;
  canShare: boolean;
  sharing: boolean;
  sharedRoute: boolean;
  onShareToTesla: () => void;
  onShareRoute: () => void;
  onSaveRoute: () => void;
  routeSaved: boolean;
  savingRoute: boolean;
  originShort: string;
  destinationShort: string;
  fromEUR: (eur: number) => string;
  tTrip: ReturnType<typeof useTranslations>;
}

function stopsLabel(count: number, tTrip: ReturnType<typeof useTranslations>): string {
  return count === 0
    ? tTrip("stops_count_zero")
    : count === 1
      ? tTrip("stops_count_one")
      : tTrip("stops_count_other", { count });
}

function RouteAccordion({
  plan,
  variants,
  activeVariant,
  setActiveVariant,
  variantsExpanded,
  canShare,
  sharing,
  sharedRoute,
  onShareToTesla,
  onShareRoute,
  onSaveRoute,
  routeSaved,
  savingRoute,
  originShort,
  destinationShort,
  fromEUR,
  tTrip,
}: RouteAccordionProps) {
  // When the active route changes (e.g. the user tapped its polyline on the
  // map), scroll the matching card into view so the selection is visible.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const card = stripRef.current?.children[activeVariant] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeVariant]);

  return (
    <div>
      {/* Horizontal strip — each card expands in-place. overflow-x-hidden on the expanded
          section (no touch-action set) lets the browser pass horizontal swipes up to this
          outer scroll container naturally, while vertical swipes scroll the stop list. */}
      <div className="overflow-x-auto overscroll-contain scrollbar-none">
        <div ref={stripRef} className="flex gap-1.5 px-2 pb-2 pt-1">
          {variants.map((v, i) => {
            const vp = v.plan;
            const label = getVariantLabel(v, variants);
            const active = i === activeVariant;
            const h = Math.floor(vp.totalMinutes / 60);
            const m = vp.totalMinutes % 60;
            const title = label
              ? tTrip(`variant.${label.key}`)
              : `${tTrip("route_label")} ${String.fromCharCode(65 + i)}`;
            const titleColor =
              label?.color === "accent"
                ? "text-primary"
                : label?.color === "green"
                  ? "text-green-400"
                  : label?.color === "yellow"
                    ? "text-yellow-400"
                    : "text-foreground";

            return (
              <div
                key={v.id}
                className={`flex w-[min(68vw,240px)] shrink-0 flex-col rounded-xl border transition-colors ${
                  active ? "border-primary/50 bg-primary/5" : "border-border"
                }`}
              >
                {/* Card — tap anywhere to select this route on the map */}
                <button
                  onClick={() => setActiveVariant(i)}
                  className="flex w-full flex-col gap-0 px-2.5 py-1.5 text-left"
                >
                  {variants.length > 1 && (
                    <p className={`truncate text-2xs font-semibold uppercase tracking-wide ${titleColor}`}>
                      {title}
                    </p>
                  )}
                  <p className="text-xs font-semibold tabular-nums text-foreground">
                    {h}h {m}m
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    {Math.round(vp.totalDistanceKm)} km · {stopsLabel(vp.stops.length, tTrip)}{" "}
                    · <span className="font-semibold text-green-400 tabular-nums">{fromEUR(vp.tripEnergyCostEur)}</span>
                  </p>
                </button>

                {/* Expanded details — overflow-x-hidden means no horizontal overflow here,
                    so horizontal swipes propagate to the outer scroll automatically. */}
                {variantsExpanded && (
                  <div className="max-h-[40vh] overflow-x-hidden overflow-y-auto overscroll-contain space-y-2 border-t border-border/40 px-2.5 pb-2.5 pt-2">
                    {vp.feasible === false ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-amber-400">{tTrip("infeasible_title")}</p>
                            {active && (
                          <button
                            onClick={onShareRoute}
                            className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Share2 className="size-3.5" />
                            {tTrip("share_route_btn")}
                          </button>
                        )}

                        {active && (
                          <button
                            onClick={onSaveRoute}
                            disabled={routeSaved || savingRoute}
                            className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-70"
                          >
                            {savingRoute ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : routeSaved ? (
                              <CheckCircle2 className="size-3.5 text-green-400" />
                            ) : (
                              <Bookmark className="size-3.5" />
                            )}
                            {routeSaved ? tTrip("saved_route_saved") : tTrip("save_route_btn")}
                          </button>
                        )}

                        {vp.warning && (
                              <p className="text-2xs text-amber-400/80">{vp.warning}</p>
                            )}
                            <p className="text-2xs text-amber-500/70">{tTrip("infeasible_hint")}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <CostSummary
                          origin={originShort}
                          destination={destinationShort}
                          totalDistanceKm={vp.totalDistanceKm}
                          drivingMinutes={vp.drivingMinutes}
                          chargingMinutes={vp.chargingMinutes}
                          tripEnergyKwh={vp.tripEnergyKwh}
                          tripEnergyCostEur={vp.tripEnergyCostEur}
                          stopsCount={vp.stops.length}
                          approxRoute={vp.approxRoute}
                        />

                        {active && canShare && (
                          <button
                            onClick={onShareToTesla}
                            disabled={sharing}
                            className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                          >
                            {sharing ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Send className="size-3.5" />
                            )}
                            {tTrip("share_to_tesla")}
                          </button>
                        )}

                        {active && (
                          <button
                            onClick={onShareRoute}
                            className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Share2 className="size-3.5" />
                            {tTrip("share_route_btn")}
                          </button>
                        )}

                        {active && (
                          <button
                            onClick={onSaveRoute}
                            disabled={routeSaved || savingRoute}
                            className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-70"
                          >
                            {savingRoute ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : routeSaved ? (
                              <CheckCircle2 className="size-3.5 text-green-400" />
                            ) : (
                              <Bookmark className="size-3.5" />
                            )}
                            {routeSaved ? tTrip("saved_route_saved") : tTrip("save_route_btn")}
                          </button>
                        )}

                        {vp.warning && (
                          <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-2xs text-amber-400">
                            <AlertCircle className="size-3 shrink-0" />
                            {vp.warning}
                          </div>
                        )}

                        {vp.stops.length > 0 ? (
                          <div className="space-y-1">
                            {vp.stops.map((stop, si) => (
                              <StopCard
                                key={si}
                                stop={stop}
                                index={si}
                                preconditioned={
                                  // Every stop, not just the first. The command
                                  // is sent for the route as a whole
                                  // (routeNeedsPreconditioning checks all
                                  // stops), so pinning the badge to si === 0
                                  // left stops 2+ that WERE preconditioned
                                  // showing the amber "manual" badge.
                                  sharedRoute &&
                                  active &&
                                  needsPreconditioning(stop.station.maxKw) &&
                                  !isTeslaOwnNetwork({ networkId: stop.station.networkId })
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                            {tTrip("no_stops")}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {plan.deratingPct < 0 && (
        <p className="px-3 pb-2 text-2xs text-muted-foreground">
          {tTrip("derate_note", { pct: Math.abs(plan.deratingPct) })}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlanResults — results-only section (used in the desktop sidebar)
// ---------------------------------------------------------------------------

interface PlanResultsProps {
  plan: {
    deratingPct: number;
  };
  activePlan: TripPlan;
  variants: TripVariant[];
  activeVariant: number;
  setActiveVariant: (i: number) => void;
  canShare: boolean;
  sharing: boolean;
  sharedRoute: boolean;
  onShareToTesla: () => void;
  onShareRoute: () => void;
  onSaveRoute: () => void;
  routeSaved: boolean;
  savingRoute: boolean;
  onOpenSavedRoutes: () => void;
  onClearPlan: () => void;
  onManualPrecondition: () => void;
  preconditioningManually: boolean;
  hasTesla: boolean;
  originShort: string;
  destinationShort: string;
  tTrip: ReturnType<typeof useTranslations>;
}

function PlanResults({
  plan,
  activePlan,
  variants,
  activeVariant,
  setActiveVariant,
  canShare,
  sharing,
  sharedRoute,
  onShareToTesla,
  onShareRoute,
  onSaveRoute,
  routeSaved,
  savingRoute,
  onOpenSavedRoutes,
  onClearPlan,
  onManualPrecondition,
  preconditioningManually,
  hasTesla,
  originShort,
  destinationShort,
  tTrip,
}: PlanResultsProps) {
  return (
    <div className="space-y-3 pt-1">
      {variants.length > 1 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
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

          <div className="flex gap-2">
            <button
              onClick={onOpenSavedRoutes}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Bookmark className="size-4" />
              {tTrip("saved_routes_title")}
            </button>
            <button
              onClick={onClearPlan}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-border text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
              {tTrip("clear_plan")}
            </button>
          </div>

          <button
            onClick={onShareRoute}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Share2 className="size-4" />
            {tTrip("share_route_btn")}
          </button>

          <button
            onClick={onSaveRoute}
            disabled={routeSaved || savingRoute}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-70"
          >
            {savingRoute ? (
              <Loader2 className="size-4 animate-spin" />
            ) : routeSaved ? (
              <CheckCircle2 className="size-4 text-green-400" />
            ) : (
              <Bookmark className="size-4" />
            )}
            {routeSaved ? tTrip("saved_route_saved") : tTrip("save_route_btn")}
          </button>

          {hasTesla && (
            <button
              onClick={onManualPrecondition}
              disabled={preconditioningManually}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {preconditioningManually ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Zap className="size-4" />
              )}
              {tTrip("precondition_btn_manual")}
            </button>
          )}

          <button
            onClick={onShareRoute}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Share2 className="size-4" />
            {tTrip("share_route_btn")}
          </button>

          <button
            onClick={onSaveRoute}
            disabled={routeSaved || savingRoute}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-70"
          >
            {routeSaved ? (
              <CheckCircle2 className="size-4 text-green-400" />
            ) : (
              <Bookmark className="size-4" />
            )}
            {routeSaved ? tTrip("saved_route_saved") : tTrip("save_route_btn")}
          </button>

          {hasTesla && (
            <button
              onClick={onManualPrecondition}
              disabled={preconditioningManually}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {preconditioningManually ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Zap className="size-4" />
              )}
              {tTrip("precondition_btn_manual")}
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
                    // All stops — see the note on the other StopCard.
                    sharedRoute &&
                    needsPreconditioning(stop.station.maxKw) &&
                    !isTeslaOwnNetwork({ networkId: stop.station.networkId })
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
  );
}

// ---------------------------------------------------------------------------
// PlanContent — full form + results (desktop sidebar only)
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
  assumedModel: string;
  setAssumedModel: (v: string) => void;
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
  onShareRoute: () => void;
  onSaveRoute: () => void;
  routeSaved: boolean;
  savingRoute: boolean;
  onOpenSavedRoutes: () => void;
  onClearPlan: () => void;
  onManualPrecondition: () => void;
  preconditioningManually: boolean;
  hasTesla: boolean;
  originShort: string;
  destinationShort: string;
  tTrip: ReturnType<typeof useTranslations>;
}

function PlanContent({
  vehicles,
  vehicleId,
  setVehicleId,
  assumedModel,
  setAssumedModel,
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
  onShareRoute,
  onSaveRoute,
  routeSaved,
  savingRoute,
  onOpenSavedRoutes,
  onClearPlan,
  onManualPrecondition,
  preconditioningManually,
  hasTesla,
  originShort,
  destinationShort,
  tTrip,
}: PlanContentProps) {
  return (
    <div className="space-y-3">
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

      <GeocodingSearch
        placeholder={tTrip("destination_placeholder")}
        value={destination}
        onChange={setDestination}
        bias={destinationBias}
      />

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
            className="mt-1 h-1 w-full appearance-none rounded-full bg-muted [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
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
            className="mt-1 h-1 w-full appearance-none rounded-full bg-muted [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{tTrip("vehicle_label")}</label>
        {/* Rendered even with an empty garage: without a vehicle the planner
            still needs to know which model to assume, and the block used to
            disappear entirely — leaving no way to say. */}
        {!vehicleId && (
          <div className="relative mb-1.5">
            <select
              value={assumedModel}
              onChange={(e) => setAssumedModel(e.target.value)}
              aria-label={tTrip("assumed_model_label")}
              className="auth-input w-full appearance-none pr-5"
            >
              {PLANNABLE_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
          </div>
        )}
      </div>

      {vehicles.length > 0 && (
        <div>
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
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
          </div>
        </div>
      )}

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

      {plan && activePlan && (
        <div className="space-y-3 border-t border-border pt-3">
          <PlanResults
            plan={plan}
            activePlan={activePlan}
            variants={variants}
            activeVariant={activeVariant}
            setActiveVariant={setActiveVariant}
            canShare={canShare}
            sharing={sharing}
            sharedRoute={sharedRoute}
            onShareToTesla={onShareToTesla}
            onShareRoute={onShareRoute}
            onSaveRoute={onSaveRoute}
            routeSaved={routeSaved}
            savingRoute={savingRoute}
            onOpenSavedRoutes={onOpenSavedRoutes}
            onClearPlan={onClearPlan}
            onManualPrecondition={onManualPrecondition}
            preconditioningManually={preconditioningManually}
            hasTesla={hasTesla}
            originShort={originShort}
            destinationShort={destinationShort}
            tTrip={tTrip}
          />
        </div>
      )}
    </div>
  );
}
