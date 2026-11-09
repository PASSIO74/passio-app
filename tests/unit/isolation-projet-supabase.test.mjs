// ══════════════════════════════════════════════════════════════════════════
// BANC — LE PROJET SUPABASE VIDE DES SUITES LOCALES (2026-11-09)
// ──────────────────────────────────────────────────────────────────────────
// Le pendant SANS NAVIGATEUR de `tests/e2e/isolation-projet-supabase.spec.js` :
//   ① ② la matrice des réponses de `repondreProjetVide`, cas par cas, contre un
//       faux `route` — rapide, exhaustif, et indépendant du réseau ;
//   ③ l'EXEMPTION du projet `prod` et les deux portes de sortie, contre un faux
//       contexte : un filet posé sur une suite à comptes réels casserait sa RLS
//       réelle, un filet absent d'une suite locale rouvrirait la production ;
//   ④ la RÈGLE : toute suite du projet `local` qui navigue elle-même pose le
//       projet vide (ou une isolation plus stricte) — sinon elle figure au socle
//       avec sa raison. Plus stricte que `scripts/audit-tests-isolation.js`, qui
//       exempte une page « qui ne touche pas l'application » : `smoke.spec.js`
//       en était une, et chargeait pourtant le référentiel des passions depuis
//       la production à chaque cas (mesuré par la sonde du 2026-11-09).
//   ⑤ `opts.sansProjetVide` n'est permis qu'aux suites inscrites au socle.
// ══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const E2E = path.join(RACINE, "tests", "e2e");
const AIDE = path.join(E2E, "app-helper.js");

// `projetPlaywright()` lit `require("@playwright/test").test.info()` À L'APPEL :
// on intercepte ce `require` au CHARGEMENT, et on change de projet à volonté
// entre deux appels.
// ⚠️ PAS PAR `require.resolve` + `require.cache` : le job « Audits statiques et
// bancs serveur » n'installe PAS `node_modules` — la résolution levait
// `Cannot find module '@playwright/test'` et le fichier entier tombait au
// chargement (vécu au premier passage CI de la PR #799). `Module._load` reçoit
// la DEMANDE avant toute résolution : rien n'a besoin d'être installé.
let projetSimule = "local";
const fauxPlaywright = {
  test: {
    info() {
      if (projetSimule === null) throw new Error("test.info() hors d'un test");
      return { project: { name: projetSimule } };
    },
  },
};
const chargerOrigine = Module._load;
Module._load = function (demande, ...reste) {
  if (demande === "@playwright/test") return fauxPlaywright;
  return chargerOrigine.call(this, demande, ...reste);
};
const { repondreProjetVide, projetSupabaseVide } = require(AIDE);

const PROJET = "https://njkiyoklssvefstljemx.supabase.co";
const ANON = "cle-anon-du-banc";

/** Un faux `route` Playwright : il rend ce que le filet a répondu. */
async function repondre({ methode = "GET", url, entetes = {}, corps = null, type = "fetch" }) {
  let reponse = null;
  let abandon = false;
  const route = {
    request: () => ({
      method: () => methode,
      url: () => (url.startsWith("http") ? url : PROJET + url),
      headers: () => ({ apikey: ANON, authorization: "Bearer " + ANON, ...entetes }),
      postData: () => (corps == null ? null : JSON.stringify(corps)),
      resourceType: () => type,
    }),
    fulfill: async (o) => { reponse = o; },
    abort: async () => { abandon = true; },
  };
  await repondreProjetVide(route);
  if (abandon) return { abandon: true };
  let json;
  try { json = reponse.body ? JSON.parse(String(reponse.body)) : undefined; } catch (e) { json = "(non JSON)"; }
  return { status: reponse.status, json, entetes: reponse.headers || {} };
}

