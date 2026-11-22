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
//     si l'écriture est acceptée (`notifierApresEcriture`, SRV-02), PUIS
//     l'appel à `notify-call` (`_pousserPushNotif`, app-08) — le client le
//     fait à chaque notification acceptée, et c'est un mur à part (429) ;
//   · « je viens » accepté : la discussion de l'activité (`conv_members`,
//     `_joinEventConversation`, app-07) et le push `event_join` à
//     l'organisatrice (app-07) ; le désistement quitte la discussion ;
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { hostname } from "node:os";
import { TABLES_COMPTE } from "../../supabase/functions/_shared/purge-compte.js";
import { STAGING_REF, LIMITES_VILLAGE100, DELAI_CONNEXION_MS, emailFigurant, campagneValide,
  emailDeLaCampagne, tableAbsente, comptesAPurger, RE_UUID } from "./village100.mjs";

const pause = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const enc = encodeURIComponent;
const court = (t) => String(t || "").replace(/\s+/g, " ").slice(0, 140);
// Motif fermé du refus d'inscription : EXACTEMENT ceux de `_motifRefusRsvp`
// (app-08). Un autre refus à l'UPDATE ne l'arrête pas : le client tente alors
// l'INSERT, le figurant aussi.
export function motifRefusRsvp(texte) {
  const m = /activite_(complete|annulee|passee|introuvable)/.exec(String(texte || ""));
  return m ? m[1] : null;
}
// Pour le RAPPORT seulement (le client ne les nomme pas) : les autres refus
// serveur des inscriptions (migration des rencontres du 2026-11-16).
export function motifServeurRsvp(texte) {
  const n = /inscriptions_jour_limite|organisateur_bloque|rencontre_concurrente_reessayer/.exec(String(texte || ""));
  return n ? n[0] : null;
}

// ── Le manifeste de la séance ─────────────────────────────────────────────────
// Écrit AVANT chaque création de compte, avec l'adresse exacte : un compte dont
// la réponse de création se perd reste retrouvable par son adresse. Hors de
// `test-results/`, que Playwright vide au lancement suivant. Une écriture qui
// échoue LÈVE : un manifeste muet est un compte orphelin pour toujours.
export class Manifeste {
  // Un manifeste NON PURGÉ n'est jamais écrasé : il porte peut-être les seules
  // adresses de comptes encore vivants (`--retries`, `--repeat-each`, une
  // séance tombée). Il porte aussi le pid de la séance et son poste : le
  // lanceur ne purge pas les comptes d'une séance vivante, ni ceux d'un
  // manifeste venu d'un autre poste.
  constructor(chemin, campagne, { pid = process.pid, poste = hostname() } = {}) {
    if (!campagneValide(campagne)) throw new Error("CAMPAGNE_INVALIDE");
    const avant = Manifeste.lire(chemin);
    if (avant && !avant.purge && avant.comptes.length) throw new Error("MANIFESTE_NON_PURGE");
    this.chemin = chemin;
    this.etat = { campagne, cible: STAGING_REF, pid, poste, comptes: [], purge: false, debut: new Date().toISOString() };
    this.ecrire();
  }
  static lire(chemin) {
    if (!existsSync(chemin)) return null;
    const m = JSON.parse(readFileSync(chemin, "utf8"));
    if (!m || !campagneValide(m.campagne) || m.cible !== STAGING_REF || !Array.isArray(m.comptes)
      || m.comptes.some((c) => !c || typeof c.email !== "string" || (c.id !== null && !RE_UUID.test(String(c.id))))) throw new Error("MANIFESTE_INVALIDE");
    return m;
  }
  ecrire() { mkdirSync(dirname(this.chemin), { recursive: true }); writeFileSync(this.chemin, JSON.stringify(this.etat, null, 2)); }
  avantCreation(email) {
    if (!emailDeLaCampagne(email, this.etat.campagne)) throw new Error("ADRESSE_HORS_CAMPAGNE");
    this.etat.comptes.push({ email, id: null }); this.ecrire();
  }
  apresCreation(email, id) {
    const c = this.etat.comptes.find((x) => x.email === email);
    if (!c) throw new Error("ADRESSE_NON_ANNONCEE");
    if (!RE_UUID.test(String(id))) throw new Error("IDENTIFIANT_INVALIDE");
    c.id = id; this.ecrire();
  }
  purgee() { this.etat.purge = true; this.ecrire(); }
}

export function gardesCible(url) {
  if (process.env.GITHUB_ACTIONS || process.env.CI) throw new Error("EXECUTION_CI_INTERDITE");
  if (url !== `https://${STAGING_REF}.supabase.co`) throw new Error("CIBLE_HORS_STAGING");
}

