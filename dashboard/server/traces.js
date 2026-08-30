// ═══════════════════════════════════════════════════════════════════════════
// TRACES — chaîne de validation bout-en-bout d'une action utilisateur.
//
// Objectif (le « cockpit » du cahier des charges) : suivre UNE action depuis le
// clic jusqu'au résultat métier, étape par étape, avec un statut par étape
// (OK / échec / lent / en attente) et un verdict final honnête — sans jamais
// prétendre à un succès non prouvé.
//
// Principe : l'app émet des événements de télémétrie partageant un même
// `correlation_id` (posé par tel.flowStart côté client). Ce module les regroupe
// par corrélation, les ordonne selon un CONTRAT DE RÉSULTAT par action, et en
// déduit :
//   • la suite d'étapes franchies (« Requête envoyée : OK », « Message
//     enregistré : OK », …) ;
//   • le verdict final : succès / partiel / échec / lent / non confirmé / clic mort ;
//   • la détection de doublons (une seule intention → plusieurs exécutions).
//
// Sources d'étapes pour une corrélation :
//   • flow/start  → étape « handler » (gestionnaire déclenché) ;
//   • flow/step   → étape nommée (meta.step) avec son statut ;
//   • flow/end    → clôture ;
//   • api         → étape réseau (requête HTTP) auto-taguée par le hook fetch ;
//   • rt_recv     → livraison cross-device (best-effort, appariée par cible).
//
// Lecture seule sur la télémétrie déjà ingérée. N'invente aucune étape absente :
// une étape non observée reste « en attente » puis « non confirmée ».
// ═══════════════════════════════════════════════════════════════════════════
import { store } from "./store.js";
import { entree } from "./liste-blanche.js";

const FLOW_WINDOW_MS = 30_000;   // fenêtre de vie d'un flow (au-delà : figé)
const RUNNING_MS = 8_000;        // en deçà et incomplet : encore « en cours »
const DUP_WINDOW_MS = 4_000;     // même (user+action+cible) rapproché = doublon
const MAX_TRACES = 400;          // borne mémoire du journal

// ─── Contrats de résultat par action ────────────────────────────────────────
// Chaque étape : key, label, role.
//   role "confirm" = son succès prouve le résultat métier (enregistrement) ;
//   role "deliver" = livraison au destinataire (best-effort, cross-device) ;
//   role "step"    = étape intermédiaire (son échec casse le flux).
// L'ordre du tableau = l'ordre d'affichage attendu de la chaîne.
const S_HANDLER = { key: "handler", label: "Gestionnaire déclenché", role: "step" };
const S_REQUEST_STEP = { key: "request", label: "Requête envoyée au serveur", role: "step" };
const S_REQUEST_CONFIRM = { key: "request", label: "Écriture serveur confirmée", role: "confirm" };
const S_DELIVER = { key: "delivered", label: "Reçu sur les autres appareils", role: "deliver" };

