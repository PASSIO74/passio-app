// LOT E1 (E-M1/E-T1) — le compteur `signups` du pilotage comptait `signup` et
// `account_created`, deux actions que l'application n'a JAMAIS émises (carte
// télémétrie-client F15) : structurellement 0. Le client émet désormais
// `signup_pending_confirmation` (compte créé, e-mail à confirmer — app-02) et
// `signup_confirmed` (première session après confirmation — app-08) : c'est
// cela que l'aperçu doit compter.
// MUTATION : remettre `e.action === "signup" || e.action === "account_created"`
// → ① rouge (signups inchangé) ; retirer `signupsConfirmes` → ② rouge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { store, normalize } from "../server/store.js";

let n = 0;
function action(nom, over = {}) {
  n++;
  return normalize({
    event_id: "su" + n + "_" + Math.random(), received_at: new Date().toISOString(),
    type: "action", action: nom, user_id: null, session_id: "s_su_" + n, device_id: "d_su_" + n,
    platform: "ios", browser: "safari", app_version: "1.0", meta: {},
    ...over,
  });
}
const totaux = () => store.overview().totals;

test("① signups = comptes créés en attente de confirmation (signup_pending_confirmation), pas `signup`", () => {
  const avant = totaux().signups;
  store.add(action("signup_pending_confirmation"));
  store.add(action("signup_pending_confirmation"));
  // Le nom mort ne compte plus : personne ne l'émet, il ne prouve rien (UN
  // seul ajouté, pour que l'ancien prédicat rende avant+1 et non avant+2).
  store.add(action("signup"));
  assert.equal(totaux().signups, avant + 2);
});

test("② signupsConfirmes = premières sessions après confirmation (signup_confirmed)", () => {
  const avant = totaux().signupsConfirmes;
  assert.equal(typeof avant, "number", "le compteur existe");
  store.add(action("signup_confirmed", { meta: { delai_s: 120 } }));
  assert.equal(totaux().signupsConfirmes, avant + 1);
  // Un refus ou une soumission n'est pas une inscription.
  store.add(action("signup_refused", { meta: { rc: "deja_utilise" } }));
  store.add(action("auth_submitted", { meta: { kind: "signup" } }));
  assert.equal(totaux().signupsConfirmes, avant + 1);
});
