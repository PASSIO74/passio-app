// ═══════════════════════════════════════════════════════════════════════════
// CAMPAGNE QA — servir le dernier rapport, ou dire clairement qu'il n'y en a pas.
//
// Ce module ne calcule rien : il lit un fichier écrit par la campagne e2e
// multi-comptes. Tout son intérêt tient dans ses trois réponses, qui ne doivent
// jamais se confondre à l'écran :
//   • un rapport, avec la date du fichier (savoir s'il date d'hier ou d'un mois) ;
//   • « aucune campagne exécutée », avec la commande pour en lancer une ;
//   • « fichier illisible », qui est un DÉFAUT, pas une absence.
//
// Le troisième cas est celui qui compte : un rapport tronqué ou corrompu rendu
// comme « pas encore de campagne » ferait croire à une QA jamais lancée.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "passio-qa-test-"));
process.env.DASH_DATA_DIR = TMP;
process.on("exit", () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

const { qaReport } = await import("../server/qa.js");
const { config } = await import("../server/config.js");
const FICHIER = path.join(config.dataDir, "qa-report.json");

assert.equal(config.dataDir, TMP, "le rapport de test doit être isolé");

test("aucune campagne : on le dit, et on donne la commande", () => {
  try { fs.unlinkSync(FICHIER); } catch {}
  const r = qaReport();
  assert.equal(r.configured, false);
  assert.match(r.message, /qa-campaign/, "le message doit porter la commande à lancer");
  assert.equal(r.error, undefined, "une absence n'est pas une erreur");
});

test("un rapport présent est servi tel quel, avec la date du FICHIER", () => {
  fs.writeFileSync(FICHIER, JSON.stringify({ comptes: 10, transferts: 42, echecs: 0 }));
  const r = qaReport();
  assert.equal(r.configured, true);
  assert.equal(r.comptes, 10);
  assert.equal(r.transferts, 42);
  assert.ok(r.fileUpdatedAt > 0,
    "sans la date du fichier, impossible de savoir si le rapport date d'hier ou d'un mois");
});

test("un rapport ILLISIBLE est signalé comme un défaut, pas comme une absence", () => {
  fs.writeFileSync(FICHIER, "{ceci n'est pas du JSON");
  const r = qaReport();
  assert.equal(r.configured, false);
  assert.ok(r.error, "un fichier corrompu doit remonter une erreur…");
  assert.equal(r.message, undefined,
    "…et surtout pas le message « aucune campagne exécutée », qui ferait croire " +
    "à une QA jamais lancée alors que son rapport est cassé.");
});

test("le chemin suit config.dataDir, comme tout le reste du pilotage", () => {
  // Il était calculé à part (`__dirname/../data`) : identique tant que
  // DASH_DATA_DIR n'est pas posé, faux dès qu'il l'est.
  fs.writeFileSync(FICHIER, JSON.stringify({ marqueur: "dans le dossier configuré" }));
  assert.equal(qaReport().marqueur, "dans le dossier configuré");
});
