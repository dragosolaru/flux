"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Route, Loader2, AlertCircle, Navigation, Pencil, AlertTriangle, ChevronUp, ChevronDown, Send, SlidersHorizontal, Clock, X, CheckCircle2, Bookmark, Trash2, Info, Zap } from "lucide-react";
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
import { apiFetch } from "@/lib/api-fetch";
import { useCurrency } from "@/hooks/useCurrency";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import {
  useSavedRoutes,
  useCreateSavedRoute,
  useRenameSavedRoute,
  useDeleteSavedRoute,
  type SavedRoute,
} from "@/hooks/useSavedRoutes";
import { slideUp } from "@/lib/animations/variants";
import type { TripPlan, TripVariant, ChargingStop } from "@/lib/external/routing/types";
import type { Charger } from "@/lib/chargers/types";

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

// Saved snapshots come back as untyped JSONB — a truncated or legacy-shaped
// blob must not crash the results panel, so validate the load-bearing arrays
// before trusting the cast. Returns null → caller falls back to just
// origin/destination (user can re-plan).
function parseSnapshot(raw: unknown): TripResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as { plan?: { stops?: unknown }; variants?: unknown };
  if (!Array.isArray(s.variants) || !Array.isArray(s.plan?.stops)) return null;
  // Validate the elements too, not just the containers: routeLines and the
  // variant chips dereference `v.plan` unguarded, so a variant missing it
  // throws during render and takes the whole page down — permanently, since
  // the bad blob is reloaded on every visit.
  const variantsOk = s.variants.every(
    (v) =>
      v != null &&
      typeof v === "object" &&
      Array.isArray((v as { plan?: { stops?: unknown } }).plan?.stops),
  );
  if (!variantsOk) return null;
  return raw as TripResponse;
}

// Snapshots are persisted as JSONB behind a 100 KB request cap. A planned
// TripResponse carries a full-geometry polyline per variant (OSRM is queried
// with overview=full), so storing it verbatim puts any real road trip far over
// the cap — a 1400 km route rejects with 413. Keep only the variant the user
// actually chose, and thin its polyline to an overview-quality line.
const SNAPSHOT_MAX_POINTS = 400;

function downsample(coords: [number, number][]): [number, number][] {
  if (coords.length <= SNAPSHOT_MAX_POINTS) return coords;
  const step = (coords.length - 1) / (SNAPSHOT_MAX_POINTS - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < SNAPSHOT_MAX_POINTS; i++) {
    out.push(coords[Math.round(i * step)]);
  }
  return out;
}

