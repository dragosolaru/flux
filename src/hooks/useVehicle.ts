"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import * as vehiclesApi from "@/lib/api/vehicles";

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
 * @param live  the vehicle is a linked car, so polling wakes it
 * @param poll  keep refreshing. Screens that only need the current value once
 *              — the trip planner reading the battery to plan from — pass
 *              false: they get the cached value, or one fetch, and never start
 *              an interval that keeps the car awake while someone plans.
 */
export function useVehicle(vehicleId: string, live = false, poll = true) {
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
    if (!live) return;
    armIdleTimer();

    const onActivity = () => {
      // Deliberately does not un-pause: once polling has stopped, moving the
      // mouse must not silently start waking the car again. Resuming is the
      // driver's decision.
      if (!active) return;
      armIdleTimer();
    };

    for (const e of ACTIVITY_EVENTS) {
      document.addEventListener(e, onActivity, { passive: true });
    }
    return () => {
      for (const e of ACTIVITY_EVENTS) document.removeEventListener(e, onActivity);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [live, active, armIdleTimer]);

  const query = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehiclesApi.getState(vehicleId),
    refetchInterval: (q) => {
      if (!poll) return false;
      if (live && !active) return false;
      // Stop after a failure instead of retrying every 30 s forever. A car we
      // cannot reach is asleep, out of signal, or unlinked — none of which a
      // timer fixes, and each attempt still tries to wake it. The error card's
      // Retry is the way back, which also makes resuming a decision rather
      // than something that happens silently in the background.
      if (q.state.status === "error") return false;
      return 30_000;
    },
    staleTime: 20_000,
    enabled: !!vehicleId,
  });

  const polling: VehiclePolling = {
    active: live ? active : true,
    pausedByIdle,
    pause,
    resume,
  };

  return { ...query, polling };
}
