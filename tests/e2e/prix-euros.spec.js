// ============================================================================
// LE PRIX D'UNE ACTIVITÉ EST UN PRIX RÉEL, EN EUROS (2026-08-29)
// ----------------------------------------------------------------------------
// Complément d'`adr-009-retrait-economie.spec.js`, qui prouve que l'économie
// interne a quitté l'app. Ce fichier-ci prouve ce qui la REMPLACE côté IRL :
// un prix d'atelier ou de sortie s'affichait « 12 💎 Passia », ce qui laissait
// croire qu'on payait avec une monnaie interne non convertible. C'est une somme
// en euros, que l'organisateur encaisse hors application.
//
// Les trois surfaces doivent dire la même chose : le formulaire de création, la
// pastille de la carte dans la liste, et la ligne « Prix » de la fiche. Elles
// passent toutes par `fmtEventPrice()` (app-02), seule fonction autorisée à
// écrire un prix — c'est elle qui tient le cas « gratuit » et les centimes.
//
// ⚠️ Ce que ce fichier NE teste pas : l'encaissement. PASSIO ne prend aucun
// paiement ; le prix est indicatif, affiché, jamais débité.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const EVENT = {
  id: "ev_prix_test", title: "Atelier poterie du dimanche", passion: "cuisine",
  date: Date.now() + 3 * 86400000, time: "14:00", city: "Lyon",
  venue: "Atelier des Terres", price: 12, maxAttendees: 10,
  attendees: [], desc: "Tour, émaillage, cuisson.", ownerId: "u_lea",
};

async function injecter(page, ev) {
  await page.evaluate((e) => {
    state.seed.events = [e];
    state.userEvents = [];
    saveState();
    goTo("irl");
  }, ev);
  await page.waitForTimeout(900);
}

test.describe("le prix d'une activité est en euros", () => {
  test("le formulaire demande des euros, et accepte les centimes", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => openCreateEvent());
    await page.waitForTimeout(400);

    const champ = page.locator("#evPrice");
    await expect(champ).toHaveCount(1);

    const libelle = await page.evaluate(() =>
      document.getElementById("evPrice").closest("label").querySelector("span").textContent);
    expect(libelle).toMatch(/€|euros/);
    expect(libelle).not.toMatch(/Passia|💎/);

    // Un tarif à la pièce (12,50 €) doit être saisissable : `step` valait 1,
    // donc le champ REFUSAIT silencieusement les centimes.
    expect(await page.evaluate(() =>
      document.getElementById("evPrice").getAttribute("step"))).toBe("0.01");

    // Et le formulaire ne promet plus de points à la publication.
    const texte = await page.evaluate(() => document.getElementById("modalContent").textContent);
    expect(texte).not.toMatch(/\+\s*\d+\s*pts/);
  });

  test("le formateur couvre gratuit, entier et décimal", async ({ page }) => {
    await bootOnboarded(page);
    const rendu = await page.evaluate(() => ({
      zero: fmtEventPrice(0),
      vide: fmtEventPrice(""),
      nul: fmtEventPrice(null),
      indefini: fmtEventPrice(undefined),
      negatif: fmtEventPrice(-5),
      absurde: fmtEventPrice("douze"),
      entier: fmtEventPrice(12),
      decimal: fmtEventPrice(12.5),
      texte: fmtEventPrice("8"),
    }));
    // Tout ce qui n'est pas un montant positif se dit « gratuit » — jamais
    // « NaN € », jamais « -5 € », qui étaient les sorties du « + " €" » à la main.
    ["zero", "vide", "nul", "indefini", "negatif", "absurde"].forEach((k) =>
      expect(rendu[k], k).toMatch(/Gratuit/));

    expect(rendu.entier).toContain("12");
    expect(rendu.entier).toContain("€");
    expect(rendu.entier).not.toContain(",");   // pas de décimales inutiles
    expect(rendu.decimal).toContain("12,50");  // virgule, pas de point
    expect(rendu.texte).toContain("8");

    // Aucune sortie ne nomme la monnaie interne retirée.
    Object.values(rendu).forEach((v) => expect(v).not.toMatch(/Passia|💎/));
  });

  test("la carte de la liste et la fiche affichent le même prix, en euros", async ({ page }) => {
    await bootOnboarded(page);
    await injecter(page, EVENT);

    const liste = await page.evaluate(() => document.getElementById("eventList").textContent);
    expect(liste).toContain("12");
    expect(liste).toContain("€");
    expect(liste).not.toMatch(/Passia|💎/);

    await page.evaluate((id) => openEventDetails(id), EVENT.id);
    await page.waitForTimeout(700);
    const fiche = await page.evaluate(() => document.getElementById("eventDetailPage").textContent);
    expect(fiche).toContain("12");
    expect(fiche).toContain("€");
    expect(fiche).not.toMatch(/Passia|💎/);
  });

  test("une activité gratuite le dit, et ne montre aucun montant", async ({ page }) => {
    await bootOnboarded(page);
    await injecter(page, { ...EVENT, id: "ev_gratuit", price: 0 });
    const liste = await page.evaluate(() => document.getElementById("eventList").textContent);
    expect(liste).toMatch(/Gratuit/);
    expect(liste).not.toMatch(/0\s*€/);
  });
});
