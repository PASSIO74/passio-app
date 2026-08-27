// Lot UI-4A0 — tête de l'écran « Rencontrer » (aperçu).
//
// Ce que cette suite prouve, et rien d'autre :
//   ① l'URL NORMALE est strictement inchangée — aucune classe racine, aucun
//      nœud du lot, titre et barre de recherche historiques intacts ;
//   ② sous l'aperçu, la tête cible est en place et dans le bon ordre : titre
//      « Rencontrer », sous-titre, recherche, quatre intentions ;
//   ③ rien n'est perdu SOUS la tête : la liste, la carte, les cartes et la
//      barre d'action historiques sont toujours là ;
//   ④ aucune demande GPS à l'ouverture de l'écran — prouvé PAR CONTRASTE avec
//      l'URL normale, qui la déclenche ;
//   ⑤ la recherche de tête écrit dans le champ historique et alimente le même
//      état (`irlSearchQuery`) : aucun second moteur ;
//   ⑥ les intentions sont multisélectionnables, « Pour toi » est l'état neutre,
//      et l'état est exposé par `aria-pressed` ;
//   ⑦ kill switches local et mémoire : retour intégral à l'écran historique ;
//   ⑧ mobile 320 / 390 / 430 px sans débordement, cibles ≥ 44 px, clavier.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const APERCU = "?passio_preview=passio-ui-4a0";
const DEMO = "?passio_preview=passio-ui-4a0-demo";
const SEUIL_PX = 4;

// Compte les demandes de position SANS jamais y répondre : le test ne doit ni
// accorder ni refuser une permission réelle, seulement observer l'appel.
async function espionnerGeo(page) {
  await page.addInitScript(() => {
    window.__geoCalls = 0;
    try {
      var g = navigator.geolocation;
      if (g) {
        Object.defineProperty(g, "getCurrentPosition", {
          configurable: true,
          value: function () { window.__geoCalls++; },
        });
      }
    } catch (e) {}
  });
}

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_4a0", "0"));
  }
  await espionnerGeo(page);
  await bootOnboarded(page, null, 1, { query: opts.query || "" });
  await page.evaluate(() => {
    // Aucune requête réseau : l'écran IRL doit rester en mode local.
    window.supaLoadPosts = async () => [];
  });
}

async function ouvrirIrl(page) {
  await page.evaluate(() => goTo("irl"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-irl");
    return el && el.classList.contains("active");
  });
  await page.waitForTimeout(300);
}

