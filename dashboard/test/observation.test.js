import { test } from "node:test";
import assert from "node:assert/strict";
import { isSyntheticCanary, _test } from "../server/observation.js";

test("le canari Sentinel est reconnu sans dépendre d'un utilisateur", () => {
  const ev = { type: "lifecycle", action: _test.CANARY_ACTION, user_id: null, meta: { synthetic: true } };
  assert.equal(isSyntheticCanary(ev), true);
});

test("un événement produit ordinaire n'est jamais confondu avec le canari", () => {
  assert.equal(isSyntheticCanary({ type: "lifecycle", action: _test.CANARY_ACTION, meta: {} }), false);
  assert.equal(isSyntheticCanary({ type: "action", action: _test.CANARY_ACTION, meta: { synthetic: true } }), false);
});
