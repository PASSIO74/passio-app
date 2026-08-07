// ═══════════════════════════════════════════════════════════════════════════
// INTERACTIONS — vérification cross-device des interactions en temps réel.
//
// Objectif (phase de test) : prouver que CHAQUE interaction (like, commentaire,
// réaction, message, publication/partage) émise sur un appareil est bien REÇUE
// sur les AUTRES appareils via le realtime Supabase.
//
// Principe : l'app Passio émet deux familles d'événements de télémétrie —
//   • ÉMISSION  (type "action")   : like_post, unlike_post, comment_post, cint,
//                                    send_message, publish_post/reel, share_post,
//                                    event_join/leave.
//   • RÉCEPTION (type "rt_recv")  : like, unlike, comment, cint, message, post
//     posé UNIQUEMENT quand l'événement provient d'un AUTRE appareil (les
//     handlers realtime ignorent déjà `user_id === MY_UID`).
//
// Ce module apparie chaque émission à ses réceptions (même cible + fenêtre de
// temps + appareil différent) et en tire un statut de livraison + une latence.
// Il ne lit rien de plus que la télémétrie déjà ingérée : lecture seule.
// ═══════════════════════════════════════════════════════════════════════════
import { store } from "./store.js";

const WINDOW_MS = 45_000;    // fenêtre max émission → réception pour apparier
const PENDING_MS = 12_000;   // en deçà et sans réception : encore « en attente »
const MAX_RECORDS = 500;     // borne mémoire du journal d'interactions

// action d'ÉMISSION → type d'interaction logique
const EMIT_KIND = {
  like_post: "like", unlike_post: "unlike",
  comment_post: "comment",
  cint: "cint",
  send_message: "message",
  publish_post: "publish", publish_reel: "publish", share_post: "publish",
  event_join: "rsvp", event_leave: "rsvp",
};
// action de RÉCEPTION (type "rt_recv") → type d'interaction logique
const RECV_KIND = {
  like: "like", unlike: "unlike",
  comment: "comment", cint: "cint",
  message: "message", post: "publish",
};

export const KIND_LABEL = {
  like: "Like", unlike: "Retrait de like", comment: "Commentaire",
  cint: "Réaction / like de commentaire", message: "Message",
  publish: "Publication / partage", rsvp: "RSVP événement",
};
const KIND_ICON = { like: "❤️", unlike: "💔", comment: "💬", cint: "😊", message: "✉️", publish: "📝", rsvp: "📅" };

// Types réellement vérifiables cross-device (ils ont un chemin de réception realtime).
const VERIFIABLE = new Set(["like", "unlike", "comment", "cint", "message", "publish"]);
// Types appariés par identifiant de cible (fiable). Les autres (publish) le sont
// heuristiquement par proximité temporelle (les ids d'émission/réception diffèrent).
const ID_CORRELATED = new Set(["like", "unlike", "comment", "cint", "message"]);

function targetOf(meta, kind) {
  meta = meta || {};
  if (kind === "message") return meta.convId || null;
  if (kind === "cint") return meta.commentId || null;
  return meta.postId || null; // like / unlike / comment / publish
}

class InteractionTracker {
  constructor() {
    /** @type {Array} journal des émissions (les plus récentes en fin) */
    this.records = [];
  }

  /** Alimenté par l'ingestion pour chaque événement de télémétrie normalisé. */
  onEvent(ev) {
    if (!ev) return false;
    if (ev.type === "rt_recv") return this._onReceive(ev);
    if (ev.type === "action" && EMIT_KIND[ev.action]) return this._onEmit(ev);
    return false;
  }

  _onEmit(ev) {
    const kind = EMIT_KIND[ev.action];
    const rec = {
      id: ev.event_id || ev.id,
      kind,
      target: targetOf(ev.meta, kind),
      ts: ev.ts,
      device: ev.device_id || null,
      user: ev.user_id || null,
      label: ev.user_label || null,
      screen: ev.screen || null,
      action: ev.action,
      receipts: [], // { device, user, label, ts, latency }
    };
    this.records.push(rec);
    if (this.records.length > MAX_RECORDS) this.records.shift();
    return true;
  }

