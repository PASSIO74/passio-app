// ═══════════════════════════════════════════════════════════════════════════
// GARDES DES ROUTES HTTP — l'invariant que la matrice de permissions ne prouve pas.
//
// `auth.test.js` fige la matrice rôle → capacités : il dit que `tester` n'a pas
// `db`. Il ne dit RIEN de la route qui sert l'intégrité. Entre les deux vit
// exactement la fuite déjà survenue une fois : `/api/diagnose`, ouvert à tout
// compte authentifié, EMBARQUE le rapport d'intégrité — un rôle sans `db` lisait
// donc par la bande ce que sa permission lui refuse. La correction est en place ;
// rien ne l'empêchait de disparaître sans faire rougir un seul test.
//
// Ce fichier ferme cet écart par trois voies distinctes :
//
//   1. INVENTAIRE FIGÉ — les 81 routes et leur garde, dans les deux sens : une
//      route qui change de garde rougit, une route AJOUTÉE sans garde déclarée
//      rougit aussi. On ne peut plus élargir une permission en silence.
//   2. COMPORTEMENT RÉEL des gardes — `requireAuth` et `requireCap` sont
//      exécutés (401 sans session, 403 sans la capacité, `next()` sinon). Figer
//      un nom de garde ne servirait à rien si le garde lui-même ne gardait pas.
//   3. INVARIANT DE L'INTÉGRITÉ — toute route dont le corps appelle `reconcile`
//      doit porter la capacité `db`, ou la vérifier elle-même. C'est la règle
//      générale dont `/api/diagnose` n'était qu'un cas ; elle vaut d'avance pour
//      la prochaine route qui embarquera ce rapport.
//
// ⚠️ Ce que ce fichier ne prouve PAS : `server/index.js` démarre le serveur au
// chargement (`app.listen`) et n'est donc pas importable dans un test sans lancer
// un serveur et l'ingestion. L'inventaire est donc lu dans la SOURCE, pas dans
// l'application montée. Conséquence assumée : une route déclarée d'une façon que
// l'analyseur ne reconnaît pas est comptée SANS GARDE — le test rougit alors au
// lieu de laisser passer. Fail-closed : le doute accuse.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import * as auth from "../server/auth.js";
import { SRC, METHODES, parseRoutes } from "./aide-routes.js";

