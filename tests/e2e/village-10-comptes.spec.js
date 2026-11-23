// ═══════════════════════════════════════════════════════════════════════════
// LE VILLAGE — 10 personnes qui vivent ensemble dans PASSIO, sur le STAGING.
//
// Pourquoi cette suite, alors que `multi-comptes` et `qa-campaign` existent :
// les deux premières éprouvent des PAIRES de comptes (A agit, B reçoit), et la
// campagne QA mesure surtout la messagerie. Personne n'avait encore fait vivre
// un GROUPE autour des deux usages qui font l'app — partager du contenu, et
// organiser une activité où l'on se retrouve — avec les rôles qui produisent
// les cas délicats : la file d'attente, la course pour la dernière place, le
// compte privé, le fâcheux bloqué et signalé, la suppression, l'annulation.
//
// Chaque personnage = un BrowserContext (session, stockage, temps réel
// propres). On pilote les VRAIS handlers de l'app (likePost, submitComment,
// sharePostInFeed, setEventRsvp, blockUser, toggleCancelEvent…) et on juge
// sur TROIS témoins : ce que l'écran de chacun montre, ce que la base contient
// (lue avec la clé de service, jamais un 200 pris pour un succès), et ce qui
// arrive en direct.
//
// Deux niveaux de contrôle :
//   EXIGÉ       — un contrat écrit dans le code ou la doc ; un échec rend la
//                 suite rouge.
//   OBSERVATION — ce qu'un testeur noterait (« le partage n'a pas prévenu
//                 l'auteur ») sans contrat écrit ; rapporté, jamais bloquant.
// Un contrôle qui échoue n'arrête PAS le village : comme dix testeurs, on
// note et on continue. Tout est jugé à la fin, dans le rapport.
//
// ⚠️ STAGING SEULEMENT, ET OPT-IN. Lancer par `npm run village`
// (scripts/village.mjs pose la cible et les clés). Les dix comptes de la
// séance — et eux seuls, par identifiant, jamais par motif — sont purgés à la
// fin : une autre suite qui tourne en parallèle ne perd rien.
//
// Rapport : test-results/village/rapport.md (+ rapport.json, captures/).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { signupUser } = require("./qa-helper");
const { configAdmin } = require("./compte-e2e");
const { cibleSupabase } = require("./cible-supabase");

// Même valeur que `scripts/lib/charge-realiste.mjs` (module ES, non chargeable
// ici) : le lanceur la transmet (`PASSIO_STAGING_REF`) et la garde exige l'égalité.
const STAGING_REF = "fcksxofaelcdmmifnwjo";
const SORTIE = path.resolve(__dirname, "..", "..", "test-results", "village");

// index → personnage. L'ordre est la distribution des rôles.
const PERSONAS = [
  { nom: "Léa",   role: "organisatrice, publie beaucoup" },
  { nom: "Marc",  role: "voudrait co-organiser" },
  { nom: "Inès",  role: "habituée, partage" },
  { nom: "Hugo",  role: "habitué, commente" },
  { nom: "Chloé", role: "habituée, réseau capricieux" },
  { nom: "Tom",   role: "arrive tard, quand c'est presque complet" },
  { nom: "Sarah", role: "s'inscrit puis se désiste" },
  { nom: "Nina",  role: "compte privé", prive: true },
  { nom: "Kevin", role: "le fâcheux (spam, sera bloqué et signalé)" },
  { nom: "Jade",  role: "nouvelle, sur téléphone", mobile: true },
];
const [LEA, MARC, INES, HUGO, CHLOE, TOM, SARAH, NINA, KEVIN, JADE] = PERSONAS.map((_, i) => i);

// Ordre de purge : celui de scripts/purge-e2e-rest.js (des enfants vers les
// parents, `cdv_*` exceptées : ADR-011, plus écrites), plus les tables que ce
// scénario écrit et que la purge générale laisse au CASCADE (`event_comments`,
// `reports`) ou à l'onboarding (`user_passions`). ⚠️ `purge-e2e-rest.js` n'est
// pas importable : il PURGE dès qu'on le charge.
const TABLES_PURGE = [
  ["conv_messages", ["from_id"]],
  ["conv_reads", ["user_id"]],
  ["conv_members", ["user_id"]],
  ["notifications", ["user_id", "from_id"]],
  ["comment_interactions", ["user_id"]],
  ["post_comments", ["author_id"]],
  ["post_likes", ["user_id"]],
  ["follows", ["follower_id", "following_id"]],
  ["reports", ["reporter_id"]],
  ["posts", ["author_id"]],
  ["stories", ["author_id"]],
  ["event_comments", ["author_id"]],
  ["event_attendees", ["user_id"]],
  ["event_reactions", ["user_id"]],
  ["events", ["author_id"]],
  ["blocks", ["blocker_id", "blocked_id"]],
  ["push_subscriptions", ["user_id"]],
  ["user_state", ["user_id"]],
  ["user_passions", ["user_id"]],
  ["profiles", ["id"]],
];

// La garde regarde les TROIS cibles, pas une : celle du navigateur
// (`cibleSupabase()`, qui exige URL ET clé anon — sans clé anon, les dix
// navigateurs démarreraient sur la PRODUCTION), celle de la clé de service
// (`configAdmin()`), et le projet que la clé de service désigne elle-même
// (charge du JWT : `ref`). Une clé illisible est un refus, jamais un « sans doute ».
function refDeLaCle(cle) {
  try { return JSON.parse(Buffer.from(String(cle).split(".")[1], "base64url").toString("utf8")).ref || null; }
  catch (e) { return null; }
}
function cibleEstLeStaging() {
  const url = `https://${STAGING_REF}.supabase.co`;
  const navigateur = cibleSupabase();
  const cfg = configAdmin();
  return (!process.env.PASSIO_STAGING_REF || process.env.PASSIO_STAGING_REF === STAGING_REF)
    && !!navigateur && navigateur.url === url
    && !!cfg && cfg.url === url && refDeLaCle(cfg.cle) === STAGING_REF;
}