test("① lectures : `[]` exposé, HEAD à 0, `.single()` en 406, privilèges d'anon", async () => {
  const lives = await repondre({ url: "/rest/v1/video_lives?select=*&status=eq.live&limit=20" });
  assert.equal(lives.status, 200);
  assert.deepEqual(lives.json, []);
  assert.equal(lives.entetes["content-range"], "*/0");
  assert.match(lives.entetes["access-control-expose-headers"], /content-range/, "sans exposition, le SDK lit count=null");

  const compte = await repondre({ methode: "HEAD", url: "/rest/v1/follows?select=*&following_id=eq.u_x" });
  assert.equal(compte.status, 200);
  assert.equal(compte.json, undefined);
  assert.equal(compte.entetes["content-range"], "*/0");

  const seul = await repondre({ url: "/rest/v1/profiles?select=id&id=eq.u_x", entetes: { accept: "application/vnd.pgrst.object+json" } });
  assert.equal(seul.status, 406);
  assert.equal(seul.json.code, "PGRST116");

  const prives = await repondre({ url: "/rest/v1/event_attendees?select=event_id&user_id=eq.u_x" });
  assert.equal(prives.status, 401);
  assert.equal(prives.json.code, "42501");
  assert.match(prives.json.message, /permission denied for table event_attendees/);

  assert.equal((await repondre({ url: "/rest/v1/events?select=*" })).status, 401, "events : select=* refusé en entier");
  assert.equal((await repondre({ url: "/rest/v1/events" })).status, 401, "events : sans select = toutes les colonnes");
  assert.equal((await repondre({ url: "/rest/v1/events?select=id,title" })).status, 200, "events : colonnes publiques lisibles");
  // Une table INCONNUE du relevé : la majorité, lisible sous RLS, donc vide.
  assert.deepEqual((await repondre({ url: "/rest/v1/table_de_demain?select=*" })).json, []);

  // Le référentiel des passions : le MIROIR, paginé comme PostgREST — jamais `[]`
  // (une suite qui ne pose que le projet vide lisait le vrai référentiel).
  const page0 = await repondre({ url: "/rest/v1/passions?select=id&status=eq.active&offset=0&limit=1000" });
  assert.equal(page0.status, 200);
  assert.equal(page0.json.length, 1000);
  assert.deepEqual(Object.keys(page0.json[0]), ["id"]);
  // …mais une ÉCRITURE sur `passions` reste jugée par le projet vide (la RLS
  // filtre : zéro ligne touchée, rien ne part).
  assert.equal((await repondre({ methode: "PATCH", url: "/rest/v1/passions?id=eq.musique" })).status, 204);
});

test("② écritures : refus de la RLS, zéro ligne, et les deux tables qu'un visiteur alimente", async () => {
  const etat = await repondre({ methode: "POST", url: "/rest/v1/user_state?on_conflict=user_id", corps: { user_id: "u_x" } });
  assert.equal(etat.status, 401);
  assert.equal(etat.json.code, "42501");
  assert.match(etat.json.message, /row-level security policy for table "user_state"/);

  assert.equal((await repondre({ methode: "POST", url: "/rest/v1/conversations", corps: { id: "c" } })).json.message,
    "permission denied for table conversations", "anon n'a pas même le privilège d'insertion");

  const tel = await repondre({ methode: "POST", url: "/rest/v1/telemetry_events", corps: [{ event_type: "x", user_id: null }] });
  assert.equal(tel.status, 201);
  const telCompte = await repondre({ methode: "POST", url: "/rest/v1/telemetry_events", corps: [{ event_type: "x", user_id: "u_x" }] });
  assert.equal(telCompte.status, 401, "une ligne de télémétrie AU NOM d'un compte est refusée à un visiteur");
  assert.equal((await repondre({ methode: "POST", url: "/rest/v1/client_errors", corps: { message: "x" } })).status, 201);
  const rendu = await repondre({ methode: "POST", url: "/rest/v1/client_errors?select=*", entetes: { prefer: "return=representation" }, corps: { message: "x" } });
  assert.deepEqual(rendu.json, [{ message: "x" }]);

  const maj = await repondre({ methode: "PATCH", url: "/rest/v1/profiles?id=eq.u_x" });
  assert.equal(maj.status, 204);
  const majRendue = await repondre({ methode: "PATCH", url: "/rest/v1/profiles?id=eq.u_x&select=id", entetes: { prefer: "return=representation" } });
  assert.equal(majRendue.status, 200);
  assert.deepEqual(majRendue.json, []);
  assert.equal((await repondre({ methode: "PATCH", url: "/rest/v1/notifications?id=eq.n" })).status, 401);
  assert.equal((await repondre({ methode: "DELETE", url: "/rest/v1/follows?follower_id=eq.u_x" })).status, 204);
});

