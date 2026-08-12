// Tests du moteur de traces bout-en-bout (chaîne de validation par action).
import { test } from "node:test";
import assert from "node:assert/strict";
import { traces } from "../server/traces.js";

// Fabrique d'événements normalisés minimalistes.
let seq = 0;
function ev(type, action, over = {}) {
  seq++;
  return {
    id: "e" + seq, event_id: "e" + seq,
    type, action,
    ts: over.ts != null ? over.ts : Date.now(),
    status: over.status || "ok",
    severity: over.severity || "info",
    duration_ms: over.duration_ms ?? null,
    user_id: over.user_id || "u1", user_label: over.user_label || "Alice",
    session_id: over.session_id || "s1", device_id: over.device_id || "dA",
    screen: over.screen || "messages",
    endpoint: over.endpoint || null, http_status: over.http_status ?? null,
    correlation_id: over.correlation_id || null,
    meta: over.meta || {},
  };
}

function reset() { traces.reset(); }

test("succès complet : handler → requête → enregistré = success", () => {
  reset();
  const cid = "c_ok";
  const t0 = Date.now();
  traces.onEvent(ev("flow", "start", { correlation_id: cid, ts: t0, meta: { flow_action: "send_message", convId: "conv9" } }));
  traces.onEvent(ev("api", "POST /conv_messages", { correlation_id: cid, ts: t0 + 100, endpoint: "x/conv_messages", http_status: 201 }));
  traces.onEvent(ev("flow", "step", { correlation_id: cid, ts: t0 + 150, meta: { step: "saved" } }));
  traces.onEvent(ev("flow", "end", { correlation_id: cid, ts: t0 + 160 }));

  const tr = traces.trace(cid);
  assert.equal(tr.final, "success");
  assert.equal(tr.steps.find((s) => s.key === "request").status, "ok");
  assert.equal(tr.steps.find((s) => s.key === "saved").status, "ok");
});

test("clic mort : handler seul, aucune requête, figé = dead_click", () => {
  reset();
  const cid = "c_dead";
  const old = Date.now() - 20_000; // au-delà de RUNNING_MS → figé
  traces.onEvent(ev("flow", "start", { correlation_id: cid, ts: old, meta: { flow_action: "send_message", convId: "convD" } }));

  const tr = traces.trace(cid);
  assert.equal(tr.final, "dead_click");
  assert.equal(tr.steps.find((s) => s.key === "request").status, "missing");
});

test("échec d'enregistrement : requête OK mais saved=fail = failed", () => {
  reset();
  const cid = "c_fail";
  const t0 = Date.now();
  traces.onEvent(ev("flow", "start", { correlation_id: cid, ts: t0, meta: { flow_action: "send_message", convId: "convF" } }));
  traces.onEvent(ev("api", "POST /conv_messages", { correlation_id: cid, ts: t0 + 50, endpoint: "x/conv_messages", http_status: 403 }));
  traces.onEvent(ev("flow", "step", { correlation_id: cid, ts: t0 + 60, status: "error", meta: { step: "saved" } }));
  traces.onEvent(ev("flow", "end", { correlation_id: cid, ts: t0 + 70, status: "error" }));

  const tr = traces.trace(cid);
  assert.equal(tr.final, "failed");
  assert.equal(tr.steps.find((s) => s.key === "saved").status, "fail");
});

test("livraison non confirmée (mono-appareil) n'altère PAS le verdict = success", () => {
  reset();
  const cid = "c_part";
  const old = Date.now() - 20_000;
  traces.onEvent(ev("flow", "start", { correlation_id: cid, ts: old, meta: { flow_action: "send_message", convId: "convP" } }));
  traces.onEvent(ev("api", "POST /conv_messages", { correlation_id: cid, ts: old + 50, endpoint: "x/conv_messages", http_status: 201 }));
  traces.onEvent(ev("flow", "step", { correlation_id: cid, ts: old + 60, meta: { step: "saved" } }));

  const tr = traces.trace(cid);
  // saved OK → success ; delivered « non confirmé » reste purement informatif.
  assert.equal(tr.final, "success");
  assert.equal(tr.steps.find((s) => s.key === "delivered").status, "unconfirmed");
});

