// Config Playwright — tests smoke de PASSIO
// Lance un serveur statique local puis teste l'app comme un vrai navigateur.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  // Les specs gate/dist sont sensibles au timing : sous forte parallélisation
  // (tous les cœurs) le serveur statique partagé sature et provoque de faux
  // rouges. On borne les workers (moins de contention) et on remonte les retries
  // à 2 (un flake ponctuel repasse en « flaky », jamais en « failed »).
  retries: 2,
  workers: process.env.CI ? 2 : "50%",
  // Après une suite multi-comptes (PASSIO_E2E_MULTI=1) : purge des comptes
  // jetables %@passio-e2e.test en prod (best-effort, no-op sinon).
  globalTeardown: "./tests/e2e/global-teardown.js",
  // Port paramétrable : deux sessions Claude Code peuvent travailler en parallèle
  // sur ce dépôt (vécu le 2026-08-16). Sans ça, la seconde échoue sur « port déjà
  // utilisé » et, pire, `reuseExistingServer` la ferait tester le serveur de
  // l'autre — donc pas forcément le programme qu'elle croit mesurer.
  use: {
    baseURL: "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8080),
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    actionTimeout: 15000, // un clic qui ne trouve pas son élément doit échouer vite et dire lequel, pas geler le test
  },
  // Mesure de couverture fonctionnelle (PASSIO_COUVERTURE=1) : le serveur
  // statique est remplacé par un serveur qui sert les MÊMES octets plus un
  // enregistreur d'appels. Aucun test n'est modifié, aucune assertion déplacée.
  // `reuseExistingServer` passe à false : réutiliser un http-server déjà lancé
  // rendrait la mesure vide en silence — le pire des résultats, un zéro qu'on
  // prendrait pour une absence de couverture au lieu d'une absence de mesure.
  // PASSIO_CIBLE=dist : la suite tourne sur l'ARTEFACT DE PRODUCTION (monolithe
  // assemblé par scripts/build.js) au lieu des 19 fichiers de développement.
  // Aucun test n'est modifié — c'est la racine servie qui change, `/index.html`
  // devenant le fichier construit. Avant le 2026-08-16, 3 tests sur 175 seulement
  // touchaient cet artefact, et uniquement sur le gate et le démarrage.
  // `reuseExistingServer: false` : réutiliser un http-server déjà lancé servirait
  // le dev en croyant tester la prod — un vert qui ne prouverait rien.
  webServer: process.env.PASSIO_CIBLE === "dist"
    ? {
        command: "node scripts/servir-dist.js",
        url: "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8080) + "/index.html",
        reuseExistingServer: false,
        timeout: 180000,   // le build tourne avant l'écoute
      }
    : process.env.PASSIO_COUVERTURE === "1"
    ? {
        command: "node scripts/serve-couverture.js",
        url: "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8080) + "/index.html",
        reuseExistingServer: false,
        timeout: 30000,
      }
    : {
        command: "http-server -p " + (process.env.PASSIO_PORT || 8080) + " -a 127.0.0.1 -c-1 .",
        url: "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8080) + "/index.html",
        reuseExistingServer: true,
        timeout: 30000,
      },
});
