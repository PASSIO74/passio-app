// Lot UI-4A1 — raccord des intentions de « Rencontrer ».
//
// ⚠️ MISE EN LIGNE DU 2026-08-28 : UI-4A0 et UI-4A1 sont passés d'APERÇU à
// ACTIFS PAR DÉFAUT sur l'URL normale, sur décision de Benjamin. Les anciens
// liens `?passio_preview=…` restent tolérés mais ne décident plus rien. Trois
// énoncés de cette suite disaient l'inverse et ont été RÉÉCRITS (aucun n'a été
// retiré ni affaibli) : chacun porte, sur place, la raison pour laquelle son
// ancienne formulation ne tient plus.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① sur l'URL NORMALE le raccord est actif, mais NEUTRE : aucune date, aucun
//      prédicat ville, aucun filtre compté tant qu'aucune intention n'est
//      choisie — rien n'est appliqué sans geste humain ;
//   ② la tête UI-4A0 validée apparaît TELLE QUELLE, y compris sur les anciens
//      liens d'aperçu ;
//   ③ « Cette semaine » ne pilote QUE la valeur "week" de `irlDateFilters` ;
//   ④ « Mes passions » ajoute exactement `_irlMyPassions()` et rend le choix
//      détaillé antérieur à l'extinction ;
//   ⑤ « Ma ville » sans ville ouvre le sélecteur HISTORIQUE, ne demande jamais
//      la position, et ne devient active qu'après le choix ;
//   ⑥ les combinaisons sont un ET entre familles, et l'ordre des clics ne change
//      ni le résultat ni la signature de pagination ;
//   ⑦ `clearAllIrlFilters()` devient le nouveau neutre : chips éteintes, page 1,
//      et aucun ancien filtre ressuscité par une coupure ultérieure ;
//   ⑧ kill switches, et la hiérarchie entre eux : couper UI-4A1 défait le seul
//      raccord et laisse la tête (elle est en ligne pour elle-même), couper
//      UI-4A0 rend l'écran historique ENTIER — dans les deux cas sans effacer
//      le choix détaillé posé entre-temps ;
//   ⑨ mobile 320 / 390 / 430 px, cibles ≥ 44 px, clavier et aria-pressed.
//
// ⚠️ RÉALIGNÉ le 2026-08-28 (lot UI-4A4). Les quatre intentions ont QUITTÉ la
// tête pour le panneau « Outils ». Cette suite les observe à leur place
// d'origine : elle pose au boot le kill switch d'UI-4A4 et garde toutes ses
// assertions. Que le RACCORD au moteur survive au déménagement est prouvé
// dans `tests/e2e/ui-v4a4-outils.spec.js`, panneau ouvert.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const APERCU = "?passio_preview=passio-ui-4a1";
const DEMO = "?passio_preview=passio-ui-4a1-demo";
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
  // Coupure du lot AVAL (UI-4A4) : voir l'entête.
  await page.addInitScript(() => localStorage.setItem("passio_ui_4a4", "0"));
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_4a1", "0"));
  }
  await espionnerGeo(page);
  await bootOnboarded(page, null, 1, { query: opts.query || "" });
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

const chip = (page, id) => page.locator(`[data-v4a0-intent="${id}"]`);

// Ville d'une activité RÉELLEMENT visible au moment du test, choisie dans le
// moteur plutôt qu'écrite en dur : le jeu de démonstration est daté en relatif
// (« ce soir 18h30 »), une ville codée en dur ferait rougir la suite selon
// l'heure d'exécution de la CI.
async function villeDuneActivite(page, dansSeptJours = false) {
  return page.evaluate((sept) => {
    const now = Date.now();
    const l = _filterIrlEvents(allEvents())
      .filter((e) => e.city && (!sept || e.date <= now + 7 * 86400000));
    const e = l[l.length - 1];
    return e ? e.city : "";
  }, dansSeptJours);
}

// État du moteur historique, lu à chaud (les Sets sont des `let` de app-07).
const etat = (page) => page.evaluate(() => ({
  dates: [...(irlDateFilters || [])].sort(),
  passions: [...irlPassionFilters].sort(),
  ville: irlCityIntentName(),
  sig: window._irlFilterSig,
  limite: window._irlRenderLimit,
  ids: _filterIrlEvents(allEvents()).map((e) => e.id),
}));

