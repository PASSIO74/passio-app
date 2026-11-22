// ═══════════════════════════════════════════════════════════════════════════
// LE VILLAGE À 100 — simulation HYBRIDE sur le STAGING.
//
// Le village à 10 (village-10-comptes.spec.js) éprouve la JUSTESSE : dix vrais
// navigateurs trouvent les bugs de logique. Passer à 100 sert à voir ce que 10
// ne montre pas — une file d'attente longue, une course à 30 pour 3 places,
// une avalanche de notifications, les murs de quota du temps réel. Cent
// navigateurs ne tiennent pas sur un poste (~30 Go) : d'où l'HYBRIDE.
//
//   · 4 « yeux », de vrais navigateurs qui pilotent les VRAIS handlers de
//     l'app : Léa organise, Hugo s'inscrit tôt, Jade (téléphone) est dans la
//     course, Tom arrive en dernier. Ils disent ce que l'ÉCRAN montre.
//   · 96 figurants, des comptes réels pilotés par l'API REST/Realtime, sans
//     navigateur (scripts/lib/village100-figurants.mjs) : chacun fait les
//     MÊMES écritures que le client pour le même geste, et tient un socket
//     temps réel sur son topic privé `user:<uid>`, comme l'app.
//
// Le scénario central, « l'activité populaire » : 20 places, 100 personnes ;
// 30 cliquent à la même seconde pour les 3 dernières ; 80 en liste d'attente ;
// 10 désistements → promotions en cascade, dans l'ordre, notifiées une fois ;
// le volume de notifications chez l'organisatrice ; un post qui reçoit 100
// j'aime et 50 commentaires en 10 s ; l'annulation, 99 personnes prévenues
// (p50/p95). Et les murs : connexions temps réel, débits, 429.
//
// Mêmes niveaux que le village : EXIGÉ (contrat écrit — rouge s'il échoue) et
// OBSERVATION (ce qu'un testeur noterait — rapporté, jamais bloquant). Un
// contrôle qui échoue n'arrête pas la séance ; tout est jugé à la fin.
//
// ⚠️ STAGING SEULEMENT, OPT-IN, JAMAIS EN CI : `npm run village:100`
// (scripts/village100.mjs pose la cible et les clés, purge un reliquat). Les
// 100 comptes de la séance — eux seuls, par identifiant — sont purgés à la fin.
// Rapport : test-results/village100/rapport.md (+ rapport.json, captures/).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { configAdmin } = require("./compte-e2e");
const { poserGateSansPremiereVisite } = require("./gate-helper");
const { viserCibleSupabase, cibleSupabase } = require("./cible-supabase");

// Même valeur que `scripts/lib/village100.mjs` (module ES, chargé plus bas) : la
// garde exige l'égalité avec lui ET avec `PASSIO_STAGING_REF` posé par le lanceur.
const STAGING_REF = "fcksxofaelcdmmifnwjo";
const SORTIE = path.resolve(__dirname, "..", "..", "test-results", "village100");
const LIB = path.resolve(__dirname, "..", "..", "scripts", "lib");

const YEUX = [
  { nom: "Léa",  role: "organisatrice (20 places), publie le post populaire" },
  { nom: "Hugo", role: "s'inscrit tôt ; témoin du fil" },
  { nom: "Jade", role: "téléphone ; dans la course des 30 pour les 3 dernières places", mobile: true },
  { nom: "Tom",  role: "arrive en dernier : liste d'attente" },
];
const [LEA, HUGO, JADE, TOM] = [0, 1, 2, 3];