  _onReceive(ev) {
    const kind = RECV_KIND[ev.action];
    if (!kind) return false;
    const target = targetOf(ev.meta, kind);
    const recvDevice = ev.device_id || null;
    const idBased = ID_CORRELATED.has(kind);
    // Cherche l'émission la plus récente compatible : même type, appareil
    // différent, dans la fenêtre, et (si applicable) même cible, pas déjà
    // créditée par CE même appareil récepteur.
    let best = null;
    for (let i = this.records.length - 1; i >= 0; i--) {
      const r = this.records[i];
      if (r.kind !== kind) continue;
      if (r.ts > ev.ts) continue;
      if (ev.ts - r.ts > WINDOW_MS) break; // trié par ts croissant → inutile d'aller plus loin
      if (recvDevice && r.device && r.device === recvDevice) continue; // même appareil = pas cross-device
      if (idBased && r.target && target && r.target !== target) continue;
      if (r.receipts.some((x) => x.device === recvDevice)) continue; // déjà crédité par cet appareil
      best = r; break;
    }
    if (!best) return false;
    best.receipts.push({
      device: recvDevice, user: ev.user_id || null, label: ev.user_label || null,
      ts: ev.ts, latency: ev.ts - best.ts,
    });
    return true;
  }

  _status(rec, now) {
    if (!VERIFIABLE.has(rec.kind)) return "emit_only";
    if (rec.receipts.length > 0) return "delivered";
    if (now - rec.ts < PENDING_MS) return "pending";
    return "unconfirmed";
  }

  _dto(rec, now, names) {
    const bestLat = rec.receipts.length ? Math.min(...rec.receipts.map((r) => r.latency)) : null;
    return {
      id: rec.id,
      kind: rec.kind,
      kindLabel: KIND_LABEL[rec.kind] || rec.kind,
      icon: KIND_ICON[rec.kind] || "•",
      action: rec.action,
      target: rec.target,
      ts: rec.ts,
      emitter: {
        device: rec.device,
        user: rec.user,
        label: rec.label || (rec.user && names[rec.user]) || null,
      },
      screen: rec.screen,
      status: this._status(rec, now),
      idCorrelated: ID_CORRELATED.has(rec.kind),
      receiptCount: rec.receipts.length,
      bestLatency: bestLat,
      receipts: rec.receipts.map((r) => ({
        device: r.device, user: r.user,
        label: r.label || (r.user && names[r.user]) || null,
        latency: r.latency,
      })),
    };
  }

  /** Instantané complet pour l'API/SSE. */
  snapshot(limit = 120) {
    const now = Date.now();
    const names = (typeof store.clientNames === "function") ? store.clientNames() : {};
    const dtos = this.records.map((r) => this._dto(r, now, names));

    // Statistiques par type d'interaction.
    const stats = {};
    for (const k of Object.keys(KIND_LABEL)) {
      stats[k] = { kind: k, label: KIND_LABEL[k], icon: KIND_ICON[k] || "•",
        verifiable: VERIFIABLE.has(k), emitted: 0, delivered: 0, pending: 0, unconfirmed: 0,
        deliveryRate: null, medianLatency: null, _lat: [] };
    }
    for (const d of dtos) {
      const s = stats[d.kind]; if (!s) continue;
      s.emitted++;
      if (d.status === "delivered") { s.delivered++; if (d.bestLatency != null) s._lat.push(d.bestLatency); }
      else if (d.status === "pending") s.pending++;
      else if (d.status === "unconfirmed") s.unconfirmed++;
    }
    const statList = Object.values(stats).map((s) => {
      const settled = s.delivered + s.unconfirmed; // « en attente » exclus du taux
      s.deliveryRate = settled ? Math.round((s.delivered / settled) * 100) : null;
      s.medianLatency = s._lat.length ? median(s._lat) : null;
      delete s._lat;
      return s;
    });

    // Total transverse (types vérifiables uniquement).
    const v = dtos.filter((d) => VERIFIABLE.has(d.kind));
    const delivered = v.filter((d) => d.status === "delivered").length;
    const unconfirmed = v.filter((d) => d.status === "unconfirmed").length;
    const pending = v.filter((d) => d.status === "pending").length;
    const settled = delivered + unconfirmed;
    const allLat = v.filter((d) => d.bestLatency != null).map((d) => d.bestLatency);

    return {
      updatedAt: now,
      totals: {
        emitted: v.length, delivered, pending, unconfirmed,
        deliveryRate: settled ? Math.round((delivered / settled) * 100) : null,
        medianLatency: allLat.length ? median(allLat) : null,
      },
      stats: statList,
      recent: dtos.slice(-limit).reverse(),
    };
  }

  reset() { this.records = []; }
}

function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

export const interactions = new InteractionTracker();
/** Point d'entrée appelé par l'ingestion. Retourne true si l'état a changé. */
export function onEvent(ev) { try { return interactions.onEvent(ev); } catch (e) { return false; } }
export function snapshot(limit) { return interactions.snapshot(limit); }
