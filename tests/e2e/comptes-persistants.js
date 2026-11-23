// ═══════════════════════════════════════════════════════════════════════════
// COMPTES PERSISTANTS — le jeu nommé que réutilisent les suites au STAGING
// (ADR-013, décision 4 ; D16-01, 2026-11-23).
//
// ⚠️ POURQUOI. Le staging partage les quotas de l'ORGANISATION Supabase avec la
// production. Au 20/11, il consommait 35 % des utilisateurs actifs mensuels
// (MAU) : chaque passage du job `test-prod` créait ~48 comptes jetables, le
// canari de la sentinelle 2 toutes les 4 h — et un compte créé puis connecté
// compte pour un MAU, même supprimé dans la minute. Un compte RÉUTILISÉ, lui,
// ne compte qu'une fois par mois.
//
// LE JEU. `e2e_<couloir>_<parallèle>_<rang>@fixe.passio-e2e.test` :
//   • couloir  : `ci` en CI, `poste` ailleurs — un passage local ne prend
//                jamais un compte de la CI, ni l'inverse ;
//   • parallèle: `TEST_PARALLEL_INDEX` de Playwright — deux workers d'un même
//                passage n'ont JAMAIS le même compte, par construction ;
//   • rang     : l'ordre d'acquisition DANS le test courant (remis à 0 à
//                chaque test) — trois comptes dans un test = rangs 0, 1, 2.
// Le jeu est donc BORNÉ (CI : 2 workers × 3 comptes au plus par test = 6), et
// il s'amorce tout seul : un compte absent est créé UNE fois, puis réutilisé.
//
// ⚠️ LE DOMAINE EST UN SOUS-DOMAINE, ET C'EST LA SÉCURITÉ DU JEU. Toutes les
// purges par motif exigent le suffixe EXACT `@passio-e2e.test`
// (`purge-e2e-rest.js` : `endsWith("@" + DOMAINE_E2E)` ; le SQL :
// `like '%@passio-e2e.test'`). `x@fixe.passio-e2e.test` n'y répond pas : aucune
// purge existante ne peut supprimer un compte du jeu. Les comptes ne sont
// JAMAIS supprimés ; seuls leurs CONTENUS le sont (`purgerContenusCompte`).
//
// UN COMPTE REPRIS DOIT PARAÎTRE NEUF. À chaque acquisition : ses lignes de 36
// tables sont effacées (liste mesurée sur la structure réelle le 2026-11-23,
// clés étrangères comprises), son `user_metadata` est vidé (nom, année, CGU,
// invitation : l'app les relit à chaque session) — sinon le test suivant
// hériterait d'une majorité déclarée (`user_safety` : « une date de majorité ne
// recule jamais ») ou d'un nom déjà choisi.
//
// LE VERROU. Deux passages concurrents ne doivent pas prendre le même compte :
//   ① DANS un passage : la partition (parallèle, rang) l'interdit par construction ;
//   ② ENTRE passages CI : le groupe GitHub `passio-e2e-prod` (test-prod ET
//      sentinelle) n'en laisse tourner qu'un ;
//   ③ ENTRE passages hors CI : un BAIL dans `app_metadata.e2e_bail`
//      ({ passage, jeton, jusqua }), que seule la clé service_role écrit. Un bail
//      vivant d'un autre passage fait ÉCHOUER l'acquisition en le nommant ; en
//      couloir `ci` il est repris (② garantit que son passage est mort : une
//      suite coupée par son délai). Le bail est relu après écriture : un autre
//      écrivain dans la fenêtre est détecté. Le teardown libère ses baux.
//
// ⚠️ PORTÉE. Actif seulement quand le banc vise EXPLICITEMENT un autre projet
// que la production (`PASSIO_SUPABASE_URL` + `PASSIO_SUPABASE_ANON`, SUP-04) :
// la barrière production (`rls-prod`) garde ses comptes jetables, purgés par son
// teardown — un compte persistant en production serait un profil de test
// durable parmi les vrais. `PASSIO_E2E_COMPTES_JETABLES=1` rend l'ancien
// comportement partout.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const crypto = require("node:crypto");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const DOMAINE_PERSISTANT = "fixe.passio-e2e.test";
const MDP_PERSISTANT = "Passio-e2e-12345!";        // déjà public : celui des comptes jetables (compte-e2e.js)
const DUREE_BAIL_MS = 15 * 60 * 1000;              // > la plus longue suite (150 s) × les tests d'un fichier
const RELECTURE_BAIL_MS = 400;
const RACINE = path.resolve(__dirname, "..", "..");
const JOURNAL = path.join(RACINE, "test-results", "comptes-e2e.jsonl");

