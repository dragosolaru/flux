"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { motion, useAnimation } from "framer-motion";
import { toast } from "sonner";

import { GeocodingSearch, type GeoPoint } from "@/components/trip/GeocodingSearch";
import { StopCard, needsPreconditioning, isSuperchargerNetwork } from "@/components/trip/StopCard";
import { CostSummary } from "@/components/trip/CostSummary";
import { StationDetailSheet } from "@/components/trip/StationDetailSheet";
import { ChargerDetailSheet } from "@/components/charging-map/ChargerDetailSheet";
import { apiFetch } from "@/lib/api-fetch";
import { useVehicles } from "@/hooks/useVehicles";
import type { TripPlan, TripVariant, ChargingStop } from "@/lib/external/routing/types";
import type { Charger, ConnectorType } from "@/lib/chargers/types";
import type { ViewportBBox } from "@/components/charging-map/StationMap";

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
// Bottom sheet snap points (px from bottom of screen)
// ---------------------------------------------------------------------------

const PEEK = 96;
function halfHeight() {
  return typeof window !== "undefined" ? Math.round(window.innerHeight * 0.45) : 400;
}
function fullHeight() {
  return typeof window !== "undefined" ? Math.round(window.innerHeight * 0.88) : 700;
}

// Convert snap height → y offset (0 = fully open = sheet bottom at FULL height)
function snapToY(snapH: number, fullH: number): number {
  return fullH - snapH;
}

// ---------------------------------------------------------------------------
// Trip helper
// ---------------------------------------------------------------------------