export class Foule {
  constructor({ url, anon, service, campagne, log = () => {}, manifeste }) {
    gardesCible(url);
    if (!anon || !service) throw new Error("CLES_STAGING_MANQUANTES");
    if (!manifeste) throw new Error("MANIFESTE_REQUIS");
    this.url = url; this.anon = anon; this.service = service; this.campagne = campagne;
    this.log = log; this.manifeste = manifeste; this.convIds = new Map();
    this.figurants = []; this.mesures = []; this.joins = [];
    this.budget = new Budget(LIMITES_VILLAGE100);
    this.sockets = new Set(); this.picSockets = 0; this.fermeture = false;
    this.frames = { total: 0, instants: [], broadcasts: 0, notifications: 0, refus: [] };
    this.surNotif = null;
    this.premiersRefus = {}; // « famille statut » → premier corps d'erreur, tronqué (staging, comptes jetables)
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
    if (status != null && status >= 400 && !this.premiersRefus[`${famille} ${status}`]) this.premiersRefus[`${famille} ${status}`] = court(texte);
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
      this.manifeste.avantCreation(email); // AVANT : une réponse perdue reste retrouvable
      const u = await this.http("auth_creation", "/auth/v1/admin/users", { methode: "POST", service: true,
        corps: { email, password, email_confirm: true } });
      if (!u.ok || !u.data || !u.data.id) throw new Error(`CREATION_FIGURANT_${i}_HTTP_${u.status}`);
      this.manifeste.apresCreation(email, u.data.id);
      const f = { index: i, id: u.data.id, nom: `Figurant ${i + 1}`, notifsRecues: [], broadcasts: 0 };
      this.figurants.push(f);
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
  async rsvp(f, evt, voulu, orga) {
    const filtre = `event_id=eq.${enc(evt)}&user_id=eq.${f.id}`;
    const upd = await this.http("rsvp_update", `/rest/v1/event_attendees?${filtre}&select=event_id`, {
      methode: "PATCH", jwt: f.jwt, prefer: "return=representation", corps: { rsvp: voulu } });
    let r;
    if (upd.ok && Array.isArray(upd.data) && upd.data.length) r = { issue: voulu, ms: upd.ms, t: upd.t };
    else if (!upd.ok && motifRefusRsvp(upd.texte)) return { issue: motifRefusRsvp(upd.texte), ms: upd.ms, t: upd.t };
    else {
      const ins = await this.http("rsvp_insert", "/rest/v1/event_attendees", { methode: "POST", jwt: f.jwt, prefer: "return=minimal",
        corps: { event_id: evt, user_id: f.id, rsvp: voulu, created_at: new Date().toISOString() } });
      if (!ins.ok) return { issue: motifRefusRsvp(ins.texte) || motifServeurRsvp(ins.texte) || `HTTP_${ins.status}`, detail: court(ins.texte), ms: ins.ms, t: ins.t, status: ins.status };
      r = { issue: voulu, ms: ins.ms, t: ins.t, status: ins.status };
    }
    // Ce que `setEventRsvp` (app-07) fait APRÈS un « je viens » accepté.
    if (voulu === "going") {
      if (orga && orga !== f.id) await this.pousser(f, orga, "event_join", "");
      await this.rejoindreDiscussion(f, evt);
    }
    return r;
  }
  // `_joinEventConversation` → `supaJoinEventConversation` (app-08) : la
  // discussion de groupe de l'activité, si l'organisation l'a créée.
  async convId(f, evt) {
    if (this.convIds.has(evt)) return this.convIds.get(evt);
    const r = await this.http("rsvp_lire_discussion", `/rest/v1/events?id=eq.${enc(evt)}&select=conv_id`, { jwt: f.jwt });
    const c = r.ok && Array.isArray(r.data) && r.data[0] ? r.data[0].conv_id : null;
    if (c) this.convIds.set(evt, c);
    return c;
  }
  async rejoindreDiscussion(f, evt) {
    const c = await this.convId(f, evt);
    if (!c) return null;
    const r = await this.http("discussion_rejoindre", "/rest/v1/conv_members", { methode: "POST", jwt: f.jwt, prefer: "return=minimal", corps: { conv_id: c, user_id: f.id } });
    return r.ok || /23505/.test(r.texte);
  }
  // `_pousserPushNotif` (app-08) : `supa.functions.invoke("notify-call")`.
  async pousser(f, a, kind, texte) {
    const emoji = { like: "❤️", comment: "💬", event_join: "🤝" }[kind] || "✨";
    return this.http("push_notify_call", "/functions/v1/notify-call", { methode: "POST", jwt: f.jwt,
      corps: { toUserId: a, type: "notif", kind, text: texte, emoji } });
  }
  // `toggleJoinEvent` (app-07) : complet → liste d'attente, sinon « je viens ».
  async rejoindre(f, evt, places, orga) {
    const c = await this.compteParticipants(f, evt);
    const complet = c ? Number(c.going) >= places : false;
    return { complet, ...(await this.rsvp(f, evt, complet ? "waitlist" : "going", orga)) };
  }
  // `setEventRsvp(id, null)` puis `_promoteNextWaitlisted` (app-07).
  async desister(f, evt) {
    const del = await this.http("rsvp_desistement", `/rest/v1/event_attendees?event_id=eq.${enc(evt)}&user_id=eq.${f.id}&select=event_id`, {
      methode: "DELETE", jwt: f.jwt, prefer: "return=representation" });
    const parti = del.ok && Array.isArray(del.data) && del.data.length === 1;
    if (!parti) return { parti, promotion: null, detail: `HTTP_${del.status} ${court(del.texte)}` };
    // `_leaveEventConversation` (app-07) : on sort de la discussion du groupe.
    const conv = this.convIds.get(evt);
    if (conv) await this.http("discussion_quitter", `/rest/v1/conv_members?conv_id=eq.${enc(conv)}&user_id=eq.${f.id}`, { methode: "DELETE", jwt: f.jwt });
    const rpc = await this.http("rsvp_promotion", "/rest/v1/rpc/promouvoir_attente", { methode: "POST", jwt: f.jwt,
      corps: { p_event_id: evt, p_user_id: null } });
    return { parti, promotion: rpc.ok ? rpc.data : { ok: false, motif: `HTTP_${rpc.status}`, detail: court(rpc.texte) }, ms: rpc.ms };
  }

  // ── Le post populaire ───────────────────────────────────────────────────────
  // `supaInsertNotif` (app-08) : la ligne, puis le push si elle est acceptée.
  async notifier(f, a, kind, ref, texte) {
    const contenu = `${f.nom} ${texte}`;
    const r = await this.http(`notif_${kind}`, "/rest/v1/notifications", { methode: "POST", jwt: f.jwt, prefer: "return=minimal",
      corps: { id: "n_" + randomUUID().replace(/-/g, "").slice(0, 16), user_id: a, kind, from_id: f.id, ref_id: ref,
        content: contenu, seen: false, created_at: new Date().toISOString() } });
    if (r.ok) r.push = await this.pousser(f, a, kind, contenu);
    return r;
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

// ── Purge de la séance : par ADRESSE EXACTE, prouvée par relecture ────────────
// Les tables sont celles de la suppression de compte du produit, IMPORTÉES
// (`TABLES_COMPTE`, supabase/functions/_shared/purge-compte.js) : une table
// ajoutée là (\`user_safety\`, télémétrie, \`story_views\`…) l'est ici aussi. En
// plus, ce que la suppression de compte laisse DÉLIBÉRÉMENT parce que c'est
// un objet partagé, alors qu'ici tout le monde part : la discussion d'activité
// (\`conversations.created_by\`) et les signalements (\`reports.reporter_id\`).
export const TABLES_PURGE = Object.freeze([
  ...TABLES_COMPTE.filter(([t]) => t !== "profiles"),
  ["conversations", "created_by"], ["reports", "reporter_id"],
  ["profiles", "id"],
]);
export function lotsPurge(ids, taille = 40) {
  const propres = [...new Set(ids.filter((x) => RE_UUID.test(String(x))))];
  const lots = [];
  for (let i = 0; i < propres.length; i += taille) lots.push(propres.slice(i, i + taille));
  return lots;
}

// Les comptes de la campagne, par le FILTRE d'adresse de l'API d'administration
// (recherche par sous-chaîne) : une seule page de 100 au plus, que la purge
// concurrente des comptes de la CI ne peut pas décaler. Si le filtre n'est pas
// appliqué (une adresse hors campagne revient), ou si la pagination déborde,
// c'est une ERREUR — jamais un « rien trouvé ».
export const PAGES_MAX = 5;
export async function listerCampagne({ url, h, campagne }) {
  const comptes = [];
  for (let p = 1; ; p++) {
    if (p > PAGES_MAX) throw new Error("LISTING_DEBORDE");
    const r = await fetch(`${url}/auth/v1/admin/users?filter=${encodeURIComponent(campagne)}&page=${p}&per_page=200`, { headers: h, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`LISTING_HTTP_${r.status}`);
    const d = await r.json();
    const lot = (d && d.users) || [];
    if (lot.some((u) => typeof u.email !== "string" || !u.email.includes(campagne))) throw new Error("FILTRE_NON_APPLIQUE");
    for (const u of lot) comptes.push({ id: u.id, email: u.email });
    if (lot.length < 200) return comptes;
  }
}

// `manifeste` : { campagne, comptes: [{ email, id|null }] }. Rend
// { lignes, comptes, attendus, annonces, restants, erreurs, refus }. Rien n'est
// supprimé si UNE adresse ou UN identifiant n'appartient pas à la séance.
// La PREUVE est par ADRESSE : après la purge, le listing de la campagne ne doit
// plus contenir aucune adresse du manifeste ; chaque identifiant est relu en 404.
export async function purgerSeance({ url, service, manifeste, log = () => {} }) {
  gardesCible(url);
  const h = { apikey: service, Authorization: `Bearer ${service}` };
  const out = { lignes: 0, comptes: 0, attendus: 0, annonces: 0, restants: [], erreurs: [], refus: [] };
  const campagne = manifeste && manifeste.campagne;
  if (!campagneValide(campagne)) { out.refus.push("CAMPAGNE_INVALIDE"); return out; }
  const emails = manifeste.comptes.map((c) => c.email);
  const idsNotes = manifeste.comptes.map((c) => c.id).filter(Boolean);
  out.annonces = emails.length;
  let listing;
  try { listing = await listerCampagne({ url, h, campagne }); }
  catch (e) { out.erreurs.push(court(e && e.message)); return out; }
  const choix = comptesAPurger({ listing, emails, idsNotes, campagne });
  // Un identifiant noté absent du listing : relu un par un (404 = déjà parti).
  for (const id of choix.aRelire) {
    const r = await fetch(`${url}/auth/v1/admin/users/${id}`, { headers: h, signal: AbortSignal.timeout(20000) });
    if (r.status === 404) continue;
    if (!r.ok) { out.erreurs.push(`compte ${id.slice(0, 8)} illisible HTTP ${r.status}`); continue; }
    const u = await r.json();
    if (emails.includes(u.email) && emailDeLaCampagne(u.email, campagne)) choix.ids.push(id);
    else choix.refus.push(`${id} → ${u.email}`);
  }
  if (choix.refus.length) { out.refus = choix.refus; return out; }
  out.attendus = choix.ids.length;
  // Les lignes, puis les comptes. Seule une TABLE absente est tolérée.
  for (const lot of lotsPurge(choix.ids)) {
    const liste = `(${lot.join(",")})`;
    for (const [table, col] of TABLES_PURGE) {
      try {
        const r = await fetch(`${url}/rest/v1/${table}?${col}=in.${liste}`, { method: "DELETE", headers: { ...h, Prefer: "return=representation" }, signal: AbortSignal.timeout(30000) });
        const t = await r.text();
        if (!r.ok) { if (!tableAbsente(t, table)) out.erreurs.push(`${table}.${col} HTTP ${r.status} ${court(t)}`); continue; }
        const l = JSON.parse(t || "[]"); out.lignes += Array.isArray(l) ? l.length : 0;
      } catch (e) { out.erreurs.push(`${table}.${col} ${court(e && e.message)}`); }
    }
    for (const id of lot) {
      try {
        const r = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: h, signal: AbortSignal.timeout(20000) });
        if (!r.ok && r.status !== 404) out.erreurs.push(`compte ${id.slice(0, 8)} HTTP ${r.status}`);
      } catch (e) { out.erreurs.push(`compte ${id.slice(0, 8)} ${court(e && e.message)}`); }
    }
  }
  // La preuve ① : chaque identifiant RELU répond 404 (un 404 au DELETE ne suffit pas).
  for (const id of choix.ids) {
    try {
      const r = await fetch(`${url}/auth/v1/admin/users/${id}`, { headers: h, signal: AbortSignal.timeout(20000) });
      if (r.status === 404) out.comptes++;
      else out.restants.push(`${id.slice(0, 8)} (HTTP ${r.status})`);
    } catch (e) { out.restants.push(`${id.slice(0, 8)} (${court(e && e.message)})`); }
  }
  // La preuve ② : PAR ADRESSE — plus aucune adresse du manifeste dans la campagne.
  try {
    const apres = await listerCampagne({ url, h, campagne });
    const attendues = new Set(emails);
    for (const u of apres) if (attendues.has(u.email)) out.restants.push(`${u.email.split("@")[0].split("_").pop()} (adresse encore présente)`);
  } catch (e) { out.erreurs.push(`relisting ${court(e && e.message)}`); }
  log(`purge : ${out.lignes} lignes, ${out.comptes}/${out.attendus} comptes relus absents (${out.annonces} adresses annoncées)${out.restants.length ? `, ${out.restants.length} RESTANT(S)` : ""}${out.erreurs.length ? `, ${out.erreurs.length} erreur(s)` : ""}`);
  return out;
}
// Complète = rien ne reste, par identifiant ET par adresse. (Une adresse
// annoncée sans compte est une création qui a échoué : le relisting prouve
// qu'elle n'existe pas. Z1, lui, exige en plus annonces === attendus.)
export const purgeComplete = (p) => !!p && !p.erreurs.length && !p.restants.length && !p.refus.length;
