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

// ── Une écriture ratée ne tue plus le processus (2026-09-13) ─────────────────
// 22 plantages ENOSPC en dix jours : `save()` levait hors de tout try depuis des
// minuteurs. Mutation : remettre `save()` sans try/catch rougit « ne lève pas ».
test("JsonDb : une écriture impossible ne lève pas, est exposée par health(), et le succès suivant réarme", () => {
  const name = `jsondb-write-fail-${process.pid}-${Date.now()}`;
  const file = path.join(config.dataDir, name + ".json");
  cleanup(file);
  const db = new JsonDb(name, { n: 0 });
  // On rend le fichier CIBLE non remplaçable : un dossier à sa place fait échouer renameSync.
  fs.rmSync(file, { force: true });
  fs.mkdirSync(file, { recursive: true });
  try {
    assert.doesNotThrow(() => db.update((d) => { d.n = 1; }), "la donnée est en mémoire, l'écriture échoue, le processus vit");
    assert.equal(db.get().n, 1, "la mémoire est la vérité");
    const h = db.health();
    assert.equal(h.available, false);
    assert.match(h.reason, /^write_failed:/);
    assert.equal(h.writeFailures, 1);
    assert.doesNotThrow(() => db.update((d) => { d.n = 2; }));
    assert.equal(db.health().writeFailures, 2, "les échecs consécutifs sont comptés");
  } finally {
    fs.rmSync(file, { recursive: true, force: true });
  }
  // Le disque « revient » : la prochaine écriture réussit et réarme l'état sain.
  try {
    db.update((d) => { d.n = 3; });
    assert.deepEqual(db.health(), { available: true, reason: null });
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).n, 3, "tout ce qui manquait au disque est réécrit");
  } finally {
    cleanup(file);
  }
});
