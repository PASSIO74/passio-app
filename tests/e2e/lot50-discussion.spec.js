// ═══════════════════════════════════════════════════════════════════════════
// LOT-50 (audit UX/UI du 2026-11-10, FIL-C05) — UN NOM, UNE FORME
// Le même fil s'écrivait « Discussion (N) », « Discussion · N » ou
// « Commentaires (N) ». Une seule forme : « Discussion (N) », partout où le
// code l'écrit. (Le compte inclut les réponses chargées : choix de #900,
// verrouillé par capacite-fil-compteurs.)
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

test("FIL-C05 : « Discussion (N) » est la seule forme écrite par le code", () => {
  const racine = path.join(__dirname, "..", "..");
  const sources = ["js/app-02-state-utils.js", "js/app-04-comments-shop.js"].map((f) => fs.readFileSync(path.join(racine, f), "utf8")).join("\n");
  expect(sources).not.toMatch(/"Discussion · "/);
  expect(sources).not.toMatch(/Commentaires \(\$\{/);
  const formes = sources.match(/Discussion \(/g) || [];
  expect(formes.length).toBeGreaterThanOrEqual(4);
});
