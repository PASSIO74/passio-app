// Diffusion temps réel vers les navigateurs via Server-Sent Events.
// Choix SSE plutôt que WebSocket : flux unidirectionnel serveur→client (les
// commandes passent par REST), reconnexion automatique native, plus simple à
// sécuriser derrière l'auth par cookie. Un canal, plusieurs types de messages.
const clients = new Set();

export function addClient(res) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

/** Émet un message typé à tous les clients connectés. */
export function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (e) { clients.delete(res); }
  }
}

export function clientCount() { return clients.size; }

// Battement de cœur pour garder les connexions ouvertes (proxies).
setInterval(() => broadcast("ping", { t: Date.now(), clients: clients.size }), 25_000).unref();
