// ASTRA-19 — « précédent » ne désigne jamais une version plus récente
// (scripts/rollback-selection.mjs, la sélection pure de rollback-netlify.mjs).
//
// LE DÉFAUT (contre-revue Astra, 2026-09-15) : `prods[findIndex(courant) + 1]`
// avec un courant ABSENT de la page lue → index -1 → `prods[0]`, le plus
// récent. Un retour arrière remettait en ligne une version plus neuve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrerProduction, precedentDe, continuerPagination } from "../../scripts/rollback-selection.mjs";

const d = (id, context = "production", state = "ready") => ({ id, context, state });
// Du plus récent au plus ancien, comme l'API Netlify les rend.
const PRODS = [d("p9"), d("p8"), d("p7"), d("p6")];

test("① courant présent : le précédent est celui d'après dans la liste", () => {
  assert.deepEqual(precedentDe(PRODS, "p9"), { cible: "p8" });
  assert.deepEqual(precedentDe(PRODS, "p7"), { cible: "p6" });
});

test("② ASTRA-19 (RÉINJECTION) : courant ABSENT → refus explicite, jamais le plus récent", () => {
  // Sur le code d'avant : prods[-1 + 1] = "p9", la version la plus neuve.
  const r = precedentDe(PRODS, "ancien_remis_en_ligne");
  assert.equal(r.cible, undefined);
  assert.match(r.erreur, /n'est pas dans les 4 déploiements/);
  assert.match(r.erreur, /identifiant explicite/);
});

test("③ courant = le plus ancien lu → « aucun déploiement avant » ; courant inconnu → refus", () => {
  assert.match(precedentDe(PRODS, "p6").erreur, /aucun déploiement de production avant/);
  assert.match(precedentDe(PRODS, null).erreur, /aucun déploiement courant/);
  assert.match(precedentDe([], "p1").erreur, /0 déploiements/);
});

test("④ seuls les déploiements de production PRÊTS comptent, l'ordre est conservé", () => {
  const l = [d("x1", "deploy-preview"), d("p2"), d("x2", "production", "error"), d("p1"), d("x3", "branch-deploy")];
  assert.deepEqual(filtrerProduction(l).map((x) => x.id), ["p2", "p1"]);
  assert.deepEqual(filtrerProduction(null), []);
});

test("⑤ pagination : on continue tant que la page est pleine et que le courant n'a pas de successeur lu", () => {
  const pleine = new Array(30).fill(d("z"));
  assert.equal(continuerPagination(pleine, 30, [d("a"), d("b")], "x"), true, "courant pas encore vu");
  assert.equal(continuerPagination(pleine, 30, [d("a"), d("x")], "x"), true, "courant vu mais en dernier : son précédent est peut-être page suivante");
  assert.equal(continuerPagination(pleine, 30, [d("x"), d("a")], "x"), false, "courant vu avec un successeur : on a ce qu'il faut");
  assert.equal(continuerPagination(pleine.slice(0, 12), 30, [d("a")], "x"), false, "page courte : il n'y a plus rien après");
  assert.equal(continuerPagination([], 30, [], "x"), false);
  assert.equal(continuerPagination(pleine, 30, [d("a")], null), true, "sans courant connu, on lit tout (borné par l'appelant)");
});