interface NominatimReverseResult {
  display_name: string;
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": "Flux-MapScreen/1.0" } });
  if (!res.ok) throw new Error("reverse geocode failed");
  const data = (await res.json()) as NominatimReverseResult;
  return data.display_name;
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

const DEFAULT_LAT = 44.4268;
const DEFAULT_LNG = 26.1025;
const DEFAULT_BBOX: ViewportBBox = {
  minLat: DEFAULT_LAT - 0.5,
  minLng: DEFAULT_LNG - 0.7,
  maxLat: DEFAULT_LAT + 0.5,
  maxLng: DEFAULT_LNG + 0.7,
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

  const searchParams = useSearchParams();
  const initialMode: MapMode = searchParams.get("mode") === "plan" ? "plan" : "explore";
  const [mode, setMode] = useState<MapMode>(initialMode);

  // ---- Bottom sheet state ----
  // fullH is initialized lazily from window so it reflects the real viewport
  // on first render (client-only). The lazy initializer runs once on mount.
  const [fullH] = useState(() => fullHeight());

  // Drag tracking refs (not used in render, safe as refs)
  const dragStartY = useRef(0);
  const dragStartSheetY = useRef(0);
  const currentSheetY = useRef(snapToY(PEEK, 700));

  // Track current snap height for content rendering
  const [snapH, setSnapH] = useState(PEEK);

  const controls = useAnimation();

  const snapTo = useCallback(
    (targetH: number, fh: number) => {
      const y = snapToY(targetH, fh);
      currentSheetY.current = y;
      setSnapH(targetH);
      void controls.start({ y }, { type: "spring", stiffness: 350, damping: 40 });
    },
    [controls],
  );

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    dragStartY.current = e.clientY;
    dragStartSheetY.current = currentSheetY.current;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!(e.buttons & 1)) return;
    const delta = e.clientY - dragStartY.current;
    const newY = Math.max(0, Math.min(dragStartSheetY.current + delta, snapToY(PEEK, fullH)));
    currentSheetY.current = newY;
    void controls.set({ y: newY });
  }

  function onDragEnd() {
    const currentH = fullH - currentSheetY.current;
    const snaps = [PEEK, halfHeight(), fullH];
    const nearest = snaps.reduce((best, h) =>
      Math.abs(h - currentH) < Math.abs(best - currentH) ? h : best,
    );
    snapTo(nearest, fullH);
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
      // Expand sheet to FULL to show results
      snapTo(fullH, fullH);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : tTrip("infeasible_hint"));
    } finally {
      setLoading(false);
    }
  }

  const variants = plan?.variants ?? [];
  const activePlan = variants[activeVariant]?.plan ?? plan?.plan ?? null;

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

  // ---- Mode switch ----
  function switchMode(next: MapMode) {
    setMode(next);
    snapTo(PEEK, fullH);
  }

  // ---- Render ----
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* LAYER 1: Full-screen map */}
      <div className="absolute inset-0">
        {mode === "plan" ? (
          <TripMap
            origin={origin}
            destination={destination}
            stops={tripStops}
            polyline={activePlan?.polyline ?? null}
            className="h-full w-full"
            onStationSelect={setSelectedStop}
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

      {/* LAYER 2: Floating top controls (explore mode filters) */}
      {mode === "explore" && (
        <div className="absolute left-3 top-3 z-[1000]">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-sm font-medium shadow-xl backdrop-blur-xl transition-colors ${
              hasActiveFilter
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-white/10 bg-background/80 text-muted-foreground"
            }`}
          >
            <SlidersHorizontal className="size-3.5" />
            {showFilters ? tCharging("hide_filters") : tCharging("show_filters")}
            {hasActiveFilter && <span className="size-1.5 rounded-full bg-primary" />}
          </button>
        </div>
      )}

      {mode === "explore" && showFilters && (
        <div className="absolute left-3 right-3 top-16 z-[1000] space-y-1.5">
          <div className="flex min-h-[44px] items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-background/80 px-3 py-2 shadow-xl backdrop-blur-xl scrollbar-none">
            {POWER_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setMinKw(opt.value)}
                aria-pressed={minKw === opt.value}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  minKw === opt.value
                    ? "border-primary bg-primary/10 font-semibold text-foreground"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                }`}
              >
                {opt.label === "filter_all" ? tCharging("filter_all") : opt.label}
              </button>
            ))}
          </div>
          <div className="flex min-h-[44px] items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-background/80 px-3 py-2 shadow-xl backdrop-blur-xl scrollbar-none">
            {CONNECTOR_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setConnector(opt.value)}
                aria-pressed={connector === opt.value}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  connector === opt.value
                    ? "border-primary bg-primary/10 font-semibold text-foreground"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                }`}
              >
                {opt.label === "filter_all" ? tCharging("filter_all") : opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* LAYER 3: Bottom sheet */}
      <motion.div
        animate={controls}
        initial={{ y: snapToY(PEEK, fullH) }}
        className="absolute inset-x-0 bottom-0 z-[900] mx-auto w-full max-w-[480px] rounded-t-2xl border-t border-white/10 bg-background/90 shadow-2xl backdrop-blur-2xl"
        style={{ height: `${fullH}px` }}
      >
        {/* Drag handle area */}
        <div
          className="cursor-grab touch-none select-none pt-2.5"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />

          {/* Mode tabs */}
          <div className="mt-3 flex gap-1 px-4 pb-3">
            <button
              onClick={() => switchMode("explore")}
              className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                mode === "explore"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              {tMap("tab_explore")}
            </button>
            <button
              onClick={() => switchMode("plan")}
              className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                mode === "plan"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              {tMap("tab_plan")}
            </button>
          </div>
        </div>

        {/* Sheet content — only rendered when sheet is at HALF or FULL */}
        {snapH > PEEK && (
          <div className="overflow-y-auto px-4 pb-6" style={{ height: `${snapH - 96}px` }}>
            {mode === "explore" ? (
              <ExploreContent
                stations={stations}
                isFetching={isFetching}
                snapH={snapH}
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
                snapH={snapH}
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
  snapH: number;
  onStationSelect: (s: Charger) => void;
  tCharging: ReturnType<typeof useTranslations>;
  tMap: ReturnType<typeof useTranslations>;
}

function ExploreContent({ stations, isFetching, snapH, onStationSelect, tCharging, tMap }: ExploreContentProps) {
  const halfH = halfHeight();

  return (
    <div className="space-y-3">
      {/* Station count badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {isFetching
            ? tCharging("updating", { count: stations.length })
            : tCharging("stations_count", { count: stations.length })}
        </span>
      </div>

      {/* Station list — only in FULL snap */}
      {snapH >= halfH && stations.length === 0 && !isFetching && (
        <p className="py-6 text-center text-sm text-muted-foreground">{tMap("no_stations")}</p>
      )}

      {snapH >= halfH &&
        stations.slice(0, 50).map((s) => (
          <button
            key={s.id}
            onClick={() => onStationSelect(s)}
            className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white/10"
          >
            <div
              className="size-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor:
                  s.availability === "operational"
                    ? "#22c55e"
                    : s.availability === "offline"
                      ? "#f87171"
                      : "#9ca3af",
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {s.name ?? s.operator ?? tCharging("station_fallback")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {s.maxPowerKw != null ? `${s.maxPowerKw} kW` : tCharging("unknown_power")}
                {s.address.city ? ` · ${s.address.city}` : ""}
              </p>
            </div>
            <ChevronUp className="size-3.5 shrink-0 rotate-90 text-muted-foreground" />
          </button>
        ))}
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
  snapH: number;
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
      />

      {/* Destination */}
      <GeocodingSearch
        placeholder={tTrip("destination_placeholder")}
        value={destination}
        onChange={setDestination}
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
            className="mt-1 w-full accent-primary"
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
            className="mt-1 w-full accent-primary"
          />
        </div>
      </div>

      {/* Vehicle picker */}
      {vehicles.length > 0 && (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{tTrip("vehicle_label")}</label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm backdrop-blur-sm"
          >
            <option value="">{tTrip("vehicle_default")}</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nickname ?? v.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Plan button */}
      <button
        onClick={onPlan}
        disabled={!canPlan || loading}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary/90 text-sm font-semibold text-primary-foreground disabled:opacity-50"
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
        <div className="space-y-3 border-t border-white/8 pt-3">
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
                        : "border-white/10 bg-white/5 hover:bg-white/10"
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
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-foreground transition-colors hover:bg-white/10 disabled:opacity-50"
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