// ─── Inventaire figé ─────────────────────────────────────────────────────────
// Modifier cette table est un GESTE DÉLIBÉRÉ : c'est là qu'on relit ce qu'on
// vient d'ouvrir. Les quatre `@public` sont les seules routes atteignables sans
// session, et chacune se justifie :
//   /health  — sonde de vie, ne rend que ok/env/supabase (aucune donnée) ;
//   /login   — évidemment (limitation des tentatives dans auth.js) ;
//   /logout  — sans session, c'est un no-op ;
//   /me      — se garde elle-même : 401 sans session (vérifié plus bas).
const ATTENDU = [
  ["GET", "/health", "@public"],
  ["POST", "/login", "@public"],
  ["POST", "/logout", "@public"],
  ["GET", "/me", "@public"],
  ["GET", "/stream", "@auth"],
  ["GET", "/overview", "@auth"],
  ["GET", "/timeseries", "@auth"],
  ["GET", "/events", "@auth"],
  ["GET", "/control/command", "@auth"],
  ["GET", "/control/changes", "@auth"],
  ["GET", "/control/history", "@auth"],
  ["GET", "/observation", "@auth"],
  ["POST", "/observation/sse-ack", "@auth"],
  ["GET", "/releases", "@auth"],
  ["GET", "/release-guardian", "@auth"],
  ["GET", "/anomalies", "@auth"],
  ["GET", "/incidents", "@auth"],
  ["POST", "/incidents/:id/transition", "alerts"],
  ["GET", "/interactions", "@auth"],
  ["GET", "/traces", "@auth"],
  ["GET", "/traces/:cid", "@auth"],
  ["GET", "/coverage", "@auth"],
  ["GET", "/reconcile", "db"],
  ["POST", "/reconcile/prompt", "db"],
  ["GET", "/diagnose", "@auth"],
  ["GET", "/links", "@auth"],
  ["GET", "/links/:id", "@auth"],
  ["GET", "/qa-report", "@auth"],
  ["GET", "/kpi", "@auth"],
  ["GET", "/retention", "@auth"],
  ["GET", "/names", "@auth"],
  ["GET", "/signups", "@auth"],
  ["GET", "/accounts", "@auth"],
  ["GET", "/devices", "@auth"],
  ["GET", "/visitors", "@auth"],
  ["GET", "/activity-sessions", "@auth"],
  ["GET", "/journey/:session", "@auth"],
  ["GET", "/bugs", "@auth"],
  ["GET", "/bugs/:id", "@auth"],
  ["PATCH", "/bugs/:id", "sessions"],
  ["GET", "/performance", "@auth"],
  ["GET", "/services", "@auth"],
  ["GET", "/database", "db"],
  ["GET", "/test-sessions", "@auth"],
  ["POST", "/test-sessions", "sessions"],
  ["GET", "/test-sessions/:id", "@auth"],
  ["POST", "/test-sessions/:id/:action", "sessions"],
  ["GET", "/test-sessions/:id/report", "@auth"],
  ["GET", "/checklist", "@auth"],
  ["PATCH", "/checklist/:id", "sessions"],
  ["GET", "/flags", "@auth"],
  ["POST", "/flags", "flags"],
  ["PATCH", "/flags/:id", "flags"],
  ["GET", "/tests", "@auth"],
  ["POST", "/tests/run", "tests"],
  ["POST", "/tests/stop", "tests"],
  ["GET", "/git/status", "git_read"],
  ["GET", "/git/branches", "git_read"],
  ["GET", "/git/log", "git_read"],
  ["GET", "/git/diff", "git_read"],
  ["POST", "/git/branch", "git_mutate"],
  ["POST", "/git/apply", "git_mutate"],
  ["POST", "/claude/context", "claude"],
  ["POST", "/claude/analyze", "claude"],
  ["POST", "/claude/quickfix", "claude"],
  ["GET", "/claude/status", "@auth"],
  ["POST", "/claude/recheck", "claude"],
  ["GET", "/test-users", "test_users"],
  ["DELETE", "/test-users/:id", "test_users"],   // purge d'un compte @passio-e2e.test
  ["GET", "/alerts", "@auth"],
  ["POST", "/alerts/:id/ack", "alerts"],
  ["POST", "/alerts/manual", "alerts"],
  ["GET", "/sentinel", "claude"],
  ["GET", "/sentinel/:id", "claude"],
  ["POST", "/sentinel/toggle", "settings"],
  ["POST", "/sentinel/:id/merge", "git_mutate"],
  ["GET", "/orchestrator", "git_read"],
  ["POST", "/orchestrator/route", "@auth"],
  ["POST", "/orchestrator/tasks", "git_mutate"],
  ["GET", "/audit", "audit"],
  ["GET", "/readiness", "@auth"],
];

const cle = (m, r) => `${m} ${r}`;

test("inventaire des routes : aucune garde ne change sans que ce test le dise", () => {
  const reelles = parseRoutes(SRC);
  const vues = new Map(reelles.map((r) => [cle(r.method, r.route), r.guard]));
  const attendues = new Map(ATTENDU.map(([m, r, g]) => [cle(m, r), g]));

  // Sens 1 : ce que la source déclare doit correspondre à ce qui est figé ici.
  for (const [k, garde] of vues) {
    assert.ok(attendues.has(k), `route NON DÉCLARÉE dans le test : ${k} (garde: ${garde}). ` +
      "Ajoute-la à ATTENDU en relisant sa permission — c'est le but de cette table.");
    assert.equal(garde, attendues.get(k), `la garde de ${k} a changé (${attendues.get(k)} → ${garde})`);
  }
  // Sens 2 : une route figée ici qui disparaît doit être retirée sciemment.
  for (const k of attendues.keys()) {
    assert.ok(vues.has(k), `route disparue de server/index.js : ${k}`);
  }
  assert.equal(reelles.length, ATTENDU.length);
});

