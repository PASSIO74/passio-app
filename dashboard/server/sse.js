// Diffusion temps réel vers les navigateurs via Server-Sent Events.
// Choix SSE plutôt que WebSocket : flux unidirectionnel serveur→client (les
// commandes passent par REST), reconnexion automatique native, plus simple à
// sécuriser derrière l'auth par cookie. Un canal, plusieurs types de messages.
import { noteSseHeartbeat } from "./observation.js";

const clients = new Set();

export function addClient(res) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

/** Émet un message typé à tous les clients connectés. */
export function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  let delivered = 0;
  for (const res of clients) {
    try { res.write(payload); delivered++; } catch (e) { clients.delete(res); }
  }
  return delivered;
}

export function clientCount() { return clients.size; }

// Battement de cœur : preuve que le serveur arrive encore à écrire vers les
// connexions dashboard ouvertes. Ce n'est pas un ACK applicatif du navigateur,
// mais c'est un seam mesuré et explicite — jamais confondu avec un vrai ACK.
setInterval(() => {
  const id = "hb_" + Date.now().toString(36);
  const delivered = broadcast("ping", { t: Date.now(), id, clients: clients.size });
  noteSseHeartbeat({ id, clients: delivered });
}, 25_000).unref();
