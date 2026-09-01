// ══════════════════════════════════════════════════════════════════════════
// RÉFÉRENTIEL PLAT DES PASSIONS — lot flat_passions_v1
//
// Les vingt points demandés par la spécification du 2026-09-01, dans l'ordre.
// Priorité assumée : éprouver l'EXPÉRIENCE (chercher, sélectionner, publier,
// couper le drapeau) plutôt que couvrir chaque branche du moteur.
//
// ⚠️ CE QUE CETTE SUITE NE PEUT PAS PROUVER, et il faut le savoir avant de la
// lire comme un feu vert : la migration n'est PAS appliquée en production, donc
// aucun test ici ne vérifie la RLS réelle ni la recherche serveur. Ces deux-là
// sont prouvées ailleurs, en exécutant la migration sur un vrai PostgreSQL —
// `bash scripts/verifier-migration-passions.sh`, lancé par la CI.
//
// ⚠️ ANGLE MORT STRUCTUREL, hérité de tout le dépôt : `app-helper` pose le
// jeton du gate AVANT la navigation. Aucune suite n'exerce donc la fenêtre
// « gate affiché, application absente », celle où trois des quatre causes
// d'aperçu invisible du 2026-08-28 se produisent.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const referentiel = require("../../scripts/referentiel-passions.js");

const APERCU = "?passio_preview=flat-passions-v1";

// Ouvre la feuille de recherche depuis la bulle « Ajouter » du Fil.
async function ouvrirRecherche(page) {
  await page.locator('#profileStrip [data-passion-tile="__ajouter__"]').click();
  await expect(page.locator(".psel-input")).toBeVisible({ timeout: 10000 });
  // Le référentiel arrive par `fetch` : on attend qu'il soit là, sinon on
  // mesurerait le repli hors ligne en croyant mesurer le référentiel complet.
  await page.waitForFunction(() => window.PassioPassions && window.PassioPassions.pret(), null, { timeout: 15000 });
}

async function chercher(page, texte) {
  await page.locator(".psel-input").fill(texte);
  // L'anti-rebond est à 160 ms ; on attend que la liste ait été repeinte.
  await page.waitForTimeout(450);
  return page.locator(".psel-item-label").allTextContents();
}

