"use client";

import dynamic from "next/dynamic";
import { Footprints, Lightbulb, Route as RouteIcon, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  Bleed,
  Mono,
  Row,
  Rows,
  Screen,
  ScreenHeader,
  SectionLabel,
} from "@/components/v2/instrument";
import { NavBar } from "@/components/v2/nav";
import { VehicleSwitch } from "@/components/v2/vehicle-switch";
import { haversineMeters } from "@/lib/chargers/dedup";
import { mockLocationLabel } from "@/lib/mock/location-label";
import { useVehicle } from "@/hooks/useVehicle";
import { useVehicleCommand } from "@/hooks/useVehicleCommand";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleContext } from "@/contexts/vehicle";

const TripMap = dynamic(() => import("@/components/trip/TripMap"), { ssr: false });

function formatWalkDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Where the car is, and how to walk to it.
 *
 * This is the whole screen. The v1 `/map` is a planner, an explorer and a
 * find-my-car banner sharing one canvas with two floating cards over it; the
 * question "where did I park" deserves its own screen, and the planner is
 * reached from a row at the bottom rather than by being permanently on top of
 * this.
 *
 * The planner itself is NOT redrawn: it is 2000 lines of geocoding, corridor
 * charger loading and variant selection, and forking it for a visual pass would
 * be the one way to make this redesign dangerous.
 */
export function MapV2Client() {
  const t = useTranslations("commands");
  const tv = useTranslations("v2");
  const tm = useTranslations("map");

  const { selectedVehicleId } = useVehicleContext();
  const { data: vehicles } = useVehicles();
  const vehicleId = selectedVehicleId ?? "";
  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  const isLive = vehicle?.dataSource === "live";

  // poll: false. Where the car is parked does not change while it is parked,
  // and this screen is opened precisely when the car is asleep somewhere.
  const { data: state } = useVehicle(vehicleId, isLive, false);
  const { mutate, isPending, variables } = useVehicleCommand();

  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locateFailed, setLocateFailed] = useState(false);

  // Asked for once, on open. This screen is the one place the permission is
  // obviously justified — the driver is standing somewhere, looking for a car.
  useEffect(() => {
    if (!navigator.geolocation) {
      // Deferred rather than set inline: `navigator` is only readable after
      // mount, and setting state in the effect body cascades a second render
      // before the first has painted.
      queueMicrotask(() => setLocateFailed(true));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocateFailed(true),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const car =
    state?.latitude != null && state.longitude != null
      ? { lat: state.latitude, lng: state.longitude }
      : null;

  const meters = car && userPos ? haversineMeters(userPos, car) : null;
  const inFlight = (cmd: string) => isPending && variables?.command === cmd;

  return (
    <Screen>
      <ScreenHeader
        switcher={<VehicleSwitch />}
        title={t("find_car_title")}
        meta={
          meters != null
            ? formatWalkDistance(meters)
            : locateFailed
              ? t("find_car_no_location")
              : t("find_car_locating")
        }
        metaTone={meters != null ? "accent" : "muted"}
      />

      <Bleed>
        <div className="mt-4 h-[46dvh] w-full">
          {car ? (
            <TripMap
              origin={userPos ? { ...userPos, label: tv("you") } : null}
              destination={{ ...car, label: vehicle?.nickname ?? vehicle?.displayName ?? "" }}
              stops={[]}
              polyline={null}
              className="size-full"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Mono className="text-muted-foreground">{t("find_car_no_location")}</Mono>
            </div>
          )}
        </div>
      </Bleed>

      <div className="mt-5">
        <Rows>
          {/* Handed off rather than drawn: a real pavement route needs a
              pedestrian router we do not have, and the phone already has one
              that knows about crossings and one-way footpaths. */}
          <Row
            icon={<Footprints strokeWidth={1.5} className="text-primary" />}
            label={<span className="text-primary">{t("find_car_walk")}</span>}
            value={meters != null ? formatWalkDistance(meters) : undefined}
            valueTone="accent"
            href={
              car
                ? `https://www.google.com/maps/dir/?api=1&destination=${car.lat},${car.lng}&travelmode=walking`
                : undefined
            }
            disabled={!car}
            reason={t("find_car_no_location")}
          />
          <Row
            label={tv("where")}
            value={car ? mockLocationLabel(car.lat, car.lng) : undefined}
            disabled={!car}
            reason={tv("no_position")}
            last
          />
        </Rows>
      </div>

      <div className="mt-7">
        <SectionLabel>{tv("find_it")}</SectionLabel>
        <Rows className="mt-2">
          <Row
            icon={<Volume2 strokeWidth={1.5} />}
            label={t("honk")}
            pending={inFlight("honk")}
            pendingLabel={tv("sending")}
            disabled={!state || isPending}
            onClick={() => mutate({ vehicleId, command: "honk" })}
          />
          <Row
            icon={<Lightbulb strokeWidth={1.5} />}
            label={t("flash")}
            pending={inFlight("flash")}
            pendingLabel={tv("sending")}
            disabled={!state || isPending}
            onClick={() => mutate({ vehicleId, command: "flash" })}
            last
          />
        </Rows>
      </div>

      <div className="mt-7 pb-8">
        <Rows>
          <Row
            icon={<RouteIcon strokeWidth={1.5} className="text-primary" />}
            label={<span className="text-primary">{tm("tab_plan")}</span>}
            href="/v2/trip"
            last
          />
        </Rows>
      </div>

      <NavBar />
    </Screen>
  );
}
