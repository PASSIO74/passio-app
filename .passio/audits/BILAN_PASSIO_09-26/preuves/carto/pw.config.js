// Wrapper LECTURE SEULE : réutilise la config du dépôt, force le Chromium 1194 présent dans /opt/pw-browsers
// (le paquet @playwright/test 1.60 attend le build 1223, absent ; `playwright install` est interdit ici).
const base = require("/home/user/passio-app/playwright.config.js");
module.exports = {
  ...base,
  testDir: "/home/user/passio-app/tests/e2e",
  globalTeardown: "/home/user/passio-app/tests/e2e/global-teardown.js",
  webServer: { ...base.webServer, cwd: "/home/user/passio-app" },
  use: { ...base.use, launchOptions: { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" } },
};
