import test from "node:test";
import assert from "node:assert/strict";
import { PROMOTION_READ_ROUTE, registerPromotionReadRoutes } from "../server/sentinel-promotion-routes.js";
import { promotionStatusView } from "../server/sentinel-promotion-view.js";

test("promotion HTTP contract is authenticated GET-only", () => {
  assert.deepEqual(PROMOTION_READ_ROUTE, {
    method: "GET",
    path: "/sentinel/promotions",
    authenticated: true,
    mutation: false,
    productionDeploy: false,
  });

  const calls = [];
  const api = { get: (...args) => calls.push(args) };
  const guard = (_req, _res, next) => next?.();
  registerPromotionReadRoutes(api, { requireAuth: guard });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/sentinel/promotions");
  assert.equal(calls[0][1], guard);
  assert.equal(typeof calls[0][2], "function");
});

test("promotion projection carries no mutation or deployment authority", () => {
  const view = promotionStatusView(1);
  assert.equal(view.policy.readOnly, true);
  assert.equal(view.policy.mutation, false);
  assert.equal(view.policy.productionDeploy, false);
  assert.equal(view.policy.runtimeActivation, false);
  assert.equal("token" in (view.lock || {}), false);
});
