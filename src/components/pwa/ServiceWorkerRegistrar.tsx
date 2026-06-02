"use client";

import { useEffect } from "react";

// Actively unregister any previously-installed service worker and clear caches.
// The old worker could serve stale HTML after a deploy, leaving users on broken
// builds. Registering /sw.js (now a kill-switch) ensures devices stuck on the
// old worker receive the self-unregistering version on their next update check.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        if (regs.length > 0) {
          // Trigger an update so the kill-switch sw.js installs and tears down.
          regs.forEach((reg) => reg.update().catch(() => {}));
        } else {
          // No worker yet: install the kill-switch once so caches stay clear.
          navigator.serviceWorker.register("/sw.js").catch(() => {});
        }
      })
      .catch(() => {});

    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }, []);

  return null;
}
