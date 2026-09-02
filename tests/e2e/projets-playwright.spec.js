// Verrou de la partition `prod` / `local` de playwright.config.js.
//
// POURQUOI CE TEST EXISTE. Depuis le 2026-09-02 la CI ne lance plus une suite
// unique sous verrou global, mais deux projets : `test-prod` (verrou
// `passio-e2e-prod`, clé service_role, purge des comptes) et quatre shards
// `test-local` SANS verrou. Le gain est réel — 28 min de Playwright deviennent
// ~7 min, et une PR n'attend plus qu'un run de `main` libère la base.
//
// Le prix, c'est un invariant à tenir : TOUTE suite qui crée un compte sur la
// prod doit être déclarée dans SUITES_PROD. Oubliée, elle part dans `local`,
// donc hors verrou, donc EN MÊME TEMPS que le job prod — et comme
// `global-teardown` purge les comptes PAR MOTIF, les deux s'effacent
// mutuellement leurs comptes. C'est très exactement l'incident du 2026-09-01
// (`main` rouge, déploiement production sauté, symptôme qui ne désignait rien :
// un test de lien profond recevait la bobine d'un compte de test étranger).
//
// Un commentaire ne tient pas cet invariant : personne ne le relit en ajoutant
// un fichier. Ce test, si.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const DOSSIER = __dirname;
const CONFIG = path.join(DOSSIER, "..", "..", "playwright.config.js");

/** Les helpers qui, directement ou non, inscrivent un compte en production. */
const HELPERS_A_COMPTES = ["compte-e2e", "qa-helper"];

function suitesDeclarees() {
  const src = fs.readFileSync(CONFIG, "utf8");
  const bloc = /const SUITES_PROD = \[([\s\S]*?)\];/.exec(src);
  if (!bloc) return null;
  return [...bloc[1].matchAll(/"([^"]+\.spec\.js)"/g)].map((m) => m[1]);
}

test("la partition prod/local est déclarée dans playwright.config.js", async () => {
  const declarees = suitesDeclarees();
  // Un `null` ici veut dire que la constante a été renommée ou supprimée : le
  // reste du fichier ne pourrait alors que rendre des verts vides.
  expect(declarees, "SUITES_PROD introuvable dans playwright.config.js").not.toBeNull();
  expect(declarees.length).toBeGreaterThan(0);
});

test("toute suite qui crée un compte en production est déclarée dans SUITES_PROD", async () => {
  const declarees = new Set(suitesDeclarees() || []);
  const manquantes = [];

  for (const nom of fs.readdirSync(DOSSIER).filter((f) => f.endsWith(".spec.js"))) {
    const src = fs.readFileSync(path.join(DOSSIER, nom), "utf8");
    // On cherche l'IMPORT du helper, pas une mention dans un commentaire : ce
    // fichier-ci nomme `compte-e2e` en toutes lettres sans jamais l'appeler.
    const importe = HELPERS_A_COMPTES.some((h) =>
      new RegExp(`require\\([\"'][^\"']*${h}[\"']\\)`).test(src)
    );
    if (importe && !declarees.has(nom)) manquantes.push(nom);
  }

  expect(
    manquantes,
    `Ces suites créent des comptes en production mais ne sont pas déclarées dans ` +
      `SUITES_PROD (playwright.config.js). Non déclarées, elles tournent hors du ` +
      `verrou passio-e2e-prod et effacent les comptes du job test-prod en plein vol.`
  ).toEqual([]);
});

test("aucune suite déclarée prod n'a disparu du dossier", async () => {
  // Une entrée morte dans SUITES_PROD serait silencieuse : le projet `prod`
  // n'aurait plus qu'à rétrécir sans que personne s'en aperçoive.
  const absentes = (suitesDeclarees() || []).filter(
    (nom) => !fs.existsSync(path.join(DOSSIER, nom))
  );
  expect(absentes, "entrées de SUITES_PROD sans fichier correspondant").toEqual([]);
});
