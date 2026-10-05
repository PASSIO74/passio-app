// CLAUDE.md court, journal indexé (2026-10-05) — scripts/audit-claude-md.js.
//
// Ramené à 18 Ko le 2026-08-07, CLAUDE.md était remonté à 410 000 caractères en
// deux mois : une fiche datée par lot. Ce banc fait tourner l'audit sur le DÉPÔT
// RÉEL (①) — c'est lui qui tient la règle en CI, avec tous les tests unitaires —
// puis éprouve chacune de ses trois règles (②③④).
// MUTATIONS : relever LIMITE à l'infini (②) ; ne plus vérifier l'existence des
// renvois (③) ; ne plus exiger que CLAUDE.md cite chaque fichier du journal (④).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { verifier, LIMITE } = require("../../scripts/audit-claude-md.js");

const journalReel = () => fs.readdirSync("docs/journal").filter((f) => f.endsWith(".md") && f !== "README.md");

test("① le dépôt réel passe : CLAUDE.md sous le plafond, chaque renvoi vivant, chaque domaine cité", () => {
  const claude = fs.readFileSync("CLAUDE.md", "utf8");
  assert.deepEqual(verifier({ claude, journal: journalReel(), existe: (c) => fs.existsSync(c) }), []);
  assert.ok(journalReel().length >= 7, "les sept domaines du 2026-10-05");
});

test("② au-delà de 40 000 caractères, l'audit refuse — et dit où va la fiche", () => {
  assert.equal(LIMITE, 40000);
  const fautes = verifier({ claude: "x".repeat(LIMITE + 1), journal: [], existe: () => true });
  assert.equal(fautes.length, 1);
  assert.match(fautes[0], /docs\/journal/);
  assert.deepEqual(verifier({ claude: "x".repeat(LIMITE), journal: [], existe: () => true }), [], "le plafond lui-même passe");
});

test("③ un renvoi vers un fichier absent est une faute", () => {
  const fautes = verifier({ claude: "lis docs/journal/fantome.md et docs/lots-ui/INDEX.md", journal: [], existe: (c) => c === "docs/lots-ui/INDEX.md" });
  assert.equal(fautes.length, 1);
  assert.match(fautes[0], /fantome\.md/);
});

test("④ un fichier du journal que CLAUDE.md ne cite pas est une faute", () => {
  const fautes = verifier({ claude: "→ docs/journal/a.md", journal: ["a.md", "b.md"], existe: () => true });
  assert.equal(fautes.length, 1);
  assert.match(fautes[0], /b\.md/);
});