test.describe("UI-4A1 — raccord des intentions", () => {
  // ⚠️ Énoncé RÉÉCRIT le 2026-08-28. L'ancien s'appelait « URL normale : aucun
  // raccord, écran IRL historique intact » et vérifiait que l'aperçu était
  // NÉCESSAIRE pour voir le raccord. Le produit a changé : UI-4A0 et UI-4A1 ont
  // été mis en ligne, ACTIFS PAR DÉFAUT sur l'URL normale, et le drapeau ne sait
  // plus qu'enlever. Continuer d'exiger « aucun raccord » reviendrait à réclamer
  // le retour d'un comportement volontairement supprimé.
  // Ce qui reste vrai, et qui est le véritable enjeu de sécurité produit, c'est
  // que le raccord posé par défaut est NEUTRE : rien n'est filtré tant que
  // l'utilisateur n'a choisi aucune intention. Les assertions d'origine sur
  // l'absence de prédicat ville et sur `_irlActiveFilterCount()` sont donc
  // conservées telles quelles ; la preuve que l'écran historique revient entier
  // est faite à part, par les tests de kill switch plus bas.
  test("URL normale : raccord actif par défaut, et neutre tant qu'aucune intention n'est choisie", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    expect(await page.evaluate(() => ({
      a0: document.documentElement.classList.contains("passio-ui-4a0"),
      a1: document.documentElement.classList.contains("passio-ui-4a1"),
    }))).toEqual({ a0: true, a1: true });
    await expect(page.locator("#v4a0Head")).toHaveCount(1);
    await expect(page.locator("[data-v4a0-intent]")).toHaveCount(4);
    // La tête REMPLACE la ligne de recherche historique, elle ne la retire
    // jamais du DOM : c'est ce qui permet au kill switch de la rendre.
    await expect(page.locator("#irlSearchRow")).toHaveCount(1);
    await expect(page.locator("#irlSearchRow")).toBeHidden();

    // Neutre : « Tous » seul, aucune restriction demandée.
    await expect(chip(page, "pour_toi")).toHaveAttribute("aria-pressed", "true");
    for (const id of ["semaine", "ville", "passio"]) {
      await expect(chip(page, id)).toHaveAttribute("aria-pressed", "false");
    }

    // Le prédicat ville existe dans le moteur mais reste INACTIF : la liste
    // n'est restreinte par rien, et rien n'a été appliqué sans geste humain.
    const e = await etat(page);
    expect(e.dates).toEqual([]);
    expect(e.ville).toBe("");
    expect(e.ids.length).toBeGreaterThan(0);
    expect(await page.evaluate(() => _irlActiveFilterCount())).toBe(0);
    expect(await page.evaluate(() => window.PassioUIV4A1.intents())).toEqual([]);
  });

  test("aperçu : la tête UI-4A0 validée est posée telle quelle", async ({ page }) => {
    await boot(page, { query: DEMO });
    await ouvrirIrl(page);

    expect(await page.evaluate(() => ({
      a0: document.documentElement.classList.contains("passio-ui-4a0"),
      a1: document.documentElement.classList.contains("passio-ui-4a1"),
    }))).toEqual({ a0: true, a1: true });

    await expect(page.locator("#v4a0Head .v4a0-title")).toHaveText("Rencontrer");
    await expect(page.locator("[data-v4a0-intent]")).toHaveCount(4);
    await expect(chip(page, "pour_toi")).toHaveAttribute("aria-pressed", "true");
    // Rien n'est retiré sous la tête : liste, carte et création restent là.
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#irlMapWrap")).toHaveCount(1);
  });

  test("Cette semaine : pilote la seule valeur \"week\"", async ({ page }) => {
    await boot(page, { query: APERCU });
    await ouvrirIrl(page);

    // Un choix détaillé préexistant, posé par le panneau historique.
    await page.evaluate(() => { irlDateFilters.add("month"); renderIRL(); });
    await page.waitForTimeout(200);

    await chip(page, "semaine").click();
    await page.waitForTimeout(300);
    await expect(chip(page, "semaine")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "pour_toi")).toHaveAttribute("aria-pressed", "false");
    expect((await etat(page)).dates).toEqual(["month", "week"]);

    // La liste rendue est bien celle du moteur commun, pas une seconde liste.
    const memeMoteur = await page.evaluate(() =>
      _filterIrlEvents(allEvents()).slice(0, IRL_PAGE_SIZE)
        .every((e) => !!document.querySelector('[data-evid="' + e.id + '"]')));
    expect(memeMoteur).toBe(true);

    // Extinction : "month" survit, seul "week" est retiré.
    await chip(page, "semaine").click();
    await page.waitForTimeout(300);
    expect((await etat(page)).dates).toEqual(["month"]);
  });

  test("Mes passions : ajoute mes passions, rend le choix antérieur", async ({ page }) => {
    await boot(page, { query: APERCU });
    await ouvrirIrl(page);

    await page.evaluate(() => { irlPassionFilters.add("sport"); renderIRL(); });
    await page.waitForTimeout(200);

    const miennes = await page.evaluate(() => _irlMyPassions().sort());
    expect(miennes.length).toBeGreaterThan(0);

    await chip(page, "passio").click();
    await page.waitForTimeout(300);
    await expect(chip(page, "passio")).toHaveAttribute("aria-pressed", "true");
    const apres = (await etat(page)).passions;
    for (const p of miennes) expect(apres).toContain(p);
    expect(apres).toContain("sport");

    await chip(page, "passio").click();
    await page.waitForTimeout(300);
    expect((await etat(page)).passions).toEqual(["sport"]);
  });

  test("Ma ville : sélecteur historique, zéro GPS, active après le choix", async ({ page }) => {
    await boot(page, { query: APERCU });
    await page.evaluate(() => { irlUserLocation = null; window.__geoCalls = 0; });
    await ouvrirIrl(page);

    const ville = await villeDuneActivite(page);
    expect(ville).not.toBe("");
    const avant = await etat(page);

    await chip(page, "ville").click();
    await page.waitForTimeout(300);

    // Le sélecteur HISTORIQUE s'ouvre, l'intention reste inactive, et aucune
    // permission de position n'est demandée.
    await expect(page.locator("#irlCitiesGrid")).toBeVisible();
    await expect(chip(page, "ville")).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => window.__geoCalls)).toBe(0);
    expect((await etat(page)).ville).toBe("");

    // Choix explicite d'une ville : l'intention prend effet, sans second geste.
    await page.evaluate((v) => selectIrlGeoCity(v, 45.757, 4.832), ville);
    await page.waitForTimeout(500);
    await expect(chip(page, "ville")).toHaveAttribute("aria-pressed", "true");

    const e = await etat(page);
    expect(e.ville).toBe(await page.evaluate((v) => _normIrlCityName(v), ville));
    expect(e.ids.length).toBeGreaterThan(0);
    expect(e.ids.length).toBeLessThan(avant.ids.length);
    expect(await page.evaluate((v) => {
      const n = _normIrlCityName(v);
      return _filterIrlEvents(allEvents()).every((ev) => _normIrlCityName(ev.city) === n);
    }, ville)).toBe(true);
    expect(await page.evaluate(() => window.__geoCalls)).toBe(0);

    // Extinction : le prédicat disparaît, la ville de référence reste choisie.
    await chip(page, "ville").click();
    await page.waitForTimeout(300);
    expect((await etat(page)).ville).toBe("");
    expect(await page.evaluate(() => irlSelectedCityName())).toBe(ville);
  });

  test("combinaisons : ET entre familles, ordre des clics indifférent", async ({ page }) => {
    await boot(page, { query: APERCU });
    await ouvrirIrl(page);
    const ville = await villeDuneActivite(page, true);
    expect(ville).not.toBe("");
    await page.evaluate((v) => selectIrlGeoCity(v, 45.757, 4.832), ville);
    await page.waitForTimeout(400);

    await chip(page, "semaine").click();
    await page.waitForTimeout(200);
    await chip(page, "ville").click();
    await page.waitForTimeout(400);
    const a = await etat(page);
    expect(a.ids.length).toBeGreaterThan(0);

    // « Tous » (id pour_toi) remet les trois familles au neutre.
    await chip(page, "pour_toi").click();
    await page.waitForTimeout(300);
    const neutre = await etat(page);
    expect(neutre.dates).toEqual([]);
    expect(neutre.ville).toBe("");

    await chip(page, "ville").click();
    await page.waitForTimeout(200);
    await chip(page, "semaine").click();
    await page.waitForTimeout(400);
    const b = await etat(page);

    expect(b.ids).toEqual(a.ids);
    expect(b.sig).toBe(a.sig);
    expect(b.limite).toBe(a.limite);
    // ET entre familles : tout ce qui reste est dans la ville ET dans les 7 jours.
    expect(await page.evaluate((v) => {
      const now = Date.now();
      const n = _normIrlCityName(v);
      return _filterIrlEvents(allEvents())
        .every((ev) => _normIrlCityName(ev.city) === n && ev.date <= now + 7 * 86400000);
    }, ville)).toBe(true);
  });

  test("clearAllIrlFilters : nouveau neutre, page 1, rien ne ressuscite", async ({ page }) => {
    await boot(page, { query: APERCU });
    await ouvrirIrl(page);
    const ville = await villeDuneActivite(page);
    await page.evaluate((v) => selectIrlGeoCity(v, 45.757, 4.832), ville);
    await page.waitForTimeout(400);

    await chip(page, "semaine").click();
    await page.waitForTimeout(200);
    await chip(page, "ville").click();
    await page.waitForTimeout(200);
    await page.evaluate(() => _showMoreIrlEvents());
    await page.waitForTimeout(200);

    await page.evaluate(() => clearAllIrlFilters());
    await page.waitForTimeout(500);

    const apres = await etat(page);
    expect(apres.dates).toEqual([]);
    expect(apres.ville).toBe("");
    expect(apres.limite).toBe(await page.evaluate(() => IRL_PAGE_SIZE));
    await expect(chip(page, "pour_toi")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "semaine")).toHaveAttribute("aria-pressed", "false");
    await expect(chip(page, "ville")).toHaveAttribute("aria-pressed", "false");

    // Le vide EST le nouveau neutre : une coupure ne rejoue pas l'ancien état.
    await page.evaluate(() => { window.PASSIO_UI_4A1 = false; window.PassioUIV4A1.apply(); });
    await page.waitForTimeout(400);
    const coupe = await etat(page);
    expect(coupe.dates).toEqual([]);
    expect(coupe.ville).toBe("");
  });

  test("kill switch UI-4A1 : effets défaits, choix détaillé préservé", async ({ page }) => {
    await boot(page, { query: DEMO });
    await ouvrirIrl(page);

    await chip(page, "semaine").click();
    await page.waitForTimeout(300);
    // Choix détaillé posé APRÈS l'activation : la coupure ne doit pas l'effacer.
    await page.evaluate(() => { irlDateFilters.add("month"); renderIRL(); });
    await page.waitForTimeout(200);

    await page.evaluate(() => { window.PASSIO_UI_4A1 = false; window.PassioUIV4A1.apply(); });
    await page.waitForTimeout(400);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a1"))).toBe(false);
    expect((await etat(page)).dates).toEqual(["month"]);

    // ⚠️ Fin d'énoncé RÉÉCRITE le 2026-08-28. Elle affirmait : « la tête UI-4A0
    // n'a plus d'héritier actif : elle se retire d'elle-même ». C'était vrai
    // quand la tête n'existait qu'au service de ses héritiers d'aperçu. Ce ne
    // l'est plus : UI-4A0 a été mis en ligne pour LUI-MÊME, actif par défaut, et
    // couper UI-4A1 ne le concerne pas — c'est la hiérarchie voulue (couper la
    // tête coupe le raccord, l'inverse est faux ; voir le test suivant).
    // La tête reste donc posée, et la ligne de recherche historique reste
    // remplacée. Ce que la coupure doit prouver, c'est que le RACCORD est bien
    // défait : d'où la vérification ajoutée ci-dessous.
    await expect(page.locator("#v4a0Head")).toHaveCount(1);
    await expect(page.locator("#irlSearchRow")).toBeHidden();
    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a0"))).toBe(true);

    // Les chips sont revenues au neutre, et surtout elles ne pilotent plus rien :
    // un clic sur « Cette semaine » reste en mémoire de la tête et ne touche
    // AUCUNE valeur de `irlDateFilters`.
    await expect(chip(page, "pour_toi")).toHaveAttribute("aria-pressed", "true");
    await chip(page, "semaine").click();
    await page.waitForTimeout(300);
    expect((await etat(page)).dates).toEqual(["month"]);
    expect(await page.evaluate(() => window.PassioUIV4A1.isActive())).toBe(false);
  });

  test("kill switch UI-4A0 : coupe aussi le raccord et rend l'écran historique", async ({ page }) => {
    await boot(page, { query: DEMO });
    await ouvrirIrl(page);

    await chip(page, "semaine").click();
    await page.waitForTimeout(300);
    expect((await etat(page)).dates).toEqual(["week"]);

    await page.evaluate(() => { window.PASSIO_UI_4A0 = false; window.PassioUIV4A0.apply(); });
    await page.waitForTimeout(400);

    await expect(page.locator("#v4a0Head")).toHaveCount(0);
    await expect(page.locator("#irlSearchRow")).toBeVisible();
    const e = await etat(page);
    expect(e.dates).toEqual([]);
    expect(e.ville).toBe("");
  });

  // ⚠️ Énoncé RÉÉCRIT le 2026-08-28. Il s'appelait « kill switch local : aucun
  // raccord, tête absente » et supposait que couper UI-4A1 faisait disparaître
  // la tête UI-4A0 — vrai tant que la tête n'existait QUE pour ses héritiers
  // d'aperçu. UI-4A0 est désormais en ligne pour lui-même, actif par défaut :
  // son sort ne dépend plus de celui de UI-4A1. Le kill switch local de UI-4A1
  // ne doit donc défaire QUE le raccord, et c'est ce que le test vérifie
  // maintenant — sans rien retirer : la preuve que l'écran historique complet
  // revient est portée par le kill switch de la tête, juste au-dessus.
  test("kill switch local UI-4A1 : aucun raccord, la tête UI-4A0 demeure", async ({ page }) => {
    await boot(page, { query: DEMO, killLocal: true });
    await ouvrirIrl(page);

    expect(await page.evaluate(() => ({
      a0: document.documentElement.classList.contains("passio-ui-4a0"),
      a1: document.documentElement.classList.contains("passio-ui-4a1"),
    }))).toEqual({ a0: true, a1: false });
    await expect(page.locator("#v4a0Head")).toHaveCount(1);
    await expect(page.locator("[data-v4a0-intent]")).toHaveCount(4);
    await expect(page.locator("#irlSearchRow")).toHaveCount(1);
    await expect(page.locator("#irlSearchRow")).toBeHidden();

    // Le raccord, lui, est bien absent : les chips ne pilotent aucun filtre.
    await chip(page, "semaine").click();
    await page.waitForTimeout(300);
    const e = await etat(page);
    expect(e.dates).toEqual([]);
    expect(e.ville).toBe("");
    expect(await page.evaluate(() => _irlActiveFilterCount())).toBe(0);
    expect(await page.evaluate(() => window.PassioUIV4A1.isActive())).toBe(false);
  });

  test("clavier : les intentions s'activent au clavier et exposent leur état", async ({ page }) => {
    await boot(page, { query: APERCU });
    await ouvrirIrl(page);

    await chip(page, "semaine").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await expect(chip(page, "semaine")).toHaveAttribute("aria-pressed", "true");
    expect((await etat(page)).dates).toEqual(["week"]);
  });

  for (const largeur of [320, 390, 430]) {
    test(`mobile ${largeur} px : aucun débordement, cibles ≥ 44 px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await boot(page, { query: DEMO });
      await ouvrirIrl(page);
      await chip(page, "semaine").click();
      await page.waitForTimeout(300);

      const debord = await page.evaluate((seuil) => {
        const head = document.getElementById("v4a0Head");
        if (!head) return -1;
        return head.getBoundingClientRect().right - document.documentElement.clientWidth - seuil;
      }, SEUIL_PX);
      expect(debord).toBeLessThanOrEqual(0);

      const hauteurs = await page.evaluate(() =>
        [...document.querySelectorAll("#v4a0Head [data-v4a0-intent]")]
          .map((el) => Math.round(el.getBoundingClientRect().height)));
      expect(hauteurs.length).toBe(4);
      for (const h of hauteurs) expect(h).toBeGreaterThanOrEqual(44);
    });
  }
});
