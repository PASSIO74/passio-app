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
