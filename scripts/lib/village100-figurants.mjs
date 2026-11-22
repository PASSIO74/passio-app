// ═══════════════════════════════════════════════════════════════════════════
// VILLAGE 100 — LES FIGURANTS : 96 comptes réels du STAGING, sans navigateur.
//
// Un figurant fait EXACTEMENT les écritures que le client fait pour le même
// geste (lu dans js/app-0x, cité à chaque méthode) — pas une version
// simplifiée qui passerait là où le vrai client échoue :
//   · s'inscrire : UPDATE puis INSERT (`supaSetEventRsvp`, app-08), refus
//     serveur lu dans le message (`activite_complete`…) ;
//   · se désister : DELETE, puis `promouvoir_attente(p_user_id: null)`
//     (`_promoteNextWaitlisted`, app-07) ;
//   · aimer, commenter : l'écriture, PUIS la notification à l'auteur, seulement
//     si l'écriture est acceptée (`notifierApresEcriture`, SRV-02) ;
//   · le direct : UN socket par compte, le topic privé `user:<uid>` seul
//     (profil `sans-cdc` du banc charge-realiste : le client ne rejoint plus
//     `realtime:db` depuis le 2026-11-09).
//
// Gardes reprises du banc de charge : staging seul (référence figée), jamais
// en CI, comptes créés confirmés (aucun e-mail), connexions cadencées sous
// 134 / 5 min, Budget qui arrête la séance au premier dépassement. Le corps
// d'une réponse d'erreur n'est gardé que tronqué (staging, comptes jetables).
// ═══════════════════════════════════════════════════════════════════════════
import { randomUUID } from "node:crypto";
import { Budget } from "./charge-realiste.mjs";
import { STAGING_REF, LIMITES_VILLAGE100, DELAI_CONNEXION_MS, emailFigurant } from "./village100.mjs";

const pause = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const enc = encodeURIComponent;
const court = (t) => String(t || "").replace(/\s+/g, " ").slice(0, 140);
// Motif fermé du refus d'inscription (`_motifRefusRsvp`, app-08).
export function motifRefusRsvp(texte) {
  const m = /activite_(complete|annulee|passee|introuvable)/.exec(String(texte || ""));
  if (m) return m[1];
  const n = /inscriptions_jour_limite|organisateur_bloque|rencontre_concurrente_reessayer/.exec(String(texte || ""));
  return n ? n[0] : null;
}

export function gardesCible(url) {
  if (process.env.GITHUB_ACTIONS || process.env.CI) throw new Error("EXECUTION_CI_INTERDITE");
  if (url !== `https://${STAGING_REF}.supabase.co`) throw new Error("CIBLE_HORS_STAGING");
}

export class Foule {
  constructor({ url, anon, service, campagne, log = () => {}, surComptes = () => {} }) {
    gardesCible(url);
    if (!anon || !service) throw new Error("CLES_STAGING_MANQUANTES");
    this.url = url; this.anon = anon; this.service = service; this.campagne = campagne;
    this.log = log; this.surComptes = surComptes;
    this.figurants = []; this.mesures = []; this.joins = [];
    this.budget = new Budget(LIMITES_VILLAGE100);
    this.sockets = new Set(); this.picSockets = 0; this.fermeture = false;
    this.frames = { total: 0, instants: [], broadcasts: 0, notifications: 0, refus: [] };
    this.surNotif = null;
  }

  // ── HTTP mesuré ────────────────────────────────────────────────────────────
  async http(famille, chemin, { methode = "GET", corps, jwt, prefer, service = false } = {}) {
    const body = corps === undefined ? undefined : JSON.stringify(corps);
    this.budget.compter({ requetes: 1, octets: body ? Buffer.byteLength(body) : 0 });
    const cle = service ? this.service : this.anon;
    const headers = { apikey: cle, Authorization: `Bearer ${service ? this.service : (jwt || this.anon)}` };
    if (body) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    const t = Date.now(), t0 = performance.now();
    let status = null, texte = "";
    try {
      const r = await fetch(this.url + chemin, { method: methode, headers, body, signal: AbortSignal.timeout(15000) });
      status = r.status; texte = await r.text();
      this.budget.compter({ octets: Buffer.byteLength(texte) });
    } catch (e) {
      if (/^BUDGET_/.test(String(e && e.message))) throw e;
      texte = String((e && e.name) || "erreur_reseau");
    }
    const ms = Math.round(performance.now() - t0);
    this.mesures.push({ famille, status, ms, t });
    let data = null;
    try { data = texte ? JSON.parse(texte) : null; } catch (e) { data = null; }
    return { status, ok: status >= 200 && status < 300, data, texte, ms, t };
  }

