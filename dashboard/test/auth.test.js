import { test } from "node:test";
import assert from "node:assert/strict";
import { createToken, verifyToken, can, capsFor } from "../server/auth.js";

test("token signé : aller-retour valide", () => {
  const t = createToken("benjamin", "admin");
  const p = verifyToken(t);
  assert.equal(p.u, "benjamin");
  assert.equal(p.role, "admin");
});

test("token falsifié : rejeté", () => {
  const t = createToken("benjamin", "admin");
  const tampered = t.slice(0, -3) + "aaa";
  assert.equal(verifyToken(tampered), null);
});

test("token vide / malformé : rejeté", () => {
  assert.equal(verifyToken(""), null);
  assert.equal(verifyToken("abc"), null);
  assert.equal(verifyToken(null), null);
});

test("matrice de permissions", () => {
  assert.ok(can("admin", "git_mutate"));
  assert.ok(!can("developer", "git_mutate"));
  assert.ok(!can("tester", "tests"));
  assert.ok(can("tester", "sessions"));
  assert.ok(!can("observer", "sessions"));
  assert.ok(can("observer", "view"));
  assert.deepEqual(capsFor("observer"), ["view"]);
});

// L'intégrité des données expose des identifiants issus de la base (uid, ids de
// contenu). /api/reconcile est protégé par la capacité `db` ; /api/diagnose,
// ouvert à tout compte authentifié, EMBARQUE ce même rapport — il doit donc
// vérifier `db` lui aussi, sinon un rôle « tester » ou « observer » lirait par
// la bande ce que sa permission lui refuse. Ce test fige l'invariant.
test("l'intégrité des données reste réservée aux rôles ayant la capacité `db`", () => {
  assert.ok(can("admin", "db"));
  assert.ok(can("developer", "db"));
  assert.ok(!can("tester", "db"), "un testeur ne doit pas lire la base");
  assert.ok(!can("observer", "db"), "un observateur ne doit pas lire la base");
  // …tout en gardant accès au diagnostic lui-même (qui reste `view`).
  assert.ok(can("tester", "view"));
  assert.ok(can("observer", "view"));
});
