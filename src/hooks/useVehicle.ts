"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import * as vehiclesApi from "@/lib/api/vehicles";
import { useSleepMode } from "@/lib/vehicle-sleep";
import type { VehicleState } from "@/types/vehicle";

/**
 * Polling stops on its own after this long without the page being touched.
 *
 * A linked car answers a poll it is asleep for by being woken, so an open
 * dashboard keeps it awake indefinitely and a Tesla that never reaches deep
 * sleep loses roughly ten times more charge per idle day. TanStack already
 * pauses the interval when the tab loses focus, but a phone left on the charging
 * screen, or a laptop tab someone forgot, stays focused for hours.
 *
 * Ten minutes is long enough to watch a charge session start and short enough
 * that a forgotten tab costs nothing overnight.
 */
const IDLE_PAUSE_MS = 10 * 60 * 1000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "visibilitychange"] as const;

/** How often a screen that is allowed to poll asks the car again. */
export const POLL_INTERVAL_MS = 30_000;

/**
 * Whether a poll is allowed right now — the whole rule, in one pure function so
 * it can be tested and so no screen can quietly get it wrong.
 *
 * A poll on a sleeping Tesla wakes it (see fetchVehicleData), and a car kept
 * from deep sleep loses roughly ten times more charge per idle day. So the
 * default answer is no, and every yes has to be argued for at the call site.
 */
export function pollInterval(input: {
  /** The screen asked to keep refreshing. */
  poll: boolean;
  /** A linked car, i.e. one that can be woken. */
  live: boolean;
  /** Polling has not been switched off by hand or by the idle timer. */
  active: boolean;
  status: "pending" | "success" | "error";
}): number | false {
  if (!input.poll) return false;
  if (input.live && !input.active) return false;
  // Stop after a failure instead of retrying every 30 s forever. A car we
  // cannot reach is asleep, out of signal, or unlinked — none of which a timer
  // fixes, and each attempt still tries to wake it.
  if (input.status === "error") return false;
  return POLL_INTERVAL_MS;
}

export interface VehiclePolling {
  /** False once polling has stopped, whether by idling out or by hand. */
  active: boolean;
  /** True when it stopped on its own rather than being switched off. */
  pausedByIdle: boolean;
  /** Stop now — "let the car sleep". */
  pause: () => void;
  /** Start again, and reset the idle countdown. */
  resume: () => void;
}

/**
 * @param live  the vehicle is a linked car, so polling wakes it. Defaults to
 *              true because it defaulted to false and only two of eight call
 *              sites remembered to pass it: /commands, /charging, /insights and
 *              the energy cards all polled a real car every 30 s with no idle
 *              cut-off at all, and a poll on a sleeping car triggers a wake_up
 *              (see fetchVehicleData). An opt-in protection that has to be
 *              remembered at every call site is not a protection. The simulator
 *              loses nothing by pausing too.
 * @param poll  keep refreshing. Screens that only need the current value once
 *              — the trip planner reading the battery to plan from — pass
 *              false: they get the cached value, or one fetch, and never start
 *              an interval that keeps the car awake while someone plans.
 *
 *              A predicate may be passed instead, evaluated against the last
 *              state the car reported. That is how the charging screen refreshes
 *              only while a session is running: a charging car is already awake,
 *              so polling it costs nothing, and one that has finished is left
 *              alone. Expressing it as a predicate rather than a piece of
 *              component state avoids the chicken-and-egg of needing the data to
 *              decide whether to fetch the data.
 */
export function useVehicle(
  vehicleId: string,
  live = true,
  poll: boolean | ((state: VehicleState | undefined) => boolean) = true,
) {
  // The app-wide switch. Persisted and shared across screens and tabs, unlike
  // `active` below, which is this hook instance's own idle state.
  const sleepMode = useSleepMode();

  // Only a linked car can be kept awake; the simulator has nothing to disturb,
  // so mock vehicles keep polling exactly as before.
  const [active, setActive] = useState(true);
  const [pausedByIdle, setPausedByIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pause = useCallback(() => {
    setActive(false);
    setPausedByIdle(false);
  }, []);

  const armIdleTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setActive(false);
      setPausedByIdle(true);
    }, IDLE_PAUSE_MS);
  }, []);

  const resume = useCallback(() => {
    setActive(true);
    setPausedByIdle(false);
    armIdleTimer();
  }, [armIdleTimer]);

  useEffect(() => {
    if (!live || sleepMode) return;
    // Guarded, because `active` is a dependency: pause() flips it, the effect
    // re-runs, and an unguarded re-arm started a fresh countdown on an already
    // paused hook. Ten minutes later it set pausedByIdle, and the next tap
    // auto-resumed — so "let it sleep" survived exactly ten minutes and then
    // silently started waking the car again, with the indicator back to green.
    if (active) armIdleTimer();

    const onActivity = (event: Event) => {
      if (active) {
        armIdleTimer();
        return;
      }
      // Paused. Only a deliberate touch or keypress brings it back, and only
      // when it stopped by itself — a `pause()` the driver pressed means "let
      // the car sleep" and must survive them scrolling the page afterwards.
      //
      // Auto-resuming at all is new. It used to be strictly manual, which was
      // right for the dashboard's visible pause control and wrong everywhere
      // else: now that every screen idles out, /commands and /charging would
      // simply stop updating after ten minutes with nothing on screen offering
      // a way back.
      if (pausedByIdle && event.type !== "visibilitychange") resume();
    };

    for (const e of ACTIVITY_EVENTS) {
      document.addEventListener(e, onActivity, { passive: true });
    }
    return () => {
      for (const e of ACTIVITY_EVENTS) document.removeEventListener(e, onActivity);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [live, sleepMode, active, pausedByIdle, armIdleTimer, resume]);

  const query = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehiclesApi.getState(vehicleId),
    refetchInterval: (q) =>
      pollInterval({
        poll: (typeof poll === "function" ? poll(q.state.data) : poll) && !sleepMode,
        live,
        active,
        status: q.state.status,
      }),
    staleTime: 20_000,
    // Sleep mode stops the fetch itself, not just the interval. Anything less
    // would leave "let it sleep" meaning "poll less often", which is not what
    // the words say.
    enabled: !!vehicleId && !(live && sleepMode),
  });

  const polling: VehiclePolling = {
    active: live ? active && !sleepMode : true,
    pausedByIdle,
    pause,
    resume,
  };

  return { ...query, polling };
}
