// ═══════════════════════════════════════════════════════════════════════════
// ALERTES — détecte les situations anormales et les diffuse au dashboard.
// Architecture extensible : chaque alerte passe par emit(), point unique où l'on
// pourra brancher plus tard e-mail / webhook / messagerie (voir NOTIFY_SINKS).
// ═══════════════════════════════════════════════════════════════════════════
import { store } from "./store.js";
import { broadcast } from "./sse.js";
import { JsonDb } from "./jsondb.js";

const db = new JsonDb("alerts", { items: [] });
const cooldown = new Map();           // évite le spam d'une même alerte

// Points de sortie additionnels (désactivés tant que non configurés).
const NOTIFY_SINKS = [
  // { type: "webhook", url: "...", enabled: false },
  // { type: "email", to: "...", enabled: false },
];

function emit(alert) {
  const key = alert.key || alert.title;
  const now = Date.now();
  if (cooldown.get(key) && now - cooldown.get(key) < 60_000) return; // 1/min max
  cooldown.set(key, now);
  const record = { id: "al_" + now.toString(36), ts: now, acknowledged: false, ...alert };
  db.update((d) => { d.items.unshift(record); if (d.items.length > 500) d.items.pop(); });
  broadcast("alert", record);
  // Extension future : router vers NOTIFY_SINKS activés.
  for (const sink of NOTIFY_SINKS) { if (sink.enabled) { /* TODO brancher le canal */ } }
  return record;
}

let errorWindow = [];

export function onEvent(ev) {
  const now = Date.now();

  if (ev.type === "error") {
    const bug = store.bug(bugIdOf(ev));
    // Erreur critique isolée
    if (ev.severity === "critical") {
      emit({ level: "critical", key: "crit:" + (ev.action || ev.message), title: "Erreur critique",
        message: ev.message || ev.action, meta: { bug: bug?.id, screen: ev.screen, user: ev.user_label } });
    }
    // Même bug touchant plusieurs utilisateurs
    if (bug && bug.users >= 2) {
      emit({ level: "high", key: "multi:" + bug.id, title: "Bug touchant plusieurs utilisateurs",
        message: `${bug.title} — ${bug.users} utilisateurs, ${bug.count} occurrences`, meta: { bug: bug.id } });
    }
    // Pic d'erreurs (>= 6 en 60 s)
    errorWindow.push(now);
    errorWindow = errorWindow.filter((t) => now - t < 60_000);
    if (errorWindow.length >= 6) {
      emit({ level: "high", key: "spike", title: "Pic d'erreurs", message: `${errorWindow.length} erreurs en 1 minute` });
    }
  }

  // Problème de connexion d'un testeur (coupure réseau, échecs d'envoi répétés).
  // C'est le signal le plus demandé : un testeur qui perd le réseau doit
  // APPARAÎTRE, pas disparaître silencieusement du dashboard.
  if (ev.type === "connectivity" && ev.severity !== "info") {
    const who = ev.user_label || "Un testeur";
    const level = ev.severity === "error" ? "high" : "warn";
    emit({
      level, key: "conn:" + (ev.device_id || ev.user_id || ev.user_label || "?"),
      title: "Problème de connexion d'un testeur",
      message: `${who} — ${ev.message || ev.action}`,
      meta: { user: ev.user_label, device: ev.device_id, screen: ev.screen, action: ev.action },
    });
  }

  // Liens partagés : ouverture confirmée (info) ou échec de chargement (warn).
  // Le cooldown par clé (60 s/lien) évite l'avalanche si un lien est ouvert en boucle.
  if (ev.type === "link") {
    const linkId = ev.correlation_id || (ev.meta && ev.meta.link_id) || "?";
    if (ev.action === "link_open" && ev.status !== "error") {
      emit({ level: "info", key: "linkopen:" + linkId, title: "Lien ouvert",
        message: `Un lien partagé vient d'être ouvert${ev.platform ? " (" + ev.platform + (ev.browser ? " · " + ev.browser : "") + ")" : ""}.`,
        meta: { link: linkId, platform: ev.platform, browser: ev.browser } });
    } else if (ev.action === "link_load_error" || (ev.action === "link_open" && ev.status === "error")) {
      emit({ level: "warn", key: "linkerr:" + linkId, title: "Échec d'ouverture d'un lien",
        message: ev.message || "Un lien n'a pas pu se charger correctement.", meta: { link: linkId } });
    }
  }

  // API lente / en échec
  if (ev.type === "api") {
    if (ev.status === "error" && ev.http_status >= 500) {
      emit({ level: "high", key: "api5xx:" + ev.endpoint, title: "Erreur serveur API", message: `${ev.endpoint} → ${ev.http_status}`, meta: { endpoint: ev.endpoint } });
    } else if (ev.duration_ms > 4000) {
      emit({ level: "warn", key: "apislow:" + ev.endpoint, title: "API très lente", message: `${ev.endpoint} — ${ev.duration_ms} ms`, meta: { endpoint: ev.endpoint } });
    }
  }
}

// Recalcule l'empreinte comme store (dupliquée volontairement, fonction pure).
import crypto from "node:crypto";
function bugIdOf(ev) {
  const msg = String(ev.message || ev.action || "erreur")
    .replace(/https?:\/\/\S+/g, "«url»").replace(/\b[a-f0-9]{8,}\b/gi, "«id»").replace(/\d+/g, "#").slice(0, 140);
  const frame = String(ev.stack || "").split("\n").map((l) => l.trim()).find((l) => /\.js/i.test(l)) || "";
  const frameNorm = frame.replace(/:\d+:\d+/g, "").replace(/\?[^):]*/g, "").slice(0, 160);
  return crypto.createHash("sha1").update([ev.type, ev.action, msg, frameNorm, ev.app_version].join("|")).digest("hex").slice(0, 12);
}

export function listAlerts() { return db.get().items; }
export function acknowledge(id) {
  db.update((d) => { const a = d.items.find((x) => x.id === id); if (a) a.acknowledged = true; });
  return true;
}
export function raiseManual(alert) { return emit({ level: alert.level || "info", key: "manual:" + Date.now(), title: alert.title || "Alerte manuelle", message: alert.message || "", manual: true }); }
