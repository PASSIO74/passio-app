// ═══════════════════════════════════════════════════════════════════════════
// UN PASSAGE CI NE CRÉE AUCUN COMPTE UNE FOIS LE JEU AMORCÉ (ADR-013, D16-01).
//
// Le staging partage les quotas de l'organisation Supabase avec la production :
// au 20/11 il consommait 35 % des MAU, à ~48 comptes créés par passage du job
// `test-prod`. `tests/e2e/comptes-persistants.js` y substitue un jeu nommé,
// borné, réutilisé. Ce banc le prouve sur un faux Supabase en mémoire (GoTrue
// d'administration + PostgREST), avec le VRAI module :
//   ① le premier passage amorce le jeu ; les suivants n'en créent AUCUN ;
//   ② deux workers d'un passage n'ont jamais le même compte ; le jeu est borné ;
//   ③ un compte repris paraît neuf : contenus purgés, métadonnées vidées ;
//   ④ le bail : un autre passage vivant est nommé (poste) ou repris (CI) ;
//   ⑤ aucune purge ni nettoyage de suite ne supprime un compte du jeu ;
//   ⑥ jamais en production ;
//   ⑦ STATIQUE : les seuls comptes jetables d'un passage sont inscrits ici,
//      avec leur raison, et aucune suite du projet `prod` ne crée de compte
//      par un autre chemin.
// ⑧ rejoue les mutations qui rouvriraient la fuite.
// ═══════════════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const jeu = require("../e2e/comptes-persistants.js");

const STAGING = "https://abcdefghijklmnopqrst.supabase.co";
const CFG = { url: STAGING, cle: "service-synthetique" };
const ENV_CI = (run, extra = {}) => ({ CI: "1", GITHUB_RUN_ID: String(run), GITHUB_RUN_ATTEMPT: "1", GITHUB_JOB: "test-prod",
  PASSIO_SUPABASE_URL: STAGING, PASSIO_SUPABASE_ANON: "anon-synthetique", ...extra });

/** Faux Supabase : GoTrue d'administration et PostgREST, en mémoire. */
function fauxSupabase() {
  jeu._cache.clear();   // un faux projet neuf = un processus neuf
  const users = new Map();
  const journal = { creations: 0, suppressionsCompte: [], deletes: [], puts: 0 };
  let seq = 0;
  const json = (status, corps) => ({ ok: status < 300, status, json: async () => corps, text: async () => JSON.stringify(corps) });
  const fusion = (cible, maj) => { const o = { ...(cible || {}) }; for (const [k, v] of Object.entries(maj || {})) { if (v === null) delete o[k]; else o[k] = v; } return o; };
  async function f(url, opts = {}) {
    const u = new URL(url);
    const m = (opts.method || "GET").toUpperCase();
    assert.ok(url.startsWith(STAGING), "aucun appel hors de la cible : " + url);
    if (u.pathname === "/auth/v1/admin/users" && m === "GET") {
      const page = Number(u.searchParams.get("page") || 1), per = Number(u.searchParams.get("per_page") || 50);
      return json(200, { users: [...users.values()].slice((page - 1) * per, page * per).map((x) => structuredClone(x)) });
    }
    if (u.pathname === "/auth/v1/admin/users" && m === "POST") {
      const b = JSON.parse(opts.body);
      if ([...users.values()].some((x) => x.email === b.email)) return json(422, { msg: "email_exists" });
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
      users.set(id, { id, email: b.email, app_metadata: { provider: "email" }, user_metadata: { email_verified: true } });
      journal.creations++;
      return json(200, { id });
    }
    const mu = /^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/.exec(u.pathname);
    if (mu) {
      const x = users.get(mu[1]);
      if (m === "GET") return x ? json(200, structuredClone(x)) : json(404, {});
      if (m === "PUT") {
        const b = JSON.parse(opts.body); journal.puts++;
        if (b.app_metadata) x.app_metadata = fusion(x.app_metadata, b.app_metadata);
        if (b.user_metadata) x.user_metadata = fusion(x.user_metadata, b.user_metadata);
        return json(200, structuredClone(x));
      }
      if (m === "DELETE") { journal.suppressionsCompte.push(x && x.email); users.delete(mu[1]); return json(200, {}); }
    }
    if (u.pathname.startsWith("/rest/v1/")) {
      const table = u.pathname.slice("/rest/v1/".length);
      if (m === "GET") return json(200, []);
      if (m === "DELETE") { journal.deletes.push(`${table}?${u.search.slice(1)}`); return json(204, null); }
    }
    throw new Error(`appel inattendu : ${m} ${url}`);
  }
  return { f, users, journal };
}

