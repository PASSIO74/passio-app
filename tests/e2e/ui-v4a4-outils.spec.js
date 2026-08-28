// Lot UI-4A4 — « Outils » rejoint Liste et Carte, et le panneau accueille les
// intentions. Demandé par Benjamin le 2026-08-28 après essai réel.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① sur l'URL normale, l'écran Rencontrer montre TROIS cases côte à côte —
//      Liste, Carte, Outils — sans que « Outils » devienne un onglet ;
//   ② les quatre intentions ont quitté la tête et vivent dans le panneau ;
//   ③ elles y pilotent le MÊME état qu'avant (aucun second moteur) et, surtout,
//      elles SURVIVENT à leur propre clic — le corps du panneau est réécrit à
//      chaque rendu, et un clic sur une intention déclenche ce rendu ;
//   ④ la pastille de filtres reste alimentée par le moteur historique ;
//   ⑤ le kill switch rend l'écran d'avant : deux cases, déclencheur dans sa
//      barre d'origine, intentions de retour dans la tête ;
//   ⑥ mobile 320 / 390 / 430 px : aucun débordement, cibles ≥ 44 px.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_4a4", "0"));
  }
  // Aucune demande de position : on compte sans jamais y répondre.
  await page.addInitScript(() => {
    window.__geoCalls = 0;
    try {
      const g = navigator.geolocation;
      if (g) {
        Object.defineProperty(g, "getCurrentPosition", {
          configurable: true,
          value: function () { window.__geoCalls++; },
        });
      }
    } catch (e) {}
  });
  await bootOnboarded(page, opts.errors || null, 1, {});
  await page.evaluate(() => { window.supaLoadPosts = async () => []; });
}

async function ouvrirIrl(page) {
  await page.evaluate(() => goTo("irl"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-irl");
    return el && el.classList.contains("active");
  });
  await page.waitForTimeout(300);
}

