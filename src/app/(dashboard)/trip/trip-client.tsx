"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Route, Loader2, AlertCircle, Navigation, Pencil, AlertTriangle, ChevronUp, ChevronDown, Send, SlidersHorizontal, Clock, X, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

import { GeocodingSearch, type GeoPoint } from "@/components/trip/GeocodingSearch";
import { StopCard, needsPreconditioning, isSuperchargerNetwork } from "@/components/trip/StopCard";
import { StationDetailSheet } from "@/components/trip/StationDetailSheet";
import { DesktopSidebar, StatStrip, type Stat } from "@/components/map/map-ui";
import * as chargersApi from "@/lib/api/chargers";
import * as tripApi from "@/lib/api/trip";
import * as vehiclesApi from "@/lib/api/vehicles";
import { useCurrency } from "@/hooks/useCurrency";
import { useVehicles } from "@/hooks/useVehicles";
import { slideUp } from "@/lib/animations/variants";
import type { TripPlan, TripVariant, ChargingStop } from "@/lib/external/routing/types";

const TripMap = dynamic(() => import("@/components/trip/TripMap"), { ssr: false });

type Translator = ReturnType<typeof useTranslations>;

interface TripResponse {
  plan: TripPlan;
  variants: TripVariant[];
  vehicle: { id: string; displayName: string; brand: string; model: string | null } | null;
  deratingPct: number;
}

interface NominatimReverseResult {
  display_name: string;
}

interface RecentDestination {
  lat: number;
  lng: number;
  label: string;
}

interface Vehicle {
  id: string;
  nickname: string | null;
  displayName: string;
}

const RECENT_KEY = "flux_recent_destinations";
const RECENT_MAX = 5;

function getRecentDestinations(): RecentDestination[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentDestination[];
  } catch {
    return [];
  }
}

function addRecentDestination(coord: RecentDestination): void {
  const existing = getRecentDestinations().filter(
    (r) => r.lat !== coord.lat || r.lng !== coord.lng,
  );
  const next = [coord, ...existing].slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function removeRecentDestination(index: number): void {
  const existing = getRecentDestinations();
  existing.splice(index, 1);
  localStorage.setItem(RECENT_KEY, JSON.stringify(existing));
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Flux-TripPlanner/1.0" },
  });
  if (!res.ok) throw new Error("reverse geocode failed");
  const data = await res.json() as NominatimReverseResult;
  return data.display_name;
}

interface VariantLabel {
  key: "fastest" | "fewest_stops" | "cheapest";
  color: "accent" | "green" | "yellow";
}

function getVariantLabel(variant: TripVariant, allVariants: TripVariant[]): VariantLabel | null {
  if (allVariants.length < 2) return null;

  const allMinutes = allVariants.map((v) => v.plan.totalMinutes);
  const allStops  = allVariants.map((v) => v.plan.stops.length);
  const allCosts  = allVariants.map((v) => v.plan.tripEnergyCostEur);

  // Only award a label when this variant is strictly better than at least one
  // other — never when all variants tie (e.g. every route has 2 stops would
  // give every chip "Fewest stops").
  const winsUniquely = (arr: number[], val: number) => {
    const min = Math.min(...arr);
    return val === min && arr.filter((x) => x === min).length < arr.length;
  };

  if (winsUniquely(allMinutes, variant.plan.totalMinutes)) return { key: "fastest",      color: "accent" };
  if (winsUniquely(allStops,   variant.plan.stops.length)) return { key: "fewest_stops", color: "green"  };
  if (winsUniquely(allCosts,   variant.plan.tripEnergyCostEur)) return { key: "cheapest", color: "yellow" };
  return null;
}