test("③ RPC, jeton fictif, authentification, stockage, fonctions", async () => {
  assert.deepEqual((await repondre({ methode: "POST", url: "/rest/v1/rpc/fil_compteurs", corps: { _post_ids: ["p"] } })).json, []);
  assert.deepEqual((await repondre({ methode: "POST", url: "/rest/v1/rpc/rechercher_passions", corps: { q: "jazz" } })).json, []);
  const rpc = await repondre({ methode: "POST", url: "/rest/v1/rpc/irl_interaction_allowed", corps: { _other: "u" } });
  assert.equal(rpc.status, 401);
  assert.match(rpc.json.message, /permission denied for function irl_interaction_allowed/);

  // Un jeton d'utilisateur, dans une suite locale, est forcément fictif.
  const fictif = { authorization: "Bearer eyJ.fictif.jeton" };
  const lecture = await repondre({ url: "/rest/v1/posts?select=id", entetes: fictif });
  assert.equal(lecture.status, 401);
  assert.equal(lecture.json.code, "PGRST301");
  const moi = await repondre({ url: "/auth/v1/user", entetes: fictif });
  assert.equal(moi.status, 403);
  assert.equal(moi.json.error_code, "bad_jwt");

  const rafraichir = await repondre({ methode: "POST", url: "/auth/v1/token?grant_type=refresh_token", corps: { refresh_token: "x" } });
  assert.equal(rafraichir.json.error_code, "refresh_token_not_found");
  assert.equal((await repondre({ methode: "POST", url: "/auth/v1/token?grant_type=password", corps: {} })).json.error_code, "invalid_credentials");
  for (const p of ["/auth/v1/signup", "/auth/v1/otp", "/auth/v1/recover", "/auth/v1/resend", "/auth/v1/magiclink"]) {
    const r = await repondre({ methode: "POST", url: p, corps: { email: "x@passio-e2e.test" } });
    assert.equal(r.status, 422, p + " doit être refusé : en production il crée un compte ou envoie un courriel");
  }
  assert.equal((await repondre({ methode: "POST", url: "/auth/v1/logout" })).status, 204);

  const image = await repondre({ url: "/storage/v1/object/public/content/a.jpg", type: "image" });
  assert.equal(image.status, 200);
  assert.equal((await repondre({ url: "/storage/v1/object/public/content/v.mp4", type: "media" })).status, 400);
  assert.equal((await repondre({ methode: "POST", url: "/storage/v1/object/content/photos/u/x.png" })).json.statusCode, "403");
  assert.equal((await repondre({ methode: "POST", url: "/functions/v1/ask-ai", corps: {} })).status, 401);
  assert.equal((await repondre({ methode: "OPTIONS", url: "/rest/v1/posts?select=id" })).status, 204);
});

function fauxContexte() {
  const appels = [];
  const ctx = {
    route: async (motif, gestionnaire) => { appels.push(["route", motif, gestionnaire]); },
    routeWebSocket: async (motif) => { appels.push(["ws", motif]); },
  };
  return { page: { context: () => ctx }, appels };
}

/** Rejoue une requête dans le gestionnaire posé sur le faux contexte. */
async function passerPar(gestionnaire, url, methode = "GET") {
  const issue = { continue: false, fulfill: null };
  await gestionnaire({
    request: () => ({
      method: () => methode, url: () => url, headers: () => ({ apikey: ANON, authorization: "Bearer " + ANON }),
      postData: () => null, resourceType: () => "fetch",
    }),
    continue: async () => { issue.continue = true; },
    fulfill: async (o) => { issue.fulfill = o; },
    abort: async () => {},
  });
  return issue;
}