/** Un test Playwright : n comptes acquis à la suite, comme les suites le font. */
async function jouerTest(sb, env, w, cleTest, n) {
  const pris = [];
  for (let i = 0; i < n; i++) {
    pris.push(await jeu.acquerirComptePersistant(CFG, { fetch: sb.f, env, parallele: w, cleTest, attendre: async () => {}, journal: () => {} }));
  }
  return pris;
}

// Profil d'un passage `test-prod` : comptes par test, mesuré dans les suites
// le 2026-11-23 (authz 2, blocage 2, irl-ts 3, horodatage 1, multi-comptes
// 2×6+3, confidentialité 3×5, poussée 3, retrait 2, épingle 2).
const PROFIL = [2, 2, 3, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2];

/** Un passage CI : deux workers (chacun son processus, donc son cache), un essai rejoué. */
async function passageCI(sb, run) {
  const env = ENV_CI(run);
  const fournis = [];
  for (const w of [0, 1]) {
    jeu._cache.clear();
    const miens = PROFIL.filter((_, i) => i % 2 === w);
    for (const [i, n] of miens.entries()) {
      const comptes = await jouerTest(sb, { ...env, TEST_PARALLEL_INDEX: String(w) }, w, `${run}:${w}:${i}#0`, n);
      assert.equal(new Set(comptes.map((c) => c.id)).size, n, "un test n'a jamais deux fois le même compte");
      fournis.push(...comptes.map((c) => ({ ...c, w })));
    }
    // L'essai rejoué d'un test : nouveau worker, même index parallèle.
    jeu._cache.clear();
    fournis.push(...(await jouerTest(sb, { ...env, TEST_PARALLEL_INDEX: String(w) }, w, `${run}:${w}:0#1`, 3)).map((c) => ({ ...c, w })));
  }
  await jeu.libererBaux(CFG, jeu.passage(env), sb.f);
  return fournis;
}

test("① le premier passage amorce le jeu ; les suivants ne créent AUCUN compte", async () => {
  const sb = fauxSupabase();
  const premier = await passageCI(sb, 101);
  const amorces = sb.journal.creations;
  assert.ok(amorces > 0 && amorces <= 6, `amorçage borné : 2 workers × 3 comptes au plus (lu : ${amorces})`);
  assert.equal(premier.filter((c) => c.cree).length, amorces);

  for (const run of [102, 103, 104]) {
    const avant = sb.journal.creations;
    const fournis = await passageCI(sb, run);
    assert.equal(sb.journal.creations - avant, 0, `passage ${run} : aucun compte créé une fois le jeu amorcé`);
    assert.ok(fournis.length >= PROFIL.reduce((a, b) => a + b, 0), "et pourtant chaque test a eu ses comptes");
    assert.ok(fournis.every((c) => !c.cree));
  }
  assert.deepEqual(sb.journal.suppressionsCompte, [], "aucun compte du jeu n'est jamais supprimé");
});

