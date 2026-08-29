"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Where the device is, optionally kept up to date while it moves.
 *
 * Measured on the car's own screen, which is the only authority on its own
 * browser: Chromium 148, permission granted, **±1–2 m, a fix every ~0.1 s**.
 * That is ten times a second at GPS accuracy, and it costs nothing — it does
 * not touch Tesla's API, so it is not spent against the few hundred
 * `vehicle_data` reads a vehicle gets per day. The car's own position, fetched
 * through the Fleet API, is the expensive and much slower answer to the same
 * question and stays a fallback for when location is refused.
 *
 * `live` is opt-in for the same reason polling is: a screen that does not need
 * to follow a moving car should not hold the GPS open.
 *
 * **The rate is throttled deliberately.** Ten fixes a second is ten React
 * renders a second, and a map redrawn at 10 Hz on a phone is heat and battery
 * for no legibility — nothing on screen moves meaningfully in 100 ms. A commit
 * happens when the position has moved far enough to matter or enough time has
 * passed, whichever comes first, so a stationary car settles to nothing at all.
 */

export interface Fix {
  lat: number;
  lng: number;
  /** Metres. Above ~50 this is a network-derived guess, not the car's GPS. */
  accuracy: number;
  at: number;
}

export type LocateState = "asking" | "ok" | "refused" | "unsupported";

/** Far enough that a marker would visibly move at street zoom. */
const MOVED_M = 8;
/** And a floor on the interval, so a slow crawl still updates. */
const EVERY_MS = 1500;

// Whether the browser has the API at all is not a state that changes, so it
// must not be written with setState in an effect — the React compiler rejects
// that, correctly. It is answered differently on the server and the client,
// which is exactly what useSyncExternalStore is for.
const subscribeNever = () => () => undefined;

function metresBetween(a: Fix, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Is this fix worth a render?
 *
 * Exported because it is the whole throttling policy and the reason the hook
 * does not melt a phone: ten fixes a second is ten renders a second, and
 * nothing on a map moves meaningfully in 100 ms. A car at 100 km/h covers the
 * 8 m threshold in under a third of a second, so motion still looks smooth;
 * a parked car crosses neither threshold and settles to one commit every 1.5 s.
 */
export function worthCommitting(last: Fix | null, next: Fix): boolean {
  if (last == null) return true;
  if (next.at - last.at >= EVERY_MS) return true;
  return metresBetween(last, next) >= MOVED_M;
}

export function useHere({ live = false }: { live?: boolean } = {}): {
  here: Fix | null;
  state: LocateState;
} {
  const [here, setHere] = useState<Fix | null>(null);
  const [state, setState] = useState<LocateState>("asking");
  const supported = useSyncExternalStore(
    subscribeNever,
    () => typeof navigator !== "undefined" && !!navigator.geolocation,
    // Assume yes on the server, so a supported browser never flashes a refusal
    // on its first paint.
    () => true,
  );
  // Read and written only from the geolocation callback, never during render.
  const lastRef = useRef<Fix | null>(null);

  useEffect(() => {
    if (!supported) return;

    const accept = (pos: GeolocationPosition) => {
      const next: Fix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: Date.now(),
      };
      if (!worthCommitting(lastRef.current, next)) return;
      lastRef.current = next;
      setHere(next);
      setState("ok");
    };

    const reject = () => setState("refused");

    if (!live) {
      navigator.geolocation.getCurrentPosition(accept, reject, {
        timeout: 5000,
        maximumAge: 60_000,
      });
      return;
    }

    const id = navigator.geolocation.watchPosition(accept, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
    });
    return () => navigator.geolocation.clearWatch(id);
  }, [live, supported]);

  return { here, state: supported ? state : "unsupported" };
}
