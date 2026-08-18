const CACHE = "passio-pilot-v2";
const STATIC = ["/mobile.html", "/css/mobile.css", "/js/mobile.js", "/mobile-manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith("passio-pilot-")).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const u = new URL(event.request.url);
  if (u.origin !== location.origin) return;
  if (u.pathname.startsWith("/api/")) return; // preuves vivantes : jamais interceptées ni mises en cache
  if (event.request.method !== "GET") return;

  // Network-first : quand le téléphone est en ligne, il récupère la surface la
  // plus récente. Le cache n'est qu'un fallback offline, jamais la source de
  // vérité d'un cockpit de pilotage.
  event.respondWith((async () => {
    try {
      const fresh = await fetch(event.request, { cache: "no-cache" });
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, fresh.clone());
      }
      return fresh;
    } catch (e) {
      const hit = await caches.match(event.request);
      if (hit) return hit;
      throw e;
    }
  })());
});
