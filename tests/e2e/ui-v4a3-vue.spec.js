// Lot UI-4A3 — commutateur Liste / Carte de « Rencontrer ».
//
// Ce que cette suite prouve, et rien d'autre :
//   ① sur l'URL normale, le commutateur est là, la vue Liste est celle par
//      défaut, et l'écran est EXACTEMENT l'historique — carte en bande repliée,
//      liste visible dessous ;
//   ② la vue Carte donne l'écran à la carte : elle se déplie et la liste passe
//      la main, sans jamais quitter le DOM ;
//   ③ le retour à Liste replie la carte et rend la liste ;
//   ④ aucun second moteur de carte : le module ne touche QUE la fonction
//      historique `toggleIrlMapPeek()`, et seulement quand l'état le demande ;
//   ⑤ la vue ne persiste PAS : revenir sur l'écran redonne Liste ;
//   ⑥ kill switches local et mémoire : commutateur retiré, écran historique ;
//   ⑦ clavier et `aria-selected` ;
//   ⑧ mobile 320 / 390 / 430 px sans débordement, cibles ≥ 44 px.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SEUIL_PX = 4;

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript((cle) => localStorage.setItem(cle, "0"), opts.killLocal);
  }
  await page.addInitScript(() => {
    try {
      var g = navigator.geolocation;
      if (g) Object.defineProperty(g, "getCurrentPosition", { configurable: true, value: function () {} });
    } catch (e) {}
  });
  await bootOnboarded(page, null, 1, { query: opts.query || "" });
  await page.evaluate(() => { window.supaLoadPosts = async () => []; });
}

async function ouvrirIrl(page) {
  await page.evaluate(() => goTo("irl"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-irl");
    return el && el.classList.contains("active");
  });
  await page.waitForTimeout(400);
}

const onglet = (page, id) => page.locator(`[data-v4a3-onglet="${id}"]`);
const carteRepliee = (page) => page.evaluate(() =>
  document.getElementById("irlMapWrap").classList.contains("peek"));

