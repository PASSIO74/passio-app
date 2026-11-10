// ═══════════════════════════════════════════════════════════════════════════
// AUDIT UX/UI 2026-11-10 — BANC DE CAPTURE ISOLÉ
//
// Ce banc ouvre l'application servie depuis CE worktree (code de `main` au commit
// audité) dans un navigateur Playwright, SANS jamais joindre la production :
//   · tout `*.supabase.co` est servi par le « projet vide » de tests/e2e/app-helper.js
//     (modes `visiteur` et `demo`) ou par le faux serveur en mémoire de
//     tests/e2e/audit-2026-11-parcours-faux-serveur.js (mode `compte`) ;
//   · le canal temps réel est avalé ; le service worker est bloqué ;
//   · tout hôte tiers hors liste blanche (polices, tuiles de carte, géocodage,
//     images d'exemple) est REFUSÉ et journalisé dans la fiche de la capture.
// Rien n'est écrit en base, aucun compte n'est créé, aucun message ne part.
//
// Il produit, pour chaque surface : la capture AVANT (application telle quelle),
// la capture APRÈS (la même page, au même état, avec la proposition appliquée
// par une feuille de style et/ou un script de maquette — jamais dans le code de
// l'application), des gros plans, les mesures de `mesures.js` et la position
// des annotations.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const path = require("path");
const fs = require("fs");

const RACINE = path.resolve(__dirname, "..", "..", "..");   // racine du worktree
const AUDIT = path.resolve(__dirname, "..");                 // docs/audit-ux-ui-2026-11-10
const { chromium, webkit } = require("@playwright/test");
const sharp = require("sharp");
const helper = require(path.join(RACINE, "tests", "e2e", "app-helper.js"));
const faux = require(path.join(RACINE, "tests", "e2e", "audit-2026-11-parcours-faux-serveur.js"));
const { GATE_KEY, GATE_TOKEN } = require(path.join(RACINE, "tests", "e2e", "gate-helper.js"));
const { mesurerDansLaPage, parcoursClavier } = require("./mesures");

// ── Gabarits d'écran. TOUS sont des ÉMULATIONS (aucun véritable appareil). ──
const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36";
const VUES = {
  m320: { w: 320, h: 568, dsf: 2, mobile: true, nom: "Mobile très petit 320×568" },
  m360: { w: 360, h: 640, dsf: 2, mobile: true, nom: "Mobile petit 360×640" },
  m390: { w: 390, h: 844, dsf: 2, mobile: true, nom: "Mobile 390×844" },
  m430: { w: 430, h: 932, dsf: 2, mobile: true, nom: "Mobile grand 430×932" },
  t768: { w: 768, h: 1024, dsf: 1.5, mobile: true, nom: "Tablette 768×1024" },
  d1440: { w: 1440, h: 900, dsf: 1, mobile: false, nom: "Ordinateur 1440×900" },
};

// ── Identités FICTIVES (aucune n'existe en production) ──────────────────────
const MOI = { id: "a0d17000-0000-4000-8000-00000000a001", nom: "Camille Audit" };
const GENS = {
  lea: { id: "a0d17000-0000-4000-8000-00000000b002", nom: "Léa Fontaine" },
  malik: { id: "a0d17000-0000-4000-8000-00000000c003", nom: "Malik Benali" },
  ines: { id: "a0d17000-0000-4000-8000-00000000d004", nom: "Inès Moreau" },
  tom: { id: "a0d17000-0000-4000-8000-00000000e005", nom: "Tom Girard" },
  prive: { id: "a0d17000-0000-4000-8000-00000000f006", nom: "Sacha Privé" },
  long: { id: "a0d17000-0000-4000-8000-000000001007", nom: "Marie-Charlotte de La Rochefoucauld-Montmorency" },
};

// Aides contextuelles (app-02, `HINTS`) : montrées UNE fois à un nouveau venu.
// Par défaut le banc capture l'écran d'une personne HABITUÉE (aides déjà vues) ;
// `demarrage.sansAides: false` les laisse paraître pour les auditer.
const AIDES_VUES = { feed_auteur: true, profil_visite: true, second_profil: true, conversation_irl: true };