test("② deux workers n'ont jamais le même compte ; adresses nommées et stables", async () => {
  const sb = fauxSupabase();
  const fournis = await passageCI(sb, 201);
  const parWorker = [0, 1].map((w) => new Set(fournis.filter((c) => c.w === w).map((c) => c.id)));
  for (const id of parWorker[0]) assert.ok(!parWorker[1].has(id), "un compte n'appartient qu'à un index parallèle");
  for (const c of fournis) assert.match(c.email, /^e2e_ci_[01]_[0-2]@fixe\.passio-e2e\.test$/);
  const second = await passageCI(sb, 202);
  assert.deepEqual([...new Set(second.map((c) => c.email))].sort(), [...new Set(fournis.map((c) => c.email))].sort(), "les mêmes noms, d'un passage à l'autre");
});

test("③ un compte repris paraît neuf : contenus purgés, user_metadata vidé", async () => {
  const sb = fauxSupabase();
  const [c] = await jouerTest(sb, ENV_CI(301), 0, "t#0", 1);
  const u = sb.users.get(c.id);
  u.user_metadata = { ...u.user_metadata, name: "Ancien nom", birth_year: 1990, cgu_accepted_at: "x", invite_de: "y" };
  sb.journal.deletes.length = 0;
  await jouerTest(sb, ENV_CI(302), 0, "t2#0", 1);
  assert.deepEqual(sb.users.get(c.id).user_metadata, { email_verified: true }, "nom, année, CGU, invitation retirés ; ce que pose GoTrue reste");
  const tables = new Set(sb.journal.deletes.map((d) => d.split("?")[0]));
  for (const { table } of jeu.TABLES_CONTENU) assert.ok(tables.has(table), `${table} purgée à l'acquisition`);
  for (const t of ["conv_messages", "conv_reads", "conv_members", "conversations"]) assert.ok(tables.has(t), `${t} purgée`);
  assert.ok(sb.journal.deletes.every((d) => d.includes(c.id)), "chaque purge vise CE compte");
  const ordre = sb.journal.deletes.map((d) => d.split("?")[0]);
  for (const enfant of ["conv_members", "conv_messages", "posts", "stories", "post_comments"]) {
    assert.ok(ordre.indexOf(enfant) < ordre.indexOf("profiles"), `${enfant} avant profiles (NO ACTION)`);
  }
  assert.ok(ordre.indexOf("conv_members") < ordre.indexOf("conversations"), "conv_members avant conversations (NO ACTION)");
  assert.ok(ordre.includes("user_safety"), "la majorité déclarée ne survit pas d'un passage à l'autre");
});

test("④ le bail : nommé hors CI, repris en CI, libéré par son passage", async () => {
  const sb = fauxSupabase();
  const [c] = await jouerTest(sb, ENV_CI(401), 0, "a#0", 1);   // bail vivant du passage ci-401
  const poste = { PASSIO_SUPABASE_URL: STAGING, PASSIO_SUPABASE_ANON: "x", PASSIO_E2E_PASSAGE: "poste-autre" };
  // Couloir `poste` : le compte d'adresse ci_… n'est pas le sien ; on force la collision sur le même id.
  const u = sb.users.get(c.id);
  await assert.rejects(jeu.poserBail(CFG, c.id, { f: sb.f, env: poste, maintenant: Date.now, attendre: async () => {}, journal: () => {} }),
    /compte tenu par le passage « ci-401-1-test-prod »/);
  // Couloir `ci` : le groupe GitHub garantit que l'autre est mort — repris, et dit.
  const dits = [];
  await jeu.poserBail(CFG, c.id, { f: sb.f, env: ENV_CI(402), maintenant: Date.now, attendre: async () => {}, journal: (m) => dits.push(m) });
  assert.match(dits.join(), /bail repris au passage « ci-401-1-test-prod »/);
  assert.equal(u.app_metadata.e2e_bail.passage, "ci-402-1-test-prod");
  // Bail expiré : repris sans bruit, même hors CI.
  await jeu.poserBail(CFG, c.id, { f: sb.f, env: poste, maintenant: () => Date.now() + jeu.DUREE_BAIL_MS + 1, attendre: async () => {}, journal: () => {} });
  // Un autre écrivain dans la fenêtre de relecture : détecté.
  await assert.rejects(jeu.poserBail(CFG, c.id, { f: sb.f, env: ENV_CI(403), maintenant: Date.now,
    attendre: async () => { u.app_metadata.e2e_bail = { passage: "intrus", jeton: "autre", jusqua: Date.now() + 1e6 }; }, journal: () => {} }),
  /bail disputé par le passage « intrus »/);
  // Libération : seulement les siens.
  u.app_metadata.e2e_bail = { passage: "ci-404-1-test-prod", jeton: "j", jusqua: Date.now() + 1e6 };
  assert.equal(await jeu.libererBaux(CFG, "ci-405-1-test-prod", sb.f), 0);
  assert.equal(await jeu.libererBaux(CFG, "ci-404-1-test-prod", sb.f), 1);
  assert.equal(u.app_metadata.e2e_bail, undefined);
  assert.equal(u.app_metadata.provider, "email", "le reste de app_metadata est intact");
});