const CONTRACTS = {
  // Message : contrat riche — l'enregistrement est confirmé explicitement (step
  // « saved » émis par app-09), distinct de la requête réseau.
  send_message: {
    label: "Message envoyé", feature: "messaging",
    steps: [
      S_HANDLER, S_REQUEST_STEP,
      { key: "saved", label: "Message enregistré", role: "confirm" },
      { key: "delivered", label: "Reçu par le destinataire", role: "deliver" },
    ],
  },
  // Actions « write = résultat » : l'appel REST Supabase EST la confirmation
  // métier (insert/delete/upsert). La requête porte donc le rôle « confirm ».
  like_post:    { label: "J'aime", feature: "feed", steps: [S_HANDLER, S_REQUEST_CONFIRM, S_DELIVER] },
  unlike_post:  { label: "J'aime retiré", feature: "feed", steps: [S_HANDLER, S_REQUEST_CONFIRM] },
  comment_post: { label: "Commentaire", feature: "feed", steps: [S_HANDLER, S_REQUEST_CONFIRM, S_DELIVER] },
  cint:         { label: "Réaction / like de commentaire", feature: "feed", steps: [S_HANDLER, S_REQUEST_CONFIRM] },
  event_join:   { label: "Inscription événement", feature: "irl", steps: [S_HANDLER, S_REQUEST_CONFIRM] },
  event_leave:  { label: "Désinscription événement", feature: "irl", steps: [S_HANDLER, S_REQUEST_CONFIRM] },
  // Publication : upload(s) média + insert `posts` = plusieurs requêtes ; on
  // s'appuie sur un « saved » explicite (émis par supaPublishPostWithRetry) plutôt
  // que sur l'auto-tag réseau, trop imprécis ici.
  publish_post: { label: "Publication", feature: "feed", steps: [S_HANDLER, { key: "saved", label: "Publication enregistrée", role: "confirm" }, S_DELIVER] },
  publish_reel: { label: "Bobine publiée", feature: "feed", steps: [S_HANDLER, { key: "saved", label: "Bobine enregistrée", role: "confirm" }, S_DELIVER] },
  share_post:   { label: "Partage de publication", feature: "feed", steps: [S_HANDLER, S_REQUEST_CONFIRM] },
  // Actions à confirmation EXPLICITE : plusieurs requêtes en jeu (upsert profil,
  // upload, notification) → l'auto-tag réseau désignerait la mauvaise.
  follow_user:   { label: "Abonnement", feature: "social", steps: [S_HANDLER, { key: "saved", label: "Abonnement enregistré", role: "confirm" }] },
  unfollow_user: { label: "Désabonnement", feature: "social", steps: [S_HANDLER, { key: "saved", label: "Désabonnement enregistré", role: "confirm" }] },
  block_user:    { label: "Blocage", feature: "moderation", steps: [S_HANDLER, { key: "saved", label: "Blocage enregistré", role: "confirm" }] },
  publish_story: { label: "Story publiée", feature: "feed", steps: [S_HANDLER, { key: "saved", label: "Story enregistrée", role: "confirm" }] },
  // Contrat générique : toute action wrappée par tel.flowStart sans contrat
  // dédié affiche au moins handler → requête (confirmation).
  _default: {
    label: "Action", feature: "app",
    steps: [S_HANDLER, S_REQUEST_CONFIRM],
  },
};

function contractFor(action) { return CONTRACTS[action] || CONTRACTS._default; }

// Cible métier d'un flow (pour dédup + appariement de livraison), selon l'action.
function targetOf(meta, action) {
  meta = meta || {};
  if (action === "send_message") return meta.convId || null;
  if (action === "cint") return meta.commentId || null;
  return meta.postId || meta.eventId || meta.target || null;
}

// Réception realtime (rt_recv) → action(s) de flow appariable(s) + champ de cible.
// Une preuve de réception sur un AUTRE appareil confirme l'étape « delivered ».
const RECV_MAP = {
  message: { actions: ["send_message"], field: "convId" },
  like:    { actions: ["like_post"], field: "postId" },
  comment: { actions: ["comment_post"], field: "postId" },
  cint:    { actions: ["cint"], field: "commentId" },
  post:    { actions: ["publish_post", "publish_reel"], field: "postId" },
};

class TraceTracker {
  constructor() {
    /** @type {Map<string, object>} flows indexés par correlation_id */
    this.flows = new Map();
    /** @type {Array<string>} ordre d'arrivée (pour la borne mémoire) */
    this.order = [];
  }

  reset() { this.flows.clear(); this.order = []; }

  _get(cid) { return cid ? this.flows.get(cid) : null; }

  _create(cid, ev, action) {
    const contract = contractFor(action);
    const flow = {
      cid,
      action,
      actionLabel: contract.label,
      feature: contract.feature,
      user: ev.user_id || null,
      label: ev.user_label || null,
      device: ev.device_id || null,
      session: ev.session_id || null,
      screen: ev.screen || null,
      target: targetOf(ev.meta, action),
      startedAt: ev.ts,
      lastAt: ev.ts,
      steps: {},            // key -> { status, ts, meta, http_status }
      ended: false,
      endStatus: null,
      duplicate: false,
    };
    this.flows.set(cid, flow);
    this.order.push(cid);
    if (this.order.length > MAX_TRACES) {
      const old = this.order.shift();
      this.flows.delete(old);
    }
    this._markDuplicate(flow);
    return flow;
  }

  // Marque un doublon : même utilisateur + action + cible dans une fenêtre
  // rapprochée = une seule intention ayant produit plusieurs exécutions.
  _markDuplicate(flow) {
    if (!flow.target) return;
    for (let i = this.order.length - 2; i >= 0; i--) {
      const other = this.flows.get(this.order[i]);
      if (!other || other.cid === flow.cid) continue;
      if (flow.startedAt - other.startedAt > DUP_WINDOW_MS) break;
      if (other.action === flow.action && other.user === flow.user && other.target === flow.target) {
        flow.duplicate = true;
        return;
      }
    }
  }

