// Kill-switch service worker.
//
// An earlier service worker cached HTML navigations network-first with no
// versioning or update flow. After a deploy, returning users were served stale
// HTML that referenced JS chunks which no longer existed — breaking the app.
//
// This replacement unregisters itself and deletes every cache so any device
// stuck on the old worker is freed and starts loading fresh content directly
// from the network. A proper, versioned PWA worker can be reintroduced later.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })(),
  );
});

// Pass every request straight through to the network — never serve from cache.
self.addEventListener("fetch", () => {});
