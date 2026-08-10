// Tests du suivi du cycle de vie des liens partagés (funnel honnête).
import { test } from "node:test";
import assert from "node:assert/strict";
import { store, normalize } from "../server/store.js";

let n = 0;
function linkEv(action, id, over = {}) {
  return normalize({
    event_id: "lk-e" + (++n), received_at: new Date().toISOString(),
    type: "link", action, correlation_id: id,
    session_id: "s" + n, device_id: over.device_id || "dev-A",
    platform: over.platform || "ios", browser: over.browser || "safari", app_version: "1.0",
    user_id: over.user_id || null, user_label: over.user_label || null,
    status: over.status || "ok", severity: over.severity || "info",
    meta: over.meta || {},
  });
}

test("link_create enregistre un lien au statut « créé »", () => {
  store.add(linkEv("link_create", "lk_A", { user_id: "u1", user_label: "Ben", meta: { link_id: "lk_A", link_kind: "reel", link_target: "post42" } }));
  const l = store.link("lk_A");
  assert.ok(l, "le lien existe");
  assert.equal(l.status, "created");
  assert.equal(l.kind, "reel");
  assert.equal(l.target, "post42");
  assert.equal(l.createdByLabel, "Ben");
  assert.equal(l.orphan, false);
});

test("link_share fait passer à « partagé · non confirmé »", () => {
  store.add(linkEv("link_share", "lk_A", { meta: { link_id: "lk_A", link_channel: "whatsapp" } }));
  const l = store.link("lk_A");
  assert.equal(l.status, "shared");
  assert.equal(l.shareCount, 1);
  assert.ok(l.channels.includes("whatsapp"));
  // Dans l'entonnoir, il compte comme partagé mais NON confirmé ouvert.
  const f = store.linkFunnel();
  assert.ok(f.sharedUnconfirmed >= 1);
});

test("link_open ne compte QUE sur signal réel → statut « ouvert »", () => {
  store.add(linkEv("link_open", "lk_A", { device_id: "dev-B", platform: "android", browser: "chrome", meta: { link_id: "lk_A" } }));
  const l = store.link("lk_A");
  assert.equal(l.status, "opened");
  assert.equal(l.openCount, 1);
  assert.equal(l.openDevices, 1);
  assert.equal(l.errorOpens, 0);
});

test("link_load_error → « ouverture en échec »", () => {
  store.add(linkEv("link_create", "lk_B", { meta: { link_id: "lk_B", link_kind: "profile" } }));
  store.add(linkEv("link_load_error", "lk_B", { status: "error", severity: "error", meta: { link_id: "lk_B" } }));
  const l = store.link("lk_B");
  assert.equal(l.status, "opened_error");
  assert.equal(l.errorOpens, 1);
});

test("une ouverture sans création connue est marquée « orpheline » mais reste honnête (ouverte)", () => {
  store.add(linkEv("link_open", "lk_ORPHAN", { device_id: "dev-C", meta: { link_id: "lk_ORPHAN" } }));
  const l = store.link("lk_ORPHAN");
  assert.equal(l.orphan, true, "aucune création connue");
  assert.equal(l.status, "opened", "on a bien reçu un signal d'ouverture");
  assert.equal(l.createdAt, null);
});

test("linkFunnel produit un entonnoir cohérent et un taux d'ouverture honnête", () => {
  const f = store.linkFunnel();
  assert.ok(f.total >= 3);
  assert.ok(f.created >= 2);       // lk_A, lk_B
  assert.ok(f.shared >= 1);        // lk_A partagé
  assert.ok(f.opened >= 1);        // lk_A ouvert
  assert.ok(f.orphanOpens >= 1);   // lk_ORPHAN
  // Taux d'ouverture = liens partagés ET confirmés ouverts / liens partagés.
  assert.ok(f.openRate === null || (f.openRate >= 0 && f.openRate <= 100));
});

test("le lien apparaît dans linkList avec un DTO complet", () => {
  const list = store.linkList();
  const a = list.find((x) => x.id === "lk_A");
  assert.ok(a);
  assert.equal(a.status, "opened");
  assert.equal(typeof a.shareCount, "number");
  assert.equal(typeof a.openCount, "number");
});
