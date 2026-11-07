// Une preuve fraîche pour les gestes irréversibles (audit 2026-11-06). Le fichier éprouvé est celui que Deno charge.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { connexionRecente, REPONSE_REAUTH } from "../../supabase/functions/_shared/connexion-recente.js";

const MAINTENANT = 1_800_000_000;
const jeton = (claims) => "Bearer " + ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

test("① une connexion de moins de 15 minutes passe ; au-delà, non", () => {
  assert.equal(connexionRecente(jeton({ amr: [{ method: "password", timestamp: MAINTENANT - 60 }] }), 900, MAINTENANT), true);
  assert.equal(connexionRecente(jeton({ amr: [{ method: "password", timestamp: MAINTENANT - 900 }] }), 900, MAINTENANT), true);
  assert.equal(connexionRecente(jeton({ amr: [{ method: "password", timestamp: MAINTENANT - 901 }] }), 900, MAINTENANT), false);
});

test("② c'est la plus récente des méthodes qui compte", () => {
  const amr = [{ method: "password", timestamp: MAINTENANT - 99999 }, { method: "oauth", timestamp: MAINTENANT - 10 }];
  assert.equal(connexionRecente(jeton({ amr }), 900, MAINTENANT), true);
});

test("③ un format inconnu ne retire pas le droit de supprimer son compte", () => {
  for (const v of [jeton({}), jeton({ amr: [] }), jeton({ amr: "password" }), jeton({ amr: [{ method: "x" }] }), "Bearer a.b", "", null]) {
    assert.equal(connexionRecente(v, 900, MAINTENANT), true);
  }
});

test("une session anonyme, qui ne peut pas se reconnecter, n'est pas bloquée", () => {
  assert.equal(connexionRecente(jeton({ is_anonymous: true, amr: [{ method: "anonymous", timestamp: MAINTENANT - 99999 }] }), 900, MAINTENANT), true);
  assert.equal(connexionRecente(jeton({ is_anonymous: false, amr: [{ method: "password", timestamp: MAINTENANT - 99999 }] }), 900, MAINTENANT), false);
});

test("④ les deux fonctions portent la garde, avant tout effet", () => {
  const suppr = fs.readFileSync("supabase/functions/delete-account/index.ts", "utf8");
  assert.ok(suppr.indexOf("connexionRecente(") > 0 && suppr.indexOf("connexionRecente(") < suppr.indexOf("traiterSuppression(admin"), "suppression");
  const expo = fs.readFileSync("supabase/functions/export-account/index.ts", "utf8");
  assert.ok(expo.indexOf("connexionRecente(") > 0 && expo.indexOf("connexionRecente(") < expo.indexOf("exporterCompte(admin"), "export");
  assert.equal(REPONSE_REAUTH.code, "reauth_requise");
});