  _setStep(flow, key, status, ts, meta, httpStatus) {
    const cur = flow.steps[key];
    // Un échec ne doit pas être écrasé par un OK tardif du même step.
    if (cur && cur.status === "fail" && status !== "fail") return;
    flow.steps[key] = { status: status || "ok", ts, meta: meta || null, http_status: httpStatus ?? null };
    if (ts > flow.lastAt) flow.lastAt = ts;
  }

  /** Point d'entrée : alimenté par l'ingestion pour chaque événement. */
  onEvent(ev) {
    if (!ev) return false;
    if (ev.type === "flow") return this._onFlow(ev);
    if (ev.type === "api" && ev.correlation_id) return this._onApi(ev);
    if (ev.type === "rt_recv") return this._onReceive(ev);
    return false;
  }

  _onFlow(ev) {
    const cid = ev.correlation_id;
    if (!cid) return false;
    const meta = ev.meta || {};
    if (ev.action === "start") {
      const action = meta.flow_action || "action";
      const flow = this._get(cid) || this._create(cid, ev, action);
      this._setStep(flow, "handler", "ok", ev.ts, meta);
      return true;
    }
    const flow = this._get(cid);
    if (!flow) return false;   // step/end sans start connu : ignoré (pas d'invention)
    if (ev.action === "step") {
      const key = meta.step || "step";
      const status = ev.status === "error" ? "fail" : (ev.status === "slow" ? "slow" : "ok");
      this._setStep(flow, key, status, ev.ts, meta);
      return true;
    }
    if (ev.action === "end") {
      flow.ended = true;
      flow.endStatus = ev.status === "error" ? "fail" : "ok";
      if (ev.ts > flow.lastAt) flow.lastAt = ev.ts;
      return true;
    }
    return false;
  }

  // Étape réseau : le hook fetch tague l'appel applicatif avec le correlation_id
  // du flow actif. On enregistre la requête (OK / lente / échec HTTP).
  _onApi(ev) {
    const flow = this._get(ev.correlation_id);
    if (!flow) return false;
    const status = ev.status === "error" ? "fail" : (ev.status === "slow" ? "slow" : "ok");
    this._setStep(flow, "request", status, ev.ts, { endpoint: ev.endpoint }, ev.http_status);
    return true;
  }

  // Livraison cross-device (best-effort) : un rt_recv sur un AUTRE appareil,
  // apparié par cible (convId/postId/commentId) au flow le plus récent de l'action
  // correspondante. Honnête : on ne marque « delivered » qu'avec un signal réel.
  _onReceive(ev) {
    const map = entree(RECV_MAP, ev.action);
    if (!map) return false;
    const target = (ev.meta && ev.meta[map.field]) || null;
    if (!target) return false;
    const recvDevice = ev.device_id || null;
    for (let i = this.order.length - 1; i >= 0; i--) {
      const flow = this.flows.get(this.order[i]);
      if (!flow || !map.actions.includes(flow.action)) continue;
      if (flow.target !== target) continue;
      if (ev.ts < flow.startedAt) continue;
      if (ev.ts - flow.startedAt > FLOW_WINDOW_MS) break;
      if (recvDevice && flow.device && recvDevice === flow.device) continue; // même appareil ≠ cross-device
      this._setStep(flow, "delivered", "ok", ev.ts, { latency: ev.ts - flow.startedAt });
      return true;
    }
    return false;
  }

  // ─── Calcul du verdict ────────────────────────────────────────────────────
  _chain(flow, now) {
    const contract = contractFor(flow.action);
    const age = now - flow.startedAt;
    const settled = age > RUNNING_MS || flow.ended;
    const out = [];
    let sawFail = false, confirmOk = false, sawSlow = false;

    for (const spec of contract.steps) {
      const s = flow.steps[spec.key];
      let status;
      if (s) {
        status = s.status;
        if (status === "fail") sawFail = true;
        if (status === "slow") sawSlow = true;
        // Une confirmation « lente » reste une confirmation (l'écriture a abouti).
        if (spec.role === "confirm" && (status === "ok" || status === "slow")) confirmOk = true;
      } else if (spec.role === "deliver") {
        // Livraison non observée : « en attente » puis « non confirmée ». Purement
        // INFORMATIF — on ne peut pas prouver qu'un destinataire n'a rien reçu (test
        // mono-appareil, personne à l'écoute) → n'altère JAMAIS le verdict, sinon on
        // fabriquerait de faux incidents. Un « delivered:ok » réel reste une preuve.
        status = settled ? "unconfirmed" : "pending";
      } else {
        // Étape structurante manquante : en cours, puis non atteinte si figé.
        status = settled ? "missing" : "pending";
      }
      out.push({ key: spec.key, label: spec.label, role: spec.role, status, ts: s ? s.ts : null, http_status: s ? s.http_status : null, meta: s ? s.meta : null });
    }

    // Verdict final honnête (la livraison cross-device n'entre PAS dans le verdict).
    let final;
    const handler = flow.steps.handler;
    if (sawFail) {
      // Un échec observé ET une confirmation d'enregistrement = partiel
      // (ex. la requête a hoqueté mais le message a fini enregistré) ; sinon échec.
      final = confirmOk ? "partial" : "failed";
    } else if (confirmOk) {
      final = "success";
    } else if (!settled) {
      final = "running";
    } else if (handler && !flow.steps.request && contract.steps.some((s) => s.key === "request")) {
      // Handler déclenché mais aucune requête n'a suivi → clic sans effet.
      final = "dead_click";
    } else {
      final = "unconfirmed";
    }
    if (final === "success" && sawSlow) final = "slow";

    return { steps: out, final };
  }

