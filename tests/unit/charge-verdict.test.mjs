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

// ASTRA-37 — le DELETE d'un « j'aime » rend 204 sans corps ; il doit se mesurer.
test("ASTRA-37 une réponse sans contenu est un succès mesurable, et un corps inattendu ne l'est pas", () => {
  assert.deepEqual(verdictReponse(204, "", { aucunContenu: true }), { ok: true, motif: null });
  assert.deepEqual(verdictReponse(200, "[]", { aucunContenu: true }), { ok: true, motif: null });
  assert.equal(verdictReponse(409, "", { aucunContenu: true }).ok, false, "un refus reste un refus");
  const inattendu = verdictReponse(200, '{"message":"oops"}', { aucunContenu: true });
  assert.equal(inattendu.ok, false);
  assert.match(inattendu.motif, /contenu inattendu/);
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT F (2026-11-02) — SEUILS D'ARRÊT DE `charge.mjs` ET p95 SUR TOUTES LES
// MESURES. Fixture : les lignes RÉELLES du palier 25 du 15/09 (staging), où la
// campagne a continué vers 50 malgré 7 livraisons manquées et un p99 de 13 s.
// ═══════════════════════════════════════════════════════════════════════════
import { verdictPalierSimple, SEUILS_PALIER } from "../../scripts/charge-verdict.mjs";

const PALIER_25_DU_15_09 = [
  { palier: 25, requete: "fil (auth)", ok: 603, erreurs: 0, rps: 15.1, p50: 112, p95: 459, p99: 1956 },
  { palier: 25, requete: "publier", ok: 90, erreurs: 0, rps: 2.3, p50: 230, p95: 3754, p99: 13054 },
  { palier: 25, requete: "temps réel (insert → reçu)", ok: 83, erreurs: 7, rps: 2.3, p50: 566, p95: 3869, p99: 4191, motifs: "7 × événement non reçu en 10 s" },
];

test("F-① le palier 25 du 15/09 est ROUGE : livraisons manquées, p95 publier > 1 s, p95 temps réel > 2 s", () => {
  const v = verdictPalierSimple(PALIER_25_DU_15_09);
  assert.equal(v.ok, false);
  assert.ok(v.motifs.some((m) => /LIVRAISON_MANQUEE \(7\)/.test(m)), v.motifs.join(" ; "));
  assert.ok(v.motifs.some((m) => /publier : P95_SUP_1000_MS/.test(m)));
  assert.ok(v.motifs.some((m) => /P95_REALTIME_SUP_2000_MS/.test(m)));
  assert.ok(!v.motifs.some((m) => /^fil/.test(m)), "le fil (p95 459 ms, 0 erreur) ne doit pas être cité");
});

test("F-② le palier 10 du 15/09 (tenue 5 min) est VERT hors temps réel, et ROUGE à cause des 5 livraisons manquées", () => {
  const sans = [
    { requete: "fil (auth)", ok: 6716, erreurs: 0, p95: 115 }, { requete: "aimer", ok: 6717, erreurs: 0, p95: 105 },
    { requete: "publier", ok: 367, erreurs: 0, p95: 578 },
  ];
  assert.deepEqual(verdictPalierSimple(sans), { ok: true, motifs: [] });
  const avec = [...sans, { requete: "temps réel (insert → reçu)", ok: 362, erreurs: 5, p95: 799 }];
  const v = verdictPalierSimple(avec);
  assert.equal(v.ok, false);
  assert.deepEqual(v.motifs, ["temps réel (insert → reçu) : LIVRAISON_MANQUEE (5)"]);
});

test("F-③ 1 % d'erreurs est la borne : 1/100 passe, 2/100 arrête ; une famille sans mesure est un motif, pas un vert", () => {
  assert.equal(verdictPalierSimple([{ requete: "fil", ok: 99, erreurs: 1, p95: 100 }]).ok, true);
  assert.equal(verdictPalierSimple([{ requete: "fil", ok: 98, erreurs: 2, p95: 100 }]).ok, false);
  assert.deepEqual(verdictPalierSimple([{ requete: "fil", ok: 0, erreurs: 0 }]).motifs, ["fil : AUCUNE_MESURE"]);
  assert.deepEqual(verdictPalierSimple([]), { ok: false, motifs: ["PALIER_SANS_MESURE"] });
  assert.deepEqual(SEUILS_PALIER, { tauxErreurMax: 0.01, p95HttpMs: 1000, p95RealtimeMs: 2000 });
});

test("F-④ `p95Tous` compte les échecs : 50 % de requêtes expirées à 12 s donnent un p95 (succès) VERT et un p95Tous ROUGE", () => {
  const mesures = [];
  for (let i = 0; i < 50; i++) mesures.push({ ok: true, ms: 80 });
  for (let i = 0; i < 50; i++) mesures.push({ ok: false, motif: "réseau : timeout", ms: 12000 });
  const l = ligneRapport(50, "fil (auth)", mesures, 20);
  assert.equal(l.p95, 80, "contrat historique : percentiles des seuls succès");
  assert.equal(l.p95Tous, 12000);
  const v = verdictPalierSimple([l]);
  assert.equal(v.ok, false);
  assert.ok(v.motifs.some((m) => /ERREURS_SUP_1_PCT \(50\/100\)/.test(m)));
  assert.ok(v.motifs.some((m) => /P95_SUP_1000_MS \(12000\)/.test(m)), "c'est p95Tous qui est lu, jamais le p95 des succès");
});

test("F-⑤ sans `p95Tous` (rapport d'avant le 2026-11-02), le verdict retombe sur `p95` plutôt que de laisser passer", () => {
  assert.equal(verdictPalierSimple([{ requete: "fil", ok: 100, erreurs: 0, p95: 1500 }]).ok, false);
});
