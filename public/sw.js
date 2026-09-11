/* AMENDMENT-02 §4 — a minimal shell service worker for instant opens. It caches
   static assets (the app shell / icons) with a stale-while-revalidate touch, and
   NEVER caches navigations, API, or auth — pages stay live and private. No
   offline-write complexity. */
const CACHE = "veritas-shell-v2";
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

/* Web Push — a tap on the shoulder, never content. The payload is a short
   title/body plus an in-app destination; tapping focuses an open tab (or opens
   one) at that destination. */
self.addEventListener("push", (event) => {
  let data = { title: "veritas", body: "Something is waiting for you.", url: "/space" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/space";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
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
