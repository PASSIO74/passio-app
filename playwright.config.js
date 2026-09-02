// Config Playwright — tests smoke de PASSIO
// Lance un serveur statique local puis teste l'app comme un vrai navigateur.
const { defineConfig } = require("@playwright/test");

// ───────────────────────────────────────────────────────────────────────────
// DEUX PROJETS, ET C'EST CE QUI DÉBLOQUE LA CHAÎNE (2026-09-02).
//
// CE QUI COÛTAIT CHER. Le job `test` de `.github/workflows/deploy.yml` portait
// `concurrency: passio-e2e-prod`, un verrou GLOBAL au dépôt : un run de PR et un
// run de `main` ne pouvaient plus se chevaucher, ils faisaient la queue. Le motif
// est réel — trois suites créent de VRAIS comptes sur la prod Supabase et
// `global-teardown` purge TOUS les comptes `%@passio-e2e.test`, donc deux suites
// simultanées s'effacent mutuellement leurs comptes (incident du 2026-09-01).
//
// Mais ce verrou était posé sur les 120 suites alors que 7 seulement touchent la
// base — et en CI, où `PASSIO_E2E_MULTI` n'est jamais défini, 3 seulement
// (`authz-critical`, `blocage-acces`, `user-state-horodatage`). Les 113 autres
// sont du navigateur pur sur un serveur statique local : elles n'ont aucune
// raison d'attendre. Mesuré sur le run 2400 : 28 min 07 s de Playwright sur
// 30 min 37 s de chaîne, le tout rejoué à l'identique sur la PR puis sur `main`.
//
// LA SÉPARATION. Le projet `prod` isole les suites qui écrivent en base : lui
// seul garde le verrou et la clé `service_role`. Le projet `local` prend tout le
// reste, sans verrou et shardable — c'est ce qui permet au workflow de le
// découper en 4 jobs parallèles.
//
// ⚠️ LES DEUX LISTES SONT DISJOINTES PAR CONSTRUCTION : `local` exclut exactement
// ce que `prod` inclut. Un fichier ne peut donc pas tourner deux fois, et aucun
// ne peut être oublié — `npx playwright test` sans `--project` reste rigoureusement
// équivalent à ce que la CI exécutait avant ce changement.
//
// ⚠️ AJOUTER UNE SUITE QUI CRÉE UN COMPTE OBLIGE À L'INSCRIRE ICI. Oubliée, elle
// partirait dans `local`, donc hors verrou, donc en concurrence avec le job prod :
// c'est exactement l'incident du 2026-09-01. Le critère est `creerCompteE2E`
// (`tests/e2e/compte-e2e.js`) ou `qa-helper.js`, directement ou non.
// Verrou : `tests/e2e/projets-playwright.spec.js`.
const SUITES_PROD = [
  "authz-critical.spec.js",      // crée des comptes — barrière RLS du déploiement
  "blocage-acces.spec.js",       // crée des comptes
  "user-state-horodatage.spec.js", // crée des comptes
  "multi-comptes.spec.js",       // crée des comptes sous PASSIO_E2E_MULTI
  "confidentialite.spec.js",     // sous PASSIO_E2E_MULTI
  "qa-campaign.spec.js",         // sous PASSIO_E2E_MULTI (via qa-helper.js)
  "suppression-compte.spec.js",  // sous PASSIO_E2E_MULTI
];
const MOTIFS_PROD = SUITES_PROD.map((f) => "**/" + f);

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
  // `prod` et `local` : voir le commentaire SUITES_PROD en tête de fichier.
  // Sans `--project`, Playwright exécute les deux — donc toutes les suites.
  projects: [
    { name: "prod", testMatch: MOTIFS_PROD },
    { name: "local", testIgnore: MOTIFS_PROD },
  ],
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
