const CACHE = "passio-v3";
const PRECACHE = ["./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

// Répond au message SKIP_WAITING envoyé par la page
self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Installation : préchargement
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting(); // Prend le contrôle immédiatement
});

// Activation : supprime les anciens caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // Prend le contrôle de tous les onglets ouverts
});

// Fetch : stratégie réseau-d'abord pour index.html, cache-d'abord pour le reste
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Ne pas intercepter les appels externes (Supabase, CDN, etc.)
  if (url.hostname !== self.location.hostname) return;

  // index.html → réseau d'abord (pour toujours avoir la dernière version)
  if (url.pathname.endsWith("/") || url.pathname.endsWith("index.html") || url.pathname === "/") {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Autres fichiers → cache d'abord, réseau en fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});
