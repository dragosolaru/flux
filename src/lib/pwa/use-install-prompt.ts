"use client";

import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// `beforeinstallprompt` fires once, early in the page lifecycle. Components that
// mount later (e.g. the Settings page) would miss it, so we capture it at module
// scope and expose it through an external store. The module is loaded on first
// dashboard render via the layout-mounted InstallPrompt, so the listener is in
// place early.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let initialized = false;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
    !("MSStream" in window)
  );
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  notify();
  return choice.outcome === "accepted";
}

export interface InstallPromptState {
  canInstall: boolean;
  isInstalled: boolean;
  isIOSDevice: boolean;
}

function subscribe(callback: () => void): () => void {
  ensureInit();
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

// useSyncExternalStore requires a referentially stable snapshot, so cache it and
// only swap when a field actually changes.
let snapshot: InstallPromptState = { canInstall: false, isInstalled: false, isIOSDevice: false };

function getSnapshot(): InstallPromptState {
  const next: InstallPromptState = {
    canInstall: deferred !== null,
    isInstalled: installed || isStandalone(),
    isIOSDevice: isIOS(),
  };
  if (
    next.canInstall !== snapshot.canInstall ||
    next.isInstalled !== snapshot.isInstalled ||
    next.isIOSDevice !== snapshot.isIOSDevice
  ) {
    snapshot = next;
  }
  return snapshot;
}

const SERVER_SNAPSHOT: InstallPromptState = {
  canInstall: false,
  isInstalled: false,
  isIOSDevice: false,
};

function getServerSnapshot(): InstallPromptState {
  return SERVER_SNAPSHOT;
}

export function useInstallPrompt(): InstallPromptState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
