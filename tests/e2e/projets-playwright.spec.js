// Verrou de la partition `prod` / `local` de playwright.config.js.
//
// POURQUOI CE TEST EXISTE. Depuis le 2026-09-02 la CI ne lance plus une suite
// unique sous verrou global, mais deux projets : `test-prod` (verrou
// `passio-e2e-prod`, clé service_role, purge des comptes) et six shards
// `test-local` SANS verrou. Le gain est réel — 28 min de Playwright deviennent
// ~7 min, et une PR n'attend plus qu'un run de `main` libère la base.
//
// Le prix, c'est un invariant à tenir : TOUTE suite qui écrit en production doit
// être déclarée dans SUITES_PROD. Oubliée, elle part dans `local`, donc hors
// verrou, donc EN MÊME TEMPS que le job prod — et comme `global-teardown` purge
// les comptes PAR MOTIF, les deux s'effacent mutuellement les leurs. C'est très
// exactement l'incident du 2026-09-01 (`main` rouge, déploiement sauté, symptôme
// qui ne désignait rien : un test de lien profond recevait la bobine d'un compte
// de test étranger).
//
// ⚠️ CE FICHIER A DÉJÀ ÉTÉ TROP FAIBLE UNE FOIS, et c'est instructif. Sa première
// version ne cherchait qu'un `require()` LITTÉRAL de `compte-e2e` ou `qa-helper`.
// Or `suppression-compte.spec.js` crée un compte par `fetch(.../auth/v1/signup)`
// sans importer aucun helper : il n'était dans SUITES_PROD que parce qu'un humain
// s'en était souvenu. On cherche donc désormais les EFFETS — les appels qui
// touchent réellement la base — et on suit les helpers de façon TRANSITIVE.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const DOSSIER = __dirname;
const CONFIG = path.join(DOSSIER, "..", "..", "playwright.config.js");

/** Les EFFETS qui touchent la production. Un helper importé ne prouve rien ;
 *  ces motifs-là, si. Ils couvrent les trois voies constatées dans le dépôt :
 *  l'API d'administration, l'API publique d'inscription, et le SDK. */
const EFFETS = [
  /auth\/v1\/admin\/users/,          // création/suppression pré-confirmée (service_role)
  /auth\/v1\/signup/,                // inscription par REST brut
  /auth\/v1\/token\?grant_type/,     // connexion par REST brut
  /\bauth\s*\.\s*signUp\s*\(/,       // SDK
  /\bauth\s*\.\s*signInWithPassword\s*\(/,
  /creerCompteE2E/,                  // helper maison
];
// ⚠️ On NE cherche PAS le motif `passio-e2e.test` seul : créer un compte passe
// forcément par une des API ci-dessus, et le motif apparaît en commentaire dans
// des specs qui ne font aucun appel réseau (`purge-rest-parite.spec.js` compare
// deux fichiers de purge). Un verrou qui crie au loup finit ignoré.

/** Un `page.route` qui intercepte l'appel le rend inoffensif : la suite ne
 *  touche alors jamais le réseau. `confirmation-email.spec.js` est dans ce cas. */
const STUB = /page\s*\.\s*route\s*\(|__stubSupaAuth|stubbe/i;

function suitesDeclarees() {
  const src = fs.readFileSync(CONFIG, "utf8");
  const bloc = /const SUITES_PROD = \[([\s\S]*?)\];/.exec(src);
  if (!bloc) return null;
  return [...bloc[1].matchAll(/"([^"]+\.spec\.js)"/g)].map((m) => m[1]);
}

/** Playwright explore `testDir` RÉCURSIVEMENT : ce test doit en faire autant,
 *  sinon un sous-dossier créé plus tard échapperait au contrôle en silence. */
function specs(dir = DOSSIER, base = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...specs(path.join(dir, e.name), rel));
    else if (e.name.endsWith(".spec.js")) out.push(rel);
  }
  return out;
}

/** Source d'un spec + celle des helpers locaux qu'il requiert, TRANSITIVEMENT.
 *  Un helper à deux niveaux (`x.spec.js` → `mon-helper.js` → `compte-e2e.js`)
 *  échappait à la version littérale. */
function sourceEtendue(rel, vus = new Set()) {
  const abs = path.join(DOSSIER, rel);
  if (vus.has(abs) || !fs.existsSync(abs)) return "";
  vus.add(abs);
  let src = fs.readFileSync(abs, "utf8");
  for (const m of src.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)) {
    let cible = path.relative(DOSSIER, path.resolve(path.dirname(abs), m[1]));
    if (!cible.endsWith(".js")) cible += ".js";
    src += "\n" + sourceEtendue(cible, vus);
  }
  return src;
}

test("la partition prod/local est déclarée dans playwright.config.js", async () => {
  const declarees = suitesDeclarees();
  // Un `null` ici veut dire que la constante a été renommée ou supprimée : le
  // reste du fichier ne pourrait alors que rendre des verts vides.
  expect(declarees, "SUITES_PROD introuvable dans playwright.config.js").not.toBeNull();
  expect(declarees.length).toBeGreaterThan(0);
});

test("toute suite qui écrit en production est déclarée dans SUITES_PROD", async () => {
  const declarees = new Set(suitesDeclarees() || []);
  const manquantes = [];

  for (const rel of specs()) {
    if (declarees.has(path.basename(rel))) continue;
    const src = sourceEtendue(rel);
    const touche = EFFETS.filter((r) => r.test(src));
    // Une suite qui stubbe la route n'atteint jamais le réseau.
    if (touche.length && !STUB.test(src)) {
      manquantes.push(`${rel} (${touche.map((r) => r.source).join(", ")})`);
    }
  }

  expect(
    manquantes,
    "Ces suites écrivent en production mais ne sont pas déclarées dans " +
      "SUITES_PROD (playwright.config.js). Non déclarées, elles tournent hors du " +
      "verrou passio-e2e-prod et effacent les comptes du job test-prod en plein vol."
  ).toEqual([]);
});

test("aucune suite déclarée prod n'a disparu du dossier", async () => {
  // Une entrée morte dans SUITES_PROD serait silencieuse : le projet `prod`
  // n'aurait plus qu'à rétrécir sans que personne s'en aperçoive.
  const presents = new Set(specs().map((r) => path.basename(r)));
  const absentes = (suitesDeclarees() || []).filter((nom) => !presents.has(nom));
  expect(absentes, "entrées de SUITES_PROD sans fichier correspondant").toEqual([]);
});
