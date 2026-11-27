const { test, expect } = require("@playwright/test");
const { bootVisiteur } = require("./first-run-helper");

async function ouvrirSorties(page, autres = []) {
  await bootVisiteur(page, { sansBienvenue: true });
  await page.evaluate((autres) => {
    goTo("irl");
    clearAllIrlFilters();
    const exemple = {
      ...state.seed.events[0], id: "e1", title: "Atelier aquarelle", passion: "art",
      date: Date.now() + 3 * 86400000, endAt: null, status: "active"
    };
    state.seed.events = [exemple, ...autres.map(ev => ({
      ...exemple, ...ev, date: Date.now() + (ev.jours ?? 3) * 86400000
    }))];
    state.userEvents = [];
    renderIRL();

    // Le SDK et le réseau sont coupés par bootVisiteur. Seule la réponse du
    // catalogue est pilotée ici, via le véritable chargeur de l'application.
    const from = supa.from.bind(supa);
    supa.from = table => {
      if (table !== "events") return from(table);
      const q = { select: () => q, order: () => q, gte: () => q, lt: () => q, limit: () => window.reponseCatalogue };
      return q;
    };
    window._supaReal = true;
  }, autres);
}

async function lireCatalogue(page, reponse) {
  await page.evaluate(async reponse => {
    window.reponseCatalogue = Promise.resolve(reponse);
    await rafraichirEvenements(true);
  }, reponse);
}

test("la recherche qui ne garde que des exemples peut révéler une vraie sortie", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await ouvrirSorties(page, [{ id: "sortie_locale", title: "Balade du dimanche" }]);
  await lireCatalogue(page, { data: [], error: null });
  const avis = page.locator("#irlAvisExemples");
  await expect(avis).toHaveCount(0);
  await page.locator("#v4a0Search").fill("aquarelle");
  await expect(avis).toBeVisible();
  await expect(avis.getByRole("button")).toHaveCount(1);
  await expect(page.locator("#eventList > :first-child")).toHaveAttribute("id", "irlAvisExemples");
  await avis.getByRole("button", { name: "Voir les autres sorties" }).click();
  await expect(page.locator("#v4a0Search")).toHaveValue("");
  await expect(page.locator("#eventList .event-card").first()).toHaveAttribute("data-evid", "sortie_locale");
  await expect(avis).toHaveCount(0);
});

test("seule une lecture réussie présente les exemples et la proposition passe par le compte invité", async ({ page, context }) => {
  await ouvrirSorties(page, [{ id: "passee", title: "Ancienne balade", jours: -3 }]);
  const avis = page.locator("#irlAvisExemples");
  await expect(page.locator('#eventList [data-evid="e1"]')).toBeVisible();
  await expect(avis).toHaveCount(0);
  await page.evaluate(() => {
    window.reponseCatalogue = new Promise(res => { window.terminerCatalogue = res; });
    window.lectureEnCours = rafraichirEvenements(true);
  });
  await expect(avis).toHaveCount(0);
  await page.evaluate(() => {
    window.terminerCatalogue({ data: [], error: null });
    return window.lectureEnCours;
  });
  await expect(avis).toBeVisible();
  await lireCatalogue(page, { data: null, error: { message: "Lecture indisponible" } });
  await expect(avis).toHaveCount(0);
  await lireCatalogue(page, { data: [], error: null });
  await expect(avis.getByRole("button")).toHaveCount(1);
  await avis.getByRole("button", { name: "Proposer une sortie" }).click();
  await expect(page.locator(".fr-gate-title")).toHaveText("Crée ton compte pour proposer une activité");
  await page.getByRole("button", { name: "Continuer à explorer" }).click();
  await page.evaluate(() => {
    window.reponseCatalogue = new Promise(res => { window.terminerCatalogue = res; });
    window.lectureEnCours = rafraichirEvenements(true);
  });
  await context.setOffline(true);
  await expect(avis).toHaveCount(0);
  await context.setOffline(false);
  await page.evaluate(() => {
    window.reponseCatalogue = Promise.resolve({ data: [], error: null });
    window.terminerCatalogue({ data: null, error: { message: "Connexion interrompue" } });
    return window.lectureEnCours;
  });
  await expect(avis).toBeVisible();
});
