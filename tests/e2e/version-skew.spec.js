// ═══════════════════════════════════════════════════════════════════════════
// VERSION SKEW — un client ne doit JAMAIS exécuter un mélange de versions.
//
// Incident F5 (analyse croisée du 2026-08-15). Sur PASSIO, tout push sur `main`
// déploie : le décalage de version est GARANTI PAR CONSTRUCTION dès qu'un
// utilisateur garde l'app ouverte pendant un déploiement. Pas besoin d'un bug de
// service worker pour se retrouver avec deux versions actives.
//
// L'architecture actuelle est saine, et ce spec existe pour qu'elle le RESTE.
// Elle tient sur un équilibre à trois pièces, dont aucune ne se suffit :
//
//   1. `index.html` en `no-store` + network-first dans le SW → on récupère
//      toujours le manifeste de la dernière version ;
//   2. les 9 scripts `app/` / `styles.css` en `immutable` (un an) → zéro requête
//      inutile ;
//   3. l'URL de CHACUN porte le HASH DE SON CONTENU → un fichier modifié = une
//      nouvelle URL (et seulement la sienne : 2026-11-09, un `app.js` unique avant).
//
// Le point 2 n'est sûr QUE grâce au point 3. Si un hash devenait figé ou
// disparaissait, `immutable` cesserait d'être une optimisation pour devenir un
// piège : les clients resteraient bloqués un AN sur du code périmé, sans aucun
// moyen de les rattraper. C'est précisément ce que ce spec empêche.
// ═══════════════════════════════════════════════════════════════════════════
const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const racine = path.resolve(__dirname, "..", "..");
const lire = (p) => fs.readFileSync(path.join(racine, p), "utf8");
const hash10 = (buf) => crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);

