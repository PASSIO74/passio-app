// Lot UI-4A5 — « Filtres » devient une VUE de « Rencontrer », et les bulles de
// passion y entrent. Demandé par Benjamin le 2026-08-29 après essai réel :
// « les bulles de profil dans le filtre, et l'onglet Filtres fait comme pour
// Liste et Carte : quand on clique dessus tu n'ouvres plus un panel mais tu
// affiches dessous tous les choix. »
//
// Ce que cette suite prouve, et rien d'autre :
//   ① le clic sur « Filtres » n'ouvre PLUS le dialogue contextuel — il affiche
//      les choix EN LIGNE, sous les onglets ;
//   ② les bulles de passion ont quitté le corps de l'écran pour ce panneau, et
//      y filtrent toujours en direct (aucun second moteur) ;
//   ③ le calendrier, le curseur de distance et la plage horaire y sont aussi —
//      donc « tous les choix », et plus aucune feuille par-dessus ;
//   ④ les trois cases sont exclusives : une seule sélectionnée à la fois ;
//   ⑤ le kill switch rend l'écran d'avant à la lettre — bulles à leur place,
//      volets dans leur feuille, et le bouton rouvre le dialogue.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript((k) => localStorage.setItem(k, "0"), opts.killLocal);
  }
  await bootOnboarded(page, opts.errors || null, 1, {});
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

async function ouvrirFiltres(page) {
  await page.locator("#irlToolsBtn").click();
  await page.waitForFunction(
    () => document.documentElement.getAttribute("data-v4a5-vue") === "filtres",
    null, { timeout: 8000 },
  );
  await page.waitForTimeout(200);
}