// Métadonnées que GoTrue pose lui-même : on ne les retire pas.
const META_SYSTEME = new Set(["email", "email_verified", "phone_verified", "sub"]);

// ⚠️ ORDRE DES ENFANTS VERS LES PARENTS — mesuré sur la structure réelle
// (pg_constraint, 2026-11-23). `conv_members`/`conv_messages` → `conversations`,
// et `posts`/`stories`/`post_comments`/`conv_*` → `profiles` sont en NO ACTION :
// les remonter d'un cran rend un 23503. Les tables `cdv_*` sont conservées
// mais plus écrites (ADR-011) : une table absente est tolérée, une colonne
// absente non (la liste serait fausse, et ses lignes resteraient en silence).
// `comptes_en_suppression` n'est pas listée : service_role n'y a pas DELETE, et
// un compte du jeu n'y entre jamais (`suppression-compte` prend un jetable).
// Les journaux (`analytics_events`, `telemetry_events`, `client_errors`,
// `activite_jour`) ne sont pas un état que relit l'app : ils restent.
const TABLES_CONTENU = [
  { table: "call_invites",         colonnes: ["from_id", "to_id"] },
  { table: "notifications",        colonnes: ["user_id", "from_id"] },
  { table: "comment_likes",        colonnes: ["user_id"] },
  { table: "comment_interactions", colonnes: ["user_id"] },
  { table: "step_interactions",    colonnes: ["user_id"] },
  { table: "post_comments",        colonnes: ["author_id"] },
  { table: "post_likes",           colonnes: ["user_id"] },
  { table: "post_collaborators",   colonnes: ["user_id", "added_by"] },
  { table: "follows",              colonnes: ["follower_id", "following_id"] },
  { table: "story_views",          colonnes: ["user_id"] },
  { table: "story_likes",          colonnes: ["user_id"] },
  { table: "story_comments",       colonnes: ["author_id"] },
  { table: "posts",                colonnes: ["author_id"] },
  { table: "stories",              colonnes: ["author_id"] },
  { table: "event_comments",       colonnes: ["author_id"] },
  { table: "event_attendees",      colonnes: ["user_id"] },
  { table: "event_reactions",      colonnes: ["user_id"] },
  { table: "pointage_essais",      colonnes: ["user_id"] },
  { table: "events",               colonnes: ["author_id", "organizer_id"] },
  { table: "cdv_live_comments",    colonnes: ["author_id"] },
  { table: "cdv_live_reactions",   colonnes: ["user_id"] },
  { table: "cdv_live_followers",   colonnes: ["user_id"] },
  { table: "cdv_live_collaborators", colonnes: ["user_id", "added_by"] },
  { table: "cdv_lives",            colonnes: ["author_id"] },
  { table: "blocks",               colonnes: ["blocker_id", "blocked_id"] },
  { table: "reports",              colonnes: ["reporter_id"] },
  { table: "push_subscriptions",   colonnes: ["user_id"] },
  { table: "passion_requests",     colonnes: ["user_id"] },
  { table: "user_passions",        colonnes: ["user_id"] },
  { table: "user_safety",          colonnes: ["user_id"] },
  { table: "user_state",           colonnes: ["user_id"] },
  { table: "profiles",             colonnes: ["id"] },
];

