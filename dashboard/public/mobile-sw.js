// RETIRÉ le 2026-10-23 : le pilote mobile du PC est remplacé par le pilotage en
// ligne (https://passio-app.netlify.app/pilotage/). Ce fichier n'existe plus que
// pour DÉSINSTALLER l'ancien service worker là où il s'était installé (sur
// http://localhost:4610, contexte sécurisé, il contrôlait la racine du
// Control Center) : un 404 à sa place l'aurait laissé servir l'ancienne page
// depuis son cache, indéfiniment. Il vide ses caches, se désinscrit et
// recharge les pages qu'il contrôlait. Aucun gestionnaire `fetch` : tout passe
// par le réseau.
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cles = await caches.keys();
    await Promise.all(cles.filter((k) => k.startsWith("passio-pilot-")).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: "window" });
    for (const p of pages) { try { p.navigate(p.url); } catch (_e) { /* page déjà fermée */ } }
  })());
});
