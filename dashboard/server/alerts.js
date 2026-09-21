// ═══════════════════════════════════════════════════════════════════════════
// ALERTES — détecte les situations anormales et les diffuse au dashboard.
// Architecture : chaque alerte passe par emit(), point unique où sont branchés
// le dossier d'incident, le JSON, le flux SSE, les abonnés (sentinelle) et les
// points de sortie (NOTIFY_SINKS, voir notify-sinks.js).
//
// CONTRAT DE `raise()` (émetteur public typé, 2026-09-18) :
//   · `key` OBLIGATOIRE et STABLE (« disk:low », « obs:canary ») : c'est elle
//     qui déduplique (cooldown), qui regroupe les incidents et que les sinks
//     suivent pour savoir qu'une situation est revenue (`level: "info"` sur la
//     même clé = retour) ;
//   · cooldown 60 s par clé par défaut, surchargeable par alerte (`cooldownMs`),
//     0 = aucun (les modules à bascule garantissent déjà « une par bascule ») ;
//   · niveaux : critical/high sont analysés par la sentinelle, warn/info
//     seulement affichés ; `manual:false` — `raiseManual` reste réservé à la
//     route POST /alerts/manual ;
//   · le JSON garde 500 alertes ; un abonné ou un sink qui échoue n'empêche
//     jamais l'alerte d'être enregistrée et diffusée.
//
// BRUIT (2026-09-18, mesuré sur 14 j : 125 alertes sur 133 étaient « API très
// lente » ou « connexion d'un testeur », 0 acquittée) :
//   · « API très lente » est AGRÉGÉE par endpoint sur 15 min : il faut ≥ 3
//     appels > 4 s ET (≥ 2 appareils OU p50 > 4 s), hors appels en échec et hors
//     échecs expliqués par le client (page masquée, hors ligne, fermeture) —
//     un testeur en 3G ne fait plus 4 alertes par page ; cooldown 60 min ;
//   · « connexion d'un testeur » : seulement `send_failed` à partir de 3 échecs
//     (ou gravité error) et `offline` confirmé (aucun retour en ligne sous
//     2 min) ; jamais `recovered`/`online` ; cooldown 30 min par appareil ;
//     `conn:window` (high) si ≥ 3 appareils en 15 min : là c'est peut-être
//     nous, pas leur réseau. Ces alertes portent `meta.kind: "reseau"`.
//   · pas de dossier d'incident pour `info`, ni pour la PREMIÈRE occurrence
//     d'une clé conn:/apislow: en 24 h ;
//   · auto-acquittement : une alerte warn/info muette depuis 6 h (aucune
//     nouvelle occurrence de sa clé) passe `acknowledged:true, ackBy:"auto"` —
//     le badge et les risques ne s'empilent plus faute de clic.
//
// RETOUR (2026-09-21) : les modules à bascule (observation-alerts, disque, CLI,
// stockage) signalent la fin d'une panne par `level: "info"` sur la MÊME clé.
// Le sink GitHub [POSTE] refermait son issue sur ce retour, mais l'alerte
// high/critical d'origine restait `acknowledged:false` à vie — « Ce qui
// t'attend » empilait 15 pannes déjà réparées seules (5 « Ingestion sourde »,
// chacune rétablie 1 à 40 min après). Désormais un retour REFERME les alertes
// ouvertes de sa clé (`ackBy:"retour"`), à l'émission et au passage
// périodique (rattrapage de l'historique) : un humain n'a rien à acquitter
// pour une panne que la machine a déjà vue finir.
// ═══════════════════════════════════════════════════════════════════════════
import { store } from "./store.js";
import { entree } from "./liste-blanche.js";
import { broadcast } from "./sse.js";
import { JsonDb } from "./jsondb.js";
import { drainNewVerdicts } from "./traces.js";
import { recordIncident } from "./incident-packets.js";
import { construireSinks } from "./notify-sinks.js";

const db = new JsonDb("alerts", { items: [] });
const cooldown = new Map();           // évite le spam d'une même alerte
const COOLDOWN_MS = 60_000;

// Points de sortie (notify-sinks.js). Construits d'après l'environnement, sans
// réseau à l'import ; remplaçables dans les tests.
let NOTIFY_SINKS = construireSinks(process.env);
export function _setSinksForTests(sinks) { NOTIFY_SINKS = Array.isArray(sinks) ? sinks : []; }