test("④ le projet `prod` est EXEMPT ; local et WebKit sont couverts ; idempotent par contexte", async () => {
  projetSimule = "local";
  const local = fauxContexte();
  assert.equal(await projetSupabaseVide(local.page), true);
  assert.equal(await projetSupabaseVide(local.page), true);
  const routes = local.appels.filter(([k]) => k === "route");
  assert.equal(routes.length, 1, "un second appel ne double pas la route");
  const motif = routes[0][1];
  assert.ok(motif.test(PROJET + "/rest/v1/posts"), "le projet de production est couvert");
  assert.ok(motif.test("https://abcdefghijabcdefghij.supabase.co/auth/v1/user"), "tout projet Supabase, staging compris");
  assert.ok(!motif.test("https://passio-essai.invalid/rest/v1/posts"), "l'hôte fictif des verrous reste hors du filet");
  assert.ok(!motif.test("http://127.0.0.1:8080/index.html"), "le serveur local reste hors du filet");
  assert.ok(local.appels.some(([k]) => k === "ws"), "le canal temps réel est avalé au même niveau");

  projetSimule = "webkit-iphone";
  const webkit = fauxContexte();
  assert.equal(await projetSupabaseVide(webkit.page), true);

  projetSimule = null; // hors d'un test : par défaut, on protège la production
  assert.equal(await projetSupabaseVide(fauxContexte().page), true);

  projetSimule = "prod";
  const prod = fauxContexte();
  assert.equal(await projetSupabaseVide(prod.page), false);
  assert.deepEqual(prod.appels, [], "une suite à comptes réels garde sa RLS réelle");

  projetSimule = "local";
  const sortie = fauxContexte();
  assert.equal(await projetSupabaseVide(sortie.page, { sansProjetVide: true }), false);
  assert.equal(await projetSupabaseVide(sortie.page, { sansIsolationDesDonnees: true }), false);
  assert.deepEqual(sortie.appels, []);

  // Sans `cheminsReels`, RIEN ne repart au réseau…
  const [, , gestionnaire] = local.appels.find(([k]) => k === "route");
  assert.equal((await passerPar(gestionnaire, PROJET + "/rest/v1/telemetry_events", "POST")).continue, false);
  // …avec, SEULS les chemins désignés y repartent.
  const contrat = fauxContexte();
  await projetSupabaseVide(contrat.page, { cheminsReels: [/\/rest\/v1\/telemetry_events/] });
  const [, , g2] = contrat.appels.find(([k]) => k === "route");
  assert.equal((await passerPar(g2, PROJET + "/rest/v1/telemetry_events", "POST")).continue, true);
  const autre = await passerPar(g2, PROJET + "/rest/v1/video_lives?select=*");
  assert.equal(autre.continue, false, "un chemin réel désigné ne rouvre pas le reste du projet");
  assert.equal(autre.fulfill.status, 200);
});