// ── Serveur statique : les octets du worktree, sur un port libre ────────────
async function demarrerServeur() {
  const httpServer = require("http-server");
  const srv = httpServer.createServer({ root: RACINE, cache: -1, showDir: false, autoIndex: false });
  await new Promise((res, rej) => { srv.server.once("error", rej); srv.listen(0, "127.0.0.1", res); });
  const port = srv.server.address().port;
  return { port, url: "http://127.0.0.1:" + port, fermer: () => new Promise((r) => srv.close(r)) };
}

// ── Politique réseau du contexte : liste blanche de tiers, tout le reste refusé ──
// Posée AVANT les routes Supabase (Playwright consulte d'abord la route
// enregistrée en dernier) : celles-ci gardent donc la main sur `*.supabase.co`.
const TIERS_AUTORISES = [
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,       // polices (lecture seule)
  /^https:\/\/tiles\.openfreemap\.org\//,                 // tuiles de la carte IRL
  /^https:\/\/api-adresse\.data\.gouv\.fr\//,             // géocodage BAN (requêtes fictives)
  /^https:\/\/photon\.komoot\.io\//,                      // géocodage Photon
  /^https:\/\/images\.unsplash\.com\//,                   // photos d'exemple du socle de démonstration
];
const MEDIA_LOCAL = path.join(__dirname, "medias", "boucle.webm");

// ── /demo/* : les images d'illustration du socle ────────────────────────────
// En production elles sont servies par l'Edge Function Netlify
// `netlify/edge-functions/demo.js` (liste fermée d'identifiants, quatre formats).
// Le serveur statique local ne l'exécute pas : sans ce relais, TOUTES les photos
// d'exemple seraient cassées dans les captures « avant », ce qui serait un défaut
// du banc et non du produit. On exécute donc LA MÊME fonction, dans Node, avec un
// cache sur disque (dossier temporaire du poste) pour ne lire chaque image qu'une fois.
let _fnDemo = null;
const CACHE_DEMO = path.join(require("os").tmpdir(), "passio-audit-cache-demo");
async function repondreDemo(route, url) {
  const cle = url.pathname.replace(/[^a-z0-9-]/gi, "_");
  const fCorps = path.join(CACHE_DEMO, cle + ".bin"), fType = path.join(CACHE_DEMO, cle + ".type");
  if (fs.existsSync(fCorps) && fs.existsSync(fType)) return route.fulfill({ status: 200, contentType: fs.readFileSync(fType, "utf8"), body: fs.readFileSync(fCorps) });
  try {
    if (!_fnDemo) _fnDemo = (await import(require("url").pathToFileURL(path.join(RACINE, "netlify", "edge-functions", "demo.js")).href)).default;
    const rep = await _fnDemo(new Request("https://passio-app.netlify.app" + url.pathname, { method: "GET" }));
    const corps = Buffer.from(await rep.arrayBuffer());
    const type = (rep.headers.get("content-type") || "text/plain").split(";")[0];
    if (rep.status === 200) { fs.mkdirSync(CACHE_DEMO, { recursive: true }); fs.writeFileSync(fCorps, corps); fs.writeFileSync(fType, type); }
    return route.fulfill({ status: rep.status, contentType: type, body: corps });
  } catch (e) {
    return route.fulfill({ status: 502, contentType: "text/plain", body: "502" });
  }
}