test.describe("Version skew — cohérence des versions servies", () => {
  test.beforeAll(() => {
    execSync("node scripts/build.js dist/index.html", { cwd: racine, timeout: 60000 });
  });

  test("le hash de chaque asset vient RÉELLEMENT de son contenu", async () => {
    const html = lire("dist/index.html");

    // Les 9 scripts du bloc app, lus dans le chargeur (scripts/build.js, étape 1).
    const scripts = [...html.matchAll(/"(app\/app-0\d[\w-]*\.js)\?v=([a-f0-9]+)"/g)];
    expect(scripts.length, "le chargeur de dist/index.html doit citer les 9 scripts du bloc app").toBe(9);
    expect(fs.existsSync(path.join(racine, "dist/app.js")), "plus de monolithe dist/app.js").toBe(false);
    const references = [
      ...scripts.map((m) => ["dist/" + m[1], m[2]]),
      ["dist/styles.css", (/styles\.css\?v=([a-f0-9]+)/.exec(html) || [])[1]],
    ];
    for (const [fichier, hash] of references) {
      expect(hash, `${fichier} doit être référencé avec un ?v=<hash> dans index.html`).toBeTruthy();

      const attendu = hash10(fs.readFileSync(path.join(racine, fichier)));
      expect(
        hash,
        `Le hash de ${fichier} dans index.html (${hash}) ne correspond pas à son contenu ` +
        `(${attendu}). Or ce fichier est servi en « immutable » pendant un an : un hash ` +
        `qui ne suit pas le contenu bloque les clients sur du code périmé, sans rattrapage.`,
      ).toBe(attendu);
    }
  });

  test("deux contenus différents produisent deux URL différentes", async () => {
    // Le vrai test du cache-busting : ce n'est pas qu'un hash EXISTE, c'est
    // qu'il CHANGE. On le prouve sur le mécanisme lui-même plutôt qu'en
    // modifiant une source (qu'un test interrompu laisserait salie). Que la
    // modification d'UN fichier ne change QUE son URL : tests/unit/build-id.test.mjs ⑦.
    const app = fs.readFileSync(path.join(racine, "dist/app/app-04-comments-shop.js"));
    const modifie = Buffer.concat([app, Buffer.from("\n// octet de plus\n")]);
    expect(hash10(modifie), "un contenu modifié doit produire un hash différent")
      .not.toBe(hash10(app));
  });

  test("index.html n'est jamais mis en cache, les assets hachés le sont", async () => {
    const headers = lire("_headers");
    // Les assets hachés : un an, immutable (le point 2 de l'équilibre ci-dessus).
    expect(headers, "/app/* (les 9 scripts du bloc app) doit rester immutable").toMatch(
      /\n\/app\/\*\s*\n\s*Cache-Control:[^\n]*immutable/,
    );

    // Si index.html devenait cacheable, un nouveau déploiement n'atteindrait
    // plus jamais les clients existants : le manifeste resterait figé, donc
    // les anciennes URL d'assets aussi.
    expect(headers, "/index.html doit rester non cacheable").toMatch(
      /\/index\.html\s*\n\s*Cache-Control:[^\n]*no-store/,
    );
    expect(headers, "la racine / doit rester non cacheable").toMatch(
      /\n\/\s*\n\s*Cache-Control:[^\n]*no-store/,
    );
    // sw.js non plus : c'est lui qui pilote la mise à jour.
    expect(headers, "/sw.js doit rester non cacheable").toMatch(
      /\/sw\.js\s*\n\s*Cache-Control:[^\n]*no-store/,
    );
  });

  test("le service worker sert index.html par le RÉSEAU d'abord", async () => {
    const sw = lire("sw.js");
    // Un basculement en cache-first sur index.html ré-introduirait exactement
    // le défaut corrigé auparavant : le SW servant l'ancien manifeste, donc
    // l'ancien code, au premier chargement.
    // ⚠️ Depuis le 2026-11-09 la requête est CONDITIONNELLE (If-None-Match) : la
    // copie gardée n'est servie que sur un 304, c'est-à-dire quand LE SERVEUR dit
    // qu'elle est la version courante — le réseau décide toujours, il ne renvoie
    // simplement plus 106 Ko pour le dire (tests/e2e/sw-page-revalidee.spec.js).
    const debut = sw.indexOf('url.pathname === "/"');
    expect(debut, "la branche de navigation est introuvable").toBeGreaterThan(-1);
    const branche = sw.slice(debut, sw.indexOf("return;", debut));
    expect(branche, "index.html doit toujours partir au réseau, sans le cache HTTP")
      .toMatch(/return fetch\(requete, \{ cache: "no-store" \}\)\.then\(res => \{/);
    expect(branche, "la requête conditionnelle ne passe pas non plus par le cache HTTP")
      .toMatch(/headers: \{ "If-None-Match": etag \}, cache: "no-store"/);
    // La copie n'est rendue en ligne QUE sur un 304 ; hors ligne, par le repli.
    expect(branche.match(/return copie;/g) || [], "une seule sortie vers la copie, celle du 304").toHaveLength(1);
    expect(branche).toMatch(/if \(res && res\.status === 304 && copie\) return copie;/);
  });

  test("le cache du service worker change à chaque build", async () => {
    // Sans ça, un nouveau déploiement laisserait l'ancien cache en place et les
    // anciens assets continueraient d'être servis.
    const sw = lire("dist/sw.js");
    const m = /passio-v([a-f0-9]+)/.exec(sw);
    expect(m, "dist/sw.js doit porter un identifiant de build").toBeTruthy();
    expect(m[1].length, "l'identifiant de build doit être un hash, pas une constante")
      .toBeGreaterThanOrEqual(8);

    // Et il doit dériver du contenu réellement déployé : le build le calcule sur la
    // page et ses scripts inlinés, les 9 scripts app/ et le CSS. La preuve par mutation est dans
    // tests/unit/build-id.test.mjs ; ici, seul le câblage du source est vérifié.
    const source = lire("sw.js");
    expect(source, "le source doit laisser le build injecter l'identifiant")
      .toMatch(/const CACHE = "passio-v"/);
  });
});
