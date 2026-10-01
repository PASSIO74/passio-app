// Service worker du pilotage, portée /pilotage/ (plus précise que celle de
// l'app : c'est lui qui contrôle ces pages). Réseau d'abord : un cockpit ne
// doit jamais afficher une vieille version ; le cache ne sert qu'hors ligne.
// Les appels à Supabase (autre origine) ne sont jamais interceptés.
const CACHE = "passio-pilotage-v3";
const STATIC = ["/pilotage/", "/pilotage/index.html", "/pilotage/pilotage.js", "/pilotage/pilotage.css", "/pilotage/config.js",
  "/pilotage/manifest.webmanifest", "/pilotage/icons/pilot-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith("passio-pilotage-") && x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET" || !u.pathname.startsWith("/pilotage/")) return;
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request, { cache: "no-cache" });
      if (r && r.ok) { const c = await caches.open(CACHE); await c.put(e.request, r.clone()); }
      return r;
    } catch (err) {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      throw err;
    }
  })());
});