async function poserPolitiqueReseau(context, baseURL, journal) {
  await context.route("**/*", async (route) => {
    const req = route.request();
    const u = req.url();
    if (u.startsWith(baseURL + "/demo/")) return repondreDemo(route, new URL(u));
    if (u.startsWith(baseURL) || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:")) return route.fallback();
    if (/^https:\/\/[a-z0-9]{20}\.supabase\.co\//.test(u)) return route.fallback();
    // Vidéos distantes (socle de démonstration) : remplacées par une boucle locale,
    // le Chromium de Playwright ne lisant pas le H.264 et le banc restant isolé.
    if (req.resourceType() === "media" || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u)) {
      journal.push({ url: u.slice(0, 160), sort: "media-locale" });
      if (fs.existsSync(MEDIA_LOCAL)) return route.fulfill({ status: 200, contentType: "video/webm", body: fs.readFileSync(MEDIA_LOCAL) });
      return route.abort();
    }
    if (req.method() === "GET" && TIERS_AUTORISES.some((m) => m.test(u))) {
      journal.push({ url: u.slice(0, 160), sort: "autorise" });
      return route.continue();
    }
    journal.push({ url: u.slice(0, 160), sort: "refuse", methode: req.method() });
    return route.abort();
  });
}

async function ouvrirContexte(nav, vue, baseURL, extra) {
  const v = VUES[vue];
  if (!v) throw new Error("vue inconnue : " + vue + " (attendu : " + Object.keys(VUES).join(", ") + ")");
  const opts = {
    baseURL,
    viewport: { width: v.w, height: v.h },
    deviceScaleFactor: v.dsf,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    serviceWorkers: "block",
    ...(extra || {}),
  };
  // Sous Chromium : agent Android + tactile (couple moteur/agent réel d'un Chrome Android).
  if (v.mobile && nav.browserType().name() === "chromium") { opts.isMobile = true; opts.hasTouch = true; opts.userAgent = UA_ANDROID; }
  return nav.newContext(opts);
}

// Clés de localStorage posées AVANT le premier chargement, une seule fois par onglet.
async function poserStockage(page, stockage) {
  if (!stockage) return;
  await page.addInitScript((s) => {
    if (sessionStorage.getItem("__audit_stockage_pose")) return;
    sessionStorage.setItem("__audit_stockage_pose", "1");
    for (const k of Object.keys(s)) localStorage.setItem(k, typeof s[k] === "string" ? s[k] : JSON.stringify(s[k]));
  }, stockage);
}

// ── Compte connecté sur le faux serveur (variante d'`ouvrirCompte`, avec état) ──
async function ouvrirCompteAudit(context, serveur, uid, opts) {
  opts = opts || {};
  const page = await context.newPage();
  await serveur.brancher(page);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await page.addInitScript(([u, cle, jwt, e, premiereVisite]) => {
    if (sessionStorage.getItem("__banc_identite_posee")) return;
    sessionStorage.setItem("__banc_identite_posee", "1");
    localStorage.setItem("passio_uid", u);
    if (!localStorage.getItem(cle)) localStorage.setItem(cle, JSON.stringify({ access_token: jwt, refresh_token: "rt_" + u, token_type: "bearer", expires_in: 3600, expires_at: e, user: { id: u, aud: "authenticated", role: "authenticated" } }));
    if (!premiereVisite) localStorage.setItem("passio_first_run_experience_v1", "0");
  }, [uid, "sb-" + faux.REF + "-auth-token", faux.jwtPour(uid, { exp }), exp, !!opts.premiereVisite]);
  await poserStockage(page, opts.stockage);
  if (opts.avantBoot) await opts.avantBoot(page, context);
  const errors = { js: [], console: [], network: [] };
  let etat = opts.etat;
  if (!etat) {
    etat = helper.onboardedState(opts.nbPassions || 1);
    const nom = opts.nom || MOI.nom;
    etat.user.name = nom; etat.user.general.username = nom;
    etat.user.profiles.forEach((p) => { p.name = nom; });
  }
  if (opts.sansAides !== false) etat.hintsVus = Object.assign({}, AIDES_VUES, etat.hintsVus || {});
  await helper.bootOnboarded(page, errors, 1, { sansIsolationDesDonnees: true, state: etat, query: opts.query || "" });
  // Comme `ouvrirCompte` : les neutralisations de bootOnboarded sont retirées,
  // c'est le faux serveur qui tient le réseau.
  await page.evaluate(() => {
    window.__toasts = [];
    const _toast = window.toast;
    window.toast = function (msg, type) { window.__toasts.push({ t: Date.now(), msg: String(msg), type: type || "info" }); return _toast.apply(this, arguments); };
    window.supaPublishPostWithRetry = window.__vraiSupa.publishPost;
    window.supaAddComment = window.__vraiSupa.addComment;
    window.supaInsertNotif = window.__vraiSupa.insertNotif;
    window.supaUpsertProfile = window.__vraiSupa.upsertProfile;
    delete window.supaSetPostLike;
  });
  const src = await page.evaluate(async () => { const r = await fetch("js/app-03-posts-vlogs.js"); return r.text(); });
  const debut = src.indexOf("async function supaSetPostLike(");
  const fin = src.indexOf("\nfunction likePost(");
  if (debut > 0 && fin > debut) await page.evaluate((code) => { (0, eval)(code.replace("async function supaSetPostLike(", "window.supaSetPostLike = async function(")); }, src.slice(debut, fin));
  return { page, errors };
}

/**
 * Démarre l'application dans un contexte neuf et isolé.
 * opts.mode :
 *   "visiteur" — appareil vierge, aucune session (première visite réelle) ;
 *   "demo"     — état local « onboardé » sans session (socle de démonstration) ;
 *   "compte"   — session fictive sur le faux serveur (`opts.peupler(serveur)` sème les tables).
 * Autres options : vue, etat (état local complet), nbPassions, query, hash,
 * stockage ({cléLocalStorage: valeur}), avantBoot(page, context), contexte (options
 * Playwright : permissions, geolocation, reducedMotion, colorScheme…), uid, nom,
 * moteur ("chromium" | "webkit"), pwa (true = ne pas écarter l'invite d'installation).
 */
async function demarrer(navs, statique, opts) {
  opts = opts || {};
  const vue = opts.vue || "m390";
  const mode = opts.mode || "demo";
  const moteur = opts.moteur || "chromium";
  const nav = navs[moteur];
  if (!nav) throw new Error("moteur non lancé : " + moteur);
  const context = await ouvrirContexte(nav, vue, statique.url, opts.contexte);
  const reseau = [];
  await poserPolitiqueReseau(context, statique.url, reseau);
  let page, serveur = null, errors = { js: [], console: [], network: [] };
  // Adresse d'un média fictif du banc (servi par le serveur statique local).
  const media = (nom) => statique.url + "/docs/audit-ux-ui-2026-11-10/outils/medias/" + nom;

  if (mode === "compte") {
    serveur = opts.serveur || new faux.FauxServeur();
    const uid = opts.uid || MOI.id;
    if (!serveur.prof(uid)) serveur.compte(uid, opts.nom || MOI.nom, { emoji: "🎧" });
    if (opts.peupler) await opts.peupler(serveur, { MOI, GENS, media });
    const r = await ouvrirCompteAudit(context, serveur, uid, opts);
    page = r.page; errors = r.errors;
  } else if (mode === "demo") {
    page = await context.newPage();
    await poserStockage(page, opts.stockage);
    if (opts.avantBoot) await opts.avantBoot(page, context);
    const etat = opts.etat || helper.onboardedState(opts.nbPassions || 1);
    if (opts.sansAides !== false) etat.hintsVus = Object.assign({}, AIDES_VUES, etat.hintsVus || {});
    await helper.bootOnboarded(page, errors, opts.nbPassions || 1, { state: etat, query: opts.query || "" });
  } else if (mode === "visiteur") {
    page = await context.newPage();
    await helper.projetSupabaseVide(page, {});
    page.on("pageerror", (e) => errors.js.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); (/Failed to load resource|net::|ERR_/.test(t) ? errors.network : errors.console).push(t); } });
    await page.addInitScript(([k, t, pwa]) => {
      sessionStorage.setItem(k, t);
      if (!pwa) sessionStorage.setItem("passio_pwa_dismissed", "1");
    }, [GATE_KEY, GATE_TOKEN, !!opts.pwa]);
    await poserStockage(page, opts.stockage);
    if (opts.avantBoot) await opts.avantBoot(page, context);
    await page.goto("/index.html" + (opts.query || "") + (opts.hash || ""));
    await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined" || document.readyState === "complete", null, { timeout: 25000 });
    await page.waitForTimeout(3200);
  } else {
    throw new Error("mode inconnu : " + mode);
  }
  return { page, context, serveur, errors, reseau, vue, mode, moteur, baseURL: statique.url, media };
}

