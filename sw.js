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

// ════════════════════════════════════════════════════════════════════════
// WEB PUSH — appels entrants même app fermée
// ════════════════════════════════════════════════════════════════════════
// Réception d'une push : affiche une notification « Appel entrant » persistante
// avec un bouton Répondre. Le tap ouvre l'app sur l'écran d'appel.
self.addEventListener("push", e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_e) { data = {}; }
  if (data.type !== "call") return;
  const title = (data.emoji || "📞") + " " + (data.name || "Quelqu'un") + " t'appelle";
  const opts = {
    body: data.kind === "video" ? "Appel vidéo entrant — touche pour répondre" : "Appel entrant — touche pour répondre",
    tag: "passio-call-" + (data.callId || ""),
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { callId: data.callId, from: data.from, kind: data.kind, name: data.name, emoji: data.emoji },
    actions: [
      { action: "answer", title: "✅ Répondre" },
      { action: "decline", title: "📵 Refuser" },
    ],
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// Tap sur la notification (ou un de ses boutons) → ouvre/focus l'app avec les
// paramètres d'appel dans l'URL. La page lit ?call=… au boot et ouvre l'écran
// d'appel entrant (réponse explicite par l'utilisateur).
self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "decline") return; // refus : on ferme juste la notif
  const d = e.notification.data || {};
  const qs = "?call=" + encodeURIComponent(d.callId || "") +
             "&from=" + encodeURIComponent(d.from || "") +
             "&kind=" + encodeURIComponent(d.kind || "voice") +
             "&cname=" + encodeURIComponent(d.name || "") +
             "&cemoji=" + encodeURIComponent(d.emoji || "");
  const target = "./" + qs;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if ("focus" in c) {
          // App déjà ouverte : on la focus et on lui transmet l'appel via message.
          c.postMessage({ type: "INCOMING_CALL", call: d });
          return c.focus();
        }
      }
      // App fermée : on l'ouvre sur l'URL qui déclenche l'écran d'appel.
      if (self.clients.openWindow) return self.clients.openWindow(target);
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
