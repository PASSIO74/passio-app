import { test } from "node:test";
import assert from "node:assert/strict";
import { store, normalize } from "../server/store.js";

function ev(over = {}) {
  return normalize({
    event_id: "e" + Math.random(), received_at: new Date().toISOString(),
    type: "action", action: "like_post", user_id: "u1", user_label: "Alice",
    session_id: "s1", device_id: "d1", platform: "ios", browser: "safari", app_version: "1.0",
    ...over,
  });
}

test("normalize convertit received_at en ms", () => {
  const e = normalize({ received_at: "2026-08-05T10:00:00.000Z", type: "nav" });
  assert.equal(typeof e.ts, "number");
  assert.ok(e.ts > 0);
});

test("add alimente devices/sessions/users et déduplique", () => {
  const e = ev();
  assert.equal(store.add(e), true);
  assert.equal(store.add(e), false, "même event_id ignoré");
  assert.ok(store.devices.has("d1"));
  assert.ok(store.sessions.has("s1"));
  assert.ok(store.users.has("u1"));
});

test("overview compte publications, messages, likes", () => {
  store.add(ev({ event_id: "p1", action: "publish_post" }));
  store.add(ev({ event_id: "m1", action: "send_message" }));
  const ov = store.overview();
  assert.ok(ov.totals.publications >= 1);
  assert.ok(ov.totals.messages >= 1);
  assert.ok(ov.totals.reactions >= 1); // like_post
});

test("les erreurs sont regroupées par empreinte", () => {
  const base = { type: "error", action: "window_error", severity: "error", message: "x is not a function", stack: "at foo (js/app-02.js:10:5)" };
  store.add(ev({ event_id: "err1", ...base }));
  store.add(ev({ event_id: "err2", ...base, device_id: "d2", user_id: "u2", user_label: "Bob" }));
  const bugs = store.bugList();
  const b = bugs.find((x) => x.message === "x is not a function");
  assert.ok(b, "un bug existe");
  assert.equal(b.count, 2, "deux occurrences regroupées");
  assert.equal(b.users, 2, "deux utilisateurs touchés");
  assert.ok(b.codeRef && /app-02\.js/.test(b.codeRef.file), "localisation extraite");
});

test("updateBug persiste le statut", () => {
  const bugs = store.bugList();
  const id = bugs[0].id;
  const updated = store.updateBug(id, { status: "en_cours" });
  assert.equal(updated.status, "en_cours");
});

test("health reflète les erreurs récentes", () => {
  const h = store.health();
  assert.ok(["operational", "minor", "degraded", "critical"].includes(h.level));
});

test("un problème de connexion remonte en bug + marque l'appareil en difficulté", () => {
  store.add(ev({ event_id: "c1", type: "connectivity", action: "offline", severity: "warn",
    status: "error", message: "Appareil passé hors ligne", device_id: "dConn", user_id: "uConn", user_label: "Testeur" }));
  // devient un « problème » visible dans la liste des bugs
  const bug = store.bugList().find((b) => b.type === "connectivity");
  assert.ok(bug, "un problème de connexion est listé");
  // l'appareil est marqué en difficulté / réseau coupé
  const dev = store.deviceList().find((d) => d.deviceId === "dConn");
  assert.ok(dev.struggling, "appareil signalé en difficulté");
  assert.ok(dev.netTrouble, "réseau coupé signalé");
  assert.ok(dev.errorCount >= 1, "compteur d'erreurs incrémenté");
});

test("un échec d'appel API compte comme problème", () => {
  store.add(ev({ event_id: "a1", type: "api", action: "GET x/posts", status: "error",
    severity: "warn", http_status: 0, endpoint: "x/rest/v1/posts", device_id: "dApi" }));
  const bug = store.bugList().find((b) => b.type === "api");
  assert.ok(bug, "un échec API est listé comme problème");
});

test("overview expose les indicateurs de connexion", () => {
  const ov = store.overview();
  assert.equal(typeof ov.totals.connectivityIssues, "number");
  assert.equal(typeof ov.totals.strugglingDevices, "number");
  assert.ok(ov.totals.connectivityIssues >= 1);
});

test("un événement de reconnexion (info) ne bloque PAS l'appareil", () => {
  store.add(ev({ event_id: "c2", type: "connectivity", action: "online", severity: "info",
    status: "ok", message: "Appareil de nouveau en ligne", device_id: "dConn", user_id: "uConn" }));
  const dev = store.deviceList().find((d) => d.deviceId === "dConn");
  assert.equal(dev.netTrouble, false, "réseau rétabli");
});
