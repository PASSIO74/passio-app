import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JsonDb } from "../server/jsondb.js";
import { config } from "../server/config.js";

function cleanup(file) {
  try { fs.rmSync(file, { force: true }); } catch {}
  try { fs.rmSync(file + ".tmp", { force: true }); } catch {}
}

test("JsonDb reports healthy when persistence loads normally", () => {
  const name = `jsondb-health-ok-${process.pid}-${Date.now()}`;
  const file = path.join(config.dataDir, name + ".json");
  cleanup(file);
  try {
    const db = new JsonDb(name, { entries: [] });
    assert.deepEqual(db.health(), { available: true, reason: null });
  } finally {
    cleanup(file);
  }
});

test("JsonDb reports unavailable when persisted JSON is corrupted", () => {
  const name = `jsondb-health-bad-${process.pid}-${Date.now()}`;
  const file = path.join(config.dataDir, name + ".json");
  cleanup(file);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file, "{ definitely-not-json", "utf8");
  try {
    const db = new JsonDb(name, { entries: [] });
    assert.deepEqual(db.health(), { available: false, reason: "read_or_parse_failed" });
    assert.deepEqual(db.get(), { entries: [] });
  } finally {
    cleanup(file);
  }
});
