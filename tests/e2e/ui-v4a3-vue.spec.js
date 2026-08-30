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
// ⚠️ Cette suite pose au boot le kill switch du lot UI-4A5 (2026-08-29), qui
// recouvre le comportement qu'elle observe : depuis ce lot, « Filtres » n'ouvre
// plus le dialogue contextuel, il affiche les choix EN LIGNE sous les onglets.
// Convention du projet : la suite qui observe le comportement historique coupe
// le lot qui le recouvre et garde TOUTES ses assertions ; la cohabitation est
// prouvée à part, dans `ui-v4a5-filtres.spec.js`.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SEUIL_PX = 4;

async function boot(page, opts = {}) {
  await page.addInitScript(() => localStorage.setItem("passio_ui_4a5", "0"));
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

// La carte est-elle RÉELLEMENT dans l'écran ? En vue Liste elle est sortie du
// flux (position absolue très à gauche) : Playwright la considère encore
// « visible » — elle a une boîte non vide et n'est pas en visibility:hidden —
// donc `toBeVisible()` ne dirait rien de ce qui nous intéresse. On mesure sa
// position réelle par rapport au cadre.
const carteDansEcran = (page) => page.evaluate(() => {
  const r = document.getElementById("irlMapWrap").getBoundingClientRect();
  return r.right > 0 && r.left < document.documentElement.clientWidth && r.width > 0;
});

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

    // ① Vue Liste = la LISTE, et rien qu'elle. La carte est hors écran — c'est
    //    le sens d'un commutateur, et la première remarque de Benjamin à
    //    l'essai du 2026-08-28. Elle reste dans le DOM (le moteur
    //    cartographique mesure son conteneur) mais quitte le cadre et l'arbre
    //    d'accessibilité.
    expect(await carteDansEcran(page)).toBe(false);
    await expect(page.locator("#irlMapWrap")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#irlMapWrap")).toHaveCount(1);
    expect(await carteRepliee(page)).toBe(true);
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#eventList .event-card").first()).toBeVisible();
    // « Créer un événement » est masqué par UI-4A0 (le « + » central le sert) ;
    // le nœud reste dans le DOM. Le commutateur ne le touche pas.
    await expect(page.locator(".irl-chip-create")).toHaveCount(1);
    await expect(page.locator(".irl-chip-create")).toBeHidden();

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
    // Elle revient DANS le cadre, et redevient annoncée.
    expect(await carteDansEcran(page)).toBe(true);
    await expect(page.locator("#irlMapWrap")).not.toHaveAttribute("aria-hidden", "true");
    // Sa boîte est réelle : sans dimensions, le moteur cartographique rendrait
    // une carte blanche.
    expect(await page.evaluate(() => {
      const r = document.getElementById("irlMapWrap").getBoundingClientRect();
      return r.width > 100 && r.height > 100;
    })).toBe(true);

    // ⚠️ RÉALIGNÉ le 2026-08-28, sur décision de Benjamin après essai réel : la
    // liste RESTE sous la carte. Une carte seule montre des points, pas ce qui
    // s'y passe — les deux lectures valent mieux qu'un aller-retour d'onglet.
    // Elle est donc VISIBLE, sous la carte, et toujours peuplée.
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#eventList")).toHaveCount(1);
    expect(await page.evaluate(() =>
      document.getElementById("eventList").innerHTML.trim().length)).toBeGreaterThan(0);
    // Et elle est bien SOUS la carte, pas au-dessus.
    expect(await page.evaluate(() => {
      const carte = document.getElementById("irlMapWrap").getBoundingClientRect();
      const liste = document.getElementById("eventList").getBoundingClientRect();
      return liste.top >= carte.top;
    })).toBe(true);
    // La rangée de passions, elle, passe la main : la carte a besoin de la place.
    await expect(page.locator("#irlPassionRow")).toBeHidden();
  });

  test("la carte s'affiche SOUS les onglets, exactement comme la liste", async ({ page }) => {
    // Demandé par Benjamin le 2026-08-30 après essai réel : les trois cases du
    // commutateur doivent produire le MÊME effet — le contenu choisi s'affiche
    // dessous. La carte, elle, vit très haut dans le balisage historique (juste
    // sous la barre d'action) : elle s'affichait donc AU-DESSUS des onglets.
    await boot(page);
    await ouvrirIrl(page);

    await onglet(page, "carte").click();
    await page.waitForTimeout(500);

    // ① Géométrie : le commutateur coiffe la carte, qui coiffe la liste.
    const geo = await page.evaluate(() => {
      const b = document.getElementById("v4a3Vue").getBoundingClientRect();
      const c = document.getElementById("irlMapWrap").getBoundingClientRect();
      const l = document.getElementById("eventList").getBoundingClientRect();
      return { barre: b.bottom, carte: c.top, liste: l.top };
    });
    expect(geo.carte).toBeGreaterThanOrEqual(geo.barre - 1);
    expect(geo.liste).toBeGreaterThanOrEqual(geo.carte);

    // ② Balisage : la carte s'est glissée ENTRE le commutateur et la liste, et
    //    le commutateur reste au-dessus d'elle.
    expect(await page.evaluate(() => {
      const c = document.getElementById("irlMapWrap");
      return c.nextElementSibling && c.nextElementSibling.id;
    })).toBe("eventList");
    expect(await page.evaluate(() => {
      const b = document.getElementById("v4a3Vue");
      const c = document.getElementById("irlMapWrap");
      return !!(b.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);

    // ③ Le nœud est DÉPLACÉ, jamais recréé : le moteur cartographique vit
    //    dedans, et il n'y en a toujours qu'un.
    await expect(page.locator("#irlMapWrap")).toHaveCount(1);
    await expect(page.locator("#irlMap")).toHaveCount(1);

    // ④ Retour à Liste : la carte rend sa place d'origine, et le commutateur
    //    coiffe de nouveau directement la liste.
    await onglet(page, "liste").click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => {
      const l = document.getElementById("eventList");
      return l.previousElementSibling && l.previousElementSibling.id;
    })).toBe("v4a3Vue");
    expect(await page.evaluate(() => {
      const c = document.getElementById("irlMapWrap");
      return c.nextElementSibling && c.nextElementSibling.id;
    })).toBe("irlPassionRow");
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
    expect(await carteDansEcran(page)).toBe(false);
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
    // Sans le lot, l'écran historique revient ENTIER : la carte est dans le
    // cadre, en bande repliée, et n'est plus retirée de l'arbre d'accessibilité.
    expect(await carteDansEcran(page)).toBe(true);
    await expect(page.locator("#irlMapWrap")).not.toHaveAttribute("aria-hidden", "true");
    expect(await carteRepliee(page)).toBe(true);
  });

  test("kill switch mémoire en cours de session : retour sans rechargement", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await expect(page.locator("#v4a3Vue")).toBeVisible();

    await onglet(page, "carte").click();
    await page.waitForTimeout(300);
    // En vue Carte la liste reste visible (décision du 2026-08-28) ; ce qui
    // change avec la coupure, c'est le commutateur lui-même et la rangée de
    // passions, que la vue Carte masquait.
    await expect(page.locator("#irlPassionRow")).toBeHidden();

    await page.evaluate(() => { window.PASSIO_UI_4A3 = false; window.PassioUIV4A3.apply(); });

    await expect(page.locator("#v4a3Vue")).toHaveCount(0);
    // La carte, déplacée sous les onglets par la vue Carte, retrouve sa place
    // d'origine : la coupure ne laisse aucun balisage remanié derrière elle.
    expect(await page.evaluate(() => {
      const c = document.getElementById("irlMapWrap");
      return c.nextElementSibling && c.nextElementSibling.id;
    })).toBe("irlPassionRow");
    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a3"))).toBe(false);
    // L'écran historique est rendu : liste ET rangée de passions.
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#irlPassionRow")).toBeVisible();
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
