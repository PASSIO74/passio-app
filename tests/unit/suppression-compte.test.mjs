// ASTRA-42 — le CONTRAT DE RÉPONSE de `delete-account`
// (supabase/functions/_shared/suppression-compte.js, importé tel quel par index.ts).
//
// Le défaut : la purge continuait sans barrière « en le disant » (une note), et le
// handler jetait la note : HTTP 200 `{ok:true, objets:0}` pour une suppression
// que rien ne garantissait. Ici le handler est exercé avec le VRAI purgerCompte
// (le faux client de purge partagé, qui pilote seulement les fonctions SQL) et
// une suppression Auth injectée — le seul double est l'API GoTrue.
//   ① sans infrastructure : 503, `infrastructure_absente`, RIEN n'est purgé
//   ② succès : 200 SEULEMENT après deleteUser, avec `garantie: "barriere"`, et
//      le marqueur passe en `supprimee` avec le MÊME jeton
//   ③ deleteUser échoue après une purge réussie : 500 `auth_non_supprime`,
//      `donnees_purgees: true`, protection CONSERVÉE (`purgee`), pas de `ok`
//   ④ restes : 409 `incomplete`, echecs/restes transmis
//   ⑤ réclamation non acquise : 409 `deja_en_cours` / `deja_supprimee`
//   ⑥ écritures en vol : 409 `en_vol`
//   ⑦ tentative reprise par une autre : 409 `jeton_perdu`, deleteUser JAMAIS appelé
//   ⑧ MUTATION : un handler qui rend 200 sur `ok` sans `garantie`, ou qui appelle
//      deleteUser malgré `ok:false`, rougit ici
import { test } from "node:test";
import assert from "node:assert/strict";
import { traiterSuppression, STATUT_PAR_CODE, MESSAGE_PAR_CODE } from "../../supabase/functions/_shared/suppression-compte.js";
import { fauxAdmin, U } from "./lib/faux-admin-purge.mjs";

const JETON = "12345678-1234-4123-8123-123456789abc";
function auth(resultat = null) {
  const appels = [];
  return { appels, supprimerAuth: async (uid) => { appels.push(uid); return { error: resultat }; } };
}

test("① sans infrastructure : 503 infrastructure_absente, ok faux, RIEN purgé, deleteUser jamais appelé", async () => {
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, barriere: "absente" });
  const a = auth();
  const { status, body } = await traiterSuppression(admin, U, { supprimerAuth: a.supprimerAuth, jeton: JETON });
  assert.equal(status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.code, "infrastructure_absente");
  assert.equal(body.garantie, undefined);
  assert.equal(body.error, MESSAGE_PAR_CODE.infrastructure_absente);
  assert.ok(body.notes.some((n) => /ABSENTE/.test(n)), "la note n'est plus jetée : elle est dans la réponse");
  assert.deepEqual(a.appels, [], "le compte Auth n'est PAS supprimé");
  assert.deepEqual(admin._t.user_state, [{ user_id: U }], "rien n'a été purgé");
});

test("② succès : 200 après deleteUser, `garantie: barriere`, marqueur `supprimee` avec le même jeton", async () => {
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }], profiles: [{ id: U }] } });
  const a = auth();
  const { status, body } = await traiterSuppression(admin, U, { supprimerAuth: a.supprimerAuth, jeton: JETON });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.garantie, "barriere");
  assert.equal(body.marqueur, "supprimee");
  assert.deepEqual(a.appels, [U]);
  const fins = admin._a.filter((x) => x.nom === "terminer_suppression").map((x) => [x.args.p_statut, x.args.p_jeton]);
  assert.deepEqual(fins, [["purgee", JETON], ["supprimee", JETON]], "purgee AVANT deleteUser, supprimee APRÈS, même jeton");
  // L'ordre : la purge (et son `purgee`) précède deleteUser, `supprimee` le suit.
  assert.equal(admin._t.comptes_en_suppression[0].statut, "supprimee");
});