  // ── Création des figurants : compte confirmé, connexion cadencée, profil,
  //    année de naissance (l'IRL exige la majorité déclarée), socket. ─────────
  async creer(n, { passion }) {
    const connexions = [];
    for (let i = 0; i < n; i++) {
      if (i) await pause(DELAI_CONNEXION_MS);
      const email = emailFigurant(this.campagne, i), password = randomUUID() + "aA!7";
      const u = await this.http("auth_creation", "/auth/v1/admin/users", { methode: "POST", service: true,
        corps: { email, password, email_confirm: true } });
      if (!u.ok || !u.data || !u.data.id) throw new Error(`CREATION_FIGURANT_${i}_HTTP_${u.status}`);
      const f = { index: i, id: u.data.id, nom: `Figurant ${i + 1}`, notifsRecues: [], broadcasts: 0 };
      this.figurants.push(f);
      this.surComptes(this.figurants.map((x) => x.id));
      const s = await this.http("auth_connexion", "/auth/v1/token?grant_type=password", { methode: "POST", corps: { email, password } });
      if (!s.ok || !s.data || !s.data.access_token) throw new Error(`CONNEXION_FIGURANT_${i}_HTTP_${s.status}`);
      f.jwt = s.data.access_token;
      const p = await this.http("profil_creation", "/rest/v1/profiles", { methode: "POST", jwt: f.jwt,
        prefer: "resolution=merge-duplicates,return=minimal",
        corps: { id: f.id, username: f.nom, emoji: "🙂", color: "#64748b", is_private: false, passion_id: passion } });
      f.profil = p.ok ? "ok" : `HTTP_${p.status} ${court(p.texte)}`;
      const b = await this.http("majorite", "/rest/v1/rpc/declare_birth_year", { methode: "POST", jwt: f.jwt, corps: { _birth_year: 1985 + (i % 20) } });
      f.majorite = b.ok ? "ok" : `HTTP_${b.status} ${court(b.texte)}`;
      connexions.push(this.connecter(f));
      if ((i + 1) % 16 === 0) this.log(`figurants : ${i + 1}/${n} créés et connectés`);
    }
    await Promise.all(connexions);
    return this.figurants;
  }

