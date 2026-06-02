const CACHE_NAME = "flux-shell-v1";
const SHELL_URLS = ["/dashboard", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip non-same-origin and Next.js internals
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/")) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Cache successful navigation responses
        if (res.ok && event.request.mode === "navigate") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) => cached ?? caches.match("/offline.html")
        )
      )
  );
});
