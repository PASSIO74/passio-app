// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT E — FAUX SERVEUR SUPABASE PARTAGÉ ENTRE COMPTES
//
// Un seul état en mémoire (côté Node) servi à PLUSIEURS `BrowserContext`, un
// par compte. Chaque requête est jugée sous l'identité portée par son jeton
// (`sub` du JWT envoyé par le VRAI SDK 2.116) : les policies de production,
// recopiées de `C-inventaire-policies.txt` (pg_policies, 2026-11-02), décident
// de ce que chaque compte lit et écrit. Les triggers métier qui changent un
// verdict côté client sont rejoués : capacité des activités (IRL-05),
// statut initial d'un suivi vers un compte privé + notification serveur
// (`n_fr_`/`n_fw_`/`n_fa_`), prétri des signalements (3 signaleurs → masqué).
//
// ⚠️ CE QUE CE BANC NE PROUVE PAS, et qu'il ne faut pas lui faire dire : la
// RLS RÉELLE (ici recopiée, donc une divergence de lecture de la policy se
// reproduirait à l'identique), le temps réel cross-compte (WebSocket coupé),
// les courses SERVEUR (le verrou `FOR UPDATE` est imité par la sérialisation
// des requêtes dans un seul processus Node). Ce qu'il prouve : ce que le CLIENT
// envoie, dans quel ordre, et ce qu'il fait d'un refus — l'état final des
// tables étant lisible par le test, pas seulement l'écran.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const { bootOnboarded, onboardedState } = require("./app-helper");

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);
const REF = "njkiyoklssvefstljemx";
const RESERVED_KINDS = new Set(["mention", "follow", "follow_request", "follow_accept"]);

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function jwtPour(uid, opts = {}) {
  const exp = opts.exp || Math.floor(Date.now() / 1000) + 3600;
  return b64url({ alg: "HS256", typ: "JWT" }) + "." + b64url({ sub: uid, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600 }) + ".banc";
}
function lireJwt(tok) {
  try { const p = String(tok || "").split(".")[1]; return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch (e) { return null; }
}

class FauxServeur {
  constructor() {
    this.t = {
      profiles: [], posts: [], post_likes: [], post_comments: [], comment_interactions: [], stories: [], story_views: [],
      follows: [], blocks: [], notifications: [], conversations: [], conv_members: [], conv_messages: [], conv_reads: [],
      events: [], event_attendees: [], event_comments: [], event_reactions: [], event_checkin_secrets: [],
      reports: [], contenus_masques: [], user_state: [], user_passions: [], user_safety: [], push_subscriptions: [],
      analytics_events: [], telemetry_events: [], client_errors: [], call_invites: [], video_lives: [], passion_quotas: [],
    };
    this.pk = {
      profiles: ["id"], posts: ["id"], post_likes: ["post_id", "user_id"], post_comments: ["id"], stories: ["id"],
      story_views: ["story_id", "user_id"], follows: ["follower_id", "following_id"], blocks: ["blocker_id", "blocked_id"],
      notifications: ["id"], conversations: ["id"], conv_members: ["conv_id", "user_id"], conv_messages: ["id"],
      conv_reads: ["conv_id", "user_id"], events: ["id"], event_attendees: ["event_id", "user_id"], reports: ["id"],
      user_state: ["user_id"], user_passions: ["user_id", "passion_id"], push_subscriptions: ["endpoint"],
      comment_interactions: ["id"], event_comments: ["id"], event_reactions: ["id"], video_lives: ["id"],
    };
    // Embeds PostgREST `profiles(...)` : la colonne de jointure par table.
    this.embeds = { posts: "author_id", conv_messages: "from_id", conv_members: "user_id", post_comments: "author_id", stories: "author_id", notifications: "from_id" };
    this.journal = [];       // toutes les requêtes REST, dans l'ordre d'arrivée
    this.banCompte = null;   // uid dont le rafraîchissement de jeton répond « user_banned »
    this.refusToutes401 = false; // simule un jeton expiré côté PostgREST (PGRST301)
    this.refreshKo = new Set();  // comptes dont le refresh échoue (invalid_grant)
    this.pannes = [];        // [{table, methode, status, body}] refus programmés
    this.verrou = Promise.resolve();
    // `max-rows` de PostgREST (1 000 en production, fiche capacité du 20/09) :
    // toute lecture sans `limit`, ou avec un `limit` plus grand, est TRONQUÉE à
    // ce plafond, en silence (200, `content-range` partiel). Reproduit ici pour
    // que les lectures non paginées se voient (F-03, 2026-11-02).
    this.maxRows = 1000;
    // ── C-04 : `migration_participants_visibilite_2026-11-03.sql` ─────────────
    // NON appliquée par défaut : le banc reste le miroir de la production
    // d'aujourd'hui (liste des participants lisible par tout connecté, RPC
    // inconnues → PGRST202). `migrerParticipants()` pose les trois volets d'un
    // coup ; chacun reste réglable seul pour imiter une TRANSITION — par
    // exemple le cache de schéma de PostgREST pas encore rechargé : privilèges
    // de colonne déjà retirés, fonctions encore inconnues.
    this.participantsParLien = false;    // ① policy SELECT « par lien »
    this.colonnesRetourRetirees = false; // ③ feedback / rating / rated_at illisibles
    this.rpcParticipants = false;        // ② participants_compte, notes_evenement, retours_evenement
  }

  /** Bascule le banc dans le monde « migration C-04 appliquée ». */
  migrerParticipants() {
    this.participantsParLien = true;
    this.colonnesRetourRetirees = true;
    this.rpcParticipants = true;
    return this;
  }

  // ── Fonctions des policies (recopie des fonctions SECURITY DEFINER) ──────
  prof(id) { return this.t.profiles.find((p) => p.id === id) || null; }
  isBlockedWith(me, other) { return !!me && !!other && this.t.blocks.some((b) => (b.blocker_id === me && b.blocked_id === other) || (b.blocker_id === other && b.blocked_id === me)); }
  abonneAccepteNonBloque(me, auteur) { return !!me && this.t.follows.some((f) => f.follower_id === me && f.following_id === auteur && f.status === "accepted") && !this.isBlockedWith(me, auteur); }
  postVisible(me, pid) {
    const p = this.t.posts.find((x) => x.id === pid);
    if (!p) return true;
    const pr = this.prof(p.author_id);
    return p.author_id === me || !(pr && pr.is_private) || this.abonneAccepteNonBloque(me, p.author_id);
  }
  postMasque(pid) { return this.t.contenus_masques.some((m) => m.target_type === "post" && m.target_id === pid && m.decision !== "retabli"); }
  isConvMember(conv, uid) { return !!uid && this.t.conv_members.some((m) => m.conv_id === conv && m.user_id === uid); }
  isConvCreator(conv, me) { const c = this.t.conversations.find((x) => x.id === conv); return !!c && c.created_by === me; }
  conv1a1Bloquee(conv, me) {
    const c = this.t.conversations.find((x) => x.id === conv);
    if (!c || c.is_group) return false;
    return this.t.conv_members.some((m) => m.conv_id === conv && m.user_id !== me && this.isBlockedWith(me, m.user_id));
  }
  canJoinEventConv(conv, me) {
    const ev = this.t.events.find((e) => e.conv_id === conv && e.status !== "cancelled");
    return !!ev && this.t.event_attendees.some((a) => a.event_id === ev.id && a.user_id === me && (a.rsvp === "going" || a.rsvp === "maybe"));
  }
  postAuteurBloque(me, pid) { const p = this.t.posts.find((x) => x.id === pid); return !!p && this.isBlockedWith(me, p.author_id); }
  coOrg(ev, me) { try { return Array.isArray(ev.co_organizers) ? ev.co_organizers.includes(me) : JSON.parse(ev.co_organizers || "[]").includes(me); } catch (e) { return false; } }
  // Miroirs des helpers SECURITY DEFINER de la migration C-04 : ils ne parlent
  // que de l'APPELANT (`organise_activite`, `vient_a_activite`).
  organiseActivite(evId, me) {
    const ev = this.t.events.find((e) => e.id === evId);
    return !!me && !!ev && (ev.author_id === me || ev.organizer_id === me || this.coOrg(ev, me));
  }
  // `vient_a_activite`, durci le 2026-11-03 (revues) : seul un VENANT (`rsvp = 'going'`, comparaison
  // SQL stricte — un `null` ne compte pas) lit les co-inscrits. Un « peut-être »
  // ou une place en liste d'attente se posaient d'un clic, sans capacité : c'était
  // une clé à la liste nominative de n'importe quelle activité.
  venantActivite(evId, me) {
    return !!me && this.t.event_attendees.some((a) => a.event_id === evId && a.user_id === me && a.rsvp === "going");
  }
  // Suivi MUTUEL accepté : un abonnement à sens unique se pose sans l'accord
  // de la personne suivie (compte public → `accepted` d'office) — il ne peut
  // donc pas, à lui seul, ouvrir ses participations.
  suiviMutuel(me, autre) {
    const ok = (a, b) => this.t.follows.some((f) => f.follower_id === a && f.following_id === b && f.status === "accepted");
    return !!me && !!autre && ok(me, autre) && ok(autre, me);
  }
  // ③ PRIVILÈGE DE COLONNE, comme PostgreSQL : `select=*` (ou absent), une
  // colonne retirée dans la projection, dans un filtre ou dans l'ordre → la
  // requête ENTIÈRE est refusée (42501), jamais tronquée en silence. Pour une
  // écriture, la projection ne compte que si un RETURNING est demandé.
  colonnesRefusees(table, url, avecProjection) {
    if (table !== "event_attendees" || !this.colonnesRetourRetirees) return false;
    const RETIREES = ["feedback", "rating", "rated_at"];
    if (avecProjection) {
      const sel = (url.searchParams.get("select") || "*").split(",").map((s) => s.trim().replace(/^[a-z_]+:/, ""));
      if (sel.includes("*") || sel.some((c) => RETIREES.includes(c))) return true;
    }
    for (const [k, v] of url.searchParams.entries()) {
      if (RETIREES.includes(k)) return true;
      if (k === "order" && v.split(",").some((o) => RETIREES.includes(o.split(".")[0]))) return true;
      if (k === "or" && RETIREES.some((c) => new RegExp("(^|[(,])" + c + "\\.").test(v))) return true;
    }
    return false;
  }

  // SELECT : `qual` de la policy. `null` = aucune policy SELECT (table fermée).
  selectOk(table, r, me, role) {
    switch (table) {
      case "profiles": case "events": case "passions": case "user_passions": case "event_comments": case "event_reactions": case "comment_likes": case "video_lives": return true;
      case "event_attendees":
        if (role !== "authenticated") return false;
        if (!this.participantsParLien) return true;                     // C-04 : `true` pour tout connecté (avant migration)
        // Après migration (policy durcie du 2026-11-03) : sa propre ligne,
        // l'organisation ; sinon — ligne hors « declined » (`is distinct from` :
        // un `null` passe) — seulement si l'appelant VIENT à cette activité ou
        // si le suivi est MUTUEL, et jamais à travers un blocage (dans un sens
        // ou dans l'autre, `is_blocked_with`).
        return r.user_id === me || this.organiseActivite(r.event_id, me)
          || (r.rsvp !== "declined"
            && (this.venantActivite(r.event_id, me) || this.suiviMutuel(me, r.user_id))
            && !this.isBlockedWith(me, r.user_id));
      case "posts": return (r.author_id === me || !(this.prof(r.author_id) || {}).is_private || this.abonneAccepteNonBloque(me, r.author_id)) && (r.author_id === me || !this.postMasque(r.id));
      case "stories": return r.author_id === me || !(this.prof(r.author_id) || {}).is_private || this.abonneAccepteNonBloque(me, r.author_id);
      case "post_likes": case "post_comments": return (r.user_id || r.author_id) === me || this.postVisible(me, r.post_id);
      case "comment_interactions": return r.user_id === me || true;
      case "follows": return r.status === "accepted" || r.follower_id === me || r.following_id === me;
      case "blocks": return r.blocker_id === me;
      case "notifications": return r.user_id === me;
      case "conversations": return role === "authenticated" && this.isConvMember(r.id, me);
      case "conv_members": return role === "authenticated" && this.isConvMember(r.conv_id, me);
      case "conv_messages": return role === "authenticated" && this.isConvMember(r.conv_id, me) && !this.isBlockedWith(me, r.from_id);
      case "conv_reads": return role === "authenticated" && this.isConvMember(r.conv_id, me);
      case "event_checkin_secrets": { const ev = this.t.events.find((e) => e.id === r.event_id); return !!ev && (ev.author_id === me || this.coOrg(ev, me)); }
      case "user_state": case "story_views": case "push_subscriptions": case "passion_quotas": return r.user_id === me;
      case "user_safety": return role === "authenticated" && r.user_id === me;
      case "reports": case "analytics_events": case "telemetry_events": case "client_errors": case "contenus_masques": return false;
      default: return false;
    }
  }
  insertOk(table, r, me, role) {
    const auth = role === "authenticated";
    switch (table) {
      case "profiles": return r.id === me;
      case "posts": case "stories": return r.author_id === me;
      case "post_likes": return auth && r.user_id === me && !this.postAuteurBloque(me, r.post_id);
      case "post_comments": return auth && r.author_id === me && !this.postAuteurBloque(me, r.post_id);
      case "follows": return auth && r.follower_id === me && !this.isBlockedWith(me, r.following_id);
      case "blocks": return r.blocker_id === me;
      case "notifications": return auth && r.from_id === me && !this.isBlockedWith(me, r.user_id) && !RESERVED_KINDS.has(r.kind) && !/^n_m_/.test(String(r.id || ""));
      case "conversations": return auth && r.created_by === me;
      case "conv_members": return auth && (this.isConvCreator(r.conv_id, me) || (r.user_id === me && this.canJoinEventConv(r.conv_id, me))) && !this.isBlockedWith(me, r.user_id);
      case "conv_messages": return auth && r.from_id === me && this.isConvMember(r.conv_id, me) && !this.conv1a1Bloquee(r.conv_id, me);
      case "conv_reads": return r.user_id === me;                    // C-01 : aucune vérification d'appartenance
      case "events": return auth && r.author_id === me;
      case "event_attendees": return auth && r.user_id === me;
      case "reports": return r.reporter_id === me;
      case "user_state": case "story_views": case "push_subscriptions": case "user_passions": return r.user_id === me;
      case "analytics_events": return r.user_id === me;
      case "telemetry_events": return r.user_id == null || r.user_id === me;
      case "client_errors": return true;
      case "comment_interactions": case "event_comments": case "event_reactions": return (r.user_id || r.author_id) === me;
      case "video_lives": return r.author_id === me;
      default: return false;
    }
  }
  updateOk(table, r, me, role) {
    switch (table) {
      case "profiles": return r.id === me;
      case "posts": return role === "authenticated" && r.author_id === me;
      case "events": return r.author_id === me || this.coOrg(r, me);
      case "event_attendees": return role === "authenticated" && r.user_id === me;   // B-02 : jamais la ligne d'autrui
      case "follows": return role === "authenticated" && r.following_id === me;
      case "notifications": return r.user_id === me;
      case "conv_messages": return role === "authenticated" && r.from_id === me;
      case "conv_reads": return r.user_id === me;
      case "post_comments": return role === "authenticated" && r.author_id === me;
      case "user_state": case "push_subscriptions": case "user_passions": return r.user_id === me;
      case "video_lives": return r.author_id === me;
      case "conversations": return false;                              // AUCUN UPDATE en prod
      default: return false;
    }
  }
  updateCheck(table, r, me) {
    if (table === "follows") return r.following_id === me && r.status === "accepted";
    if (table === "conv_messages") return r.from_id === me && this.isConvMember(r.conv_id, me) && !this.conv1a1Bloquee(r.conv_id, me);
    return true;
  }
  deleteOk(table, r, me) {
    switch (table) {
      case "profiles": return r.id === me;
      case "posts": case "stories": case "events": return r.author_id === me;
      case "post_likes": case "story_views": case "event_attendees": case "user_state": case "push_subscriptions": case "user_passions": case "comment_interactions": return r.user_id === me;
      case "post_comments": return r.author_id === me;
      case "follows": return r.follower_id === me || r.following_id === me;
      case "blocks": return r.blocker_id === me;
      case "notifications": return r.user_id === me;
      case "conv_members": return r.user_id === me || this.isConvCreator(r.conv_id, me);
      case "conv_messages": return r.from_id === me;
      case "conversations": return r.created_by === me && !this.t.conv_members.some((m) => m.conv_id === r.id);
      case "video_lives": return r.author_id === me;
      default: return false;
    }
  }

  // ── Triggers métier ───────────────────────────────────────────────────────
  // IRL-05 : passage à `going` refusé si annulée / passée / complète.
  trgCapacite(r, old, me) {
    if (!me) return null;
    if (r.rsvp !== "going") return null;
    if (old && old.rsvp === "going") return null;
    const ev = this.t.events.find((e) => e.id === r.event_id);
    if (!ev) return "activite_introuvable";
    if (ev.status === "cancelled") return "activite_annulee";
    const fin = ev.end_at ? Date.parse(ev.end_at) : Date.parse(ev.date_at) + 3 * 3600 * 1000;
    if (fin < Date.now()) return "activite_passee";
    if (ev.max_attendees != null) {
      const inscrits = this.t.event_attendees.filter((a) => a.event_id === r.event_id && a.rsvp === "going" && a.user_id !== r.user_id).length;
      if (inscrits >= ev.max_attendees) return "activite_complete";
    }
    return null;
  }
  trgFollowsStatut(r) {
    const cible = this.prof(r.following_id);
    r.status = cible && cible.is_private ? "pending" : "accepted";
    r.created_at = r.created_at || new Date().toISOString();
  }
  followsNotifier(r, avant) {
    const acteur = r.follower_id, cible = r.following_id;
    const id8 = (x) => String(x).slice(0, 8);
    let ident, kind, dest, de, texte;
    if (!avant) {
      if (r.status === "pending") { ident = "n_fr_" + id8(acteur) + "_" + id8(cible); kind = "follow_request"; texte = "souhaite s'abonner à ton compte privé"; }
      else { ident = "n_fw_" + id8(acteur) + "_" + id8(cible); kind = "follow"; texte = "a commencé à te suivre"; }
      dest = cible; de = acteur;
    } else if (avant.status === "pending" && r.status === "accepted") {
      ident = "n_fa_" + id8(acteur) + "_" + id8(cible); kind = "follow_accept"; dest = acteur; de = cible; texte = "a accepté ta demande d'abonnement";
    } else return;
    this.t.notifications = this.t.notifications.filter((n) => n.id !== ident);
    this.t.notifications.push({ id: ident, user_id: dest, from_id: de, kind, ref_id: de, content: texte, seen: false, created_at: new Date().toISOString(), _origine: "serveur" });
  }
  trgReportsPretri(r) {
    if (r.target_type !== "post") return;
    const signaleurs = new Set(this.t.reports.filter((x) => x.target_type === "post" && x.target_id === r.target_id).map((x) => x.reporter_id));
    if (signaleurs.size >= 3 && !this.t.contenus_masques.some((m) => m.target_type === "post" && m.target_id === r.target_id)) {
      this.t.contenus_masques.push({ target_type: "post", target_id: r.target_id, signaleurs: signaleurs.size, masque_le: new Date().toISOString(), decision: null });
    }
  }

  // ── PostgREST : filtres, select, embeds ───────────────────────────────────
  filtre(rows, params) {
    const ops = { eq: (a, b) => String(a) === b, neq: (a, b) => String(a) !== b, gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b,
      is: (a, b) => (b === "null" ? a == null : String(a) === b), like: (a, b) => new RegExp("^" + b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$").test(String(a)),
      ilike: (a, b) => new RegExp("^" + b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i").test(String(a)),
      in: (a, b) => b.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(a)) };
    let out = rows;
    for (const [k, v] of params) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
      if (k === "or") {
        const clauses = v.replace(/^\(|\)$/g, "").split(/,(?![^()]*\))/);
        out = out.filter((r) => clauses.some((c) => { const m = /^([a-z_]+)\.([a-z]+)\.(.*)$/.exec(c); return m && ops[m[2]] && ops[m[2]](r[m[1]], m[3]); }));
        continue;
      }
      const m = /^([a-z]+)\.(.*)$/s.exec(v);
      if (!m || !ops[m[1]]) continue;
      out = out.filter((r) => ops[m[1]](r[k], m[2]));
    }
    return out;
  }
  projette(table, rows, select) {
    const sel = (select || "*").trim();
    if (!sel || sel === "*") return rows.map((r) => Object.assign({}, r));
    const items = sel.split(/,(?![^()]*\))/).map((s) => s.trim());
    return rows.map((r) => {
      const o = {};
      for (const it of items) {
        if (it === "*") { Object.assign(o, r); continue; }
        const emb = /^([a-z_]+)(?:!([a-z_]+))?\((.*)\)$/.exec(it);
        if (emb) {
          const col = emb[2] || this.embeds[table];
          const p = this.prof(r[col]);
          o[emb[1]] = p ? this.projette("profiles", [p], emb[3])[0] : null;
          continue;
        }
        const alias = /^([a-z_]+):([a-z_]+)$/.exec(it);
        if (alias) { o[alias[1]] = r[alias[2]]; continue; }
        if (it in r) o[it] = r[it];
      }
      return o;
    });
  }
  pkMatch(table, a, b) { return (this.pk[table] || ["id"]).every((k) => String(a[k]) === String(b[k])); }

  // Une panne programmée pour cette requête ?
  panne(table, methode) {
    const i = this.pannes.findIndex((p) => (!p.table || p.table === table) && (!p.methode || p.methode === methode));
    if (i < 0) return null;
    const p = this.pannes[i];
    if (p.fois != null && --p.fois <= 0) this.pannes.splice(i, 1);
    return p;
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────
  async traiter(req) {
    const url = new URL(req.url());
    const m = req.method();
    const h = req.headers();
    const auth = (h["authorization"] || "").replace(/^Bearer\s+/i, "");
    const claims = lireJwt(auth);
    // Comme PostgREST : un JWT dont `exp` est passé rend 401 PGRST301, il ne
    // retombe pas sur `anon`.
    if (claims && claims.exp && claims.exp < Math.floor(Date.now() / 1000) && /^\/rest\/v1\//.test(url.pathname)) {
      return { status: 401, contentType: "application/json", body: JSON.stringify({ code: "PGRST301", message: "JWT expired" }), headers: { "access-control-allow-origin": "*" } };
    }
    const role = claims && claims.role === "authenticated" && claims.sub ? "authenticated" : "anon";
    const me = role === "authenticated" ? claims.sub : null;
    const json = (status, body, extra) => ({ status, contentType: "application/json", body: JSON.stringify(body), headers: Object.assign({ "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" }, extra || {}) });
    if (m === "OPTIONS") return { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } };

    // AUTH
    if (url.pathname.startsWith("/auth/v1/")) {
      // `user_metadata.cgu_accepted_at` : sans lui, `_verifierConsentementApresOAuth`
      // ouvre la fenêtre « Avant de continuer » et bloque toute modale du banc.
      if (url.pathname.endsWith("/user")) return me ? json(200, { id: me, aud: "authenticated", role: "authenticated", email: "banc@passio-e2e.test", user_metadata: { cgu_accepted_at: "2026-10-01T00:00:00Z", username: (this.prof(me) || {}).username || "banc" } }) : json(401, { message: "invalid JWT" });
      if (url.pathname.endsWith("/token")) {
        let corps = {}; try { corps = JSON.parse(req.postData() || "{}"); } catch (e) {}
        const rt = String(corps.refresh_token || "");
        const uid = rt.replace(/^rt_/, "");
        if (this.banCompte && uid === this.banCompte) return json(403, { code: 403, error_code: "user_banned", msg: "User is banned" });
        if (this.refreshKo.has(uid) || !/^rt_/.test(rt)) return json(400, { error: "invalid_grant", error_description: "Invalid Refresh Token: Refresh Token Not Found" });
        const exp = Math.floor(Date.now() / 1000) + 3600;
        return json(200, { access_token: jwtPour(uid, { exp }), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: rt, user: { id: uid, aud: "authenticated", role: "authenticated" } });
      }
      if (url.pathname.endsWith("/logout")) return { status: 204, headers: { "access-control-allow-origin": "*" } };
      return json(200, {});
    }
    if (url.pathname.startsWith("/storage/v1/")) {
      if (m === "GET") return { status: 200, contentType: "image/png", body: PIXEL_PNG, headers: { "access-control-allow-origin": "*" } };
      const key = url.pathname.replace(/^\/storage\/v1\/object\//, "");
      return json(200, { Key: key, Id: "obj_" + Math.random().toString(36).slice(2) });
    }
    if (url.pathname.startsWith("/functions/v1/")) return json(200, { ok: true });

    // REST
    const mr = /^\/rest\/v1\/(rpc\/)?([a-z_]+)$/.exec(url.pathname);
    if (!mr) return json(404, { message: "route inconnue " + url.pathname });
    const table = mr[2];
    let body = null; try { body = JSON.parse(req.postData() || "null"); } catch (e) {}
    this.journal.push({ t: Date.now(), me, role, m, table, rpc: !!mr[1], url: url.pathname + url.search, body });
    if (this.refusToutes401 && m !== "OPTIONS") return json(401, { code: "PGRST301", message: "JWT expired" });
    const pan = this.panne(table, m);
    if (pan) return json(pan.status || 500, pan.body || { message: "panne programmée" });
    const accept = h["accept"] || "";
    const prefer = h["prefer"] || "";
    const objet = /vnd\.pgrst\.object\+json/.test(accept);
    const representation = /return=representation/.test(prefer);
    // ③ C-04 : une écriture dont le filtre ou le RETURNING touche une colonne
    // retirée est refusée ENTIÈRE, avant d'avoir rien modifié (une seule
    // instruction SQL, comme en production).
    if ((m === "POST" || m === "PATCH" || m === "DELETE") && this.colonnesRefusees(table, url, representation)) {
      return json(403, { code: "42501", message: "permission denied for table " + table, details: null, hint: null });
    }
    const rendre =(status, rows) => {
      if (objet) return rows.length === 1 ? json(status, rows[0]) : json(406, { code: "PGRST116", details: "Results contain " + rows.length + " rows", hint: null, message: "JSON object requested, multiple (or no) rows returned" });
      return json(status, rows);
    };

    if (mr[1]) {
      // RPC
      if (table === "adult_access_status") return json(200, "admitted");
      if (table === "fil_compteurs") {
        const ids = (body && body._post_ids) || [];
        return json(200, ids.map((pid) => ({ post_id: pid, likes: this.t.post_likes.filter((l) => l.post_id === pid && this.selectOk("post_likes", l, me, role)).length, moi: this.t.post_likes.some((l) => l.post_id === pid && l.user_id === me), commentaires: 0, apercus: [], reactions: [] })));
      }
      if (table === "pointer_par_code") return json(200, "ok");
      if (table === "promouvoir_attente") {
        // Miroir de migrations/migration_promotion_attente_2026-11-02.sql
        // (banc SQL : tests/sql/migration-promotion-attente.test.sh). Absente
        // (`rpcPromotionAbsente`) = base pas encore migrée → PGRST202.
        if (this.rpcPromotionAbsente) return json(404, { code: "PGRST202", message: "Could not find the function public.promouvoir_attente" });
        if (role !== "authenticated") return json(401, { code: "42501", message: "permission denied for function promouvoir_attente" });
        if (!me) return json(200, { ok: false, motif: "non_connecte" });
        const evId = body && body.p_event_id, voulu = body && body.p_user_id;
        const ev = this.t.events.find((e) => e.id === evId);
        if (!ev) return json(200, { ok: false, motif: "introuvable" });
        if (ev.status === "cancelled") return json(200, { ok: false, motif: "annulee" });
        const fin = ev.end_at ? Date.parse(ev.end_at) : Date.parse(ev.date_at) + 3 * 3600 * 1000;
        if (fin < Date.now()) return json(200, { ok: false, motif: "passee" });
        if (ev.max_attendees == null) return json(200, { ok: false, motif: "sans_capacite" });
        let cible = null;
        if (voulu) {
          const coorgs = Array.isArray(ev.co_organizers) ? ev.co_organizers : [];
          if (me !== ev.author_id && !coorgs.includes(me)) return json(200, { ok: false, motif: "non_autorise" });
          cible = voulu;
        }
        const inscrits = this.t.event_attendees.filter((a) => a.event_id === evId && a.rsvp === "going").length;
        if (inscrits >= ev.max_attendees) return json(200, { ok: false, motif: "complete" });
        if (!cible) {
          const file = this.t.event_attendees.filter((a) => a.event_id === evId && a.rsvp === "waitlist").sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.user_id).localeCompare(String(b.user_id)));
          if (!file.length) return json(200, { ok: false, motif: "personne_en_attente" });
          cible = file[0].user_id;
        }
        const ligne = this.t.event_attendees.find((a) => a.event_id === evId && a.user_id === cible && a.rsvp === "waitlist");
        if (!ligne) return json(200, { ok: false, motif: "pas_en_attente" });
        ligne.rsvp = "going";
        const nid = "n_pa_" + String(evId).slice(0, 12) + "_" + String(cible).slice(0, 8);
        const existante = this.t.notifications.find((n) => n.id === nid);
        const notif = { id: nid, user_id: cible, kind: "event_update", from_id: ev.author_id, ref_id: evId, content: "Une place s'est libérée pour « " + String(ev.title || "une activité").slice(0, 60) + " » : tu es inscrit·e !", seen: false, created_at: new Date().toISOString(), origine: "serveur" };
        if (existante) Object.assign(existante, notif); else this.t.notifications.push(notif);
        return json(200, { ok: true, user_id: cible });
      }
      if (this.rpcParticipants && (table === "participants_compte" || table === "notes_evenement" || table === "retours_evenement")) {
        // Miroirs de migrations/migration_participants_visibilite_2026-11-03.sql
        // (banc SQL : tests/sql/migration-participants-visibilite.test.sh).
        // Sans `rpcParticipants`, elles tombent dans le PGRST202 générique plus bas.
        if (role !== "authenticated") return json(401, { code: "42501", message: "permission denied for function " + table });
        const lignesDe = (id) => this.t.event_attendees.filter((a) => a.event_id === id);
        if (table === "participants_compte") {
          // `= any (p_event_ids[1:200])` puis `group by` : un identifiant répété
          // ne compte qu'une fois, une activité sans aucune ligne ne rend rien.
          const ids = [...new Set(((body && body.p_event_ids) || []).slice(0, 200))];
          return json(200, ids.map((id) => {
            const l = lignesDe(id);
            if (!l.length) return null;
            const venant = (a) => !["maybe", "waitlist", "declined"].includes(a.rsvp == null ? "going" : a.rsvp);
            return { event_id: id, going: l.filter(venant).length, maybe: l.filter((a) => a.rsvp === "maybe").length,
              waitlist: l.filter((a) => a.rsvp === "waitlist").length, checked_in: l.filter((a) => a.checked_in_at != null).length };
          }).filter(Boolean));
        }
        const evId = body && body.p_event_id;
        const notees = lignesDe(evId).filter((a) => a.rating != null);
        if (table === "notes_evenement") {
          // `avg(rating)::numeric(4,2)`, 0 sans note : l'agrégat, jamais qui a noté quoi.
          const avg = notees.length ? Math.round((notees.reduce((s, a) => s + Number(a.rating), 0) / notees.length) * 100) / 100 : 0;
          return json(200, { avg, count: notees.length });
        }
        // retours_evenement : l'organisation seulement, sinon aucune ligne.
        if (!this.organiseActivite(evId, me)) return json(200, []);
        return json(200, lignesDe(evId).filter((a) => a.rating != null || String(a.feedback || "").trim())
          .sort((a, b) => String(b.rated_at || "").localeCompare(String(a.rated_at || "")))
          .map((a) => ({ user_id: a.user_id, rating: a.rating == null ? null : a.rating, feedback: a.feedback == null ? null : a.feedback, rated_at: a.rated_at || null })));
      }
      if (table === "notifier_mentions") return json(200, null);
      if (table === "creer_passion") return json(200, null);
      return json(404, { code: "PGRST202", message: "Could not find the function public." + table });
    }
    if (!(table in this.t)) { if (m === "GET" || m === "HEAD") return json(200, []); return json(201, []); }
    const rows = this.t[table];
    const params = [...url.searchParams.entries()];

    if (m === "GET" || m === "HEAD") {
      if (table === "event_attendees" && role !== "authenticated") return json(401, { code: "42501", message: "permission denied for table event_attendees" });
      if (this.colonnesRefusees(table, url, true)) return json(403, { code: "42501", message: "permission denied for table " + table, details: null, hint: null });
      let vis = rows.filter((r) => this.selectOk(table, r, me, role));
      vis = this.filtre(vis, params);
      const order = url.searchParams.get("order");
      if (order) {
        const cles = order.split(",").map((o) => { const [c, d] = o.split("."); return { c, desc: d === "desc" }; });
        vis = vis.slice().sort((a, b) => { for (const k of cles) { const x = a[k.c], y = b[k.c]; if (x === y) continue; return (x > y ? 1 : -1) * (k.desc ? -1 : 1); } return 0; });
      }
      const total = vis.length;
      const off = Number(url.searchParams.get("offset") || 0);
      let lim = url.searchParams.get("limit");
      // Plafond `max-rows` : comme PostgREST, un `limit` absent ou trop grand
      // est ramené au plafond, sans erreur ni avertissement.
      if (this.maxRows != null && (lim == null || Number(lim) > this.maxRows)) lim = String(this.maxRows);
      if (lim != null) vis = vis.slice(off, off + Number(lim)); else if (off) vis = vis.slice(off);
      const out = this.projette(table, vis, url.searchParams.get("select"));
      const cr = { "content-range": (vis.length ? off + "-" + (off + vis.length - 1) : "*") + "/" + total };
      if (m === "HEAD") return { status: 200, headers: Object.assign({ "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" }, cr) };
      if (objet) return rendre(200, out);
      return json(200, out, cr);
    }

    if (m === "POST") {
      const lignes = Array.isArray(body) ? body : [body || {}];
      const upsert = /resolution=merge-duplicates/.test(prefer) || /resolution=ignore-duplicates/.test(prefer);
      const ignorer = /resolution=ignore-duplicates/.test(prefer);
      const inseres = [];
      for (const l of lignes) {
        const r = Object.assign({}, l);
        if (table === "follows") this.trgFollowsStatut(r);
        if (table === "event_attendees" || table === "posts" || table === "conv_messages" || table === "reports" || table === "notifications" || table === "conversations") r.created_at = r.created_at || new Date().toISOString();
        // Comme en production (`rate_limit_insert` : `NEW.created_at := now()`), un
        // message est horodaté par le SERVEUR, à la microseconde, strictement
        // croissant d'une requête à l'autre — jamais par la valeur que le client envoie.
        if (table === "conv_messages") r.created_at = this.horodatageServeur();
        if (!this.insertOk(table, r, me, role)) return json(role === "authenticated" ? 403 : 401, { code: "42501", message: "new row violates row-level security policy for table \"" + table + "\"", details: null, hint: null });
        const existant = rows.find((x) => this.pkMatch(table, x, r));
        if (existant) {
          if (ignorer) { continue; }
          if (!upsert) return json(409, { code: "23505", message: "duplicate key value violates unique constraint \"" + table + "_pkey\"", details: "Key already exists." });
          if (table === "event_attendees") { const motif = this.trgCapacite(r, existant, me); if (motif) return json(400, { code: "P0001", message: motif, details: null, hint: null }); }
          if (!this.updateOk(table, existant, me, role)) continue;
          Object.assign(existant, r); inseres.push(existant); continue;
        }
        if (table === "event_attendees") { const motif = this.trgCapacite(r, null, me); if (motif) return json(400, { code: "P0001", message: motif, details: null, hint: null }); }
        rows.push(r); inseres.push(r);
        if (table === "follows") this.followsNotifier(r, null);
        if (table === "reports") this.trgReportsPretri(r);
      }
      if (!representation) return { status: 201, headers: { "access-control-allow-origin": "*" } };
      // RETURNING repasse par la policy SELECT (comme PostgREST).
      const relus = inseres.filter((r) => this.selectOk(table, r, me, role));
      if (relus.length !== inseres.length) return json(role === "authenticated" ? 403 : 401, { code: "42501", message: "new row violates row-level security policy (RETURNING) for table \"" + table + "\"" });
      return rendre(201, this.projette(table, relus, url.searchParams.get("select")));
    }

    if (m === "PATCH") {
      const cibles = this.filtre(rows.filter((r) => this.updateOk(table, r, me, role)), params);
      const modifies = [];
      for (const r of cibles) {
        const apres = Object.assign({}, r, body || {});
        if (!this.updateCheck(table, apres, me)) return json(403, { code: "42501", message: "new row violates row-level security policy for table \"" + table + "\"" });
        if (table === "event_attendees") { const motif = this.trgCapacite(apres, r, me); if (motif) return json(400, { code: "P0001", message: motif }); }
        const avant = Object.assign({}, r);
        Object.assign(r, body || {});
        if (table === "follows") this.followsNotifier(r, avant);
        modifies.push(r);
      }
      if (!representation) return { status: 204, headers: { "access-control-allow-origin": "*" } };
      return rendre(200, this.projette(table, modifies, url.searchParams.get("select")));
    }

    if (m === "DELETE") {
      const cibles = this.filtre(rows.filter((r) => this.deleteOk(table, r, me)), params);
      this.t[table] = rows.filter((r) => !cibles.includes(r));
      if (!representation) return { status: 204, headers: { "access-control-allow-origin": "*" } };
      return rendre(200, this.projette(table, cibles, url.searchParams.get("select")));
    }
    return json(405, { message: "méthode" });
  }

  // Branche le faux serveur sur une page. Les requêtes sont SÉRIALISÉES (un
  // verrou) : c'est l'imitation du `FOR UPDATE` du trigger de capacité.
  async brancher(page) {
    await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
    await page.route(/supabase\.co/, async (route) => {
      const suivant = this.verrou.then(() => this.traiter(route.request()));
      this.verrou = suivant.catch(() => {});
      let rep;
      try { rep = await suivant; } catch (e) { rep = { status: 500, contentType: "application/json", body: JSON.stringify({ message: "faux serveur : " + (e && e.message) }), headers: { "access-control-allow-origin": "*" } }; }
      return route.fulfill(rep);
    });
  }

  /** Compte connu du faux serveur : profil + (facultatif) sécurité. */
  compte(uid, username, opts = {}) {
    this.t.profiles.push({ id: uid, username, emoji: opts.emoji || "✨", color: "#7c3aed", avatar_url: null, is_private: !!opts.prive, passion_id: "musique", passions: [{ id: "musique", emoji: "🎵" }], bio: "" });
    this.t.user_safety.push({ user_id: uid, majority_at: "2010-01-01" });
    return uid;
  }
  requetes(f) { return this.journal.filter(f || (() => true)); }
  /** `now()` de PostgreSQL : microsecondes, sans fuseau (`timestamp`), strictement croissant ici. */
  horodatageServeur() {
    const t = Date.now();
    this._horloge = Math.max((this._horloge || 0) + 1, t * 1000);
    const ms = Math.floor(this._horloge / 1000), us = this._horloge % 1000;
    return new Date(ms).toISOString().replace("Z", "") + String(us).padStart(3, "0");
  }
}