test.describe("UI-4A3 — commutateur Liste / Carte", () => {
  test("URL normale : commutateur présent, vue Liste, écran historique intact", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a3"))).toBe(true);
    await expect(page.locator("#v4a3Vue")).toBeVisible();
    await expect(page.locator("[data-v4a3-onglet]")).toHaveCount(2);
    await expect(page.locator("[data-v4a3-onglet]")).toHaveText(["Liste", "Carte"]);
    await expect(onglet(page, "liste")).toHaveAttribute("aria-selected", "true");
    await expect(onglet(page, "carte")).toHaveAttribute("aria-selected", "false");

    // ① L'écran est celui d'avant : carte en bande repliée, liste visible.
    expect(await carteRepliee(page)).toBe(true);
    await expect(page.locator("#irlMapWrap")).toBeVisible();
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#eventList .event-card").first()).toBeVisible();
    await expect(page.locator(".irl-chip-create")).toBeVisible();

    // Le commutateur se pose juste AU-DESSUS de la liste (§8 : le choix
    // d'affichage précède immédiatement le contenu).
    expect(await page.evaluate(() => {
      const l = document.getElementById("eventList");
      return l.previousElementSibling && l.previousElementSibling.id;
    })).toBe("v4a3Vue");
  });

  test("vue Carte : la carte se déplie, la liste passe la main sans quitter le DOM", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    await onglet(page, "carte").click();
    await page.waitForTimeout(400);

    await expect(onglet(page, "carte")).toHaveAttribute("aria-selected", "true");
    await expect(onglet(page, "liste")).toHaveAttribute("aria-selected", "false");
    expect(await carteRepliee(page)).toBe(false);
    await expect(page.locator("#irlMapWrap")).toBeVisible();

    // La liste est masquée mais TOUJOURS là : le moteur continue d'y écrire.
    await expect(page.locator("#eventList")).toBeHidden();
    await expect(page.locator("#eventList")).toHaveCount(1);
    expect(await page.evaluate(() =>
      document.getElementById("eventList").innerHTML.trim().length)).toBeGreaterThan(0);
  });

  test("retour à Liste : la carte se replie et la liste revient", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    await onglet(page, "carte").click();
    await page.waitForTimeout(400);
    expect(await carteRepliee(page)).toBe(false);

    await onglet(page, "liste").click();
    await page.waitForTimeout(400);
    expect(await carteRepliee(page)).toBe(true);
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#eventList .event-card").first()).toBeVisible();
  });

  test("aucun second moteur : seule toggleIrlMapPeek est appelée, et seulement au besoin", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    await page.evaluate(() => {
      window.__peekCalls = 0;
      const vrai = window.toggleIrlMapPeek;
      window.toggleIrlMapPeek = function () { window.__peekCalls++; return vrai.apply(this, arguments); };
    });

    await onglet(page, "carte").click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__peekCalls)).toBe(1);

    // Re-choisir la vue déjà active ne doit RIEN rappeler.
    await onglet(page, "carte").click();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__peekCalls)).toBe(1);

    await onglet(page, "liste").click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__peekCalls)).toBe(2);
  });

  test("la vue ne persiste pas : on revient toujours sur Liste", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    await onglet(page, "carte").click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.PassioUIV4A3.vue())).toBe("carte");

    // Rien de la vue n'est écrit sur l'appareil.
    expect(await page.evaluate(() => localStorage.getItem("passio_ui_4a3"))).toBeNull();

    await page.reload();
    await page.waitForFunction(() => {
      const el = document.getElementById("screen-feed");
      return el && el.classList.contains("active");
    }, null, { timeout: 20000 });
    await page.waitForTimeout(2000);
    await ouvrirIrl(page);

    expect(await page.evaluate(() => window.PassioUIV4A3.vue())).toBe("liste");
    await expect(onglet(page, "liste")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#eventList")).toBeVisible();
  });

  test("kill switch local : aucun commutateur, écran historique", async ({ page }) => {
    await boot(page, { killLocal: "passio_ui_4a3" });
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a3"))).toBe(false);
    await expect(page.locator("#v4a3Vue")).toHaveCount(0);
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#irlMapWrap")).toBeVisible();
    expect(await carteRepliee(page)).toBe(true);
  });

  test("kill switch mémoire en cours de session : retour sans rechargement", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await expect(page.locator("#v4a3Vue")).toBeVisible();

    await onglet(page, "carte").click();
    await page.waitForTimeout(300);
    await expect(page.locator("#eventList")).toBeHidden();

    await page.evaluate(() => { window.PASSIO_UI_4A3 = false; window.PassioUIV4A3.apply(); });

    await expect(page.locator("#v4a3Vue")).toHaveCount(0);
    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a3"))).toBe(false);
    // La liste revient, quelle que soit la vue qui était choisie.
    await expect(page.locator("#eventList")).toBeVisible();
  });

  test("clavier : le commutateur s'actionne et expose son état", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    await onglet(page, "carte").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await expect(onglet(page, "carte")).toHaveAttribute("aria-selected", "true");

    await onglet(page, "liste").focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await expect(onglet(page, "liste")).toHaveAttribute("aria-selected", "true");
  });

  for (const largeur of [320, 390, 430]) {
    test(`mobile ${largeur} px : aucun débordement, cibles ≥ 44 px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await boot(page);
      await ouvrirIrl(page);

      const debord = await page.evaluate((seuil) => {
        const b = document.getElementById("v4a3Vue");
        if (!b) return -1;
        return b.getBoundingClientRect().right - document.documentElement.clientWidth - seuil;
      }, SEUIL_PX);
      expect(debord).toBeLessThanOrEqual(0);

      const hauteurs = await page.evaluate(() =>
        [...document.querySelectorAll("#v4a3Vue [data-v4a3-onglet]")]
          .map((el) => Math.round(el.getBoundingClientRect().height)));
      expect(hauteurs.length).toBe(2);
      for (const h of hauteurs) expect(h).toBeGreaterThanOrEqual(44);
    });
  }
});
