// ═══════════════════════════════════════════════════════════════════════════
// GARDES APPLIQUÉES — sur un VRAI serveur, pas sur la lecture de son code.
//
// `routes-caps.test.js` fige la garde DÉCLARÉE dans `server/index.js`, et son
// en-tête dit honnêtement ce qu'il ne prouve pas : le fichier n'est pas
// importable (il appelle `app.listen` au chargement), donc l'inventaire est lu
// dans la source. Une garde correctement déclarée mais neutralisée en amont — un
// middleware global qui injecterait une session, un ordre de `app.use` inversé —
// resterait invisible.
//
// Ce fichier ferme cet écart en démarrant l'application pour de vrai : quatre
// comptes de rôles différents, et chacune des 81 routes interrogée avec un rôle
// qui n'a PAS la capacité exigée. Le serveur doit refuser.
//
// ⚠️ MÉTHODE. On ne teste que le sens du REFUS. Appeler les routes de mutation
// « pour voir » lancerait des suites de tests, créerait des branches git,
// supprimerait des comptes : une requête refusée, elle, n'atteint jamais le
// gestionnaire. Le serveur est en plus démarré sans Supabase, sans mutations
// autorisées, sur un dossier de données jetable et un port éphémère.
// ═══════════════════════════════════════════════════════════════════════════
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { parseRoutes, cheminConcret } from "./aide-routes.js";
import { demarrerServeur } from "./aide-serveur.js";
import { capsFor } from "../server/auth.js";

let serveur = null;
const cookies = {};

function appeler(route, cookie) {
  return fetch(serveur.base + cheminConcret(route.route), {
    method: route.method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: ["GET", "HEAD"].includes(route.method) ? undefined : "{}",
  });
}

/** Un rôle qui n'a PAS la capacité exigée par cette route. */
function roleSansCapacite(cap) {
  for (const [user, role] of [["obs_test", "observer"], ["testeur_test", "tester"], ["dev_test", "developer"]]) {
    if (!capsFor(role).includes(cap)) return user;
  }
  return null;   // capacité que tous les rôles possèdent : rien à prouver ici
}

before(async () => {
  serveur = await demarrerServeur();
  for (const u of ["admin_test", "dev_test", "testeur_test", "obs_test"]) cookies[u] = await serveur.cookieDe(u);
}, { timeout: 60_000 });

after(() => serveur?.arreter());

test("le serveur démarre sans Supabase et sans mutations autorisées", async () => {
  const r = await fetch(`${serveur.base}/api/health`);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.supabase, false, "aucun accès production dans un test");

  const me = await (await fetch(`${serveur.base}/api/me`, { headers: { cookie: cookies.admin_test } })).json();
  assert.equal(me.role, "admin");
  assert.equal(me.allowMutations, false, "les mutations doivent rester coupées");
});

test("sans session, toute route non publique répond 401", async () => {
  const publiques = new Set(["GET /health", "POST /login", "POST /logout", "GET /me"]);
  const routes = parseRoutes().filter((r) => !publiques.has(`${r.method} ${r.route}`));
  assert.ok(routes.length > 70, "l'inventaire doit être complet");

  for (const r of routes) {
    const rep = await appeler(r, null);
    assert.equal(rep.status, 401,
      `${r.method} ${r.route} répond ${rep.status} sans session — une garde est contournée`);
  }
});

test("chaque capacité est réellement appliquée par le serveur", async () => {
  const routes = parseRoutes().filter((r) => r.guard !== "@public" && r.guard !== "@auth");
  assert.ok(routes.length > 25, "il doit rester des routes à capacité");

  let verifiees = 0;
  for (const r of routes) {
    const user = roleSansCapacite(r.guard);
    if (!user) continue;
    verifiees++;
    const rep = await appeler(r, cookies[user]);
    assert.equal(rep.status, 403,
      `${r.method} ${r.route} (capacité \`${r.guard}\`) répond ${rep.status} pour ${user} — ` +
      "la garde est déclarée mais pas appliquée");
  }
  assert.ok(verifiees > 25, `trop peu de routes réellement éprouvées : ${verifiees}`);
});

test("un observateur lit les vues d'ensemble, et rien de plus", async () => {
  // Le rôle le plus faible doit pouvoir REGARDER : un pilotage qu'on ne peut pas
  // ouvrir sans être admin n'est pas un pilotage partageable.
  for (const chemin of ["/api/overview", "/api/alerts", "/api/traces", "/api/bugs", "/api/readiness"]) {
    const rep = await fetch(serveur.base + chemin, { headers: { cookie: cookies.obs_test } });
    assert.equal(rep.status, 200, `${chemin} devrait être lisible par un observateur`);
  }
  // …mais rien qui touche la base, le dépôt, les diagnostics ou le journal.
  for (const chemin of ["/api/database", "/api/reconcile", "/api/git/status", "/api/sentinel", "/api/audit"]) {
    const rep = await fetch(serveur.base + chemin, { headers: { cookie: cookies.obs_test } });
    assert.equal(rep.status, 403, `${chemin} ne doit pas être lisible par un observateur`);
  }
});

test("l'intégrité n'est pas lisible par la bande via /api/diagnose", async () => {
  // Le défaut historique : `/diagnose` est ouvert à tout compte authentifié et
  // EMBARQUE le rapport d'intégrité. Ici on l'exerce pour de vrai.
  const rep = await fetch(`${serveur.base}/api/diagnose`, { headers: { cookie: cookies.testeur_test } });
  assert.equal(rep.status, 200, "le diagnostic lui-même reste accessible");
  const j = await rep.json();
  assert.equal(j.summary.integrityEvaluated, false,
    "un testeur n'a pas la capacité `db` : l'intégrité ne doit pas être calculée");
  assert.equal(j.summary.integrityAnomalies, null, "…et aucun compte d'anomalie ne doit fuiter");
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(j.prompt || ""),
    "aucun identifiant de base ne doit apparaître dans le prompt rendu à ce rôle");
});

test("un mot de passe faux est refusé, et la session est signée", async () => {
  const r = await fetch(`${serveur.base}/api/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: "admin_test", password: "pas-le-bon" }),
  });
  assert.ok([401, 429].includes(r.status), `mot de passe faux accepté (${r.status})`);

  // Un cookie fabriqué à la main ne doit ouvrir aucune porte.
  const faux = await fetch(`${serveur.base}/api/overview`, {
    headers: { cookie: "dash_session=admin_test.admin.9999999999.signature-inventee" },
  });
  assert.equal(faux.status, 401, "une session non signée doit être rejetée");
});
