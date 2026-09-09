// Verrous du détecteur de la sentinelle autonome. Fonction PURE : aucun réseau,
// aucune base — les lignes sont fabriquées, y compris celles observées en
// production le 2026-09-09.
import test from "node:test";
import assert from "node:assert/strict";
import { classer, empreinte, estDuBruit } from "../../scripts/sentinelle-detecter.mjs";

test("« Script error. » est écarté : le navigateur refuse d'en dire plus", () => {
  // Observé en production. Une erreur d'un script d'une AUTRE origine est
  // masquée par le navigateur : il n'y a rien à corriger, jamais.
  assert.equal(estDuBruit("Script error."), true);
  assert.equal(estDuBruit("script error"), true);
  assert.equal(estDuBruit("ResizeObserver loop completed"), true);
  assert.equal(estDuBruit(""), true);
  assert.equal(estDuBruit("   "), true);
  // Et ce qui est un VRAI défaut ne doit pas être écarté.
  assert.equal(estDuBruit("Promise rejetée: newestWorker is null"), false);
});

test("les variantes d'une même cause se regroupent", () => {
  // Les nombres et les URL varient d'une occurrence à l'autre : sans
  // normalisation, un seul défaut se compterait comme dix causes distinctes et
  // aucune n'atteindrait le seuil.
  assert.equal(
    empreinte("Cannot read x of undefined at line 42 https://a.b/c.js"),
    empreinte("Cannot read x of undefined at line 7 https://d.e/f.js"));
  assert.notEqual(empreinte("erreur A"), empreinte("erreur B"));
});

test("⚠️ le tri privilégie le nombre de COMPTES, pas le volume", () => {
  // Défaut de famille : une erreur vue 200 fois par UNE personne est souvent
  // son appareil ou une extension ; vue 3 fois par 3 personnes, c'est le
  // produit. Trier par volume brut ferait travailler la sentinelle sur le cas
  // le moins représentatif.
  const lignes = [
    ...Array.from({ length: 200 }, () => ({ message: "bug appareil", uid: "u1", created_at: "2026-09-09T10:00:00Z" })),
    { message: "bug produit", uid: "a", created_at: "2026-09-09T11:00:00Z" },
    { message: "bug produit", uid: "b", created_at: "2026-09-09T11:01:00Z" },
    { message: "bug produit", uid: "c", created_at: "2026-09-09T11:02:00Z" },
  ];
  const { candidates } = classer(lignes);
  assert.equal(candidates[0].message, "bug produit");
  assert.equal(candidates[0].comptes, 3);
  assert.equal(candidates[1].message, "bug appareil");
});

test("un cas isolé sous le seuil n'est pas retenu", () => {
  const { candidates } = classer([{ message: "rare", uid: "u1", created_at: "2026-09-09T10:00:00Z" }]);
  assert.deepEqual(candidates, []);
});

test("deux comptes suffisent, même sous le seuil d'occurrences", () => {
  const { candidates } = classer([
    { message: "partagé", uid: "a", created_at: "2026-09-09T10:00:00Z" },
    { message: "partagé", uid: "b", created_at: "2026-09-09T10:01:00Z" },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].comptes, 2);
});

test("un exemple avec pile d'appel est conservé — sans lui, aucune cause", () => {
  const { candidates } = classer([
    { message: "boum", uid: "a", created_at: "2026-09-09T10:00:00Z" },
    { message: "boum", uid: "b", created_at: "2026-09-09T10:01:00Z", stack: "at f (app.js:12)", source: "app.js", line: 12 },
  ]);
  assert.equal(candidates[0].exemple.source, "app.js");
  assert.match(candidates[0].exemple.stack, /app\.js/);
});

test("les données réelles du 2026-09-09 donnent le verdict attendu", () => {
  // Prod mesurée : 5 « newestWorker is null » sur 1 compte, 1 « Script error. ».
  const lignes = [
    ...Array.from({ length: 5 }, () => ({ message: "Promise rejetée: newestWorker is null", uid: "u1", created_at: "2026-09-08T18:40:06Z" })),
    { message: "Script error.", uid: "u2", created_at: "2026-09-04T17:23:20Z" },
  ];
  const { candidates, ecartees } = classer(lignes);
  assert.equal(ecartees, 1, "« Script error. » écarté");
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].n, 5);
  assert.equal(candidates[0].comptes, 1);
});

test("aucune erreur → aucune cible, et ce n'est PAS une preuve de santé", () => {
  const { candidates } = classer([]);
  assert.deepEqual(candidates, []);
  // Le commentaire en tête du script porte l'avertissement ; ce cas existe
  // pour que personne ne transforme « liste vide » en « tout va bien ».
});