test("partiel réel : requête en échec mais message finalement enregistré = partial", () => {
  reset();
  const cid = "c_realpart";
  const old = Date.now() - 20_000;
  traces.onEvent(ev("flow", "start", { correlation_id: cid, ts: old, meta: { flow_action: "send_message", convId: "convRP" } }));
  traces.onEvent(ev("api", "POST /conv_messages", { correlation_id: cid, ts: old + 50, endpoint: "x/conv_messages", http_status: 500, status: "error" }));
  traces.onEvent(ev("flow", "step", { correlation_id: cid, ts: old + 900, meta: { step: "saved" } })); // le retry a fini par passer

  const tr = traces.trace(cid);
  assert.equal(tr.final, "partial");
  assert.equal(tr.steps.find((s) => s.key === "request").status, "fail");
  assert.equal(tr.steps.find((s) => s.key === "saved").status, "ok");
});

test("livraison cross-device : rt_recv sur un autre appareil confirme delivered", () => {
  reset();
  const cid = "c_deliv";
  const t0 = Date.now();
  traces.onEvent(ev("flow", "start", { correlation_id: cid, ts: t0, device_id: "dA", meta: { flow_action: "send_message", convId: "convX" } }));
  traces.onEvent(ev("api", "POST /conv_messages", { correlation_id: cid, ts: t0 + 40, endpoint: "x/conv_messages", http_status: 201 }));
  traces.onEvent(ev("flow", "step", { correlation_id: cid, ts: t0 + 50, meta: { step: "saved" } }));
  // Réception sur un AUTRE appareil (dB) → livraison prouvée.
  traces.onEvent(ev("rt_recv", "message", { ts: t0 + 300, device_id: "dB", user_id: "u2", meta: { convId: "convX" } }));

  const tr = traces.trace(cid);
  assert.equal(tr.steps.find((s) => s.key === "delivered").status, "ok");
  assert.equal(tr.final, "success");
});

test("même appareil ne compte PAS comme livraison cross-device", () => {
  reset();
  const cid = "c_same";
  const t0 = Date.now();
  traces.onEvent(ev("flow", "start", { correlation_id: cid, ts: t0, device_id: "dA", meta: { flow_action: "send_message", convId: "convS" } }));
  traces.onEvent(ev("flow", "step", { correlation_id: cid, ts: t0 + 20, meta: { step: "saved" } }));
  traces.onEvent(ev("rt_recv", "message", { ts: t0 + 100, device_id: "dA", meta: { convId: "convS" } }));

  const tr = traces.trace(cid);
  assert.equal(tr.steps.find((s) => s.key === "delivered").status, "pending");
});

test("doublon : deux flows même user+action+cible rapprochés → duplicate", () => {
  reset();
  const t0 = Date.now();
  traces.onEvent(ev("flow", "start", { correlation_id: "d1", ts: t0, meta: { flow_action: "send_message", convId: "convDup" } }));
  traces.onEvent(ev("flow", "start", { correlation_id: "d2", ts: t0 + 500, meta: { flow_action: "send_message", convId: "convDup" } }));

  const t2 = traces.trace("d2");
  assert.equal(t2.duplicate, true);
});

test("step/end sans start connu est ignoré (aucune invention)", () => {
  reset();
  const r = traces.onEvent(ev("flow", "step", { correlation_id: "ghost", meta: { step: "saved" } }));
  assert.equal(r, false);
  assert.equal(traces.trace("ghost"), null);
});

test("running : flow récent et incomplet reste « en cours »", () => {
  reset();
  const cid = "c_run";
  traces.onEvent(ev("flow", "start", { correlation_id: cid, ts: Date.now(), meta: { flow_action: "send_message", convId: "convR" } }));
  const tr = traces.trace(cid);
  assert.equal(tr.final, "running");
});

test("snapshot : totaux + incidents dédupliqués par (action+étape)", () => {
  reset();
  const old = Date.now() - 20_000;
  // deux échecs de saved sur send_message → un seul incident, count 2
  for (const cid of ["f1", "f2"]) {
    traces.onEvent(ev("flow", "start", { correlation_id: cid, ts: old, user_id: cid, meta: { flow_action: "send_message", convId: "c_" + cid } }));
    traces.onEvent(ev("flow", "step", { correlation_id: cid, ts: old + 10, status: "error", meta: { step: "saved" } }));
  }
  const snap = traces.snapshot();
  assert.equal(snap.totals.failed, 2);
  const inc = snap.incidents.find((i) => i.action === "send_message");
  assert.ok(inc, "incident présent");
  assert.equal(inc.count, 2);
  assert.equal(inc.users, 2);
});

test("api non taguée (sans correlation_id) n'est rattachée à aucun flow", () => {
  reset();
  const r = traces.onEvent(ev("api", "GET /x", { endpoint: "x/y", http_status: 200 }));
  assert.equal(r, false);
});
