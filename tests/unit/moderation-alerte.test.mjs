// Verrous de `classerSignalements` (scripts/moderation-alerte.mjs) — fonction
// PURE : aucun réseau, aucun secret. `node --test tests/unit/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classerSignalements, SEUIL_H } from "../../scripts/moderation-alerte.mjs";

const T0 = Date.parse("2026-09-11T12:00:00Z");
const il_y_a = (h) => new Date(T0 - h * 3600_000).toISOString();

test("① aucun signalement → aucune alerte, rien à écrire", () => {
  const v = classerSignalements([], T0);
  assert.equal(v.alerte, false);
  assert.equal(v.titre, "");
  assert.equal(v.ouverts, 0);
});

test("② un signalement ouvert depuis 2 h n'alerte pas encore (seuil 24 h)", () => {
  const v = classerSignalements([{ id: "r1", target_type: "user", created_at: il_y_a(2), status: "open" }], T0);
  assert.equal(v.ouverts, 1);
  assert.equal(v.enRetard, 0);
  assert.equal(v.alerte, false);
});

test("③ un signalement ouvert depuis 30 h alerte, et le titre dit combien", () => {
  const v = classerSignalements([{ id: "r1", target_type: "user", created_at: il_y_a(30), status: "open" }], T0);
  assert.equal(v.alerte, true);
  assert.match(v.titre, /^\[MODÉRATION\] 1 signalement\(s\) en attente depuis plus de 24 h$/);
  assert.equal(v.plusAncienH, 30);
  assert.deepEqual(v.parType, { compte: 1 });
});

test("④ un signalement TRAITÉ ne compte plus, même très ancien", () => {
  const v = classerSignalements([
    { id: "r1", target_type: "user", created_at: il_y_a(500), status: "handled" },
    { id: "r2", target_type: "post", created_at: il_y_a(500), status: "dismissed" },
  ], T0);
  assert.equal(v.ouverts, 0);
  assert.equal(v.alerte, false);
});

test("⑤ AVANT la migration (pas de colonne status) tout signalement est ouvert — l'état d'avant", () => {
  const v = classerSignalements([{ id: "r1", target_type: "comment", created_at: il_y_a(75 * 24) }], T0);
  assert.equal(v.ouverts, 1);
  assert.equal(v.enRetard, 1);
  assert.match(v.corps, /75 jour\(s\)/);
});

test("⑥ le corps ne porte NI identifiant, NI motif, NI cible — le dépôt est public", () => {
  const v = classerSignalements([
    { id: "r_secret", reporter_id: "11111111-1111-1111-1111-111111111111", target_type: "user",
      target_id: "22222222-2222-2222-2222-222222222222", reason: "il m'a menacée", created_at: il_y_a(48), status: "open" },
  ], T0);
  assert.equal(v.alerte, true);
  assert.doesNotMatch(v.corps + v.titre, /r_secret|1111-1111|2222-2222|menac/);
  assert.match(v.corps, /1 × compte/);
  assert.match(v.corps, /npm run moderation/);
});

test("⑦ une date illisible est ignorée sans faire tomber le verdict", () => {
  const v = classerSignalements([
    { id: "r1", target_type: "user", created_at: "pas une date", status: "open" },
    { id: "r2", target_type: "event", created_at: il_y_a(SEUIL_H + 1), status: "open" },
  ], T0);
  assert.equal(v.ouverts, 2);
  assert.equal(v.enRetard, 1);
  assert.deepEqual(v.parType, { rencontre: 1 });
});
