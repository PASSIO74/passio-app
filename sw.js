// Version auto-générée à chaque modification — à incrémenter manuellement si besoin
const CACHE = "passio-v" + Date.now();

// Répond au message SKIP_WAITING
self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Installation : pré-cache les fichiers essentiels avec la nouvelle version
self.addEventListener("install", e => {
  self.skipWaiting(); // Active immédiatement sans attendre la fermeture des onglets
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll(["./manifest.json", "./icon-192.png", "./icon-512.png"])
        .catch(() => {}) // Ne pas bloquer si une icône manque
    )
  );
});

// Activation : supprime tous les anciens caches et prend le contrôle
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // Prend le contrôle immédiatement
      .then(() => {
        // Notifie tous les onglets ouverts de recharger
        return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
          clients.forEach(client => client.postMessage({ type: "SW_UPDATED" }));
        });
      })
  );
});

// Fetch : network-first pour index.html, cache-first pour le reste
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Ne pas intercepter les appels externes (Supabase, CDN Leaflet, etc.)
  if (url.hostname !== self.location.hostname) return;

  // index.html → toujours réseau d'abord pour avoir la dernière version
  if (
    url.pathname === "/" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("index.html")
  ) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Icônes et manifest → cache-first (ne changent presque jamais)
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
      return cached || network;
    })
  );
});