test("④ bis un passage local mort (même poste, processus disparu) ne bloque pas", () => {
  const vivant = { passage: `poste-${process.pid}`, hote: "h" };
  assert.equal(jeu.passageMort(vivant, "h"), false, "processus vivant : tenu");
  assert.equal(jeu.passageMort({ passage: "poste-999999999", hote: "h" }, "h"), true, "processus disparu : libre");
  assert.equal(jeu.passageMort({ passage: "poste-999999999", hote: "autre" }, "h"), false, "autre poste : on ne sait pas, donc tenu");
  assert.equal(jeu.passageMort({ passage: "ci-1-1-x", hote: "h" }, "h"), false);
});

test("⑤ aucune purge par motif ni nettoyage de suite ne touche un compte du jeu", async () => {
  const email = jeu.emailPersistant("ci", 0, 0);
  // Les deux prédicats RÉELS des purges par motif, lus dans leurs fichiers.
  const rest = fs.readFileSync(path.join(RACINE, "scripts/purge-e2e-rest.js"), "utf8");
  const sql = fs.readFileSync(path.join(RACINE, "scripts/purge_e2e_accounts.sql"), "utf8");
  assert.match(rest, /u\.email\.toLowerCase\(\)\.endsWith\("@" \+ DOMAINE_E2E\)/, "purge REST : suffixe EXACT (un includes prendrait le jeu)");
  assert.match(sql, /where email like '%@passio-e2e\.test'/, "purge SQL : suffixe EXACT");
  assert.equal(email.endsWith("@passio-e2e.test"), false, "le prédicat REST ne prend pas le jeu");
  assert.equal(/^.*@passio-e2e\.test$/.test(email), false, "le prédicat SQL (like) ne prend pas le jeu");
  assert.equal(jeu.estPersistant(email), true);
  assert.equal(jeu.estPersistant("e2e_x_1@passio-e2e.test"), false);
  // Le nettoyage en fin de suite : un jetable part, un compte du jeu reste.
  const sb = fauxSupabase();
  const [c] = await jouerTest(sb, ENV_CI(501), 0, "s#0", 1);
  await sb.f(`${STAGING}/auth/v1/admin/users`, { method: "POST", body: JSON.stringify({ email: "e2e_suppr_1@passio-e2e.test" }) });
  const jetable = [...sb.users.values()].find((x) => x.email === "e2e_suppr_1@passio-e2e.test").id;
  await jeu.supprimerComptesJetables(CFG, [c.id, jetable], sb.f);
  assert.deepEqual(sb.journal.suppressionsCompte, ["e2e_suppr_1@passio-e2e.test"]);
  assert.ok(sb.users.has(c.id));
});

