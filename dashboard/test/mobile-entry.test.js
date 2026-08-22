import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "..", "public", "index.html"), "utf8");

test("desktop Control Center exposes a direct mobile Pilot entry", () => {
  assert.match(html, /href="\/mobile\.html"[^>]*>Pilot<\/a>/);
});

test("mobile Pilot entry is navigation only, not a mutation control", () => {
  const match = html.match(/<a[^>]+href="\/mobile\.html"[^>]*>Pilot<\/a>/);
  assert.ok(match);
  assert.doesNotMatch(match[0], /onclick=|data-action=|\/api\//);
});