// ── Aides de geste ──────────────────────────────────────────────────────────
// Appui long RÉEL (événements tactiles de confiance, via CDP) — Chromium seulement.
async function appuiLong(page, selecteur, ms) {
  const boite = await page.locator(selecteur).first().boundingBox();
  if (!boite) throw new Error("appuiLong : introuvable " + selecteur);
  const x = boite.x + boite.width / 2, y = boite.y + boite.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms || 650);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
// Début d'appui SANS relâcher (pour capturer un état « maintenu ») ; rend la fonction de relâchement.
async function appuiMaintenu(page, selecteur) {
  const boite = await page.locator(selecteur).first().boundingBox();
  if (!boite) throw new Error("appuiMaintenu : introuvable " + selecteur);
  const x = boite.x + boite.width / 2, y = boite.y + boite.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  return {
    glisser: async (dx, dy) => cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx, y: y + dy }] }),
    relacher: async () => { await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await cdp.detach(); },
  };
}
// Clavier virtuel SIMULÉ : la fenêtre visible est réduite (hauteur du clavier retirée).
async function simulerClavier(page, hauteurClavier) {
  const v = page.viewportSize();
  await page.setViewportSize({ width: v.width, height: Math.max(260, v.height - (hauteurClavier || 300)) });
  await page.waitForTimeout(350);
  return async () => { await page.setViewportSize(v); await page.waitForTimeout(250); };
}
async function stabiliser(page, ms) {
  try { await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready.then(() => true) : true); } catch (e) {}
  await page.waitForTimeout(ms == null ? 450 : ms);
}
// Où en est l'écran : sert de preuve dans la fiche de capture.
function contexteEcran() {
  const actif = document.querySelector(".screen.active");
  const modale = document.getElementById("modalBackdrop");
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const visible = (el) => { const c = cs(el); return !!el && c.display !== "none" && c.visibility !== "hidden" && el.getBoundingClientRect().height > 0; };
  return {
    ecran: actif ? actif.id : null,
    modale: !!modale && (modale.classList.contains("active") || modale.classList.contains("open") || visible(modale)) ? ((document.querySelector("#modalContent h2, #modalContent h3, #modalContent .modal-title") || {}).textContent || "ouverte").trim().slice(0, 80) : null,
    landing: visible(document.getElementById("landing")),
    onboarding: visible(document.getElementById("onboarding")),
    conversation: (document.getElementById("conv-fullpage") || { classList: { contains: () => false } }).classList.contains("active"),
    bobines: (document.getElementById("reelsViewer") || { classList: { contains: () => false } }).classList.contains("active"),
    titre: document.title,
    hash: location.hash,
  };
}