function compactSnapshot(response: TripResponse, variantIndex: number): TripResponse {
  const variant = response.variants[variantIndex] ?? response.variants[0] ?? null;
  const source = variant?.plan ?? response.plan;
  const slimPlan: TripPlan = {
    ...source,
    polyline: source.polyline
      ? { ...source.polyline, coordinates: downsample(source.polyline.coordinates) }
      : null,
  };
  return {
    ...response,
    plan: slimPlan,
    variants: variant ? [{ ...variant, plan: slimPlan }] : [],
  };
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
  const { selectedVehicleId } = useVehicleContext();
  const [vehicleId, setVehicleId] = useState<string>(() => selectedVehicleId ?? "");
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
  const [savedSheetOpen, setSavedSheetOpen] = useState(false);
  const [routeSaved, setRouteSaved] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [preconditioningManually, setPreconditioningManually] = useState(false);

  const { data: savedRoutes = [] } = useSavedRoutes();
  const createSavedRoute = useCreateSavedRoute();
  const deleteSavedRoute = useDeleteSavedRoute();

  // Silent locate so geocode searches can be biased toward the user even
  // before they tap "use my location" — but only when permission was already
  // granted, so page load never triggers the browser permission prompt.
  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (status.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => undefined,
          { timeout: 3000 },
        );
      })
      .catch(() => undefined);
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
      setRouteSaved(false);
      // Areas pulled in for the previous route are no longer "on the way".
      setExtraStations([]);
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

  // Areas the user long-pressed, plus whichever is in flight. Requesting an
  // area also warms it server-side: the read path ingests a cold bbox from every
  // source before answering, so this doubles as "go and find what is here".
  const [loadingArea, setLoadingArea] = useState<{ lat: number; lng: number } | null>(null);
  const [extraStations, setExtraStations] = useState<Charger[]>([]);
  // The caption teaches a gesture; once it has been used it is just clutter.
  const [areaHintSeen, setAreaHintSeen] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("flux_area_hint_seen") === "1",
  );

  const handleAreaRequest = useCallback(
    async (lat: number, lng: number) => {
      if (loadingArea) return; // one at a time — each can trigger a full ingest
      setLoadingArea({ lat, lng });
      try {
        // ~25 km around the press. Small enough to stay quick on a cold area,
        // big enough to be worth the tap.
        const pad = 0.22;
        const bbox = { minLat: lat - pad, maxLat: lat + pad, minLng: lng - pad, maxLng: lng + pad };

        const merge = (found: Charger[]) => {
          setExtraStations((prev) => {
            const seen = new Set(prev.map((c) => c.id));
            return [...prev, ...found.filter((c) => !seen.has(c.id))];
          });
          return found.length;
        };

        // The read endpoint answers from what is already stored and ingests a
        // cold area in the background, so a first press on virgin ground would
        // otherwise report "0 chargers" while the sources were still being
        // fetched. Re-read a couple of times to pick that up — the loading ring
        // stays put throughout, which is what the press promised.
        let count = merge(await chargersApi.inBBox(bbox, { limit: 500 }));
        for (const delay of [4000, 7000]) {
          await new Promise((r) => setTimeout(r, delay));
          const again = await chargersApi.inBBox(bbox, { limit: 500 });
          if (again.length > count) count = merge(again);
          else break;
        }

        toast.success(t("area_loaded", { count }));
        if (!areaHintSeen) {
          localStorage.setItem("flux_area_hint_seen", "1");
          setAreaHintSeen(true);
        }
      } catch {
        toast.error(t("area_error"));
      } finally {
        setLoadingArea(null);
      }
    },
    [loadingArea, t, areaHintSeen],
  );

  // All chargers near the corridor — same platform endpoint the station map uses.
  const { data: nearbyStations = [] } = useQuery({
    queryKey: ["trip-corridor-chargers", routeBBox],
    queryFn: () => chargersApi.inBBox(routeBBox!, { limit: 1000 }),
    enabled: routeBBox !== null && plan !== null,
    staleTime: 300_000,
  });

  // Corridor results plus anything the user pulled in by long-pressing. The
  // corridor set is filtered to the route inside TripMap; requested areas are
  // deliberately exempt from that, since asking for an area off-route is the
  // whole point.
  const mapStations = useMemo(() => {
    if (extraStations.length === 0) return nearbyStations;
    const seen = new Set(nearbyStations.map((c) => c.id));
    return [...nearbyStations, ...extraStations.filter((c) => !seen.has(c.id))];
  }, [nearbyStations, extraStations]);

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
      // Precondition if ANY stop is a non-SC DC fast charger.
      // Superchargers are handled automatically by Tesla's firmware.
      const willPrecondition = activePlan.stops.some(
        (s) => needsPreconditioning(s.station.maxKw) && !isSuperchargerNetwork(s.station.networkId),
      );

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
      if (willPrecondition) setShowDisclaimer(true);
      toast.success(willPrecondition ? t("share_success_preconditioned") : t("share_success"));
    } catch {
      toast.error(t("share_error"));
    } finally {
      setSharing(false);
    }
  }

  async function handleManualPrecondition() {
    if (!teslaVehicle) return;
    setPreconditioningManually(true);
    try {
      await apiFetch(`/api/vehicles/${teslaVehicle.id}/commands`, {
        method: "POST",
        body: JSON.stringify({ command: "precondition_max", args: { on: true } }),
      });
      toast.success(t("precondition_started"));
    } catch {
      toast.error(t("share_error"));
    } finally {
      setPreconditioningManually(false);
    }
  }

  async function handleSaveRoute() {
    if (!activePlan || !origin || !destination || routeSaved) return;
    try {
      const name = `${origin.name.split(",")[0]} → ${destination.name.split(",")[0]}`;
      await createSavedRoute.mutateAsync({
        name,
        origin_label: origin.name,
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        destination_label: destination.name,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        stops: activePlan.stops,
        // Only the chosen variant is stored, so loading restores the strategy
        // the user picked and variant 0 is always the right one.
        plan_snapshot: plan ? compactSnapshot(plan, activeVariant) : {},
      });
      setRouteSaved(true);
      toast.success(t("saved_route_saved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg === "saved_routes_limit" ? t("saved_route_limit") : t("saved_route_error"));
    }
  }

  // Saving is variant-specific, so switching variants means the stored route no
  // longer matches what is on screen — re-arm the save button.
  function handleVariantChange(index: number) {
    setActiveVariant(index);
    setRouteSaved(false);
  }

  function handleLoadRoute(r: SavedRoute) {
    setOrigin({ name: r.origin_label, lat: r.origin_lat, lng: r.origin_lng });
    setDestination({ name: r.destination_label, lat: r.destination_lat, lng: r.destination_lng });
    const snap = parseSnapshot(r.plan_snapshot);
    setSharedRoute(false);
    setShowDisclaimer(false);
    setActiveVariant(0);
    if (snap) {
      setPlan(snap);
      setRouteSaved(true);
      setFormCollapsed(true);
      setPlanExpanded(true);
    } else {
      // Unreadable or legacy snapshot: drop the previous plan rather than
      // leaving route A's map and stops on screen under route B's labels —
      // saving from that state would persist the wrong plan.
      setPlan(null);
      setRouteSaved(false);
      setFormCollapsed(false);
    }
    setSavedSheetOpen(false);
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
          setActiveVariant: handleVariantChange,
          canShare,
          sharing,
          sharedRoute,
          destinationShort,
          onShareToTesla: handleShareToTesla,
          onSaveRoute: handleSaveRoute,
          saving: createSavedRoute.isPending,
          saved: routeSaved,
          showDisclaimer,
          onDismissDisclaimer: () => setShowDisclaimer(false),
          onManualPrecondition: handleManualPrecondition,
          preconditioningManually,
          hasTesla: teslaVehicle !== null,
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
          nearbyStations={mapStations}
          onAreaRequest={(lat, lng) => void handleAreaRequest(lat, lng)}
          loadingArea={loadingArea}
          routes={routeLines}
          onRouteSelect={handleVariantChange}
        />

        {/* A long-press is invisible unless it is named. Shown only once a plan
            exists, which is when exploring around the route is worth doing, and
            replaced by the count while an area is loading. */}
        {plan && (loadingArea || !areaHintSeen) && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-[400] -translate-x-1/2 rounded-full bg-card/85 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur-sm lg:bottom-4">
            {loadingArea ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                {tc("loading")}
              </span>
            ) : (
              t("area_hint")
            )}
          </div>
        )}
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
            <button
              onClick={() => setSavedSheetOpen(true)}
              className="mb-2 flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <Bookmark className="size-4 shrink-0" />
              <span className="flex-1 text-left">{t("saved_routes_title")}</span>
              {savedRoutes.length > 0 && (
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">{savedRoutes.length}</span>
              )}
            </button>
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
          {/* Handle — always visible. Shows drag indicator + chevron. */}
          <div className="flex min-h-11 w-full items-center justify-between gap-2 px-4 pb-1 pt-2">
            <button
              onClick={() => setPlanExpanded((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-2"
              aria-expanded={planExpanded}
              aria-label={planExpanded ? t("see_map") : t("see_plan")}
            >
              <div className="mx-auto h-1 w-9 rounded-full bg-border transition-colors active:bg-muted-foreground/40" />
              {planExpanded
                ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                : <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
              }
            </button>
            <button
              onClick={() => setSavedSheetOpen(true)}
              aria-label={t("saved_routes_title")}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <Bookmark className="size-4" />
            </button>
            <button
              onClick={() => setFormCollapsed(false)}
              className="flex min-h-11 shrink-0 items-center text-sm text-muted-foreground hover:text-foreground"
            >
              {t("edit_btn")}
            </button>
          </div>

          {/* Results — collapses to ~160 px (shows share + chips) instead of 0,
              so the primary action stays visible without expanding. */}
          <motion.div
            animate={{ height: planExpanded ? "auto" : 160 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="overflow-x-hidden"
            style={{ maxHeight: "calc(45dvh - 2.5rem)", overflowY: planExpanded ? "auto" : "hidden" }}
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
          <button
            onClick={() => setSavedSheetOpen(true)}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Bookmark className="size-4 shrink-0" />
            <span className="flex-1 text-left">{t("saved_routes_title")}</span>
            {savedRoutes.length > 0 && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">{savedRoutes.length}</span>
            )}
          </button>
          <TripPlannerForm {...formProps} />
          {resultsProps && (
            <div className="border-t border-border pt-4">
              <TripResultsBody {...resultsProps} />
            </div>
          )}
        </div>
      </DesktopSidebar>

      <SavedRoutesSheet
        open={savedSheetOpen}
        onClose={() => setSavedSheetOpen(false)}
        routes={savedRoutes}
        onLoad={handleLoadRoute}
        onDelete={(id) =>
          deleteSavedRoute.mutate(id, {
            onError: () => toast.error(t("saved_route_error")),
          })
        }
        t={t}
      />

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
  onSaveRoute: () => void;
  saving: boolean;
  saved: boolean;
  showDisclaimer: boolean;
  onDismissDisclaimer: () => void;
  onManualPrecondition: () => void;
  preconditioningManually: boolean;
  hasTesla: boolean;
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
  onSaveRoute,
  saving,
  saved,
  showDisclaimer,
  onDismissDisclaimer,
  onManualPrecondition,
  preconditioningManually,
  hasTesla,
}: TripResultsBodyProps) {
  const tc = useTranslations("common");
  const stats: Stat[] = [
    { value: formatDuration(activePlan.totalMinutes), label: t("stat_time") },
    { value: `${Math.round(activePlan.totalDistanceKm)} km`, label: t("stat_distance") },
    { value: String(activePlan.stops.length), label: t("stat_stops") },
    { value: fromEUR(activePlan.tripEnergyCostEur), label: t("stat_cost"), accent: true },
  ];

  return (
    <div className="space-y-3">
      {/* Share / sent — rendered FIRST so it stays visible in the peek state
          of the mobile bottom sheet (collapsed to ~160 px). canShare is already
          false for infeasible routes so no guard needed here. */}
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
                  {showDisclaimer
                    ? t("share_sent_detail_preconditioned")
                    : t("share_sent_detail", { dest: destinationShort })}
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

          {/* Preconditioning disclaimer — shown once after sending a route
              that includes non-SC DC fast chargers. */}
          {showDisclaimer && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 py-1 pl-3 pr-1 text-sm text-blue-200">
              <Info className="mt-2.5 size-4 shrink-0" />
              <span className="flex-1 py-2">{t("precondition_disclaimer")}</span>
              <button
                onClick={onDismissDisclaimer}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-blue-300 hover:text-blue-100"
                aria-label={tc("close")}
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* Save route button — locks into a "saved" state so repeated taps
              don't create duplicate rows. */}
          <button
            onClick={onSaveRoute}
            disabled={saving || saved}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-70"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="size-4 text-green-400" />
            ) : (
              <Bookmark className="size-4" />
            )}
            {saved ? t("saved_route_saved") : t("save_route_btn")}
          </button>

          {/* Manual precondition — available when there's a Tesla and the route is
              shared, as a standalone trigger outside of the share flow. */}
          {hasTesla && sharedRoute && (
            <button
              onClick={onManualPrecondition}
              disabled={preconditioningManually}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {preconditioningManually ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Zap className="size-4" />
              )}
              {t("precondition_btn_manual")}
            </button>
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

// ---------------------------------------------------------------------------
// SavedRoutesSheet — bottom sheet listing bookmarked routes with load/delete.
// ---------------------------------------------------------------------------

interface SavedRoutesSheetProps {
  open: boolean;
  onClose: () => void;
  routes: SavedRoute[];
  onLoad: (r: SavedRoute) => void;
  onDelete: (id: string) => void;
  t: Translator;
}

function SavedRoutesSheet({ open, onClose, routes, onLoad, onDelete, t }: SavedRoutesSheetProps) {
  const tc = useTranslations("common");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const renameRoute = useRenameSavedRoute();

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    try {
      await renameRoute.mutateAsync({ id, name: renameValue.trim() });
      setRenamingId(null);
    } catch {
      toast.error(t("saved_route_error"));
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1100] bg-black/50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            variants={slideUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed bottom-0 left-0 right-0 z-[1101] max-h-[70dvh] overflow-y-auto rounded-t-[20px] border-t border-border bg-card shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <Bookmark className="size-4 text-primary" />
                <span className="text-sm font-semibold">{t("saved_routes_title")}</span>
                {routes.length > 0 && (
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                    {routes.length}/10
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label={tc("close")}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4">
              {routes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("saved_routes_empty")}</p>
              ) : (
                <div className="space-y-2">
                  {routes.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-border bg-card/60 p-3"
                    >
                      {renamingId === r.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleRename(r.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            placeholder={t("saved_route_rename_placeholder")}
                            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            onClick={() => void handleRename(r.id)}
                            disabled={renameRoute.isPending || !renameValue.trim()}
                            className="flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                          >
                            {renameRoute.isPending ? <Loader2 className="size-4 animate-spin" /> : t("saved_route_rename_save")}
                          </button>
                          <button
                            onClick={() => setRenamingId(null)}
                            aria-label={tc("cancel")}
                            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      ) : confirmDeleteId === r.id ? (
                        <div className="flex min-h-11 items-center gap-2">
                          <p className="min-w-0 flex-1 text-sm text-foreground">
                            {t("saved_route_delete_confirm")}
                          </p>
                          <button
                            onClick={() => {
                              onDelete(r.id);
                              setConfirmDeleteId(null);
                            }}
                            className="flex min-h-11 shrink-0 items-center rounded-lg bg-destructive px-3 text-sm font-semibold text-destructive-foreground"
                          >
                            {tc("delete")}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="flex min-h-11 shrink-0 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
                          >
                            {tc("cancel")}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <button
                                onClick={() => {
                                  setRenamingId(r.id);
                                  setRenameValue(r.name);
                                }}
                                className="flex min-h-11 items-center gap-1.5 text-left text-sm font-medium text-foreground hover:text-primary"
                              >
                                <span className="line-clamp-1">{r.name}</span>
                                <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                              </button>
                              <p className="line-clamp-1 text-xs text-muted-foreground">
                                {r.origin_label.split(",")[0]} → {r.destination_label.split(",")[0]}
                              </p>
                            </div>
                            <button
                              onClick={() => setConfirmDeleteId(r.id)}
                              aria-label={tc("delete")}
                              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                          <button
                            onClick={() => onLoad(r)}
                            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/40 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Route className="size-3.5" />
                            {t("saved_route_load")}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