// ── ④/⑤ LA RÈGLE, SUR LE DÉPÔT TEL QU'IL EST ────────────────────────────────
const { sansCommentairesNiChaines } = require(path.join(RACINE, "scripts", "audit-tests-isolation.js"));
const socle = JSON.parse(readFileSync(path.join(RACINE, "scripts", "tests-isolation-socle.json"), "utf8"));
const config = readFileSync(path.join(RACINE, "playwright.config.js"), "utf8");
const debutProd = config.indexOf("const SUITES_PROD");
const SUITES_PROD = new Set(
  [...config.slice(debutProd, config.indexOf("];", debutProd)).matchAll(/"([^"]+\.spec\.js)"/g)].map((m) => m[1]),
);
// Ce qui pose le projet vide (ou une coupure plus stricte de tout Supabase) :
//   bootOnboarded / sansDonneesDistantes / projetSupabaseVide → le projet vide ;
//   bootVisiteur / couperReseauSupabase (first-run-helper) → tout `supabase` abandonné ;
//   sansIsolationDesDonnees → la suite gère le réseau elle-même (à elle de le prouver).
const ISOLE = /\b(bootOnboarded|sansDonneesDistantes|projetSupabaseVide|bootVisiteur|couperReseauSupabase)\s*\(|sansIsolationDesDonnees/;

function codeDe(f) {
  const src = readFileSync(path.join(E2E, f), "utf8");
  return sansCommentairesNiChaines(src.replace(/^.*require\(["'][^"']*["']\).*$/gm, ""));
}

test("⑤ toute suite LOCALE qui navigue elle-même pose le projet vide — ou figure au socle avec sa raison", () => {
  assert.ok(SUITES_PROD.size >= 4, "la liste SUITES_PROD n'a pas été lue dans playwright.config.js");
  const exposees = [];
  let navigantes = 0;
  for (const f of readdirSync(E2E).filter((x) => x.endsWith(".spec.js")).sort()) {
    if (SUITES_PROD.has(f)) continue;
    const code = codeDe(f);
    if (!/\.goto\s*\(/.test(code)) continue;
    navigantes++;
    if (ISOLE.test(code) || socle[f]) continue;
    exposees.push(f);
  }
  assert.ok(navigantes > 20, "trop peu de suites navigantes trouvées (" + navigantes + ") : le motif a-t-il dérivé ?");
  assert.deepEqual(exposees, [],
    "Ces suites chargent l'application par leur propre `goto` SANS le projet vide : leurs requêtes partent au " +
    "projet Supabase de PRODUCTION. Poser `await projetSupabaseVide(page)` (ou `sansDonneesDistantes`) AVANT le goto, " +
    "ou inscrire la suite dans scripts/tests-isolation-socle.json avec la RAISON.\n  · " + exposees.join("\n  · "));
});

test("⑦ WebKit : une suite du socle iPhone qui démarre l'application bloque le service worker — sauf si le worker est son sujet", () => {
  // ⚠️ SOUS WEBKIT, UNE PAGE QUE LE SERVICE WORKER CONTRÔLE ÉCHAPPE À `page.route`
  // ET À `context.route` : la sonde du 2026-11-09 a vu 86 requêtes par course
  // partir en production depuis quatre suites isolées sur Chromium. Le remède
  // (`serviceWorkersHorsWebkit`, ou `"block"` comme `pilotage-nuage`) doit
  // accompagner toute suite du socle WebKit qui pose les routes d'isolation.
  const debut = config.indexOf("const SUITES_WEBKIT");
  const SUITES_WEBKIT = [...config.slice(debut, config.indexOf("];", debut)).matchAll(/"([^"]+\.spec\.js)"/g)].map((m) => m[1]);
  assert.ok(SUITES_WEBKIT.length >= 5, "SUITES_WEBKIT n'a pas été lue dans playwright.config.js");
  // Le VRAI worker est le sujet de ces suites : le bloquer les viderait de sens.
  const WORKER_SUJET = new Set(["pwa-maj-pendant-appel.spec.js", "sw-page-revalidee.spec.js"]);
  const ROUTES_APP = /\b(bootOnboarded|sansDonneesDistantes|projetSupabaseVide)\s*\(/;
  // Jugé sur la SOURCE (l'épurateur vide les chaînes : `"block"` y deviendrait
  // `""`), ligne de commentaire exclue — un réglage commenté n'est pas un réglage.
  const BLOQUE = /^(?![ \t]*\/\/).*serviceWorkers\s*:\s*(serviceWorkersHorsWebkit\b|["']block["'])/m;
  const fautives = SUITES_WEBKIT.filter((f) => {
    if (WORKER_SUJET.has(f)) return false;
    const src = readFileSync(path.join(E2E, f), "utf8");
    return ROUTES_APP.test(codeDe(f)) && !BLOQUE.test(src);
  });
  assert.deepEqual(fautives, [],
    "Ces suites du socle WebKit posent les routes d'isolation SANS bloquer le service worker : sous WebKit, " +
    "ses requêtes partent en production dès que le worker contrôle la page. " +
    "`test.use({ serviceWorkers: serviceWorkersHorsWebkit })` (app-helper.js).\n  · " + fautives.join("\n  · "));
});

test("⑥ `sansProjetVide` et `cheminsReels` ne sont permis qu'à une suite inscrite au socle, et toute entrée a sa raison", () => {
  for (const [f, raison] of Object.entries(socle)) {
    if (f.startsWith("_")) continue;
    assert.ok(typeof raison === "string" && raison.trim().length > 30, "entrée de socle sans raison écrite : " + f);
  }
  const fautives = readdirSync(E2E)
    .filter((x) => x.endsWith(".spec.js"))
    .filter((f) => /\b(sansProjetVide|cheminsReels)\b/.test(codeDe(f)) && !socle[f]);
  assert.deepEqual(fautives, [], "chemin réel hors socle : " + fautives.join(", "));
});
