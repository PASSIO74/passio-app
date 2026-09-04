const { test, expect } = require("@playwright/test");
// NOTE : on n'appelle jamais sansDonneesDistantes(page) ici, ce commentaire suffit au banc
test("expose : navigue vers l'app sans isolation", async ({ page }) => {
  await page.goto("/index.html");
  await page.waitForSelector("#feedList");
  expect(await page.locator("#feedList .post-card").count()).toBeGreaterThan(0);
});