  // ── Le direct : un socket, le topic privé `user:<uid>` ──────────────────────
  connecter(f) {
    return new Promise((resoudre) => {
      const ref = this.url.replace(/^https:\/\//, "").split(".")[0];
      const ws = new WebSocket(`wss://${ref}.supabase.co/realtime/v1/websocket?apikey=${enc(this.anon)}&vsn=1.0.0`);
      const topic = `realtime:user:${f.id}`, t0 = performance.now();
      let hb = null;
      const fin = (ok, motif) => {
        if (f.rt) return;
        f.rt = { ok, motif, ms: Math.round(performance.now() - t0) };
        this.joins.push(f.rt); clearTimeout(timer); resoudre(f.rt);
      };
      const timer = setTimeout(() => fin(false, "JOIN_TIMEOUT_15S"), 15000);
      const envoyer = (o) => {
        const t = JSON.stringify(o);
        try { this.budget.compter({ messagesRealtime: 1, octets: Buffer.byteLength(t) }); } catch (e) { return; }
        try { ws.send(t); } catch (e) {}
      };
      ws.addEventListener("open", () => {
        envoyer({ topic, event: "phx_join", ref: "1", join_ref: "1",
          payload: { config: { broadcast: { self: false }, presence: { key: "" }, private: true }, access_token: f.jwt } });
        hb = setInterval(() => envoyer({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "hb" }), 25000);
      });
      ws.addEventListener("message", (ev) => {
        const texte = typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8");
        this.frames.total++; this.frames.instants.push(Date.now());
        try { this.budget.compter({ messagesRealtime: 1, octets: Buffer.byteLength(texte) }); } catch (e) {}
        let m; try { m = JSON.parse(texte); } catch (e) { return; }
        if (m.event === "phx_reply" && String(m.ref) === "1" && m.topic === topic) {
          const ok = m.payload && m.payload.status === "ok";
          if (!ok) this.frames.refus.push(court(JSON.stringify(m.payload && m.payload.response)));
          fin(ok, ok ? null : "JOIN_REFUSE");
        }
        if (m.event === "broadcast" && m.topic === topic) {
          this.frames.broadcasts++; f.broadcasts++;
          const p = m.payload || {}, rec = (p.payload && (p.payload.record || p.payload.new)) || null;
          if (p.event === "notifications:INSERT" && rec) {
            this.frames.notifications++;
            const r = { t: Date.now(), kind: rec.kind, ref_id: rec.ref_id, id: rec.id, user_id: rec.user_id };
            f.notifsRecues.push(r);
            if (this.surNotif) try { this.surNotif(f, r); } catch (e) {}
          }
        }
        if ((m.event === "phx_error" || m.event === "phx_close") && m.topic === topic) f.rtErreur = m.event;
      });
      ws.addEventListener("close", (e) => {
        clearInterval(hb); this.sockets.delete(ws);
        if (!this.fermeture) f.rtFerme = { code: e.code, t: Date.now() };
        fin(false, "SOCKET_FERMEE_" + e.code);
      });
      ws.addEventListener("error", () => fin(false, "SOCKET_ERREUR"));
      this.sockets.add(ws);
      this.picSockets = Math.max(this.picSockets, this.sockets.size);
      f.ws = ws;
    });
  }
  socketsOuverts() { return [...this.sockets].filter((ws) => ws.readyState === 1).length; }
  fermer() {
    this.fermeture = true;
    for (const ws of this.sockets) { try { ws.close(1000); } catch (e) {} }
  }

  // ── L'activité ──────────────────────────────────────────────────────────────
  // `participants_compte` : ce que l'écran lit pour savoir si c'est complet.
  async compteParticipants(f, evt) {
    const r = await this.http("rsvp_compte", "/rest/v1/rpc/participants_compte", { methode: "POST", jwt: f.jwt, corps: { p_event_ids: [evt] } });
    return r.ok && Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  }
  // `supaSetEventRsvp` (app-08) : UPDATE d'abord, puis INSERT.
  async rsvp(f, evt, voulu) {
    const filtre = `event_id=eq.${enc(evt)}&user_id=eq.${f.id}`;
    const upd = await this.http("rsvp_update", `/rest/v1/event_attendees?${filtre}&select=event_id`, {
      methode: "PATCH", jwt: f.jwt, prefer: "return=representation", corps: { rsvp: voulu } });
    if (upd.ok && Array.isArray(upd.data) && upd.data.length) return { issue: voulu, ms: upd.ms, t: upd.t };
    if (!upd.ok && motifRefusRsvp(upd.texte)) return { issue: motifRefusRsvp(upd.texte), ms: upd.ms, t: upd.t };
    const ins = await this.http("rsvp_insert", "/rest/v1/event_attendees", { methode: "POST", jwt: f.jwt, prefer: "return=minimal",
      corps: { event_id: evt, user_id: f.id, rsvp: voulu, created_at: new Date().toISOString() } });
    if (ins.ok) return { issue: voulu, ms: ins.ms, t: ins.t, status: ins.status };
    return { issue: motifRefusRsvp(ins.texte) || `HTTP_${ins.status}`, detail: court(ins.texte), ms: ins.ms, t: ins.t, status: ins.status };
  }
  // `toggleJoinEvent` (app-07) : complet → liste d'attente, sinon « je viens ».
  async rejoindre(f, evt, places) {
    const c = await this.compteParticipants(f, evt);
    const complet = c ? Number(c.going) >= places : false;
    return { complet, ...(await this.rsvp(f, evt, complet ? "waitlist" : "going")) };
  }
  // `setEventRsvp(id, null)` puis `_promoteNextWaitlisted` (app-07).
  async desister(f, evt) {
    const del = await this.http("rsvp_desistement", `/rest/v1/event_attendees?event_id=eq.${enc(evt)}&user_id=eq.${f.id}&select=event_id`, {
      methode: "DELETE", jwt: f.jwt, prefer: "return=representation" });
    const parti = del.ok && Array.isArray(del.data) && del.data.length === 1;
    if (!parti) return { parti, promotion: null, detail: `HTTP_${del.status} ${court(del.texte)}` };
    const rpc = await this.http("rsvp_promotion", "/rest/v1/rpc/promouvoir_attente", { methode: "POST", jwt: f.jwt,
      corps: { p_event_id: evt, p_user_id: null } });
    return { parti, promotion: rpc.ok ? rpc.data : { ok: false, motif: `HTTP_${rpc.status}`, detail: court(rpc.texte) }, ms: rpc.ms };
  }

  // ── Le post populaire ───────────────────────────────────────────────────────
  async notifier(f, a, kind, ref, texte) {
    return this.http(`notif_${kind}`, "/rest/v1/notifications", { methode: "POST", jwt: f.jwt, prefer: "return=minimal",
      corps: { id: "n_" + randomUUID().replace(/-/g, "").slice(0, 16), user_id: a, kind, from_id: f.id, ref_id: ref,
        content: `${f.nom} ${texte}`, seen: false, created_at: new Date().toISOString() } });
  }
  // `supaSetPostLike` (app-03) puis `supaInsertNotif(auteur, "like", …)`.
  async aimer(f, post, auteur) {
    const r = await this.http("like", "/rest/v1/post_likes", { methode: "POST", jwt: f.jwt, prefer: "return=minimal", corps: { post_id: post, user_id: f.id } });
    const accepte = r.ok || /23505/.test(r.texte);
    const n = accepte && auteur !== f.id ? await this.notifier(f, auteur, "like", post, "a aimé ton post") : null;
    return { like: r.status, notif: n ? n.status : null, t: r.t, ms: r.ms, detail: r.ok ? "" : court(r.texte) };
  }
  // `supaAddComment` (app-08) puis la notification « comment » à confirmation.
  async commenter(f, post, auteur, texte) {
    const r = await this.http("commentaire", "/rest/v1/post_comments", { methode: "POST", jwt: f.jwt, prefer: "return=minimal",
      corps: { id: "c_" + randomUUID().replace(/-/g, "").slice(0, 16), post_id: post, author_id: f.id, content: texte, created_at: new Date().toISOString() } });
    const n = r.ok && auteur !== f.id ? await this.notifier(f, auteur, "comment", post, "a commenté ton post") : null;
    return { commentaire: r.status, notif: n ? n.status : null, t: r.t, ms: r.ms, detail: r.ok ? "" : court(r.texte) };
  }
}

// ── Purge PAR IDENTIFIANT (jamais par motif) ─────────────────────────────────
// Ordre des enfants vers les parents (scripts/purge-e2e-rest.js), plus les
// tables que ce scénario écrit et que la purge générale laisse au CASCADE.
export const TABLES_PURGE = Object.freeze([
  ["conv_messages", ["from_id"]], ["conv_reads", ["user_id"]], ["conv_members", ["user_id"]],
  ["conversations", ["created_by"]],
  ["notifications", ["user_id", "from_id"]], ["comment_interactions", ["user_id"]],
  ["post_comments", ["author_id"]], ["post_likes", ["user_id"]], ["follows", ["follower_id", "following_id"]],
  ["reports", ["reporter_id"]], ["event_comments", ["author_id"]], ["event_attendees", ["user_id"]],
  ["event_reactions", ["user_id"]], ["events", ["author_id"]], ["posts", ["author_id"]], ["stories", ["author_id"]],
  ["blocks", ["blocker_id", "blocked_id"]], ["push_subscriptions", ["user_id"]], ["user_state", ["user_id"]],
  ["profiles", ["id"]],
]);
export function lotsPurge(ids, taille = 40) {
  const propres = [...new Set(ids.filter((x) => /^[0-9a-f-]{36}$/i.test(String(x))))];
  const lots = [];
  for (let i = 0; i < propres.length; i += taille) lots.push(propres.slice(i, i + taille));
  return lots;
}
export async function purgerParIdentifiants({ url, service, ids, log = () => {} }) {
  gardesCible(url);
  const h = { apikey: service, Authorization: `Bearer ${service}` };
  const purge = { lignes: 0, comptes: 0, erreurs: [] };
  for (const lot of lotsPurge(ids)) {
    const liste = `(${lot.join(",")})`;
    for (const [table, cols] of TABLES_PURGE) {
      const q = cols.length === 1 ? `${cols[0]}=in.${liste}` : `or=(${cols.map((c) => `${c}.in.${liste}`).join(",")})`;
      try {
        const r = await fetch(`${url}/rest/v1/${table}?${q}`, { method: "DELETE", headers: { ...h, Prefer: "return=representation" }, signal: AbortSignal.timeout(30000) });
        const t = await r.text();
        if (!r.ok) {
          if (r.status === 404 || /does not exist|schema cache|column .* does not exist/i.test(t)) continue;
          purge.erreurs.push(`${table} HTTP ${r.status} ${court(t)}`); continue;
        }
        const l = JSON.parse(t || "[]"); purge.lignes += Array.isArray(l) ? l.length : 0;
      } catch (e) { purge.erreurs.push(`${table} ${court(e && e.message)}`); }
    }
    for (const id of lot) {
      try {
        const r = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: h, signal: AbortSignal.timeout(20000) });
        if (r.ok || r.status === 404) purge.comptes++; else purge.erreurs.push(`compte ${id.slice(0, 8)} HTTP ${r.status}`);
      } catch (e) { purge.erreurs.push(`compte ${id.slice(0, 8)} ${court(e && e.message)}`); }
    }
  }
  log(`purge : ${purge.lignes} lignes, ${purge.comptes} comptes${purge.erreurs.length ? ", " + purge.erreurs.length + " erreur(s)" : ""}`);
  return purge;
}
