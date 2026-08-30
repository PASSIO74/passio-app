// Liens partagés d'un carnet et d'un Live — #carnet-<id> et #cdv-live-<id>.
//
// ⚠️ CE FICHIER N'ACCOMPAGNE AUCUN CORRECTIF. C'est de la couverture de
// non-régression, ajoutée après une hypothèse de défaut qui s'est révélée
// FAUSSE — et c'est dit ici pour qu'une session future ne la reprenne pas.
//
// L'hypothèse était celle-ci : `_openCdvDeepLink` (app-03) n'est appelée au
// démarrage qu'à un seul endroit, au fond du chemin Supabase de `boot()`
// (app-08, après `supaRefreshCdvLives()`), et `hashchange` ne rattrape rien
// puisqu'une page ouverte AVEC un hash n'en émet pas. On en concluait qu'une
// personne hors ligne, ou dont la promesse Supabase échoue, n'atteindrait
// jamais l'appel — donc que le lien partagé ne routerait rien.
//
// Mesuré : les quatre tests ci-dessous passent sur le code d'avant. Le lien EST
// routé dans ces conditions. L'hypothèse ne tient pas, et on ne corrige rien.
//
// Mais la couverture, elle, manquait vraiment : ces deux liens n'étaient
// exercés par AUCUN test, exactement comme `#reel=<id>` (app-06) et
// `#irl-event-` / `#irl-checkin-` (app-07) avant qu'on n'y trouve des défauts
// réels. C'est cette absence de test qui a laissé ces trois-là casser en
// silence. On la comble ici, sans inventer de défaut pour justifier le fichier.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const CARNET_SEED = "p_vlog_marrakech";

function viewerCarnetOuvert(page, timeout = 20000) {
  return page.waitForFunction(() => {
    const v = document.getElementById("vlogViewer");
    return !!(v && v.classList.contains("open"));
  }, null, { timeout });
}

test.describe("Liens partagés CDV", () => {
  test("#carnet-<id> au démarrage ouvre le carnet, sans dépendre du chemin Supabase", async ({ page }) => {
    // `bootOnboarded` neutralise la synchronisation Supabase : c'est exactement
    // la situation d'une personne hors ligne ou pas encore connectée.
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors, 1, { query: "#carnet-" + CARNET_SEED });

    await viewerCarnetOuvert(page);
    expect(await page.evaluate(() => {
      const v = document.getElementById("vlogViewer");
      return v ? v.getAttribute("data-current-post") : null;
    })).toBe(CARNET_SEED);
    expect(errors.js, "aucune erreur JS pendant le routage").toEqual([]);
  });

  test("un identifiant inconnu n'ouvre rien et laisse l'application utilisable", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: "#carnet-nexiste_pas_du_tout" });
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => {
      const v = document.getElementById("vlogViewer");
      return !!(v && v.classList.contains("open"));
    })).toBe(false);
    await expect(page.locator("#screen-feed")).toHaveClass(/active/);
  });

  test("un lien collé en cours de session est routé lui aussi (hashchange)", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate((id) => { location.hash = "#carnet-" + id; }, CARNET_SEED);
    await viewerCarnetOuvert(page);
  });

  // Garde anti-creux : sans elle, le premier test passerait aussi si le viewer
  // s'ouvrait tout seul au démarrage pour une raison sans rapport.
  test("sans lien, aucun carnet ne s'ouvre au démarrage", async ({ page }) => {
    await bootOnboarded(page);
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => {
      const v = document.getElementById("vlogViewer");
      return !!(v && v.classList.contains("open"));
    })).toBe(false);
  });
});
