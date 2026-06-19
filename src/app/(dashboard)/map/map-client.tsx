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
  Pencil,
  Zap,
  Send,
  List,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
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
  const [exploreCenter, setExploreCenter] = useState({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [exploreUserLoc, setExploreUserLoc] = useState<{ lat: number; lng: number } | null>(null);
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Plan-mode form collapse: true = full form, false = compact "A → B" summary
  // bar (set after a plan is computed so the map and routes stay visible).
  const [editingRoute, setEditingRoute] = useState(true);
  // Whether all route variant cards are expanded simultaneously for comparison.
  // Collapsed by default so the map stays visible; one chevron tap opens all.
  const [variantsExpanded, setVariantsExpanded] = useState(false);

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
      setSheetState("mid");
      // Collapse the form to a slim "A → B" bar so the route is visible.
      setEditingRoute(false);
      setVariantsExpanded(false);
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
    if (next === "plan") setEditingRoute(plan === null);
  }

  function openStationList() {
    setSheetState("mid");
    setStationListOpen(true);
  }

  // The bottom sheet is explore-only and opt-in: plan results live in the
  // top-card route accordion, and the station list opens only on request so
  // the map stays uncluttered.
  const showSheet = mode === "explore" && stationListOpen && stations.length > 0;
  const showListPill = mode === "explore" && !stationListOpen && stations.length > 0;

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

      {/* LAYER 2: Mobile Top Card (Waze/ABRP pattern)
          Replaces the old floating filter button + pills + collapsed bottom card.
          Single control surface at the top: mode tabs + mode-specific controls.
          No overflow-hidden so GeocodingSearch dropdowns extend below the card. */}
      <div
        className="absolute inset-x-3 z-[1000] lg:hidden"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <div className="rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur-xl">
          {/* Mode tabs — compact */}
          <div className="p-1">
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

          {/* Plan — planned: slim "A → B" bar + per-variant expandable routes.
              No bottom sheet; tapping a route reveals its stops inline. */}
          {mode === "plan" && !editingRoute && plan && activePlan && (
            <div className="border-t border-border/40">
              <button
                onClick={() => setEditingRoute(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <Navigation className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-foreground">
                  <span className="truncate">{originShort}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{destinationShort}</span>
                </span>
                <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
              </button>

              <RouteAccordion
                plan={plan}
                variants={variants}
                activeVariant={activeVariant}
                setActiveVariant={setActiveVariant}
                variantsExpanded={variantsExpanded}
                setVariantsExpanded={setVariantsExpanded}
                canShare={canShare}
                sharing={sharing}
                sharedRoute={sharedRoute}
                onShareToTesla={handleShareToTesla}
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
                  {(vehicles?.length ?? 0) > 0 && (
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        {tTrip("vehicle_label")}
                      </label>
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
                <span className="text-xs font-medium text-muted-foreground">
                  {isFetching
                    ? tCharging("updating", { count: stations.length })
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
        {showListPill && (
          <motion.button
            key="list-pill"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={openStationList}
            className="absolute bottom-[calc(env(safe-area-inset-bottom)+84px)] left-1/2 z-[900] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-2 text-xs font-semibold text-foreground shadow-xl backdrop-blur-xl lg:hidden"
          >
            <List className="size-3.5 text-primary" />
            {tCharging("stations_count", { count: stations.length })}
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
  hideHeader?: boolean;
}

function ExploreContent({ stations, isFetching, onStationSelect, tCharging, tMap, hideHeader }: ExploreContentProps) {
  const list = stations.slice(0, 50);

  return (
    <div className="space-y-2.5 pt-1">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <span className={SECTION_TITLE}>
            {isFetching
              ? tCharging("updating", { count: stations.length })
              : tCharging("stations_count", { count: stations.length })}
          </span>
        </div>
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
  setVariantsExpanded: (v: boolean) => void;
  canShare: boolean;
  sharing: boolean;
  sharedRoute: boolean;
  onShareToTesla: () => void;
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
  setVariantsExpanded,
  canShare,
  sharing,
  sharedRoute,
  onShareToTesla,
  originShort,
  destinationShort,
  fromEUR,
  tTrip,
}: RouteAccordionProps) {
  const single = variants.length <= 1;

  return (
    <div>
      {/* Horizontal scroll strip — swipe to browse, tap any chevron to expand ALL for comparison */}
      <div className="overflow-x-auto overscroll-contain scrollbar-none">
        <div className="flex gap-1.5 px-2 pb-2 pt-1">
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
                {/* Header — tap body = select route on map, tap chevron = expand/collapse ALL */}
                <div className="flex items-start gap-0.5 px-2.5 py-1.5">
                  <button
                    onClick={() => {
                      setActiveVariant(i);
                      if (single) setVariantsExpanded(!variantsExpanded);
                    }}
                    className="flex min-w-0 flex-1 flex-col gap-0 text-left"
                  >
                    {!single && (
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
                  <button
                    onClick={() => setVariantsExpanded(!variantsExpanded)}
                    aria-expanded={variantsExpanded}
                    aria-label={title}
                    className="-mr-0.5 mt-0.5 shrink-0 p-1 text-muted-foreground active:text-foreground"
                  >
                    <ChevronDown
                      className={`size-3.5 transition-transform ${variantsExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>

                {/* Expanded details — same state for all cards so you can compare while swiping */}
                {variantsExpanded && (
                  <div className="max-h-[40vh] space-y-2 overflow-y-auto overscroll-contain border-t border-border/40 px-2.5 pb-2.5 pt-2 [touch-action:pan-y]">
                    {vp.feasible === false ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-amber-400">
                              {tTrip("infeasible_title")}
                            </p>
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
                                  sharedRoute &&
                                  active &&
                                  si === 0 &&
                                  needsPreconditioning(stop.station.maxKw) &&
                                  !isSuperchargerNetwork(stop.station.networkId)
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
            originShort={originShort}
            destinationShort={destinationShort}
            tTrip={tTrip}
          />
        </div>
      )}
    </div>
  );
}
