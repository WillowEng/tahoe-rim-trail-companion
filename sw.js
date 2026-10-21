const SHELL = "trt-v2-shell",
  PACK = "trt-v2-pack";
const core = [
  "./",
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "icon-v1.svg",
  "apple-touch-icon-v1.png",
  "src/app.js",
  "src/navigation.js",
  "src/offline.js",
  "src/map-layers.js",
  "data/relief-v2.json",
  "data/boundaries-v2.geojson",
  "vendor/leaflet.js",
  "vendor/leaflet.css",
  "data/route-v1.json",
  "data/waypoints-v1.json",
  "data/terrain-v1.json",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(core);
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const pack = await caches.open(PACK),
        shell = await caches.open(SHELL);
      const url = new URL(event.request.url);
      if (
        event.request.mode === "navigate" &&
        url.pathname === self.registration.scope.replace(url.origin, "")
      )
        url.pathname += "index.html";
      // Explicit no-store requests are verification/download operations and must reach the network.
      if (event.request.cache === "no-store") return fetch(event.request);
      return (
        (await pack.match(url)) ||
        (await shell.match(url)) ||
        (await fetch(event.request))
      );
    })(),
  );
});
