// Lot UI-4A5 — « Filtre » est une VUE de « Rencontrer ».
//
// ── Deux demandes, deux couches ────────────────────────────────────────────
// ① 2026-08-29, après essai réel : « les bulles de profil dans le filtre, et
//    l'onglet Filtres fait comme pour Liste et Carte : quand on clique dessus
//    tu n'ouvres plus un panel mais tu affiches dessous tous les choix. »
// ② 2026-09-04, maquette validée : cette vue est réorganisée en QUATRE
//    SECTIONS NOMMÉES — Quand ? · Où ? · Quelles passions ? · Horaire —, une
//    ligne discrète « Mes événements | Mes rencontres », et un bouton violet
//    FIXE « Afficher N résultats » posé au-dessus de la barre d'onglets.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① le clic sur « Filtre » n'ouvre PLUS le dialogue contextuel — les choix
//      s'affichent EN LIGNE, sous les onglets ;
//   ② les quatre sections sont là, DANS L'ORDRE, et sans pictogramme de titre ;
//   ③ chaque commande est BRANCHÉE SUR LE MOTEUR RÉEL : cocher change l'état
//      d'`app-07` et le nombre annoncé, décocher le remet, et les filtres se
//      COMBINENT ;
//   ④ le bouton de validation reste visible et au-dessus de la barre
//      d'onglets, safe-area comprise, à toutes les hauteurs de page ;
//   ⑤ le mot est « Filtre », au singulier, partout ;
//   ⑥ le kill switch rend l'écran d'avant à la lettre — bulles à leur place,
//      calendrier dans sa feuille, et le bouton rouvre le dialogue.
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

// Le nombre annoncé par le pied, tel qu'il est ÉCRIT — c'est ce que l'œil lit.
function nombreAffiche(page) {
  return page.evaluate(() => {
    const t = document.getElementById("v4a5Done").textContent;
    if (/Aucun/.test(t)) return 0;
    const m = t.match(/(\d+)/);
    return m ? Number(m[1]) : null;
  });
}

