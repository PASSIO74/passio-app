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
  use: {
    baseURL: "http://127.0.0.1:8080",
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    actionTimeout: 15000, // un clic qui ne trouve pas son élément doit échouer vite et dire lequel, pas geler le test
  },
  webServer: {
    command: "http-server -p 8080 -a 127.0.0.1 -c-1 .",
    url: "http://127.0.0.1:8080/index.html",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