export function TripClient() {
  const t = useTranslations("trip");
  const tc = useTranslations("common");
  const { fromEUR } = useCurrency();
  const { data: vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState<string>("");
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [startSoc, setStartSoc] = useState(80);
  const [arrivalSoc, setArrivalSoc] = useState(10);
  const [plan, setPlan] = useState<TripResponse | null>(null);
  const [activeVariant, setActiveVariant] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formCollapsed, setFormCollapsed] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(true);
  const [locating, setLocating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharedRoute, setSharedRoute] = useState(false);
  const [selectedStop, setSelectedStop] = useState<ChargingStop | null>(null);
  const [destFocused, setDestFocused] = useState(false);
  const [recents, setRecents] = useState<RecentDestination[]>(getRecentDestinations);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  // Silent locate so geocode searches can be biased toward the user even
  // before they tap "use my location" — failures are fine, bias is optional.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { timeout: 3000 },
    );
  }, []);

  const showRecents = destFocused && destination === null && recents.length > 0;

  const canPlan = origin !== null && destination !== null;

  // Geocode bias: origin searches favor results near the user; destination
  // searches favor the chosen origin (travel direction) when available.
  const destinationBias = origin ? { lat: origin.lat, lng: origin.lng } : userLoc;

  function handleLocateOrigin() {
    if (!navigator.geolocation) {
      toast.error(t("use_my_location"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLoc({ lat, lng });
          const name = await reverseGeocode(lat, lng);
          setOrigin({ name, lat, lng });
        } catch {
          toast.error(t("use_my_location"));
        } finally {
          setLocating(false);
        }
      },
      () => {
        toast.error(t("use_my_location"));
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }

  const handleDestinationChange = useCallback((point: GeoPoint | null) => {
    setDestination(point);
  }, []);

  async function handlePlan() {
    if (!canPlan) return;
    setLoading(true);
    setError(null);
    try {
      const result = await tripApi.plan<TripResponse>({
        ...(vehicleId ? { vehicleId } : {}),
        origin: { lat: origin.lat, lng: origin.lng, label: origin.name },
        startSoc,
        arrivalSocPct: arrivalSoc,
        destination: { lat: destination.lat, lng: destination.lng, label: destination.name },
      });
      addRecentDestination({ lat: destination.lat, lng: destination.lng, label: destination.name });
      setRecents(getRecentDestinations());
      setPlan(result);
      setActiveVariant(0);
      setSharedRoute(false);
      setFormCollapsed(true);
      setPlanExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("infeasible_hint"));
    } finally {
      setLoading(false);
    }
  }

  const variants = useMemo(() => plan?.variants ?? [], [plan]);
  const activePlan = variants[activeVariant]?.plan ?? plan?.plan ?? null;

  // One drawable line per variant road; the active one renders prominently and
  // the rest are subtle + tappable to switch variants directly on the map.
  const routeLines = useMemo(
    () =>
      variants
        .map((v, i) => ({
          index: i,
          coordinates: v.plan.polyline?.coordinates ?? [],
          active: i === activeVariant,
        }))
        .filter((r) => r.coordinates.length >= 2),
    [variants, activeVariant],
  );

  // Bounding box around the planned route, for the context-station layer. Padded
  // so chargers slightly off the corridor still show. Rounded to keep the query
  // key stable across re-renders.
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

  // All chargers near the corridor — same platform endpoint the station map uses.
  const { data: nearbyStations = [] } = useQuery({
    queryKey: ["trip-corridor-chargers", routeBBox],
    queryFn: () => chargersApi.inBBox(routeBBox!, { limit: 1000 }),
    enabled: routeBBox !== null && plan !== null,
    staleTime: 300_000,
  });

  // Target Tesla for "Send to Tesla": the planned vehicle if it's a Tesla,
  // otherwise the first Tesla in the garage — so the button shows even when the
  // trip was planned without picking a vehicle (the common case).
  const teslaVehicle = useMemo(() => {
    if (plan?.vehicle && plan.vehicle.brand === "tesla") {
      return { id: plan.vehicle.id, displayName: plan.vehicle.displayName };
    }
    const v = (vehicles ?? []).find((x) => x.brand === "tesla");
    return v ? { id: v.id, displayName: v.nickname ?? v.displayName } : null;
  }, [plan, vehicles]);
  const canShare =
    teslaVehicle !== null && activePlan !== null && activePlan.feasible !== false;

  async function handleShareToTesla() {
    if (!teslaVehicle || !activePlan || !destination) return;
    setSharing(true);
    try {
      // First non-SC fast stop gets auto-preconditioning.
      const firstStop = activePlan.stops[0] ?? null;
      const willPrecondition =
        firstStop !== null &&
        needsPreconditioning(firstStop.station.maxKw) &&
        !isSuperchargerNetwork(firstStop.station.networkId);

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
      toast.success(willPrecondition ? t("share_success_preconditioned") : t("share_success"));
    } catch {
      toast.error(t("share_error"));
    } finally {
      setSharing(false);
    }
  }

  const stops = activePlan?.stops.map((s) => ({
    lat: s.station.lat,
    lng: s.station.lng,
    name: s.station.name,
    network: s.station.networkId,
    fullStop: s,
  })) ?? [];

  const originShort = origin?.name.split(",")[0] ?? "";
  const destinationShort = destination?.name.split(",")[0] ?? "";

  const formProps: TripPlannerFormProps = {
    t,
    tc,
    origin,
    destination,
    startSoc,
    arrivalSoc,
    vehicleId,
    vehicles: vehicles ?? [],
    loading,
    canPlan,
    error,
    locating,
    optionsOpen,
    showRecents,
    recents,
    userLoc,
    destinationBias,
    setOrigin,
    onDestinationChange: handleDestinationChange,
    setStartSoc,
    setArrivalSoc,
    setVehicleId,
    setOptionsOpen,
    setDestFocused,
    setRecents,
    onLocateOrigin: handleLocateOrigin,
    onPlan: handlePlan,
  };

  const resultsProps: TripResultsBodyProps | null =
    plan && activePlan
      ? {
          t,
          fromEUR,
          plan,
          activePlan,
          variants,
          activeVariant,
          setActiveVariant,
          canShare,
          sharing,
          sharedRoute,
          destinationShort,
          onShareToTesla: handleShareToTesla,
        }
      : null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* h-full fills the <main> content box exactly — flexbox already accounts
          for TopBar, the mock banner, the bottom nav, and safe-area insets, so
          we no longer hand-compute a fragile 100dvh height that ignored the
          mock banner and clipped the results sheet. */}
      {/* Full-screen map — offset by the sidebar on desktop */}
      <div className="absolute inset-0 lg:left-[380px] xl:left-[400px]">
        <TripMap
          origin={origin}
          destination={destination}
          stops={stops}
          polyline={activePlan?.polyline ?? null}
          className="h-full w-full"
          onStationSelect={setSelectedStop}
          nearbyStations={nearbyStations}
          routes={routeLines}
          onRouteSelect={setActiveVariant}
        />
      </div>

      {/* Search overlay — top left (mobile only) */}
      <div className="absolute left-3 top-3 z-[1000] w-80 max-w-[calc(100vw-1.5rem)] md:w-[420px] lg:hidden">
        {formCollapsed && plan ? (
          /* Compact pill summary */
          <button
            onClick={() => setFormCollapsed(false)}
            className="flex w-full items-center justify-between gap-2 rounded-2xl border border-border bg-card/90 p-3 shadow-2xl backdrop-blur-md"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Route className="size-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-medium">
                {originShort} → {destinationShort} · {startSoc}%
              </span>
            </div>
            <Pencil className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          /* Full form */
          <div className="rounded-2xl border border-border bg-card/90 p-3 shadow-2xl backdrop-blur-md">
            <TripPlannerForm {...formProps} />
          </div>
        )}
      </div>

      {/* Results panel — bottom slide-up, collapsible (mobile only) */}
      <AnimatePresence>
      {resultsProps && formCollapsed && (
        <motion.div
          variants={slideUp}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="absolute bottom-0 left-0 right-0 z-[1000] rounded-t-[20px] border-t border-border bg-card/95 shadow-2xl backdrop-blur-md before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-border lg:hidden"
        >
          {/* Handle — always visible, outside the collapsible area so scroll
              state never hides it. */}
          <div className="flex min-h-11 w-full items-center justify-between gap-2 px-4 pb-1 pt-2">
            <button
              onClick={() => setPlanExpanded((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-2"
              aria-expanded={planExpanded}
              aria-label={planExpanded ? t("see_map") : t("see_plan")}
            >
              {planExpanded ? (
                <>
                  <div className="mx-auto h-1 w-9 rounded-full bg-border transition-colors active:bg-muted-foreground/40" />
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </>
              ) : (
                <>
                  <span className="truncate text-sm font-medium text-foreground">
                    {originShort} → {destinationShort}
                    {activePlan!.totalDistanceKm > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {Math.round(activePlan!.totalDistanceKm)} km · {Math.floor(activePlan!.drivingMinutes / 60)}h {activePlan!.drivingMinutes % 60}min
                      </span>
                    )}
                  </span>
                  <ChevronUp className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
            {planExpanded && (
              <button
                onClick={() => setFormCollapsed(false)}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
              >
                {t("edit_btn")}
              </button>
            )}
          </div>

          {/* Collapsible content — framer-motion height, always scrollable */}
          <motion.div
            animate={{ height: planExpanded ? "auto" : 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="overflow-x-hidden"
            style={{ maxHeight: "calc(45dvh - 2.5rem)", overflowY: "auto" }}
          >
            <div className="px-4 pb-4 pt-1.5">
              <TripResultsBody {...resultsProps} />
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Desktop sidebar (lg+) — same content, always visible, no collapse */}
      <DesktopSidebar title={t("title")} icon={Route}>
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2 space-y-4 scrollbar-none">
          <TripPlannerForm {...formProps} />
          {resultsProps && (
            <div className="border-t border-border pt-4">
              <TripResultsBody {...resultsProps} />
            </div>
          )}
        </div>
      </DesktopSidebar>

      {selectedStop && (
        <StationDetailSheet
          stop={selectedStop}
          onClose={() => setSelectedStop(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TripPlannerForm — the origin/destination + options + plan body, shared by the
// mobile top-left overlay and the desktop sidebar.
// ---------------------------------------------------------------------------

interface TripPlannerFormProps {
  t: Translator;
  tc: Translator;
  origin: GeoPoint | null;
  destination: GeoPoint | null;
  startSoc: number;
  arrivalSoc: number;
  vehicleId: string;
  vehicles: Vehicle[];
  loading: boolean;
  canPlan: boolean;
  error: string | null;
  locating: boolean;
  optionsOpen: boolean;
  showRecents: boolean;
  recents: RecentDestination[];
  userLoc: { lat: number; lng: number } | null;
  destinationBias: { lat: number; lng: number } | null;
  setOrigin: (p: GeoPoint | null) => void;
  onDestinationChange: (p: GeoPoint | null) => void;
  setStartSoc: (v: number) => void;
  setArrivalSoc: (v: number) => void;
  setVehicleId: (v: string) => void;
  setOptionsOpen: (fn: (v: boolean) => boolean) => void;
  setDestFocused: (v: boolean) => void;
  setRecents: (v: RecentDestination[]) => void;
  onLocateOrigin: () => void;
  onPlan: () => void;
}

function TripPlannerForm({
  t,
  tc,
  origin,
  destination,
  startSoc,
  arrivalSoc,
  vehicleId,
  vehicles,
  loading,
  canPlan,
  error,
  locating,
  optionsOpen,
  showRecents,
  recents,
  userLoc,
  destinationBias,
  setOrigin,
  onDestinationChange,
  setStartSoc,
  setArrivalSoc,
  setVehicleId,
  setOptionsOpen,
  setDestFocused,
  setRecents,
  onLocateOrigin,
  onPlan,
}: TripPlannerFormProps) {
  return (
    <div className="space-y-2">
      <GeocodingSearch
        placeholder={t("origin_placeholder")}
        value={origin}
        onChange={setOrigin}
        icon={<Navigation className="size-4" />}
        onLocate={onLocateOrigin}
        locating={locating}
        locateTitle={locating ? t("locating") : t("use_my_location")}
        bias={userLoc}
      />

      <div className="relative">
        <GeocodingSearch
          placeholder={t("destination_placeholder")}
          value={destination}
          onChange={onDestinationChange}
          onFocus={() => setDestFocused(true)}
          onBlur={() => setTimeout(() => setDestFocused(false), 150)}
          bias={destinationBias}
        />

        {/* Recent destinations dropdown */}
        {showRecents && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-background shadow-lg">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("recents")}
              </span>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  recents.forEach((_, i) => removeRecentDestination(i));
                  setRecents([]);
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                {t("clear_recents")}
              </button>
            </div>
            {recents.map((r, i) => (
              <div key={i} className="flex items-center gap-1">
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onDestinationChange({ name: r.label, lat: r.lat, lng: r.lng });
                    setDestFocused(false);
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Clock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-1">{r.label}</span>
                </button>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    removeRecentDestination(i);
                    setRecents(getRecentDestinations());
                  }}
                  className="pr-3 text-muted-foreground hover:text-foreground"
                  aria-label={tc("remove")}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Options disclosure — battery + vehicle are secondary; keep the
          first interaction to just origin → destination → plan. */}
      <button
        type="button"
        onClick={() => setOptionsOpen((v) => !v)}
        aria-expanded={optionsOpen}
        className="flex min-h-[40px] w-full items-center justify-between rounded-lg px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="size-3.5" />
          {t("options")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">{startSoc}%</span>
          {optionsOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </span>
      </button>

      {optionsOpen && (
        <div className="space-y-2.5">
          {/* Starting battery slider */}
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("battery_label")}</span>
              <span className="font-medium text-foreground">{startSoc}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={startSoc}
              onChange={(e) => setStartSoc(Number(e.target.value))}
              className="soc-slider mt-1 w-full accent-primary"
            />
          </div>

          {/* Arrival SOC slider */}
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("arrival_soc")}</span>
              <span className="font-medium text-foreground">{arrivalSoc}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={5}
              value={arrivalSoc}
              onChange={(e) => setArrivalSoc(Number(e.target.value))}
              className="soc-slider mt-1 w-full accent-primary"
            />
          </div>

          {/* Vehicle selector */}
          {vehicles.length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("vehicle_label")}</label>
              <div className="relative">
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-border bg-card text-foreground px-3 py-1.5 pr-8 text-sm"
                >
                  <option value="">{t("vehicle_default")}</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nickname ?? v.displayName}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onPlan}
        disabled={!canPlan || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 transition-colors hover:bg-primary/90"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("planning")}
          </>
        ) : (
          <>
            <Route className="size-4" />
            {t("plan_btn")}
          </>
        )}
      </button>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TripResultsBody — variant chips + stat strip + share + stop list, shared by
// the mobile bottom panel and the desktop sidebar.
// ---------------------------------------------------------------------------

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

interface TripResultsBodyProps {
  t: Translator;
  fromEUR: (eur: number) => string;
  plan: TripResponse;
  activePlan: TripPlan;
  variants: TripVariant[];
  activeVariant: number;
  setActiveVariant: (i: number) => void;
  canShare: boolean;
  sharing: boolean;
  sharedRoute: boolean;
  destinationShort: string;
  onShareToTesla: () => void;
}

function TripResultsBody({
  t,
  fromEUR,
  plan,
  activePlan,
  variants,
  activeVariant,
  setActiveVariant,
  canShare,
  sharing,
  sharedRoute,
  destinationShort,
  onShareToTesla,
}: TripResultsBodyProps) {
  const stats: Stat[] = [
    { value: formatDuration(activePlan.totalMinutes), label: t("stat_time") },
    { value: `${Math.round(activePlan.totalDistanceKm)} km`, label: t("stat_distance") },
    { value: String(activePlan.stops.length), label: t("stat_stops") },
    { value: fromEUR(activePlan.tripEnergyCostEur), label: t("stat_cost"), accent: true },
  ];

  return (
    <div className="space-y-3">
      {/* Variant selector — alternative roads × charging strategies. Horizontal
          scroll rail on mobile; full-width stacked rows on desktop. */}
      {variants.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-x-visible lg:px-0">
          {variants.map((v, i) => {
            const h = Math.floor(v.plan.totalMinutes / 60);
            const m = v.plan.totalMinutes % 60;
            const active = i === activeVariant;
            const label = getVariantLabel(v, variants);
            // Chip title: semantic badge if available, otherwise route letter (A/B/C).
            // Avoids showing "Fastest" twice (once as strategy, once as badge) when
            // ORS returns two different roads that share the same charging strategy.
            const chipTitle = label
              ? t(`variant.${label.key}`)
              : `${t("route_label")} ${String.fromCharCode(65 + i)}`;
            return (
              <button
                key={v.id}
                onClick={() => setActiveVariant(i)}
                aria-pressed={active}
                className={`flex w-[150px] shrink-0 flex-col items-start rounded-xl border px-2.5 py-1.5 text-left transition-colors lg:w-full lg:flex-row lg:items-center lg:justify-between ${
                  active
                    ? "border-primary/50 bg-primary/15 text-foreground font-semibold"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className={`truncate text-xs font-semibold ${
                  label?.color === "accent" ? "text-primary"
                  : label?.color === "green" ? "text-green-400"
                  : label?.color === "yellow" ? "text-yellow-400"
                  : "text-foreground"
                }`}>{chipTitle}</span>
                <span className="text-sm font-semibold text-foreground lg:order-3">
                  {h}h {m}min
                </span>
                {/* Drive vs charge split + cost — the ABRP-style tradeoff
                    that makes variants comparable at a glance. */}
                <span className="text-[11px] text-muted-foreground lg:order-2 lg:flex-1 lg:px-2">
                  🚗 {Math.floor(v.plan.drivingMinutes / 60)}h {v.plan.drivingMinutes % 60}m
                  {v.plan.chargingMinutes > 0 && ` · ⚡ ${v.plan.chargingMinutes}m`}
                  {` · ${v.plan.stops.length === 0
                    ? t("stops_count_zero")
                    : v.plan.stops.length === 1
                      ? t("stops_count_one")
                      : t("stops_count_other", { count: v.plan.stops.length })}`}
                  {v.plan.tripEnergyCostEur > 0 && ` · ${fromEUR(v.plan.tripEnergyCostEur)}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {activePlan.feasible === false ? (
        /* Infeasible route — prominent error card */
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 backdrop-blur-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-amber-400">
                {t("infeasible_title")}
              </p>
              {activePlan.warning && (
                <p className="text-xs text-amber-400/80">{activePlan.warning}</p>
              )}
              <p className="text-xs text-amber-500/70">
                {t("infeasible_hint")}
              </p>
              {activePlan.totalDistanceKm > 0 && (
                <p className="text-xs text-muted-foreground">
                  {Math.round(activePlan.totalDistanceKm)} km ·{" "}
                  {Math.floor(activePlan.drivingMinutes / 60)}h {activePlan.drivingMinutes % 60}min
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Feasible route — normal result */
        <>
          <StatStrip stats={stats} />

          {canShare && (
            <AnimatePresence mode="wait">
              {sharedRoute ? (
                <motion.div
                  key="sent"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3"
                >
                  <CheckCircle2 className="size-5 shrink-0 text-green-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-green-400">{t("share_sent_title")}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t("share_sent_detail", { dest: destinationShort })}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="send"
                  whileTap={{ scale: 0.97 }}
                  onClick={onShareToTesla}
                  disabled={sharing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {sharing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {sharing ? t("sharing") : t("share_to_tesla")}
                  {!sharing && activePlan.stops.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold">
                      {activePlan.stops.length} ⚡
                    </span>
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          )}

          {activePlan.warning && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 backdrop-blur-sm">
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
            <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400 backdrop-blur-sm">
              {t("no_stops")}
            </div>
          )}
        </>
      )}

      {plan.deratingPct < 0 && (
        <p className="text-xs text-muted-foreground">
          {t("derate_note", { pct: Math.abs(plan.deratingPct) })}
        </p>
      )}
    </div>
  );
}
