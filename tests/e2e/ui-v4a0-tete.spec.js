// Lot UI-4A0 — tête de l'écran « Rencontrer ».
//
// ⚠️ RÉALIGNÉ le 2026-08-28 : le lot est passé d'APERÇU à ACTIF PAR DÉFAUT sur
// l'URL normale (décision de Benjamin, en même temps que UI-4A1, UI-4A2 et
// UI-4B). Deux énoncés de cette suite sont donc devenus FAUX et ont été
// réécrits — aucune assertion n'a été retirée :
//   • « URL normale : rien du lot » disait le contraire de la vérité produit.
//     Le chemin vers l'écran IRL historique n'est plus l'URL normale mais la
//     COUPURE ; ce contrôle est donc devenu celui du kill switch, contraste GPS
//     compris, et l'URL normale est désormais le cas où la tête EST posée ;
//   • `?passio_preview=passio-ui-4a0[-demo]` ne décide plus rien. Les deux
//     constantes ne servent plus qu'à prouver qu'un ancien lien ne ressuscite
//     PAS le lot par-dessus une coupure.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① sur l'URL normale, la tête cible est en place et dans le bon ordre :
//      titre « Rencontrer », sous-titre, recherche, quatre intentions ;
//   ② rien n'est perdu SOUS la tête : la liste, la carte, les cartes et la
//      barre d'action historiques sont toujours là — à la seule exception du
//      bouton « Créer un événement », masqué depuis le 2026-08-28 parce que le
//      « + » central sert déjà ce geste (contrôlé ici, et restitué par la
//      coupure) ;
//   ③ aucune demande GPS à l'ouverture — prouvé PAR CONTRASTE avec la coupure,
//      qui rend l'écran historique et sa demande de position ;
//   ④ la recherche de tête écrit dans le champ historique et alimente le même
//      état (`irlSearchQuery`) : aucun second moteur ;
//   ⑤ les intentions sont multisélectionnables, « Tous » est l'état neutre,
//      et l'état est exposé par `aria-pressed` ;
//   ⑥ les deux kill switches, local et mémoire, posés au boot ou en cours de
//      session : retour intégral à l'écran historique ;
//   ⑦ mobile 320 / 390 / 430 px sans débordement, cibles ≥ 44 px, clavier.
//
// ⚠️ Convention maison (CLAUDE.md, mise en ligne d'UI-3A) : une suite qui
// observe un comportement RECOUVERT par un lot ultérieur pose le kill switch de
// ce lot au boot, garde toutes ses assertions, et laisse la cohabitation être
// prouvée à part. C'est le cas du contrôle ⑤ : les intentions de la tête sont
// un état EN MÉMOIRE tant qu'UI-4A1 ne les raccorde pas au moteur de filtrage.
// UI-4A1 étant lui aussi actif par défaut depuis le 2026-08-28, ce seul test
// pose `localStorage.passio_ui_4a1 = "0"` pour observer la tête seule ; le
// comportement combiné (une intention que le moteur refuse ne peut plus rester
// allumée) appartient à `tests/e2e/ui-v4a1-intentions.spec.js`.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Anciens liens d'aperçu : tolérés, mais ils ne décident plus rien — ils ne
// servent plus ici qu'à prouver qu'ils ne passent PAS outre une coupure.
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
  if (opts.killMemoire) {
    await page.addInitScript(() => { window.PASSIO_UI_4A0 = false; });
  }
  // Coupure du lot HÉRITIER (UI-4A1), pour observer la tête seule. Elle est
  // indépendante de celle d'UI-4A0 : la tête reste posée et pleinement active.
  if (opts.killA1) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_4a1", "0"));
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
  // ⚠️ Énoncé RÉÉCRIT : ce contrôle disait « URL normale : rien du lot ». Depuis
  // la mise en ligne du 2026-08-28, l'URL normale PORTE le lot ; le seul chemin
  // vers l'écran IRL historique est le kill switch. Toutes les assertions
  // d'origine sont conservées, contraste GPS ④ compris : elles décrivent
  // désormais ce que rend la coupure, et non plus l'URL nue.
  test("kill switch local au boot : rien du lot, écran IRL historique intact", async ({ page }) => {
    // L'ancien lien d'aperçu est posé EXPRÈS : il ne doit pas passer outre la
    // coupure (le drapeau ne sait plus qu'enlever).
    await boot(page, { query: DEMO, killLocal: true });
    // Départ franc : aucune position déjà connue, aucun appel déjà compté —
    // le contrôle du contraste ne doit dépendre d'aucun état hérité du boot.
    await page.evaluate(() => { irlUserLocation = null; window.__geoCalls = 0; });
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a0"))).toBe(false);
    await expect(page.locator("#v4a0Head")).toHaveCount(0);
    await expect(page.locator("#screen-irl > .section-title")).toBeVisible();
    await expect(page.locator("#irlSearchRow")).toBeVisible();
    await expect(page.locator("#irlCitySearch")).toBeVisible();
    // Réversibilité du retrait de « Créer un événement » : coupure = bouton rendu.
    await expect(page.locator(".irl-chip-create")).toBeVisible();

    // Contrôle du contraste ③ : sans le lot, la position EST demandée.
    expect(await page.evaluate(() => window.__geoCalls)).toBeGreaterThan(0);
  });

  // ⚠️ Énoncé RÉÉCRIT : ce contrôle s'appelait « aperçu : … » et bootait sur
  // `?passio_preview=passio-ui-4a0-demo`. Le paramètre ne décide plus rien —
  // c'est l'URL NORMALE qui porte désormais la tête. Mêmes assertions, sans le
  // paramètre, pour qu'elles prouvent bien ce que voit un vrai utilisateur.
  test("URL normale : hiérarchie de tête et écran historique conservé dessous", async ({ page }) => {
    await boot(page);
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
      /Tous/, /Cette semaine/, /Ma ville/, /Mes Passio/,
    ]);

    // La tête est le PREMIER contenu de l'écran ; le doublon historique est
    // masqué mais toujours présent dans le DOM (kill switch et moteur).
    expect(await page.evaluate(() =>
      document.getElementById("screen-irl").firstElementChild.id)).toBe("v4a0Head");
    await expect(page.locator("#screen-irl > .section-title")).toBeHidden();
    await expect(page.locator("#irlSearchRow")).toBeHidden();
    await expect(page.locator("#irlCitySearch")).toHaveCount(1);

    // ② rien n'est retiré sous la tête.
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#irlMapWrap")).toHaveCount(1);
    await expect(page.locator("#irlToolsBtn")).toBeVisible();
    // « Créer un événement » a quitté l'écran (2026-08-28) : le « + » central
    // sert ce geste. MASQUÉ, jamais retiré — le kill switch doit le rendre.
    await expect(page.locator(".irl-chip-create")).toHaveCount(1);
    await expect(page.locator(".irl-chip-create")).toBeHidden();
    expect(await page.evaluate(() =>
      document.getElementById("eventList").innerHTML.trim().length)).toBeGreaterThan(0);
  });

  // Le retrait de « Créer un événement » n'est acceptable que si le geste
  // survit ailleurs. On le prouve par le chemin de remplacement, sur l'URL
  // normale : « + » central → « Activité IRL » → le formulaire historique
  // d'`openCreateEvent`. Sans ce contrôle, la suite prouverait la disparition
  // mais pas la survie de la fonction.
  test("le « + » central sert toujours la création d'activité", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    await expect(page.locator(".irl-chip-create")).toBeHidden();

    await page.click('#appNavV2 [data-v2-action="create"]');
    await page.locator('[data-v2-create="irl"]').click();
    await page.waitForFunction(() => {
      const b = document.getElementById("modalBackdrop");
      return b && b.classList.contains("active") && !!document.getElementById("evTitle");
    }, null, { timeout: 8000 });
    await page.evaluate(() => { if (typeof closeModal === "function") closeModal(); });
  });

  test("aucune demande GPS à l'ouverture sur l'URL normale", async ({ page }) => {
    await boot(page);
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
    await boot(page);
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

  // ⚠️ Ce test observe la tête SEULE, avec le kill switch d'UI-4A1 posé au boot
  // (convention maison, cf. en-tête). Motif : depuis le 2026-08-28, UI-4A1 est
  // actif par défaut et raccorde ces mêmes chips au moteur de filtrage, puis
  // RESYNCHRONISE la tête sur l'état réel du moteur après chaque rendu. Une
  // intention que le moteur refuse ne peut donc plus rester allumée — « Ma
  // ville » sans ville choisie ouvre le sélecteur historique et retombe à
  // `aria-pressed="false"`. Ce comportement combiné est vrai, mais il appartient
  // à UI-4A1 ; ce que le lot UI-4A0 doit garantir, et que voici, c'est la
  // mécanique de la tête : bascule, neutre, exposition par `aria-pressed`.
  // Aucune assertion n'a été retirée ni affaiblie.
  test("intentions : multisélection, Tous neutre, aria-pressed", async ({ page }) => {
    await boot(page, { killA1: true });
    await ouvrirIrl(page);

    // Garde-fou : si UI-4A1 redevenait actif ici, ce test n'observerait plus la
    // tête seule et ses attentes deviendraient trompeuses.
    expect(await page.evaluate(() =>
      !!(window.PassioUIV4A1 && window.PassioUIV4A1.isActive()))).toBe(false);

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

    // « Tous » (id pour_toi) remet l'état neutre.
    await chip("pour_toi").click();
    await expect(chip("pour_toi")).toHaveAttribute("aria-pressed", "true");
    await expect(chip("semaine")).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => window.PassioUIV4A0.intents())).toEqual([]);

    // Clavier : les intentions sont des boutons, atteignables et actionnables.
    await chip("semaine").focus();
    await page.keyboard.press("Enter");
    await expect(chip("semaine")).toHaveAttribute("aria-pressed", "true");
  });

  // ⚠️ Énoncé RÉÉCRIT : ce contrôle doublait désormais le premier (kill switch
  // local au boot). Il prouve maintenant la SECONDE coupure, indépendante,
  // posée elle aussi avant la navigation — l'ancien lien d'aperçu ne la contre
  // pas davantage.
  test("kill switch mémoire au boot : écran historique rendu intégralement", async ({ page }) => {
    await boot(page, { query: APERCU, killMemoire: true });
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a0"))).toBe(false);
    await expect(page.locator("#v4a0Head")).toHaveCount(0);
    await expect(page.locator("#screen-irl > .section-title")).toBeVisible();
    await expect(page.locator("#irlSearchRow")).toBeVisible();
  });

  test("kill switch mémoire en cours de session : retour sans rechargement", async ({ page }) => {
    await boot(page);
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
      await boot(page);
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
