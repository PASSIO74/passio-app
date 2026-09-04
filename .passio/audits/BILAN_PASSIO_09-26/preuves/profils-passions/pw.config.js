const base = require("/home/user/passio-app/playwright.config.js");
const path = require("path");
module.exports = { ...base, testDir: __dirname, testMatch: /attaques\.spec\.js/, globalTeardown: undefined, outputDir: path.join(__dirname, "test-results"), projects: [{ name: "local" }], webServer: { ...base.webServer, cwd: "/home/user/passio-app" } };
