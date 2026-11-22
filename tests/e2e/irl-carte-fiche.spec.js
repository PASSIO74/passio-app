const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function ouvrirCarte(page) {
  // Vraie carte MapLibre, sans dépendre des tuiles d'un service externe.
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
  }));
  await bootOnboarded(page);
  await page.evaluate(() => {
    state.seed.events = [{
      id: "ev_carte_agrandie", title: "Atelier carte agrandie", passion: "musique", emoji: "🎸",
      city: "Lyon", lat: 45.76, lng: 4.83, date: Date.now() + 2 * 864e5, time: "18:00",
      desc: "Activité de test", attendees: [], organizerId: "org_carte", status: "active",
    }];
    state.userEvents = [];
    irlSelectedCity = { name: "Lyon", coords: [45.76, 4.83] };
    irlPassionFilters.clear();
    window._irlMapSig = "";
    goTo("irl");
    renderIRL();
  });
  await page.locator('[data-v4a3-onglet="carte"]').click();
  await expect(page.locator("#irlMap .passio-marker-wrap")).toHaveCount(1);
}

async function exigerFicheAccessible(page) {
  await expect(page.locator("#eventDetailPage")).toBeVisible();
  await expect(page.locator("#eventDetailHeroTitle")).toContainText("Atelier carte agrandie");
  // toBeVisible reste vrai derrière la carte : mesurer la couche effectivement touchable.
  await expect.poll(() => page.evaluate(() => {
    const fiche = document.getElementById("eventDetailPage");
    return fiche.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2));
  })).toBe(true);
}

for (const pleinEcran of [true, false]) {
  test(`la bulle ouvre une fiche accessible depuis la carte ${pleinEcran ? "agrandie" : "normale"}`, async ({ page }) => {
    await ouvrirCarte(page);
    const carte = page.locator("#irlMapWrap");
    if (pleinEcran) {
      await page.locator("#irlMapExpandBtn").click();
      await expect(carte).toHaveClass(/fullscreen/);
    }
    // Attendre le recadrage différé, puis toucher le VRAI marqueur et son bouton.
    await page.waitForTimeout(600);
    await page.locator("#irlMap .passio-marker-wrap").click();
    await page.locator(".irl-popup-btn").click();
    await exigerFicheAccessible(page);
    await expect(carte).not.toHaveClass(/fullscreen/);
    await expect.poll(() => page.evaluate(() => _navOverlayDepth)).toBe(1);
    // Un rafraîchissement de la fiche ne doit ni l'enfouir ni empiler d'entrée.
    await page.evaluate(() => openEventDetails("ev_carte_agrandie"));
    await exigerFicheAccessible(page);
    expect(await page.evaluate(() => _navOverlayDepth)).toBe(1);
    await page.goBack();
    await expect(page.locator("#eventDetailPage")).toBeHidden();
    await expect(page.locator("#screen-irl")).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => _navOverlayDepth)).toBe(0);
    await expect(page).toHaveURL(/#irl$/);
    await expect(carte).not.toHaveClass(/fullscreen/);
    await page.locator("#irlMapExpandBtn").click();
    await expect(carte).toHaveClass(/fullscreen/);
    await expect(page.locator("#irlMapExpandBtn")).toHaveAttribute("aria-label", "Fermer la carte");
    await page.goBack();
    await expect(carte).not.toHaveClass(/fullscreen/);
  });
}