test("⑥ jamais en production, jamais sans cible explicite, opt-out respecté", () => {
  const src = fs.readFileSync(path.join(RACINE, "js/app-08-ui-modals-tour.js"), "utf8");
  const prod = /const\s+SUPABASE_URL\s*=[^;\n]*?"(https:\/\/[a-z]{20}\.supabase\.co)"/.exec(src)[1];
  const cible = (url) => ({ PASSIO_SUPABASE_URL: url, PASSIO_SUPABASE_ANON: "a" });
  assert.equal(jeu.jeuActif(CFG, cible(STAGING)), true, "staging explicite : actif");
  assert.equal(jeu.jeuActif({ url: prod, cle: "k" }, cible(prod)), false, "production, même désignée comme cible : inactif");
  assert.equal(jeu.jeuActif({ url: prod, cle: "k" }, {}), false, "barrière `rls-prod` (sans cible) : comptes jetables comme avant");
  assert.equal(jeu.jeuActif(CFG, { ...cible(STAGING), PASSIO_E2E_COMPTES_JETABLES: "1" }), false, "opt-out");
  assert.equal(jeu.jeuActif({ url: prod, cle: "k" }, cible(STAGING)), false, "clé de service d'un autre projet que la cible : inactif");
  assert.equal(jeu.jeuActif(null, cible(STAGING)), false);
});

