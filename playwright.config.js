// Config Playwright — tests smoke de PASSIO
// Lance un serveur statique local puis teste l'app comme un vrai navigateur.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  retries: 1,
  use: {
    baseURL: "http://127.0.0.1:8080",
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
  },
  webServer: {
    command: "http-server -p 8080 -a 127.0.0.1 -c-1 .",
    url: "http://127.0.0.1:8080/index.html",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
