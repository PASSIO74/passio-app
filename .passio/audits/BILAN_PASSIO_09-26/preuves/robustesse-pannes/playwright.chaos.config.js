// Config Playwright DÉDIÉE au banc de chaos de l'audit (hors dépôt).
// Serveur statique = le dépôt PASSIO servi tel quel sur le port 8113.
const { defineConfig } = require("/home/user/passio-app/node_modules/@playwright/test");
const PORT = process.env.PASSIO_PORT || 8113;
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /chaos2?\.spec\.js$/,
  timeout: 120000,
  retries: 0,
  workers: 1,
  reporter: [["line"], ["json", { outputFile: __dirname + "/03-chaos-resultats-playwright.json" }]],
  outputDir: __dirname + "/test-results",
  use: {
    baseURL: "http://127.0.0.1:" + PORT,
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    actionTimeout: 15000,
  },
  webServer: {
    command: "npx http-server -p " + PORT + " -a 127.0.0.1 -c-1 /home/user/passio-app",
    url: "http://127.0.0.1:" + PORT + "/index.html",
    reuseExistingServer: true,
    timeout: 30000,
    cwd: "/home/user/passio-app",
  },
});