  _dto(flow, now, names) {
    const { steps, final } = this._chain(flow, now);
    const durationMs = flow.lastAt - flow.startedAt;
    return {
      cid: flow.cid,
      action: flow.action,
      actionLabel: flow.actionLabel,
      feature: flow.feature,
      user: flow.user,
      label: flow.label || (flow.user && names[flow.user]) || null,
      device: flow.device,
      session: flow.session,
      screen: flow.screen,
      target: flow.target,
      startedAt: flow.startedAt,
      durationMs: durationMs >= 0 ? durationMs : null,
      duplicate: flow.duplicate,
      steps,
      final,
    };
  }

  /** Instantané complet pour l'API/SSE. */
  snapshot(limit = 100) {
    const now = Date.now();
    const names = (store && typeof store.clientNames === "function") ? store.clientNames() : {};

    const dtos = this.order.map((cid) => this.flows.get(cid)).filter(Boolean).map((f) => this._dto(f, now, names));

    const counts = { success: 0, partial: 0, failed: 0, slow: 0, dead_click: 0, unconfirmed: 0, running: 0, duplicate: 0 };
    for (const d of dtos) {
      counts[d.final] = (counts[d.final] || 0) + 1;
      if (d.duplicate) counts.duplicate++;
    }
    const settledTotal = counts.success + counts.partial + counts.failed + counts.slow + counts.dead_click + counts.unconfirmed;
    const okTotal = counts.success + counts.slow;
    const successRate = settledTotal ? Math.round((okTotal / settledTotal) * 100) : null;

    // Regroupement des flux en échec par (action + étape en échec) = incident
    // dédupliqué (« envoi de message bloqué » plutôt que 5 000 lignes).
    const groups = new Map();
    for (const d of dtos) {
      if (d.final !== "failed" && d.final !== "partial" && d.final !== "dead_click") continue;
      const failStep = d.steps.find((s) => s.status === "fail") || d.steps.find((s) => s.status === "missing" || s.status === "unconfirmed");
      const gkey = d.action + "::" + (failStep ? failStep.key : d.final);
      let g = groups.get(gkey);
      if (!g) {
        g = { key: gkey, action: d.action, actionLabel: d.actionLabel, feature: d.feature, step: failStep ? failStep.key : null, stepLabel: failStep ? failStep.label : null, final: d.final, count: 0, users: new Set(), firstAt: d.startedAt, lastAt: d.startedAt, sampleCid: d.cid };
        groups.set(gkey, g);
      }
      g.count++;
      if (d.user) g.users.add(d.user);
      if (d.startedAt < g.firstAt) g.firstAt = d.startedAt;
      if (d.startedAt > g.lastAt) { g.lastAt = d.startedAt; g.sampleCid = d.cid; }
    }
    const incidents = [...groups.values()].map((g) => ({
      key: g.key, action: g.action, actionLabel: g.actionLabel, feature: g.feature,
      step: g.step, stepLabel: g.stepLabel, final: g.final,
      count: g.count, users: g.users.size, firstAt: g.firstAt, lastAt: g.lastAt, sampleCid: g.sampleCid,
    })).sort((a, b) => b.lastAt - a.lastAt);

    return {
      updatedAt: now,
      totals: { traced: dtos.length, successRate, ...counts },
      incidents,
      recent: dtos.slice(-limit).reverse(),
    };
  }

