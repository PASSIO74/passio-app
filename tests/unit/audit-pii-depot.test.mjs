// Gate « aucune adresse de personne dans un dépôt public » (scripts/audit-pii-depot.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { analyser, admise, masquer } = require("../../scripts/audit-pii-depot.js");
// Composées ici : ce fichier passe lui-même sous la gate.
const A = "@", G = "gmail" + ".com";

test("① une adresse de messagerie réelle est trouvée, avec sa ligne", () => {
  const t = analyser("rien ici\nle compte prenom.nom" + A + G + " a été créé\nni là");
  assert.equal(t.length, 1);
  assert.equal(t[0].ligne, 2);
});

test("② les adresses d'essai, techniques et publiques du projet passent", () => {
  for (const a of ["x@passio-e2e.test", "a@example.com", "a@exemple.fr", "a@b.test", "noreply@anthropic.com", "rua@dmarc.brevo.com", "contact@passio-app.fr"]) {
    assert.equal(admise(a), true, a);
  }
});

test("③ ce qui n'est pas une adresse ne bloque personne", () => {
  for (const a of ["image@2x.png", "paquet@1.2.3.tgz", "git@github.com"]) assert.equal(admise(a), true, a);
});

test("④ un domaine d'essai ne se contrefait pas en préfixe", () => {
  assert.equal(admise("a" + A + "test." + G), false);
  assert.equal(admise("a" + A + "exemple.fr." + G), false);
});

test("⑤ la sortie ne recopie jamais l'adresse en clair : un journal de CI est public", () => {
  assert.equal(masquer("prenom.nom" + A + G), "p…" + A + G);
});
