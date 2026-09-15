// ASTRA-20 — le banc de charge distingue une réponse vide d'un succès.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictReponse, ligneRapport, pct } from "../../scripts/charge-verdict.mjs";

const UID = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

test("① contre-épreuve d'Astra : quatre HTTP 200 vides → quatre erreurs « vide », zéro succès", () => {
  const attentes = { tableau: true, champs: ["id"] };
  const mesures = [1, 2, 3, 4].map(() => { const v = verdictReponse(200, "[]", attentes); return { ok: v.ok, motif: v.motif, ms: 12 }; });
  const l = ligneRapport(10, "fil", mesures, 1);
  assert.equal(l.ok, 0);
  assert.equal(l.erreurs, 4);
  assert.match(l.motifs, /^4 × vide/);
});

test("② un tableau garni avec les champs attendus est un succès ; un champ manquant ou nul ne l'est pas", () => {
  const attentes = { tableau: true, champs: ["id", "author_id"], imbrique: "profiles" };
  assert.deepEqual(verdictReponse(200, JSON.stringify([{ id: "p1", author_id: "a", profiles: { username: "x" } }]), attentes), { ok: true, motif: null });
  assert.match(verdictReponse(200, JSON.stringify([{ id: "p1", profiles: {} }]), attentes).motif, /author_id absent/);
  assert.match(verdictReponse(200, JSON.stringify([{ id: "p1", author_id: null, profiles: {} }]), attentes).motif, /author_id absent/);
  assert.match(verdictReponse(200, JSON.stringify([{ id: "p1", author_id: "a", profiles: null }]), attentes).motif, /profiles absent/);
});

test("③ un profil demandé par id : exactement un élément, et le bon", () => {
  const attentes = { tableau: true, id: "charge_00001", champs: ["username"] };
  assert.equal(verdictReponse(200, JSON.stringify([{ id: "charge_00001", username: "Charge 1" }]), attentes).ok, true);
  assert.match(verdictReponse(200, "[]", attentes).motif, /vide/);
  assert.match(verdictReponse(200, JSON.stringify([{ id: "charge_00002", username: "x" }]), attentes).motif, /id charge_00002 ≠ charge_00001/);
  assert.match(verdictReponse(200, JSON.stringify([{ id: "charge_00001" }, { id: "charge_00001" }]), attentes).motif, /2 élément/);
});

test("④ un statut hors 2xx, un JSON illisible, une forme inattendue : nommés, jamais des succès", () => {
  const attentes = { tableau: true };
  assert.deepEqual(verdictReponse(401, "[]", attentes), { ok: false, motif: "HTTP 401" });
  assert.deepEqual(verdictReponse(200, "<html>", attentes), { ok: false, motif: "forme : JSON illisible" });
  assert.deepEqual(verdictReponse(200, "{}", attentes), { ok: false, motif: "forme : tableau attendu" });
  assert.deepEqual(verdictReponse(200, "[]", null), { ok: false, motif: "aucune attente déclarée" });
  assert.equal(verdictReponse(201, JSON.stringify({ id: "p" }), { objet: true, champs: ["id"] }).ok, true);
  assert.match(verdictReponse(201, "[]", { objet: true }).motif, /objet attendu/);
});

test("⑤ un uuid attendu est vérifié dans sa forme ; min: 0 est un choix explicite", () => {
  assert.equal(verdictReponse(200, JSON.stringify([{ author_id: UID }]), { tableau: true, uuid: "author_id" }).ok, true);
  assert.match(verdictReponse(200, JSON.stringify([{ author_id: "charge_00001" }]), { tableau: true, uuid: "author_id" }).motif, /n'est pas un uuid/);
  assert.equal(verdictReponse(200, "[]", { tableau: true, min: 0 }).ok, true);
});

test("⑥ le rapport : percentiles sur les seuls succès, erreurs comptées par motif, débit sur tout", () => {
  const mesures = [
    { ok: true, ms: 10 }, { ok: true, ms: 20 }, { ok: true, ms: 30 }, { ok: true, ms: 1000 },
    { ok: false, motif: "vide : 0 élément(s), 1 attendu(s)", ms: 5 }, { ok: false, motif: "HTTP 429", ms: 5 }, { ok: false, motif: "HTTP 429", ms: 5 },
  ];
  const l = ligneRapport(50, "fil", mesures, 2);
  assert.equal(l.ok, 4); assert.equal(l.erreurs, 3); assert.equal(l.rps, 3.5);
  assert.equal(l.p50, 30); assert.equal(l.p99, 1000);
  assert.equal(l.motifs, "2 × HTTP 429, 1 × vide : 0 élément(s), 1 attendu(s)");
  assert.equal(pct([], 0.5), null);
});