test.describe("UI-4A5 — « Filtre », troisième vue de Rencontrer", () => {
  test("le clic sur Filtre n'ouvre plus de dialogue : les choix s'affichent dessous", async ({ page }) => {
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

  // ══════════════════════════════════════════════════════════════════════════
  // ② LA STRUCTURE DE LA MAQUETTE
  // ⚠️ L'ORDRE est mesuré sur le DOM, pas sur la présence : quatre sections
  // toutes présentes mais rangées autrement donneraient une page différente et
  // un test vert.
  // ══════════════════════════════════════════════════════════════════════════
  test("quatre sections nommées, dans l'ordre, sans pictogramme de titre", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    const titres = await page.$$eval("#v4a5Panneau .v4a5-bloc-titre",
      (ns) => ns.map((n) => n.textContent.trim()));
    expect(titres).toEqual(["Quand ?", "Où ?", "Quelles passions ?", "Horaire"]);

    // ⚠️ AUCUNE ICÔNE DANS UN TITRE DE SECTION (demande du 2026-09-04). Les
    // icônes qui restent sont FONCTIONNELLES et vivent DANS un champ : le
    // calendrier de « Choisir une date », l'épingle de la carte de lieu, le
    // chevron de « Modifier ».
    expect(await page.locator("#v4a5Panneau .v4a5-bloc-titre svg").count()).toBe(0);
    expect(await page.locator("#v4a5Panneau .v4a5-bloc-titre img").count()).toBe(0);
    for (const t of titres) expect(t, "un emoji dans un titre").toMatch(/^[A-Za-zÀ-ÿ' ?]+$/);

    // Les icônes fonctionnelles, elles, sont bien là.
    await expect(page.locator("#v4a5DateBtn .v4a5-ligne-ico svg")).toHaveCount(1);
    await expect(page.locator(".v4a5-lieu-ico svg")).toHaveCount(1);

    // Le contenu de chaque section, dans l'ordre de la maquette.
    expect(await page.$$eval("#v4a5Quand .v4a5-case", (ns) => ns.map((n) => n.textContent.replace("✓", "").trim())))
      .toEqual(["Aujourd'hui", "Cette semaine", "Ce week-end"]);
    await expect(page.locator("#v4a5DateBtn")).toContainText("Choisir une date");
    expect(await page.$$eval("#v4a5Dist .v4a5-case", (ns) => ns.map((n) => n.textContent.replace("✓", "").trim())))
      .toEqual(["5 km", "10 km", "25 km", "50 km"]);
    expect(await page.$$eval("#v4a5Modes .v4a5-case", (ns) => ns.map((n) => n.textContent.replace("✓", "").trim())))
      .toEqual(["Toutes", "Mes passions", "Chercher"]);
    expect(await page.$$eval("#v4a5Horaire .v4a5-case", (ns) => ns.map((n) => n.textContent.replace("✓", "").trim())))
      .toEqual(["Matin", "Après-midi", "Soir"]);

    // La carte de lieu porte le lieu ET d'où il vient — « Annecy » tout seul ne
    // dirait pas si c'est une ville choisie ou la position du téléphone.
    await expect(page.locator("#v4a5LieuNom")).toBeVisible();
    await expect(page.locator("#v4a5LieuBtn")).toContainText("Modifier");

    // Les raccourcis personnels : UNE ligne, deux entrées, visuellement
    // secondaires (pas de case, donc pas au rang d'un filtre).
    const racc = await page.$$eval("#v4a5Raccourcis [data-irlfilter]",
      (ns) => ns.map((n) => n.textContent.trim() + "|" + n.getAttribute("data-irlfilter")));
    expect(racc).toEqual(["Mes événements|mine", "Mes rencontres|joined"]);
    expect(await page.locator("#v4a5Raccourcis .v4a5-case").count()).toBe(0);
  });

  // ⑤ Le mot est « Filtre », au SINGULIER. Ni « Filtres », ni « Filtrer les
  //   rencontres ». On balaie le TEXTE ENTIER de l'écran : retirer le mot d'un
  //   endroit et l'oublier ailleurs est exactement le défaut que ce cas garde.
  test("« Filtre » au singulier, partout sur l'écran", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    await expect(page.locator("#irlToolsBtn")).toContainText("Filtre");
    expect(await page.locator("#irlToolsBtn").textContent()).not.toMatch(/Filtres/);

    await ouvrirFiltres(page);
    const texte = await page.evaluate(() => document.getElementById("screen-irl").innerText);
    expect(texte, "« Filtres » au pluriel").not.toMatch(/Filtres/);
    expect(texte, "« Filtrer les rencontres »").not.toMatch(/Filtrer les rencontres/i);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ③ CHAQUE COMMANDE EST BRANCHÉE SUR LE MOTEUR RÉEL
  // ⚠️ On vérifie l'ÉTAT D'app-07 (`irlDateFilters`, `irlDistanceValue()`,
  // `irlTimePresetKey()`, `irlPassionFilterSet()`), pas l'attribut que le
  // module vient d'écrire : un panneau qui ne ferait que se cocher lui-même
  // serait une maquette, et ce test-là serait vert.
  // ══════════════════════════════════════════════════════════════════════════
  test("« Quand ? » écrit dans irlDateFilters, et « Ce week-end » filtre vraiment", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    const etat = () => page.evaluate(() => [...(irlDateFilters || [])].sort());
    expect(await etat()).toEqual([]);

    await page.locator('[data-v4a5-quand="week"]').click();
    await page.waitForTimeout(350);
    expect(await etat()).toEqual(["week"]);
    await expect(page.locator('[data-v4a5-quand="week"]')).toHaveAttribute("aria-pressed", "true");

    // Un second tap retire le filtre : une case cochée par erreur doit pouvoir
    // se décocher sans passer par « Tout effacer ».
    await page.locator('[data-v4a5-quand="week"]').click();
    await page.waitForTimeout(350);
    expect(await etat()).toEqual([]);
    await expect(page.locator('[data-v4a5-quand="week"]')).toHaveAttribute("aria-pressed", "false");

    // « Ce week-end » est une VALEUR NEUVE du moteur (2026-09-04) : sans son
    // prédicat dans `_filterIrlEvents`, elle ne masquerait rien du tout — une
    // case qui se coche et ne filtre pas.
    await page.locator('[data-v4a5-quand="weekend"]').click();
    await page.waitForTimeout(400);
    expect(await etat()).toEqual(["weekend"]);
    const mesure = await page.evaluate(() => {
      const tous = allEvents().filter((e) => _eventEndAt(e) > Date.now());
      const gardes = _filterIrlEvents(allEvents());
      // Bornes attendues du week-end le plus proche (samedi 00:00 → dimanche 23:59).
      const now = new Date();
      const j = now.getDay();
      const vers = (j === 0) ? -1 : (6 - j);
      const sam = new Date(now.getFullYear(), now.getMonth(), now.getDate() + vers, 0, 0, 0, 0).getTime();
      const dim = new Date(now.getFullYear(), now.getMonth(), now.getDate() + vers + 1, 23, 59, 59, 999).getTime();
      return {
        total: tous.length,
        gardes: gardes.length,
        horsBornes: gardes.filter((e) => e.date < sam || e.date > dim).length,
      };
    });
    expect(mesure.total, "le socle de démonstration doit porter des activités").toBeGreaterThan(0);
    expect(mesure.horsBornes, "une activité hors du week-end est passée").toBe(0);
    expect(mesure.gardes, "« Ce week-end » ne doit pas tout garder").toBeLessThan(mesure.total);
  });

  test("« Où ? » : la distance écrit irlDistanceFilter, « Modifier » ouvre le sélecteur de ville", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    expect(await page.evaluate(() => irlDistanceValue())).toBe("");
    await page.locator('[data-v4a5-dist="25"]').click();
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => irlDistanceValue())).toBe("25");
    // Un seul palier à la fois : choisir 10 km remplace 25 km, il ne s'y ajoute pas.
    await page.locator('[data-v4a5-dist="10"]').click();
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => irlDistanceValue())).toBe("10");
    expect(await page.$$eval("#v4a5Dist [aria-pressed='true']", (ns) => ns.length)).toBe(1);
    // Second tap = retrait.
    await page.locator('[data-v4a5-dist="10"]').click();
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => irlDistanceValue())).toBe("");

    // « Modifier » ouvre le sélecteur de ville HISTORIQUE — aucun second moteur.
    await page.locator("#v4a5LieuBtn").click();
    await page.waitForTimeout(400);
    await expect(page.locator("#irlCitySearchInput")).toBeVisible();
  });

  test("« Quelles passions ? » : Toutes / Mes passions, et les bulles restent le moteur", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    // Le nœud historique a été DÉPLACÉ, pas recréé : c'est le même id, donc le
    // même que `renderIrlPassionTiles()` réécrit à chaque rendu.
    await expect(page.locator("#v4a5Passions #irlPassionRow")).toHaveCount(1);
    await expect(page.locator("#irlPassionRow")).toBeHidden();

    await ouvrirFiltres(page);
    await expect(page.locator("#irlPassionRow")).toBeVisible();

    // Au repos, « Toutes » est le mode : aucun filtre de passion.
    await expect(page.locator('[data-v4a5-passions="toutes"]')).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => irlPassionFilterSet().size)).toBe(0);

    // « Mes passions » pose EXACTEMENT `_irlMyPassions()` — la même liste que
    // le Fil (passions vivantes, archives exclues).
    await page.locator('[data-v4a5-passions="miennes"]').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => [...irlPassionFilterSet()].sort())).toEqual(
      await page.evaluate(() => _irlMyPassions().slice().sort()));
    await expect(page.locator('[data-v4a5-passions="miennes"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-v4a5-passions="toutes"]')).toHaveAttribute("aria-pressed", "false");

    // « Toutes » n'est pas un filtre de plus : c'est l'absence de filtre.
    await page.locator('[data-v4a5-passions="toutes"]').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => irlPassionFilterSet().size)).toBe(0);

    // Une bulle filtre toujours en direct, par la délégation historique.
    const avant = await nombreAffiche(page);
    await page.locator("#v4a5Passions [data-irlpassion]").first().click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => irlPassionFilterSet().size)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBe("filtres");
    expect(await nombreAffiche(page)).not.toBe(avant);

    // ⚠️ AUCUN NUMÉRO SUR LES PASSIONS (demande du 2026-09-04). Le compteur est
    // MASQUÉ, jamais retiré : le moteur continue de l'écrire, et le kill switch
    // le rend — c'est là qu'il garde son sens.
    expect(await page.locator("#v4a5Passions .msg-tile-badge").count(),
      "le moteur doit toujours écrire le compteur").toBeGreaterThan(0);
    const badgesVus = await page.$$eval("#v4a5Passions .msg-tile-badge",
      (ns) => ns.filter((n) => n.offsetParent !== null).length);
    expect(badgesVus, "un numéro reste visible sur une passion").toBe(0);
  });

  test("« Horaire » : Matin / Après-midi / Soir écrivent la plage du moteur", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    expect(await page.evaluate(() => irlTimePresetKey())).toBe("");
    await page.locator('[data-v4a5-horaire="18-23"]').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => irlTimePresetKey())).toBe("18-23");
    // Le moteur historique voit bien la plage, pas seulement l'écran.
    expect(await page.evaluate(() => document.getElementById("irlTimeSum").textContent))
      .toMatch(/18:00 - 23:00/);

    // Une seule plage à la fois, et un second tap la retire.
    await page.locator('[data-v4a5-horaire="6-12"]').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => irlTimePresetKey())).toBe("6-12");
    expect(await page.$$eval("#v4a5Horaire [aria-pressed='true']", (ns) => ns.length)).toBe(1);
    await page.locator('[data-v4a5-horaire="6-12"]').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => irlTimePresetKey())).toBe("");
  });

  test("les filtres se COMBINENT, et le nombre annoncé suit à chaque geste", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    const reel = () => page.evaluate(() => _filterIrlEvents(allEvents()).length);
    const depart = await nombreAffiche(page);
    expect(depart).toBe(await reel());
    expect(depart, "le socle doit porter des activités").toBeGreaterThan(0);

    await page.locator('[data-v4a5-quand="week"]').click();
    await page.waitForTimeout(400);
    const apresDate = await nombreAffiche(page);
    expect(apresDate).toBe(await reel());
    expect(apresDate).toBeLessThanOrEqual(depart);

    await page.locator('[data-v4a5-dist="25"]').click();
    await page.waitForTimeout(400);
    const apresDist = await nombreAffiche(page);
    expect(apresDist).toBe(await reel());
    expect(apresDist, "les deux filtres se cumulent").toBeLessThanOrEqual(apresDate);

    // Les deux restent cochés : cocher l'un n'éteint jamais l'autre.
    await expect(page.locator('[data-v4a5-quand="week"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-v4a5-dist="25"]')).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => _irlActiveFilterCount())).toBeGreaterThanOrEqual(2);
  });

  test("« Mes événements » et « Mes rencontres » pilotent irlFilters", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    const etat = () => page.evaluate(() => [...(irlFilters || [])].sort());
    expect(await etat()).toEqual([]);

    // « Mes rencontres » = les activités auxquelles je me suis INSCRIT, l'état
    // `joined` que le dialogue historique nomme « Mes inscriptions ».
    await page.locator('#v4a5Raccourcis [data-irlfilter="joined"]').click();
    await page.waitForTimeout(400);
    expect(await etat()).toEqual(["joined"]);
    await expect(page.locator('#v4a5Raccourcis [data-irlfilter="joined"]'))
      .toHaveAttribute("aria-pressed", "true");

    await page.locator('#v4a5Raccourcis [data-irlfilter="mine"]').click();
    await page.waitForTimeout(400);
    expect(await etat()).toEqual(["joined", "mine"]);

    // ⚠️ Un seul gestionnaire par clic. La délégation d'app-07 prend déjà
    // `[data-irlfilter]` : un second écouteur posé par le module basculerait
    // DEUX fois, et le filtre paraîtrait mort.
    await page.locator('#v4a5Raccourcis [data-irlfilter="mine"]').click();
    await page.waitForTimeout(400);
    expect(await etat()).toEqual(["joined"]);
  });

  test("« Choisir une date » déplie le vrai calendrier, et le referme au second tap", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    // Le calendrier est le volet historique, DÉPLACÉ : même id, même moteur.
    await expect(page.locator("#v4a5Avance #irlPaneDate")).toHaveCount(1);
    // Il part REPLIÉ : c'est ce qui garde le haut de page lisible.
    await expect(page.locator("#irlPaneDate")).toBeHidden();
    await expect(page.locator("#v4a5DateBtn")).toHaveAttribute("aria-expanded", "false");

    await page.locator("#v4a5DateBtn").click();
    await page.waitForTimeout(350);
    await expect(page.locator("#irlPaneDate")).toBeVisible();
    await expect(page.locator("#v4a5DateBtn")).toHaveAttribute("aria-expanded", "true");

    // ⚠️ Le calendrier n'était peint qu'à l'ouverture de la feuille historique.
    // Sans l'appel explicite du lot, il s'ouvrirait VIDE — un échec muet.
    expect(await page.evaluate(
      () => document.querySelectorAll("#irlCalGrid .irl-cal-day").length,
    )).toBeGreaterThan(27);

    // Un vrai jour se choisit sur place, et la ligne dit alors la période
    // retenue — le seul cas où elle parle : une période venue du calendrier
    // n'a aucune case pour la porter. Cocher « Aujourd'hui » n'y écrit rien
    // (la case le dit déjà), ce que le cas ci-dessous vérifie aussi.
    await page.locator("#irlCalGrid .irl-cal-day:not([disabled]):not(.empty)").first().click();
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => [...(irlDateFilters || [])])).toContain("custom");
    expect(await page.evaluate(() => document.getElementById("v4a5DateTxt").textContent))
      .not.toBe("Choisir une date");

    await page.locator("#v4a5DateBtn").click();
    await page.waitForTimeout(350);
    await expect(page.locator("#irlPaneDate")).toBeHidden();
  });

  // ⚠️ La même information ne s'écrit pas à deux endroits. Cocher
  // « Aujourd'hui » écrivait « Aujourd'hui » sur la ligne juste au-dessous,
  // sous la case qui le disait déjà — deux commandes différentes portant le
  // même mot, et un panneau qui se répète.
  test("cocher une case de « Quand ? » n'écrit rien sur la ligne du calendrier", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    await page.locator('[data-v4a5-quand="today"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator('[data-v4a5-quand="today"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#v4a5DateTxt")).toHaveText("Choisir une date");
    expect(await page.evaluate(
      () => document.getElementById("v4a5DateBtn").classList.contains("is-set"))).toBe(false);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ④ LE BOUTON DE VALIDATION
  // ⚠️ Il est posé dans `.app-shell`, pas dans `.app-main` : dans la zone de
  // défilement il descendrait avec le contenu, et « toujours visible » ne
  // serait vrai que sur une page courte. Ce cas le mesure EN HAUT ET EN BAS de
  // la page — un pied qui ne tiendrait qu'au départ passerait le premier
  // contrôle et échouerait au second.
  // ══════════════════════════════════════════════════════════════════════════
  test("le bouton violet reste au-dessus de la barre d'onglets, page en haut comme en bas", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    const mesure = () => page.evaluate(() => {
      const done = document.getElementById("v4a5Done");
      const nav = document.getElementById("appNavV2") || document.querySelector(".app-nav");
      const r = done.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      return {
        visible: r.width > 0 && r.height > 0,
        hauteur: Math.round(r.height),
        bas: Math.round(r.bottom),
        hautDeLaNav: Math.round(n.top),
        texte: done.textContent,
      };
    });

    const haut = await mesure();
    expect(haut.visible).toBe(true);
    expect(haut.hauteur, "cible tactile du bouton principal").toBeGreaterThanOrEqual(44);
    expect(haut.bas, "le bouton passe sous la barre d'onglets").toBeLessThanOrEqual(haut.hautDeLaNav);
    expect(haut.texte).toMatch(/^Afficher \d+ résultats?$|^Aucun résultat$/);

    // Toute la page se parcourt, et le bouton ne bouge pas d'un pixel.
    await page.evaluate(() => { document.getElementById("appMain").scrollTop = 99999; });
    await page.waitForTimeout(400);
    const bas = await mesure();
    expect(bas.bas).toBe(haut.bas);
    expect(bas.bas).toBeLessThanOrEqual(bas.hautDeLaNav);

    // …et la dernière ligne du panneau reste atteignable : le pied ne doit rien
    // avaler (réserve de défilement sous le contenu).
    const dernier = await page.evaluate(() => {
      const r = document.getElementById("v4a5Raccourcis").getBoundingClientRect();
      const p = document.getElementById("v4a5Pied").getBoundingClientRect();
      return { basDuDernier: Math.round(r.bottom), hautDuPied: Math.round(p.top) };
    });
    expect(dernier.basDuDernier, "« Mes événements » passe sous le bouton")
      .toBeLessThanOrEqual(dernier.hautDuPied);

    // ⚠️ SAFE AREA. La distance au bas se compte DEPUIS la barre d'onglets,
    // dont la hauteur vaut `62px + env(safe-area-inset-bottom)`. Une constante
    // nue suffirait sur Android (inset nul) et glisserait le bouton SOUS la
    // barre d'accueil d'un iPhone — le défaut corrigé jadis sur les toasts.
    // On lit la DÉCLARATION, la seule chose qu'un navigateur sans encoche
    // puisse prouver.
    const declare = await page.evaluate(() => {
      for (const f of document.styleSheets) {
        let regles;
        try { regles = f.cssRules; } catch (e) { continue; }
        for (const r of regles) {
          if (r.selectorText && r.selectorText.indexOf(".v4a5-pied") > -1
            && r.style && r.style.bottom) return r.style.bottom;
        }
      }
      return null;
    });
    expect(declare, "le pied doit se caler sur la safe area").toMatch(/env\(safe-area-inset-bottom/);

    expect(errors.js, "exceptions JS").toEqual([]);
    expect(errors.console, "erreurs console").toEqual([]);
  });

  test("le pied ramène au résultat, et « Tout effacer » remet à zéro", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    // Rien à effacer : la commande ne s'affiche pas. Un bouton toujours actif
    // qui ne fait rien est un bouton qui ment.
    await expect(page.locator("#v4a5Reset")).toBeHidden();

    await page.locator("#v4a5Passions [data-irlpassion]").first().click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => _irlActiveFilterCount())).toBeGreaterThan(0);
    await expect(page.locator("#v4a5Reset")).toBeVisible();

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

  test("l'état sélectionné est restauré en revenant sur la page", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    await page.locator('[data-v4a5-quand="today"]').click();
    await page.waitForTimeout(350);
    await page.locator('[data-v4a5-dist="50"]').click();
    await page.waitForTimeout(350);
    const compte = await nombreAffiche(page);

    // Liste → Carte → Filtre : le même état de recherche et les mêmes filtres.
    await page.locator('[data-v4a3-onglet="liste"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-v4a3-onglet="carte"]').click();
    await page.waitForTimeout(600);
    await ouvrirFiltres(page);

    await expect(page.locator('[data-v4a5-quand="today"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-v4a5-dist="50"]')).toHaveAttribute("aria-pressed", "true");
    expect(await nombreAffiche(page)).toBe(compte);
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

    // L'onglet actif est en VIOLET PLEIN, comme ses deux voisins.
    const peau = await page.evaluate(() => {
      const f = getComputedStyle(document.getElementById("irlToolsBtn"));
      const l = getComputedStyle(document.querySelector('[data-v4a3-onglet="liste"]'));
      return { fondActif: f.backgroundColor, texteActif: f.color, fondInactif: l.backgroundColor };
    });
    expect(peau.fondActif).not.toBe(peau.fondInactif);
    expect(peau.fondActif).not.toMatch(/rgba\(0, 0, 0, 0\)/);
    expect(peau.texteActif, "écriture blanche sur violet plein").toMatch(/rgb\(255, 255, 255\)/);

    // Un clic sur Liste rend la main à UI-4A3 : la vue Filtre se referme.
    await page.locator('[data-v4a3-onglet="liste"]').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBeNull();
    await expect(page.locator("#eventList")).toBeVisible();
    expect(await selectionnes()).toEqual(["liste"]);

    // Cible tactile de référence du projet.
    const box = await page.locator("#irlToolsBtn").boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test("toutes les cibles tactiles de la page font au moins 44 px", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    const petits = await page.$$eval("#v4a5Panneau button, #v4a5Pied button", (ns) => ns
      .filter((n) => n.offsetParent !== null)
      .map((n) => ({ t: (n.textContent || "").trim().slice(0, 24), h: n.getBoundingClientRect().height }))
      .filter((x) => x.h < 44));
    expect(petits, "cibles trop petites").toEqual([]);
  });

  test("depuis la vue Carte, Filtre reprend l'écran (la carte s'efface)", async ({ page }) => {
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

  test("quitter l'écran referme la vue : on revient sur la liste", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    await page.evaluate(() => goTo("feed"));
    await page.waitForTimeout(500);
    await ouvrirIrl(page);

    // Revenir sur « Rencontrer » montre son CONTENU, pas le panneau de filtre.
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBeNull();
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#v4a5Panneau")).toBeHidden();
    // Le pied fixe part avec la vue : un bouton « Afficher N résultats » posé
    // au-dessus du Fil n'aurait aucun sens.
    await expect(page.locator("#v4a5Pied")).toBeHidden();
  });

  test("kill switch local : l'écran d'avant, à la lettre", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors, killLocal: "passio_ui_4a5" });
    await ouvrirIrl(page);

    await expect(page.locator("#v4a5Panneau")).toHaveCount(0);
    await expect(page.locator("#v4a5Pied")).toHaveCount(0);
    // Les bulles sont revenues sur l'écran, à leur place d'origine.
    expect(await page.evaluate(
      () => document.getElementById("irlPassionRow").parentElement.id,
    )).toBe("screen-irl");
    // Les volets sont restés dans leur feuille.
    await expect(page.locator("#irlFiltersPanel .irl-ftabs")).toHaveCount(1);
    await expect(page.locator("#irlFiltersPanel #irlPaneDate")).toHaveCount(1);
    // Le compteur d'activités des bulles redevient VISIBLE : il n'était que
    // masqué, et c'est là qu'il garde son sens.
    expect(await page.$$eval(".msg-tile-badge",
      (ns) => ns.filter((n) => n.offsetParent !== null).length)).toBeGreaterThan(0);

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
    // liste — donc APRÈS le panneau de filtre, que ce lot remet à chaque rendu
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

    // La vue Filtre reprend la main : elle ramène la vue Liste, donc la carte
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
    await expect(page.locator("#v4a5Pied")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-v4a5-vue"))).toBeNull();
    expect(await page.evaluate(
      () => document.getElementById("irlPassionRow").parentElement.id,
    )).toBe("screen-irl");
    await expect(page.locator("#irlPassionRow")).toBeVisible();
    await expect(page.locator("#irlFiltersPanel .irl-ftabs")).toHaveCount(1);
    await expect(page.locator("#eventList")).toBeVisible();
    await expect(page.locator("#irlToolsBtn")).toHaveAttribute("aria-haspopup", "dialog");
  });

  // Le repli du calendrier est propre à cette vue. `openIrlFiltersPanel` ne
  // repose la valeur que si elle est ABSENTE : sans restitution, la feuille
  // historique se serait ouverte avec ses trois volets repliés et aucun onglet
  // sélectionné — un dialogue vide, sans erreur.
  test("coupure : la feuille historique retrouve son volet Date ouvert", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await ouvrirFiltres(page);

    await page.evaluate(() => { window.PASSIO_UI_4A5 = false; PassioUIV4A5.apply(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => openIrlFiltersPanel());
    await page.waitForTimeout(300);

    await expect(page.locator("#irlFiltersPanel #irlPaneDate")).toBeVisible();
    await expect(page.locator("#irlFtabDate")).toHaveAttribute("aria-selected", "true");
  });

  // ⚠️ 320 px = petit Android ; 390 = iPhone courant ; 430 = grand iPhone. Le
  // bouton de validation est mesuré à chacune : c'est la largeur qui fait
  // revenir les libellés à la ligne, donc grandir la page.
  for (const largeur of [320, 390, 430]) {
    test(`mobile ${largeur} px : aucun débordement horizontal, bouton accessible`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 780 });
      await boot(page);
      await ouvrirIrl(page);
      await ouvrirFiltres(page);

      const debord = await page.evaluate(() => {
        const p = document.getElementById("v4a5Panneau");
        const doc = document.documentElement;
        const done = document.getElementById("v4a5Done");
        const nav = document.getElementById("appNavV2") || document.querySelector(".app-nav");
        return {
          panneau: p.scrollWidth - p.clientWidth,
          page: doc.scrollWidth - doc.clientWidth,
          basDuBouton: Math.round(done.getBoundingClientRect().bottom),
          hautDeLaNav: Math.round(nav.getBoundingClientRect().top),
        };
      });
      expect(debord.panneau, "débordement du panneau").toBeLessThanOrEqual(1);
      expect(debord.page, "débordement de la page").toBeLessThanOrEqual(1);
      expect(debord.basDuBouton).toBeLessThanOrEqual(debord.hautDeLaNav);

      // ⚠️ AUCUN LIBELLÉ COUPÉ. À trois colonnes, l'ellipse sortait « Mes
      // évène… » : une case qui ne dit plus ce qu'elle fait. Les libellés
      // reviennent à la ligne, ils ne se tronquent jamais.
      const coupes = await page.$$eval("#v4a5Panneau .v4a5-case-txt", (ns) => ns
        .filter((n) => n.scrollWidth > n.clientWidth + 1)
        .map((n) => n.textContent));
      expect(coupes, "libellés tronqués").toEqual([]);
    });
  }
});