// Abonnés internes au flux d'alertes (la sentinelle de débogage automatique).
// Un abonné qui échoue ne doit JAMAIS empêcher l'alerte de partir vers le
// dashboard : l'alerte est le signal primaire, l'analyse n'est qu'un bonus.
// L'appel reste SYNCHRONE (sentinel.test.js en dépend).
const subscribers = [];
export function onAlert(fn) { subscribers.push(fn); return () => { const i = subscribers.indexOf(fn); if (i >= 0) subscribers.splice(i, 1); }; }

// Première occurrence d'une clé de bruit : pas de dossier d'incident tant que la
// clé n'est pas revenue dans les 24 h.
const PAQUET_2E_OCCURRENCE_MS = 24 * 3_600_000;
const premieres = new Map();
function meriteUnPaquet(alert, now) {
  if (alert.level === "info") return false;
  const key = String(alert.key || "");
  if (!/^(conn|apislow):/.test(key)) return true;
  const prec = premieres.get(key);
  premieres.set(key, now);
  return Boolean(prec && now - prec < PAQUET_2E_OCCURRENCE_MS);
}

let seq = 0;
function emit(alert, now = Date.now()) {
  const key = alert.key || alert.title;
  const cd = Number.isFinite(alert.cooldownMs) ? Math.max(0, alert.cooldownMs) : COOLDOWN_MS;
  if (cd > 0 && cooldown.get(key) && now - cooldown.get(key) < cd) return null;
  cooldown.set(key, now);
  const { cooldownMs, ...reste } = alert;
  const base = { id: "al_" + now.toString(36) + (seq++ % 1296).toString(36).padStart(2, "0"), ts: now, acknowledged: false, ...reste, key };
  // Chaque alerte exploitable produit d'abord un dossier de preuves déterministe.
  // Claude peut être indisponible : le dossier reste utile, consultable et prêt
  // à être donné plus tard à un agent sans refaire l'enquête de base.
  let incident = null;
  if (meriteUnPaquet(base, now)) {
    try { incident = recordIncident(base); } catch (e) { /* l'alerte primaire doit survivre */ }
  }

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

  db.update((d) => {
    // Un retour referme ce qu'il annonce fini : les alertes ouvertes de sa clé.
    if (record.level === "info") refermerParRetour(d.items, record.key, now);
    d.items.unshift(record); if (d.items.length > 500) d.items.pop();
  });
  broadcast("alert", record);
  for (const fn of subscribers) { try { fn(record); } catch (e) { console.error("[alerts] abonné en échec:", e.message); } }
  // Points de sortie : chacun isolé, asynchrone, et sans effet sur ce qui précède.
  for (const sink of NOTIFY_SINKS) {
    try {
      if (!sink || sink.enabled === false || !sink.accepte(record)) continue;
      Promise.resolve().then(() => sink.envoyer(record)).catch((e) => console.error(`[alerts] sink ${sink.type} en échec :`, e && e.message ? e.message : e));
    } catch (e) { console.error(`[alerts] sink ${sink.type || "?"} en échec :`, e && e.message ? e.message : e); }
  }
  return record;
}

/**
 * Émetteur public typé pour les modules du serveur (disque, CLI, observation,
 * chaîne autonome, stockage). `key` obligatoire — voir le contrat en tête.
 */
export function raise(a, now = Date.now()) {
  if (!a || typeof a.key !== "string" || !a.key.trim()) throw new Error("raise : une clé stable (key) est obligatoire");
  return emit({
    level: a.level || "info", key: a.key.trim(), title: a.title || a.key, message: a.message || "",
    meta: a.meta || {}, source: a.source || null, manual: false, cooldownMs: a.cooldownMs,
  }, now);
}

let errorWindow = [];

// ─── « API très lente » : agrégation par endpoint sur 15 min ────────────────
const SLOW_MS = 4000;
const SLOW_WINDOW_MS = 15 * 60_000;
const SLOW_MIN_APPELS = 3;
const SLOW_COOLDOWN_MS = 60 * 60_000;
const slowByEndpoint = new Map();   // endpoint -> [{ ts, ms, device, screen }]

/** Un échec que le client a lui-même expliqué (page masquée, hors ligne, fermeture, refus attendu). */
export function echecExpliqueParLeClient(ev) {
  const m = (ev && ev.meta) || {};
  return Boolean(m.masquee || m.hors_ligne || m.fermeture || m.refus_attendu);
}

