const { test, expect } = require("@playwright/test");
test("creux : verifie sa propre construction avec un locator", async ({ page }) => {
  await page.setContent("<b id=a>1</b>");
  expect(await page.locator("#a").textContent()).toBe("1");
});