test("③ deleteUser échoue après une purge réussie : 500 auth_non_supprime, données purgées dites, protection conservée", async () => {
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] } });
  const a = auth({ message: "GoTrue indisponible" });
  const { status, body } = await traiterSuppression(admin, U, { supprimerAuth: a.supprimerAuth, jeton: JETON });
  assert.equal(status, 500);
  assert.equal(body.ok, false);
  assert.equal(body.code, "auth_non_supprime");
  assert.equal(body.donnees_purgees, true);
  assert.equal(body.barriere, "conservee");
  assert.ok(/GoTrue indisponible/.test(body.error));
  assert.equal(admin._t.comptes_en_suppression[0].statut, "purgee", "la protection reste : ni levée, ni supprimee");
  assert.ok(!admin._a.some((x) => x.nom === "terminer_suppression" && x.args.p_statut === "supprimee"), "pas de `supprimee` sans deleteUser");
  // La reprise : une seconde demande réclame depuis `purgee` (SQL l'admet — banc ⑤),
  // repurge (idempotent : plus rien) et supprime. Ici : le même handler, Auth ok.
  const a2 = auth();
  const r2 = await traiterSuppression(admin, U, { supprimerAuth: a2.supprimerAuth, jeton: "22222222-2222-4222-8222-222222222222" });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.ok, true);
  assert.equal(admin._t.comptes_en_suppression[0].statut, "supprimee");
});

test("④ restes nommés : 409 incomplete, echecs et restes transmis, pas de deleteUser", async () => {
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, pannesDelete: ["user_state"] });
  const a = auth();
  const { status, body } = await traiterSuppression(admin, U, { supprimerAuth: a.supprimerAuth, jeton: JETON });
  assert.equal(status, 409);
  assert.equal(body.code, "incomplete");
  assert.ok(body.echecs.some((e) => /user_state/.test(e)) && body.restes.some((e) => /user_state/.test(e)));
  assert.deepEqual(a.appels, []);
});

test("⑤ réclamation non acquise : 409 deja_en_cours / deja_supprimee", async () => {
  const occ = await traiterSuppression(fauxAdmin({ barriere: "occupee" }), U, { supprimerAuth: auth().supprimerAuth });
  assert.deepEqual([occ.status, occ.body.code], [409, "deja_en_cours"]);
  const sup = await traiterSuppression(fauxAdmin({ barriere: "supprimee" }), U, { supprimerAuth: auth().supprimerAuth });
  assert.deepEqual([sup.status, sup.body.code], [409, "deja_supprimee"]);
});

test("⑥ écritures en vol non terminées : 409 en_vol", async () => {
  const { status, body } = await traiterSuppression(fauxAdmin({ enVol: { en_vol_initial: 1, restantes: 1, attendu_ms: 5000 } }), U, { supprimerAuth: auth().supprimerAuth });
  assert.deepEqual([status, body.code], [409, "en_vol"]);
  assert.equal(body.error, MESSAGE_PAR_CODE.en_vol);
});

test("⑦ tentative reprise par une autre pendant la purge : 409 jeton_perdu, deleteUser JAMAIS appelé", async () => {
  // C'est la conséquence ultime d'ASTRA-40 : sans ce refus, une tentative dont la
  // relecture ne vaut plus rien supprimerait le compte Auth.
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, terminerRefuse: true });
  const a = auth();
  const { status, body } = await traiterSuppression(admin, U, { supprimerAuth: a.supprimerAuth, jeton: JETON });
  assert.deepEqual([status, body.code, body.ok], [409, "jeton_perdu", false]);
  assert.deepEqual(a.appels, [], "le compte Auth n'est pas supprimé sur la foi d'une purge dont on n'a plus la garde");
});

test("⑧ chaque code a un statut et un message ; aucun statut 2xx hors succès", () => {
  for (const code of Object.keys(STATUT_PAR_CODE)) {
    assert.ok(STATUT_PAR_CODE[code] >= 400, code + " n'est pas un succès");
    assert.ok(MESSAGE_PAR_CODE[code], code + " a un message");
  }
  assert.ok(MESSAGE_PAR_CODE.auth_non_supprime);
});
