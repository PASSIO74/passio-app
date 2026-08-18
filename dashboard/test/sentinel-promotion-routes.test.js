import test from "node:test";
import assert from "node:assert/strict";
import { registerPromotionReadRoutes, PROMOTION_READ_ROUTE } from "../server/sentinel-promotion-routes.js";

test("contrat promotion HTTP est GET authentifié sans mutation", () => {
  assert.deepEqual(PROMOTION_READ_ROUTE, {
    method: "GET", path: "/sentinel/promotions", authenticated: true,
    mutation: false, productionDeploy: false,
  });
});

test("enregistrement ajoute exactement un GET protégé", () => {
  const calls = [];
  const api = { get: (...args) => calls.push(["GET", ...args]) };
  const guard = (_req, _res, next) => next?.();
  const auth = { requireAuth: guard };
  registerPromotionReadRoutes(api, auth);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "GET");
  assert.equal(calls[0][1], "/sentinel/promotions");
  assert.equal(calls[0][2], guard);
  assert.equal(typeof calls[0][3], "function");
  assert.equal("post" in api || "patch" in api || "delete" in api, false);
});