/**
 * Ouvre une page CONNECTÉE sous `uid` (jeton SDK de la forme d'une vraie
 * session + `passio_uid`, posés AVANT le boot : `getSession()` trouve la
 * session sans réseau, `adopterCompteConnecte` ne purge rien parce que l'état
 * appartient déjà au compte). `uid` nul = visiteur sans session.
 */
async function ouvrirCompte(context, serveur, uid, opts = {}) {
  const page = await context.newPage();
  await serveur.brancher(page);
  if (uid) {
    const exp = opts.jetonExpire ? Math.floor(Date.now() / 1000) - 600 : Math.floor(Date.now() / 1000) + 3600;
    // ⚠️ UNE SEULE FOIS PAR ONGLET : `addInitScript` rejoue à CHAQUE navigation,
    // donc aussi au `location.reload()` de `doLogout` — l'identité purgée par le
    // produit serait réinjectée par le banc, et un cas de déconnexion mesurerait
    // le banc. Le drapeau vit dans sessionStorage (survit au reload, pas à l'onglet).
    await page.addInitScript(([u, cle, jwt, e]) => {
      if (sessionStorage.getItem("__banc_identite_posee")) return;
      sessionStorage.setItem("__banc_identite_posee", "1");
      localStorage.setItem("passio_uid", u);
      if (!localStorage.getItem(cle)) localStorage.setItem(cle, JSON.stringify({ access_token: jwt, refresh_token: "rt_" + u, token_type: "bearer", expires_in: 3600, expires_at: e, user: { id: u, aud: "authenticated", role: "authenticated" } }));
      localStorage.setItem("passio_first_run_experience_v1", "0");
    }, [uid, "sb-" + REF + "-auth-token", jwtPour(uid, { exp }), exp]);
  } else {
    await page.addInitScript(() => { localStorage.setItem("passio_first_run_experience_v1", "0"); });
  }
  const errors = { js: [], console: [], network: [] };
  const etat = onboardedState(1);
  if (opts.nom) { etat.user.name = opts.nom; etat.user.general.username = opts.nom; etat.user.profiles[0].name = opts.nom; }
  await bootOnboarded(page, errors, 1, { sansIsolationDesDonnees: true, state: etat, query: opts.query || "" });
  // Les neutralisations de bootOnboarded sont RETIRÉES : ce banc tient le réseau.
  await page.evaluate(() => {
    window.__toasts = [];
    const _toast = window.toast;
    window.toast = function (msg, type, onClick) { window.__toasts.push({ t: Date.now(), msg: String(msg), type: type || "info" }); return _toast.apply(this, arguments); };
    window.supaPublishPostWithRetry = window.__vraiSupa.publishPost;
    window.supaAddComment = window.__vraiSupa.addComment;
    window.supaInsertNotif = window.__vraiSupa.insertNotif;
    window.supaUpsertProfile = window.__vraiSupa.upsertProfile;
    window.confirm = () => true;
    delete window.supaSetPostLike;
  });
  const src = await page.evaluate(async () => { const r = await fetch("js/app-03-posts-vlogs.js"); return r.text(); });
  const debut = src.indexOf("async function supaSetPostLike(");
  const fin = src.indexOf("\nfunction likePost(");
  if (debut > 0 && fin > debut) await page.evaluate((code) => { (0, eval)(code.replace("async function supaSetPostLike(", "window.supaSetPostLike = async function(")); }, src.slice(debut, fin));
  const identite = await page.evaluate(() => ({ uid: (typeof MY_UID !== "undefined") ? MY_UID : null, reel: !!window._supaReal, expiree: window._sessionExpiree === true }));
  return { page, errors, identite };
}

const toasts = (page) => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));

module.exports = { FauxServeur, ouvrirCompte, toasts, jwtPour, REF };