// ── Captures ────────────────────────────────────────────────────────────────
async function ecrireImage(buffer, fichier) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  await sharp(buffer).webp({ quality: 86, effort: 4 }).toFile(fichier);
  const meta = await sharp(buffer).metadata();
  return { largeur: meta.width, hauteur: meta.height, octets: fs.statSync(fichier).size };
}
// Boîte du premier élément VISIBLE qui répond au sélecteur (un premier élément
// masqué — `display:none` — ne doit pas faire conclure « introuvable »).
async function premiereBoiteVisible(page, sel) {
  try {
    const loc = page.locator(sel);
    const n = Math.min(await loc.count(), 15);
    for (let i = 0; i < n; i++) {
      const b = await loc.nth(i).boundingBox({ timeout: 1500 }).catch(() => null);
      if (b && b.width > 0.5 && b.height > 0.5) return b;
    }
  } catch (e) {}
  return null;
}
async function boiteDe(page, sel, marge) {
  const b = await premiereBoiteVisible(page, sel);
  if (!b) return null;
  const v = page.viewportSize();
  const m = marge == null ? 10 : marge;
  const x = Math.max(0, b.x - m), y = Math.max(0, b.y - m);
  const w = Math.min(v.width - x, b.width + 2 * m), h = Math.min(v.height - y, b.height + 2 * m);
  if (w < 4 || h < 4) return null;
  return { x, y, width: w, height: h };
}
async function resoudreAnnotations(page, annotations) {
  const v = page.viewportSize();
  const out = [];
  for (const a of annotations || []) {
    let x = a.x, y = a.y, w = null, h = null, trouve = true;
    if (a.sel) {
      const b = await premiereBoiteVisible(page, a.sel);
      if (b) { x = (b.x + b.width / 2) / v.width; y = (b.y + b.height / 2) / v.height; w = b.width / v.width; h = b.height / v.height; }
      else trouve = false;
    }
    out.push({ n: a.n, texte: a.texte, x: x == null ? null : Math.round(x * 1000) / 1000, y: y == null ? null : Math.round(y * 1000) / 1000, w: w == null ? null : Math.round(w * 1000) / 1000, h: h == null ? null : Math.round(h * 1000) / 1000, sel: a.sel || null, trouve });
  }
  return out;
}