// ══════════════════════════════════════════════════════════════════════════
// ① À ④ — LE RÉFÉRENTIEL LUI-MÊME (sans navigateur : c'est de la donnée)
// ══════════════════════════════════════════════════════════════════════════
test.describe("le référentiel", () => {
  const ref = referentiel.charger();

  test("① les 19 identifiants historiques sont conservés", () => {
    // Ils sont référencés par clé étrangère depuis cinq tables de production.
    // En perdre un ne casse pas la recherche : il casse toutes les publications
    // qui le portent.
    const ids = new Set(ref.passions.map((p) => p.id));
    for (const id of referentiel.CANONIQUES) {
      expect(ids.has(id), "identifiant historique manquant : " + id).toBe(true);
    }
    expect(referentiel.CANONIQUES.length).toBe(19);
  });

  test("② aucun doublon après normalisation, ni entre libellés ni avec les alias", () => {
    const parLabel = new Map();
    for (const p of ref.passions) {
      const n = referentiel.normeIdentite(p.label);
      expect(parLabel.has(n), "libellé en double : " + p.label + " (" + p.id + " et " + parLabel.get(n) + ")").toBe(false);
      parLabel.set(n, p.id);
    }
    const labelsRecherche = new Set(ref.passions.map((p) => referentiel.norme(p.label)));
    for (const p of ref.passions) {
      for (const a of p.aliases) {
        const n = referentiel.norme(a);
        if (n === referentiel.norme(p.label)) continue;
        expect(labelsRecherche.has(n),
          "l'alias « " + a + " » de " + p.id + " est le libellé d'une autre passion").toBe(false);
      }
    }
  });

  test("③ aucun univers, aucune spécialité : un seul niveau", () => {
    // Le modèle plat se vérifie sur la STRUCTURE, pas sur l'interface : si un
    // champ de hiérarchie revenait dans les données, l'interface suivrait.
    for (const p of ref.passions) {
      expect(p.universe_id, "champ `universe_id` réapparu sur " + p.id).toBeUndefined();
      expect(p.specialty_id, "champ `specialty_id` réapparu sur " + p.id).toBeUndefined();
    }
    // `broader` existe, mais c'est une RELATION — et elle est facultative.
    const sansBroader = ref.passions.filter((p) => !p.broader).length;
    expect(sansBroader).toBeGreaterThan(20);
  });

  test("④ chaque relation pointe vers une passion qui existe", () => {
    const ids = new Set(ref.passions.map((p) => p.id));
    for (const r of ref.relations) {
      expect(ids.has(r.source_passion_id), "relation orpheline : " + r.source_passion_id).toBe(true);
      expect(ids.has(r.target_passion_id), "relation orpheline : " + r.target_passion_id).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ⑤ À ⑫ — LA RECHERCHE, DANS L'APPLICATION
// ══════════════════════════════════════════════════════════════════════════
test.describe("la recherche", () => {
  test("⑤ le référentiel n'est PAS chargé au démarrage", async ({ page }) => {
    // ⚠️ Ce test protège une décision d'architecture, pas un détail : 160 Ko de
    // référentiel sur le chemin critique du démarrage, pour une donnée dont la
    // plupart des sessions n'ont jamais besoin.
    await bootOnboarded(page, null, 1, { query: APERCU });
    const avant = await page.evaluate(() => window.PassioPassions._etat());
    expect(avant.actif).toBe(true);
    expect(avant.pret, "le référentiel a été chargé au démarrage").toBe(false);
    expect(avant.taille).toBe(0);

    await ouvrirRecherche(page);
    const apres = await page.evaluate(() => window.PassioPassions._etat());
    expect(apres.pret).toBe(true);
    expect(apres.taille).toBeGreaterThan(1500);
  });

  test("⑥ correspondance exacte, alias, sans accent, approximative", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await ouvrirRecherche(page);

    // Exacte
    expect((await chercher(page, "Enduro"))[0]).toBe("Enduro");
    // Par alias : « jogging » n'est PAS une passion, c'est un synonyme.
    expect((await chercher(page, "jogging"))[0]).toBe("Course à pied");
    // Sans accent, et avec la casse en désordre
    expect((await chercher(page, "cuisine coreenne"))[0]).toBe("Cuisine coréenne");
    expect((await chercher(page, "GUITARE ELECTRIQUE"))[0]).toBe("Guitare électrique");
    // Approximative : deux mots, dans le désordre, dont un qui n'est pas
    // dans le libellé (« photo » vient du terme plus général, invisible).
    expect((await chercher(page, "photo astro"))[0]).toBe("Astrophotographie");
    // Tiret et espace se valent
    expect((await chercher(page, "moto cross"))[0]).toBe("Motocross");
    // Pluriel raisonnable
    expect((await chercher(page, "guitares"))[0]).toBe("Guitare");
  });

  test("⑦ les résultats sont plafonnés, et une frappe absurde ne rend rien", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await ouvrirRecherche(page);
    const larges = await chercher(page, "a");
    expect(larges.length).toBeGreaterThan(0);
    expect(larges.length, "la liste n'est pas plafonnée").toBeLessThanOrEqual(20);
    const rien = await chercher(page, "zzzqqxwv");
    expect(rien.length).toBe(0);
    await expect(page.locator(".psel-vide")).toContainText("Aucune passion");
  });

  test("⑧ « Enduro » se choisit SANS passer par « Moto »", async ({ page }) => {
    // C'est la promesse produit du lot, et le seul test qui l'exprime
    // directement : aucune catégorie n'est ouverte, aucune étape intermédiaire.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await ouvrirRecherche(page);
    const res = await chercher(page, "enduro");
    expect(res[0]).toBe("Enduro");
    await page.locator('.psel-item[data-psel-id="moto-enduro"]').click();
    const choisies = await page.locator(".psel-puce").allTextContents();
    expect(choisies.join(" | ")).toContain("Enduro");
    // « Moto » n'a JAMAIS été sélectionnée en chemin : le seul geste a été de
    // taper « enduro » puis de toucher le résultat.
    expect(choisies.some((t) => t.includes("Moto"))).toBe(false);
  });

  test("⑨ multi-sélection dans « Mes passions », et le fil la reçoit", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await ouvrirRecherche(page);
    await chercher(page, "enduro");
    await page.locator('.psel-item[data-psel-id="moto-enduro"]').click();
    await chercher(page, "astrophoto");
    await page.locator('.psel-item[data-psel-id="photo-astrophoto"]').click();
    expect(await page.locator(".psel-puce").count()).toBeGreaterThanOrEqual(3); // + la passion d'origine
    await page.locator('[data-psel="valider"]').click();
    await page.waitForTimeout(800);
    const actives = await page.evaluate(() => Array.from(_activeFeedPassions));
    expect(actives).toContain("moto-enduro");
    expect(actives).toContain("photo-astrophoto");
  });

  test("⑩ le Studio est en choix UNIQUE, et il écrit dans #postPassion", async ({ page }) => {
    // ⚠️ `#postPassion` reste la SEULE source de vérité : `publishPost` lit sa
    // valeur. Un sélecteur qui n'écrirait pas dedans publierait sous la
    // mauvaise passion, en silence.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await page.evaluate(() => goTo("studio"));
    await page.waitForTimeout(900);
    // ⚠️ On passe par le chemin RÉEL de l'écran. Sous le lot UI-6, le champ de
    // passion est REPLIÉ derrière un résumé « Publier dans : … · Changer » :
    // tester `#studioPassionBtn` directement testerait un bouton qu'aucun
    // utilisateur n'atteint dans cet état.
    await expect(page.locator("[data-v6-passio]")).toBeVisible();
    await page.locator(".v6-passio .v6-lien").first().click();
    await page.waitForFunction(() => window.PassioPassions && window.PassioPassions.pret(), null, { timeout: 15000 });
    await chercher(page, "musique");
    await page.locator('.psel-item[data-psel-id="musique"]').click();
    await page.waitForTimeout(500);
    expect(await page.locator("#postPassion").inputValue()).toBe("musique");
    // Choix unique : la feuille se REFERME — garder la main après un choix
    // unique laisserait croire qu'on peut en prendre un second.
    await expect(page.locator(".psel-input")).toBeHidden();
  });

  test("⑪ la sélection survit à un rechargement", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await ouvrirRecherche(page);
    await chercher(page, "escalade");
    await page.locator('.psel-item[data-psel-id="sport-escalade"]').click();
    await page.locator('[data-psel="valider"]').click();
    await page.waitForTimeout(900);

    await page.reload();
    await page.waitForFunction(() => {
      const el = document.getElementById("screen-feed");
      return el && el.classList.contains("active");
    }, null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const actives = await page.evaluate(() => Array.from(_activeFeedPassions));
    expect(actives, "la passion choisie n'a pas survécu au rechargement").toContain("sport-escalade");
    const mesPassions = await page.evaluate(() =>
      (state.user.profiles || []).filter((p) => !p.archived).map((p) => p.passion));
    expect(mesPassions).toContain("sport-escalade");
  });

  test("⑫ les publications existantes restent visibles", async ({ page }) => {
    // Le lot ajoute des passions ; il ne doit RIEN retirer. Une publication
    // classée dans une passion historique reste dans le fil.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await page.waitForTimeout(800);
    const cartes = await page.locator("#feedList .post").count();
    expect(cartes, "le fil est vide sous le drapeau").toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ⑬ À ⑱ — MODÈLE, DEMANDES, DROITS, KILL SWITCH
// ══════════════════════════════════════════════════════════════════════════
test.describe("le modèle et les garde-fous", () => {
  test("⑬ aucune passion ne crée de profil : une identité, plusieurs passions", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    const pseudoAvant = await page.evaluate(() => state.user.general.username);
    await ouvrirRecherche(page);
    await chercher(page, "enduro");
    await page.locator('.psel-item[data-psel-id="moto-enduro"]').click();
    await page.locator('[data-psel="valider"]').click();
    await page.waitForTimeout(800);
    const apres = await page.evaluate(() => ({
      pseudo: state.user.general.username,
      noms: (state.user.profiles || []).map((p) => p.name),
    }));
    expect(apres.pseudo).toBe(pseudoAvant);
    // Toutes les entrées portent le MÊME pseudo : ce ne sont pas des comptes.
    expect(new Set(apres.noms).size).toBe(1);
  });

  test("⑭ une passion inexistante ouvre une DEMANDE, pas une passion", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await ouvrirRecherche(page);
    await chercher(page, "zorglubisme quantique");
    const ajouter = page.locator('[data-psel="ajouter"]');
    await expect(ajouter).toBeVisible();
    // ⚠️ Vie privée : le bouton affiche la frappe, il DOIT porter un `data-tel`
    // explicite — sans lui, `telemetry.js` nomme le clic avec son textContent,
    // c'est-à-dire avec la recherche libre de la personne.
    expect(await ajouter.getAttribute("data-tel")).toBe("passion_ajout_demande");
    await ajouter.click();
    await page.waitForTimeout(600);
    const etat = await page.evaluate(() => ({
      demandes: window.PassioPassions.demandes().map((d) => d.label),
      // La demande n'entre PAS dans le référentiel.
      dansReferentiel: !!window.PassioPassions.parId("zorglubisme quantique"),
    }));
    expect(etat.demandes[0]).toBe("zorglubisme quantique");
    expect(etat.dansReferentiel).toBe(false);
  });

  test("⑭ bis — un terme qui existe déjà ne crée pas de demande", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await ouvrirRecherche(page);
    // « jogging » est un ALIAS de « Course à pied » : proposer de l'ajouter
    // remplirait le référentiel de variantes de ce qu'il contient déjà.
    await chercher(page, "jogging");
    await expect(page.locator('[data-psel="ajouter"]')).toHaveCount(0);
  });

  test("⑮ publier sous une passion absente du serveur est REFUSÉ, et dit pourquoi", async ({ page }) => {
    // ⚠️ Le référentiel LOCAL propose 1 908 passions ; le serveur n'en connaît
    // que 19 tant que la migration n'est pas appliquée. La clé étrangère de
    // `posts.passion_id` refuserait l'insert : on refuse AVANT, avec un message.
    await bootOnboarded(page, null, 1, { query: APERCU });
    const publiable = await page.evaluate(() => ({
      historique: estPassionCanonique("musique"),
      nouvelle: estPassionCanonique("moto-enduro"),
      refusParLUI: PassioFlatUI.passionPubliable("moto-enduro"),
    }));
    expect(publiable.historique).toBe(true);
    expect(publiable.nouvelle, "une passion non déployée est devenue publiable").toBe(false);
    expect(publiable.refusParLUI).toBe(false);

    await page.evaluate(() => goTo("studio"));
    await page.waitForTimeout(500);
    await page.locator(".v6-passio .v6-lien").first().click();
    await page.waitForFunction(() => window.PassioPassions && window.PassioPassions.pret(), null, { timeout: 15000 });
    await chercher(page, "enduro");
    await page.locator('.psel-item[data-psel-id="moto-enduro"]').click();
    await page.waitForTimeout(500);
    // Le `<select>` n'a PAS pris la valeur refusée.
    expect(await page.locator("#postPassion").inputValue()).not.toBe("moto-enduro");
    // ⚠️ Et la feuille RESTE OUVERTE : refuser puis refermer laisserait devant
    // un toast d'explication, sans le moyen d'en choisir une autre.
    await expect(page.locator(".psel-input")).toBeVisible();
  });

  test("⑯ le client ne peut pas écrire dans le référentiel", async ({ page }) => {
    // Le référentiel embarqué est en lecture seule côté navigateur : aucune API
    // publique n'ajoute une passion. (La RLS serveur, elle, est prouvée par
    // `scripts/verifier-migration-passions.sh`, qui l'exécute réellement.)
    await bootOnboarded(page, null, 1, { query: APERCU });
    await ouvrirRecherche(page);
    const api = await page.evaluate(() => Object.keys(window.PassioPassions));
    for (const interdit of ["ajouter", "creer", "inserer", "supprimer", "modifier"]) {
      expect(api.some((k) => k.toLowerCase().includes(interdit)),
        "une API d'écriture du référentiel est exposée : " + interdit).toBe(false);
    }
  });

  test("⑰ kill switch : le drapeau coupé rend l'écran historique", async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem("flat_passions_v1", "0"); });
    await bootOnboarded(page, null, 1, { query: APERCU });
    const etat = await page.evaluate(() => window.PassioPassions._etat());
    expect(etat.actif, "le kill switch local n'a pas priorité sur l'aperçu").toBe(false);
    // Aucune trace du lot : ni bulle « Ajouter », ni bouton de Studio actif.
    expect(await page.locator('#profileStrip [data-passion-tile="__ajouter__"]').count()).toBe(0);
    await page.evaluate(() => goTo("studio"));
    await page.waitForTimeout(900);
    await expect(page.locator("#studioPassionBtn")).toBeHidden();
    // ⚠️ ON N'ATTEND PAS `#postPassion` VISIBLE, et c'est important : sous le lot
    // UI-6 le champ de passion est REPLIÉ derrière « Publier dans : … ·
    // Changer », drapeau ou pas. Ce que ce test doit prouver, c'est que le lot
    // plat a bien RENDU la main — il ne doit plus rester de `display:none` posé
    // par lui — et que le chemin historique (déplier le `<select>`) fonctionne.
    const masqueParLeLot = await page.locator("#postPassion").evaluate((el) => el.style.display);
    expect(masqueParLeLot, "le lot a laissé son display:none derrière lui").not.toBe("none");
    await page.locator(".v6-passio .v6-lien").first().click();
    await page.waitForTimeout(400);
    await expect(page.locator("#postPassion")).toBeVisible();
    // Et aucune feuille de recherche ne s'est ouverte.
    expect(await page.locator(".psel-input").count()).toBe(0);
  });

  test("⑰ bis — sans aperçu, le lot est totalement absent", async ({ page }) => {
    await bootOnboarded(page, null, 1);          // URL normale, aucun paramètre
    const etat = await page.evaluate(() => window.PassioPassions._etat());
    expect(etat.actif).toBe(false);
    expect(etat.pret, "le référentiel a été téléchargé hors aperçu").toBe(false);
    expect(await page.locator('#profileStrip [data-passion-tile="__ajouter__"]').count()).toBe(0);
  });

  test("⑱ le pliage du navigateur est celui du référentiel construit", async ({ page }) => {
    // ⚠️ Trois pliages différents (navigateur, générateur, base), c'est
    // « moto cross » qui trouve « Motocross » d'un côté et pas de l'autre.
    await bootOnboarded(page, null, 1, { query: APERCU });
    const cas = ["Moto Cross", "CUISINE CORÉENNE", "  Guitare   Électrique ", "Tir à l'arc", "C++"];
    const cote = await page.evaluate((c) => c.map((x) => window.PassioPassions.norme(x)), cas);
    expect(cote).toEqual(cas.map((x) => referentiel.norme(x)));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ⑲ ET ⑳ — MOBILE
// ══════════════════════════════════════════════════════════════════════════
test.describe("mobile", () => {
  for (const largeur of [320, 390, 430]) {
    test(`⑲ ${largeur} px : la recherche est utilisable, sans débordement`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 780 });
      await bootOnboarded(page, null, 1, { query: APERCU });
      await ouvrirRecherche(page);
      await chercher(page, "enduro");

      // Le champ doit être visible ET la première ligne de résultat aussi :
      // ouvrir sur un écran où rien n'est sélectionnable serait un cul-de-sac.
      await expect(page.locator(".psel-input")).toBeInViewport();
      await expect(page.locator(".psel-item").first()).toBeInViewport();

      // ⚠️ 16 px minimum : en dessous, iOS zoome à la mise au point et l'écran
      // part de travers, clavier ouvert, sans retour possible.
      const taille = await page.locator(".psel-input").evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize));
      expect(taille).toBeGreaterThanOrEqual(16);

      // Cible tactile : la ligne de résultat se mesure sur sa BOÎTE.
      const h = await page.locator(".psel-item").first().evaluate((el) => el.getBoundingClientRect().height);
      expect(h).toBeGreaterThanOrEqual(44);

      // ⚠️ La croix « effacer » ne s'affiche QUE quand il y a quelque chose à
      // effacer. Mesurée visible sur un champ vide : `[hidden]` est une règle
      // du navigateur, qu'un `display` posé sur une classe bat en spécificité.
      await page.locator(".psel-input").fill("");
      await page.waitForTimeout(300);
      await expect(page.locator(".psel-vider")).toBeHidden();

      // ⑳ Aucun défilement horizontal imposé — ni sur la page, ni sur la liste.
      const debord = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        liste: (() => {
          const l = document.querySelector(".psel-liste");
          return l ? l.scrollWidth > l.clientWidth + 1 : false;
        })(),
      }));
      expect(debord.page, "la page déborde horizontalement").toBe(false);
      expect(debord.liste, "la liste de résultats impose un glissement latéral").toBe(false);
    });
  }
});