const entetes = (cfg, extra) => Object.assign({ apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json" }, extra || {});

/** L'URL de PRODUCTION, lue dans l'app elle-même (jamais recopiée ici). */
function urlProduction() {
  try {
    const src = fs.readFileSync(path.join(RACINE, "js", "app-08-ui-modals-tour.js"), "utf8");
    const m = /const\s+SUPABASE_URL\s*=[^;\n]*?"(https:\/\/[a-z]{20}\.supabase\.co)"/.exec(src);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

/** Le jeu s'applique-t-il ? Cible explicite, différente de la production, et pas d'opt-out. */
function jeuActif(cfg, env = process.env) {
  if (!cfg || env.PASSIO_E2E_COMPTES_JETABLES === "1") return false;
  const url = String(env.PASSIO_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (!url || !String(env.PASSIO_SUPABASE_ANON || "").trim()) return false;
  if (url !== cfg.url) return false;                 // la clé de service n'est pas celle de la cible
  const prod = urlProduction();
  return !prod || url !== prod;                      // jamais en production, même mal configuré
}

function couloir(env = process.env) { return env.CI ? "ci" : "poste"; }
/**
 * L'identité du passage, la MÊME dans chaque worker et dans le teardown :
 * en CI le run GitHub ; ailleurs le processus de Playwright (le parent d'un
 * worker, le processus lui-même pour le teardown). `playwright.config.js`
 * n'a pas à la poser.
 */
function passage(env = process.env) {
  if (env.PASSIO_E2E_PASSAGE) return env.PASSIO_E2E_PASSAGE;
  if (env.GITHUB_RUN_ID) return `ci-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT || 1}-${env.GITHUB_JOB || "job"}`;
  return `poste-${env.TEST_WORKER_INDEX !== undefined ? process.ppid : process.pid}`;
}

/** Un passage local mort (même poste, processus disparu) ne tient plus rien. */
// Le poste n’est jamais écrit en clair dans le bail : une empreinte suffit à le reconnaître.
function empreintePoste() { return crypto.createHash("sha256").update(os.hostname()).digest("hex").slice(0, 12); }

function passageMort(bail, hote = empreintePoste()) {
  const m = /^poste-(\d+)$/.exec(String((bail && bail.passage) || ""));
  if (!m || bail.hote !== hote) return false;
  try { process.kill(Number(m[1]), 0); return false; } catch (e) { return e && e.code === "ESRCH"; }
}
function parallele(env = process.env) {
  const n = Number(env.TEST_PARALLEL_INDEX);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function emailPersistant(c, p, r) { return `e2e_${c}_${p}_${r}@${DOMAINE_PERSISTANT}`; }
function estPersistant(email) { return typeof email === "string" && email.toLowerCase().endsWith("@" + DOMAINE_PERSISTANT); }

// Rang dans le test courant : remis à 0 dès que le test change (un nouvel essai
// est un nouveau test pour Playwright — et souvent un nouveau worker).
const _rangs = { cle: undefined, suivant: 0 };
function cleDuTestCourant() {
  try {
    const { test } = require("@playwright/test");
    const i = test.info();
    return `${i.testId}#${i.retry}`;
  } catch (e) { return null; }
}
function rangSuivant(cle) {
  if (cle !== _rangs.cle) { _rangs.cle = cle; _rangs.suivant = 0; }
  return _rangs.suivant++;
}

/** Tous les comptes du jeu (l'API d'administration pagine). */
async function comptesDuJeu(cfg, f = fetch) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const r = await f(`${cfg.url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: entetes(cfg) });
    if (!r.ok) throw new Error(`jeu persistant : liste des comptes HTTP ${r.status}`);
    const d = await r.json();
    const lot = (d && d.users) || [];
    for (const u of lot) if (estPersistant(u.email)) out.push(u);
    if (lot.length < 200) break;
  }
  return out;
}

async function lireCompte(cfg, id, f) {
  const r = await f(`${cfg.url}/auth/v1/admin/users/${id}`, { headers: entetes(cfg) });
  if (!r.ok) throw new Error(`jeu persistant : lecture du compte HTTP ${r.status}`);
  return r.json();
}

async function majCompte(cfg, id, corps, f) {
  const r = await f(`${cfg.url}/auth/v1/admin/users/${id}`, { method: "PUT", headers: entetes(cfg), body: JSON.stringify(corps) });
  if (!r.ok) throw new Error(`jeu persistant : mise à jour du compte HTTP ${r.status}`);
  return r.json().catch(() => null);
}

/** Filtre PostgREST : `eq` sur une colonne, `or=(…)` sur plusieurs. */
function filtreCompte(colonnes, id) {
  if (colonnes.length === 1) return `${colonnes[0]}=eq.${id}`;
  return "or=(" + colonnes.map((c) => `${c}.eq.${id}`).join(",") + ")";
}

async function supprimerLignes(cfg, table, filtre, f) {
  const r = await f(`${cfg.url}/rest/v1/${table}?${filtre}`, { method: "DELETE", headers: entetes(cfg, { Prefer: "return=minimal" }) });
  if (r.ok) return;
  const t = await r.text().catch(() => "");
  if (r.status === 404 || /Could not find the table|relation "[^"]+" does not exist/i.test(t)) return;
  throw new Error(`jeu persistant : purge ${table} HTTP ${r.status} ${t.slice(0, 160)}`);
}

/**
 * Efface tout ce que le compte a laissé — jamais le compte. Les conversations
 * qu'il a CRÉÉES partent avec leurs messages et leurs membres (NO ACTION vers
 * `conversations`), y compris ceux d'un autre compte.
 */
async function purgerContenusCompte(cfg, id, f = fetch) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new Error("jeu persistant : identifiant de compte invalide");
  const r = await f(`${cfg.url}/rest/v1/conversations?select=id&created_by=eq.${id}`, { headers: entetes(cfg) });
  if (!r.ok) throw new Error(`jeu persistant : conversations HTTP ${r.status}`);
  const convs = ((await r.json()) || []).map((c) => c.id).filter((x) => typeof x === "string");
  const parConv = convs.length ? `conv_id.in.(${convs.map((c) => `"${c.replace(/"/g, "")}"`).join(",")}),` : "";
  await supprimerLignes(cfg, "conv_messages", `or=(${parConv}from_id.eq.${id})`, f);
  await supprimerLignes(cfg, "conv_reads", `or=(${parConv}user_id.eq.${id})`, f);
  await supprimerLignes(cfg, "conv_members", `or=(${parConv}user_id.eq.${id})`, f);
  await supprimerLignes(cfg, "conversations", `created_by=eq.${id}`, f);
  for (const { table, colonnes } of TABLES_CONTENU) await supprimerLignes(cfg, table, filtreCompte(colonnes, id), f);
}

/** `user_metadata` vidé (sauf ce que pose GoTrue) : nom, année, CGU, invitation. */
async function reinitialiserMetadonnees(cfg, u, f = fetch) {
  const meta = (u && u.user_metadata) || {};
  const aRetirer = {};
  for (const k of Object.keys(meta)) if (!META_SYSTEME.has(k)) aRetirer[k] = null;
  if (Object.keys(aRetirer).length) await majCompte(cfg, u.id, { user_metadata: aRetirer }, f);
}

function _bail(u) { return (u && u.app_metadata && u.app_metadata.e2e_bail) || null; }

/** Pose le bail du passage, ou échoue en nommant celui qui le tient. */
async function poserBail(cfg, id, deps) {
  const { f, env, maintenant, attendre, journal } = deps;
  const moi = passage(env);
  const actuel = _bail(await lireCompte(cfg, id, f));
  if (actuel && actuel.passage !== moi && Number(actuel.jusqua) > maintenant()) {
    if (couloir(env) !== "ci" && !passageMort(actuel)) {
      throw new Error(`jeu persistant : compte tenu par le passage « ${actuel.passage} » jusqu'à ${new Date(Number(actuel.jusqua)).toISOString()} — un autre banc vise le même projet ; attendre, ou PASSIO_E2E_COMPTES_JETABLES=1`);
    }
    journal(`bail repris au passage « ${actuel.passage} », mort (en CI, le groupe passio-e2e-prod le garantit)`);
  }
  const jeton = crypto.randomBytes(8).toString("hex");
  await majCompte(cfg, id, { app_metadata: { e2e_bail: { passage: moi, jeton, hote: empreintePoste(), jusqua: maintenant() + DUREE_BAIL_MS } } }, f);
  await attendre(RELECTURE_BAIL_MS);
  const relu = await lireCompte(cfg, id, f);
  const b = _bail(relu);
  if (!b || b.jeton !== jeton) throw new Error(`jeu persistant : bail disputé par le passage « ${(b && b.passage) || "?"} »`);
  return relu;
}

const _cache = new Map();   // email → id, par processus
async function _trouver(cfg, email, f) {
  if (_cache.has(email)) return _cache.get(email);
  for (const u of await comptesDuJeu(cfg, f)) _cache.set(String(u.email).toLowerCase(), u.id);
  return _cache.get(email) || null;
}

async function _creer(cfg, email, f) {
  const r = await f(`${cfg.url}/auth/v1/admin/users`, {
    method: "POST", headers: entetes(cfg),
    body: JSON.stringify({ email, password: MDP_PERSISTANT, email_confirm: true }),
  });
  const corps = await r.json().catch(() => null);
  if (r.ok && corps && corps.id) { _cache.set(email, corps.id); return corps.id; }
  // Créé entre-temps (autre processus) : on relit, on ne recrée pas.
  if (r.status === 422) { _cache.delete(email); const id = await _trouver(cfg, email, f); if (id) return id; }
  throw new Error(`jeu persistant : amorçage du compte HTTP ${r.status}`);
}

/**
 * Acquiert le compte (couloir, parallèle, rang) : trouvé ou amorcé, bail posé,
 * contenus purgés, métadonnées vidées. Rend { id, email, cree }.
 */
async function acquerirComptePersistant(cfg, opts = {}) {
  const env = opts.env || process.env;
  const deps = {
    f: opts.fetch || fetch,
    env,
    maintenant: opts.maintenant || Date.now,
    attendre: opts.attendre || ((ms) => new Promise((r) => setTimeout(r, ms))),
    journal: opts.journal || ((m) => console.log(`[comptes-e2e] ${m}`)),
  };
  const rang = Number.isInteger(opts.rang) ? opts.rang : rangSuivant(opts.cleTest !== undefined ? opts.cleTest : cleDuTestCourant());
  const email = emailPersistant(couloir(env), Number.isInteger(opts.parallele) ? opts.parallele : parallele(env), rang);
  let id = await _trouver(cfg, email, deps.f);
  let cree = false;
  // Un compte du cache supprimé entre-temps (à la main, au tableau de bord) :
  // on relit la liste une fois avant de conclure qu'il faut l'amorcer.
  if (id && !(await deps.f(`${cfg.url}/auth/v1/admin/users/${id}`, { headers: entetes(cfg) })).ok) {
    _cache.clear();
    id = await _trouver(cfg, email, deps.f);
  }
  if (!id) { id = await _creer(cfg, email, deps.f); cree = true; }
  const u = await poserBail(cfg, id, deps);
  await purgerContenusCompte(cfg, id, deps.f);
  await reinitialiserMetadonnees(cfg, u, deps.f);
  return { id, email, cree };
}

/** Libère les baux du passage (teardown). Les autres ne sont pas touchés. */
async function libererBaux(cfg, moi = passage(), f = fetch) {
  let n = 0;
  for (const u of await comptesDuJeu(cfg, f)) {
    const b = _bail(u);
    if (b && b.passage === moi) { await majCompte(cfg, u.id, { app_metadata: { e2e_bail: null } }, f); n++; }
  }
  return n;
}

/**
 * Supprime les comptes d'une liste d'identifiants — SAUF ceux du jeu. Les
 * suites qui nettoient leurs comptes en fin de test passent par ici : un
 * `DELETE /admin/users/<id>` direct effacerait un compte persistant.
 */
async function supprimerComptesJetables(cfg, ids, f = fetch) {
  for (const id of ids || []) {
    try {
      const r = await f(`${cfg.url}/auth/v1/admin/users/${id}`, { headers: entetes(cfg) });
      if (!r.ok) continue;
      const u = await r.json();
      if (estPersistant(u && u.email)) continue;
      await f(`${cfg.url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: entetes(cfg) });
    } catch (e) { /* nettoyage best-effort : la purge par motif du teardown repasse */ }
  }
}

/** Une ligne par compte fourni à une suite : la mesure « comptes créés par passage ». */
function noterCompte(type, env = process.env) {
  try {
    fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
    fs.appendFileSync(JOURNAL, JSON.stringify({ passage: passage(env), type, t: new Date().toISOString() }) + "\n");
  } catch (e) { /* une mesure ne fait pas échouer une suite */ }
}

/** Bilan du passage : { crees, reutilises, jetables }. */
function bilanPassage(moi = passage()) {
  const b = { crees: 0, reutilises: 0, jetables: 0 };
  try {
    for (const l of fs.readFileSync(JOURNAL, "utf8").split("\n")) {
      if (!l.trim()) continue;
      const e = JSON.parse(l);
      if (e.passage !== moi) continue;
      if (e.type === "cree") b.crees++; else if (e.type === "reutilise") b.reutilises++; else if (e.type === "jetable") b.jetables++;
    }
  } catch (e) { /* pas de journal : aucun compte fourni */ }
  return b;
}

module.exports = {
  DOMAINE_PERSISTANT, TABLES_CONTENU, DUREE_BAIL_MS, JOURNAL,
  jeuActif, couloir, passage, passageMort, parallele, emailPersistant, estPersistant, rangSuivant,
  comptesDuJeu, purgerContenusCompte, reinitialiserMetadonnees, poserBail,
  acquerirComptePersistant, libererBaux, supprimerComptesJetables, noterCompte, bilanPassage,
  _cache,
};
