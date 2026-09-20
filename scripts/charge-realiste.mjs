#!/usr/bin/env node
// Banc authentifié borné, staging exclusivement. Sans --executer : aucun réseau.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { verdictReponse } from "./charge-verdict.mjs";
import { optionsBanc, abonnements, actionPrevue, pausePrevue, decalageInitial,
  partenaire, clePaire, comptesPourPalier, Budget, LIMITES, statistiques, verdictPalier, Sondes } from "./lib/charge-realiste.mjs";

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
  let phase = "preparation", arret = null, cleAnon, cleService, stage = null, fermetureVoulue = false;
  const rapport = { version: 1, date: new Date().toISOString(), options: o, campagne: prefix,
    portee: "API authentifiee + Realtime, pas un test navigateur ni une certification production",
    limitesMesure: ["Octets applicatifs HTTP et WebSocket emis/recus, hors en-tetes, TLS et compression ; pas la facture egress.",
      "Frames Realtime observees cote clients ; le compteur ne remplace pas Usage Supabase.",
      "Sans telechargement de medias, upload, inscription par email, rendu mobile ou cache du navigateur.",
      "Les 12 handlers du chemin V3 utilisent 10 tables ; publication staging a verifier separement.",
      "60/20 compare deux tailles de page sur le meme jeu, pas deux builds de l'application."],
    prevol: null, paliers: [], nettoyage: null };
  function sauvegarder() {
    rapport.budget = budget.resume(); rapport.budgetNettoyage = nettoyageBudget?.resume() ?? null;
    rapport.dureeTotaleMs = Date.now() - debut;
    writeFileSync(destination, JSON.stringify({ ...rapport, mesures }, null, 2));
    writeFileSync(destination + ".manifest.json", JSON.stringify({ projet: o.projet, campagne: prefix,
      comptes: comptes.map(c => c.id), emailsSynthetiquesAttendus: emailsAttendus, profils: profilsFixture, posts: [...postsFixture.map(p => p.id), ...mutationsPosts],
      conversations: convs.map(c => c.id), evenements: events.map(e => e.id), nettoyage: rapport.nettoyage }, null, 2));
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
  async function requete(nom, chemin, { methode = "GET", corps, jwt = cleService, attentes = attendreTableau(), extra = {}, management = false } = {}) {
    const depart = performance.now(), controller = new AbortController();
    const current = { phase, palier: stage?.taille ?? null, page: stage?.page ?? null, famille: nom, type: "http", ok: false, motif: null, ms: 0, octets: 0, status: null };
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
  const inserer = (nom, table, corps, opt = {}) => rest(nom, table, {}, { methode: "POST", corps,
    attentes: attendreTableau(1, []), extra: { Prefer: "return=representation" }, ...opt });
  async function supprimer(nom, table, params, min = 0) {
    return rest(nom, table, params, { methode: "DELETE", extra: { Prefer: "return=representation" }, attentes: attendreTableau(min, []) });
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
    await obtenirCles();
    const passions = await rest("fixture_passion", "passions", { select: "id", limit: "1", order: "sort_order.asc" });
    const passion = passions[0].id;
    for (let i = 0; i < o.comptesDistincts; i++) {
      if (i) await sleep(2250); // <= 134 logins / 5 min, sans relance en boucle sur 429.
      const password = randomUUID() + "aA!7", email = `${prefix}_${i}@passio-e2e.test`;
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
    actifs.add(ws); let heartbeat, pret = false; const joins = new Map();
    const env = (topic, event, payload, ref) => {
      const texte = JSON.stringify({ topic, event, payload, ref: String(ref), join_ref: event === "phx_join" ? String(ref) : undefined });
      compter({ octets: octets(texte), messagesRealtime: 1 }); ws.send(texte);
    };
    await new Promise((resoudre, rejeter) => {
      const timer = setTimeout(() => rejeter(new Error("REALTIME_JOIN_TIMEOUT")), 15000);
      const echouer = code => { clearTimeout(timer); rejeter(new Error(code)); if (pret && !fermetureVoulue && !arret) stop(code); };
      ws.addEventListener("open", () => {
        try {
          env("realtime:realtime:db", "phx_join", { config: { broadcast: { self: false }, presence: { key: "" }, private: true,
            postgres_changes: abonnements(compte.id) }, access_token: compte.jwt }, "1");
          env(`realtime:user:${compte.id}`, "phx_join", { config: { broadcast: { self: false }, presence: { key: "" }, private: true }, access_token: compte.jwt }, "2");
          heartbeat = setInterval(() => { try { env("phoenix", "heartbeat", {}, "hb"); } catch (e) { echouer(motifSur(e)); } }, 25000);
        } catch (e) { echouer(motifSur(e)); }
      });
      ws.addEventListener("message", ev => {
        try {
          const texte = typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8");
          compter({ octets: octets(texte), messagesRealtime: 1 });
          const m = JSON.parse(texte);
          if (m.event === "phx_reply" && ["1", "2"].includes(String(m.ref))) {
            if (m.payload?.status !== "ok") return echouer("REALTIME_JOIN_REFUSE");
            if (String(m.ref) === "1") {
              const runtime = m.payload.response?.postgres_changes;
              if (!Array.isArray(runtime) || runtime.length !== 12) return echouer("REALTIME_12_HANDLERS_NON_CONFIRMES");
              compte.handlersConfirmes = runtime.length;
            }
            joins.set(String(m.ref), true);
            if (joins.size === 2) { clearTimeout(timer); pret = true; resoudre(); }
          }
          if (["phx_error", "phx_close"].includes(m.event)) return echouer("REALTIME_CANAL_FERME");
          if (m.event === "postgres_changes") {
            const data = m.payload?.data;
            if (data?.table === "posts" && data.record?.id) sondes.recevoir(cleSonde(compte.id, "post", data.record.id));
          }
          if (m.event === "broadcast" && m.payload?.event === "INSERT") {
            const payload = m.payload.payload, record = payload?.record || payload?.new || payload;
            if (record?.id) sondes.recevoir(cleSonde(compte.id, "message", record.id));
          }
        } catch (e) { echouer(motifSur(e)); }
      });
      ws.addEventListener("error", () => echouer("REALTIME_SOCKET_ERREUR"));
      ws.addEventListener("close", () => { clearInterval(heartbeat); actifs.delete(ws); if (!ws.fermetureBanc) echouer("REALTIME_SOCKET_FERMEE"); });
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
      rest("fil_commentaires", "post_comments", { select: "post_id,id,author_id,content,created_at", post_id: liste(ids), order: "created_at.desc", limit: "200" }, { jwt, attentes: attendreTableau(1, ["id", "author_id"]) }),
      rest("fil_interactions", "comment_interactions", { select: "comment_id,user_id,kind,payload,created_at", comment_id: liste(ids) }, { jwt, attentes: attendreTableau(0, ["comment_id", "user_id"]) }),
    ]);
    const refus = lots.find(r => r.status === "rejected");
    if (refus) throw refus.reason;
    const [likes, commentaires, reactions] = lots.map(r => r.value);
    const auteurs = [...new Set(commentaires.map(c => c.author_id))];
    const profils = await rest("fil_profils_commentaires", "profiles", { select: "id,username,emoji,color,avatar_url,passion_id,passions,bio", id: liste(auteurs) }, { jwt, attentes: attendreTableau(auteurs.length, ["id", "username"]) });
    return { posts: ids, likes: likes.length, commentaires: commentaires.length, reactions: reactions.length, profils: profils.length };
  }
  function convPour(compte, taille) { return convs.find(c => c.id === `${prefix}_conv_${clePaire(compte.index, partenaire(compte.index, taille))}`); }
  async function livraison(compte, taille, type) {
    const id = `${prefix}_mesure_${randomUUID()}`, recipient = comptes[partenaire(compte.index, taille)];
    const sonde = sondes.armer(cleSonde(recipient.id, type, id));
    const contexte = { phase, palier: stage?.taille ?? null, page: stage?.page ?? null, famille: type, type: "realtime" };
    try {
      if (type === "message") await inserer("message_envoyer", "conv_messages", { id, conv_id: convPour(compte, taille).id,
        from_id: compte.id, content: "Message de capacite entre deux comptes authentifies.", created_at: new Date().toISOString() }, { jwt: compte.jwt, attentes: { ...attendreTableau(), id } });
      else {
        mutationsPosts.add(id); sauvegarder();
        await inserer("post_publier", "posts", { id, author_id: compte.id, passion_id: postsFixture[0].passion_id,
          content: "Publication de capacite.", created_at: new Date().toISOString() }, { jwt: compte.jwt, attentes: { ...attendreTableau(), id } });
      }
    } catch (e) { sonde.annuler(); mesures.push({ ...contexte, ...await sonde.promise }); throw e; }
    const resultat = await sonde.promise; mesures.push({ ...contexte, ...resultat });
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
        let idx = (compte.index + tour) % postsFixture.length;
        if ((idx + 1) % comptes.length === compte.index) idx = (idx + 1) % postsFixture.length;
        const postId = postsFixture[idx].id;
        await inserer("aimer", "post_likes", { post_id: postId, user_id: compte.id }, { jwt });
        await rest("retirer_like", "post_likes", { post_id: `eq.${postId}`, user_id: `eq.${compte.id}` },
          { jwt, methode: "DELETE", extra: { Prefer: "return=representation" }, attentes: attendreTableau(1, ["post_id", "user_id"]) });
      }
      ok = true;
    } catch (e) { motif = motifSur(e); }
    mesures.push({ phase, palier: taille, page, type: "parcours", famille: nom, ok, motif, ms: Math.round(performance.now() - debutAction) });
    if (!ok && ["HTTP_401", "HTTP_403", "HTTP_429", "REALTIME_TIMEOUT"].includes(motif)) stop(motif);
  }
  async function reinitialiser() {
    phase = "reinitialisation";
    if (mutationsPosts.size) { await supprimer("reset_posts", "posts", { id: liste([...mutationsPosts]) }); mutationsPosts.clear(); }
    for (let i = 0; i < convs.length; i += 50) {
      const ids = convs.slice(i, i + 50).map(c => c.id);
      await supprimer("reset_messages", "conv_messages", { conv_id: liste(ids), id: `like.${prefix}_mesure_*` });
      await supprimer("reset_lectures", "conv_reads", { conv_id: liste(ids) });
    }
    await supprimer("reset_likes", "post_likes", { post_id: liste(postsFixture.map(p => p.id)) });
    await inserer("reset_likes_fixture", "post_likes", postsFixture.map((p, i) => ({ post_id: p.id, user_id: comptes[(i + 1) % comptes.length].id })));
    const tete = await fil(comptes[0], 60);
    return createHash("sha256").update(JSON.stringify(tete)).digest("hex");
  }
  async function prevol() {
    phase = "prevol"; const debutPrevol = performance.now(), index = mesures.length;
    try {
      await connecter(comptes[0]); await connecter(comptes[1]);
      const premierFil = await fil(comptes[0], 60);
      await fil(comptes[1], 20);
      await livraison(comptes[0], 2, "post");
      if (o.scenario === "complet") await livraison(comptes[0], 2, "message");
      rapport.prevol = { ok: true, dureeMs: Math.round(performance.now() - debutPrevol),
        handlersParCompte: comptes.slice(0, 2).map(c => c.handlersConfirmes),
        messagerieV3: o.scenario === "complet" ? "livraison_confirmee" : "non_qualifiee", fil: premierFil };
    } catch (e) { rapport.prevol = { ok: false, motif: motifSur(e), dureeMs: Math.round(performance.now() - debutPrevol) }; throw e; }
    finally { await fermerSockets(); rapport.prevol.mesures = mesures.length - index; sauvegarder(); }
  }
  async function palier(taille, page, empreinteAttendue) {
    const selection = comptesPourPalier(comptes, taille);
    const empreinte = await reinitialiser();
    if (empreinteAttendue && empreinte !== empreinteAttendue) throw new Error("JEU_DE_DONNEES_MODIFIE_ENTRE_VARIANTES");
    stage = { taille, page }; phase = "connexion";
    const debutConnexion = performance.now(); let connectes = 0;
    try {
      // Départs espacés, sans fanout Promise.all de 200 ouvertures à la même ms.
      for (const c of selection) { await connecter(c); connectes++; await sleep(20); }
      phase = "echauffement"; const debutChauffe = performance.now();
      for (const c of selection.slice(0, 4)) await fil(c, page);
      const chauffeMs = Math.round(performance.now() - debutChauffe);
      phase = "mesure"; const start = performance.now(), debutMesures = mesures.length, fin = start + o.duree * 1000;
      const borneDure = setTimeout(() => { if (controleurs.size) stop("DUREE_PALIER_180_S"); }, 180000);
      await Promise.all(selection.map(async c => {
        await sleep(decalageInitial(o.graine, c.index)); let tour = 0;
        while (performance.now() < fin && !arret) {
          await action(c, taille, page, tour);
          const restants = fin - performance.now(); if (restants <= 0 || arret) break;
          await sleep(Math.min(pausePrevue(o.graine, c.index, tour++), restants));
        }
      }));
      clearTimeout(borneDure);
      const dureeMs = Math.round(performance.now() - start), subset = mesures.slice(debutMesures).filter(m => m.phase === "mesure");
      const http = statistiques(subset.filter(m => m.type === "http")), parcours = statistiques(subset.filter(m => m.type === "parcours")), realtime = statistiques(subset.filter(m => m.type === "realtime"));
      const messages = statistiques(subset.filter(m => m.type === "realtime" && m.famille === "message"));
      const resultat = { taille, comptesDistincts: new Set(selection.map(c => c.id)).size, page, empreinte,
        connectes, handlersParSocket: 12, canauxParSocket: 2, connexionMs: Math.round(debutChauffe - debutConnexion), echauffementMs: chauffeMs, comptesEchauffement: Math.min(4, taille),
        dureeMs, http, parcours, realtime, messages, livraisonRealtimeQualifiee: o.scenario === "complet" && messages.succes > 0 && messages.erreurs === 0,
        familles: Object.fromEntries([...new Set(subset.map(m => `${m.type}:${m.famille}`))].map(key => [key, statistiques(subset.filter(m => `${m.type}:${m.famille}` === key))])),
        verdict: verdictPalier({ http, parcours, realtime, messages, connectes, attendus: taille, termine: !arret && dureeMs >= o.duree * 1000, fatal: arret, scenario: o.scenario }) };
      rapport.paliers.push(resultat); sauvegarder();
      console.log(`Palier ${taille} personnes / page ${page} : ${resultat.verdict.ok ? "valide dans ce scenario" : "arret"}, HTTP p95 ${http.p95Ms} ms, erreurs ${http.erreurs}/${http.tentatives}.`);
      return resultat;
    } finally { await fermerSockets(); stage = null; }
  }
  async function nettoyer() {
    phase = "nettoyage";
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
    if (!o.prevolSeulement) for (const taille of o.paliers) {
      const avant = await palier(taille, 60);
      // Un palier dégradé interdit toute augmentation, y compris la deuxième
      // variante : on ne poursuit pas une campagne déjà en difficulté.
      if (!avant.verdict.ok) break;
      const apres = await palier(taille, 20, avant.empreinte);
      if (!apres.verdict.ok) break;
    }
  } catch (e) { rapport.erreur = motifSur(e); console.error(`Campagne arretee : ${rapport.erreur}.`); }
  finally {
    await fermerSockets();
    try { await nettoyer(); } catch (e) { rapport.nettoyage = { ok: false, motif: motifSur(e) }; }
    clearInterval(gardien); process.removeListener("SIGINT", interruption); process.removeListener("SIGTERM", interruption);
    rapport.comparaisons = o.paliers.map(taille => {
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