/**
 * Verdict pur sur la fenêtre d'appels d'un endpoint (TOUS les appels, pas
 * seulement les lents : la p50 se mesure sur l'ensemble, sinon elle serait
 * toujours > 4 s par construction). Alerte si ≥ 3 appels lents ET (≥ 2
 * appareils touchés OU la moitié des appels est lente).
 */
export function evaluerLenteur(samples, seuilMs = SLOW_MS) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const q = (p) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : null);
  const lents = samples.filter((s) => s.ms > seuilMs);
  const devices = new Set(lents.map((s) => s.device).filter(Boolean)).size;
  const screens = [...new Set(lents.map((s) => s.screen).filter(Boolean))].slice(0, 5);
  const n = lents.length;
  const p50 = q(0.5), p90 = q(0.9);
  return { n, total: samples.length, p50, p90, devices, screens, alerte: n >= SLOW_MIN_APPELS && (devices >= 2 || p50 > seuilMs) };
}

function observerAppel(ev, now) {
  const endpoint = ev.endpoint || "?";
  const liste = (slowByEndpoint.get(endpoint) || []).filter((s) => now - s.ts < SLOW_WINDOW_MS).slice(-500);
  liste.push({ ts: now, ms: Number(ev.duration_ms) || 0, device: ev.device_id || ev.user_id || null, screen: ev.screen || null });
  slowByEndpoint.set(endpoint, liste);
  if (!(Number(ev.duration_ms) > SLOW_MS)) return null;
  const v = evaluerLenteur(liste);
  if (!v.alerte) return null;
  return emit({
    level: "warn", key: "apislow:" + endpoint, title: "API très lente", cooldownMs: SLOW_COOLDOWN_MS,
    message: `${endpoint} — ${v.n} appels lents en 15 min, p50 ${Math.round(v.p50 / 100) / 10} s, ${v.devices} appareil(s)`,
    meta: { endpoint, n: v.n, p50: v.p50, p90: v.p90, devices: v.devices, screens: v.screens, kind: "reseau" },
  }, now);
}

// ─── « connexion d'un testeur » : fait avéré seulement ──────────────────────
const CONN_COOLDOWN_MS = 30 * 60_000;
const OFFLINE_GRACE_MS = 2 * 60_000;
const CONN_WINDOW_MS = 15 * 60_000;
const CONN_WINDOW_MIN_DEVICES = 3;
const pendingOffline = new Map();   // device -> { ts, ev }
let connWindow = [];                // { ts, device }

function deviceDe(ev) { return ev.device_id || ev.user_id || ev.user_label || "?"; }

function alerterConnexion(ev, now) {
  const device = deviceDe(ev);
  const who = ev.user_label || "Un testeur";
  const r = emit({
    level: "warn", key: "conn:" + device, cooldownMs: CONN_COOLDOWN_MS,
    title: "Problème de connexion d'un testeur",
    message: `${who} — ${ev.message || ev.action}`,
    meta: { user: ev.user_label, device: ev.device_id, screen: ev.screen, action: ev.action, kind: "reseau" },
  }, now);
  connWindow = connWindow.filter((c) => now - c.ts < CONN_WINDOW_MS);
  connWindow.push({ ts: now, device });
  const devices = new Set(connWindow.map((c) => c.device)).size;
  if (devices >= CONN_WINDOW_MIN_DEVICES) {
    emit({
      level: "high", key: "conn:window", cooldownMs: CONN_COOLDOWN_MS, title: "Plusieurs testeurs en difficulté de connexion",
      message: `${devices} appareils en difficulté sur 15 min — ce n'est peut-être plus leur réseau, mais le nôtre.`,
      meta: { devices, kind: "reseau" },
    }, now);
  }
  return r;
}

/** Les `offline` dont le délai de grâce est écoulé sans retour en ligne deviennent des alertes. */
export function flushOffline(now = Date.now()) {
  const sorties = [];
  for (const [device, p] of pendingOffline) {
    if (now - p.ts < OFFLINE_GRACE_MS) continue;
    pendingOffline.delete(device);
    const r = alerterConnexion(p.ev, now);
    if (r) sorties.push(r);
  }
  return sorties;
}
setInterval(() => { try { flushOffline(); } catch {} }, 30_000).unref();

