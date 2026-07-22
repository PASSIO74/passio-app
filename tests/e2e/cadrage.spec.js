// Cadrage bas de l'app — non-régression du bug « la barre d'onglets passe sous
// la barre système du téléphone » (2026-07-22).
//
// Cause d'origine : `.app-shell { height: 100dvh }`. Plusieurs navigateurs
// mobiles résolvent `dvh` avec le GRAND viewport au tout premier paint ; comme
// `body` est en `overflow:hidden`, aucun scroll ni resize ne vient corriger
// ensuite et le shell reste trop haut pour TOUTE la session. La correction
// impose une hauteur mesurée en JS (`--app-vh`, app-09) et porte l'inset de
// safe-area sur `.app-nav` (min-height + padding-bottom).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const VIEWPORTS = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "Android compact", width: 360, height: 640 },
  { name: "grand mobile", width: 412, height: 915 },
];

for (const vp of VIEWPORTS) {
  test(`${vp.name} : la barre d'onglets tient entièrement dans le viewport`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await bootOnboarded(page);

    const m = await page.evaluate(() => {
      const nav = document.querySelector(".app-nav");
      const shell = document.querySelector(".app-shell");
      const r = nav.getBoundingClientRect();
      return {
        appVh: document.documentElement.style.getPropertyValue("--app-vh").trim(),
        viewport: window.innerHeight,
        navBas: Math.round(r.bottom),
        navHaut: Math.round(r.top),
        shellBas: Math.round(shell.getBoundingClientRect().bottom),
      };
    });

    // --app-vh est bien posé par app-09 et vaut la hauteur visible réelle.
    expect(m.appVh).toBe(m.viewport + "px");
    // Le bas de la barre d'onglets ne dépasse JAMAIS le bas du viewport.
    expect(m.navBas).toBeLessThanOrEqual(m.viewport);
    // ...et elle reste collée en bas (pas de bande vide sous elle).
    expect(m.viewport - m.navBas).toBeLessThanOrEqual(1);
    // La barre est entièrement visible, pas rognée par le haut.
    expect(m.navHaut).toBeGreaterThan(0);
    expect(m.shellBas).toBeLessThanOrEqual(m.viewport);
  });
}

test("un viewport qui rétrécit après le chargement est rattrapé", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await bootOnboarded(page);

  // Simule l'apparition de la barre système / d'une barre d'URL après le boot.
  await page.setViewportSize({ width: 375, height: 640 });
  await page.waitForTimeout(300);

  const m = await page.evaluate(() => {
    const r = document.querySelector(".app-nav").getBoundingClientRect();
    return { viewport: window.innerHeight, navBas: Math.round(r.bottom) };
  });
  expect(m.viewport).toBe(640);
  expect(m.navBas).toBeLessThanOrEqual(m.viewport);
});

test("la safe-area du bas s'AJOUTE à la barre au lieu de rogner les icônes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await bootOnboarded(page);

  // env(safe-area-inset-bottom) n'est pas injectable en test : on reproduit à
  // l'identique ce que la règle CSS applique avec un inset de 48px.
  const m = await page.evaluate(() => {
    const nav = document.querySelector(".app-nav");
    const sansInset = Math.round(nav.getBoundingClientRect().height);
    nav.style.setProperty("padding-bottom", "48px", "important");
    nav.style.setProperty("min-height", "calc(62px + 48px)", "important");
    const r = nav.getBoundingClientRect();
    const cta = document.querySelector(".app-nav .nav-cta").getBoundingClientRect();
    const res = {
      sansInset,
      hauteurAvecInset: Math.round(r.height),
      zoneUtile: Math.round(r.height - 48),
      fondJusquEnBas: Math.round(r.bottom) >= window.innerHeight,
      basBoutonCentral: Math.round(cta.bottom),
      limiteBarreSysteme: window.innerHeight - 48,
    };
    nav.style.removeProperty("padding-bottom");
    nav.style.removeProperty("min-height");
    return res;
  });

  expect(m.sansInset).toBe(62); // aucun changement quand il n'y a pas d'inset
  // L'inset s'ajoute : la zone utile des onglets reste entière.
  expect(m.zoneUtile).toBeGreaterThanOrEqual(62);
  // Le fond de la barre descend sous la barre système (pas de bande vide)...
  expect(m.fondJusquEnBas).toBe(true);
  // ...mais les boutons restent au-dessus d'elle.
  expect(m.basBoutonCentral).toBeLessThanOrEqual(m.limiteBarreSysteme);
});
