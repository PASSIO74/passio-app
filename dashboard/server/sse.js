// Diffusion temps réel vers les navigateurs via Server-Sent Events.
// Choix SSE plutôt que WebSocket : flux unidirectionnel serveur→client (les
// commandes passent par REST), reconnexion automatique native, plus simple à
// sécuriser derrière l'auth par cookie. Un canal, plusieurs types de messages.
//
// ⚠️ LE FLUX PORTE LES MÊMES FRONTIÈRES QUE LES ROUTES (audit du 2026-11-02).
// `/api/sentinel*` exige la capacité `claude` parce qu'un diagnostic cite du
// code du dépôt et le résultat d'une réparation ; `/api/git/*`, `git_read`.
// Or `broadcast("sentinel", record)` écrivait le diagnostic COMPLET à TOUS les
// abonnés de `/api/stream` — un `observer` ou un `tester` (DASH_EXTRA_USERS)
// recevait par la bande ce que la route lui refusait. Chaque message typé est
// donc associé à la capacité qu'exige sa route (`CAPACITE_PAR_TYPE`) et n'est
// écrit qu'aux clients dont la session la porte. Un type inconnu reste lisible
// par toute session authentifiée (`view`) : le comportement d'avant pour tout ce
// qui n'est pas réservé.
import { noteSseHeartbeat } from "./observation.js";
import { can } from "./auth.js";

const clients = new Set();

/** Type de message → capacité de la route REST qui expose la même information. */
export const CAPACITE_PAR_TYPE = Object.freeze({
  sentinel: "claude",              // GET /api/sentinel, /api/sentinel/:id (diagnostic + réparation)
  sentinel_repair: "claude",       // phases d'une réparation (branche, suite jouée)
  sentinel_autopilot: "claude",    // promotion locale d'une branche de réparation
  sentinel_production: "claude",   // publication (push, PR) d'une réparation
  sentinel_recurrence: "claude",
  sentinel_state: "claude",        // GET /api/sentinel (état)
  test: "tests",                   // sortie des suites (POST /api/tests/run exige `tests`)
});

/**
 * Inscrit un navigateur. `role` est celui de la session qui a ouvert
 * `/api/stream` ; sans rôle (ancien appelant, test), le client ne reçoit que ce
 * qui n'est réservé à aucune capacité — échec fermé.
 */
export function addClient(res, role = null) {
  res.__role = role;
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

/** Le client a-t-il le droit de recevoir un message de ce type ? */
export function peutRecevoir(role, type) {
  const cap = CAPACITE_PAR_TYPE[type];
  if (!cap) return true;
  return can(role, cap);
}

/** Émet un message typé aux clients connectés QUI ONT LE DROIT de le lire. */
export function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  let delivered = 0;
  for (const res of clients) {
    if (!peutRecevoir(res.__role, type)) continue;
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