  /**
   * Verdicts NOUVELLEMENT figés et problématiques, une seule fois chacun.
   *
   * Un verdict n'existe qu'une fois le flux settled (l'action a eu le temps
   * d'aboutir) : on ne peut donc pas alerter depuis l'ingestion événement par
   * événement, d'où ce drain appelé périodiquement. Chaque flux n'est rendu
   * qu'UNE fois (`reported`) — sinon la même action serait re-signalée à chaque
   * passage. Les verdicts sains ou non concluants sont consommés silencieusement.
   */
  drainNewVerdicts() {
    const now = Date.now();
    const names = (store && typeof store.clientNames === "function") ? store.clientNames() : {};
    const out = [];
    for (const cid of this.order) {
      const flow = this.flows.get(cid);
      if (!flow || flow.reported) continue;
      const { final } = this._chain(flow, now);
      if (final === "running") continue;      // pas encore figé : on repassera
      flow.reported = true;                   // consommé, quel que soit le verdict
      // « unconfirmed » n'est PAS une alerte : le plus souvent l'onglet s'est
      // fermé avant la confirmation — accuser à tort serait du bruit.
      if (final === "success" || final === "unconfirmed") continue;
      out.push(this._dto(flow, now, names));
    }
    return out;
  }

  /**
   * Marque tous les flux connus comme déjà signalés.
   *
   * Appelé après le rejeu de l'historique au démarrage : sans ça, un simple
   * redémarrage du serveur ferait re-sonner toutes les alertes des dernières
   * heures. On veut l'historique VISIBLE dans l'onglet, pas ré-alerté.
   */
  sealExisting() {
    for (const cid of this.order) {
      const f = this.flows.get(cid);
      if (f) f.reported = true;
    }
    return this.order.length;
  }

  /** Une trace complète par correlation_id (vue détaillée / prompt Claude). */
  trace(cid) {
    const flow = this.flows.get(cid);
    if (!flow) return null;
    const now = Date.now();
    const names = (store && typeof store.clientNames === "function") ? store.clientNames() : {};
    return this._dto(flow, now, names);
  }
}

// Actions purement UI (aucune écriture serveur attendue) → exclues de la dette.
const NON_WRITE_ACTIONS = new Set(["tools_open", "share_post", "share_event"]);

/**
 * Rapport de couverture d'instrumentation : quelles actions métier ont un
 * CONTRAT de résultat (chaîne de validation) et lesquelles se produisent SANS
 * (dette). Calculé honnêtement sur les données réelles déjà ingérées.
 */
export function coverage() {
  // Flows tracés par action (preuve que le contrat est réellement câblé côté app).
  const flowByAction = {};
  for (const cid of traces.order) {
    const f = traces.flows.get(cid);
    if (f) flowByAction[f.action] = (flowByAction[f.action] || 0) + 1;
  }
  // Actions métier observées dans la télémétrie brute (type "action").
  const seen = {};
  const events = (store && Array.isArray(store.events)) ? store.events : [];
  for (const ev of events) {
    if (ev.type === "action" && ev.action) seen[ev.action] = (seen[ev.action] || 0) + 1;
  }
  const contractActions = Object.keys(CONTRACTS).filter((k) => k !== "_default");
  const catalogue = contractActions.map((a) => ({
    action: a, label: CONTRACTS[a].label, feature: CONTRACTS[a].feature,
    observed: seen[a] || 0, tracedFlows: flowByAction[a] || 0,
    // « câblé » = au moins un flow réel observé (le flowStart existe côté app).
    wired: (flowByAction[a] || 0) > 0,
  })).sort((a, b) => b.observed - a.observed);
  // Dette : actions vues mais SANS contrat de résultat (ni exclusion UI).
  const uninstrumented = Object.keys(seen)
    .filter((a) => !CONTRACTS[a] && !NON_WRITE_ACTIONS.has(a))
    .map((a) => ({ action: a, count: seen[a] }))
    .sort((a, b) => b.count - a.count);
  return {
    updatedAt: Date.now(),
    totals: {
      contracts: contractActions.length,
      wired: catalogue.filter((c) => c.wired).length,
      uninstrumented: uninstrumented.length,
    },
    catalogue, uninstrumented,
  };
}

export const traces = new TraceTracker();
export function onEvent(ev) { try { return traces.onEvent(ev); } catch (e) { return false; } }
export function snapshot(limit) { return traces.snapshot(limit); }
export function trace(cid) { return traces.trace(cid); }
export function drainNewVerdicts() { try { return traces.drainNewVerdicts(); } catch (e) { return []; } }
export function sealExisting() { try { return traces.sealExisting(); } catch (e) { return 0; } }
export { CONTRACTS, contractFor };
