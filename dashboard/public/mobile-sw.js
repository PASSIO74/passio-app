const CACHE = "passio-pilot-v1";
const STATIC = ["/mobile.html", "/css/mobile.css", "/js/mobile.js", "/mobile-manifest.webmanifest"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith("passio-pilot-")).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const u = new URL(event.request.url);
  if (u.origin !== location.origin) return;
  if (u.pathname.startsWith("/api/")) return; // santé/Guardian/incidents : jamais de cache
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
