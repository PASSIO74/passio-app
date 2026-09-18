// ═══════════════════════════════════════════════════════════════════════════
// ALERTES — détecte les situations anormales et les diffuse au dashboard.
// Architecture extensible : chaque alerte passe par emit(), point unique où l'on
// pourra brancher plus tard e-mail / webhook / messagerie (voir NOTIFY_SINKS).
// ═══════════════════════════════════════════════════════════════════════════
import { store } from "./store.js";
import { entree } from "./liste-blanche.js";
import { broadcast } from "./sse.js";
import { JsonDb } from "./jsondb.js";
import { drainNewVerdicts } from "./traces.js";
import { recordIncident } from "./incident-packets.js";

const db = new JsonDb("alerts", { items: [] });
const cooldown = new Map();           // évite le spam d'une même alerte

// Points de sortie additionnels (désactivés tant que non configurés).
const NOTIFY_SINKS = [
  // { type: "webhook", url: "...", enabled: false },
  // { type: "email", to: "...", enabled: false },
];

// Abonnés internes au flux d'alertes (la sentinelle de débogage automatique).
// Un abonné qui échoue ne doit JAMAIS empêcher l'alerte de partir vers le
// dashboard : l'alerte est le signal primaire, l'analyse n'est qu'un bonus.
const subscribers = [];
export function onAlert(fn) { subscribers.push(fn); return () => { const i = subscribers.indexOf(fn); if (i >= 0) subscribers.splice(i, 1); }; }

function emit(alert) {
  const key = alert.key || alert.title;
  const now = Date.now();
  if (cooldown.get(key) && now - cooldown.get(key) < 60_000) return; // 1/min max
  cooldown.set(key, now);
  const base = { id: "al_" + now.toString(36), ts: now, acknowledged: false, ...alert };
  // Chaque alerte exploitable produit d'abord un dossier de preuves déterministe.
  // Claude peut être indisponible : le dossier reste utile, consultable et prêt
  // à être donné plus tard à un agent sans refaire l'enquête de base.
  let incident = null;
  try { incident = recordIncident(base); } catch (e) { /* l'alerte primaire doit survivre */ }

  // La causalité doit survivre au passage dans Sentinel. `sentinel.js` persiste
  // déjà `alert.meta` dans chaque diagnostic puis transmet ce record au réparateur.
  // On place donc ici l'identité de l'Incident Packet, au point unique d'émission,
  // plutôt que de tenter de la reconstruire plus tard par titre/temps/révision.
  const causalMeta = incident ? {
    ...(base.meta || {}),
    incidentId: incident.id,
    incidentClusterKey: incident.clusterKey || null,
  } : (base.meta || {});
  const record = incident
    ? { ...base, meta: causalMeta, incidentId: incident.id, incident }
    : { ...base, meta: causalMeta };

  db.update((d) => { d.items.unshift(record); if (d.items.length > 500) d.items.pop(); });
  broadcast("alert", record);
  for (const fn of subscribers) { try { fn(record); } catch (e) { console.error("[alerts] abonné en échec:", e.message); } }
  // Extension future : router vers NOTIFY_SINKS activés.
  for (const sink of NOTIFY_SINKS) { if (sink.enabled) { /* TODO brancher le canal */ } }
  return record;
}

let errorWindow = [];

