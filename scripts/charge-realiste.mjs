#!/usr/bin/env node
// Banc authentifié borné, staging exclusivement. Sans --executer : aucun réseau.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { verdictReponse } from "./charge-verdict.mjs";
import { optionsBanc, emailCapacite, abonnements, actionPrevue, pausePrevue, decalageInitial,
  postPourLike, aimerEtRetirer, delaiFixture, DisponibiliteRealtime,
  PROFIL_REALTIME, LIKES_VISIBLES, compteurHead, pauseCompteurs, decalageInitialCompteurs, familleFrameRealtime,
  partenaire, clePaire, comptesPourPalier, Budget, LIMITES, statistiques, verdictAvecCompteurs, Sondes } from "./lib/charge-realiste.mjs";

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const octets = value => Buffer.byteLength(value, "utf8");
const liste = ids => `in.(${ids.join(",")})`;
const colonnesFil = "id,author_id,passion_id,mood,content,media_url,created_at,is_reel,overlays,vlog,shared_from_post_id,shared_data,event_id,profiles!author_id(username,emoji,color,avatar_url,is_private)";
const motifSur = e => /^[A-Z][A-Z0-9_: ]{0,100}$/.test(e?.message || "") ? e.message : "ERREUR_INTERNE_OU_RESEAU";
const attendreTableau = (min = 1, champs = ["id"]) => ({ tableau: true, min, champs });

