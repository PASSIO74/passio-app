// Journal d'audit — trace toute action sensible (connexions, mutations code,
// changements de flags, exécutions de tests, consultations admin). Append-only,
// borné, persisté. Aucune correction/déploiement ne doit être sans traçabilité.
import { JsonDb } from "./jsondb.js";

const db = new JsonDb("audit", { items: [] });

export function audit(action, details = {}, actor = null) {
  const entry = { id: "au_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), action, actor, details };
  db.update((d) => { d.items.unshift(entry); if (d.items.length > 5000) d.items.pop(); });
  return entry;
}

export function listAudit(limit = 300, filter = {}) {
  let items = db.get().items;
  if (filter.action) items = items.filter((i) => i.action === filter.action);
  if (filter.actor) items = items.filter((i) => i.actor === filter.actor);
  return items.slice(0, limit);
}