const ARRET = { arret: true };

/**
 * Exécute un fichier de scénarios. Voir GUIDE-SCENARIOS.md.
 * filtre : { scenario?: nom, id?: identifiant de capture, vue?: gabarit }
 */
async function executer(fichier, filtre) {
  filtre = filtre || {};
  const mod = require(path.resolve(fichier));
  const domaine = mod.domaine;
  if (!domaine) throw new Error("le fichier de scénarios doit exporter `domaine`");
  const dirImg = path.join(AUDIT, "captures", domaine);
  const dirDon = path.join(AUDIT, "donnees", "captures", domaine);
  fs.mkdirSync(dirImg, { recursive: true }); fs.mkdirSync(dirDon, { recursive: true });

  const statique = await demarrerServeur();
  const navs = { chromium: await chromium.launch() };
  const besoinWebkit = (mod.scenarios || []).some((s) => (s.demarrage || {}).moteur === "webkit");
  if (besoinWebkit) navs.webkit = await webkit.launch();
  const versions = { chromium: navs.chromium.version(), webkit: navs.webkit ? navs.webkit.version() : null };
  const bilan = { ok: 0, echecs: [], captures: [] };

  for (const sc of mod.scenarios || []) {
    if (filtre.scenario && sc.nom !== filtre.scenario) continue;
    const vues = (sc.vues || ["m390"]).filter((v) => !filtre.vue || v === filtre.vue);
    for (const vue of vues) {
      const file = [];
      const jouer = async (phase, cible) => {
        const d = await demarrer(navs, statique, { ...(sc.demarrage || {}), vue });
        const page = d.page;
        const prendre = async (spec) => {
          if (!spec || !spec.id) throw new Error("prendre() exige un id");
          if (spec.seulement && !spec.seulement.includes(vue)) return;
          if (filtre.id && spec.id !== filtre.id && phase === "avant") return;
          const base = spec.id + "--" + vue;
          const fDon = path.join(dirDon, base + ".json");
          if (phase === "apres" && spec.id !== cible) return;

          const appliquer = async () => {
            const a = spec.apres || {};
            let style = null;
            if (a.css) style = await page.addStyleTag({ content: a.css });
            if (a.js) await a.js(page, { vue, banc: api });
            await stabiliser(page, a.attendre);
            return style;
          };
          const prendreVues = async (suffixe, zooms) => {
            const buf = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
            const img = await ecrireImage(buf, path.join(dirImg, base + "--" + suffixe + ".webp"));
            const zs = [];
            for (const z of zooms || []) {
              const clip = await boiteDe(page, z.sel, z.marge);
              if (!clip) { zs.push({ nom: z.nom, manquant: true, sel: z.sel }); continue; }
              const zb = await page.screenshot({ type: "png", clip, animations: "disabled", caret: "hide" });
              const nomF = base + "--" + suffixe + "-zoom-" + z.nom + ".webp";
              const zi = await ecrireImage(zb, path.join(dirImg, nomF));
              zs.push({ nom: z.nom, titre: z.titre || z.nom, fichier: "captures/" + domaine + "/" + nomF, ...zi });
            }
            return { fichier: "captures/" + domaine + "/" + base + "--" + suffixe + ".webp", ...img, zooms: zs };
          };

          if (phase === "avant") {
            await stabiliser(page, spec.attendre);
            const fiche = {
              id: spec.id, domaine, scenario: sc.nom, vue, gabarit: VUES[vue].nom, moteur: d.moteur, version: versions[d.moteur],
              mode: d.mode, titre: spec.titre || "", note: spec.note || "", prisLe: new Date().toISOString(),
              ecran: await page.evaluate(contexteEcran).catch(() => null),
              avant: await prendreVues("avant", spec.zooms),
              annotationsAvant: await resoudreAnnotations(page, spec.annotationsAvant),
              mesures: spec.mesurer === false ? null : await page.evaluate(mesurerDansLaPage, { racine: spec.racine || null }).catch((e) => ({ erreur: String(e && e.message) })),
              apres: null, annotations: [],
              erreurs: { js: d.errors.js.slice(), console: d.errors.console.slice(0, 12) },
              reseauRefuse: d.reseau.filter((r) => r.sort === "refuse").map((r) => r.url).filter((u, i, t) => t.indexOf(u) === i).slice(0, 12),
            };
            if (spec.apres) {
              if (spec.apres.js) file.push(spec.id);
              else {
                const style = await appliquer();
                fiche.apres = await prendreVues("apres", spec.apres.zooms || spec.zooms);
                fiche.annotations = await resoudreAnnotations(page, spec.annotations);
                if (style) await style.evaluate((n) => n.remove()).catch(() => {});
                await stabiliser(page, 150);
              }
            }
            fs.writeFileSync(fDon, JSON.stringify(fiche, null, 1));
            bilan.ok++; bilan.captures.push(base);
            console.log("  ✓ " + base + (spec.apres ? (spec.apres.js ? "  (après : rejoué)" : "  + après") : ""));
            // Un sélecteur d'annotation ou de gros plan qui ne trouve rien se dit tout de suite.
            for (const a of fiche.annotationsAvant.concat(fiche.annotations)) if (a.sel && !a.trouve) console.log("    ⚠ annotation " + a.n + " : aucun élément visible pour « " + a.sel + " »");
            for (const z of (fiche.avant.zooms || []).concat((fiche.apres && fiche.apres.zooms) || [])) if (z.manquant) console.log("    ⚠ gros plan « " + z.nom + " » : aucun élément visible pour « " + z.sel + " »");
            return;
          }
          // phase "apres" : la maquette scriptée, sur un état rejoué à l'identique.
          await stabiliser(page, spec.attendre);
          await appliquer();
          const fiche = JSON.parse(fs.readFileSync(fDon, "utf8"));
          fiche.apres = await prendreVues("apres", spec.apres.zooms || spec.zooms);
          fiche.annotations = await resoudreAnnotations(page, spec.annotations);
          fs.writeFileSync(fDon, JSON.stringify(fiche, null, 1));
          console.log("  ✓ " + base + "  après (maquette scriptée)");
          for (const a of fiche.annotations) if (a.sel && !a.trouve) console.log("    ⚠ annotation " + a.n + " : aucun élément visible pour « " + a.sel + " »");
          for (const z of (fiche.apres.zooms || [])) if (z.manquant) console.log("    ⚠ gros plan « " + z.nom + " » : aucun élément visible pour « " + z.sel + " »");
          throw ARRET;
        };
        try {
          await sc.derouler({ page, context: d.context, serveur: d.serveur, vue, prendre, banc: api, MOI, GENS, media: d.media, erreurs: d.errors, phase });
        } catch (e) {
          if (e !== ARRET) {
            const msg = "[" + sc.nom + " / " + vue + " / " + phase + (cible ? " " + cible : "") + "] " + (e && e.message ? e.message.split("\n")[0] : e);
            bilan.echecs.push(msg);
            console.log("  ✗ " + msg);
            try { const b = await page.screenshot({ type: "png" }); const f = path.join(AUDIT, "donnees", "echecs", domaine + "--" + sc.nom + "--" + vue + ".png"); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); console.log("    écran au moment de l'échec : " + f); } catch (e2) {}
          }
        } finally {
          await d.context.close().catch(() => {});
        }
      };
      console.log("▶ " + domaine + " · " + sc.nom + " · " + vue);
      await jouer("avant", null);
      for (const id of file) { if (filtre.id && filtre.id !== id) continue; await jouer("apres", id); }
    }
  }
  for (const k of Object.keys(navs)) await navs[k].close();
  await statique.fermer();
  console.log("— " + bilan.ok + " capture(s), " + bilan.echecs.length + " échec(s)");
  return bilan;
}

const api = {
  RACINE, AUDIT, VUES, MOI, GENS, FauxServeur: faux.FauxServeur, jwtPour: faux.jwtPour,
  demarrerServeur, demarrer, executer, appuiLong, appuiMaintenu, simulerClavier, stabiliser,
  mesurerDansLaPage, parcoursClavier, contexteEcran, onboardedState: helper.onboardedState,
  lancer: async (moteurs) => { const n = {}; for (const m of moteurs || ["chromium"]) n[m] = await (m === "webkit" ? webkit : chromium).launch(); return n; },
};
module.exports = api;