export async function executer(options) {
  // Revérification même si cette fonction est importée : aucun appelant ne peut
  // substituer une cible ou relever les plafonds du parseur.
  const o = optionsBanc(["--projet", options.projet, "--paliers", options.paliers.join(","),
    "--duree", String(options.duree), "--graine", String(options.graine), "--scenario", options.scenario,
    "--pages", options.pages.join(","), "--profil-realtime", options.profilRealtime || PROFIL_REALTIME,
    ...(options.prevolSeulement ? ["--prevol"] : []), ...(options.executer ? ["--executer", "--sortie", options.sortie] : [])]);
  if (!o.executer) return { plan: true, ...o };
  if (process.env.GITHUB_ACTIONS || process.env.CI) throw new Error("EXECUTION_CI_INTERDITE");
  const base = `https://${o.projet}.supabase.co`, destination = resolve(o.sortie);
  mkdirSync(dirname(destination), { recursive: true });
  const prefix = `capacite_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const budget = new Budget(); let nettoyageBudget = null;
  const debut = Date.now(), actifs = new Set(), controleurs = new Set();
  const comptes = [], emailsAttendus = [], profilsFixture = [], postsFixture = [], convs = [], events = [], mesures = [], sondes = new Sondes();
  const mutationsPosts = new Set();
  const mutationsLikes = new Map();
  const receptionsSonde = new Map();
  let connexionsMax = 0, prochaineMutation = 0;
  let phase = "preparation", arret = null, cleAnon, cleService, stage = null, fermetureVoulue = false;
  const rapport = { version: 2, date: new Date().toISOString(), options: o, campagne: prefix,
    portee: "API authentifiee + Realtime, pas un test navigateur ni une certification production",
    comparaisonDemandee: o.pages.length === 2,
    limitesMesure: ["Octets applicatifs HTTP et WebSocket emis/recus, hors en-tetes, TLS et compression ; pas la facture egress.",
      "Frames Realtime observees cote clients ; le compteur ne remplace pas Usage Supabase.",
      "Sans telechargement de medias, upload, inscription par email, rendu mobile ou cache du navigateur.",
      "Dix handlers CDC sans post_likes ; publications et messages prives restent testes en Realtime.",
      "Trois compteurs de posts visibles par acteur ; le canal ring des appels (troisieme canal produit) n'est pas exerce.",
      "Les HEAD count=exact sont comptes comme requetes et en latence ; leurs en-tetes ne sont pas inclus dans les octets applicatifs.",
      o.pages.length === 2 ? "60/20 compare deux tailles de page sur le meme jeu, pas deux builds de l'application."
        : "Page 20 seule : mesure de capacite de ce scenario, aucune comparaison avant/apres."],
    prevol: null, paliers: [], nettoyage: null, phases: [], connexionsRealtime: [], framesRealtime: {} };
  function changerPhase(nom) {
    phase = nom;
    rapport.phases.push({ phase: nom, palier: stage?.taille ?? null, page: stage?.page ?? null,
      date: new Date().toISOString(), depuisDebutMs: Date.now() - debut });
  }
  function sauvegarder() {
    rapport.budget = budget.resume(); rapport.budgetNettoyage = nettoyageBudget?.resume() ?? null;
    rapport.dureeTotaleMs = Date.now() - debut;
    writeFileSync(destination, JSON.stringify({ ...rapport, mesures }, null, 2));
    writeFileSync(destination + ".manifest.json", JSON.stringify({ projet: o.projet, campagne: prefix,
      comptes: comptes.map(c => c.id), emailsSynthetiquesAttendus: emailsAttendus, profils: profilsFixture, posts: [...postsFixture.map(p => p.id), ...mutationsPosts],
      conversations: convs.map(c => c.id), evenements: events.map(e => e.id), likesMutations: [...mutationsLikes.values()], nettoyage: rapport.nettoyage }, null, 2));
  }
  function stop(motif) {
    arret ||= motif;
    for (const c of controleurs) c.abort();
    for (const s of actifs) { try { s.close(); } catch {} }
  }
  const interruption = () => stop("INTERRUPTION");
  process.once("SIGINT", interruption); process.once("SIGTERM", interruption);
  const gardien = setInterval(() => { if (phase !== "nettoyage") { try { budget.verifier(); } catch (e) { stop(motifSur(e)); } } }, 250);
  function compter(q) {
    try { (phase === "nettoyage" ? nettoyageBudget : budget).compter(q); }
    catch (e) { if (phase !== "nettoyage") stop(motifSur(e)); throw e; }
  }
  async function requete(nom, chemin, { methode = "GET", corps, jwt = cleService, attentes = attendreTableau(), extra = {}, management = false, phaseMesure = phase } = {}) {
    const depart = performance.now(), controller = new AbortController();
    const current = { phase: phaseMesure, palier: stage?.taille ?? null, page: stage?.page ?? null, famille: nom, type: "http", ok: false, motif: null, ms: 0, octets: 0, status: null,
      date: new Date().toISOString(), depuisDebutMs: Date.now() - debut, methode };
    const body = corps === undefined ? undefined : JSON.stringify(corps);
    controleurs.add(controller);
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      if (phase !== "nettoyage" && arret) throw new Error(arret);
      compter({ requetes: 1, octets: body ? octets(body) : 0 });
      current.octets = body ? octets(body) : 0;
      const headers = { Authorization: `Bearer ${jwt}`, ...(management ? {} : { apikey: cleAnon }),
        ...(body ? { "Content-Type": "application/json" } : {}), ...extra };
      const res = await fetch(management ? chemin : base + chemin, { method: methode, headers, body, signal: controller.signal, redirect: "error" });
      current.status = res.status;
      if (methode === "HEAD") {
        const compte = compteurHead(res.status, res.headers.get("content-range"));
        current.ok = true; current.compteur = compte;
        return compte;
      }
      const reader = res.body?.getReader(), chunks = []; let total = 0;
      if (reader) while (true) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.byteLength; current.octets += value.byteLength; compter({ octets: value.byteLength });
        if (total > 1_000_000) { await reader.cancel(); throw new Error("REPONSE_SUP_1_MO"); }
        chunks.push(Buffer.from(value));
      }
      const texte = Buffer.concat(chunks).toString("utf8");
      const verdict = verdictReponse(res.status, texte, attentes);
      // Le rapport contient un code stable, jamais un corps d'erreur distant.
      if (!verdict.ok) throw new Error(res.ok ? "CONTENU_INATTENDU" : `HTTP_${res.status}`);
      current.ok = true;
      return texte.trim() ? JSON.parse(texte) : null;
    } catch (e) {
      current.motif = motifSur(e);
      throw new Error(current.motif);
    } finally {
      clearTimeout(timer); controleurs.delete(controller);
      current.ms = Math.round(performance.now() - depart); mesures.push(current);
    }
  }
  const rest = (nom, table, params = {}, opt = {}) => requete(nom, `/rest/v1/${table}?${new URLSearchParams(params)}`, opt);
  const compterLikes = (compte, postId, nom = "compteur_like_visible") => rest(nom, "post_likes",
    { select: "post_id", post_id: `eq.${postId}` },
    { jwt: compte.jwt, methode: "HEAD", extra: { Prefer: "count=exact" } });
  async function cadencer(table, methode) {
    const maintenant = performance.now(), depart = Math.max(maintenant, prochaineMutation);
    prochaineMutation = depart + delaiFixture(table, methode, connexionsMax);
    await sleep(Math.max(0, depart - maintenant));
    (phase === "nettoyage" ? nettoyageBudget : budget).verifier();
  }
  async function inserer(nom, table, corps, opt = {}) {
    const operation = ligne => rest(nom, table, {}, { methode: "POST", corps: ligne,
      attentes: attendreTableau(1, []), extra: { Prefer: "return=representation" }, ...opt });
    if (phase === "mesure") return operation(corps);
    const lignes = [];
    for (const ligne of Array.isArray(corps) ? corps : [corps]) {
      await cadencer(table, "POST"); lignes.push(...await operation(ligne));
    }
    return lignes;
  }
  async function supprimer(nom, table, params, min = 0) {
    // Lire seulement les clés du périmètre exact du run, puis supprimer une
    // ligne par appel. Aucun DELETE de 120 likes en une transaction.
    const cles = { post_likes: ["post_id", "user_id"], conv_reads: ["conv_id", "user_id"],
      conv_members: ["conv_id", "user_id"], user_state: ["user_id"] }[table] || ["id"];
    const lignes = await rest(nom + "_cles", table, { ...params, select: cles.join(","), limit: "1000" }, { attentes: attendreTableau(min, cles) });
    if (lignes.length >= 1000) throw new Error("NETTOYAGE_PERIMETRE_TROP_GRAND");
    const sorties = [];
    for (const ligne of lignes) {
      await cadencer(table, "DELETE");
      const filtre = { ...params, ...Object.fromEntries(cles.map(c => [c, `eq.${ligne[c]}`])) };
      sorties.push(...await rest(nom, table, filtre, { methode: "DELETE", extra: { Prefer: "return=representation" }, attentes: attendreTableau(0, []) }));
    }
    return sorties;
  }
  async function obtenirCles() {
    cleAnon = process.env.CHARGE_SUPABASE_ANON_KEY;
    cleService = process.env.CHARGE_SUPABASE_SERVICE_ROLE_KEY;
    if (cleAnon && cleService) return;
    const patPath = resolve(homedir(), ".supabase", "access-token");
    const pat = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(patPath) ? readFileSync(patPath, "utf8").trim() : "");
    if (!pat) throw new Error("CLES_STAGING_OU_PAT_MANQUANTS");
    const cles = await requete("management_cles", `https://api.supabase.com/v1/projects/${o.projet}/api-keys?reveal=true`,
      { jwt: pat, management: true, attentes: attendreTableau(1, ["name", "api_key"]) });
    cleAnon = cles.find(k => k.name === "anon")?.api_key;
    cleService = cles.find(k => k.name === "service_role")?.api_key;
    if (!cleAnon || !cleService) throw new Error("CLES_STAGING_MANQUANTES");
  }
  async function preparer() {
    changerPhase("preparation");
    await obtenirCles();
    const passions = await rest("fixture_passion", "passions", { select: "id", limit: "1", order: "sort_order.asc" });
    const passion = passions[0].id;
    for (let i = 0; i < o.comptesDistincts; i++) {
      if (i) await sleep(2250); // <= 134 logins / 5 min, sans relance en boucle sur 429.
      const password = randomUUID() + "aA!7", email = emailCapacite(prefix, i);
      emailsAttendus.push(email); sauvegarder();
      const user = await requete("fixture_auth_creation", "/auth/v1/admin/users", { methode: "POST", jwt: cleService,
        corps: { email, password, email_confirm: true }, attentes: { objet: true, champs: ["id"] } });
      const compte = { id: user.id, index: i }; comptes.push(compte); sauvegarder();
      const session = await requete("fixture_auth_login", "/auth/v1/token?grant_type=password", { methode: "POST", jwt: cleAnon,
        corps: { email, password }, attentes: { objet: true, champs: ["access_token", "user"] } });
      if (session.user.id !== compte.id) throw new Error("IDENTITE_AUTH_INATTENDUE");
      compte.jwt = session.access_token;
      if ((i + 1) % 25 === 0) console.log(`Preparation : ${i + 1}/${o.comptesDistincts} comptes distincts.`);
    }
    profilsFixture.push(...comptes.map(c => c.id));
    // Le trigger anti-flood s'applique même au service_role : 120 posts ne
    // doivent pas être attribués aux seuls deux comptes du prévol (10/min).
    // Ces profils auteurs ont des UUID mais aucun compte Auth ni socket.
    while (profilsFixture.length < 15) profilsFixture.push(randomUUID());
    sauvegarder();
    await inserer("fixture_profils", "profiles", profilsFixture.map((id, i) => ({ id, username: `Capacite ${i + 1}`,
      emoji: "🧪", color: "#778899", is_private: false, passion_id: passion })), { extra: { Prefer: "resolution=merge-duplicates,return=representation" } });
    const maintenant = Date.now();
    for (let i = 0; i < 120; i++) postsFixture.push({ id: `${prefix}_fixture_${i}`, author_id: profilsFixture[i % profilsFixture.length],
      passion_id: passion, mood: "happy", content: "Publication synthetique pour mesurer la capacite. ".repeat(8),
      media_url: null, created_at: new Date(maintenant - i * 1000).toISOString(), is_reel: false });
    // Le trigger force created_at=now(). Une requête par ligne évite 120
    // horodatages égaux et rend la première page reproductible après reset.
    sauvegarder();
    for (const post of postsFixture) await inserer("fixture_posts", "posts", post);
    await inserer("fixture_commentaires", "post_comments", postsFixture.map((p, i) => ({ id: `${prefix}_comment_${i}`,
      post_id: p.id, author_id: profilsFixture[(i + 1) % profilsFixture.length], content: "Commentaire synthetique.", created_at: new Date(maintenant).toISOString() })));
    await inserer("fixture_likes", "post_likes", postsFixture.map((p, i) => ({ post_id: p.id, user_id: comptes[(i + 1) % comptes.length].id })));
    await inserer("fixture_interactions", "comment_interactions", postsFixture.map((p, i) => ({ id: `${prefix}_interaction_${i}`,
      comment_id: p.id, post_id: p.id, user_id: profilsFixture[i % profilsFixture.length], kind: "emoji", payload: "👍" })));
    const paires = new Set();
    for (const taille of [...o.paliers, 2].filter(n => n <= comptes.length)) for (let i = 0; i < taille; i++) paires.add(clePaire(i, partenaire(i, taille)));
    for (const key of paires) { const [a, b] = key.split("_").map(Number);
      convs.push({ id: `${prefix}_conv_${key}`, is_group: false, created_by: comptes[a].id, a, b }); }
    sauvegarder();
    await inserer("fixture_conversations", "conversations", convs.map(({ a, b, ...c }) => c));
    await inserer("fixture_membres", "conv_members", convs.flatMap(c => [{ conv_id: c.id, user_id: comptes[c.a].id }, { conv_id: c.id, user_id: comptes[c.b].id }]));
    await inserer("fixture_historiques", "conv_messages", convs.map((c, i) => ({ id: `${prefix}_historique_${i}`, conv_id: c.id,
      from_id: comptes[c.a].id, content: "Message synthetique initial.", created_at: new Date(maintenant).toISOString() })));
    events.push({ id: `${prefix}_event`, author_id: comptes[0].id, title: "Rencontre synthetique de capacite", passion_id: passion,
      description: "Fixture temporaire du banc staging", city: "Paris", lat: 48.85, lng: 2.35, date_at: new Date(maintenant + 86400000).toISOString() });
    sauvegarder();
    await inserer("fixture_evenements", "events", events);
    await inserer("fixture_notifications", "notifications", comptes.map((c, i) => ({ id: `${prefix}_notif_${i}`, user_id: c.id,
      from_id: comptes[(i + 1) % comptes.length].id, kind: "follow", content: "Notification synthetique.", seen: false })));
    sauvegarder();
  }
  function cleSonde(uid, type, id) { return `${uid}:${type}:${id}`; }
  async function connecter(compte) {
    if (arret) throw new Error(arret);
    const ws = new WebSocket(`wss://${o.projet}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(cleAnon)}&vsn=1.0.0`);
    actifs.add(ws); let heartbeat, pret = false;
    connexionsMax = Math.max(connexionsMax, actifs.size);
    const disponibilite = new DisponibiliteRealtime(compte.id, o.profilRealtime), debutConnexion = performance.now();
    const trace = { generation: rapport.connexionsRealtime.length + 1, compte: compte.index, phase,
      palier: stage?.taille ?? null, page: stage?.page ?? null, date: new Date().toISOString(),
      joins: {}, systemes: disponibilite.systemes, cdcPretMs: null, pretMs: null,
      postsRecus: 0, broadcastsRecus: 0, heartbeatReponses: 0, erreur: null };
    rapport.connexionsRealtime.push(trace);
    const env = (topic, event, payload, ref) => {
      const texte = JSON.stringify({ topic, event, payload, ref: String(ref), join_ref: event === "phx_join" ? String(ref) : undefined });
      compter({ octets: octets(texte), messagesRealtime: 1 }); ws.send(texte);
    };
    await new Promise((resoudre, rejeter) => {
      const timer = setTimeout(() => echouer(disponibilite.expirer()), 15000);
      const echouer = code => { trace.erreur ||= code; trace.erreurLe ||= new Date().toISOString(); clearTimeout(timer); rejeter(new Error(code)); if (pret && !ws.fermetureBanc && !fermetureVoulue && !arret) stop(code); };
      ws.addEventListener("open", () => {
        try {
          env("realtime:realtime:db", "phx_join", { config: { broadcast: { self: false }, presence: { key: "" }, private: true,
            postgres_changes: abonnements(compte.id, o.profilRealtime) }, access_token: compte.jwt }, "1");
          env(`realtime:user:${compte.id}`, "phx_join", { config: { broadcast: { self: false }, presence: { key: "" }, private: true }, access_token: compte.jwt }, "2");
          heartbeat = setInterval(() => { try { env("phoenix", "heartbeat", {}, "hb"); } catch (e) { echouer(motifSur(e)); } }, 25000);
        } catch (e) { echouer(motifSur(e)); }
      });
      ws.addEventListener("message", ev => {
        try {
          const texte = typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8");
          compter({ octets: octets(texte), messagesRealtime: 1 });
          const m = JSON.parse(texte);
          const famille = familleFrameRealtime(m), cleFrame = `${phase}:${stage?.taille ?? "hors_palier"}:${stage?.page ?? "hors_page"}:${famille}`;
          const compteur = rapport.framesRealtime[cleFrame] ||= { phase, palier: stage?.taille ?? null, page: stage?.page ?? null,
            famille, receptions: 0, octets: 0 };
          compteur.receptions++; compteur.octets += octets(texte);
          disponibilite.observer(m);
          if (m.event === "system" && m.topic === "realtime:realtime:db" && m.payload?.extension === "postgres_changes") {
            trace.dernierSysteme = { date: new Date().toISOString(), status: ["ok", "error"].includes(m.payload.status) ? m.payload.status : "autre" };
          }
          if (disponibilite.erreur) return echouer(disponibilite.erreur);
          if (disponibilite.db && trace.joins.dbMs == null) trace.joins.dbMs = Math.round(performance.now() - debutConnexion);
          if (disponibilite.user && trace.joins.userMs == null) trace.joins.userMs = Math.round(performance.now() - debutConnexion);
          if (disponibilite.cdc && trace.cdcPretMs == null) trace.cdcPretMs = Math.round(performance.now() - debutConnexion);
          if (disponibilite.pret && !pret) {
            clearTimeout(timer); pret = true; compte.handlersConfirmes = disponibilite.handlers;
            trace.pretMs = Math.round(performance.now() - debutConnexion); resoudre();
          }
          if (m.event === "phx_reply" && String(m.ref) === "hb") trace.heartbeatReponses++;
          if (["phx_error", "phx_close"].includes(m.event)) return echouer("REALTIME_CANAL_FERME");
          if (m.event === "postgres_changes") {
            const data = m.payload?.data;
            if (data?.table === "posts" && data.record?.id) {
              trace.postsRecus++;
              if (!ws.fermetureBanc && pret) {
                receptionsSonde.get(data.record.id)?.add(compte.index);
                sondes.recevoir(cleSonde(compte.id, "post", data.record.id));
              }
            }
          }
          if (m.event === "broadcast" && m.payload?.event === "INSERT") {
            const payload = m.payload.payload, record = payload?.record || payload?.new || payload;
            if (record?.id) { trace.broadcastsRecus++; if (!ws.fermetureBanc && pret) {
              receptionsSonde.get(record.id)?.add(compte.index);
              sondes.recevoir(cleSonde(compte.id, "message", record.id));
            } }
          }
        } catch (e) { echouer(motifSur(e)); }
      });
      ws.addEventListener("error", () => echouer("REALTIME_SOCKET_ERREUR"));
      ws.addEventListener("close", ev => { trace.fermeture = { code: ev.code, date: new Date().toISOString() }; clearInterval(heartbeat); actifs.delete(ws); if (!ws.fermetureBanc) echouer("REALTIME_SOCKET_FERMEE"); });
    });
    return ws;
  }
  async function fermerSockets() {
    fermetureVoulue = true;
    const sockets = [...actifs];
    await Promise.all(sockets.map(ws => new Promise(done => {
      const timer = setTimeout(done, 2000); ws.addEventListener("close", () => { clearTimeout(timer); done(); }, { once: true });
      ws.fermetureBanc = true;
      try { ws.close(); } catch { clearTimeout(timer); done(); }
    })));
    sondes.fermer(); fermetureVoulue = false;
  }
  async function fil(compte, page) {
    const jwt = compte.jwt;
    const posts = await rest("fil_posts", "posts", { select: colonnesFil, order: "created_at.desc", limit: String(page) }, { jwt, attentes: { ...attendreTableau(page, ["id", "author_id"]), imbrique: "profiles" } });
    const ids = posts.map(p => p.id);
    const lots = await Promise.allSettled([
      rest("fil_likes", "post_likes", { select: "post_id,user_id", post_id: liste(ids) }, { jwt, attentes: attendreTableau(0, ["post_id", "user_id"]) }),
      rest("fil_commentaires", "post_comments", { select: "post_id,id,author_id,content,created_at", post_id: liste(ids), order: "created_at.desc", limit: "200" }, { jwt, attentes: attendreTableau(0, ["post_id", "id", "author_id"]) }),
      rest("fil_interactions", "comment_interactions", { select: "comment_id,user_id,kind,payload,created_at", comment_id: liste(ids) }, { jwt, attentes: attendreTableau(0, ["comment_id", "user_id"]) }),
    ]);
    const refus = lots.find(r => r.status === "rejected");
    if (refus) throw refus.reason;
    const [likes, commentaires, reactions] = lots.map(r => r.value);
    // Après vingt publications, la page de vingt peut ne plus contenir aucun
    // post de fixture : ces nouveaux posts n'ont légitimement aucun commentaire.
    // À l'inverse, une fixture encore visible doit conserver SON commentaire,
    // avec son auteur attendu ; un tableau vide n'est alors jamais acceptable.
    const visibles = new Set(ids), parId = new Map(commentaires.map(c => [c.id, c]));
    if (commentaires.some(c => !visibles.has(c.post_id))) throw new Error("COMMENTAIRE_HORS_PAGE");
    for (let i = 0; i < postsFixture.length; i++) {
      const p = postsFixture[i]; if (!visibles.has(p.id)) continue;
      const c = parId.get(`${prefix}_comment_${i}`);
      if (!c || c.post_id !== p.id || c.author_id !== profilsFixture[(i + 1) % profilsFixture.length]) {
        throw new Error("COMMENTAIRE_FIXTURE_MANQUANT_OU_ALTERE");
      }
    }
    const auteurs = [...new Set(commentaires.map(c => c.author_id))];
    const profils = auteurs.length ? await rest("fil_profils_commentaires", "profiles", { select: "id,username,emoji,color,avatar_url,passion_id,passions,bio", id: liste(auteurs) }, { jwt, attentes: attendreTableau(auteurs.length, ["id", "username"]) }) : [];
    if (phase === "mesure") compte.postsVisibles = ids.slice(0, LIKES_VISIBLES.maximum);
    return { posts: ids, likes: likes.length, commentaires: commentaires.length, reactions: reactions.length, profils: profils.length };
  }
  async function cycleCompteursVisibles(compte, fin) {
    const debutCycle = performance.now(), date = new Date().toISOString(); let ok = false, motif = null, lectures = 0;
    try {
      const ids = [...new Set(compte.postsVisibles)].slice(0, LIKES_VISIBLES.maximum);
      if (ids.length !== LIKES_VISIBLES.maximum) throw new Error("POSTS_VISIBLES_INSUFFISANTS");
      for (const id of ids) {
        if (arret || performance.now() >= fin) break;
        await compterLikes(compte, id); lectures++;
      }
      ok = true;
    } catch (e) { motif = motifSur(e); }
    mesures.push({ phase, palier: stage?.taille, page: stage?.page, type: "parcours", famille: "compteurs_visibles",
      date, compte: compte.index, ok, motif, lectures, ms: Math.round(performance.now() - debutCycle) });
    if (!ok && ["HTTP_401", "HTTP_403", "HTTP_429", "HEAD_COMPTE_INVALIDE", "POSTS_VISIBLES_INSUFFISANTS"].includes(motif)) stop(motif);
  }
  async function surveillerCompteurs(compte, start, fin) {
    let tour = 0, prochainDebut = start + decalageInitialCompteurs(o.graine, compte.index);
    while (!arret && prochainDebut < fin) {
      await sleep(Math.max(0, Math.min(prochainDebut, fin) - performance.now()));
      if (arret || performance.now() >= fin) break;
      const debutCycle = performance.now();
      await cycleCompteursVisibles(compte, fin);
      // Cadence entre débuts ; un cycle lent ne provoque jamais un rattrapage
      // de cycles manqués ni des HEAD parallèles pour le même compte.
      prochainDebut = Math.max(performance.now(), debutCycle + pauseCompteurs(o.graine, compte.index, tour++));
    }
  }
  function convPour(compte, taille) { return convs.find(c => c.id === `${prefix}_conv_${clePaire(compte.index, partenaire(compte.index, taille))}`); }
  async function livraison(compte, taille, type) {
    const id = `${prefix}_mesure_${randomUUID()}`, recipient = comptes[partenaire(compte.index, taille)];
    const sonde = sondes.armer(cleSonde(recipient.id, type, id));
    receptionsSonde.set(id, new Set());
    const contexte = { phase, palier: stage?.taille ?? null, page: stage?.page ?? null, famille: type, type: "realtime",
      date: new Date().toISOString(), auteur: compte.index, destinataire: recipient.index, identifiant: id };
    try {
      if (type === "message") await inserer("message_envoyer", "conv_messages", { id, conv_id: convPour(compte, taille).id,
        from_id: compte.id, content: "Message de capacite entre deux comptes authentifies.", created_at: new Date().toISOString() }, { jwt: compte.jwt, attentes: { ...attendreTableau(), id } });
      else {
        mutationsPosts.add(id); sauvegarder();
        await inserer("post_publier", "posts", { id, author_id: compte.id, passion_id: postsFixture[0].passion_id,
          content: "Publication de capacite.", created_at: new Date().toISOString() }, { jwt: compte.jwt, attentes: { ...attendreTableau(), id } });
      }
    } catch (e) { sonde.annuler(); receptionsSonde.delete(id); mesures.push({ ...contexte, ...await sonde.promise }); throw e; }
    const resultat = await sonde.promise;
    const recusAuVerdict = [...receptionsSonde.get(id)], verdictLe = new Date().toISOString();
    if (!resultat.ok && resultat.motif === "REALTIME_TIMEOUT" && !arret) {
      try {
        const rows = await rest("diagnostic_visibilite_realtime", type === "post" ? "posts" : "conv_messages",
          { id: `eq.${id}`, select: "id", limit: "1" }, { jwt: recipient.jwt, attentes: attendreTableau(0, ["id"]), phaseMesure: "diagnostic_realtime" });
        resultat.visibiliteDestinataire = { visible: rows.some(r => r.id === id), status: 200 };
      } catch (e) { resultat.visibiliteDestinataire = { visible: null, motif: motifSur(e) }; }
    }
    mesures.push({ ...contexte, ...resultat, verdictLe, recuParAvantVerdict: recusAuVerdict,
      recuParPendantDiagnostic: [...receptionsSonde.get(id)].filter(i => !recusAuVerdict.includes(i)) });
    receptionsSonde.delete(id);
    if (!resultat.ok) throw new Error(resultat.motif);
  }
  async function action(compte, taille, page, tour) {
    const nom = actionPrevue(compte.index, tour, o.scenario), jwt = compte.jwt;
    const debutAction = performance.now(); let ok = false, motif = null;
    try {
      if (nom === "fil") await fil(compte, page);
      else if (nom === "notifications") await rest(nom, "notifications", { select: "id,kind,from_id,ref_id,content,seen,created_at", user_id: `eq.${compte.id}`, order: "created_at.desc", limit: "40" }, { jwt });
      else if (nom === "evenements") await rest(nom, "events", { select: "id,title,passion_id,description,city,date_at,author_id", order: "created_at.desc", limit: "60" }, { jwt });
      else if (nom === "profil") await rest(nom, "profiles", { select: "id,username,emoji,color,avatar_url,passion_id,passions,bio", id: `eq.${compte.id}` }, { jwt, attentes: { ...attendreTableau(), id: compte.id } });
      else if (nom === "message") await livraison(compte, taille, "message");
      else if (nom === "publier") await livraison(compte, taille, "post");
      else if (nom === "historique") {
        const conv = convPour(compte, taille);
        await rest(nom, "conv_messages", { select: "id,conv_id,from_id,content,created_at", conv_id: `eq.${conv.id}`, order: "created_at.desc", limit: "40" }, { jwt });
        await inserer("message_lire", "conv_reads", { conv_id: conv.id, user_id: compte.id, last_read_at: new Date().toISOString() },
          { jwt, extra: { Prefer: "resolution=merge-duplicates,return=representation" } });
      } else if (nom === "aimer") {
        const postId = postPourLike(postsFixture, compte.index, tour, comptes.length);
        await aimerEtRetirer({ post_id: postId, user_id: compte.id }, mutationsLikes,
          cle => { sauvegarder(); return inserer("aimer", "post_likes", cle, { jwt }); },
          cle => rest("retirer_like", "post_likes", { post_id: `eq.${cle.post_id}`, user_id: `eq.${cle.user_id}` },
            { jwt, methode: "DELETE", extra: { Prefer: "return=representation" }, attentes: attendreTableau(1, ["post_id", "user_id"]) }));
      }
      ok = true;
    } catch (e) { motif = motifSur(e); }
    mesures.push({ phase, palier: taille, page, type: "parcours", famille: nom, ok, motif, ms: Math.round(performance.now() - debutAction) });
    if (!ok && ["HTTP_401", "HTTP_403", "HTTP_429", "REALTIME_TIMEOUT"].includes(motif)) stop(motif);
  }
  async function reinitialiser() {
    changerPhase("reinitialisation");
    if (mutationsPosts.size) { await supprimer("reset_posts", "posts", { id: liste([...mutationsPosts]) }); mutationsPosts.clear(); }
    for (let i = 0; i < convs.length; i += 50) {
      const ids = convs.slice(i, i + 50).map(c => c.id);
      await supprimer("reset_messages", "conv_messages", { conv_id: liste(ids), id: `like.${prefix}_mesure_*` });
      await supprimer("reset_lectures", "conv_reads", { conv_id: liste(ids) });
    }
    for (const [key, cle] of mutationsLikes) {
      await supprimer("reset_like_residuel", "post_likes", { post_id: `eq.${cle.post_id}`, user_id: `eq.${cle.user_id}` });
      mutationsLikes.delete(key);
    }
    const likes = await rest("fixture_likes_verification", "post_likes", { select: "post_id,user_id", post_id: liste(postsFixture.map(p => p.id)) },
      { attentes: attendreTableau(postsFixture.length, ["post_id", "user_id"]) });
    const attendus = new Set(postsFixture.map((p, i) => `${p.id}:${comptes[(i + 1) % comptes.length].id}`));
    const recus = new Set(likes.map(l => `${l.post_id}:${l.user_id}`));
    if (likes.length !== attendus.size || recus.size !== attendus.size || [...recus].some(k => !attendus.has(k))) throw new Error("JEU_LIKES_FIXTURE_MODIFIE");
    const tete = await fil(comptes[0], 60);
    return createHash("sha256").update(JSON.stringify(tete)).digest("hex");
  }
  async function prevol() {
    changerPhase("prevol"); const debutPrevol = performance.now(), index = mesures.length;
    try {
      await connecter(comptes[0]); await connecter(comptes[1]);
      const premierFil = await fil(comptes[0], 60);
      await fil(comptes[1], 20);
      await livraison(comptes[0], 2, "post");
      if (o.scenario === "complet") await livraison(comptes[0], 2, "message");
      const compteursLikes = await prevolCompteurLikes();
      rapport.prevol = { ok: true, dureeMs: Math.round(performance.now() - debutPrevol),
        handlersParCompte: comptes.slice(0, 2).map(c => c.handlersConfirmes),
        messagerieV3: o.scenario === "complet" ? "livraison_confirmee" : "non_qualifiee", compteursLikes, fil: premierFil };
    } catch (e) { rapport.prevol = { ok: false, motif: motifSur(e), dureeMs: Math.round(performance.now() - debutPrevol) }; throw e; }
    finally { await fermerSockets(); rapport.prevol.mesures = mesures.length - index; sauvegarder(); }
  }
  async function prevolCompteurLikes() {
    const auteur = comptes[0], destinataire = comptes[1];
    const postId = postPourLike(postsFixture, auteur.index, 0, comptes.length);
    const avant = await compterLikes(destinataire, postId, "prevol_compteur_avant");
    if (avant !== 1) throw new Error("COMPTEUR_BASELINE_INATTENDU");
    const cle = { post_id: postId, user_id: auteur.id }, key = `${postId}:${auteur.id}`;
    mutationsLikes.set(key, cle); sauvegarder();
    let ajoute;
    try {
      await inserer("prevol_like_persistant", "post_likes", cle, { jwt: auteur.jwt });
      ajoute = await compterLikes(destinataire, postId, "prevol_compteur_ajoute");
      if (ajoute !== avant + 1) throw new Error("COMPTEUR_AJOUT_NON_VISIBLE");
    } finally {
      await rest("prevol_like_retrait", "post_likes", { post_id: `eq.${postId}`, user_id: `eq.${auteur.id}` },
        { jwt: auteur.jwt, methode: "DELETE", extra: { Prefer: "return=representation" }, attentes: attendreTableau(1, ["post_id", "user_id"]) });
      mutationsLikes.delete(key); sauvegarder();
    }
    const retire = await compterLikes(destinataire, postId, "prevol_compteur_retire");
    if (retire !== avant) throw new Error("COMPTEUR_RETRAIT_NON_VISIBLE");
    return { avant, ajoute, retire, lecture: "jwt_destinataire", persistantJusquaLecture: true };
  }
  async function palier(taille, page, empreinteAttendue) {
    const selection = comptesPourPalier(comptes, taille);
    for (const c of selection) c.postsVisibles = postsFixture.slice(-LIKES_VISIBLES.maximum).reverse().map(p => p.id);
    stage = { taille, page };
    const empreinte = await reinitialiser();
    if (empreinteAttendue && empreinte !== empreinteAttendue) throw new Error("JEU_DE_DONNEES_MODIFIE_ENTRE_VARIANTES");
    changerPhase("connexion");
    const debutConnexion = performance.now(); let connectes = 0;
    try {
      // Départs espacés, sans fanout Promise.all de 200 ouvertures à la même ms.
      for (const c of selection) { await connecter(c); connectes++; await sleep(20); }
      changerPhase("echauffement"); const debutChauffe = performance.now();
      for (const c of selection.slice(0, 4)) await fil(c, page);
      const chauffeMs = Math.round(performance.now() - debutChauffe);
      changerPhase("mesure"); const start = performance.now(), debutMesures = mesures.length, fin = start + o.duree * 1000;
      const borneDure = setTimeout(() => { if (controleurs.size) stop("DUREE_PALIER_180_S"); }, 180000);
      const parcoursActeurs = selection.map(async c => {
        await sleep(decalageInitial(o.graine, c.index)); let tour = 0;
        while (performance.now() < fin && !arret) {
          await action(c, taille, page, tour);
          const restants = fin - performance.now(); if (restants <= 0 || arret) break;
          await sleep(Math.min(pausePrevue(o.graine, c.index, tour++), restants));
        }
      });
      await Promise.all([...parcoursActeurs, ...selection.map(c => surveillerCompteurs(c, start, fin))]);
      clearTimeout(borneDure);
      const dureeMs = Math.round(performance.now() - start), subset = mesures.slice(debutMesures).filter(m => m.phase === "mesure");
      const http = statistiques(subset.filter(m => m.type === "http")), parcours = statistiques(subset.filter(m => m.type === "parcours")), realtime = statistiques(subset.filter(m => m.type === "realtime"));
      const messages = statistiques(subset.filter(m => m.type === "realtime" && m.famille === "message"));
      const publications = statistiques(subset.filter(m => m.type === "realtime" && m.famille === "post"));
      const httpCompteurs = statistiques(subset.filter(m => m.type === "http" && m.methode === "HEAD"));
      const httpPrincipal = statistiques(subset.filter(m => m.type === "http" && m.methode !== "HEAD"));
      const parcoursCompteurs = statistiques(subset.filter(m => m.type === "parcours" && m.famille === "compteurs_visibles"));
      const parcoursPrincipaux = statistiques(subset.filter(m => m.type === "parcours" && m.famille !== "compteurs_visibles"));
      const verdict = verdictAvecCompteurs({ http: httpPrincipal, parcours: parcoursPrincipaux, realtime, messages, posts: publications, connectes,
        attendus: taille, termine: !arret && dureeMs >= o.duree * 1000, fatal: arret, scenario: o.scenario }, httpCompteurs, parcoursCompteurs);
      const resultat = { taille, comptesDistincts: new Set(selection.map(c => c.id)).size, page, empreinte,
        connectes, handlersParSocket: abonnements(selection[0].id, o.profilRealtime).length, canauxParSocket: 2,
        profilRealtime: o.profilRealtime, connexionMs: Math.round(debutChauffe - debutConnexion), echauffementMs: chauffeMs, comptesEchauffement: Math.min(4, taille),
        dureeMs, http, parcours, httpPrincipal, httpCompteurs, parcoursPrincipaux, parcoursCompteurs, realtime, messages, publications,
        compteursVisibles: { ...LIKES_VISIBLES, cadence: "entre_debuts", coalescenceAvecFil: false,
          portee: "3 premiers posts de la derniere page, visibles pendant toute la mesure ; GET fil ne certifie pas un compte exact" },
        livraisonRealtimeQualifiee: o.scenario === "complet" && messages.succes > 0 && messages.erreurs === 0,
        familles: Object.fromEntries([...new Set(subset.map(m => `${m.type}:${m.famille}`))].map(key => [key, statistiques(subset.filter(m => `${m.type}:${m.famille}` === key))])),
        framesRealtime: Object.values(rapport.framesRealtime).filter(f => f.phase === "mesure" && f.palier === taille && f.page === page), verdict };
      rapport.paliers.push(resultat); changerPhase("fin_mesure"); sauvegarder();
      console.log(`Palier ${taille} personnes / page ${page} : ${resultat.verdict.ok ? "valide dans ce scenario" : "arret"}, HTTP p95 ${http.p95Ms} ms, erreurs ${http.erreurs}/${http.tentatives}.`);
      return resultat;
    } finally { await fermerSockets(); stage = null; }
  }
  async function nettoyer() {
    changerPhase("nettoyage");
    nettoyageBudget = new Budget({ ...LIMITES, octets: LIMITES.octetsNettoyage, requetes: 2000 });
    const erreurs = [];
    const essayer = async (label, fn) => { try { await fn(); } catch (e) { erreurs.push({ operation: label, motif: motifSur(e) }); } };
    // Uniquement les IDs consignés pour CETTE campagne ; jamais tous les charge_*.
    for (let i = 0; i < convs.length; i += 50) {
      const ids = convs.slice(i, i + 50).map(c => c.id);
      for (const table of ["conv_reads", "conv_messages", "conv_members"]) await essayer(table, () => supprimer("nettoyage_" + table, table, { conv_id: liste(ids) }));
      await essayer("conversations", () => supprimer("nettoyage_conversations", "conversations", { id: liste(ids) }));
    }
    const allPosts = [...postsFixture.map(p => p.id), ...mutationsPosts];
    for (let i = 0; i < allPosts.length; i += 60) {
      const ids = allPosts.slice(i, i + 60);
      for (const table of ["comment_interactions", "post_likes", "post_comments"]) await essayer(table, () => supprimer("nettoyage_" + table, table, { post_id: liste(ids) }));
      await essayer("posts", () => supprimer("nettoyage_posts", "posts", { id: liste(ids) }));
    }
    if (events.length) await essayer("events", () => supprimer("nettoyage_evenements", "events", { id: liste(events.map(e => e.id)) }));
    for (let i = 0; i < comptes.length; i += 50) {
      const ids = comptes.slice(i, i + 50).map(c => c.id);
      for (const table of ["notifications", "user_state"]) await essayer(table, () => supprimer("nettoyage_" + table, table, { user_id: liste(ids) }));
    }
    // Inclure les profils Auth créés avant un éventuel échec du login.
    const profilsANettoyer = [...new Set([...profilsFixture, ...comptes.map(c => c.id)])];
    for (let i = 0; i < profilsANettoyer.length; i += 50) await essayer("profiles", () => supprimer("nettoyage_profils", "profiles", { id: liste(profilsANettoyer.slice(i, i + 50)) }));
    for (const c of comptes) await essayer("auth", () => requete("nettoyage_auth", `/auth/v1/admin/users/${c.id}`, { methode: "DELETE", attentes: { objet: true } }));
    const comptesCreationIncertaine = emailsAttendus.slice(comptes.length);
    rapport.nettoyage = { ok: erreurs.length === 0 && comptesCreationIncertaine.length === 0, erreurs, comptesCibles: comptes.length,
      comptesCreationIncertaine,
      reserveOctets: LIMITES.octetsNettoyage, aVerifierSiInterruptionForcee: true };
  }
  try {
    sauvegarder(); await preparer(); await prevol();
    if (!o.prevolSeulement) {
      campagne: for (const taille of o.paliers) {
        let empreinte = null;
        for (const page of o.pages) {
          const resultat = await palier(taille, page, empreinte);
          // Un palier dégradé interdit toute augmentation et toute autre
          // variante, quel que soit le mode choisi.
          if (!resultat.verdict.ok) break campagne;
          empreinte = resultat.empreinte;
        }
      }
    }
  } catch (e) { rapport.erreur = motifSur(e); console.error(`Campagne arretee : ${rapport.erreur}.`); }
  finally {
    await fermerSockets();
    try { await nettoyer(); } catch (e) { rapport.nettoyage = { ok: false, motif: motifSur(e) }; }
    clearInterval(gardien); process.removeListener("SIGINT", interruption); process.removeListener("SIGTERM", interruption);
    rapport.comparaisons = o.pages.length !== 2 ? [] : o.paliers.map(taille => {
      const avant = rapport.paliers.find(p => p.taille === taille && p.page === 60), apres = rapport.paliers.find(p => p.taille === taille && p.page === 20);
      if (!avant || !apres || avant.empreinte !== apres.empreinte) return { taille, comparable: false };
      const a = avant.familles["http:fil_posts"], b = apres.familles["http:fil_posts"];
      return { taille, comparable: true, deuxPaliersValides: avant.verdict.ok && apres.verdict.ok,
        octetsParReponsePostsAvant: a?.tentatives ? a.octets / a.tentatives : null,
        octetsParReponsePostsApres: b?.tentatives ? b.octets / b.tentatives : null,
        p95ParcoursFilAvantMs: avant.familles["parcours:fil"]?.p95Ms ?? null,
        p95ParcoursFilApresMs: apres.familles["parcours:fil"]?.p95Ms ?? null };
    });
    sauvegarder();
  }
  return rapport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const o = optionsBanc(process.argv.slice(2));
    if (!o.executer) console.log(JSON.stringify({ plan: true, ...o, avertissement: "Aucun reseau. Ajouter --executer --sortie chemin.json uniquement apres revue." }, null, 2));
    else {
      const r = await executer(o);
      if (r.erreur || !r.nettoyage?.ok || r.paliers.some(p => !p.verdict.ok)) process.exitCode = 1;
    }
  } catch (e) { console.error(motifSur(e)); process.exitCode = 1; }
}