export function onEvent(ev, now = Date.now()) {
  flushOffline(now);

  // Une erreur explicitement rétrogradée en `warn` par son émetteur (coupure
  // réseau sur un chemin qui échoue ouvert, telemetry.js/app-07) n'alimente ni
  // le pic ni l'alerte multi-utilisateurs : elle n'est pas un défaut.
  if (ev.type === "error" && ev.severity !== "warn") {
    const bug = store.bug(bugIdOf(ev));
    // Erreur critique isolée
    if (ev.severity === "critical") {
      emit({ level: "critical", key: "crit:" + (ev.action || ev.message), title: "Erreur critique",
        message: ev.message || ev.action, meta: { bug: bug?.id, screen: ev.screen, user: ev.user_label } }, now);
    }
    // Même bug touchant plusieurs utilisateurs
    if (bug && bug.users >= 2) {
      emit({ level: "high", key: "multi:" + bug.id, title: "Bug touchant plusieurs utilisateurs",
        message: `${bug.title} — ${bug.users} utilisateurs, ${bug.count} occurrences`, meta: { bug: bug.id } }, now);
    }
    // Pic d'erreurs (>= 6 en 60 s)
    errorWindow.push(now);
    errorWindow = errorWindow.filter((t) => now - t < 60_000);
    if (errorWindow.length >= 6) {
      emit({ level: "high", key: "spike", title: "Pic d'erreurs", message: `${errorWindow.length} erreurs en 1 minute` }, now);
    }
  }

  // Problème de connexion d'un testeur (coupure réseau, échecs d'envoi répétés).
  // Un testeur qui perd le réseau doit APPARAÎTRE — mais un premier envoi raté
  // au chargement d'une page, ou la RÉCUPÉRATION, ne sont pas des problèmes.
  if (ev.type === "connectivity") {
    const device = deviceDe(ev);
    const action = String(ev.action || "");
    const m = ev.meta || {};
    if (action === "recovered" || action === "online") {
      pendingOffline.delete(device);
    } else if (action === "offline" && ev.severity !== "info") {
      if (!pendingOffline.has(device)) pendingOffline.set(device, { ts: now, ev });
    } else if (action === "send_failed" || action === "server_reject") {
      const avere = ev.severity === "error" || Number(m.failed_sends) >= 3;
      if (avere) alerterConnexion(ev, now);
    }
  }

  // Liens partagés : ouverture confirmée (info) ou échec de chargement (warn).
  // Le cooldown par clé (60 s/lien) évite l'avalanche si un lien est ouvert en boucle.
  if (ev.type === "link") {
    const linkId = ev.correlation_id || (ev.meta && ev.meta.link_id) || "?";
    if (ev.action === "link_open" && ev.status !== "error") {
      emit({ level: "info", key: "linkopen:" + linkId, title: "Lien ouvert",
        message: `Un lien partagé vient d'être ouvert${ev.platform ? " (" + ev.platform + (ev.browser ? " · " + ev.browser : "") + ")" : ""}.`,
        meta: { link: linkId, platform: ev.platform, browser: ev.browser } }, now);
    } else if (ev.action === "link_load_error" || (ev.action === "link_open" && ev.status === "error")) {
      emit({ level: "warn", key: "linkerr:" + linkId, title: "Échec d'ouverture d'un lien",
        message: ev.message || "Un lien n'a pas pu se charger correctement.", meta: { link: linkId } }, now);
    }
  }

  // API en échec (5xx) / API lente (agrégée par endpoint, hors échecs)
  if (ev.type === "api") {
    if (ev.status === "error" && ev.http_status >= 500) {
      emit({ level: "high", key: "api5xx:" + ev.endpoint, title: "Erreur serveur API", message: `${ev.endpoint} → ${ev.http_status}`, meta: { endpoint: ev.endpoint } }, now);
    } else if (ev.status !== "error" && !echecExpliqueParLeClient(ev)) {
      observerAppel(ev, now);
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

// ─── Retour : une panne que la machine a vue finir n'attend personne ────────
/** Acquitte (`ackBy:"retour"`) les alertes NON info de `key` encore ouvertes et
 *  antérieures à `retourTs`. Mute `items` en place ; rend le nombre refermées. */
function refermerParRetour(items, key, retourTs) {
  let n = 0;
  for (const a of items) {
    if ((a.key || a.title) !== key || a.acknowledged || a.level === "info" || a.ts > retourTs) continue;
    a.acknowledged = true; a.ackBy = "retour"; a.ackAt = retourTs; n++;
  }
  return n;
}

// ─── Auto-acquittement des alertes muettes ──────────────────────────────────
const AUTOACK_SILENCE_MS = 6 * 3_600_000;
const AUTOACK_MS = Math.max(0, Number(process.env.DASH_ALERTS_AUTOACK_MIN ?? 10)) * 60_000;
let _autoAckTimer = null;

/**
 * Acquitte les alertes warn/info dont la CLÉ n'a plus sonné depuis `silenceMs`,
 * et — quel que soit le niveau — celles dont la clé a reçu un RETOUR (`info`)
 * plus récent : la panne est finie, la machine l'a vu. Les high/critical sans
 * retour restent manuelles : elles attendent un humain ou la sentinelle.
 * Retourne le nombre d'alertes acquittées.
 */
export function autoAcquitter({ now = Date.now(), silenceMs = AUTOACK_SILENCE_MS } = {}) {
  let n = 0;
  db.update((d) => {
    const derniere = new Map();
    const retours = new Map();   // clé -> ts du retour le plus récent
    for (const a of d.items) {
      const k = a.key || a.title;
      if (!derniere.has(k)) derniere.set(k, a.ts); else derniere.set(k, Math.max(derniere.get(k), a.ts));
      if (a.level === "info") retours.set(k, Math.max(retours.get(k) || 0, a.ts));
    }
    for (const [k, ts] of retours) n += refermerParRetour(d.items, k, ts);
    for (const a of d.items) {
      if (a.acknowledged || (a.level !== "warn" && a.level !== "info")) continue;
      if (now - derniere.get(a.key || a.title) < silenceMs) continue;
      a.acknowledged = true; a.ackBy = "auto"; a.ackAt = now; n++;
    }
  });
  return n;
}

export function startAutoAck(everyMs = AUTOACK_MS) {
  if (_autoAckTimer || !everyMs) return _autoAckTimer;
  // Un passage dès le démarrage : l'historique (retours déjà reçus) est refermé
  // avant la première lecture de « Ce qui t'attend », pas 10 min plus tard.
  try { autoAcquitter(); } catch {}
  _autoAckTimer = setInterval(() => { try { autoAcquitter(); } catch {} }, everyMs);
  if (typeof _autoAckTimer.unref === "function") _autoAckTimer.unref();
  return _autoAckTimer;
}
export function stopAutoAck() { if (_autoAckTimer) { clearInterval(_autoAckTimer); _autoAckTimer = null; } }

export function listAlerts() { return db.get().items; }
export function acknowledge(id) {
  db.update((d) => { const a = d.items.find((x) => x.id === id); if (a) a.acknowledged = true; });
  return true;
}
export function raiseManual(alert) { return emit({ level: alert.level || "info", key: "manual:" + Date.now(), title: alert.title || "Alerte manuelle", message: alert.message || "", manual: true }); }

/**
 * Alerte levée par un MODULE du serveur (la sentinelle, pas un humain) : la clé
 * et le `meta` fournis sont CONSERVÉS. `raiseManual` ne convient pas ici — elle
 * réécrit la clé en `manual:<horodatage>` et jette `meta` (revue du 2026-09-18 :
 * l'alerte « sentinelle:sans-verdict » n'existait pas, l'anti-boucle par préfixe
 * ne jouait que par accident via `manual:true`, et le lien vers le diagnostic
 * était perdu). Ici `manual:false` : c'est le préfixe de la clé, et lui seul,
 * qui décide si la sentinelle doit l'ignorer. La dédup 1/min par clé s'applique.
 */
export function raiseInternal(alert) {
  if (!alert || !alert.key) throw new Error("raiseInternal : une clé d'alerte est obligatoire");
  return emit({ level: alert.level || "warn", key: String(alert.key), title: alert.title || String(alert.key), message: alert.message || "", meta: alert.meta || {}, manual: false });
}

/** RÉSERVÉ AUX TESTS : fenêtres, cooldowns et registre remis à zéro. */
export function _resetForTests() {
  cooldown.clear(); premieres.clear(); slowByEndpoint.clear(); pendingOffline.clear();
  errorWindow = []; connWindow = [];
  db.update((d) => { d.items = []; });
}