test.describe("UI-4A5 — « Filtres », troisième vue de Rencontrer", () => {
  test("le clic sur Filtres n'ouvre plus de dialogue : les choix s'affichent dessous", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await ouvrirIrl(page);

    // Avant le clic : le panneau existe (il héberge des nœuds déplacés) mais
    // n'est pas montré, et la liste tient l'écran.
    await expect(page.locator("#v4a5Panneau")).toHaveCount(1);
    await expect(page.locator("#v4a5Panneau")).toBeHidden();
    await expect(page.locator("#eventList")).toBeVisible();

    await ouvrirFiltres(page);

    // ⚠️ Le cœur du lot : le dialogue contextuel n'est PAS ouvert.
    expect(await page.evaluate(() => !!(window.ContextualTools && ContextualTools.isOpen()))).toBe(false);
    await expect(page.locator("#ctxToolsRoot.ctx-open")).toHaveCount(0);
    // …et la feuille historique de filtres non plus.
    expect(await page.evaluate(() => {
      const p = document.getElementById("irlFiltersPanel");
      return p ? getComputedStyle(p).display : "absent";
    })).toBe("none");

    // Les choix sont là, en ligne, et la liste a passé la main.
    await expect(page.locator("#v4a5Panneau")).toBeVisible();
    await expect(page.locator("#eventList")).toBeHidden();

    expect(errors.js, "exceptions JS").toEqual([]);
    expect(errors.console, "erreurs console").toEqual([]);
  });

  test("les bulles de passion vivent DANS le filtre, et y filtrent en direct", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    // Le nœud historique a été DÉPLACÉ, pas recréé : c'est le même id, donc le
    // même que `renderIrlPassionTiles()` réécrit à chaque rendu.
    await expect(page.locator("#v4a5Passions #irlPassionRow")).toHaveCount(1);
    // Hors de la vue Filtres, elles ne sont plus sur l'écran.
    await expect(page.locator("#irlPassionRow")).toBeHidden();

    await ouvrirFiltres(page);
    await expect(page.locator("#irlPassionRow")).toBeVisible();

    const avant = await page.evaluate(() => document.getElementById("v4a5Done").textContent);
    const bulle = page.locator("#v4a5Passions [data-irlpassion]").first();
    await expect(bulle).toBeVisible();
    await bulle.click();
    await page.waitForTimeout(500);

    // Le MÊME état que le moteur historique, et la pastille du moteur suit.
    expect(await page.evaluate(() => irlPassionFilterSet().size)).toBe(1);
    expect(await page.evaluate(() => document.getElementById("irlToolsBadge").textContent)).toBe("1");
    // La vue reste ouverte : on filtre sans être renvoyé ailleurs.
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBe("filtres");
    // Et le pied annonce le nouveau résultat.
    const apres = await page.evaluate(() => document.getElementById("v4a5Done").textContent);
    expect(apres).not.toBe(avant);
  });

  test("tous les choix sont dessous : intentions, ville, mes événements, date/distance/horaire", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    // Les quatre intentions, construites par UI-4A0 (aucun moteur dupliqué).
    await expect(page.locator("#v4a5Intents [data-v4a0-intent]")).toHaveCount(4);

    // Ville + « Mes événements » / « Mes inscriptions », servis par
    // irlToolsSections() et rendus par ContextualTools.
    await expect(page.locator("#v4a5Outils .ctx-item")).toHaveCount(3);
    await expect(page.locator('#v4a5Outils [data-irlfilter="mine"]')).toHaveCount(1);
    await expect(page.locator('#v4a5Outils [data-irlfilter="joined"]')).toHaveCount(1);

    // ⚠️ La section « affiner » est RETIRÉE : plus rien ne rouvre une feuille.
    expect(await page.evaluate(
      () => document.getElementById("v4a5Outils").innerHTML.indexOf("openIrlFiltersPanel"),
    )).toBe(-1);

    // Les volets historiques sont là, déplacés depuis la feuille.
    await expect(page.locator("#v4a5Avance .irl-ftabs")).toHaveCount(1);
    await expect(page.locator("#v4a5Avance #irlPaneDate")).toHaveCount(1);
    await expect(page.locator("#v4a5Avance #irlPaneDist")).toHaveCount(1);
    await expect(page.locator("#v4a5Avance #irlPaneTime")).toHaveCount(1);

    // ⚠️ Le calendrier n'était peint qu'à l'ouverture de la feuille historique.
    // Sans l'appel explicite du lot, le volet Date s'ouvrirait VIDE — un échec
    // parfaitement muet.
    expect(await page.evaluate(
      () => document.querySelectorAll("#irlCalGrid .irl-cal-day").length,
    )).toBeGreaterThan(27);

    // Les autres volets restent accessibles sur place, sans quitter la vue.
    await page.locator("#irlFtabTime").click();
    await page.waitForTimeout(250);
    await expect(page.locator("#irlPaneTime")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBe("filtres");
  });

  test("trois cases exclusives : une seule sélectionnée à la fois", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    // Le déclencheur est devenu un ONGLET : il ne promet plus un dialogue.
    await expect(page.locator("#irlToolsBtn")).toHaveAttribute("role", "tab");
    await expect(page.locator("#irlToolsBtn")).not.toHaveAttribute("aria-haspopup", "dialog");

    const selectionnes = () => page.evaluate(() => {
      const b = document.getElementById("v4a3Vue");
      return [...b.querySelectorAll('[role="tab"]')]
        .filter((t) => t.getAttribute("aria-selected") === "true")
        .map((t) => t.id || t.getAttribute("data-v4a3-onglet"));
    });

    expect(await selectionnes()).toEqual(["liste"]);
    await ouvrirFiltres(page);
    expect(await selectionnes()).toEqual(["irlToolsBtn"]);

    // Un clic sur Liste rend la main à UI-4A3 : la vue Filtres se referme.
    await page.locator('[data-v4a3-onglet="liste"]').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBeNull();
    await expect(page.locator("#eventList")).toBeVisible();
    expect(await selectionnes()).toEqual(["liste"]);

    // Cible tactile de référence du projet.
    const box = await page.locator("#irlToolsBtn").boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test("depuis la vue Carte, Filtres reprend l'écran (la carte s'efface)", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    await page.locator('[data-v4a3-onglet="carte"]').click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a3-vue"))).toBe("carte");

    await ouvrirFiltres(page);
    // La carte quitte l'écran comme en vue Liste : trois vues exclusives.
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a3-vue"))).toBe("liste");
    await expect(page.locator("#v4a5Panneau")).toBeVisible();
  });

  test("le pied ramène au résultat, et « Tout effacer » remet à zéro", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    await page.locator("#v4a5Passions [data-irlpassion]").first().click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => _irlActiveFilterCount())).toBeGreaterThan(0);

    await page.locator("#v4a5Reset").click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => _irlActiveFilterCount())).toBe(0);
    // Effacer ne quitte pas la vue : on voit ce qu'on vient de rendre.
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBe("filtres");

    await page.locator("#v4a5Done").click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBeNull();
    await expect(page.locator("#eventList")).toBeVisible();
  });

  test("quitter l'écran referme la vue : on revient sur la liste", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    await page.evaluate(() => goTo("feed"));
    await page.waitForTimeout(500);
    await ouvrirIrl(page);

    // Revenir sur « Rencontrer » montre son CONTENU, pas le panneau de filtres.
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBeNull();
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#v4a5Panneau")).toBeHidden();
  });

  test("kill switch local : l'écran d'avant, à la lettre", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors, killLocal: "passio_ui_4a5" });
    await ouvrirIrl(page);

    await expect(page.locator("#v4a5Panneau")).toHaveCount(0);
    // Les bulles sont revenues sur l'écran, à leur place d'origine.
    expect(await page.evaluate(
      () => document.getElementById("irlPassionRow").parentElement.id,
    )).toBe("screen-irl");
    // Les volets sont restés dans leur feuille.
    await expect(page.locator("#irlFiltersPanel .irl-ftabs")).toHaveCount(1);
    await expect(page.locator("#irlFiltersPanel #irlPaneDate")).toHaveCount(1);

    // Et le bouton rouvre le dialogue historique.
    await expect(page.locator("#irlToolsBtn")).toHaveAttribute("aria-haspopup", "dialog");
    await expect(page.locator("#irlToolsBtn")).not.toHaveAttribute("role", "tab");
    await page.locator("#irlToolsBtn").click();
    await page.waitForFunction(() => {
      const r = document.getElementById("ctxToolsRoot");
      return r && r.classList.contains("ctx-open");
    }, null, { timeout: 8000 });

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("cohabitation avec la vue Carte : chacun son ancrage, aucun va-et-vient", async ({ page }) => {
    // Depuis le 2026-08-30, la vue Carte DÉPLACE `#irlMapWrap` juste avant la
    // liste — donc APRÈS le panneau de filtres, que ce lot remet à chaque rendu
    // au ras du commutateur. Deux modules qui viseraient le même point
    // d'ancrage se renverraient la balle : cette suite le vérifie.
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await ouvrirIrl(page);

    await page.locator('[data-v4a3-onglet="carte"]').click();
    await page.waitForTimeout(600);

    const ordre = () => page.evaluate(() => {
      const ids = ["v4a3Vue", "v4a5Panneau", "irlMapWrap", "eventList"];
      const n = ids.map((id) => document.getElementById(id));
      if (n.some((x) => !x)) return "manquant";
      return n.map((x, i) => (i === 0 ? x.id
        : ((n[i - 1].compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) ? x.id : "!" + x.id)))
        .join(" > ");
    });

    const attendu = "v4a3Vue > v4a5Panneau > irlMapWrap > eventList";
    expect(await ordre()).toBe(attendu);
    // Stable dans le temps : aucun module ne repositionne l'autre en boucle.
    await page.waitForTimeout(900);
    expect(await ordre()).toBe(attendu);

    // La vue Filtres reprend la main : elle ramène la vue Liste, donc la carte
    // sort de l'écran et rend sa place.
    await ouvrirFiltres(page);
    expect(await page.evaluate(() => window.PassioUIV4A3.vue())).toBe("liste");
    await expect(page.locator("#v4a5Panneau")).toBeVisible();
    // Elle est remontée AU-DESSUS du commutateur, à sa place d'origine — et
    // surtout pas reléguée en fin d'écran, sous la liste : son voisin d'origine
    // `#irlPassionRow` vit désormais DANS le panneau, la barre d'action fait
    // donc le repère.
    expect(await page.evaluate(() => {
      const c = document.getElementById("irlMapWrap");
      const b = document.getElementById("v4a3Vue");
      return !!(c.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    expect(await page.evaluate(() => {
      const c = document.getElementById("irlMapWrap");
      const p = c.previousElementSibling;
      return !!(p && p.classList.contains("irl-actionbar"));
    })).toBe(true);

    expect(errors.js, "exceptions JS").toEqual([]);
    expect(errors.console, "erreurs console").toEqual([]);
  });

  test("coupure à chaud : tout est rendu, sans rechargement", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    await page.evaluate(() => { window.PASSIO_UI_4A5 = false; PassioUIV4A5.apply(); });
    await page.waitForTimeout(400);

    await expect(page.locator("#v4a5Panneau")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBeNull();
    expect(await page.evaluate(
      () => document.getElementById("irlPassionRow").parentElement.id,
    )).toBe("screen-irl");
    await expect(page.locator("#irlPassionRow")).toBeVisible();
    await expect(page.locator("#irlFiltersPanel .irl-ftabs")).toHaveCount(1);
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#irlToolsBtn")).toHaveAttribute("aria-haspopup", "dialog");
  });

  for (const largeur of [320, 390, 430]) {
    test(`mobile ${largeur} px : aucun débordement horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 780 });
      await boot(page);
      await ouvrirIrl(page);
      await ouvrirFiltres(page);

      const debord = await page.evaluate(() => {
        const p = document.getElementById("v4a5Panneau");
        const doc = document.documentElement;
        return {
          panneau: p.scrollWidth - p.clientWidth,
          page: doc.scrollWidth - doc.clientWidth,
        };
      });
      expect(debord.panneau, "débordement du panneau").toBeLessThanOrEqual(1);
      expect(debord.page, "débordement de la page").toBeLessThanOrEqual(1);
    });
  }
});
