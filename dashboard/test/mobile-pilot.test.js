// ═══════════════════════════════════════════════════════════════════════════
// PILOT MOBILE DU PC — RETIRÉ le 2026-10-23.
//
// Il doublait le pilotage en ligne (https://passio-app.netlify.app/pilotage/)
// en exigeant le PC allumé et le même Wi-Fi. Ces verrous gardent le RETRAIT
// propre :
//   · /mobile.html ne charge plus aucun script : c'est un renvoi vers le
//     pilotage en ligne, pour les icônes déjà posées sur un écran d'accueil ;
//   · /mobile-sw.js se DÉSINSTALLE là où il s'était installé (localhost est un
//     contexte sécurisé : il contrôlait la racine du Control Center). Un 404 à
//     sa place l'aurait laissé servir l'ancienne page depuis son cache ;
//   · plus rien ne pointe vers l'ancienne surface.
// MUTATIONS : remettre un gestionnaire `fetch` dans le SW, ou retirer
// `registration.unregister()` → ② rougit ; remettre un <script> dans
// mobile.html → ① rougit.
// ═══════════════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");
const read = (p) => fs.readFileSync(path.join(pub, p), "utf8");
const PILOTAGE = "https://passio-app.netlify.app/pilotage/";

test("① /mobile.html n'est plus qu'un renvoi vers le pilotage en ligne, sans aucun script", () => {
  const html = read("mobile.html");
  assert.doesNotMatch(html, /<script/i, "la page retirée ne charge plus de code");
  assert.ok(html.includes(`content="2;url=${PILOTAGE}"`), "renvoi automatique");
  assert.ok(html.includes(`id="nouveauPilotage" class="btn" href="${PILOTAGE}"`), "et un lien à toucher");
  assert.doesNotMatch(html, /rel="manifest"/, "plus rien à installer depuis cette adresse");
  assert.doesNotMatch(html, /api\//, "aucune donnée du pilotage n'y est lue");
});

test("② /mobile-sw.js vide ses caches, se désinscrit, et n'intercepte plus rien", () => {
  const sw = read("mobile-sw.js");
  assert.match(sw, /self\.skipWaiting\(\)/, "il remplace l'ancien sans attendre");
  assert.match(sw, /k\.startsWith\("passio-pilot-"\)/, "il ne vide QUE ses propres caches");
  assert.match(sw, /self\.registration\.unregister\(\)/);
  assert.doesNotMatch(sw, /addEventListener\("fetch"/, "aucun gestionnaire fetch : tout passe par le réseau");
});

test("③ l'ancienne surface est partie, et plus rien ne la sert ni n'y renvoie", () => {
  for (const f of ["js/mobile.js", "css/mobile.css", "mobile-manifest.webmanifest"]) {
    assert.equal(fs.existsSync(path.join(pub, f)), false, f + " doit être retiré");
  }
  assert.equal(fs.existsSync(path.join(here, "..", "Autoriser-Telephone.cmd")), false, "plus de port à ouvrir pour le téléphone");
  for (const f of ["index.html", "command.html", "js/app.js", "js/command.js"]) {
    assert.doesNotMatch(read(f), /mobile\.html|js\/mobile\.js|css\/mobile\.css/, f + " renvoie encore vers le Pilot retiré");
  }
});
