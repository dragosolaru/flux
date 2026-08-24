"use client";

import { useMutation } from "@tanstack/react-query";
import { Bookmark, Send } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  Mono,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { GeocodingSearch, type GeoPoint } from "@/components/trip/GeocodingSearch";
import { useCreateSavedRoute, useSavedRoutes } from "@/hooks/useSavedRoutes";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";
import * as tripApi from "@/lib/api/trip";
import * as vehiclesApi from "@/lib/api/vehicles";
import { routeNeedsPreconditioning, needsPreconditioning, isTeslaOwnNetwork } from "@/lib/trip/precondition";
import type { TripPlan } from "@/lib/external/routing/types";

/**
 * The stop count. The three plural forms are separate keys rather than one ICU
 * message in this namespace, so the selection has to happen here.
 */
function stopsLabel(count: number, t: (key: string, values?: Record<string, number>) => string): string {
  if (count === 0) return t("stops_count_zero");
  if (count === 1) return t("stops_count_one", { count });
  return t("stops_count_other", { count });
}

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h === 0 ? `${m} m` : `${h} h ${m} m`;
}

/**
 * The route as a vertical instrument: the spine is the journey, each stop
 * carries the SoC it arrives on and the SoC it leaves with.
 *
 * Deliberately NOT arcs. A route is a sequence, and four arcs down a screen
 * would be the house instrument used as decoration. The per-stop bar answers
 * the only question that matters at a stop — how low do I get, how high do I
 * come back up.
 */
