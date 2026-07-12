/* AMENDMENT-02 §4 — a minimal shell service worker for instant opens. It caches
   static assets (the app shell / icons) with a stale-while-revalidate touch, and
   NEVER caches navigations, API, or auth — pages stay live and private. No
   offline-write complexity. */
const CACHE = "veritas-shell-v1";
const ASSETS = ["/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs; never touch navigations, API, or auth.
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    req.mode === "navigate" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data")
  ) {
    return;
  }

  // Cache-first for build assets and icons; refresh in the background.
  const cacheable =
    url.pathname.startsWith("/_next/static/") ||
    ASSETS.includes(url.pathname) ||
    /\.(png|svg|ico|woff2?)$/.test(url.pathname);
  if (!cacheable) return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((hit) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    ),
  );
});
