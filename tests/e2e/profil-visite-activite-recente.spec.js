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

// Le démarrage relit les activités 2 s après `supaInit` (app-08, chargement
// différé). Les faux serveurs ci-dessous ne doivent compter QUE les lectures
// du geste testé : on laisse donc passer celle-là avant de les poser.
async function apresChargementDiffere(page) {
  await page.waitForTimeout(2500);
}

test.describe("Profil visité — activité publiée après le démarrage", () => {
  test("l'onglet Activité montre l'activité chargée à l'ouverture du profil", async ({ page }) => {
    await bootOnboarded(page);
    await apresChargementDiffere(page);
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

// « Rencontrer » — même défaut, autre écran (2026-10-24) : les activités
// n'étaient lues qu'au démarrage. L'entrée sur l'écran les relit désormais, au
// plus une fois par minute (ce n'est pas un polling).
test.describe("Rencontrer — activité publiée après le démarrage", () => {
  test("l'entrée sur l'écran relit les activités, une seule fois par minute", async ({ page }) => {
    await bootOnboarded(page);
    await apresChargementDiffere(page);
    await page.evaluate(() => {
      window._appelsEvenements = 0;
      window._supaReal = true;
      // La lecture du démarrage vient d'armer la minute de répit : on la
      // lève pour mesurer l'ENTRÉE sur l'écran, et elle seule.
      _evenementsLusA = 0;
      window.supaLoadEvents = async () => {
        window._appelsEvenements++;
        return [{
          id: "ev_rencontrer_apres_boot", authorId: "u_lea", organizerId: "u_lea",
          title: "Sortie publiée en cours de session", passion: "musique",
          city: "Annecy", lat: 45.8992, lng: 6.1294, date: Date.now() + 2 * 86400000,
          attendees: ["u_lea"], maybes: [], waitlist: [], checkedIn: [], status: "active",
        }];
      };
    });
    await page.evaluate(() => goTo("irl"));
    await expect.poll(() => page.evaluate(() => allEvents().some((e) => e.id === "ev_rencontrer_apres_boot"))).toBe(true);
    await expect(page.locator("#screen-irl")).toContainText("Sortie publiée en cours de session");

    // Aller-retour immédiat : pas de seconde lecture avant la minute.
    await page.evaluate(() => { goTo("feed"); goTo("irl"); });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window._appelsEvenements)).toBe(1);
  });

  test("une relecture identique ne repeint pas l'écran", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const ev = { id: "ev_sig", title: "Identique", date: Date.now() + 86400000, status: "active", attendees: [] };
      return {
        premiere: fusionnerEvenementsServeur([ev]),
        seconde: fusionnerEvenementsServeur([Object.assign({}, ev)]),
        inscrit: fusionnerEvenementsServeur([Object.assign({}, ev, { attendees: ["u_x"] })]),
      };
    });
    expect(r).toEqual({ premiere: true, seconde: false, inscrit: true });
  });
});