// ── Lecture/écriture « vérité base » avec la clé de service (staging) ──────
function admin() {
  const cfg = configAdmin();
  const h = { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json" };
  return {
    async lire(table, query) {
      const r = await fetch(`${cfg.url}/rest/v1/${table}?${query}`, { headers: h });
      if (!r.ok) throw new Error(`${table} : HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
      return r.json();
    },
    async supprimer(table, query) {
      const r = await fetch(`${cfg.url}/rest/v1/${table}?${query}`, { method: "DELETE", headers: Object.assign({ Prefer: "return=representation" }, h) });
      if (!r.ok) {
        const t = await r.text();
        // Seule une TABLE absente est tolérée (le schéma du staging dérive) ;
        // une COLONNE absente (« column … does not exist ») est une liste de
        // purge fausse : elle laisserait ses lignes en silence.
        if (/Could not find the table|relation "[^"]+" does not exist/i.test(t)) return 0;
        throw new Error(`${table} : HTTP ${r.status} ${t.slice(0, 160)}`);
      }
      const l = await r.json();
      return Array.isArray(l) ? l.length : 0;
    },
    async supprimerCompte(id) {
      const r = await fetch(`${cfg.url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: h });
      if (!r.ok && r.status !== 404) throw new Error(`compte ${id.slice(0, 8)}… : HTTP ${r.status}`);
    },
    async compteExiste(id) {
      const r = await fetch(`${cfg.url}/auth/v1/admin/users/${id}`, { headers: h });
      if (r.status === 404) return false;
      if (!r.ok) throw new Error(`compte ${id.slice(0, 8)}… illisible : HTTP ${r.status}`);
      return true;
    },
    // Les comptes de CETTE séance, par le préfixe de leur adresse — y compris
    // ceux dont l'inscription a cassé après la création (uid jamais rendu).
    async comptesDeLaSeance(prefixe) {
      const ids = [];
      for (let p = 1; p <= 50; p++) {
        const r = await fetch(`${cfg.url}/auth/v1/admin/users?page=${p}&per_page=200`, { headers: h });
        if (!r.ok) throw new Error(`liste des comptes : HTTP ${r.status}`);
        const d = await r.json();
        const lot = d.users || [];
        for (const u of lot) if (typeof u.email === "string" && u.email.startsWith(`e2e_${prefixe}_`) && u.email.endsWith("@passio-e2e.test")) ids.push(u.id);
        if (lot.length < 200) break;
      }
      return ids;
    },
  };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function attendre(fn, { delai = 15000, pas = 1000 } = {}) {
  const fin = Date.now() + delai;
  let v;
  for (;;) {
    v = await fn();
    if (v) return v;
    if (Date.now() > fin) return v;
    await pause(pas);
  }
}

test.describe("Le village — 10 comptes, partage de contenu et activités", () => {
  test.skip(!process.env.PASSIO_E2E_VILLAGE, "opt-in : npm run village (staging seulement)");
  // Simulation de POSTE : même si un futur job vise le staging et pose la variable.
  test.skip(!!(process.env.CI || process.env.GITHUB_ACTIONS), "jamais en CI : dix navigateurs");

  test("une semaine dans le village", async ({ browser }) => {
    test.setTimeout(25 * 60 * 1000);
    if (!cibleEstLeStaging()) throw new Error("CIBLE_HORS_STAGING : le village n'écrit que sur le staging (npm run village pose la cible).");

    const db = admin();
    // Préfixe d'adresse propre à CETTE séance (`e2e_village<6>_…`) : la purge le
    // retrouve même sans uid, et n'atteint jamais les comptes d'une autre suite.
    const PREFIXE = "village" + Math.random().toString(36).slice(2, 8);
    const t0 = Date.now();
    const log = (m) => console.log(`[village ${String(((Date.now() - t0) / 1000) | 0).padStart(4)}s] ${m}`);
    fs.mkdirSync(path.join(SORTIE, "captures"), { recursive: true });

    const rapport = {
      date: new Date().toISOString(), cible: `staging ${STAGING_REF}`,
      personas: [], controles: [], erreursConsole: {}, erreursHttp: {}, captures: [], dureeS: 0, purge: null,
    };
    let acteCourant = "Installation";
    async function verifier(code, libelle, fn, { exige = true } = {}) {
      const debut = Date.now();
      let ok = false, detail = "";
      try {
        const r = await fn();
        ok = !!(r && r.ok);
        detail = (r && r.detail) || "";
      } catch (e) {
        ok = false; detail = "exception : " + String((e && e.message) || e).slice(0, 300);
      }
      const statut = ok ? "OK" : (exige ? "ÉCHEC" : "À REGARDER");
      rapport.controles.push({ acte: acteCourant, code, libelle, exige, statut, detail, ms: Date.now() - debut });
      log(`${ok ? "✅" : exige ? "❌" : "👀"} [${code}] ${libelle}${detail ? " — " + detail : ""}`);
      return ok;
    }

    const contexts = [], pages = [], uids = [];
    const ev = (i, fn, arg) => pages[i].evaluate(fn, arg);
    const nom = (i) => PERSONAS[i].nom;
    async function capturer(etiquette, qui) {
      for (const i of qui) {
        const f = `${etiquette}-${i + 1}-${nom(i).normalize("NFD").replace(/[^a-zA-Z]/g, "")}.png`;
        try { await pages[i].screenshot({ path: path.join(SORTIE, "captures", f) }); rapport.captures.push(f); } catch (e) {}
      }
    }

    try {
      // ═══ INSTALLATION — dix inscriptions par le vrai parcours ═════════════
      for (let i = 0; i < PERSONAS.length; i++) {
        const p = PERSONAS[i];
        const ctx = await browser.newContext(p.mobile
          ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
          : {});
        const page = await ctx.newPage();
        rapport.erreursConsole[p.nom] = [];
        rapport.erreursHttp[p.nom] = [];
        // La clé anon voyage dans l'URL des WebSockets (« …?apikey=… failed ») :
        // publique, mais elle n'a rien à faire dans un rapport.
        page.on("console", (m) => { if (m.type() === "error") rapport.erreursConsole[p.nom].push(m.text().replace(/apikey=[^&\s"']+/gi, "apikey=…").slice(0, 200)); });
        page.on("response", (resp) => {
          if (resp.status() >= 400 && resp.url().includes("supabase.co")) rapport.erreursHttp[p.nom].push(`${resp.status()} ${resp.request().method()} ${resp.url().split("?")[0].slice(-70)}`);
        });
        contexts.push(ctx); pages.push(page); uids.push(null);
      }
      log("inscription des 10 personnages (par lots de 5)…");
      for (const lot of [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]) {
        await Promise.all(lot.map(async (i) => {
          try { uids[i] = await signupUser(pages[i], `${nom(i)} Village`, i, PREFIXE); }
          catch (e) { log(`❌ inscription de ${nom(i)} : ${String(e.message).slice(0, 200)}`); }
        }));
      }
      rapport.personas = PERSONAS.map((p, i) => ({ nom: p.nom, role: p.role, inscrit: !!uids[i] }));
      const inscrits = uids.filter(Boolean).length;
      expect(inscrits, "les 10 personnages doivent être inscrits pour que le village ait un sens").toBe(10);
      // Le témoin côté NAVIGATEUR : la constante que l'app a réellement prise.
      const ciblesPages = await Promise.all(pages.map((p) => p.evaluate(() => (typeof SUPABASE_URL === "string" ? SUPABASE_URL : null))));
      expect(ciblesPages.every((u) => u === `https://${STAGING_REF}.supabase.co`), `les 10 navigateurs visent le staging (lu : ${[...new Set(ciblesPages)].join(", ")})`).toBe(true);

      // Les comptes du banc naissent par l'API d'administration, SANS accord
      // CGU tracé (`user_metadata.cgu_accepted_at`) : l'app leur présente donc
      // la feuille « Avant de continuer » (AUTH-03), qui recouvre tout l'écran.
      // Chacun y répond comme un humain : la case, puis « J'accepte ».
      // (Sans ce geste, les captures montraient la feuille et non l'app — les
      // contrôles lisant le DOM passaient sous elle.)
      await Promise.all(pages.map(async (page) => {
        const caseCgu = page.locator("#consentRequisCase");
        if (!(await caseCgu.isVisible({ timeout: 15000 }).catch(() => false))) {
          await page.waitForSelector("#consentRequisCase", { state: "visible", timeout: 15000 }).catch(() => {});
        }
        if (await caseCgu.isVisible().catch(() => false)) {
          await caseCgu.check();
          await page.locator(".consent-requis-btn:not(.consent-requis-refus)").click();
          await page.waitForSelector("#consentRequisCase", { state: "detached", timeout: 10000 }).catch(() => {});
        }
      }));
      await verifier("I0", "les 10 ont accepté les CGU dans la feuille « Avant de continuer » (accord tracé côté serveur)", async () => {
        const cfg = configAdmin();
        let n = 0;
        for (const id of uids) {
          const r = await fetch(`${cfg.url}/auth/v1/admin/users/${id}`, { headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}` } });
          const u = await r.json();
          if (u && u.user_metadata && u.user_metadata.cgu_accepted_at) n++;
        }
        const ouverte = (await Promise.all(pages.map((p) => p.locator("#consentRequisCase").isVisible().catch(() => false)))).filter(Boolean).length;
        return { ok: n === 10 && ouverte === 0, detail: `${n}/10 accords tracés, feuille encore ouverte chez ${ouverte}` };
      });

      // Confidentialité : un compte neuf est PRIVÉ par défaut (règle du
      // 2026-08-31). Neuf personnages passent en public par le même chemin
      // que la case des Paramètres ; Nina reste privée, choix prouvé.
      for (let i = 0; i < 10; i++) {
        await ev(i, async (prive) => {
          state.user.general = state.user.general || {};
          state.user.general.isPrivate = prive; state.user.general.privacyChoisi = true;
          saveState();
          await supaUpsertProfile();
          await supa.from("profiles").update({ is_private: prive }).eq("id", MY_UID);
        }, !!PERSONAS[i].prive);
      }
      await verifier("I1", "neuf profils publics, Nina privée (en base)", async () => {
        const rows = await db.lire("profiles", `select=id,is_private&id=in.(${uids.join(",")})`);
        const priv = rows.filter((r) => r.is_private).map((r) => r.id);
        return { ok: rows.length === 10 && priv.length === 1 && priv[0] === uids[NINA], detail: `${rows.length} profils, privés : ${priv.length}` };
      });

      // Le graphe social : tout le monde suit Léa ; Hugo suit Inès.
      // Huit passent par l'écriture serveur ; Jade, elle, par le VRAI bouton
      // « Suivre » du profil de Léa — le geste d'un humain.
      for (const i of [MARC, INES, HUGO, CHLOE, TOM, SARAH, NINA, KEVIN]) await ev(i, (t) => supaFollowUser(t), uids[LEA]);
      await ev(HUGO, (t) => supaFollowUser(t), uids[INES]);
      await ev(JADE, (id) => openUserProfile(id), uids[LEA]);
      const boutonSuivre = pages[JADE].locator(`[id="followBtn_${uids[LEA]}"]:visible`).first();
      await verifier("I2", "Jade s'abonne à Léa par le bouton « Suivre » de son profil", async () => {
        await boutonSuivre.click({ timeout: 10000 });
        const r = await attendre(async () => { const x = await db.lire("follows", `select=status&follower_id=eq.${uids[JADE]}&following_id=eq.${uids[LEA]}`); return x.length ? x : null; }, { delai: 8000 }) || [];
        const libelle = (await boutonSuivre.innerText().catch(() => "")).trim();
        return { ok: r.length === 1 && r[0].status === "accepted", detail: `base : ${r[0] ? r[0].status : "aucune ligne"} · bouton : « ${libelle} »` };
      });
      await capturer("I3-profil-lea-vu-par-jade", [JADE]);
      await ev(JADE, () => { try { closeModal(); } catch (e) {} });
      await verifier("I3", "9 abonnements à Léa écrits et acceptés (profil public)", async () => {
        const rows = await db.lire("follows", `select=follower_id,status&following_id=eq.${uids[LEA]}`);
        const acc = rows.filter((r) => !r.status || r.status === "accepted").length;
        return { ok: acc === 9, detail: `${rows.length} lignes, ${acc} acceptées` };
      });

      // ═══ ACTE A — PARTAGE DE CONTENU ═══════════════════════════════════════
      acteCourant = "A · Partage de contenu";
      log("── ACTE A : partage de contenu ──");
      const TEXTE_LEA = "Qui vient au pique-nique dimanche ? 🧺 [village]";
      const postLea = await ev(LEA, async (txt) => {
        const id = "post_" + uid();
        const { error } = await supa.from("posts").insert([{ id, author_id: MY_UID, passion_id: "musique", mood: "all", content: txt, media_url: null, created_at: new Date().toISOString() }]);
        return error ? null : id;
      }, TEXTE_LEA);
      await verifier("A1", "Léa publie : la publication existe en base", async () => ({ ok: !!postLea, detail: postLea || "insert refusé" }));

      // Chacun ouvre son fil (vraie lecture serveur) et doit y trouver le post.
      const chargerPost = (i, pid) => ev(i, async (id) => {
        const arr = await supaLoadPosts();
        const p = (arr || []).find((x) => x.id === id);
        if (p && !findPostAnywhere(id)) { state.supabasePosts = state.supabasePosts || []; state.supabasePosts.unshift(p); }
        return !!findPostAnywhere(id);
      }, pid);
      // Léa a publié par l'API : comme après une publication par le Studio, son
      // post doit être dans SA mémoire — sinon les commentaires poussés en
      // direct n'auraient nulle part où atterrir (faux rouge de A7).
      await attendre(() => chargerPost(LEA, postLea), { delai: 10000, pas: 1500 });
      const voient = [];
      for (const i of [MARC, INES, HUGO, CHLOE, TOM, SARAH, NINA, KEVIN, JADE]) {
        if (await attendre(() => chargerPost(i, postLea), { delai: 15000, pas: 1500 })) voient.push(nom(i));
      }
      await verifier("A2", "les 9 autres trouvent la publication de Léa dans leur fil", async () => ({ ok: voient.length === 9, detail: `${voient.length}/9` }));

      // Hugo s'est abonné par l'API, pas par le bouton : son écran ne le sait
      // qu'au prochain démarrage, qui relit ses abonnements (supaLoadFollowing).
      // C'est exactement « je me suis abonné sur mon téléphone, j'ouvre l'app
      // sur l'ordinateur » : on rouvre l'app de Hugo.
      await pages[HUGO].reload();
      await pages[HUGO].waitForFunction((lea) => !!window.MY_UID && typeof supa !== "undefined" && !!supa && ((state.user && state.user.following) || []).includes(lea), uids[LEA], { timeout: 30000 }).catch(() => {});
      await chargerPost(HUGO, postLea);
      await verifier("A3", "à l'écran : après réouverture de l'app, la carte de Léa est dans le fil de Hugo", async () => {
        await ev(HUGO, () => { goTo("feed"); try { renderFeed(); } catch (e) {} });
        const vu = await attendre(() => ev(HUGO, (t) => !!document.querySelector("#feedList") && document.querySelector("#feedList").innerText.includes(t), TEXTE_LEA.slice(0, 30)), { delai: 10000 });
        if (vu) return { ok: true };
        // Pourquoi pas : ce que l'écran de Hugo sait au moment du rendu.
        const d = await ev(HUGO, ([lea, pid]) => {
          const fil = document.querySelector("#feedList");
          return {
            suitLea: ((state.user && state.user.following) || []).includes(lea),
            suivisCoche: typeof feedFollowingSelected === "function" ? feedFollowingSelected() : "?",
            passionsCochees: typeof _activeFeedPassions !== "undefined" ? Array.from(_activeFeedPassions).join("+") : "?",
            enMemoire: !!findPostAnywhere(pid),
            cartes: fil ? fil.querySelectorAll("[data-post-id], .post-card, .post").length : -1,
          };
        }, [uids[LEA], postLea]);
        await capturer("A3-fil-hugo", [HUGO]);
        return { ok: false, detail: `Léa suivie à l'écran : ${d.suitLea} · « Suivis » coché : ${d.suivisCoche} · passions cochées : ${d.passionsCochees || "aucune"} · post en mémoire : ${d.enMemoire} · cartes affichées : ${d.cartes}` };
      });

      // Huit likes à la même seconde : le compteur doit dire 8, pas 7 ni 9.
      const LIKERS = [MARC, INES, HUGO, CHLOE, TOM, SARAH, KEVIN, JADE];
      await Promise.all(LIKERS.map((i) => ev(i, (id) => likePost(id, true), postLea)));
      await verifier("A4", "8 likes simultanés → exactement 8 lignes en base", async () => {
        const n = await attendre(async () => { const r = await db.lire("post_likes", `select=user_id&post_id=eq.${postLea}`); return r.length === 8 ? r : null; }, { delai: 15000 });
        const r = n || await db.lire("post_likes", `select=user_id&post_id=eq.${postLea}`);
        return { ok: r.length === 8 && new Set(r.map((x) => x.user_id)).size === 8, detail: `${r.length} lignes` };
      });
      await verifier("A5", "Léa lit le même compteur que la base (8)", async () => {
        const n = await ev(LEA, (id) => supaGetLikeCount(id), postLea);
        return { ok: n === 8, detail: `Léa lit ${n}` };
      });

      // Quatre commentaires par le vrai formulaire.
      const COMMENTAIRES = { [MARC]: "Je ramène des boissons 🥤", [INES]: "Trop bien, je viens !", [HUGO]: "Je prends le frisbee", [CHLOE]: "Il fera beau ? ☀️" };
      await Promise.all(Object.entries(COMMENTAIRES).map(async ([i, txt]) => {
        const p = pages[Number(i)];
        await p.evaluate((id) => openComments(id), postLea);
        await p.waitForSelector("#newComment", { timeout: 10000 });
        await p.fill("#newComment", txt + " [village]");
        await p.evaluate((id) => submitComment(id), postLea);
      }));
      await verifier("A6", "4 commentaires → 4 lignes en base, ni perte ni doublon", async () => {
        const r = await attendre(async () => { const x = await db.lire("post_comments", `select=author_id,content&post_id=eq.${postLea}`); return x.length >= 4 ? x : null; }, { delai: 15000 })
          || await db.lire("post_comments", `select=author_id,content&post_id=eq.${postLea}`);
        return { ok: r.length === 4 && new Set(r.map((x) => x.author_id)).size === 4, detail: `${r.length} lignes` };
      });
      await verifier("A7", "Léa voit arriver les 4 commentaires sans recharger", async () => {
        const n = await attendre(() => ev(LEA, (id) => { const p = findPostAnywhere(id); return p && (p.comments || []).length >= 4 ? p.comments.length : 0; }, postLea), { delai: 20000 });
        return { ok: n >= 4, detail: `${n || 0} reçus en direct` };
      }, { exige: false });
      await ev(HUGO, () => { try { closeModal(); } catch (e) {} });

      await verifier("A8", "Léa reçoit exactement 8 notifications de like et 4 de commentaire, sans doublon", async () => {
        const lire = () => db.lire("notifications", `select=from_id,kind&user_id=eq.${uids[LEA]}`);
        const r = await attendre(async () => { const x = await lire(); return x.filter((n) => n.kind === "comment").length >= 4 && x.filter((n) => n.kind === "like").length >= 8 ? x : null; }, { delai: 15000 }) || await lire();
        const likes = r.filter((n) => n.kind === "like"), comms = r.filter((n) => n.kind === "comment");
        const uniq = (a) => new Set(a.map((n) => n.from_id)).size;
        return { ok: likes.length === 8 && uniq(likes) === 8 && comms.length === 4 && uniq(comms) === 4, detail: `like ${likes.length} (${uniq(likes)} auteurs), comment ${comms.length} (${uniq(comms)} auteurs)` };
      });

      // Inès repartage la publication de Léa dans son fil.
      await ev(INES, (id) => sharePostInFeed(id), postLea);
      let partageInes = null;
      await verifier("A9", "Inès repartage : sa publication de partage existe en base", async () => {
        const r = await attendre(async () => { const x = await db.lire("posts", `select=id,content,shared_from_post_id,shared_data&author_id=eq.${uids[INES]}`); return x.length ? x : null; }, { delai: 15000 }) || [];
        partageInes = r[0] || null;
        return { ok: r.length === 1, detail: `${r.length} publication(s) d'Inès` };
      });
      await verifier("A10", "le partage d'Inès garde le lien vers l'original de Léa", async () => {
        const lien = partageInes && (partageInes.shared_from_post_id === postLea || JSON.stringify(partageInes.shared_data || "").includes(postLea));
        return { ok: !!lien, detail: partageInes ? `shared_from_post_id=${partageInes.shared_from_post_id || "∅"}` : "aucun partage" };
      });
      await verifier("A11", "Hugo (abonné d'Inès) retrouve le partage en rechargeant son fil (lecture serveur)", async () => {
        const vu = partageInes && await attendre(() => chargerPost(HUGO, partageInes.id), { delai: 15000, pas: 1500 });
        return { ok: !!vu };
      });
      await verifier("A12", "Léa est prévenue que sa publication a été partagée", async () => {
        const r = await db.lire("notifications", `select=kind&user_id=eq.${uids[LEA]}&from_id=eq.${uids[INES]}`);
        const kinds = r.map((n) => n.kind);
        return { ok: kinds.some((k) => /share|partag|repost/i.test(k)), detail: `notifs d'Inès à Léa : ${kinds.join(", ") || "aucune"}` };
      }, { exige: false });

      // Nina, compte privé.
      const postNina = await ev(NINA, async () => {
        const id = "post_" + uid();
        const { error } = await supa.from("posts").insert([{ id, author_id: MY_UID, passion_id: "musique", mood: "all", content: "Ma playlist secrète 🎧 [village]", media_url: null, created_at: new Date().toISOString() }]);
        return error ? null : id;
      });
      // { n, erreur } : une lecture en ERREUR (400, réseau, session) n'est pas « rien de visible ».
      const lirePost = (i, pid) => ev(i, async (id) => { const { data, error } = await supa.from("posts").select("id").eq("id", id); return { n: (data || []).length, erreur: error ? String(error.code || error.message) : null }; }, pid);
      await verifier("A13", "compte privé : Hugo (non abonné) ne peut pas lire le post de Nina, même par l'API", async () => {
        const r = await lirePost(HUGO, postNina);
        return { ok: !!postNina && !r.erreur && r.n === 0, detail: r.erreur ? `lecture en erreur : ${r.erreur}` : `${r.n} ligne(s) lisible(s)` };
      });
      await ev(CHLOE, (t) => supaFollowUser(t), uids[NINA]);
      await verifier("A14", "Chloé demande à suivre Nina : la demande reste en attente", async () => {
        const r = await attendre(async () => { const x = await db.lire("follows", `select=status&follower_id=eq.${uids[CHLOE]}&following_id=eq.${uids[NINA]}`); return x.length ? x : null; }, { delai: 8000 }) || [];
        return { ok: r.length === 1 && r[0].status === "pending", detail: r[0] ? `statut ${r[0].status}` : "aucune ligne" };
      });
      await verifier("A15", "tant que Nina n'a pas accepté, Chloé ne lit rien", async () => {
        const r = await lirePost(CHLOE, postNina);
        return { ok: !r.erreur && r.n === 0, detail: r.erreur ? `lecture en erreur : ${r.erreur}` : `${r.n} ligne(s)` };
      });
      await ev(NINA, async (fromId) => {
        const ns = (await supaLoadNotifications()) || [];
        const n = ns.find((x) => x.fromId === fromId && /follow/.test(x.kind || ""));
        await accepterDemandeAbonnement(fromId, n ? n.id : null);
      }, uids[CHLOE]);
      await verifier("A16", "Nina accepte : Chloé lit maintenant son post", async () => {
        const l = await attendre(async () => { const x = await lirePost(CHLOE, postNina); return x.n === 1 ? x : null; }, { delai: 10000 }) || await lirePost(CHLOE, postNina);
        const r = await db.lire("follows", `select=status&follower_id=eq.${uids[CHLOE]}&following_id=eq.${uids[NINA]}`);
        return { ok: l.n === 1, detail: `statut ${r[0] && r[0].status}, ${l.n} ligne lisible${l.erreur ? ", erreur " + l.erreur : ""}` };
      });

      // Kevin, le fâcheux : il spamme, Léa et Inès le signalent, Léa le bloque.
      const postKevin = await ev(KEVIN, async () => {
        const id = "post_" + uid();
        const { error } = await supa.from("posts").insert([{ id, author_id: MY_UID, passion_id: "musique", mood: "all", content: "ACHETEZ MES FOLLOWERS 💸💸 [village]", media_url: null, created_at: new Date().toISOString() }]);
        return error ? null : id;
      });
      const sigLea = await ev(LEA, (id) => supaReport("post", id, "Spam [village]"), postKevin);
      const sigInes = await ev(INES, (id) => supaReport("post", id, "Arnaque [village]"), postKevin);
      await verifier("A17", "deux signalements du post de Kevin, enregistrés en base", async () => {
        const r = await db.lire("reports", `select=reporter_id&target_id=eq.${postKevin}`);
        return { ok: sigLea === true && sigInes === true && r.length === 2, detail: `retours ${sigLea}/${sigInes}, ${r.length} ligne(s)` };
      });
      const bloque = await ev(LEA, (id) => blockUser(id, "Kevin Village"), uids[KEVIN]);
      await verifier("A18", "Léa bloque Kevin : blocage écrit en base, abonnement retiré", async () => {
        const b = await db.lire("blocks", `select=blocked_id&blocker_id=eq.${uids[LEA]}`);
        return { ok: bloque === true && b.some((x) => x.blocked_id === uids[KEVIN]), detail: `retour ${bloque}, ${b.length} blocage(s)` };
      });
      // Kevin tente quand même de commenter le post de Léa, par l'interface.
      await pages[KEVIN].evaluate((id) => openComments(id), postLea);
      await pages[KEVIN].waitForSelector("#newComment", { timeout: 10000 }).catch(() => {});
      await pages[KEVIN].fill("#newComment", "Réponds-moi !!! [village]").catch(() => {});
      await pages[KEVIN].evaluate((id) => { try { submitComment(id); } catch (e) {} }, postLea);
      await pause(3000);
      await verifier("A19", "le serveur refuse le commentaire de Kevin bloqué", async () => {
        const r = await db.lire("post_comments", `select=id&post_id=eq.${postLea}&author_id=eq.${uids[KEVIN]}`);
        return { ok: r.length === 0, detail: `${r.length} commentaire(s) de Kevin en base` };
      }, { exige: false });
      await verifier("A20", "à l'écran de Léa, rien de Kevin : ni son commentaire, ni son post", async () => {
        await ev(LEA, async () => { const a = await supaLoadPosts(); if (a && a.length) state.supabasePosts = a; });
        const vu = await ev(LEA, async ([pid, kid]) => {
          openComments(pid);
          await new Promise((r) => setTimeout(r, 1500));
          const txt = (document.getElementById("modalContent") || document.body).innerText;
          closeModal();
          goTo("feed"); try { renderFeed(); } catch (e) {}
          await new Promise((r) => setTimeout(r, 800));
          const fil = (document.querySelector("#feedList") || {}).innerText || "";
          return { commentaire: txt.includes("Réponds-moi"), temoinDiscussion: txt.includes("Trop bien, je viens"),
            postAffiche: fil.includes("ACHETEZ MES FOLLOWERS"), postEnMemoire: !!findPostAnywhere(kid), filPeint: fil.trim().length > 0 };
        }, [postLea, postKevin]);
        // Témoins POSITIFS : la discussion montre le commentaire d'Inès et le fil
        // est peint — sinon « rien de Kevin » pourrait n'être qu'un écran vide.
        return { ok: !vu.commentaire && vu.temoinDiscussion && !vu.postAffiche && vu.filPeint,
          detail: `commentaire de Kevin : ${vu.commentaire} · témoin (Inès) : ${vu.temoinDiscussion} · post de Kevin affiché : ${vu.postAffiche} (en mémoire : ${vu.postEnMemoire}) · fil peint : ${vu.filPeint}` };
      });
      await capturer("A-contenu", [LEA, HUGO, NINA, JADE]);

      // Léa supprime sa publication.
      await ev(LEA, (id) => deletePost(id), postLea);
      await verifier("A21", "Léa supprime son post : il disparaît de la base", async () => {
        const r = await attendre(async () => { const x = await db.lire("posts", `select=id&id=eq.${postLea}`); return x.length === 0; }, { delai: 15000 });
        return { ok: !!r };
      });
      await verifier("A22", "le post supprimé disparaît chez Hugo sans qu'il recharge", async () => {
        const parti = await attendre(() => ev(HUGO, (id) => !findPostAnywhere(id), postLea), { delai: 20000 });
        return { ok: !!parti };
      }, { exige: false });
      await verifier("A23", "après rechargement du fil, plus personne ne le voit", async () => {
        const encore = [];
        for (const i of [HUGO, INES, JADE]) {
          const vu = await ev(i, async (id) => { const a = await supaLoadPosts(); return (a || []).some((x) => x.id === id); }, postLea);
          if (vu) encore.push(nom(i));
        }
        return { ok: encore.length === 0, detail: encore.length ? `encore visible chez ${encore.join(", ")}` : "" };
      });
      await verifier("A24", "le partage d'Inès ne casse pas quand l'original disparaît", async () => {
        if (!partageInes) return { ok: false, detail: "pas de partage" };
        const r = await ev(HUGO, async (id) => {
          goTo("feed"); try { renderFeed(); } catch (e) {}
          await new Promise((res) => setTimeout(res, 800));
          return { ici: !!findPostAnywhere(id) };
        }, partageInes.id);
        return { ok: r.ici, detail: r.ici ? "la carte de partage reste affichable" : "la carte de partage a disparu" };
      }, { exige: false });

      // ═══ ACTE B — ORGANISER UNE ACTIVITÉ ET Y PARTICIPER ══════════════════
      acteCourant = "B · Activité (organisation et participation)";
      log("── ACTE B : l'activité ──");
      // Comme le formulaire : publication puis l'organisatrice occupe une place.
      // 6 places : Léa + 5. Quatre habitués, puis Tom et Jade pour la dernière.
      const evt = await ev(LEA, async () => {
        const id = "evt_" + uid();
        const ok = await supaPublishEvent({ id, title: "Pique-nique au parc [village]", passion: "musique", city: "Lyon", emoji: "🧺", date: Date.now() + 3 * 86400000, maxAttendees: 6 });
        if (!ok) return null;
        await supaJoinEvent(id);
        return id;
      });
      await verifier("B1", "Léa crée l'activité (6 places) et en occupe une", async () => {
        const r = evt ? await db.lire("event_attendees", `select=user_id,rsvp&event_id=eq.${evt}`) : [];
        return { ok: !!evt && r.length === 1 && r[0].user_id === uids[LEA], detail: evt ? `${r.length} inscrit(s)` : "publication refusée" };
      });

      const chargerEvt = (i) => ev(i, async (id) => {
        const evs = (await supaLoadEvents()) || [];
        const e = evs.find((x) => x.id === id);
        if (!e) return false;
        state.seed.events = (state.seed.events || []).filter((x) => x.id !== id);
        state.seed.events.unshift(e);
        return true;
      }, evt);
      const voientEvt = [];
      for (const i of [MARC, INES, HUGO, CHLOE, TOM, SARAH, NINA, JADE]) if (await attendre(() => chargerEvt(i), { delai: 10000, pas: 1500 })) voientEvt.push(nom(i));
      await verifier("B2", "les 8 autres (hors Kevin) trouvent l'activité", async () => ({ ok: voientEvt.length === 8, detail: `${voientEvt.length}/8` }));
      // EXIGÉ depuis migration_blocage_lecture_activites_2026-11-22.sql : la
      // lecture de `events` exclut, côté serveur, une activité dont l'auteur est
      // en blocage avec l'appelant (avant : observation, Kevin lisait la ville
      // et l'heure du rendez-vous de Léa).
      await verifier("B3", "Kevin, bloqué par Léa, ne voit pas son activité", async () => {
        const vu = await chargerEvt(KEVIN);
        return { ok: !vu, detail: vu ? "Kevin voit l'activité de Léa" : "" };
      });
      await verifier("B4", "à l'écran : Jade (téléphone) voit l'activité dans l'onglet Rencontres", async () => {
        await ev(JADE, () => { goTo("irl"); try { renderIRL(); } catch (e) {} });
        const vu = await attendre(() => ev(JADE, () => (document.querySelector("#screen-irl") || {}).innerText?.includes("Pique-nique au parc")), { delai: 10000 });
        return { ok: !!vu };
      }, { exige: false });
      await capturer("B-activite-visible", [JADE]);

      for (const i of [INES, HUGO, CHLOE, SARAH]) { await ev(i, (id) => setEventRsvp(id, "going"), evt); await pause(600); }
      await ev(MARC, (id) => setEventRsvp(id, "maybe"), evt);
      const lireRsvp = () => db.lire("event_attendees", `select=user_id,rsvp&event_id=eq.${evt}`);
      await verifier("B5", "4 habitués inscrits + Marc « peut-être » : 5 venants, 1 peut-être en base", async () => {
        const r = await attendre(async () => { const x = await lireRsvp(); return x.filter((a) => a.rsvp === "going").length === 5 ? x : null; }, { delai: 10000 }) || await lireRsvp();
        const g = r.filter((a) => a.rsvp === "going").length, m = r.filter((a) => a.rsvp === "maybe").length;
        return { ok: g === 5 && m === 1, detail: `going ${g}, maybe ${m}` };
      });

      // La course pour la dernière place : Tom et Jade au même instant.
      for (const i of [TOM, JADE]) await chargerEvt(i);
      await Promise.all([TOM, JADE].map((i) => ev(i, async (id) => {
        window.__toasts = []; const t = window.toast;
        window.toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); };
        await setEventRsvp(id, "going");
      }, evt)));
      await pause(2000);
      let perdant = null;
      await verifier("B6", "course pour la dernière place : un seul gagnant, jamais 7 venants pour 6 places", async () => {
        const r = await lireRsvp();
        const going = r.filter((a) => a.rsvp === "going").map((a) => a.user_id);
        const tomIn = going.includes(uids[TOM]), jadeIn = going.includes(uids[JADE]);
        perdant = tomIn && !jadeIn ? JADE : jadeIn && !tomIn ? TOM : null;
        return { ok: going.length === 6 && perdant !== null, detail: `${going.length} venants ; gagnant : ${tomIn ? "Tom" : jadeIn ? "Jade" : "personne"}` };
      });
      if (perdant !== null) {
        await verifier("B7", `le perdant (${nom(perdant)}) lit « complet » et n'est pas compté à l'écran`, async () => {
          const s = await ev(perdant, (id) => ({ rsvp: myRsvp(id), compte: (_findCanonicalEvent(id).attendees || []).includes(MY_UID), toasts: window.__toasts || [] }), evt);
          return { ok: !s.compte && /complète|complet|liste d'attente/i.test(s.toasts.join(" ")), detail: `rsvp local ${s.rsvp}, message « ${s.toasts.join(" | ").slice(0, 120)} »` };
        });
        await ev(perdant, async (id) => { const evs = await supaLoadEvents(); const e = evs.find((x) => x.id === id); if (e) Object.assign(_findCanonicalEvent(id), e); toggleJoinEvent(id); }, evt);
        await verifier("B8", `${nom(perdant)} rejoint la liste d'attente`, async () => {
          const r = await attendre(async () => { const x = await lireRsvp(); const m = x.find((a) => a.user_id === uids[perdant]); return m && m.rsvp === "waitlist" ? m : null; }, { delai: 10000 });
          return { ok: !!r, detail: r ? "" : "pas de ligne waitlist" };
        });
      }

      await verifier("B9", "Léa est prévenue de chaque nouvelle inscription", async () => {
        const r = await db.lire("notifications", `select=from_id,kind&user_id=eq.${uids[LEA]}`);
        const venants = (await lireRsvp()).filter((a) => a.rsvp === "going" && a.user_id !== uids[LEA]).map((a) => a.user_id);
        const prev = venants.filter((u) => r.some((n) => n.from_id === u && /^event/.test(n.kind || "")));
        return { ok: venants.length === 5 && prev.length === venants.length, detail: `${prev.length}/${venants.length} venants ont notifié Léa` };
      });

      // La discussion et les réactions de l'activité.
      const ecH = await ev(HUGO, (id) => supaAddEventComment(id, "Je ramène une enceinte 🔊 [village]"), evt);
      const ecC = await ev(CHLOE, (id) => supaAddEventComment(id, "On se retrouve à quelle entrée ? [village]"), evt);
      await verifier("B10", "2 messages dans la discussion de l'activité, lus par Léa", async () => {
        const c = await ev(LEA, (id) => supaLoadEventComments(id), evt);
        return { ok: !!ecH && !!ecC && Array.isArray(c) && c.length === 2, detail: `${Array.isArray(c) ? c.length : "échec"} lu(s)` };
      });
      await Promise.all([INES, HUGO, JADE].map((i) => ev(i, (id) => supaSetEventLike(id, true), evt)));
      await verifier("B11", "3 ❤️ sur l'activité, comptés une fois chacun", async () => {
        const r = await db.lire("event_reactions", `select=user_id,emoji&event_id=eq.${evt}&emoji=eq.❤️`);
        return { ok: r.length === 3, detail: `${r.length} ❤️` };
      });

      // Marc voudrait co-organiser : la coorganisation est suspendue (16/11),
      // son écriture directe doit toucher ZÉRO ligne.
      await verifier("B12", "Marc (sans rôle) ne peut pas modifier l'activité, même par l'API", async () => {
        const r = await ev(MARC, async (id) => { const w = await supa.from("events").update({ title: "Pique-nique annulé lol" }).eq("id", id).select("id"); return { n: (w.data || []).length, e: w.error && w.error.code }; }, evt);
        const t = await db.lire("events", `select=title&id=eq.${evt}`);
        return { ok: r.n === 0 && t[0] && t[0].title === "Pique-nique au parc [village]", detail: `${r.n} ligne(s) touchée(s), titre « ${t[0] && t[0].title} »` };
      });

      // Léa change le lieu, par les deux appels du formulaire d'édition.
      const modifOk = await ev(LEA, async (id) => {
        const e = (await supaLoadEvents()).find((x) => x.id === id);
        if (!e) return false;
        const maj = Object.assign({}, e, { city: "Villeurbanne" });
        const ok = await supaUpdateEvent(maj);
        if (ok) _notifyEventAttendees(maj, "a modifié un événement auquel tu participes");
        return ok;
      }, evt);
      await verifier("B13", "Léa déplace l'activité à Villeurbanne : écrit en base", async () => {
        const t = await db.lire("events", `select=city&id=eq.${evt}`);
        return { ok: modifOk === true && t[0] && t[0].city === "Villeurbanne", detail: `ville ${t[0] && t[0].city}` };
      });
      await verifier("B14", "les inscrits sont prévenus du changement", async () => {
        const venants = (await lireRsvp()).filter((a) => a.rsvp === "going" && a.user_id !== uids[LEA]).map((a) => a.user_id);
        const prevenus = await attendre(async () => {
          const r = await db.lire("notifications", `select=user_id,kind&from_id=eq.${uids[LEA]}&kind=eq.event_update&user_id=in.(${venants.join(",")})`);
          const u = new Set(r.map((n) => n.user_id));
          return u.size >= venants.length ? u.size : null;
        }, { delai: 10000 });
        return { ok: venants.length === 5 && prevenus === venants.length, detail: `${prevenus || 0}/${venants.length} prévenus` };
      });
      await verifier("B15", "Inès voit le nouveau lieu après rechargement", async () => {
        const c = await ev(INES, async (id) => { const e = (await supaLoadEvents()).find((x) => x.id === id); return e && e.city; }, evt);
        return { ok: c === "Villeurbanne", detail: `Inès lit ${c}` };
      });

      // Sarah se désiste : la place revient au premier de la liste d'attente.
      const rpcPromotion = await ev(SARAH, async () => {
        const r = await supa.rpc("promouvoir_attente", { p_event_id: "sonde_village_" + Date.now(), p_user_id: null });
        return !(r && r.error && String(r.error.code) === "PGRST202");
      });
      // Instantané des notifications du futur promu AVANT le désistement : il a
      // déjà reçu un `event_update` pour le changement de lieu (la liste
      // d'attente est prévenue, `_destinatairesActivite`). Seules les NOUVELLES
      // comptent pour la promotion — par identifiant, sans horloge.
      const notifsAvantPromotion = perdant !== null
        ? new Set((await db.lire("notifications", `select=id&user_id=eq.${uids[perdant]}`)).map((n) => n.id))
        : new Set();
      await ev(SARAH, (id) => setEventRsvp(id, null), evt);
      if (perdant !== null) {
        await verifier("B16", `Sarah se désiste : ${nom(perdant)} (liste d'attente) récupère la place`, async () => {
          const r = await attendre(async () => { const x = await lireRsvp(); const m = x.find((a) => a.user_id === uids[perdant]); return m && m.rsvp === "going" ? x : null; }, { delai: 12000 });
          const x = r || await lireRsvp();
          const sarah = x.find((a) => a.user_id === uids[SARAH]);
          return { ok: !!r && !sarah, detail: `${rpcPromotion ? "" : "RPC promouvoir_attente ABSENTE du staging ; "}${nom(perdant)} : ${(x.find((a) => a.user_id === uids[perdant]) || {}).rsvp}, Sarah : ${sarah ? sarah.rsvp : "partie"}` };
        });
        await verifier("B17", `${nom(perdant)} est prévenu·e de sa promotion`, async () => {
          const nouvelles = async () => (await db.lire("notifications", `select=id,kind&user_id=eq.${uids[perdant]}`)).filter((n) => !notifsAvantPromotion.has(n.id));
          const r = await attendre(async () => { const x = await nouvelles(); return x.length ? x : null; }, { delai: 10000 }) || [];
          return { ok: r.length >= 1, detail: `${r.length} nouvelle(s) notification(s) depuis le désistement : ${r.map((n) => n.kind).join(", ") || "aucune"}` };
        });
      }
      await verifier("B18", "confidentialité : Kevin (non inscrit) ne lit pas la liste des participants ; Léa (organisatrice) si", async () => {
        const lire = (i) => ev(i, async (id) => { const { data, error } = await supa.from("event_attendees").select("user_id").eq("event_id", id); return { n: (data || []).length, erreur: error ? String(error.code || error.message) : null }; }, evt);
        const k = await lire(KEVIN), l = await lire(LEA);
        // Témoin positif : la même lecture, par l'organisatrice, rend les inscrits —
        // sinon « 0 pour Kevin » pourrait n'être qu'une requête cassée.
        return { ok: !k.erreur && k.n === 0 && !l.erreur && l.n >= 5,
          detail: `Kevin lit ${k.erreur ? "une erreur " + k.erreur : k.n}, Léa lit ${l.erreur ? "une erreur " + l.erreur : l.n}` };
      });

      // Léa partage l'activité dans le fil.
      await ev(LEA, async (id) => { const e = (await supaLoadEvents()).find((x) => x.id === id); if (e) { state.userEvents = state.userEvents || []; if (!_findCanonicalEvent(id)) state.userEvents.unshift(e); } await shareEventInFeed(id); }, evt);
      // La carte d'activité voyage dans `shared_data` (kind « event »), pas dans
      // la colonne `event_id` (shareEventInFeed, app-07).
      let partageEvt = null;
      await verifier("B19", "Léa partage l'activité dans son fil : publication liée en base", async () => {
        const r = await attendre(async () => {
          const x = await db.lire("posts", `select=id,shared_data&author_id=eq.${uids[LEA]}`);
          const l = x.filter((p) => JSON.stringify(p.shared_data || "").includes(evt));
          return l.length ? l : null;
        }, { delai: 12000 }) || [];
        partageEvt = r[0] || null;
        return { ok: r.length === 1, detail: `${r.length} publication(s) portant l'activité` };
      });
      await verifier("B19b", "Hugo retrouve la carte de l'activité partagée en rechargeant son fil (lecture serveur)", async () => {
        const vu = partageEvt && await attendre(() => chargerPost(HUGO, partageEvt.id), { delai: 12000, pas: 1500 });
        return { ok: !!vu };
      });
      await verifier("B19c", "Kevin, bloqué par Léa, ne lit pas la carte de son activité, même en interrogeant l'API avec sa session (la clé anon seule lit tout : hors lot)", async () => {
        if (!partageEvt) return { ok: false, detail: "pas de carte à éprouver" };
        const r = await lirePost(KEVIN, partageEvt.id);
        return { ok: !r.erreur && r.n === 0, detail: r.erreur ? `lecture en erreur : ${r.erreur}` : `${r.n} ligne(s) lisible(s)` };
      });
      await capturer("B-activite", [LEA, INES, JADE, TOM]);

      // Léa annule l'activité (confirmation acceptée comme le ferait un humain).
      await ev(LEA, async (id) => { window.confirmerAction = async () => true; await toggleCancelEvent(id); }, evt);
      await verifier("B20", "Léa annule : l'activité est « annulée » en base", async () => {
        const r = await attendre(async () => { const x = await db.lire("events", `select=status&id=eq.${evt}`); return x[0] && x[0].status === "cancelled" ? x : null; }, { delai: 10000 });
        return { ok: !!r };
      });
      await verifier("B21", "chaque inscrit est prévenu de l'annulation", async () => {
        const venants = (await lireRsvp()).filter((a) => a.rsvp === "going" && a.user_id !== uids[LEA]).map((a) => a.user_id);
        const n = await attendre(async () => {
          const r = await db.lire("notifications", `select=user_id,kind&from_id=eq.${uids[LEA]}&user_id=in.(${venants.join(",")})`);
          const u = new Set(r.filter((x) => /cancel|annul/i.test(x.kind || "")).map((x) => x.user_id));
          return u.size >= venants.length ? u.size : null;
        }, { delai: 10000 });
        return { ok: venants.length === 5 && n === venants.length, detail: `${n || 0}/${venants.length} prévenus` };
      });
      await verifier("B22", "Hugo (inscrit) voit l'activité ANNULÉE, ni ouverte ni disparue", async () => {
        const s = await ev(HUGO, async (id) => { const e = (await supaLoadEvents()).find((x) => x.id === id); return e ? (e.status || "active") : "absente"; }, evt);
        return { ok: s === "cancelled", detail: `statut lu : ${s}` };
      });

      // ═══ ACTE C — LA VRAIE VIE : RÉSEAU, DOUBLE-CLIC, ERREURS ═════════════
      acteCourant = "C · Conditions réelles";
      log("── ACTE C : conditions réelles ──");
      const postHugo = await ev(HUGO, async () => {
        const id = "post_" + uid();
        const { error } = await supa.from("posts").insert([{ id, author_id: MY_UID, passion_id: "musique", mood: "all", content: "Les photos arrivent ce soir 📸 [village]", media_url: null, created_at: new Date().toISOString() }]);
        return error ? null : id;
      });
      await attendre(() => chargerPost(CHLOE, postHugo), { delai: 10000 });
      await attendre(() => chargerPost(JADE, postHugo), { delai: 10000 });

      // Chloé perd le réseau au moment de commenter, puis le retrouve.
      await contexts[CHLOE].setOffline(true);
      await pages[CHLOE].evaluate((id) => openComments(id), postHugo);
      await pages[CHLOE].waitForSelector("#newComment", { timeout: 10000 });
      await pages[CHLOE].fill("#newComment", "Commentaire écrit dans le métro [village]");
      await pages[CHLOE].evaluate((id) => { try { submitComment(id); } catch (e) {} }, postHugo);
      await pause(2000);
      await contexts[CHLOE].setOffline(false);
      await verifier("C1", "commentaire écrit hors ligne : il part au retour du réseau, une seule fois", async () => {
        const r = await attendre(async () => { const x = await db.lire("post_comments", `select=id&post_id=eq.${postHugo}&author_id=eq.${uids[CHLOE]}`); return x.length ? x : null; }, { delai: 45000, pas: 2000 }) || [];
        await pause(3000);
        const final = await db.lire("post_comments", `select=id&post_id=eq.${postHugo}&author_id=eq.${uids[CHLOE]}`);
        return { ok: final.length === 1, detail: `${final.length} ligne(s) après le retour du réseau` };
      });

      // Jade tape deux fois très vite sur ❤️.
      await ev(JADE, (id) => { likePost(id, true); likePost(id, true); }, postHugo);
      await pause(3000);
      await verifier("C2", "double-tap sur ❤️ : l'écran de Jade et la base disent la même chose", async () => {
        const r = await db.lire("post_likes", `select=user_id&post_id=eq.${postHugo}&user_id=eq.${uids[JADE]}`);
        const local = await ev(JADE, (id) => { const p = findPostAnywhere(id); return !!(p && p.liked); }, postHugo);
        return { ok: r.length <= 1 && (r.length === 1) === local, detail: `base ${r.length} like, écran ${local ? "aimé" : "pas aimé"}` };
      });
      await capturer("C-fin", [CHLOE, JADE]);

      await verifier("C3", "aucune erreur JavaScript dans la console des 10 personnages", async () => {
        const avec = Object.entries(rapport.erreursConsole).filter(([, l]) => l.some((m) => !/Failed to load resource/i.test(m)));
        return { ok: avec.length === 0, detail: avec.map(([n, l]) => `${n} ×${l.length}`).join(", ") };
      }, { exige: false });
    } finally {
      // ═══ PURGE — les comptes de CETTE séance, par identifiant ══════════════
      // Les uid rendus PLUS ceux que le préfixe de séance retrouve : un compte
      // créé dont l'inscription a cassé ensuite n'a jamais rendu son uid.
      const purge = { lignes: 0, comptes: 0, erreurs: [], restants: [] };
      let retrouves = [];
      try { retrouves = await db.comptesDeLaSeance(PREFIXE); } catch (e) { purge.erreurs.push(e.message); }
      const ids = [...new Set([...uids.filter(Boolean), ...retrouves])];
      if (ids.length) {
        const liste = `(${ids.join(",")})`;
        for (const [table, cols] of TABLES_PURGE) {
          const q = cols.length === 1 ? `${cols[0]}=in.${liste}` : `or=(${cols.map((c) => `${c}.in.${liste}`).join(",")})`;
          try { purge.lignes += await db.supprimer(table, q); } catch (e) { purge.erreurs.push(e.message); }
        }
        for (const id of ids) { try { await db.supprimerCompte(id); purge.comptes++; } catch (e) { purge.erreurs.push(e.message); } }
        // La preuve, pas le code de retour : chaque compte doit répondre 404.
        for (const id of ids) {
          try { if (await db.compteExiste(id)) purge.restants.push(id); } catch (e) { purge.erreurs.push(e.message); purge.restants.push(id); }
        }
      }
      rapport.purge = purge;
      log(`purge : ${purge.lignes} lignes, ${purge.comptes}/${ids.length} comptes supprimés, ${purge.restants.length} restant(s)${purge.erreurs.length ? " — erreurs : " + purge.erreurs.join(" ; ") : ""}`);
      for (const c of contexts) { try { await c.close(); } catch (e) {} }
      rapport.dureeS = Math.round((Date.now() - t0) / 1000);
      ecrireRapport(rapport);
      log("rapport : test-results/village/rapport.md");
    }

    const echecs = rapport.controles.filter((c) => c.statut === "ÉCHEC").map((c) => `[${c.code}] ${c.libelle} — ${c.detail}`);
    expect(echecs, "contrôles EXIGÉS en échec (détail : test-results/village/rapport.md)").toEqual([]);
    // Une purge incomplète laisse des comptes sur le staging : c'est un échec, pas un détail.
    expect({ erreurs: rapport.purge.erreurs, restants: rapport.purge.restants.length }, "purge de la séance complète").toEqual({ erreurs: [], restants: 0 });
  });
});

function ecrireRapport(r) {
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, "rapport.json"), JSON.stringify(r, null, 2));
  const n = (s) => r.controles.filter((c) => c.statut === s).length;
  const icone = { "OK": "✅", "ÉCHEC": "❌", "À REGARDER": "👀" };
  let md = `# Le village — rapport de simulation\n\n`;
  md += `- Date : ${r.date} · cible : ${r.cible} · durée : ${r.dureeS} s\n`;
  md += `- Contrôles : **${n("OK")} OK · ${n("ÉCHEC")} échec(s) exigé(s) · ${n("À REGARDER")} observation(s)**\n`;
  md += `- Purge : ${r.purge ? `${r.purge.lignes} lignes, ${r.purge.comptes} comptes supprimés, **${r.purge.restants.length} restant(s)**${r.purge.erreurs.length ? " — ⚠️ " + r.purge.erreurs.join(" ; ") : ""}` : "non faite"}\n\n`;
  md += `## Les personnages\n\n| # | Personnage | Rôle | Inscrit |\n|--|--|--|--|\n`;
  r.personas.forEach((p, i) => { md += `| ${i + 1} | ${p.nom} | ${p.role} | ${p.inscrit ? "oui" : "**non**"} |\n`; });
  let acte = null;
  for (const c of r.controles) {
    if (c.acte !== acte) { acte = c.acte; md += `\n## ${acte}\n\n| | Code | Contrôle | Niveau | Détail |\n|--|--|--|--|--|\n`; }
    md += `| ${icone[c.statut]} | ${c.code} | ${c.libelle} | ${c.exige ? "exigé" : "observation"} | ${String(c.detail || "").replace(/\|/g, "/")} |\n`;
  }
  const cons = Object.entries(r.erreursConsole).filter(([, l]) => l.length);
  if (cons.length) {
    md += `\n## Erreurs console\n\n`;
    for (const [nom, l] of cons) md += `- **${nom}** (${l.length}) : ${[...new Set(l)].slice(0, 4).map((x) => "`" + x.replace(/`/g, "'").slice(0, 140) + "`").join(" · ")}\n`;
  }
  const http = Object.entries(r.erreursHttp).filter(([, l]) => l.length);
  if (http.length) {
    md += `\n## Réponses HTTP ≥ 400 (Supabase)\n\n`;
    for (const [nom, l] of http) md += `- **${nom}** (${l.length}) : ${[...new Set(l)].slice(0, 5).map((x) => "`" + x + "`").join(" · ")}\n`;
  }
  if (r.captures.length) md += `\n## Captures\n\n${r.captures.map((f) => `- captures/${f}`).join("\n")}\n`;
  fs.writeFileSync(path.join(SORTIE, "rapport.md"), md);
}