// ── ⑦ STATIQUE ────────────────────────────────────────────────────────────
// Les SEULS appels qui demandent un compte jetable, avec leur raison. Ajouter
// une ligne ici, c'est ajouter des MAU à chaque passage : il faut la justifier.
const JETABLES_INSCRITS = {
  "tests/e2e/suppression-compte.spec.js": "détruit son compte par la vraie Edge Function : un compte du jeu n'y survivrait pas (1 par passage)",
  "tests/e2e/qa-helper.js": "préfixe propre à une séance (village, opt-in PASSIO_E2E_VILLAGE) : purgé par ce préfixe ; le préfixe par défaut prend le jeu",
};
// Les suites qui créent ou suppriment des comptes PAR ELLES-MÊMES (opt-in, hors
// passage CI), et pourquoi elles restent hors du jeu.
const CHEMINS_PROPRES_INSCRITS = {
  "village-10-comptes.spec.js": "opt-in PASSIO_E2E_VILLAGE (jamais en CI) ; comptes jetables à préfixe de séance — le passer au jeu est la suite de la décision 4",
  "village-100-hybride.spec.js": "opt-in PASSIO_E2E_VILLAGE100 (jamais en CI, #1018) ; ses 4 yeux sont créés par l'API d'administration et purgés par campagne — même suite de la décision 4",
};
const CREATION_DIRECTE = [/auth\/v1\/admin\/users[`'"]\s*,\s*\{\s*method:\s*["']POST/, /\bauth\s*\.\s*signUp\s*\(/, /auth\/v1\/signup/];
const SUPPRESSION_DIRECTE = /auth\/v1\/admin\/users\/["'`]?\s*\+|admin\/users\/\$\{[^}]+\}`\s*,\s*\{\s*method:\s*["']DELETE/;

function fichiersJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiersJs(p));
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(RACINE, p).split(path.sep).join("/");
function suitesProd() {
  const src = fs.readFileSync(path.join(RACINE, "playwright.config.js"), "utf8");
  return [.../const SUITES_PROD = \[([\s\S]*?)\];/.exec(src)[1].matchAll(/"([^"]+\.spec\.js)"/g)].map((m) => m[1]);
}

/** Les appels qui demandent un jetable, fichier par fichier. */
function demandesJetables(fichiers) {
  const out = {};
  for (const [f, s] of Object.entries(fichiers)) {
    if (/jetable\s*:/.test(s.replace(/^\s*\/\/.*$/gm, "").replace(/options\s*&&\s*options\.jetable/g, ""))
      && /creerCompteE2E\s*\([^)]*jetable\s*:/.test(s)) out[f] = true;
  }
  return out;
}

function lireDepot() {
  const t = {};
  for (const p of [...fichiersJs(path.join(RACINE, "tests/e2e")), ...fichiersJs(path.join(RACINE, "scripts"))]) t[rel(p)] = fs.readFileSync(p, "utf8");
  return t;
}

/** Le code seul : un commentaire qui RACONTE l’ancien chemin n’est pas un appel. */
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function auditerChemins(fichiers, suites) {
  const defauts = [];
  for (const f of Object.keys(demandesJetables(fichiers))) {
    if (!JETABLES_INSCRITS[f]) defauts.push(`${f} : demande un compte jetable sans être inscrit (chaque jetable est un MAU par passage)`);
  }
  for (const s of suites) {
    const f = `tests/e2e/${s}`;
    const src = fichiers[f] && sansCommentaires(fichiers[f]);
    if (!src || CHEMINS_PROPRES_INSCRITS[s]) continue;
    if (CREATION_DIRECTE.some((r) => r.test(src))) defauts.push(`${f} : crée un compte sans passer par creerCompteE2E (le jeu persistant)`);
    if (SUPPRESSION_DIRECTE.test(src)) defauts.push(`${f} : supprime un compte en direct — passer par supprimerComptesJetables, qui épargne le jeu`);
  }
  return defauts;
}

test("⑦ les seuls jetables d'un passage sont inscrits ; aucune suite `prod` ne crée de compte en direct", () => {
  const fichiers = lireDepot();
  const suites = suitesProd();
  assert.ok(suites.includes("authz-critical.spec.js") && suites.length >= 10, "SUITES_PROD lu");
  assert.deepEqual(auditerChemins(fichiers, suites), []);
  assert.deepEqual(Object.keys(demandesJetables(fichiers)).sort(), Object.keys(JETABLES_INSCRITS).sort(), "chaque inscription correspond à un appel réel");
  for (const s of Object.keys(CHEMINS_PROPRES_INSCRITS)) assert.ok(suites.includes(s), `${s} existe toujours dans SUITES_PROD`);
  // Le seul point d'entrée : creerCompteE2E prend le jeu quand il est actif.
  const helper = fichiers["tests/e2e/compte-e2e.js"];
  assert.match(helper, /if \(jeu\.jeuActif\(cfg\)\) \{\s*const c = await jeu\.acquerirComptePersistant\(cfg\);/);
});

test("⑧ MUTATIONS : chacune rouvre la fuite, et le banc rougit", () => {
  const fichiers = lireDepot();
  const suites = suitesProd();
  const muter = (f, avant, apres) => {
    assert.ok(fichiers[f].includes(avant), `mutation applicable à ${f}`);
    return { ...fichiers, [f]: fichiers[f].replace(avant, () => apres) };
  };
  // Une suite du passage CI repasse aux jetables.
  const m1 = muter("tests/e2e/authz-critical.spec.js", `creerCompteE2E(page, "authz_a")`, `creerCompteE2E(page, "authz_a", { jetable: true })`);
  assert.match(auditerChemins(m1, suites).join(), /authz-critical\.spec\.js : demande un compte jetable sans être inscrit/);
  // Une suite recommence à supprimer ses comptes en direct (elle effacerait le jeu).
  const m2 = muter("tests/e2e/epingle-commentaire-reel.spec.js", "await supprimerComptesJetables(cfg, uids);",
    `for (const u of uids) await fetch(cfg.url + "/auth/v1/admin/users/" + u, { method: "DELETE", headers: entetes });`);
  assert.match(auditerChemins(m2, suites).join(), /epingle-commentaire-reel\.spec\.js : supprime un compte en direct/);
  // Une suite s'inscrit par le SDK.
  const m3 = muter("tests/e2e/blocage-acces.spec.js", `creerCompteE2E(page, "bloc_b")`, `page.evaluate(() => supa.auth.signUp({ email: "x", password: "y" }))`);
  assert.match(auditerChemins(m3, suites).join(), /blocage-acces\.spec\.js : crée un compte sans passer par creerCompteE2E/);

});