test("l'analyseur voit TOUTES les déclarations de routes du fichier", () => {
  // Le contrôle qui rend l'inventaire digne de confiance. Une route écrite
  // autrement (chemin et garde sur deux lignes, chemin construit par variable)
  // échapperait au motif : elle serait alors absente de l'inventaire au lieu
  // d'y figurer sans garde, et le test passerait pour la mauvaise raison.
  // On compte donc les déclarations à la source et on exige l'égalité.
  const declarees = (SRC.match(/^api\.[a-z]+\(/gm) || []).length;
  assert.equal(parseRoutes(SRC).length, declarees,
    "une route est déclarée sous une forme que l'analyseur ne sait pas lire — " +
    "corrige le motif, ne baisse pas le compte.");
});

test("aucun verbe HTTP inattendu", () => {
  for (const r of parseRoutes(SRC)) {
    assert.ok(METHODES.has(r.method), `verbe inconnu : ${r.method} ${r.route}`);
  }
});

test("les seules routes sans garde sont les quatre routes publiques assumées", () => {
  const publiques = parseRoutes(SRC).filter((r) => r.guard === "@public").map((r) => cle(r.method, r.route));
  assert.deepEqual(publiques.sort(), ["GET /health", "GET /me", "POST /login", "POST /logout"]);
});

// ─── 2. Les gardes gardent réellement ────────────────────────────────────────
function faireRes() {
  const res = { code: 0, corps: null };
  res.status = (c) => { res.code = c; return res; };
  res.json = (o) => { res.corps = o; return res; };
  return res;
}

test("requireAuth : 401 sans session, passe avec session", () => {
  const res = faireRes();
  let suivant = false;
  auth.requireAuth({}, res, () => { suivant = true; });
  assert.equal(res.code, 401);
  assert.equal(suivant, false);

  const res2 = faireRes();
  auth.requireAuth({ session: { u: "b", role: "observer" } }, res2, () => { suivant = true; });
  assert.equal(suivant, true);
  assert.equal(res2.code, 0);
});

test("requireCap : 401 sans session, 403 sans la capacité, passe avec", () => {
  const garde = auth.requireCap("db");

  const anonyme = faireRes();
  garde({ path: "/database" }, anonyme, () => assert.fail("ne doit pas passer"));
  assert.equal(anonyme.code, 401);

  const testeur = faireRes();
  garde({ path: "/database", session: { u: "t", role: "tester" } }, testeur,
    () => assert.fail("un testeur n'a pas la capacité db"));
  assert.equal(testeur.code, 403);
  assert.match(testeur.corps.error, /db/);

  let passe = false;
  const admin = faireRes();
  garde({ path: "/database", session: { u: "b", role: "admin" } }, admin, () => { passe = true; });
  assert.equal(passe, true);
  assert.equal(admin.code, 0);
});

test("/me se garde elle-même : 401 sans session", () => {
  const res = faireRes();
  auth.me({}, res);
  assert.equal(res.code, 401);
});

// ─── 3. L'invariant qui a déjà fuité une fois ────────────────────────────────
// Le rapport d'intégrité expose des identifiants de base. Peu importe COMMENT
// une route y accède : si son corps appelle `reconcile`, elle porte la capacité
// `db` ou elle la vérifie elle-même. Règle générale, pas rustine sur /diagnose.
test("toute route qui embarque l'intégrité exige la capacité `db`", () => {
  const routes = parseRoutes(SRC);
  const corpsDe = (i) => SRC.slice(routes[i].at, i + 1 < routes.length ? routes[i + 1].at : SRC.length);

  let verifiees = 0;
  routes.forEach((r, i) => {
    const corps = corpsDe(i);
    if (!/\breconcile\s*\(/.test(corps)) return;
    verifiees++;
    const gardeeParLaRoute = r.guard === "db";
    const gardeeParElleMeme = /can\(\s*req\.session\.role\s*,\s*"db"\s*\)/.test(corps);
    assert.ok(gardeeParLaRoute || gardeeParElleMeme,
      `${cle(r.method, r.route)} appelle reconcile() sans exiger la capacité \`db\` — ` +
      "un rôle tester/observer lirait la base par la bande.");
  });
  // Si plus personne n'appelle reconcile, ce test ne prouve plus rien : on le dit.
  assert.ok(verifiees >= 2, `attendu au moins 2 routes d'intégrité, vu ${verifiees}`);
});

test("/diagnose : l'intégrité n'est calculée QUE si le rôle a la capacité `db`", () => {
  const debut = SRC.indexOf('api.get("/diagnose"');
  assert.ok(debut > 0, "route /diagnose introuvable");
  const corps = SRC.slice(debut, SRC.indexOf("\napi.", debut + 10));

  // La garde est lue AVANT tout appel au rapport…
  const iGarde = corps.search(/can\(\s*req\.session\.role\s*,\s*"db"\s*\)/);
  const iReconcile = corps.search(/\breconcile\s*\(\)/);
  assert.ok(iGarde > -1, "la vérification de capacité `db` a disparu de /diagnose");
  assert.ok(iReconcile > iGarde, "reconcile() est appelé avant la vérification de capacité");

  // …et le refus est EXPLICITE dans la réponse, jamais un silence qui ressemble
  // à « aucune anomalie » (un faux vert serait pire que le refus).
  assert.match(corps, /integrityEvaluated/, "la réponse doit dire si l'intégrité a été évaluée");
  assert.match(corps, /non évaluée/, "le refus doit être motivé dans la charge utile");
});