// La garde regarde les TROIS cibles (comme le village durci, 3d0be866) : celle
// du navigateur (`cibleSupabase()`, URL ET clé anon — sans clé anon, les
// navigateurs démarreraient sur la PRODUCTION), celle de la clé de service
// (`configAdmin()`), et le projet que cette clé désigne elle-même (`ref` du JWT).
function cibleEstLeStaging(refDeLaCle, refLib) {
  const url = `https://${STAGING_REF}.supabase.co`;
  const navigateur = cibleSupabase();
  const cfg = configAdmin();
  return refLib === STAGING_REF && process.env.PASSIO_STAGING_REF === STAGING_REF
    && !!navigateur && navigateur.url === url
    && !!cfg && cfg.url === url && refDeLaCle(cfg.cle) === STAGING_REF;
}
function lecteur() {
  const cfg = configAdmin();
  const h = { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}` };
  return async (table, query) => {
    const r = await fetch(`${cfg.url}/rest/v1/${table}?${query}`, { headers: h });
    if (!r.ok) throw new Error(`${table} : HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    return r.json();
  };
}
const pause = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
async function attendre(fn, { delai = 15000, pas = 1000 } = {}) {
  const fin = Date.now() + delai;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > fin) return v;
    await pause(pas);
  }
}
async function parallele(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// Posé AVANT tout chargement : ce qu'un œil reçoit EN DIRECT (notifications,
// commentaires sur ses publications) et ce que l'app lui dit (toasts).
// `_rtNotificationRecue` est une déclaration de fonction globale : le canal
// `user:<uid>` l'appelle par son nom, donc par la propriété de window.
function instrumenter() {
  window.__v100 = { notifs: [], commentaires: [], toasts: [] };
  const envelopper = (nom, noter) => {
    const o = window[nom];
    if (typeof o !== "function" || o.__v100) return;
    const w = function () { try { noter.apply(null, arguments); } catch (e) {} return o.apply(this, arguments); };
    w.__v100 = true; window[nom] = w;
  };
  setInterval(() => {
    envelopper("_rtNotificationRecue", (r) => window.__v100.notifs.push({ t: Date.now(), kind: r && r.kind, ref: r && r.ref_id, id: r && r.id }));
    envelopper("_rtCommentaireRecu", (r) => window.__v100.commentaires.push({ t: Date.now(), post: r && r.post_id, id: r && r.id }));
    envelopper("toast", (m) => window.__v100.toasts.push({ t: Date.now(), m: String(m) }));
  }, 300);
}

// L'inscription d'un œil : le VRAI parcours d'interface de `signupUser`
// (qa-helper.js) — landing, « Créer un compte », année, prénom, passion — mais
// un compte du domaine du banc (`emailOeil`), créé confirmé par l'API
// d'administration puis ouvert dans la page par mot de passe. Pourquoi pas
// `signupUser` tel quel : son adresse `@passio-e2e.test` est purgée par motif
// par le teardown de la CI pendant la séance (voir `emailOeil`).
async function inscrireOeil(page, cfg, manifeste, email, label, passionIndex) {
  const motDePasse = require("crypto").randomUUID() + "aA!7";
  const h = { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json" };
  manifeste.avantCreation(email); // AVANT : une réponse perdue reste retrouvable par l'adresse
  const r = await fetch(`${cfg.url}/auth/v1/admin/users`, { method: "POST", headers: h, body: JSON.stringify({ email, password: motDePasse, email_confirm: true }) });
  const u = await r.json().catch(() => ({}));
  if (!r.ok || !u.id) throw new Error(`création du compte de ${label} : HTTP ${r.status}`);
  manifeste.apresCreation(email, u.id);
  await poserGateSansPremiereVisite(page);
  await viserCibleSupabase(page);
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(() => typeof supa !== "undefined" && !!supa && typeof onbNext === "function", null, { timeout: 25000 });
  const out = await page.evaluate(async ([em, mdp]) => {
    const { data, error } = await supa.auth.signInWithPassword({ email: em, password: mdp });
    if (error || !data || !data.session) return { erreur: (error && error.message) || "sans session" };
    try { MY_UID = data.session.user.id; } catch (e) {}
    window.MY_UID = data.session.user.id;
    try { localStorage.setItem("passio_uid", data.session.user.id); } catch (e) {}
    return { uid: data.session.user.id };
  }, [email, motDePasse]);
  if (out.erreur || out.uid !== u.id) throw new Error(`connexion de ${label} : ${out.erreur || "identité incohérente"}`);
  await page.evaluate(() => { if (typeof onbNext === "function") onbNext(); });
  await page.waitForFunction(() => !!window.MY_UID, null, { timeout: 25000 });
  await page.locator("#birthYear").fill("1995");
  await page.getByRole("button", { name: "Valider" }).click();
  await page.locator("#userName").fill(label);
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForSelector("#passionGrid .psel-item[data-psel-id], #passionGrid .passion-tile[data-passion]", { timeout: 20000 });
  const items = page.locator("#passionGrid .psel-item[data-psel-id]");
  if (await items.count()) await items.nth(passionIndex % (await items.count())).click();
  else { const t = page.locator("#passionGrid .passion-tile[data-passion]"); const n = await t.count(); await t.nth(n ? passionIndex % n : 0).click(); }
  await page.getByRole("button", { name: "Entrer sur PASSIO" }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() => !!window.MY_UID && typeof supa !== "undefined" && !!supa, null, { timeout: 25000 });
  await page.waitForTimeout(2500);
  const profilOk = await page.evaluate(async () => {
    try { await supaUpsertProfile(); const { data } = await supa.from("profiles").select("id").eq("id", MY_UID); return !!(data && data.length); }
    catch (e) { return "erreur: " + e.message; }
  });
  if (profilOk !== true) throw new Error(`profil de ${label} absent après upsert : ${profilOk}`);
  return u.id;
}

test.describe("Le village à 100 — hybride navigateurs + figurants API", () => {
  test.skip(!process.env.PASSIO_E2E_VILLAGE100, "opt-in : npm run village:100 (staging seulement)");
  // Simulation de POSTE : même si un futur job vise le staging et pose la variable.
  test.skip(!!(process.env.CI || process.env.GITHUB_ACTIONS), "jamais en CI : 100 comptes réels");
  test.skip(!process.env.PASSIO_VILLAGE100_MANIFESTE, "lancer par npm run village:100 (manifeste et verrou de séance)");

  test("l'activité populaire, le post populaire, l'annulation", async ({ browser }) => {
    test.setTimeout(50 * 60 * 1000);
    const L = await import(pathToFileURL(path.join(LIB, "village100.mjs")).href);
    const F = await import(pathToFileURL(path.join(LIB, "village100-figurants.mjs")).href);
    if (!cibleEstLeStaging(L.refDeLaCle, L.STAGING_REF)) throw new Error("CIBLE_HORS_STAGING : le village à 100 n'écrit que sur le staging (npm run village:100).");
    const cfg = configAdmin();
    const lire = lecteur();
    const plan = L.planVillage();
    const A = plan.attendus;
    const t0 = Date.now();
    const log = (m) => console.log(`[village100 ${String(((Date.now() - t0) / 1000) | 0).padStart(4)}s] ${m}`);
    fs.mkdirSync(path.join(SORTIE, "captures"), { recursive: true });
    const campagne = L.campagneVillage100(Date.now(), require("crypto").randomBytes(4).toString("hex"));

    const rapport = {
      date: new Date().toISOString(), cible: `staging ${STAGING_REF}`, campagne,
      population: { yeux: YEUX.length, figurants: L.NB_FIGURANTS },
      personas: [], controles: [], latences: {}, murs: {}, http: null,
      erreursConsole: {}, erreursHttp: {}, captures: [], dureeS: 0, purge: null, arret: null,
      portee: [
        "Hybride : 4 navigateurs pilotent les vrais handlers de l'app ; 96 figurants font par l'API les MÊMES écritures que le client (UPDATE puis INSERT pour s'inscrire, DELETE puis promouvoir_attente pour se désister, notification après l'écriture acceptée).",
        "Le direct des figurants est mesuré sur leur socket `user:<uid>` (broadcast `notifications:INSERT`), celui des yeux par l'appel du gestionnaire de l'app ; horloge commune du poste, jamais l'horodatage serveur.",
        "Les murs de quota sont OBSERVÉS à 100 personnes (≈100 sockets, rafales de 30 et de 150 écritures) : la séance ne cherche pas à les atteindre — le forfait Pro est sous spend cap.",
        "`notify-call` est appelé par les figurants comme par le client (après chaque notification acceptée, et au « je viens »), mais aucun abonnement push n'existe : la fonction est sollicitée, rien n'est envoyé à un appareil.",
        "Pas de médias, pas de mesure de rendu ni de batterie sur téléphone réel.",
      ],
    };
    let acteCourant = "Installation";
    async function verifier(code, libelle, fn, { exige = true } = {}) {
      const debut = Date.now();
      let ok = false, detail = "";
      try { const r = await fn(); ok = !!(r && r.ok); detail = (r && r.detail) || ""; }
      catch (e) { ok = false; detail = "exception : " + String((e && e.message) || e).slice(0, 300); }
      const statut = ok ? "OK" : (exige ? "ÉCHEC" : "À REGARDER");
      rapport.controles.push({ acte: acteCourant, code, libelle, exige, statut, detail, ms: Date.now() - debut });
      log(`${ok ? "✅" : exige ? "❌" : "👀"} [${code}] ${libelle}${detail ? " — " + detail : ""}`);
      return ok;
    }
    // Le manifeste de la séance (lanceur : hors de test-results, sous verrou).
    // Écrit AVANT chaque création ; une écriture impossible arrête la séance.
    const manifeste = new F.Manifeste(process.env.PASSIO_VILLAGE100_MANIFESTE, campagne);

    const contexts = [], pages = [], uids = [null, null, null, null];
    const ev = (i, fn, arg) => pages[i].evaluate(fn, arg);
    const nom = (i) => YEUX[i].nom;
    async function capturer(etiquette, qui) {
      for (const i of qui) {
        const f = `${etiquette}-${nom(i).normalize("NFD").replace(/[^a-zA-Z]/g, "")}.png`;
        try { await pages[i].screenshot({ path: path.join(SORTIE, "captures", f) }); rapport.captures.push(f); } catch (e) {}
      }
    }
    const foule = new F.Foule({ url: cfg.url, anon: process.env.PASSIO_SUPABASE_ANON, service: cfg.cle, campagne, log, manifeste });
    const fig = (k) => foule.figurants[k];
    const lireRsvp = (evt) => lire("event_attendees", `select=user_id,rsvp,created_at&event_id=eq.${evt}`);
    const chargerEvt = (i, id) => ev(i, async (eid) => {
      const evs = (await supaLoadEvents()) || [];
      const e = evs.find((x) => x.id === eid);
      if (!e) return false;
      const c = _findCanonicalEvent(eid);
      if (c) Object.assign(c, e); else { state.seed.events = state.seed.events || []; state.seed.events.unshift(e); }
      return true;
    }, id);
    const chargerPost = (i, pid) => ev(i, async (id) => {
      const arr = await supaLoadPosts();
      const p = (arr || []).find((x) => x.id === id);
      if (p && !findPostAnywhere(id)) { state.supabasePosts = state.supabasePosts || []; state.supabasePosts.unshift(p); }
      return !!findPostAnywhere(id);
    }, pid);

    try {
      // ═══ INSTALLATION ═════════════════════════════════════════════════════
      for (const p of YEUX) {
        const ctx = await browser.newContext(p.mobile
          ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {});
        const page = await ctx.newPage();
        await page.addInitScript(instrumenter);
        rapport.erreursConsole[p.nom] = []; rapport.erreursHttp[p.nom] = [];
        page.on("console", (m) => { if (m.type() === "error") rapport.erreursConsole[p.nom].push(L.masquerCle(m.text()).slice(0, 200)); });
        page.on("response", (resp) => {
          if (resp.status() >= 400 && resp.url().includes("supabase.co")) rapport.erreursHttp[p.nom].push(`${resp.status()} ${resp.request().method()} ${resp.url().split("?")[0].slice(-60)}`);
        });
        contexts.push(ctx); pages.push(page);
      }
      log("inscription des 4 personnages en navigateur…");
      await Promise.all(YEUX.map(async (p, i) => {
        try { uids[i] = await inscrireOeil(pages[i], cfg, manifeste, L.emailOeil(campagne, i), `${p.nom} Centvillage`, i); }
        catch (e) { log(`❌ inscription de ${p.nom} : ${String(e.message).slice(0, 200)}`); }
      }));
      rapport.personas = YEUX.map((p, i) => ({ nom: p.nom, role: p.role, inscrit: !!uids[i] }));
      expect(uids.filter(Boolean).length, "les 4 personnages doivent être inscrits").toBe(4);
      // Le témoin côté NAVIGATEUR : la constante que l'app a réellement prise.
      const ciblesPages = await Promise.all(pages.map((p) => p.evaluate(() => (typeof SUPABASE_URL === "string" ? SUPABASE_URL : null))));
      expect(ciblesPages.every((u) => u === `https://${STAGING_REF}.supabase.co`), `les 4 navigateurs visent le staging (lu : ${[...new Set(ciblesPages)].join(", ")})`).toBe(true);
      // La feuille « Avant de continuer » (AUTH-03) : chacun répond comme un humain.
      await Promise.all(pages.map(async (page) => {
        const caseCgu = page.locator("#consentRequisCase");
        await page.waitForSelector("#consentRequisCase", { state: "visible", timeout: 15000 }).catch(() => {});
        if (await caseCgu.isVisible().catch(() => false)) {
          await caseCgu.check();
          await page.locator(".consent-requis-btn:not(.consent-requis-refus)").click();
          await page.waitForSelector("#consentRequisCase", { state: "detached", timeout: 10000 }).catch(() => {});
        }
      }));
      for (let i = 0; i < YEUX.length; i++) {
        await ev(i, async () => {
          state.user.general = state.user.general || {};
          state.user.general.isPrivate = false; state.user.general.privacyChoisi = true;
          saveState(); await supaUpsertProfile();
          await supa.from("profiles").update({ is_private: false }).eq("id", MY_UID);
        });
      }
      await verifier("I0", "les 4 personnages sont inscrits par le vrai parcours, CGU acceptées, profils publics", async () => {
        const rows = await lire("profiles", `select=id,is_private&id=in.(${uids.join(",")})`);
        const ouverte = (await Promise.all(pages.map((p) => p.locator("#consentRequisCase").isVisible().catch(() => false)))).filter(Boolean).length;
        return { ok: rows.length === 4 && rows.every((r) => !r.is_private) && ouverte === 0, detail: `${rows.length} profils, feuille CGU encore ouverte chez ${ouverte}` };
      });

      const passions = await lire("passions", "select=id&limit=1&order=sort_order.asc");
      log(`création de ${L.NB_FIGURANTS} figurants (connexions cadencées à ${L.DELAI_CONNEXION_MS} ms : ≤ ${L.connexionsParFenetre(L.DELAI_CONNEXION_MS)} / 5 min)…`);
      const tCreation = Date.now();
      await foule.creer(L.NB_FIGURANTS, { passion: passions[0].id });
      rapport.murs["Création des figurants"] = `${foule.figurants.length} comptes en ${Math.round((Date.now() - tCreation) / 1000)} s (connexion toutes les ${L.DELAI_CONNEXION_MS} ms)`;
      await verifier("I1", `${L.NB_FIGURANTS} figurants : compte confirmé, profil public, majorité déclarée`, async () => {
        const f = foule.figurants;
        const prof = f.filter((x) => x.profil === "ok").length, maj = f.filter((x) => x.majorite === "ok").length;
        const autre = f.find((x) => x.profil !== "ok" || x.majorite !== "ok");
        return { ok: f.length === L.NB_FIGURANTS && prof === f.length && maj === f.length,
          detail: `${f.length} comptes, ${prof} profils, ${maj} majorités${autre ? ` — ex. ${autre.profil} / ${autre.majorite}` : ""}` };
      });
      await verifier("I2", "chaque figurant tient son socket temps réel (`user:<uid>` rejoint)", async () => {
        const ok = foule.figurants.filter((x) => x.rt && x.rt.ok).length;
        rapport.latences["temps réel : rejoindre user:<uid> (figurants)"] = L.latences(foule.joins.filter((j) => j.ok).map((j) => j.ms));
        return { ok: ok === L.NB_FIGURANTS, detail: `${ok}/${L.NB_FIGURANTS} rejoints, ${foule.socketsOuverts()} sockets ouverts${foule.frames.refus.length ? " — refus : " + foule.frames.refus[0] : ""}` };
      });

      // ═══ ACTE 1 — L'ACTIVITÉ POPULAIRE ════════════════════════════════════
      acteCourant = "1 · L'activité populaire (20 places, 100 personnes)";
      log("── ACTE 1 : l'activité populaire ──");
      const evt = await ev(LEA, async () => {
        const id = "evt_" + uid();
        const ok = await supaPublishEvent({ id, title: "Concert au parc [village100]", passion: "musique", city: "Lyon", emoji: "🎸", date: Date.now() + 3 * 86400000, maxAttendees: 20 });
        if (!ok) return null;
        await supaJoinEvent(id);
        // Comme le formulaire (app-07, LOT-22) : la discussion d'activité s'ouvre
        // dès la publication confirmée, pour que les venants puissent y entrer.
        const e = ((await supaLoadEvents()) || []).find((x) => x.id === id);
        if (e) { state.userEvents = state.userEvents || []; if (!_findCanonicalEvent(id)) state.userEvents.unshift(e); await _joinEventConversation(_findCanonicalEvent(id)); }
        return id;
      });
      await verifier("E1", "Léa ouvre 20 places, en occupe une, et la discussion d'activité est ouverte", async () => {
        const e = evt ? await lire("events", `select=max_attendees,status,conv_id&id=eq.${evt}`) : [];
        const r = evt ? await lireRsvp(evt) : [];
        return { ok: !!evt && e[0] && e[0].max_attendees === L.PLACES && !!e[0].conv_id && r.length === 1 && r[0].user_id === uids[LEA], detail: evt ? `${e[0] && e[0].max_attendees} places, ${r.length} inscrit(s), discussion ${e[0] && e[0].conv_id ? "ouverte" : "ABSENTE"}` : "publication refusée" };
      });
      if (!evt) throw new Error("ACTIVITE_NON_PUBLIEE");
      for (const i of [HUGO, JADE, TOM]) await attendre(() => chargerEvt(i, evt), { delai: 15000, pas: 1500 });

      // Les précoces : Hugo par le vrai handler, 15 figurants par l'API.
      await ev(HUGO, (id) => setEventRsvp(id, "going"), evt);
      const precoces = await parallele(plan.precoces, 5, (k) => foule.rejoindre(fig(k), evt, L.PLACES, uids[LEA]));
      await verifier("E2", `${A.venantsAvantCourse} venants avant la course (Léa, Hugo, 15 figurants) : ${A.placesCourse} places restent`, async () => {
        const r = await lireRsvp(evt);
        const g = L.compterRsvp(r, "going");
        const refus = precoces.filter((x) => x.issue !== "going").map((x) => x.issue);
        return { ok: g === A.venantsAvantCourse && refus.length === 0, detail: `${g} venants${refus.length ? ", refus : " + refus.join(",") : ""}` };
      });

      // LA COURSE : 29 figurants et Jade, à la même seconde, pour 3 places.
      await chargerEvt(JADE, evt);
      const tDepart = Date.now() + 3000;
      log(`la course : ${A.coureurs} clics « je participe » à T+3 s pour ${A.placesCourse} places…`);
      const [course, jadeCourse] = await Promise.all([
        Promise.all(plan.course.map(async (k) => { await pause(tDepart - Date.now()); return { k, ...(await foule.rsvp(fig(k), evt, "going", uids[LEA])) }; })),
        ev(JADE, async ({ id, t }) => {
          await new Promise((r) => setTimeout(r, Math.max(0, t - Date.now())));
          const debut = Date.now();
          await setEventRsvp(id, "going");
          await new Promise((r) => setTimeout(r, 1500));
          const e = _findCanonicalEvent(id) || {};
          return { debut, rsvp: myRsvp(id), compte: (e.attendees || []).includes(MY_UID), toasts: (window.__v100.toasts || []).filter((x) => x.t >= debut).map((x) => x.m) };
        }, { id: evt, t: tDepart }),
      ]);
      const apresCourse = await lireRsvp(evt);
      const jadeGagne = apresCourse.some((a) => a.user_id === uids[JADE] && a.rsvp === "going");
      const tentatives = course.map((c) => ({ issue: c.issue, t: c.t, ms: c.ms })).concat([{ issue: jadeGagne ? "going" : (apresCourse.some((a) => a.user_id === uids[JADE]) ? "ligne_inattendue" : (/compl[eè]te?/i.test(jadeCourse.toasts.join(" ")) ? "complete" : "refus_sans_motif")), t: jadeCourse.debut }]);
      rapport.latences["course : écriture décisive (30 clics simultanés)"] = L.latences(course.map((c) => c.ms));
      await verifier("E3", `la course : exactement ${A.placesCourse} gagnants sur ${A.coureurs}, ${A.refusCourse} refus « complète », jamais 21 venants`, async () => {
        const v = L.verdictCourse({ lignesApres: apresCourse, tentatives, places: L.PLACES, placesCourse: A.placesCourse });
        const ecart = Math.max(...course.map((c) => c.t)) - Math.min(...course.map((c) => c.t));
        return { ok: v.ok, detail: `${v.venants} venants, ${v.gagnants} gagnants, ${v.refus} refus « complète »${v.autres ? `, ${v.autres} autres (${JSON.stringify(v.motifs)})` : ""} ; requêtes décisives (INSERT après l'UPDATE à vide) étalées sur ${ecart} ms ; Jade : ${jadeGagne ? "gagne" : "perd"}` };
      });
      await verifier("E4", "à l'écran de Jade : le verdict du serveur, sans place fantôme", async () => {
        const t = jadeCourse.toasts.join(" | ");
        const ok = jadeGagne ? jadeCourse.rsvp === "going" : (!jadeCourse.compte && jadeCourse.rsvp !== "going" && /compl[eè]te?/i.test(t));
        return { ok, detail: `${jadeGagne ? "gagnante" : "perdante"} ; rsvp à l'écran ${jadeCourse.rsvp || "aucun"} ; message « ${t.slice(0, 140)} »` };
      });
      await capturer("E4-course-jade", [JADE]);

      // Les perdants recliquent : liste d'attente. Puis les tardifs, puis Tom.
      const perdants = course.filter((c) => c.issue === "complete").map((c) => c.k);
      const attenteCourse = await Promise.all(perdants.map((k) => foule.rsvp(fig(k), evt, "waitlist")));
      let jadeAttente = null;
      if (!jadeGagne) {
        jadeAttente = await ev(JADE, async (id) => { toggleJoinEvent(id); await new Promise((r) => setTimeout(r, 2500)); return myRsvp(id); }, evt);
      }
      const tardifs = await parallele(plan.tardifs, 8, (k) => foule.rejoindre(fig(k), evt, L.PLACES, uids[LEA]));
      await chargerEvt(TOM, evt);
      const tom = await ev(TOM, async (id) => {
        const debut = Date.now();
        toggleJoinEvent(id);
        await new Promise((r) => setTimeout(r, 3000));
        return { rsvp: myRsvp(id), toasts: (window.__v100.toasts || []).filter((x) => x.t >= debut).map((x) => x.m) };
      }, evt);
      const apresFile = await lireRsvp(evt);
      await verifier("E5", `${L.PLACES} venants et ${A.attente} en liste d'attente, en base`, async () => {
        const g = L.compterRsvp(apresFile, "going"), w = L.compterRsvp(apresFile, "waitlist");
        return { ok: g === L.PLACES && w === A.attente, detail: `going ${g}, waitlist ${w}` };
      });
      await verifier("E6", "aucune entrée en liste d'attente n'est refusée (perdants de la course, tardifs, Jade, Tom)", async () => {
        const issues = attenteCourse.map((x) => x.issue).concat(tardifs.map((x) => x.issue));
        const mauvais = issues.filter((x) => x !== "waitlist");
        const tardifsVoientComplet = tardifs.filter((x) => x.complet).length;
        return { ok: mauvais.length === 0 && (jadeGagne || jadeAttente === "waitlist"), detail: `${issues.length - mauvais.length}/${issues.length} figurants en attente${mauvais.length ? " — " + [...new Set(mauvais)].join(",") : ""} ; ${tardifsVoientComplet}/${tardifs.length} tardifs ont lu « complet » avant d'écrire ; Jade : ${jadeGagne ? "venante" : jadeAttente}` };
      });
      await verifier("E7", "à l'écran de Tom : « liste d'attente », et la base dit pareil", async () => {
        const enBase = apresFile.find((a) => a.user_id === uids[TOM]);
        const t = tom.toasts.join(" | ");
        return { ok: tom.rsvp === "waitlist" && enBase && enBase.rsvp === "waitlist" && /attente/i.test(t), detail: `écran ${tom.rsvp}, base ${enBase ? enBase.rsvp : "absent"}, message « ${t.slice(0, 120)} »` };
      });
      await capturer("E7-attente-tom", [TOM]);

      // LA CASCADE, en deux temps. D'abord 5 désistements l'un après l'autre :
      // chacun doit promouvoir EXACTEMENT la tête de file du moment — c'est là
      // que « dans l'ordre » se mesure (l'horodatage des notifications ne le
      // peut pas : `now()` est l'heure de DÉBUT de transaction, antérieure à
      // l'attente du verrou de l'activité). Puis 5 à la même seconde : la
      // course entre promotions, l'ensemble promu doit être la tête de file.
      const attenteAvant = L.ordreAttente(apresFile);
      const desistants = plan.desistants.map(fig);
      const promusAttendus = new Set(attenteAvant.slice(0, A.desistements));
      const debutPromotion = new Map(); // promu attendu → instant du désistement qui le promeut
      const cascade = [], etapes = [];
      log(`la cascade : 5 désistements successifs, puis 5 simultanés…`);
      for (const f of desistants.slice(0, 5)) {
        const tete = L.ordreAttente(await lireRsvp(evt))[0];
        const t = Date.now();
        debutPromotion.set(tete, t);
        const c = await foule.desister(f, evt);
        cascade.push(c);
        const apres = await lireRsvp(evt);
        etapes.push({ tete, promue: apres.some((a) => a.user_id === tete && a.rsvp === "going"), venants: L.compterRsvp(apres, "going"), motif: c.promotion && c.promotion.motif });
      }
      const attenteMilieu = L.ordreAttente(await lireRsvp(evt));
      const tCascade = Date.now() + 2000;
      for (const u of attenteMilieu.slice(0, 5)) debutPromotion.set(u, tCascade);
      cascade.push(...await Promise.all(desistants.slice(5).map(async (f) => { await pause(tCascade - Date.now()); return foule.desister(f, evt); })));
      await pause(4000);
      const apresCascade = await lireRsvp(evt);
      const notifsPromo = await lire("notifications", `select=id,user_id,kind,from_id,ref_id,created_at&ref_id=eq.${evt}&kind=eq.event_update`);
      const vCascade = L.verdictCascade({ attenteAvant, lignesApres: apresCascade, notifs: notifsPromo, desistements: A.desistements, places: L.PLACES });
      await verifier("E8", `${A.desistements} désistements → les ${A.desistements} premiers de la file promus, ${L.PLACES} venants exactement, chacun prévenu une seule fois`, async () => ({
        ok: vCascade.ok,
        detail: `${vCascade.venants} venants ; promus ${vCascade.promus}/${A.desistements} (manquants ${vCascade.manquants}, hors rang ${vCascade.horsRang}) ; notifiés : sans ${vCascade.promusSansNotif}, en double ${vCascade.doublons}, non promus ${vCascade.notifiesNonPromus}`,
      }));
      await verifier("E9", "chaque désistement rend sa place : 10 promotions acceptées par `promouvoir_attente`", async () => {
        const ok = cascade.filter((c) => c.parti && c.promotion && c.promotion.ok === true).length;
        const motifs = {};
        for (const c of cascade) if (!(c.promotion && c.promotion.ok)) { const m = c.parti ? (c.promotion && c.promotion.motif) || "?" : "non_parti"; motifs[m] = (motifs[m] || 0) + 1; }
        rapport.latences["cascade : promouvoir_attente (10 simultanés)"] = L.latences(cascade.filter((c) => c.ms != null).map((c) => c.ms));
        const lente = Math.max(...cascade.filter((c) => c.ms != null).map((c) => c.ms));
        return { ok: ok === A.desistements, detail: `${ok}/${A.desistements} promotions ; la plus lente : ${lente} ms${Object.keys(motifs).length ? " — " + JSON.stringify(motifs) : ""}` };
      });
      await verifier("E10", "désistements successifs : chacun promeut exactement la tête de file du moment, sans jamais dépasser 20", async () => {
        const bons = etapes.filter((e) => e.promue && e.venants === L.PLACES).length;
        return { ok: bons === etapes.length && etapes.length === 5, detail: `${bons}/${etapes.length} étapes conformes${etapes.find((e) => !e.promue) ? ` ; première non conforme : tête non promue (${etapes.find((e) => !e.promue).motif || "?"})` : ""}` };
      });
      await verifier("E11", "chaque promu reçoit sa notification EN DIRECT sur son socket", async () => {
        const promusFig = foule.figurants.filter((f) => promusAttendus.has(f.id));
        const recus = promusFig.map((f) => { const n = f.notifsRecues.find((x) => x.kind === "event_update" && x.ref_id === evt); return n && debutPromotion.has(f.id) ? n.t - debutPromotion.get(f.id) : null; }).filter((x) => x != null);
        rapport.latences["cascade : du désistement à la notification du promu (en direct)"] = L.latences(recus);
        const yeuxPromus = [HUGO, JADE, TOM].filter((i) => promusAttendus.has(uids[i]));
        return { ok: recus.length === promusFig.length, detail: `${recus.length}/${promusFig.length} figurants promus prévenus en direct${yeuxPromus.length ? ` ; parmi les yeux : ${yeuxPromus.map(nom).join(", ")}` : ""}` };
      }, { exige: false });

      // Les désistants se ravisent : ils reprennent place, en FIN de file.
      const ravises = await Promise.all(desistants.map((f) => foule.rejoindre(f, evt, L.PLACES, uids[LEA])));
      const apresRavis = await lireRsvp(evt);
      await verifier("E12", `les ${A.desistements} désistants se ravisent : en fin de liste d'attente, sans doubler personne`, async () => {
        const ordre = L.ordreAttente(apresRavis);
        const queue = ordre.slice(-A.desistements);
        const enFin = desistants.every((f) => queue.includes(f.id));
        const issues = ravises.map((r) => r.issue);
        return { ok: enFin && issues.every((x) => x === "waitlist") && L.compterRsvp(apresRavis, "going") === L.PLACES,
          detail: `${issues.filter((x) => x === "waitlist").length}/${A.desistements} en attente ; en fin de file : ${enFin} ; file ${ordre.length}, venants ${L.compterRsvp(apresRavis, "going")}` };
      });

      // Ce que l'organisatrice reçoit à 100 personnes.
      const notifsLea = await lire("notifications", `select=id,user_id,from_id,kind,ref_id,created_at&user_id=eq.${uids[LEA]}&ref_id=eq.${evt}`);
      const joins = notifsLea.filter((n) => n.kind === "event_join");
      // Devenus venants : les 20 d'avant la cascade (dont les désistants), plus les promus.
      const venus = new Set(apresFile.filter((a) => a.rsvp === "going").map((a) => a.user_id).concat([...promusAttendus]));
      venus.delete(uids[LEA]);
      await verifier("E13", "Léa est prévenue une fois par personne devenue venante (inscription, course, promotion), sans doublon", async () => {
        const d = L.doublonsNotifs(joins);
        const emetteurs = new Set(joins.map((n) => n.from_id));
        // Qui est oublié : le rôle, pas un identifiant (les comptes sont purgés).
        const role = (u) => {
          if (u === uids[HUGO]) return "Hugo (précoce, navigateur)";
          if (promusAttendus.has(u)) return `promu n°${attenteAvant.indexOf(u) + 1} de la file`;
          const f = foule.figurants.find((x) => x.id === u);
          if (!f) return uids.indexOf(u) >= 0 ? nom(uids.indexOf(u)) : "inconnu";
          return plan.precoces.includes(f.index) ? `figurant précoce ${f.index + 1}` : `gagnant de la course (figurant ${f.index + 1})`;
        };
        const oublies = [...venus].filter((u) => !emetteurs.has(u));
        return { ok: d.doublons === 0 && oublies.length === 0 && joins.length === venus.size, detail: `${joins.length} « demande à participer » pour ${venus.size} personnes devenues venantes ; doublons ${d.doublons}, oubliées ${oublies.length}${oublies.length ? " : " + oublies.map(role).join(", ") : ""}` };
      });
      const ecranLea = await ev(LEA, async (id) => {
        const recusDirect = (window.__v100.notifs || []).filter((n) => n.ref === id).length;
        const nonLues = (state.notifications || []).filter((n) => n.unread).length;
        openNotifications();
        await new Promise((r) => setTimeout(r, 4000));
        const lignes = [...document.querySelectorAll(".notif-list .notif-row")].map((x) => x.innerText.replace(/\s+/g, " ").slice(0, 90));
        return { recusDirect, nonLues, lignes };
      }, evt);
      await capturer("E14-cloche-lea", [LEA]);
      await ev(LEA, () => { try { closeModal(); } catch (e) {} });
      await verifier("E14", "à 100 personnes, la cloche de l'organisatrice reste lisible (regroupée, pas une ligne par inscription)", async () => {
        const j = L.jugementSpam({ lignesAffichees: ecranLea.lignes.length, notifsActivite: notifsLea.length });
        const dureeMin = Math.max(1, Math.round((Date.now() - tDepart) / 60000));
        return { ok: !j.spam, detail: `${notifsLea.length} notifications sur l'activité en ~${dureeMin} min (dont ${joins.length} « demande à participer ») ; ${ecranLea.recusDirect} arrivées en direct ; cloche : ${ecranLea.nonLues} non lues, ${ecranLea.lignes.length} lignes affichées${j.regroupe ? " (regroupées)" : " (une par notification)"} ; 1re ligne : « ${ecranLea.lignes[0] || ""} »` };
      }, { exige: false });

      // ═══ ACTE 2 — LE POST POPULAIRE ═══════════════════════════════════════
      acteCourant = "2 · Le post populaire (100 j'aime, 50 commentaires en 10 s)";
      log("── ACTE 2 : le post populaire ──");
      // Les témoins suivent Léa par le VRAI bouton « Suivre » de son profil :
      // sans cela leur fil, filtré sur leur passion et leurs abonnements,
      // n'affiche pas son post et l'écran n'a rien à montrer (séance 3).
      const suivis = [];
      for (const i of [HUGO, JADE, TOM]) {
        await ev(i, (id) => openUserProfile(id), uids[LEA]);
        const b = pages[i].locator(`[id="followBtn_${uids[LEA]}"]:visible`).first();
        const ok = await b.click({ timeout: 10000 }).then(() => true).catch(() => false);
        await pause(1500);
        await ev(i, () => { try { closeModal(); } catch (e) {} });
        if (ok) suivis.push(nom(i));
      }
      const TEXTE = "Merci d'être venus si nombreux ! 🎸 [village100]";
      // Deux essais : le premier refus est rapporté tel quel (code, message).
      const essaisPost = [];
      let post = null;
      for (let essai = 0; essai < 2 && !post; essai++) {
        if (essai) await pause(3000);
        const r = await ev(LEA, async (txt) => {
          const id = "post_" + uid();
          const { error } = await supa.from("posts").insert([{ id, author_id: MY_UID, passion_id: "musique", mood: "all", content: txt, media_url: null, created_at: new Date().toISOString() }]);
          return error ? { e: `${error.code || "?"} ${String(error.message || "").slice(0, 160)}` } : { id };
        }, TEXTE);
        if (r.id) post = r.id; else essaisPost.push(r.e);
      }
      await verifier("P0", "Léa publie : la publication existe en base", async () => ({ ok: !!post && !essaisPost.length, detail: `${post || "aucune publication"}${essaisPost.length ? ` ; refus : ${essaisPost.join(" | ")}` : ""}` }));
      if (!post) throw new Error("POST_NON_PUBLIE");
      for (const i of [LEA, HUGO, JADE, TOM]) await attendre(() => chargerPost(i, post), { delai: 15000, pas: 1500 });
      for (const i of [HUGO, JADE, TOM]) await ev(i, () => { goTo("feed"); try { renderFeed(); } catch (e) {} });

      const offLikes = L.decalages(plan.aimeurs.length, 10000, 20261122);
      const offComs = L.decalages(plan.commentateurs.length, 10000, 1122);
      const tRafale = Date.now() + 2500;
      log("la rafale : 100 j'aime et 50 commentaires en 10 s…");
      const geste = (i, gestes) => ev(i, async ({ id, t, gestes }) => {
        for (const g of gestes) {
          await new Promise((r) => setTimeout(r, Math.max(0, t + g.a - Date.now())));
          if (g.quoi === "like") likePost(id, true);
          else {
            openComments(id);
            await new Promise((r) => setTimeout(r, 400));
            const champ = document.querySelector("#newComment");
            if (champ) { champ.value = g.texte; submitComment(id); }
            await new Promise((r) => setTimeout(r, 300));
            try { closeModal(); } catch (e) {}
          }
        }
        return true;
      }, { id: post, t: tRafale, gestes });
      const [likes, coms] = await Promise.all([
        Promise.all(plan.aimeurs.map(async (k, j) => { await pause(tRafale + offLikes[j] - Date.now()); return foule.aimer(fig(k), post, uids[LEA]); })),
        Promise.all(plan.commentateurs.map(async (k, j) => { await pause(tRafale + offComs[j] - Date.now()); return foule.commenter(fig(k), post, uids[LEA], `Super soirée, merci ! #${k + 1} [village100]`); })),
        geste(HUGO, [{ quoi: "like", a: 1000 }, { quoi: "com", a: 2000, texte: "Le son était parfait 🔊 [village100]" }]),
        geste(JADE, [{ quoi: "like", a: 3000 }, { quoi: "com", a: 6000, texte: "Vivement la prochaine ! [village100]" }]),
        geste(TOM, [{ quoi: "like", a: 5000 }]),
        geste(LEA, [{ quoi: "like", a: 7000 }]),
      ]);
      const tFinRafale = Date.now();
      const familleRafale = new Set(["like", "commentaire", "notif_like", "notif_comment"]);
      const mesRafale = foule.mesures.filter((m) => familleRafale.has(m.famille) && m.t >= tRafale - 100);
      rapport.latences["rafale : écriture d'un j'aime"] = L.latences(likes.map((x) => x.ms));
      rapport.latences["rafale : écriture d'un commentaire"] = L.latences(coms.map((x) => x.ms));
      rapport.murs["Débit d'écriture atteint (rafale du post)"] = `${mesRafale.length} écritures de figurants en ${Math.round((Math.max(...mesRafale.map((m) => m.t)) - tRafale) / 100) / 10} s, pic ${L.picParSeconde(mesRafale.map((m) => m.t))}/s ; 429 : ${mesRafale.filter((m) => m.status === 429).length}`;

      const lireLikes = () => lire("post_likes", `select=user_id&post_id=eq.${post}`);
      const lireComs = () => lire("post_comments", `select=author_id&post_id=eq.${post}`);
      await verifier("P1", `${A.likes} j'aime → exactement ${A.likes} lignes, une par personne`, async () => {
        const r = await attendre(async () => { const x = await lireLikes(); return x.length >= A.likes ? x : null; }, { delai: 20000 }) || await lireLikes();
        const refus = likes.filter((x) => x.like !== 201 && x.like !== 409).map((x) => x.like);
        return { ok: r.length === A.likes && new Set(r.map((x) => x.user_id)).size === A.likes, detail: `${r.length} lignes${refus.length ? ` ; refus figurants : ${JSON.stringify(refus.slice(0, 5))} ${likes.find((x) => x.detail) ? likes.find((x) => x.detail).detail : ""}` : ""}` };
      });
      await verifier("P2", `${A.commentaires} commentaires → exactement ${A.commentaires} lignes, ni perte ni doublon`, async () => {
        const r = await attendre(async () => { const x = await lireComs(); return x.length >= A.commentaires ? x : null; }, { delai: 25000 }) || await lireComs();
        const refus = coms.filter((x) => x.commentaire !== 201);
        return { ok: r.length === A.commentaires && new Set(r.map((x) => x.author_id)).size === A.commentaires, detail: `${r.length} lignes${refus.length ? ` ; refus figurants : ${refus.length} (${refus[0].commentaire} ${refus[0].detail})` : ""}` };
      });
      await verifier("P3", "les compteurs du fil (`fil_compteurs`, lus par Léa) disent 100 et 50", async () => {
        const c = await ev(LEA, async (id) => { const { data, error } = await supa.rpc("fil_compteurs", { _post_ids: [id] }); return error ? { e: error.code } : (data || [])[0]; }, post);
        return { ok: !!c && c.likes === A.likes && c.commentaires === A.commentaires, detail: c && c.e ? `erreur ${c.e}` : `likes ${c && c.likes}, commentaires ${c && c.commentaires}` };
      });
      await verifier("P4", `Léa reçoit ${A.likesNotifies} notifications de j'aime et ${A.commentaires} de commentaire, sans doublon`, async () => {
        const lireN = () => lire("notifications", `select=from_id,kind,user_id,ref_id&user_id=eq.${uids[LEA]}&ref_id=eq.${post}`);
        const r = await attendre(async () => { const x = await lireN(); return x.filter((n) => n.kind === "like").length >= A.likesNotifies && x.filter((n) => n.kind === "comment").length >= A.commentaires ? x : null; }, { delai: 20000 }) || await lireN();
        const d = L.doublonsNotifs(r);
        const lk = r.filter((n) => n.kind === "like").length, cm = r.filter((n) => n.kind === "comment").length;
        return { ok: lk === A.likesNotifies && cm === A.commentaires && d.doublons === 0, detail: `like ${lk}, comment ${cm}, doublons ${d.doublons}` };
      });
      // Le direct chez les témoins : jusqu'à 120 s après la rafale.
      const temoins = await Promise.all([HUGO, JADE, TOM].map(async (i) => {
        const fin = Date.now() + 120000;
        let vu = null, vuEcran = null, dernier = null;
        while (Date.now() < fin) {
          dernier = await ev(i, (id) => {
            const p = findPostAnywhere(id);
            const cmt = document.querySelector(`[data-cmtcount="${CSS.escape(id)}"]`);
            const like = cmt && cmt.closest(".post-actions") ? cmt.closest(".post-actions").querySelector('[data-action="like"]') : null;
            const n = (el) => { const m = el && /(\d+)/.exec(el.innerText || ""); return m ? Number(m[1]) : null; };
            return { likes: p ? p.likes || 0 : null, coms: p ? nbCommentairesPost(p) : null, ecranLikes: n(like), ecranComs: n(cmt) };
          }, post).catch(() => dernier);
          if (vu == null && dernier && dernier.likes >= A.likes && dernier.coms >= A.commentaires) vu = Date.now() - tFinRafale;
          if (vuEcran == null && dernier && dernier.ecranLikes >= A.likes && dernier.ecranComs >= A.commentaires) vuEcran = Date.now() - tFinRafale;
          if (vu != null && vuEcran != null) break;
          await pause(1000);
        }
        return { i, vu, vuEcran, dernier };
      }));
      rapport.latences["direct : 100 j'aime et 50 commentaires connus de l'app d'un témoin (après la rafale)"] = L.latences(temoins.filter((t) => t.vu != null).map((t) => t.vu));
      rapport.latences["direct : 100 j'aime et 50 commentaires AFFICHÉS sur la carte d'un témoin"] = L.latences(temoins.filter((t) => t.vuEcran != null).map((t) => t.vuEcran));
      await verifier("P5", "sans recharger, les témoins (Hugo, Jade, Tom) voient 100 j'aime et 50 commentaires en moins de 2 min", async () => {
        const ok = temoins.every((t) => t.vu != null && t.vuEcran != null);
        return { ok, detail: `abonnés à Léa par le bouton : ${suivis.join(", ") || "aucun"} ; ` + temoins.map((t) => `${nom(t.i)} : ${t.vu != null ? Math.round(t.vu / 1000) + " s" : "pas atteint"} (écran ${t.vuEcran != null ? "en " + Math.round(t.vuEcran / 1000) + " s" : "jamais"} ; mémoire ${t.dernier ? t.dernier.likes : "?"}/${t.dernier ? t.dernier.coms : "?"}, écran ${t.dernier && t.dernier.ecranLikes != null ? t.dernier.ecranLikes : "carte absente"}/${t.dernier && t.dernier.ecranComs != null ? t.dernier.ecranComs : "carte absente"})`).join(" ; ") };
      }, { exige: false });
      await capturer("P5-fil", [HUGO, JADE, TOM]);
      await verifier("P6", "Léa voit arriver commentaires et notifications en direct (topic `user:<uid>`)", async () => {
        const d = await ev(LEA, (id) => ({
          coms: (window.__v100.commentaires || []).filter((c) => c.post === id).length,
          notifs: (window.__v100.notifs || []).filter((n) => n.ref === id).length,
          memoire: findPostAnywhere(id) ? nbCommentairesPost(findPostAnywhere(id)) : null,
        }), post);
        return { ok: d.coms >= A.commentaires && d.notifs >= A.likesNotifies + A.commentaires, detail: `${d.coms}/${A.commentaires} commentaires et ${d.notifs}/${A.likesNotifies + A.commentaires} notifications reçus en direct ; compteur en mémoire ${d.memoire}` };
      }, { exige: false });

      // ═══ ACTE 3 — L'ANNULATION ════════════════════════════════════════════
      acteCourant = "3 · L'annulation (99 personnes prévenues)";
      log("── ACTE 3 : l'annulation ──");
      const avantAnnul = await ev(LEA, async (id) => {
        const e = ((await supaLoadEvents()) || []).find((x) => x.id === id);
        const c = _findCanonicalEvent(id);
        if (c && e) Object.assign(c, e); else if (e) { state.seed.events = state.seed.events || []; state.seed.events.unshift(e); }
        const cible = _findCanonicalEvent(id);
        return cible ? { dest: _destinatairesActivite(cible).length, a: (cible.attendees || []).length, w: (cible.waitlist || []).length } : null;
      }, evt);
      await verifier("A1", `la confirmation annonce ${A.prevenusAnnulation} personnes à prévenir`, async () => ({
        ok: !!avantAnnul && avantAnnul.dest === A.prevenusAnnulation,
        detail: avantAnnul ? `${avantAnnul.dest} destinataires (venants lus ${avantAnnul.a}, attente lue ${avantAnnul.w})` : "activité introuvable chez Léa",
      }));
      const recusAnnul = new Map();
      foule.surNotif = (f, r) => { if (r.kind === "event_cancelled" && r.ref_id === evt && !recusAnnul.has(f.id)) recusAnnul.set(f.id, r.t); };
      const httpLeaAvant = rapport.erreursHttp[nom(LEA)].length;
      const tClic = await ev(LEA, async (id) => { window.confirmerAction = async () => true; const t = Date.now(); await toggleCancelEvent(id); return t; }, evt);
      await attendre(async () => recusAnnul.size >= L.NB_FIGURANTS, { delai: 60000, pas: 500 });
      const lireAnnul = () => lire("notifications", `select=id,user_id,from_id,kind,ref_id&ref_id=eq.${evt}&kind=eq.event_cancelled`);
      const annul = await attendre(async () => { const x = await lireAnnul(); return x.length >= A.prevenusAnnulation ? x : null; }, { delai: 30000, pas: 2000 }) || await lireAnnul();
      await verifier("A2", "l'activité est « annulée » en base", async () => {
        const r = await lire("events", `select=status&id=eq.${evt}`);
        return { ok: r[0] && r[0].status === "cancelled", detail: `statut ${r[0] && r[0].status}` };
      });
      await verifier("A3", `${A.prevenusAnnulation} personnes prévenues de l'annulation, chacune une seule fois, jamais l'organisatrice`, async () => {
        const d = L.doublonsNotifs(annul);
        const dest = new Set(annul.map((n) => n.user_id));
        const errLea = rapport.erreursHttp[nom(LEA)].slice(httpLeaAvant).filter((x) => /notifications/.test(x));
        const statuts = {};
        for (const x of errLea) { const s = x.split(" ")[0]; statuts[s] = (statuts[s] || 0) + 1; }
        return { ok: dest.size === A.prevenusAnnulation && d.doublons === 0 && !dest.has(uids[LEA]),
          detail: `${dest.size}/${A.prevenusAnnulation} prévenus, doublons ${d.doublons}${errLea.length ? ` ; écritures refusées chez Léa : ${JSON.stringify(statuts)}` : ""}` };
      });
      const latAnnul = [...recusAnnul.values()].map((t) => t - tClic);
      const yeuxAnnul = await Promise.all([HUGO, JADE, TOM].map((i) => ev(i, (id) => (window.__v100.notifs || []).find((n) => n.ref === id && n.kind === "event_cancelled") || null, evt)));
      latAnnul.push(...yeuxAnnul.filter(Boolean).map((n) => n.t - tClic));
      rapport.latences["annulation : du clic à la notification reçue en direct"] = L.latences(latAnnul);
      await verifier("A4", "l'annulation arrive en direct chez les 99 (p95 ≤ 10 s)", async () => {
        const l = L.latences(latAnnul);
        return { ok: latAnnul.length === A.prevenusAnnulation && l.p95 != null && l.p95 <= 10000, detail: `${recusAnnul.size}/${L.NB_FIGURANTS} figurants et ${yeuxAnnul.filter(Boolean).length}/3 yeux prévenus en direct ; ${L.fmtLat(l)}` };
      }, { exige: false });
      await verifier("A5", "Tom voit l'activité annulée (pas une activité fantôme encore ouverte)", async () => {
        const s = await ev(TOM, async (id) => { const e = ((await supaLoadEvents()) || []).find((x) => x.id === id); return e ? (e.status || "active") : "absente"; }, evt);
        return { ok: s === "cancelled", detail: `statut lu : ${s}` };
      });
      await capturer("A-annulation", [LEA, TOM]);

      // ═══ LES MURS ═════════════════════════════════════════════════════════
      acteCourant = "4 · Les murs de quota du staging";
      const http = L.resumeHttp(foule.mesures);
      rapport.http = http;
      const navErr = Object.values(rapport.erreursHttp).flat();
      const nav429 = navErr.filter((x) => x.startsWith("429")).length;
      rapport.murs["Connexions temps réel simultanées"] = `pic ${foule.picSockets} sockets de figurants + ${YEUX.length} navigateurs ≈ ${foule.picSockets + YEUX.length} (plafond du forfait : 500) ; refus de join : ${foule.frames.refus.length} ; fermetures subies : ${foule.figurants.filter((f) => f.rtFerme).length}`;
      rapport.murs["Messages temps réel reçus (figurants)"] = `${foule.frames.total} trames, dont ${foule.frames.broadcasts} broadcasts (${foule.frames.notifications} notifications) ; pic ${L.picParSeconde(foule.frames.instants)}/s (plafond : 500/s)`;
      rapport.murs["HTTP des figurants"] = `${http.total} requêtes, 429 : ${http.total429}, 5xx : ${http.total5xx}, sans réponse (15 s, coupure) : ${http.totalReseau}`;
      rapport.murs["HTTP des navigateurs (≥ 400)"] = `${navErr.length} réponses, dont 429 : ${nav429}`;
      const push = http.familles.push_notify_call || { tentatives: 0, statuts: {} };
      rapport.murs["Fonction Edge notify-call (push)"] = `figurants : ${push.tentatives} appels (${Object.entries(push.statuts).map(([k, v]) => `${k}×${v}`).join(" ") || "aucun"}) ; navigateurs : ${navErr.filter((x) => /notify-call/.test(x)).length} réponses ≥ 400`;
      rapport.murs["Connexions Auth"] = `${(http.familles.auth_connexion || {}).tentatives || 0} connexions de figurants + 4 inscriptions navigateur ; 429 : ${((http.familles.auth_connexion || {}).statuts || {})[429] || 0}`;
      rapport.murs["Budget de séance"] = JSON.stringify(foule.budget.resume());
      for (const [k, corps] of Object.entries(foule.premiersRefus)) rapport.murs[`Premier refus « ${k} »`] = corps;
      await verifier("M1", "aucun 429, aucun 5xx, aucune requête sans réponse pendant la séance (figurants et navigateurs)", async () => {
        const touchees = Object.entries(http.familles).filter(([, f]) => f.statuts[429] || f.statuts.reseau || Object.keys(f.statuts).some((s) => Number(s) >= 500))
          .map(([k, f]) => `${k} (${Object.entries(f.statuts).filter(([s]) => s === "429" || s === "reseau" || Number(s) >= 500).map(([s, n]) => `${s}×${n}`).join(" ")})`);
        return { ok: http.total429 === 0 && http.total5xx === 0 && http.totalReseau === 0 && nav429 === 0,
          detail: `figurants : 429 ×${http.total429}, 5xx ×${http.total5xx}, sans réponse ×${http.totalReseau} ; navigateurs : 429 ×${nav429}${touchees.length ? " — familles : " + touchees.join(", ") : ""}` };
      }, { exige: false });
      await verifier("M3", "les venants entrent dans la discussion de l'activité (`conv_members`, comme `_joinEventConversation`)", async () => {
        const d = http.familles.discussion_rejoindre || { tentatives: 0, statuts: {} };
        const ok = (d.statuts[201] || 0) + (d.statuts[409] || 0);
        return { ok: d.tentatives > 0 && ok === d.tentatives, detail: `${ok}/${d.tentatives} entrées acceptées (${Object.entries(d.statuts).map(([k, v]) => `${k}×${v}`).join(" ")})${foule.premiersRefus["discussion_rejoindre 403"] ? ` ; refus : « ${foule.premiersRefus["discussion_rejoindre 403"]} »` : ""}` };
      }, { exige: false });
      await verifier("M2", "les sockets des figurants ont tenu toute la séance", async () => {
        const tombes = foule.figurants.filter((f) => f.rtFerme || f.rtErreur);
        return { ok: tombes.length === 0, detail: `${foule.socketsOuverts()}/${L.NB_FIGURANTS} encore ouverts${tombes.length ? ` ; tombés : ${tombes.length} (${tombes[0].rtErreur || "close " + (tombes[0].rtFerme || {}).code})` : ""}` };
      }, { exige: false });
      await verifier("C1", "aucune erreur JavaScript dans la console des 4 navigateurs", async () => {
        const avec = Object.entries(rapport.erreursConsole).filter(([, l]) => l.some((m) => !/Failed to load resource/i.test(m)));
        return { ok: avec.length === 0, detail: avec.map(([n, l]) => `${n} ×${l.length}`).join(", ") };
      }, { exige: false });
    } catch (e) {
      rapport.arret = String((e && e.message) || e).slice(0, 300);
      log(`⛔ séance interrompue : ${rapport.arret}`);
    } finally {
      // ═══ PURGE — les comptes du MANIFESTE, par adresse exacte, relus en 404 ═
      // Le manifeste porte chaque adresse écrite AVANT sa création : un compte
      // dont la réponse s'est perdue, ou un œil tombé en route, part aussi.
      foule.fermer();
      for (const c of contexts) { try { await c.close(); } catch (e) {} }
      try { rapport.purge = await F.purgerSeance({ url: cfg.url, service: cfg.cle, manifeste: manifeste.etat, log }); }
      catch (e) { rapport.purge = { lignes: 0, comptes: 0, restants: [], refus: [], erreurs: [String(e.message)] }; }
      const purgeOk = F.purgeComplete(rapport.purge);
      if (purgeOk) manifeste.purgee();
      acteCourant = "5 · Purge de la séance";
      rapport.controles.push({ acte: acteCourant, code: "Z1", exige: true, statut: purgeOk ? "OK" : "ÉCHEC", ms: 0,
        libelle: "les comptes de la séance sont supprimés et relus absents (404), aucune ligne en erreur",
        detail: `${rapport.purge.comptes}/${rapport.purge.attendus ?? manifeste.etat.comptes.length} comptes relus absents, ${rapport.purge.lignes} lignes${rapport.purge.restants.length ? " ; RESTANTS : " + rapport.purge.restants.slice(0, 5).join(", ") : ""}${rapport.purge.refus.length ? " ; REFUS : " + rapport.purge.refus.slice(0, 3).join(", ") : ""}${rapport.purge.erreurs.length ? " ; erreurs : " + rapport.purge.erreurs.slice(0, 3).join(" ; ") : ""}` });
      rapport.verdict = L.verdictFinal(rapport.controles);
      rapport.dureeS = Math.round((Date.now() - t0) / 1000);
      if (!rapport.http) rapport.http = L.resumeHttp(foule.mesures);
      fs.writeFileSync(path.join(SORTIE, "rapport.json"), JSON.stringify(rapport, null, 2));
      fs.writeFileSync(path.join(SORTIE, "rapport.md"), L.rapportMarkdown(rapport));
      log("rapport : test-results/village100/rapport.md");
    }

    expect(rapport.arret, "séance interrompue (détail : test-results/village100/rapport.md)").toBeNull();
    // Les rouges ASSUMÉS sont nommés (`ROUGES_CONNUS`, scripts/lib/village100.mjs) :
    // un NOUVEAU rouge, ou un rouge connu qui repasse vert, rend la séance rouge.
    const v = rapport.verdict;
    expect({ nouveaux: v.nouveaux, gueris: v.gueris, absents: v.absents },
      `verdict contre les rouges connus ${JSON.stringify(L.ROUGES_CONNUS)} (détail : test-results/village100/rapport.md)`)
      .toEqual({ nouveaux: [], gueris: [], absents: [] });
  });
});
