// Lot UI-7 §8 — le parcours RÉEL d'enregistrement d'une bobine, avec une caméra
// simulée par Chromium. Fichier séparé de `ui-v7-lot.spec.js` : les drapeaux de
// lancement (`--use-fake-device-for-media-stream`) doivent être posés au niveau
// du FICHIER — dans un `describe`, Playwright refuse `test.use({ launchOptions })`
// parce qu'il forcerait un nouveau worker en cours de route.
//
// Sans ces drapeaux, `getUserMedia` échoue, l'éditeur bascule en « pas de
// caméra » et le test ne prouverait plus rien qu'un repli.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
  permissions: ["camera", "microphone"],
});

test("maintenir puis relâcher mène à l'aperçu et à ses deux issues", async ({ page, context }) => {
  await context.grantPermissions(["camera", "microphone"]);
  await bootOnboarded(page, null, 3);
  await page.evaluate(() => meOpen("bobine"));
  // La caméra s'ouvre : `me-cam-on` est la condition du déclencheur.
  await page.waitForFunction(() => {
    const ed = document.getElementById("mediaEditor");
    return ed && ed.classList.contains("me-cam-on");
  }, null, { timeout: 20000 });

  const sh = page.locator("#meShutter");
  const box = await sh.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);     // > 500 ms : sinon le moteur invite à maintenir
  await page.mouse.up();

  await page.waitForFunction(() => {
    const ed = document.getElementById("mediaEditor");
    return ed && ed.classList.contains("phase-edit");
  }, null, { timeout: 20000 });

  await expect(page.locator("#meMedia video")).toHaveCount(1);
  await expect(page.locator('[data-v7-bobine-act="recommencer"]')).toBeVisible();
  await expect(page.locator('[data-v7-bobine-act="continuer"]')).toBeVisible();
  expect(await page.evaluate(() => meState.mediaType)).toBe("video");
});