async function ouvrirOutils(page) {
  await page.locator("#irlToolsBtn").click();
  await page.waitForFunction(() => {
    const r = document.getElementById("ctxToolsRoot");
    return r && r.classList.contains("ctx-open");
  }, null, { timeout: 8000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#ctxToolsBody [data-v4a0-intent]").length === 4,
    null, { timeout: 8000 },
  );
}

test.describe("UI-4A4 — Outils, troisième case de Rencontrer", () => {
  test("URL normale : trois cases côte à côte, dont Outils qui n'est pas un onglet", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await ouvrirIrl(page);

    const barre = page.locator("#v4a3Vue");
    await expect(barre).toBeVisible();
    // Le déclencheur est DANS le commutateur.
    await expect(barre.locator("#irlToolsBtn")).toHaveCount(1);
    // Trois cases visuellement…
    const m = await page.evaluate(() => {
      const b = document.getElementById("v4a3Vue");
      return {
        colonnes: getComputedStyle(b).gridTemplateColumns.split(" ").length,
        enfants: b.children.length,
      };
    });
    expect(m.colonnes).toBe(3);
    expect(m.enfants).toBe(3);

    // …mais DEUX onglets sémantiquement : « Outils » ouvre un dialogue, il ne
    // sélectionne pas une vue. Lui donner role="tab" ferait mentir l'annonce
    // vocale (un tab implique un tabpanel et une sélection exclusive).
    await expect(page.locator("[data-v4a3-onglet]")).toHaveCount(2);
    await expect(page.locator("#irlToolsBtn")).not.toHaveAttribute("role", "tab");
    await expect(page.locator("#irlToolsBtn")).toHaveAttribute("aria-haspopup", "dialog");

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("les quatre intentions ont quitté la tête pour le panneau", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    // Elles ne sont plus visibles dans la tête — mais TOUJOURS dans le DOM :
    // le kill switch doit pouvoir les rendre sans rechargement, et
    // `syncIntentions` continue de les trouver.
    await expect(page.locator("#v4a0Head .v4a0-intents")).toHaveCount(1);
    await expect(page.locator("#v4a0Head .v4a0-intents")).toBeHidden();

    await ouvrirOutils(page);
    const chips = page.locator("#ctxToolsBody [data-v4a0-intent]");
    await expect(chips).toHaveCount(4);
    expect(await chips.allTextContents()).toEqual([
      "✓Tous", "✓Cette semaine", "✓Ma ville", "✓Mes Passio",
    ]);
    await expect(page.locator("#" + "v4a4Intentions .ctx-section-title"))
      .toHaveText("Ce que je cherche");
  });

  test("une intention survit à son propre clic et pilote le même état", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirOutils(page);

    // ⚠️ LE contrôle central de ce lot. Le corps du panneau est réécrit en
    // entier à chaque rendu, et cliquer une intention déclenche renderIRL, donc
    // ce rendu : une chip DÉPLACÉE ici serait arrachée du DOM par son propre
    // clic. Elles sont reconstruites — ce test le prouve.
    await page.locator('#ctxToolsBody [data-v4a0-intent="semaine"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator("#ctxToolsBody [data-v4a0-intent]")).toHaveCount(4);

    // Et l'état est bien celui du moteur historique, pas un second moteur.
    expect(await page.evaluate(() => Array.from(irlDateFilters))).toEqual(["week"]);
    expect(await page.evaluate(() => window.PassioUIV4A0.intents())).toEqual(["semaine"]);
    await expect(page.locator('#ctxToolsBody [data-v4a0-intent="semaine"]'))
      .toHaveAttribute("aria-pressed", "true");

    // Re-taper retire, comme dans la tête.
    await page.locator('#ctxToolsBody [data-v4a0-intent="semaine"]').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => Array.from(irlDateFilters))).toEqual([]);
  });

  test("« Tous » remet le neutre depuis le panneau", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirOutils(page);

    await page.locator('#ctxToolsBody [data-v4a0-intent="semaine"]').click();
    await page.waitForTimeout(400);
    await page.locator('#ctxToolsBody [data-v4a0-intent="pour_toi"]').click();
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => window.PassioUIV4A0.intents())).toEqual([]);
    expect(await page.evaluate(() => Array.from(irlDateFilters))).toEqual([]);
    await expect(page.locator('#ctxToolsBody [data-v4a0-intent="pour_toi"]'))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("la pastille de filtres reste alimentée par le moteur historique", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirOutils(page);

    // Le déclencheur a DÉMÉNAGÉ, pas été reconstruit : c'est ce qui garantit
    // que `_updateIrlFiltersBtn` continue d'écrire dans SA pastille. Un
    // déclencheur recréé aurait laissé le moteur écrire dans un nœud invisible,
    // et le compteur aurait été perdu en silence.
    await page.locator('#ctxToolsBody [data-v4a0-intent="semaine"]').click();
    await page.waitForTimeout(500);
    const badge = page.locator("#irlToolsBadge");
    await expect(badge).toHaveText("1");
    expect(await page.evaluate(() => {
      const b = document.getElementById("irlToolsBadge");
      return !!b.closest("#v4a3Vue");
    })).toBe(true);
  });

  test("aucune demande de position n'est provoquée par le panneau", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { irlUserLocation = null; window.__geoCalls = 0; });
    await ouvrirIrl(page);
    await ouvrirOutils(page);
    await page.locator('#ctxToolsBody [data-v4a0-intent="semaine"]').click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__geoCalls)).toBe(0);
  });

  test("kill switch local au boot : deux cases, écran d'avant rendu", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { killLocal: true, errors });
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a4"))).toBe(false);
    // Deux cases seulement.
    await expect(page.locator("#v4a3Vue [data-v4a3-onglet]")).toHaveCount(2);
    await expect(page.locator("#v4a3Vue #irlToolsBtn")).toHaveCount(0);
    // Le déclencheur est resté dans sa barre d'origine, visible.
    await expect(page.locator(".irl-actionbar #irlToolsBtn")).toBeVisible();
    // Et les intentions sont de retour dans la tête.
    await expect(page.locator("#v4a0Head .v4a0-intents")).toBeVisible();
    await expect(page.locator("#v4a0Head [data-v4a0-intent]")).toHaveCount(4);

    expect(errors.js, "exceptions JS avec le kill switch").toEqual([]);
  });

  test("kill switch mémoire en cours de session : retour sans rechargement", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await expect(page.locator("#v4a3Vue #irlToolsBtn")).toHaveCount(1);

    await page.evaluate(() => { window.PASSIO_UI_4A4 = false; window.PassioUIV4A4.apply(); });
    await page.waitForTimeout(200);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a4"))).toBe(false);
    // Le déclencheur a retrouvé sa barre — sans quoi il aurait disparu de
    // l'écran, le commutateur étant lui-même retiré par le kill switch d'UI-4A3.
    await expect(page.locator(".irl-actionbar #irlToolsBtn")).toBeVisible();
    await expect(page.locator("#v4a0Head .v4a0-intents")).toBeVisible();
  });

  for (const largeur of [320, 390, 430]) {
    test("mobile " + largeur + " px : aucun débordement, cibles ≥ 44 px", async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await boot(page);
      await ouvrirIrl(page);

      const barre = await page.evaluate(() => {
        const doc = document.documentElement;
        const b = document.getElementById("v4a3Vue");
        const cases = Array.from(b.children);
        return {
          deborde: doc.scrollWidth > doc.clientWidth + 1,
          dansLeCadre: b.getBoundingClientRect().right <= doc.clientWidth + 1,
          minHauteur: Math.min.apply(null, cases.map((c) => c.getBoundingClientRect().height)),
        };
      });
      expect(barre.deborde, "la page déborde horizontalement").toBe(false);
      expect(barre.dansLeCadre, "le commutateur sort du cadre").toBe(true);
      expect(barre.minHauteur, "cible tactile d'une case").toBeGreaterThanOrEqual(44);

      await ouvrirOutils(page);
      const panneau = await page.evaluate(() => {
        const doc = document.documentElement;
        const sheet = document.querySelector(".ctx-sheet");
        const close = document.querySelector(".ctx-close");
        const chips = Array.from(document.querySelectorAll("#ctxToolsBody [data-v4a0-intent]"));
        const r = sheet.getBoundingClientRect();
        return {
          deborde: doc.scrollWidth > doc.clientWidth + 1,
          dansLeCadre: r.left >= -1 && r.right <= doc.clientWidth + 1,
          hauteurCroix: close.getBoundingClientRect().height,
          minChip: Math.min.apply(null, chips.map((c) => c.getBoundingClientRect().height)),
        };
      });
      expect(panneau.deborde, "la page déborde une fois le panneau ouvert").toBe(false);
      expect(panneau.dansLeCadre, "la feuille sort du cadre").toBe(true);
      expect(panneau.hauteurCroix, "cible tactile de la croix").toBeGreaterThanOrEqual(44);
      expect(panneau.minChip, "cible tactile d'une intention").toBeGreaterThanOrEqual(44);
    });
  }
});