export function onEvent(ev) {
  const now = Date.now();

  // Une erreur explicitement rétrogradée en `warn` par son émetteur (coupure
  // réseau sur un chemin qui échoue ouvert, telemetry.js/app-07) n'alimente ni
  // le pic ni l'alerte multi-utilisateurs : elle n'est pas un défaut.
  if (ev.type === "error" && ev.severity !== "warn") {
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

  // Refus d'authentification en série (LOT E1, E-M1/E-T1). Le hook fetch marque
  // tout 400 de /auth/v1/token « refus_attendu » (un mot de passe faux n'est pas
  // un défaut) — mais une vague de « Email not confirmed » (SMTP en panne) ou un
  // captcha cassé est un défaut d'USAGE que personne ne voyait : le client émet
  // désormais signin_refused/signup_refused {rc} depuis onbDoAuth, qui lit le
  // verdict. Un seul appareil qui insiste n'est pas une vague : il faut ≥ 2.
  if (ev.action === "signin_refused" || ev.action === "signup_refused") {
    const rc = ev.meta && ev.meta.rc;
    if (RC_REFUS_SIGNAL.has(rc)) {
      refusAuthWindow.push({ ts: Number(ev.ts) || now, device: ev.device_id || ev.session_id || "?", rc });
      refusAuthWindow = refusAuthWindow.filter((r) => now - r.ts < REFUS_AUTH_FENETRE_MS);
      const vague = serieRefusAuth(refusAuthWindow, rc);
      if (vague) {
        emit({ level: "warn", key: "authrefus:" + rc, title: "Refus d'authentification en série",
          message: `${vague.n} refus « ${RC_REFUS_LIBELLE[rc] || rc} » sur ${vague.appareils} appareils en 1 h`,
          meta: { rc, n: vague.n, appareils: vague.appareils } });
        // Une vague = une alerte : on repart de zéro pour ce motif, sinon chaque
        // refus suivant la relèverait (le cooldown de 60 s ne suffit pas sur 1 h).
        refusAuthWindow = refusAuthWindow.filter((r) => r.rc !== rc);
      }
    }
  }
}

// Motifs FERMÉS (rcRefusAuth, app-02) qui signalent un défaut d'usage — jamais
// `mdp` (mot de passe faux) ni `deja_utilise` : ce sont des refus normaux.
const RC_REFUS_SIGNAL = new Set(["non_confirme", "captcha"]);
const RC_REFUS_LIBELLE = { non_confirme: "e-mail non confirmé", captcha: "captcha refusé" };
const REFUS_AUTH_FENETRE_MS = 60 * 60_000;
const REFUS_AUTH_SEUIL = 3;
const REFUS_AUTH_APPAREILS = 2;
let refusAuthWindow = [];

/** Fonction PURE : la fenêtre (déjà bornée à 1 h) contient-elle une vague pour
 *  ce motif — ≥ 3 refus venus d'au moins 2 appareils distincts ? Rend
 *  { n, appareils } ou null. Exportée pour être éprouvée sans le bus d'alertes. */
export function serieRefusAuth(fenetre, rc) {
  const memes = (fenetre || []).filter((r) => r.rc === rc);
  const appareils = new Set(memes.map((r) => r.device)).size;
  if (memes.length < REFUS_AUTH_SEUIL || appareils < REFUS_AUTH_APPAREILS) return null;
  return { n: memes.length, appareils };
}
/** Réservé aux tests : vide la fenêtre glissante. */
export function _resetRefusAuth() { refusAuthWindow = []; }

// ─── Chaînes d'actions cassées (traçage bout-en-bout) ──────────────────────
// Le verdict d'une action n'est connu qu'une fois le flux FIGÉ : il ne peut pas
// être évalué depuis onEvent(), d'où ce balayage périodique. Sans lui, un clic
// mort n'existe que si quelqu'un ouvre l'onglet — or c'est précisément le genre
// de panne qu'il faut apprendre SANS aller la chercher.
const VERDICT_ALERT = {
  // Un bouton qui ne déclenche rien est une panne d'usage, pas un détail.
  dead_click: { level: "high", title: "Clic sans effet" },
  failed: { level: "high", title: "Action en échec" },
  // Enregistré mais avec une étape défaillante : donnée à moitié partie.
  partial: { level: "warn", title: "Action partiellement aboutie" },
  slow: { level: "warn", title: "Action anormalement lente" },
};

export function sweepTraces() {
  let verdicts;
  try { verdicts = drainNewVerdicts(); } catch (e) { return; }
  for (const v of verdicts) {
    const spec = entree(VERDICT_ALERT, v.final);
    if (!spec) continue;
    const failStep = (v.steps || []).find((s) => s.status === "fail")
      || (v.steps || []).find((s) => s.status === "missing");
    const stepLabel = failStep ? failStep.label : v.final;
    emit({
      level: spec.level,
      // Clé = action + étape : 50 échecs du même envoi de message = 1 alerte,
      // mais un échec d'étape DIFFÉRENTE reste distingué.
      key: `trace:${v.final}:${v.action}:${failStep ? failStep.key : "-"}`,
      title: `${spec.title} — ${v.actionLabel}`,
      message: `Étape « ${stepLabel} »${failStep?.http_status ? ` (HTTP ${failStep.http_status})` : ""}`
        + `${v.screen ? ` · écran ${v.screen}` : ""}${v.durationMs != null ? ` · ${v.durationMs} ms` : ""}`,
      meta: { cid: v.cid, action: v.action, step: failStep?.key || null, screen: v.screen, user: v.label, view: "traces" },
    });
  }
  // Un doublon est un signal distinct : l'action a pu ABOUTIR deux fois.
  for (const v of verdicts) {
    if (!v.duplicate) continue;
    emit({ level: "warn", key: `tracedup:${v.action}`,
      title: `Doublon — ${v.actionLabel}`,
      message: "Une même intention a produit plusieurs exécutions (double clic, relance ou bouton non désactivé).",
      meta: { cid: v.cid, action: v.action, view: "traces" } });
  }
}

// Balayage périodique (5 s) : assez réactif pour une beta, assez espacé pour
// ne rien coûter. `unref()` : ne maintient jamais le process en vie.
setInterval(sweepTraces, 5000).unref();

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
