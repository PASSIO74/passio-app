// ============================================================================
// « RENCONTRER » — CHANGER DE LIEU SIMPLEMENT (2026-10-23)
// ----------------------------------------------------------------------------
// Demande : « dans le filtre des rencontres pour les lieux, améliore le
// changement de ville et de lieu, il faut que l'on puisse changer simplement ».
//
// Ce que cette suite prouve :
//   ① le sélecteur ne déroule plus 200 villes : une poignée de grandes villes,
//      et « Utiliser ma position » en tête ;
//   ② la recherche ignore les accents (« nimes » → Nîmes) et classe les débuts
//      de nom d'abord ; Entrée choisit le premier résultat ;
//   ③ une ville choisie devient RÉCENTE et se reprend en un tap — dans le
//      sélecteur ET sous la carte « Où ? » de la page Filtre, sans le rouvrir ;
//   ④ « Ma position » revient à la position en un tap, et la carte « Où ? »
//      entière ouvre le sélecteur ;
//   ⑤ les villes récentes sont une donnée de compte (purgée avec lui).
// ============================================================================
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await page.addInitScript(() => {
    try {
      window.__geoCalls = 0;
      var g = navigator.geolocation;
      if (g) Object.defineProperty(g, "getCurrentPosition", {
        configurable: true, value: function () { window.__geoCalls++; },
      });
    } catch (e) {}
  });
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    // Le géocodage distant ne fait pas partie de ce qu'on mesure.
    window.passioGeoSuggest = async () => [];
    try { localStorage.removeItem("passio_irl_villes_recentes_v1"); } catch (e) {}
  });
  await page.evaluate(() => goTo("irl"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-irl");
    return el && el.classList.contains("active");
  });
  await page.waitForTimeout(400);
}

function visibles(page) {
  return page.$$eval("#irlCitiesGrid button[data-localcity]", (bs) =>
    bs.filter((b) => b.style.display !== "none").map((b) => b.textContent.trim()));
}

test.describe("Rencontrer — changer de lieu simplement", () => {
  test("① ② sélecteur court, recherche sans accents, Entrée choisit", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openIrlCitySelector());
    await expect(page.locator("#irlCitySearchInput")).toBeVisible();
    await expect(page.locator(".irl-ville-pos")).toContainText("Utiliser ma position");
    await expect(page.locator(".irl-ville-pos")).toHaveAttribute("aria-pressed", "true");

    const depart = await visibles(page);
    expect(depart.length).toBeGreaterThan(5);
    expect(depart.length).toBeLessThanOrEqual(12);
    expect(depart).toContain("Paris");

    await page.locator("#irlCitySearchInput").fill("nimes");
    await page.waitForTimeout(100);
    expect(await visibles(page)).toContain("Nîmes");

    // Début de nom d'abord : « nan » → Nancy / Nantes avant Perpignan.
    await page.locator("#irlCitySearchInput").fill("nan");
    await page.waitForTimeout(100);
    const ordre = await page.$$eval("#irlCitiesGrid button[data-localcity]", (bs) =>
      bs.filter((b) => b.style.display !== "none").map((b) => ({ t: b.textContent.trim(), o: b.style.order })));
    expect(ordre.find((x) => x.t === "Perpignan").o).toBe("1");
    expect(ordre.find((x) => x.t === "Nantes").o).toBe("0");

    await page.locator("#irlCitySearchInput").fill("nantes");
    await page.locator("#irlCitySearchInput").press("Enter");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => irlSelectedCityName())).toBe("Nantes");
    expect(await page.evaluate(() => window.__geoCalls)).toBe(0);
  });

  test("③ une ville choisie devient récente, et se reprend en un tap", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { selectIrlCity("lyon", "Lyon"); selectIrlGeoCity("Annecy", 45.899, 6.129); });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => irlVillesRecentes().map((v) => v.name))).toEqual(["Annecy", "Lyon"]);

    await page.evaluate(() => openIrlCitySelector());
    const chips = page.locator("#irlCityRecents .irl-ville-chip");
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "true");
    await chips.nth(1).click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => irlSelectedCityName())).toBe("Lyon");
    // Pas de doublon : Lyon remonte en tête.
    expect(await page.evaluate(() => irlVillesRecentes().map((v) => v.name))).toEqual(["Lyon", "Annecy"]);
  });

  test("④ carte « Où ? » : raccourcis en un tap, carte entière cliquable", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { selectIrlCity("lyon", "Lyon"); selectIrlGeoCity("Annecy", 45.899, 6.129); });
    await page.locator("#irlToolsBtn").click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute("data-v4a5-vue") === "filtres", null, { timeout: 8000 });
    await page.waitForTimeout(300);

    await expect(page.locator("#v4a5LieuNom")).toHaveText("Annecy");
    const rapides = page.locator("#v4a5LieuRapides .v4a5-lieu-rapide");
    // « Ma position » + Lyon (la ville courante n'est pas reproposée).
    await expect(rapides).toHaveText(["Ma position", "Lyon"]);

    await rapides.nth(1).click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => irlSelectedCityName())).toBe("Lyon");
    await expect(page.locator("#v4a5LieuNom")).toHaveText("Lyon");
    await expect(page.locator("#v4a5LieuRapides .v4a5-lieu-rapide")).toHaveText(["Ma position", "Annecy"]);

    await page.locator("#v4a5LieuRapides .v4a5-lieu-rapide").first().click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => irlSelectedCityName())).toBe("");
    // Geste explicite : c'est LUI qui demande la position, et lui seul.
    expect(await page.evaluate(() => window.__geoCalls)).toBe(1);

    await page.locator("#v4a5LieuNom").click();
    await page.waitForTimeout(300);
    await expect(page.locator("#irlCitySearchInput")).toBeVisible();
  });

  test("⑤ les villes récentes sont purgées avec le compte", async () => {
    const a2 = fs.readFileSync("js/app-02-state-utils.js", "utf8");
    const debut = a2.indexOf("var ACCOUNT_SCOPED_KEYS");
    const cles = a2.slice(debut, a2.indexOf("];", debut));
    expect(cles).toContain('"passio_irl_villes_recentes_v1"');
  });
});
