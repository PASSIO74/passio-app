// Verrous des lanceurs Windows. Le 2026-11-04, `netstat -ano` (Windows 11 build
// 26300) n'affichait plus l'écoute de [::]:4610 : Lancer-Pilotage.cmd concluait
// « port libre » alors que le superviseur tenait le serveur en vie, et démarrait
// un second serveur mort aussitôt sur EADDRINUSE — le pilotage ne s'ouvrait plus.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dash = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = (fichier) => fs.readFileSync(path.join(dash, fichier), "utf8")
  .split(/\r?\n/).filter((l) => !/^\s*rem\b/i.test(l)).join("\n");

for (const f of ["Lancer-Pilotage.cmd", "Relancer-Pilotage.cmd", "Arreter-Pilotage.cmd"]) {
  test(`${f} cherche le port avec pid-port.ps1, jamais avec netstat`, () => {
    assert.doesNotMatch(code(f), /netstat/i);
    assert.match(code(f), /scripts.pid-port\.ps1/);
  });
}

test("Arreter-Pilotage.cmd n'écrit pas de = dans un for /f (cmd le remplace par une espace)", () => {
  // -Filter "Name='node.exe'" devenait "Name 'node.exe'" : requête refusée, les
  // superviseurs sans fichier PID survivaient en silence.
  assert.doesNotMatch(code("Arreter-Pilotage.cmd"), /-Filter/);
});

test("pid-port.ps1 ne filtre pas sur l'état Listen (vide sur le build fautif)", () => {
  const ps = fs.readFileSync(path.join(dash, "scripts/pid-port.ps1"), "utf8")
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.match(ps, /RemotePort -eq 0/);
  assert.doesNotMatch(ps, /State -eq/);
});

test("Lancer-Pilotage.cmd sonde /api/health et n'exige pas de voir le port pour ouvrir", () => {
  const lanceur = code("Lancer-Pilotage.cmd");
  const sonde = lanceur.indexOf("/api/health");
  assert.ok(sonde >= 0, "sonde de vie absente");
  assert.ok(sonde < lanceur.indexOf("node server/start.js"), "la sonde doit précéder le démarrage");
  // La sonde ne doit pas être conditionnée à la détection du port.
  assert.doesNotMatch(lanceur.slice(0, sonde), /if defined HOLDER_PID \(/);
});
