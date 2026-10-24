import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "..", "public", "index.html"), "utf8");

// Le Pilot mobile du PC est retiré (2026-10-23) : l'entrée de l'en-tête mène au
// pilotage EN LIGNE, joignable partout, PC éteint compris.
test("le Control Center mène au pilotage en ligne", () => {
  assert.match(html, /href="https:\/\/passio-app\.netlify\.app\/pilotage\/"[^>]*>Pilotage<\/a>/);
});

test("l'entrée Pilotage n'est qu'une navigation, jamais une commande", () => {
  const match = html.match(/<a[^>]+href="https:\/\/passio-app\.netlify\.app\/pilotage\/"[^>]*>Pilotage<\/a>/);
  assert.ok(match);
  assert.doesNotMatch(match[0], /onclick=|data-action=|\/api\//);
  assert.match(match[0], /rel="noopener"/);
});
