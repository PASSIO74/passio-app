// ═══════════════════════════════════════════════════════════════════════════
// LOT-51 (audit UX/UI du 2026-11-10, SOC-C03) — GRAND ÉCRAN
//   ① 1440 × 900 : la colonne fait 640 px, centrée ; rien ne déborde, la barre
//      d'onglets est visible et touchable ;
//   ② 390 × 844 (téléphone) et 1024 × 768 : rien ne change (≤ 540 / 440 px).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function mesure(page) {
  return page.evaluate(() => {
    const s = document.querySelector(".app-shell").getBoundingClientRect();
    const nav = document.getElementById("appNavV2") || document.querySelector(".app-nav:not([style*=\"none\"])");
    const n = nav ? nav.getBoundingClientRect() : null;
    const centre = n ? document.elementFromPoint(n.left + n.width / 2, n.top + n.height / 2) : null;
    return {
      largeur: Math.round(s.width), gauche: Math.round(s.left), droite: Math.round(window.innerWidth - s.right),
      debord: document.documentElement.scrollWidth > window.innerWidth + 1,
      navVisible: !!(n && n.height > 0 && n.bottom <= window.innerHeight + 1), navTouchable: !!(nav && centre && nav.contains(centre)),
    };
  });
}

test("① grand écran : une colonne de 640 px, centrée, sans débordement", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootOnboarded(page);
  const r = await mesure(page);
  expect(r.largeur).toBe(640);
  expect(Math.abs(r.gauche - r.droite)).toBeLessThanOrEqual(2);
  expect(r.debord).toBe(false);
  expect(r.navVisible).toBe(true);
  expect(r.navTouchable).toBe(true);
});

test("② téléphone et petit ordinateur : la colonne ne change pas", async ({ page }) => {
  await bootOnboarded(page);
  const tel = await mesure(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  const moyen = await mesure(page);
  expect(tel.largeur).toBeLessThanOrEqual(540);
  expect(moyen.largeur).toBe(440);
});