test.describe("UI-4A0 — tête de Rencontrer", () => {
  test("URL normale : rien du lot, écran IRL historique intact", async ({ page }) => {
    await boot(page);
    // Départ franc : aucune position déjà connue, aucun appel déjà compté —
    // le contrôle ④ ne doit dépendre d'aucun état hérité du boot.
    await page.evaluate(() => { irlUserLocation = null; window.__geoCalls = 0; });
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a0"))).toBe(false);
    await expect(page.locator("#v4a0Head")).toHaveCount(0);
    await expect(page.locator("#screen-irl > .section-title")).toBeVisible();
    await expect(page.locator("#irlSearchRow")).toBeVisible();
    await expect(page.locator("#irlCitySearch")).toBeVisible();

    // Contrôle du contraste ④ : sans le lot, la position EST demandée.
    expect(await page.evaluate(() => window.__geoCalls)).toBeGreaterThan(0);
  });

  test("aperçu : hiérarchie de tête et écran historique conservé dessous", async ({ page }) => {
    await boot(page, { query: DEMO });
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a0"))).toBe(true);

    const head = page.locator("#v4a0Head");
    await expect(head).toBeVisible();
    await expect(head.locator(".v4a0-title")).toHaveText("Rencontrer");
    await expect(head.locator(".v4a0-sub"))
      .toHaveText("Des activités à vivre autour de tes passions");
    await expect(head.locator("#v4a0Search")).toBeVisible();
    await expect(head.locator("[data-v4a0-intent]")).toHaveCount(4);
    await expect(head.locator("[data-v4a0-intent]")).toHaveText([
      /Pour toi/, /Cette semaine/, /Ma ville/, /Mes Passio/,
    ]);

    // La tête est le PREMIER contenu de l'écran ; le doublon historique est
    // masqué mais toujours présent dans le DOM (kill switch et moteur).
    expect(await page.evaluate(() =>
      document.getElementById("screen-irl").firstElementChild.id)).toBe("v4a0Head");
    await expect(page.locator("#screen-irl > .section-title")).toBeHidden();
    await expect(page.locator("#irlSearchRow")).toBeHidden();
    await expect(page.locator("#irlCitySearch")).toHaveCount(1);

    // ③ rien n'est retiré sous la tête.
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#irlMapWrap")).toHaveCount(1);
    await expect(page.locator(".irl-chip-create")).toBeVisible();
    await expect(page.locator("#irlToolsBtn")).toBeVisible();
    expect(await page.evaluate(() =>
      document.getElementById("eventList").innerHTML.trim().length)).toBeGreaterThan(0);
  });

  test("aucune demande GPS à l'ouverture sous l'aperçu", async ({ page }) => {
    await boot(page, { query: APERCU });
    await page.evaluate(() => { irlUserLocation = null; window.__geoCalls = 0; });
    await ouvrirIrl(page);
    expect(await page.evaluate(() => window.__geoCalls)).toBe(0);

    // Même après un re-rendu déclenché par la recherche, toujours aucune demande.
    await page.fill("#v4a0Search", "lyon");
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__geoCalls)).toBe(0);

    // Le geste EXPLICITE, lui, reste possible : le moteur historique n'a pas
    // été désarmé, seul l'appel automatique du rendu est neutralisé.
    await page.evaluate(() => requestUserLocation());
    expect(await page.evaluate(() => window.__geoCalls)).toBe(1);
  });

  test("recherche de tête : même champ, même état, aucun second moteur", async ({ page }) => {
    await boot(page, { query: APERCU });
    await ouvrirIrl(page);

    await page.fill("#v4a0Search", "Annecy");
    await page.waitForTimeout(500);

    expect(await page.inputValue("#irlCitySearch")).toBe("Annecy");
    expect(await page.evaluate(() => irlSearchQuery)).toBe("annecy");

    // Le vidage par le moteur historique redescend dans le champ de tête.
    await page.evaluate(() => clearAllIrlFilters());
    await page.waitForTimeout(400);
    expect(await page.inputValue("#irlCitySearch")).toBe("");
    expect(await page.inputValue("#v4a0Search")).toBe("");
  });

  test("intentions : multisélection, Pour toi neutre, aria-pressed", async ({ page }) => {
    await boot(page, { query: APERCU });
    await ouvrirIrl(page);

    const chip = (id) => page.locator(`[data-v4a0-intent="${id}"]`);
    await expect(chip("pour_toi")).toHaveAttribute("aria-pressed", "true");
    await expect(chip("semaine")).toHaveAttribute("aria-pressed", "false");

    await chip("semaine").click();
    await chip("ville").click();
    await expect(chip("semaine")).toHaveAttribute("aria-pressed", "true");
    await expect(chip("ville")).toHaveAttribute("aria-pressed", "true");
    await expect(chip("pour_toi")).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => window.PassioUIV4A0.intents()))
      .toEqual(["semaine", "ville"]);

    // Une deuxième pression retire l'intention (bascule).
    await chip("ville").click();
    await expect(chip("ville")).toHaveAttribute("aria-pressed", "false");

    // « Pour toi » remet l'état neutre.
    await chip("pour_toi").click();
    await expect(chip("pour_toi")).toHaveAttribute("aria-pressed", "true");
    await expect(chip("semaine")).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => window.PassioUIV4A0.intents())).toEqual([]);

    // Clavier : les intentions sont des boutons, atteignables et actionnables.
    await chip("semaine").focus();
    await page.keyboard.press("Enter");
    await expect(chip("semaine")).toHaveAttribute("aria-pressed", "true");
  });

  test("kill switch local : écran historique rendu intégralement", async ({ page }) => {
    await boot(page, { query: DEMO, killLocal: true });
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a0"))).toBe(false);
    await expect(page.locator("#v4a0Head")).toHaveCount(0);
    await expect(page.locator("#screen-irl > .section-title")).toBeVisible();
    await expect(page.locator("#irlSearchRow")).toBeVisible();
  });

  test("kill switch mémoire en cours de session : retour sans rechargement", async ({ page }) => {
    await boot(page, { query: DEMO });
    await ouvrirIrl(page);
    await expect(page.locator("#v4a0Head")).toBeVisible();

    await page.evaluate(() => { window.PASSIO_UI_4A0 = false; window.PassioUIV4A0.apply(); });
    await expect(page.locator("#v4a0Head")).toHaveCount(0);
    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a0"))).toBe(false);
    await expect(page.locator("#irlSearchRow")).toBeVisible();
    await expect(page.locator("#screen-irl > .section-title")).toBeVisible();

    // L'écran historique refonctionne : la recherche historique rend toujours.
    await page.fill("#irlCitySearch", "lyon");
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => irlSearchQuery)).toBe("lyon");
  });

  for (const largeur of [320, 390, 430]) {
    test(`mobile ${largeur} px : aucun débordement, cibles ≥ 44 px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await boot(page, { query: DEMO });
      await ouvrirIrl(page);

      const debord = await page.evaluate((seuil) => {
        const head = document.getElementById("v4a0Head");
        if (!head) return -1;
        return head.getBoundingClientRect().right - document.documentElement.clientWidth - seuil;
      }, SEUIL_PX);
      expect(debord).toBeLessThanOrEqual(0);

      const hauteurs = await page.evaluate(() =>
        [...document.querySelectorAll("#v4a0Head [data-v4a0-intent], #v4a0Head #v4a0Search")]
          .map((el) => Math.round(el.getBoundingClientRect().height)));
      expect(hauteurs.length).toBe(5);
      for (const h of hauteurs) expect(h).toBeGreaterThanOrEqual(44);
    });
  }
});
