"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Route, Loader2, AlertCircle, Navigation, Pencil, AlertTriangle, ChevronUp, ChevronDown, Send, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

import { GeocodingSearch, type GeoPoint } from "@/components/trip/GeocodingSearch";
import { StopCard, needsPreconditioning, isSuperchargerNetwork } from "@/components/trip/StopCard";
import { CostSummary } from "@/components/trip/CostSummary";
import { apiFetch } from "@/lib/api-fetch";
import { useVehicles } from "@/hooks/useVehicles";
import { slideUp } from "@/lib/animations/variants";
import type { TripPlan, TripVariant } from "@/lib/external/routing/types";

const TripMap = dynamic(() => import("@/components/trip/TripMap"), { ssr: false });

interface TripResponse {
  plan: TripPlan;
  variants: TripVariant[];
  vehicle: { id: string; displayName: string; brand: string; model: string | null } | null;
  deratingPct: number;
}

interface NominatimReverseResult {
  display_name: string;
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

export function TripClient() {
  const t = useTranslations("trip");
  const { data: vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState<string>("");
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [startSoc, setStartSoc] = useState(80);
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

  const canPlan = origin !== null && destination !== null;

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

  async function handlePlan() {
    if (!canPlan) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<TripResponse>("/api/trip-plan", {
        method: "POST",
        body: JSON.stringify({
          ...(vehicleId ? { vehicleId } : {}),
          origin: { lat: origin.lat, lng: origin.lng, label: origin.name },
          startSoc,
          destination: { lat: destination.lat, lng: destination.lng, label: destination.name },
        }),
      });
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

  const variants = plan?.variants ?? [];
  const activePlan = variants[activeVariant]?.plan ?? plan?.plan ?? null;

  // Share to Tesla is only possible for a real, connected Tesla vehicle.
  const teslaVehicle =
    plan?.vehicle && plan.vehicle.brand === "tesla" ? plan.vehicle : null;
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
            destination: {
              lat: destination.lat,
              lng: destination.lng,
              name: destination.name,
            },
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
  })) ?? [];

  const originShort = origin?.name.split(",")[0] ?? "";
  const destinationShort = destination?.name.split(",")[0] ?? "";

  return (
    <div className="relative -mx-4 -mt-6 -mb-4 h-full md:-mx-8 md:-mb-6">
      {/* h-full fills the <main> content box exactly — flexbox already accounts
          for TopBar, the mock banner, the bottom nav, and safe-area insets, so
          we no longer hand-compute a fragile 100dvh height that ignored the
          mock banner and clipped the results sheet. */}
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <TripMap
          origin={origin}
          destination={destination}
          stops={stops}
          polyline={activePlan?.polyline ?? null}
          className="h-full w-full"
        />
      </div>

      {/* Search overlay — top left */}
      <div className="absolute left-3 top-3 z-[1000] w-80 max-w-[calc(100vw-1.5rem)]">
        {formCollapsed && plan ? (
          /* Compact pill summary */
          <button
            onClick={() => setFormCollapsed(false)}
            className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-background/80 p-3 shadow-2xl backdrop-blur-xl"
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
          <div className="space-y-2.5 rounded-2xl border border-white/10 bg-background/80 p-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <Route className="size-4 text-primary" />
              <h1 className="text-xs font-semibold">{t("title")}</h1>
            </div>

            <GeocodingSearch
              placeholder={t("origin_placeholder")}
              value={origin}
              onChange={setOrigin}
              icon={<Navigation className="size-4" />}
              onLocate={handleLocateOrigin}
              locating={locating}
              locateTitle={locating ? t("locating") : t("use_my_location")}
            />

            <GeocodingSearch
              placeholder={t("destination_placeholder")}
              value={destination}
              onChange={setDestination}
            />

            {/* Options disclosure — battery + vehicle are secondary; keep the
                first interaction to just origin → destination → plan. */}
            <button
              type="button"
              onClick={() => setOptionsOpen((v) => !v)}
              aria-expanded={optionsOpen}
              className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
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
                {/* Battery slider — label and value inline, slider below */}
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
                    className="mt-1 w-full accent-primary"
                  />
                </div>

                {/* Vehicle selector */}
                {vehicles && vehicles.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">{t("vehicle_label")}</label>
                    <select
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm backdrop-blur-sm"
                    >
                      <option value="">{t("vehicle_default")}</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nickname ?? v.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handlePlan}
              disabled={!canPlan || loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary/90 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
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
        )}
      </div>

      {/* Results panel — bottom slide-up, collapsible */}
      <AnimatePresence>
      {plan && activePlan && (
        <motion.div
          variants={slideUp}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="absolute bottom-0 left-0 right-0 z-[1000] rounded-t-2xl border-t border-white/10 bg-background/95 shadow-2xl backdrop-blur-xl"
        >
          {/* Handle — always visible, outside the collapsible area so scroll
              state never hides it. */}
          <div className="flex w-full items-center justify-between gap-2 px-4 pb-1 pt-2">
            <button
              onClick={() => setPlanExpanded((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-2"
              aria-expanded={planExpanded}
              aria-label={planExpanded ? t("see_map") : t("see_plan")}
            >
              {planExpanded ? (
                <>
                  <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </>
              ) : (
                <>
                  <span className="truncate text-sm font-medium text-foreground">
                    {originShort} → {destinationShort}
                    {activePlan.totalDistanceKm > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {Math.round(activePlan.totalDistanceKm)} km · {Math.floor(activePlan.drivingMinutes / 60)}h {activePlan.drivingMinutes % 60}min
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
            animate={{ height: planExpanded ? "calc(45dvh - 2.5rem)" : 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="overflow-y-auto overflow-x-hidden"
          >
          <div className="space-y-4 px-4 pb-6 pt-2">
            {/* Variant selector — alternative roads × charging strategies */}
            {variants.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {variants.map((v, i) => {
                  const h = Math.floor(v.plan.totalMinutes / 60);
                  const m = v.plan.totalMinutes % 60;
                  const active = i === activeVariant;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setActiveVariant(i)}
                      aria-pressed={active}
                      className={`flex shrink-0 flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <span className="text-xs font-semibold">{t(`variant_${v.strategy}`)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {h}h {m}min · {v.plan.stops.length === 0
                          ? t("stops_count_zero")
                          : v.plan.stops.length === 1
                            ? t("stops_count_one")
                            : t("stops_count_other", { count: v.plan.stops.length })}
                        {v.plan.totalChargingCostEur > 0 && ` · €${v.plan.totalChargingCostEur.toFixed(0)}`}
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
                <CostSummary
                  origin={originShort}
                  destination={destinationShort}
                  totalDistanceKm={activePlan.totalDistanceKm}
                  drivingMinutes={activePlan.drivingMinutes}
                  chargingMinutes={activePlan.chargingMinutes}
                  totalEnergyKwh={activePlan.totalEnergyKwh}
                  totalChargingCostEur={activePlan.totalChargingCostEur}
                  stopsCount={activePlan.stops.length}
                  approxRoute={activePlan.approxRoute}
                />

                {canShare && (
                  <button
                    onClick={handleShareToTesla}
                    disabled={sharing}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    {sharing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {t("share_to_tesla")}
                  </button>
                )}

                {activePlan.warning && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 backdrop-blur-sm">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {activePlan.warning}
                  </div>
                )}

                {activePlan.stops.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("stops_label")}
                    </p>
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
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
