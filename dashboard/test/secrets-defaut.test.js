import { test } from "node:test";
import assert from "node:assert/strict";
import { verifierSecrets, DEFAUTS_INTERDITS } from "../server/config.js";

// PIL-02 : le pilotage refuse ses identifiants par défaut en production.
test("les trois défauts sont nommés", () => {
  const fautes = verifierSecrets({ sessionSecret: DEFAUTS_INTERDITS.sessionSecret, adminUser: "admin", adminPassword: "admin", isProd: true });
  assert.equal(fautes.length, 3);
  assert.match(fautes.join(" "), /DASH_SESSION_SECRET/);
  assert.match(fautes.join(" "), /DASH_ADMIN_PASSWORD/);
  assert.match(fautes.join(" "), /DASH_ADMIN_USER/);
});

test("un secret court ou un mot de passe court sont refusés même s'ils ne sont pas le défaut", () => {
  assert.equal(verifierSecrets({ sessionSecret: "court", adminUser: "benjamin", adminPassword: "Passio-2026-longue" }).length, 1);
  assert.equal(verifierSecrets({ sessionSecret: "x".repeat(40), adminUser: "benjamin", adminPassword: "court" }).length, 1);
});

test("une configuration posée passe sans faute", () => {
  assert.deepEqual(verifierSecrets({ sessionSecret: "x".repeat(48), adminUser: "benjamin", adminPassword: "Passio-2026-longue!" }), []);
});
