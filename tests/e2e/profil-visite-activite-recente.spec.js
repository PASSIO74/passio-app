// Profil visité — une activité publiée APRÈS l'ouverture de l'app apparaît
// dans l'onglet « Activité » (signalement du 2026-10-23 : « Jerem a créé une
// activité mais elle n'apparaît pas sur son profil dans Activité »).
//
// Cause : `supaLoadEvents()` ne tournait qu'au démarrage, et l'onglet
// « Activité » d'un profil visité ne lisait que ce cache. Romain et Ben, abonnés
// de Jerem, avaient l'app ouverte avant sa publication : l'activité existait
// en base, et chez Jerem, mais pas chez eux tant qu'ils ne relançaient pas.
// Désormais l'ouverture du profil recharge les activités DE CE COMPTE.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("Profil visité — activité publiée après le démarrage", () => {
  test("l'onglet Activité montre l'activité chargée à l'ouverture du profil", async ({ page }) => {
    await bootOnboarded(page);
    const absenteAvant = await page.evaluate(() => {
      window._appelsEvenements = [];
      // `u_lea` est du contenu de démonstration : le profil se résout en local.
      // Le serveur est simulé — aucune requête ne part.
      window._supaReal = true;
      window.supaLoadPosts = async () => [];
      window.supaLoadEvents = async (authorId) => {
        window._appelsEvenements.push(authorId);
        return [{
          id: "ev_publiee_apres_boot", authorId: "u_lea", organizerId: "u_lea",
          title: "Via ferrata tardive", passion: "outdoor-via-ferrata",
          city: "Sixt-Fer-à-Cheval", date: Date.now() + 3 * 86400000,
          attendees: [], maybes: [], waitlist: [], checkedIn: [], status: "active",
        }];
      };
      return !allEvents().some((e) => e.id === "ev_publiee_apres_boot");
    });
    expect(absenteAvant).toBe(true);

    await page.evaluate(() => openUserProfile("u_lea"));
    await expect(page.locator(".modal.modal-fullscreen")).toBeVisible();
    await page.locator('#visitedSections [data-v9-vtab="activite"]').click();
    await expect(page.locator("#visitedEvents")).toContainText("Via ferrata tardive");
    // La lecture est CIBLÉE sur le compte visité, pas la liste globale.
    expect(await page.evaluate(() => window._appelsEvenements)).toEqual(["u_lea"]);
  });

  test("un identifiant qui casserait le filtre PostgREST est refusé sans requête", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => ({
      virgule: await supaLoadEvents("x,author_id.neq.y"),
      parenthese: await supaLoadEvents("x)"),
    }));
    expect(r.virgule).toEqual([]);
    expect(r.parenthese).toEqual([]);
  });
});
