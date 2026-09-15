// TCI-06 — le gate d'isolation ne se laisse plus satisfaire par un commentaire.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { sansCommentairesNiChaines } = require("../../scripts/audit-tests-isolation.js");

test("① un appel en commentaire disparaît, un vrai appel reste", () => {
  const src = `// sansDonneesDistantes(page) — un jour\n/* await sansDonneesDistantes(page); */\nawait page.goto("/");`;
  const code = sansCommentairesNiChaines(src);
  assert.ok(!/sansDonneesDistantes/.test(code));
  assert.match(code, /page\.goto\(/);
  assert.match(sansCommentairesNiChaines(`await sansDonneesDistantes(page); // vrai`), /sansDonneesDistantes\s*\(/);
});

test("② le contenu d'une chaîne disparaît, les délimiteurs restent ; les ${} des gabarits restent du code", () => {
  assert.equal(sansCommentairesNiChaines(`x("sansDonneesDistantes(")`), `x("")`);
  assert.equal(sansCommentairesNiChaines("const t = `a ${f(1)} b`;"), "const t = `${f(1)}`;");
  // Source analysée : 'a\'b' + c — l'apostrophe échappée ne ferme pas la chaîne.
  assert.equal(sansCommentairesNiChaines("'a\\'b' + c"), "'' + c");
});

// ASTRA-15 (contre-revue Astra, 2026-09-15) : deux contournements par du texte INERTE.
test("③ une chaîne DANS une interpolation ne vaut pas un appel ; une interpolation imbriquée non plus", () => {
  // RÉINJECTION : sur le code du 14/09, le contenu de ${…} était recopié tel quel.
  assert.equal(sansCommentairesNiChaines("`${\"sansDonneesDistantes(page)\"}`"), "`${\"\"}`");
  assert.equal(sansCommentairesNiChaines("`${`${'sansDonneesDistantes(page)'}`}`"), "`${`${''}`}`");
  assert.match(sansCommentairesNiChaines("`${await sansDonneesDistantes(page)}`"), /sansDonneesDistantes\s*\(/, "un VRAI appel dans ${…} reste un appel");
});

test("④ l'audit des tests creux : page.goto dans un commentaire ne fait pas une page réelle", async () => {
  // La classification vit dans audit-tests-creux.js, qui épure désormais la source
  // avec le même épurateur : on mesure ici que l'épurateur rend un commentaire
  // `page.goto(...)` invisible au motif PAGE_REELLE du script.
  const PAGE_REELLE = /\bpage\.goto\s*\(|\bgoto\s*\(/;
  assert.equal(PAGE_REELLE.test(sansCommentairesNiChaines("// await page.goto('/index.html')\nconst x = 1;")), false);
  assert.equal(PAGE_REELLE.test(sansCommentairesNiChaines("const s = 'page.goto(\"/\")';")), false);
  assert.equal(PAGE_REELLE.test(sansCommentairesNiChaines("await page.goto('/index.html');")), true);
  // …et que le script s'en sert bien (câblage à la source).
  const src = require("node:fs").readFileSync(new URL("../../scripts/audit-tests-creux.js", import.meta.url), "utf8");
  assert.match(src, /sansCommentairesNiChaines\(fs\.readFileSync/);
});
