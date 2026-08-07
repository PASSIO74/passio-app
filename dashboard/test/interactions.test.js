import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../server/store.js";
import { interactions, onEvent, snapshot } from "../server/interactions.js";

function ev(over = {}) {
  return normalize({
    event_id: "e" + Math.random().toString(36).slice(2),
    received_at: new Date().toISOString(),
    type: "action", session_id: "s", platform: "ios", browser: "safari", app_version: "1.0",
    ...over,
  });
}

test("un like émis puis reçu sur un autre appareil est marqué livré", () => {
  interactions.reset();
  onEvent(ev({ action: "like_post", device_id: "A", user_id: "alice", user_label: "Alice", meta: { postId: "P1" } }));
  // Réception sur un AUTRE appareil, même cible.
  onEvent(ev({ type: "rt_recv", action: "like", device_id: "B", user_id: "bob", user_label: "Bob", meta: { postId: "P1" } }));
  const snap = snapshot();
  const rec = snap.recent.find((r) => r.kind === "like");
  assert.ok(rec, "l'interaction like existe");
  assert.equal(rec.status, "delivered");
  assert.equal(rec.receiptCount, 1);
  assert.ok(rec.bestLatency != null && rec.bestLatency >= 0);
  const st = snap.stats.find((s) => s.kind === "like");
  assert.equal(st.delivered, 1);
  assert.equal(st.deliveryRate, 100);
});

test("une réception sur le MÊME appareil ne compte pas comme cross-device", () => {
  interactions.reset();
  onEvent(ev({ action: "like_post", device_id: "A", meta: { postId: "P2" } }));
  onEvent(ev({ type: "rt_recv", action: "like", device_id: "A", meta: { postId: "P2" } }));
  const rec = snapshot().recent.find((r) => r.kind === "like");
  assert.equal(rec.receiptCount, 0, "même appareil ignoré");
});

test("une cible différente n'apparie pas (corrélation par id)", () => {
  interactions.reset();
  onEvent(ev({ action: "comment_post", device_id: "A", meta: { postId: "P3" } }));
  onEvent(ev({ type: "rt_recv", action: "comment", device_id: "B", meta: { postId: "AUTRE" } }));
  const rec = snapshot().recent.find((r) => r.kind === "comment");
  assert.equal(rec.receiptCount, 0, "cible différente non appariée");
});

test("un message émis sans réception récente reste 'pending' puis 'unconfirmed'", () => {
  interactions.reset();
  // Émission ancienne (au-delà du seuil pending de 12 s) → unconfirmed.
  const old = new Date(Date.now() - 20_000).toISOString();
  onEvent(ev({ action: "send_message", device_id: "A", received_at: old, meta: { convId: "C1" } }));
  const rec = snapshot().recent.find((r) => r.kind === "message");
  assert.equal(rec.status, "unconfirmed");
});

test("plusieurs appareils récepteurs sont tous crédités, une fois chacun", () => {
  interactions.reset();
  onEvent(ev({ action: "like_post", device_id: "A", meta: { postId: "P4" } }));
  onEvent(ev({ type: "rt_recv", action: "like", device_id: "B", meta: { postId: "P4" } }));
  onEvent(ev({ type: "rt_recv", action: "like", device_id: "C", meta: { postId: "P4" } }));
  onEvent(ev({ type: "rt_recv", action: "like", device_id: "B", meta: { postId: "P4" } })); // doublon B
  const rec = snapshot().recent.find((r) => r.kind === "like");
  assert.equal(rec.receiptCount, 2, "B et C, sans double comptage de B");
});

test("les événements non-interaction sont ignorés", () => {
  interactions.reset();
  assert.equal(onEvent(ev({ type: "nav", action: "screen_view" })), false);
  assert.equal(onEvent(ev({ type: "api", action: "GET /posts" })), false);
  assert.equal(snapshot().recent.length, 0);
});

test("publish est vérifiable par proximité temporelle (sans id partagé)", () => {
  interactions.reset();
  onEvent(ev({ action: "publish_post", device_id: "A", meta: { postId: "local_1" } }));
  // La réception porte l'id serveur (différent) → appariement heuristique par le temps.
  onEvent(ev({ type: "rt_recv", action: "post", device_id: "B", meta: { postId: "uuid-serveur" } }));
  const rec = snapshot().recent.find((r) => r.kind === "publish");
  assert.equal(rec.status, "delivered");
  assert.equal(rec.idCorrelated, false);
});
