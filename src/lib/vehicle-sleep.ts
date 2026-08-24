"use client";

import { useSyncExternalStore } from "react";

/**
 * "Let the car sleep" — one switch for the whole app, persisted.
 *
 * The pause that already existed lived in `useVehicle`'s own React state, so it
 * covered exactly one mounted hook and died the moment you navigated to another
 * screen or reloaded. Pressing it and then tapping through the app quietly
 * turned polling back on, which made it a control that looked like a promise
 * and was not one.
 *
 * This is deliberately NOT React state or context: a driver switching it off on
 * the dashboard must have it off on Commands, in another tab, and tomorrow
 * morning. localStorage plus a subscription is the smallest thing that is true
 * across all three.
 *
 * It does not need to reach the server to be correct. Since a background read
 * no longer wakes a sleeping car (fetchVehicleData's `allowWake` defaults to
 * false), this switch is the second line rather than the only one — it stops
 * even the harmless reads.
 */
const KEY = "flux:letItSleep";

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private mode, or site data blocked. Failing open is right: the guard is
    // a convenience, and the real protection is server-side.
    return false;
  }
}

export function setSleepMode(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Ignore — the in-memory notification below still applies for this tab.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab flipping the switch has to reach this one, or the app would
  // hold two different opinions about whether the car may be disturbed.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** False during server rendering: the switch is a browser-local preference. */
export function useSleepMode(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