function Spine({ plan }: { plan: TripPlan }) {
  const t = useTranslations("trip");

  return (
    <div className="relative mt-4 pl-[26px]">
      <div className="absolute bottom-1.5 left-[5px] top-1.5 w-px bg-border" />

      {plan.stops.map((stop, i) => {
        const precondition =
          needsPreconditioning(stop.station.maxKw) &&
          !isTeslaOwnNetwork({ networkId: stop.station.networkId });
        return (
          <div key={`${stop.station.lat}-${stop.station.lng}-${i}`} className="relative pb-6">
            <span
              className="absolute -left-[26px] top-[3px] size-[11px] rounded-full border-[1.5px] bg-background"
              style={{ borderColor: stop.arriveSoc < 15 ? "var(--chart-3)" : "var(--v2-soft)" }}
            />
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-base">{stop.station.name}</span>
              <Mono className="shrink-0 text-[13px] normal-case tracking-normal">
                {Math.round(stop.chargingMinutes)} min
              </Mono>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <Mono className="text-chart-3">{`${Math.round(stop.arriveSoc)}%`}</Mono>
              <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, stop.departSoc - stop.arriveSoc))}%`,
                    background: "linear-gradient(90deg, var(--chart-3), var(--chart-2))",
                  }}
                />
              </div>
              <Mono className="text-chart-2">{`${Math.round(stop.departSoc)}%`}</Mono>
              <Mono className="text-muted-foreground">{`${Math.round(stop.station.maxKw)} kW`}</Mono>
            </div>
            {precondition && (
              // A fact about this stop, on this stop. Tesla warms the battery
              // itself for its own Superchargers; everywhere else it is our
              // command or a slow charge on a cold pack.
              <div className="mt-1.5">
                <Mono className="text-chart-3">{t("precondition_manual")}</Mono>
              </div>
            )}
          </div>
        );
      })}

      <div className="relative">
        <span className="absolute -left-[26px] top-[3px] size-[11px] rounded-full bg-primary" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-base text-primary">
            {plan.destination.label ?? ""}
          </span>
          <Mono className="shrink-0 text-[13px] normal-case tracking-normal text-primary">
            {hhmm(plan.totalMinutes)}
          </Mono>
        </div>
        <div className="mt-1.5">
          <Mono className="text-muted-foreground">
            {`${Math.round(plan.totalDistanceKm)} km`}
          </Mono>
        </div>
      </div>
    </div>
  );
}

export function TripV2Client() {
  const t = useTranslations("trip");
  const tv = useTranslations("v2");

  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicleId = selectedVehicleId ?? "";
  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  // poll: false. The planner needs the battery once, to plan from — an
  // interval here would keep a linked car awake for as long as someone plans.
  const { data: state } = useVehicle(vehicleId, vehicle?.dataSource === "live", false);

  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);

  const { data: saved = [] } = useSavedRoutes();
  const createRoute = useCreateSavedRoute();

  const startSoc = state?.batteryLevel ?? 80;

  const planMutation = useMutation({
    mutationFn: () => {
      if (!origin || !destination) throw new Error("missing-points");
      return tripApi.plan<TripPlan>({
        vehicleId: vehicleId || undefined,
        origin: { lat: origin.lat, lng: origin.lng, label: origin.name },
        destination: { lat: destination.lat, lng: destination.lng, label: destination.name },
        startSoc,
        arrivalSocPct: 10,
      });
    },
    onSuccess: setPlan,
    onError: () => toast.error(t("plan_failed")),
  });

  // One call, both commands. Preconditioning is decided from EVERY stop that
  // needs it, not just the first — deciding from the first is a bug this app
  // has already had once.
  const sendMutation = useMutation({
    mutationFn: () => {
      if (!plan) throw new Error("no-plan");
      const first = plan.stops[0];
      const target = first
        ? { lat: first.station.lat, lng: first.station.lng, name: first.station.name }
        : {
            lat: plan.destination.lat,
            lng: plan.destination.lng,
            name: plan.destination.label ?? "",
          };
      return vehiclesApi.shareNavigation(
        vehicleId,
        { destination: target },
        { precondition: routeNeedsPreconditioning(plan.stops) },
      );
    },
    onSuccess: () => toast.success(t("share_success")),
    onError: () => toast.error(t("share_error")),
  });

  const canPlan = origin != null && destination != null && !planMutation.isPending;

  return (
    <Screen>
      <ScreenHeader
        title={t("title")}
        meta={state?.batteryLevel != null ? `${Math.round(state.batteryLevel)}%` : undefined}
      />

      {/* Origin and destination as two rows, with no input chrome of their own.
          The geocoding control is v1's — it owns the debounce, the listbox ARIA
          and the keyboard handling, and none of that is presentation. */}
      <div className="mt-4">
        <div className="flex items-center gap-3.5 border-t border-border py-2.5">
          <span className="flex w-[19px] justify-center">
            <span className="size-[7px] rounded-full border-[1.5px]" style={{ borderColor: "var(--v2-soft)" }} />
          </span>
          <div className="min-w-0 flex-1">
            <GeocodingSearch
              placeholder={t("origin_placeholder")}
              value={origin}
              onChange={setOrigin}
              bias={
                state?.latitude != null && state.longitude != null
                  ? { lat: state.latitude, lng: state.longitude }
                  : null
              }
            />
          </div>
        </div>
        <div className="flex items-center gap-3.5 border-y border-border py-2.5">
          <span className="flex w-[19px] justify-center">
            <span className="size-[7px] rounded-full bg-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <GeocodingSearch
              placeholder={t("destination_placeholder")}
              value={destination}
              onChange={setDestination}
              bias={origin ? { lat: origin.lat, lng: origin.lng } : null}
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Rows>
          <Row
            label={t("plan_btn")}
            value={canPlan ? undefined : tv("pick_both_points")}
            valueTone="accent"
            pending={planMutation.isPending}
            pendingLabel={tv("planning")}
            disabled={!canPlan}
            reason={tv("pick_both_points")}
            onClick={() => planMutation.mutate()}
            last
          />
        </Rows>
      </div>

      {plan && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <SectionLabel>
              {stopsLabel(plan.stops.length, t)} · {hhmm(plan.totalMinutes)}
            </SectionLabel>
            <Mono className="text-muted-foreground">
              {plan.chargingCostPartial ? "≥ " : "≈ "}
              {plan.totalChargingCostEur.toFixed(0)} €
            </Mono>
          </div>

          {!plan.feasible && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {plan.warning ?? t("infeasible_title")}
            </p>
          )}

          <Spine plan={plan} />
        </div>
      )}

      <div className="mt-7 pb-8">
        <Rows>
          <Row
            icon={<Send strokeWidth={1.5} className="text-primary" />}
            label={<span className="text-primary">{t("share_to_tesla")}</span>}
            pending={sendMutation.isPending}
            pendingLabel={tv("sending")}
            disabled={plan == null || vehicleId === ""}
            reason={tv("plan_first")}
            onClick={() => sendMutation.mutate()}
          />
          <Row
            icon={<Bookmark strokeWidth={1.5} />}
            label={t("save_route_btn")}
            value={saved.length > 0 ? String(saved.length) : undefined}
            pending={createRoute.isPending}
            pendingLabel={tv("sending")}
            disabled={plan == null || origin == null || destination == null}
            reason={tv("plan_first")}
            onClick={() => {
              if (!plan || !origin || !destination) return;
              createRoute.mutate(
                {
                  name: `${origin.name} → ${destination.name}`,
                  origin_label: origin.name,
                  origin_lat: origin.lat,
                  origin_lng: origin.lng,
                  destination_label: destination.name,
                  destination_lat: destination.lat,
                  destination_lng: destination.lng,
                  stops: plan.stops,
                  plan_snapshot: plan,
                },
                { onSuccess: () => toast.success(t("saved_route_saved")) },
              );
            }}
            last
          />
        </Rows>
      </div>

      <NavBar />
    </Screen>
  );
}
