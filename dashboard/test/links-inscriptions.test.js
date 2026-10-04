// Dernière marche de l'entonnoir des liens (2026-10-04) : partagé → ouvert →
// COMPTE CRÉÉ. `link_signup` est émis par le client sur l'appareil que le lien
// avait amené, une fois par inscription (telemetry.js : linkSignup). Le pilotage
// ne DÉDUIT rien : il compte ce signal, au dénominateur honnête des liens ouverts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { store, normalize } from "../server/store.js";

let n = 0;
function linkEv(action, id, over = {}) {
  return normalize({
    event_id: "lki-e" + (++n), received_at: new Date().toISOString(),
    type: "link", action, correlation_id: id,
    session_id: "si" + n, device_id: over.device_id || "dev-I1",
    platform: over.platform || "android", browser: "chrome", app_version: "1.0",
    user_id: over.user_id || null, status: "ok", severity: "info",
    meta: over.meta || {},
  });
}

const base = () => store.linkFunnel();

test("① créé → partagé → ouvert → compte créé : statut « a fait venir un compte »", () => {
  const avant = base();
  store.add(linkEv("link_create", "lk_INS1", { device_id: "dev-LEA", user_id: "u-lea", meta: { link_id: "lk_INS1", link_kind: "event" } }));
  store.add(linkEv("link_share", "lk_INS1", { device_id: "dev-LEA", meta: { link_id: "lk_INS1", link_channel: "native" } }));
  store.add(linkEv("link_open", "lk_INS1", { device_id: "dev-SAM", meta: { link_id: "lk_INS1" } }));
  store.add(linkEv("link_signup", "lk_INS1", { device_id: "dev-SAM", meta: { link_id: "lk_INS1", voie: "email", invite: true, delai_s: 240 } }));
  const l = store.link("lk_INS1");
  assert.equal(l.status, "signed_up");
  assert.equal(l.signupCount, 1);
  assert.equal(l.signupsInvite, 1);
  assert.equal(l.signups.length, 1);
  assert.equal(l.signups[0].voie, "email");
  assert.equal(l.signups[0].delaiS, 240);
  const f = base();
  assert.equal(f.totalSignups, avant.totalSignups + 1);
  assert.equal(f.signedUp, avant.signedUp + 1);
  assert.equal(f.signupsInvite, avant.signupsInvite + 1);
  assert.ok(f.signupsToday >= 1);
});

test("② le taux d'inscription se lit parmi les liens OUVERTS, jamais parmi les créés", () => {
  // Un lien créé et partagé mais jamais ouvert ne pèse pas sur le taux.
  store.add(linkEv("link_create", "lk_INS2", { meta: { link_id: "lk_INS2" } }));
  store.add(linkEv("link_share", "lk_INS2", { meta: { link_id: "lk_INS2", link_channel: "clipboard" } }));
  // Un lien ouvert sans inscription, lui, fait baisser le taux.
  store.add(linkEv("link_open", "lk_INS3", { device_id: "dev-X3", meta: { link_id: "lk_INS3" } }));
  const tous = store.linkList(10000);
  const ouverts = tous.filter((l) => l.openCount > 0);
  const ouvertsInscrits = ouverts.filter((l) => l.signupCount > 0).length;
  const f = base();
  assert.equal(f.signupRate, Math.round((ouvertsInscrits / ouverts.length) * 100));
  assert.equal(store.link("lk_INS2").status, "shared");
  assert.equal(store.link("lk_INS3").status, "opened");
});

test("③ deux comptes nés de deux appareils : deux inscriptions sur un seul lien", () => {
  store.add(linkEv("link_open", "lk_INS1", { device_id: "dev-TOM", meta: { link_id: "lk_INS1" } }));
  store.add(linkEv("link_signup", "lk_INS1", { device_id: "dev-TOM", meta: { link_id: "lk_INS1", voie: "google", invite: false } }));
  const l = store.link("lk_INS1");
  assert.equal(l.signupCount, 2);
  assert.equal(l.signupsInvite, 1, "seule la première portait un invitant");
});

test("④ visiteurs : « arrivés par un lien, puis inscrits » croise les DEUX signaux du même appareil", () => {
  const v = store.visitorFunnel();
  // dev-SAM et dev-TOM ont ouvert ET créé un compte ; dev-X3 a seulement ouvert.
  assert.ok(v.viaLinkSignedUp >= 2);
  assert.ok(v.viaLink >= v.viaLinkSignedUp);
});

test("⑤ une valeur absurde venue du client ne fabrique ni invitant ni délai", () => {
  store.add(linkEv("link_open", "lk_INS5", { device_id: "dev-Z5", meta: { link_id: "lk_INS5" } }));
  store.add(linkEv("link_signup", "lk_INS5", { device_id: "dev-Z5", meta: { link_id: "lk_INS5", invite: "oui", delai_s: "beaucoup" } }));
  const l = store.link("lk_INS5");
  assert.equal(l.signupCount, 1);
  assert.equal(l.signupsInvite, 0, "seul un booléen vrai compte comme invitant");
  assert.equal(l.signups[0].delaiS, null);
});
