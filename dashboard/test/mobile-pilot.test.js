import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");
const read = (p) => fs.readFileSync(path.join(pub, p), "utf8");

test("mobile pilot is installable and starts on mobile.html", () => {
  const m = JSON.parse(read("mobile-manifest.webmanifest"));
  assert.equal(m.start_url, "/mobile.html");
  assert.equal(m.display, "standalone");
});

test("mobile service worker never caches API responses", () => {
  const sw = read("mobile-sw.js");
  assert.match(sw, /pathname\.startsWith\("\/api\/"\).*return/);
});

test("mobile static assets are network-first with cache only as offline fallback", () => {
  const sw = read("mobile-sw.js");
  assert.match(sw, /await fetch\(event\.request, \{ cache: "no-cache" \}\)/);
  assert.match(sw, /await caches\.match\(event\.request\)/);
  assert.doesNotMatch(sw, /caches\.match\(event\.request\)\.then\(hit => hit \|\| fetch/);
});

test("mobile surface exposes only whitelisted test launcher and no arbitrary git console", () => {
  const js = read("js/mobile.js");
  assert.match(js, /\/tests\/run/);
  assert.doesNotMatch(js, /\/git\/apply|\/git\/branch|exec\(|spawn\(/);
});

test("one unavailable domain cannot blank the whole mobile cockpit", () => {
  const js = read("js/mobile.js\");
  assert.match(js, /Promise\.allSettled/);
  assert.doesNotMatch(js, /Promise\.all\(/);
  assert.match(js, /domaine\(s\) indisponible\(s\).*autres preuves restent affichées/);
});

test("Sentinel is visible from mobile but remains read-only", () => {
  const html = read("mobile.html");
  const js = read("js/mobile.js");
  assert.match(html, /data-tab="sentinel"/);
  assert.match(js, /\/sentinel\?limit=20/);
  assert.doesNotMatch(js, /\/sentinel\/toggle|\/sentinel\/[^"']+\/merge/);
});

test("mobile renders autopilot result without exposing a mutation endpoint", () => {
  const js = read("js/mobile.js");
  assert.match(js, /repair\?\.autopilot\?\.status/);
  assert.doesNotMatch(js, /autopilot.*fetch|\/autopilot/);
});
