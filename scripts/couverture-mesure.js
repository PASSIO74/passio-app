// Lance la suite e2e derrière le serveur instrumenté, puis imprime le rapport.
// Exister en tant que fichier plutôt qu'en une ligne de package.json : sous
// Windows, `VAR=1 npx …` dans un script npm passe par cmd.exe, où la variable
// n'est pas posée — la mesure sortirait vide sans que rien ne le signale.
"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const racine = path.join(__dirname, "..");
const mesure = path.join(racine, ".passio", "couverture", "observe.json");
fs.rmSync(mesure, { force: true });   // repartir d'une mesure vierge

const args = process.argv.slice(2);
const r = spawnSync("npx", ["playwright", "test", ...args], {
  cwd: racine, stdio: "inherit", shell: process.platform === "win32",
  env: { ...process.env, PASSIO_COUVERTURE: "1" },
});

console.log("");
spawnSync("node", [path.join("scripts", "couverture-rapport.js")], {
  cwd: racine, stdio: "inherit", shell: process.platform === "win32",
});
process.exit(r.status === null ? 1 : r.status);
