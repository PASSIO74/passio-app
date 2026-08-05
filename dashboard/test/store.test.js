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
