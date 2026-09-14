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
