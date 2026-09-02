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
const { bootOnboarded, sansPublicationsDistantes } = require("./app-helper");
const referentiel = require("../../scripts/referentiel-passions.js");

const APERCU = "?passio_preview=flat-passions-v1";

// Ouvre la feuille de recherche depuis la bulle « + » du rail du PROFIL.
// ⚠️ ELLE ÉTAIT DANS LE FIL JUSQU'AU 2026-09-01. Benjamin l'a fait déménager :
// « la bulle de rajout de passion doit être sur le profil, pas dans le fil ».
// Le helper passe donc par l'écran Profil — et les tests qui observent ENSUITE
// le Fil doivent y revenir explicitement.
async function ouvrirRecherche(page) {
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(500);
  await page.locator('#v9ProfilePassions [data-passion-tile="__ajouter__"]').click();
  await expect(page.locator(".psel-input")).toBeVisible({ timeout: 10000 });
  // Le référentiel arrive par `fetch` : on attend qu'il soit là, sinon on
  // mesurerait le repli hors ligne en croyant mesurer le référentiel complet.
  await page.waitForFunction(() => window.PassioPassions && window.PassioPassions.pret(), null, { timeout: 15000 });
}

async function chercher(page, texte) {
  await page.locator(".psel-input").fill(texte);
  // ⚠️ ON ATTEND LA RÉPONSE, PAS UNE DURÉE. Un `waitForTimeout(450)` supposait
  // que la recherche répond en moins de 450 ms — vrai avec le repli local,
  // FAUX depuis que la migration est appliquée et que la recherche SERVEUR
  // entre en jeu. La CI a alors lu la liste pendant qu'une réponse était encore
  // en vol et vu les résultats de la frappe PRÉCÉDENTE : « GUITARE ELECTRIQUE »
  // rendait « Cuisine coréenne ». Ce n'était pas un défaut de classement, mais
  // une mesure prise trop tôt — le pire genre de rouge, celui qui envoie
  // chercher au mauvais endroit.
  //
  // La liste porte désormais la frappe à laquelle elle correspond.
  await page.locator('[data-psel-zone="liste"][data-psel-q="' + texte.replace(/"/g, '\\"') + '"]')
    .waitFor({ state: "attached", timeout: 15000 });
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

  test("⑥ bis — le classement ne dépend PAS de la réponse du serveur", async ({ page }) => {
    // ⚠️ DÉFAUT MESURÉ EN CI LE 2026-09-01, invisible tant que la migration
    // n'était pas appliquée. Le client prenait l'ordre du SERVEUR dès qu'il
    // répondait, et les deux barèmes ne coïncident pas : sur « guitares », le
    // navigateur remonte « Guitare », `rechercher_passions` « Guitare
    // électrique ». Même frappe, même appareil, deux écrans différents selon
    // que le réseau avait répondu ou non.
    //
    // Le navigateur est désormais la SEULE autorité sur l'ordre. On l'éprouve
    // en comparant le classement avec et sans serveur — le résultat doit être
    // IDENTIQUE.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await ouvrirRecherche(page);
    const avecServeur = await chercher(page, "guitares");
    // On coupe le serveur pour la session : le moteur retombe sur le local.
    await page.evaluate(() => { window.PassioPassions._etat(); });
    const sansServeur = await page.evaluate(async () => {
      const m = window.PassioPassions;
      const r = await m.chercherAsync("guitares", { limite: 20, serveur: false });
      return r.map((p) => p.label);
    });
    expect(avecServeur[0], "le premier résultat dépend de la réponse serveur").toBe(sansServeur[0]);
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
    // ⚠️ DEUX PUCES, PAS TROIS. La porte est passée du Fil au Profil : elle
    // ouvre sur une sélection VIDE (on ajoute à son compte) là où celle du Fil
    // pré-cochait ce qu'on voyait déjà. Le compte en avait une : elle n'est
    // plus une puce, mais elle compte dans le plafond.
    expect(await page.locator(".psel-puce").count()).toBe(2);
    await page.locator('[data-psel="valider"]').click();
    await page.waitForTimeout(800);
    // Ajouter au compte alimente aussi le Fil (`ajouterPassionAuFil`) : choisir
    // de posséder une passion, c'est la voir.
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
    // ⚠️ PAS « musique » : c'est la passion du compte de test, donc la valeur
    // DÉJÀ dans `#postPassion`. On ne pourrait pas distinguer « le sélecteur a
    // écrit » de « c'était déjà là ». « photo » est publiable et différente.
    await chercher(page, "photo");
    await page.locator('.psel-item[data-psel-id="photo"]').click();
    await page.waitForTimeout(300);
    // ⚠️ LE TAP SÉLECTIONNE, LE BOUTON CONCLUT. Conclure au tap privait l'écran
    // de toute confirmation, et laissait un choix REFUSÉ sans rien à toucher.
    // Signalé par Benjamin sur la preview : « je n'arrive pas à la valider,
    // il manque l'onglet valider ».
    const valider = page.locator('[data-psel="valider"]');
    await expect(valider).toBeVisible();
    await expect(valider).toBeEnabled();
    expect(await page.locator("#postPassion").inputValue()).not.toBe("photo");
    await valider.click();
    await page.waitForTimeout(500);
    expect(await page.locator("#postPassion").inputValue()).toBe("photo");
    // Choix unique : la feuille se REFERME — garder la main après un choix
    // unique laisserait croire qu'on peut en prendre un second.
    await expect(page.locator(".psel-input")).toBeHidden();
  });

  test("⑩ bis — la bulle du Fil porte le NOM de la passion, jamais « Passion »", async ({ page }) => {
    // ⚠️ DÉFAUT MESURÉ PAR BENJAMIN SUR LA PREVIEW, et déjà trouvé par le lot
    // TAXO-1 avant d'être laissé revenir ici : `allPassions()` ne connaît que
    // les 19 du socle embarqué, donc `passionById` retombait sur le générique
    // « ✨ Passion » pour tout identifiant venu de la recherche. Pire que
    // l'affichage : `ajouterPassionAuCompte` RECOPIE emoji et couleur dans
    // l'entrée créée — la valeur générique était PERSISTÉE.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await ouvrirRecherche(page);
    await chercher(page, "enduro");
    await page.locator('.psel-item[data-psel-id="moto-enduro"]').click();
    await page.locator('[data-psel="valider"]').click();
    await page.waitForTimeout(900);
    await page.evaluate(() => goTo("feed"));
    await page.waitForTimeout(600);

    const bulle = page.locator('#profileStrip [data-passion-tile="moto-enduro"]');
    await expect(bulle).toHaveCount(1);
    await expect(bulle).toContainText("Enduro");
    const texte = (await bulle.textContent()) || "";
    expect(texte, "la bulle affiche le générique au lieu du nom choisi").not.toContain("Passion");
    expect(texte, "la bulle porte l'emoji générique").not.toContain("✨");

    // Et le nom résolu ne dépend pas de ce qui a été PERSISTÉ : l'entrée créée
    // doit elle-même porter le bon libellé, pas le générique.
    const enBase = await page.evaluate(() => passionById("moto-enduro"));
    expect(enBase.label).toBe("Enduro");
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
    // ⚠️ CE TEST A CHANGÉ D'EXEMPLE LE 2026-09-01, PAS DE SUJET. Il s'appuyait
    // sur « moto-enduro », absente du serveur tant que la migration n'était pas
    // appliquée. Elle l'est désormais (vérifié en production : 1 908 passions
    // actives, 0 publication orpheline), donc les 1 908 sont publiables et cet
    // exemple ne prouve plus rien.
    //
    // Ce qui compte n'était pas l'accident de données mais le MÉCANISME : une
    // passion que le serveur ne connaît pas doit être refusée AVANT l'insert,
    // avec un motif visible. On l'exerce donc en neutralisant l'autorité
    // (`estPassionCanonique`) plutôt qu'en comptant sur un trou du référentiel
    // — un test qui dépend d'un état de la base se retourne le jour où la base
    // change, et c'est exactement ce qui vient d'arriver.
    await bootOnboarded(page, null, 1, { query: APERCU });

    // Le plancher local refuse toujours un identifiant inconnu, migration ou pas.
    const plancher = await page.evaluate(() => ({
      historique: estPassionCanonique("musique"),
      inventee: estPassionCanonique("zorglubisme-quantique-inexistant"),
    }));
    expect(plancher.historique).toBe(true);
    expect(plancher.inventee, "un identifiant inventé est devenu publiable").toBe(false);

    await page.evaluate(() => goTo("studio"));
    await page.waitForTimeout(500);
    // ⚠️ IDENTIFIANT NU, jamais `window.estPassionCanonique` : c'est le binding
    // global que `PassioFlatUI.passionPubliable` résout, et un stub posé à côté
    // laisserait le test vert-aveugle (piège déjà payé sur `supa` et `MY_UID`).
    await page.evaluate(() => {
      const vrai = estPassionCanonique;
      estPassionCanonique = (id) => (id === "moto-enduro" ? false : vrai(id));
    });
    expect(await page.evaluate(() => PassioFlatUI.passionPubliable("moto-enduro"))).toBe(false);

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
    // ⚠️ LE MOTIF EST AFFICHÉ, pas seulement annoncé en toast — un toast
    // disparaît avant d'être lu, et on reste devant une sélection affichée sans
    // comprendre pourquoi rien n'avance.
    await expect(page.locator(".psel-refus")).toBeVisible();
    await expect(page.locator(".psel-refus")).toContainText("Enduro");
    // Et le bouton de validation est DÉSACTIVÉ : la porte est fermée, pas
    // seulement gardée derrière un message.
    await expect(page.locator('[data-psel="valider"]')).toBeDisabled();
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
    // Aucune trace du lot : ni bulle « + » au Profil, ni bouton de Studio actif.
    // ⚠️ ON LA CHERCHE OÙ ELLE VIT (rail du Profil). La chercher dans le Fil
    // rendrait ce test vert quoi qu'il arrive depuis son déménagement — une
    // règle qui survit à la disparition de sa cible, la famille de défauts la
    // plus fréquente de ce dépôt.
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(500);
    expect(await page.locator('#v9ProfilePassions [data-passion-tile="__ajouter__"]').count()).toBe(0);
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

  test("⑰ bis — sans aperçu, le lot est ACTIF : c'est le défaut depuis le 2026-09-01", async ({ page }) => {
    // ⚠️ ASSERTION RETOURNÉE, PAS SUPPRIMÉE. Ce test exigeait l'ABSENCE du lot
    // sur une URL normale, ce qui était vrai tant que le drapeau était éteint.
    // Il exige désormais sa PRÉSENCE — de sorte qu'une extinction accidentelle
    // du lot reste visible. Vider le test l'aurait rendue invisible.
    await bootOnboarded(page, null, 1);          // URL normale, aucun paramètre
    const etat = await page.evaluate(() => window.PassioPassions._etat());
    expect(etat.actif, "le lot n'est pas actif par défaut").toBe(true);
    // ⚠️ MAIS LE RÉFÉRENTIEL N'EST TOUJOURS PAS CHARGÉ AU DÉMARRAGE. C'est
    // l'invariant qui protège le temps de démarrage : 160 Ko ne partent qu'au
    // premier usage RÉEL de la recherche, jamais au boot.
    expect(etat.pret, "le référentiel est téléchargé au démarrage").toBe(false);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(500);
    expect(await page.locator('#v9ProfilePassions [data-passion-tile="__ajouter__"]').count()).toBe(1);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // « ✨ Passion » SANS SON NOM — le référentiel arrivait trop tard (2026-09-02)
  //
  // ⚠️ CES DEUX CAS SONT INDISSOCIABLES : le premier exige que le nom apparaisse,
  // le second que rien ne soit téléchargé quand il n'y a rien à nommer. Corriger
  // l'un en cassant l'autre est précisément ce qui a failli arriver — la
  // première rédaction préchargeait le référentiel pour tout le monde et faisait
  // rougir ⑤ et ⑰ bis, qui protègent 160 Ko sur le chemin critique.
  // ══════════════════════════════════════════════════════════════════════════
  test("⑰ ter — une passion du référentiel s'affiche AVEC SON NOM, sans ouvrir le sélecteur", async ({ page }) => {
    // ⚠️ MESURÉ À L'ÉCRAN PAR BENJAMIN : trois bulles « ✨ Passion » au milieu de
    // passions bien nommées. `passionById` (app-02) résout le socle embarqué,
    // interroge ensuite `PassioPassions`, et rend le générique quand il ne sait
    // pas — or `charger()` n'était déclenché QUE par l'ouverture du sélecteur.
    const etatAvecPassionPlate = {
      onboarded: true, landingSeen: true, tourSeen: true,
      user: {
        name: "Audit QA", birthYear: 1995, isMinor: false,
        currentProfileId: "pp_0",
        profiles: [{ id: "pp_0", name: "Audit QA", passion: "sport-escalade", emoji: "🧗", bio: "", color: "#7c3aed", createdAt: 1 }],
        drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
        following: [], general: { username: "Audit QA" },
      },
      userPosts: [], userEvents: [], notifications: [],
      currentMood: "all", selectedFeedPassions: ["sport-escalade"],
    };
    await bootOnboarded(page, null, 1, { state: etatAvecPassionPlate });

    // Le nom arrive sans le moindre geste : c'est tout l'objet du correctif.
    await page.waitForFunction(
      () => (document.getElementById("profileStrip") || {}).textContent?.includes("Escalade"),
      null, { timeout: 20000 }
    );
    const rail = await page.locator("#profileStrip").innerText();
    expect(rail).toContain("Escalade");
    // ⚠️ Et le générique a bien DISPARU : le repeint invalide `_lastHtml`, sans
    // quoi le rail garderait ses bulles génériques pour toute la session, un
    // référentiel pourtant chargé.
    expect(rail).not.toMatch(/(^|\n)\s*Passion\s*(\n|$)/);
  });

  test("⑰ quater — un compte qui ne vit que sur le socle ne télécharge RIEN de plus", async ({ page }) => {
    // Le pendant du cas précédent : `bootOnboarded` pose des passions du socle
    // (musique/sport/cuisine). Rien à nommer ⇒ rien à charger, et l'invariant
    // des 160 Ko tient — y compris après l'hydratation, qui est le moment où la
    // question se pose.
    // ⚠️ LE FIL DOIT ÊTRE À NOUS, SINON CE TEST NE MESURE PAS CE QU'IL CROIT.
    // Depuis que la détection regarde aussi les publications que le fil va
    // peindre (et c'est nécessaire : une carte nomme la passion de SON auteur),
    // une seule publication de production portant une passion du référentiel
    // déclencherait le chargement — légitimement. Le test deviendrait alors
    // rouge au gré du CONTENU DE LA PROD, exactement la maladie que #249 et
    // #252 ont soignée. On coupe donc la lecture réseau des publications.
    await sansPublicationsDistantes(page);
    await bootOnboarded(page, null, 3);
    // ⚠️ ON ATTEND QUE LE VERDICT SOIT RENDU, sinon on mesurerait un « pas
    // encore chargé » qui ne prouve rien. `boot()` pose `_etatCompteCharge`
    // même sans session — c'est ce qui rend l'attente courte et déterministe.
    await page.waitForFunction(() => window._etatCompteCharge === true, null, { timeout: 20000 });
    // Le module réexamine « rien ne manque » à cadence décroissante
    // (800/1600/3000/6000 ms) : on couvre toute la série avant de conclure.
    await page.waitForTimeout(12000);
    const etat = await page.evaluate(() => window.PassioPassions._etat());
    expect(etat.actif).toBe(true);
    expect(etat.pret, "le référentiel a été chargé alors que rien ne manquait").toBe(false);
    expect(etat.taille).toBe(0);
  });

  // ⚠️ CONSTAT MAJEUR DE LA REVUE : la détection ne regardait QUE mes passions.
  // Une carte du fil nomme la passion de SON AUTEUR — suivre quelqu'un qui
  // publie dans une passion du référentiel suffisait à voir « ✨ Passion » sur
  // sa carte, sans que rien ne déclenche jamais le chargement.
  test("⑰ quinquies — la passion d'AUTRUI dans le fil déclenche le chargement et s'affiche nommée", async ({ page }) => {
    await sansPublicationsDistantes(page);
    await bootOnboarded(page, null, 1);          // mes passions : socle uniquement
    await page.evaluate(() => {
      // ⚠️ LE SEED N'EST PAS VIDÉ, ET C'EST TOUT L'INTÉRÊT. La première rédaction
      // écrivait `state.seed.posts = [un seul post]`, plaçant la publication
      // d'autrui à l'indice 0 : le test restait vert même si la détection ne
      // regardait qu'UNE publication. Or `buildSeed()` en fabrique 265, toutes
      // plus récentes que ce que le réseau rapporte, et c'est précisément ce qui
      // rendait le correctif inopérant en production (constat bloquant du
      // 2026-09-02). On sème donc la publication d'autrui là où elle vit
      // vraiment — `supabasePosts` — DERRIÈRE les 265 publications de seed.
      state.supabasePosts = [{
        id: "p_escalade_autrui", authorId: "u_lea", passion: "sport-escalade",
        mood: "all", text: "Voie ouverte ce matin.", createdAt: Date.now() - 86400000 * 30,
        likes: 0, comments: [],
      }];
      setFeedPassions(["sport-escalade"]);
      saveState(); goTo("feed"); renderFeed();
    });
    // Prémisse VÉRIFIÉE : le seed est bien peuplé, donc la publication d'autrui
    // est loin dans la liste triée — sinon ce cas ne prouverait rien.
    expect(await page.evaluate(() => (state.seed.posts || []).length))
      .toBeGreaterThan(100);
    // Le référentiel est chargé sans le moindre geste, et le nom est résolu :
    // c'est tout l'objet du correctif. On interroge la fonction de PRODUCTION
    // (`passionById`), pas le fil peint — la publication d'autrui est
    // volontairement ancienne, donc hors des vingt cartes rendues d'emblée.
    await page.waitForFunction(
      () => window.PassioPassions && window.PassioPassions.pret(),
      null, { timeout: 25000 }
    );
    const nom = await page.evaluate(() => passionById("sport-escalade").label);
    expect(nom).toBe("Escalade");
    expect(nom).not.toBe("Passion");
  });

  // ⚠️ SECOND CONSTAT MAJEUR : le rail du Profil a son PROPRE garde,
  // `data-v9-sig`, calculé sur les identifiants et aveugle aux libellés. Sans
  // l'invalider, `renderProfilePassionRail` sortait en `return` anticipé et
  // gardait ses bulles génériques pour toute la session.
  test("⑰ sexies — le rail du PROFIL est repeint lui aussi, malgré sa signature", async ({ page }) => {
    const etat = {
      onboarded: true, landingSeen: true, tourSeen: true,
      user: {
        name: "Audit QA", birthYear: 1995, isMinor: false, currentProfileId: "pp_0",
        profiles: [{ id: "pp_0", name: "Audit QA", passion: "sport-escalade", emoji: "🧗", bio: "", color: "#7c3aed", createdAt: 1 }],
        drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
        following: [], general: { username: "Audit QA" },
      },
      userPosts: [], userEvents: [], notifications: [],
      currentMood: "all", selectedFeedPassions: ["sport-escalade"],
    };
    await sansPublicationsDistantes(page);
    await bootOnboarded(page, null, 1, { state: etat });
    await page.evaluate(() => goTo("profiles"));
    await page.waitForFunction(
      () => (document.getElementById("v9ProfilePassions") || {}).textContent?.includes("Escalade"),
      null, { timeout: 25000 }
    );
    const rail = await page.locator("#v9ProfilePassions").innerText();
    expect(rail).toContain("Escalade");
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

// ══════════════════════════════════════════════════════════════════════════
// ㉖ — L'ONBOARDING : LA GRILLE DEVIENT UNE RECHERCHE
//
// ⚠️ CONTREPARTIE OBLIGATOIRE DU KILL SWITCH POSÉ DANS
// `onboarding-passions-v2.spec.js`. Cette suite-là observe l'écran d'AVANT et
// garde toutes ses assertions ; sans le test ci-dessous, ÉTEINDRE l'ancien
// comportement l'aurait fait sans rien verrouiller à la place — et la copie
// neuve pourrait disparaître sans qu'aucun test ne bronche.
// ══════════════════════════════════════════════════════════════════════════
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

test.describe("l'onboarding sous le lot", () => {
  test("㉖ la grille de 19 tuiles est remplacée par une recherche, et la copie le dit", async ({ page }) => {
    await page.addInitScript(([k, t]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
      window.PASSIO_ONBOARDING_V2 = true;
    }, [GATE_KEY, GATE_TOKEN]);
    await page.goto("/index.html");
    await page.waitForFunction(() => typeof renderPassionGrid === "function", null, { timeout: 20000 });
    await page.evaluate(() => {
      window.supaSaveUserState = async () => {};
      window.supaUpsertProfile = async () => {};
      window.supaInit = () => {};
      // Par la transition de l'application elle-même : dévoiler le calque à la
      // main laisse la landing active PAR-DESSUS, et son bouton intercepte les
      // clics (piège documenté dans `onboarding-passions-v2.spec.js`).
      exitLandingAsAuth("signup");
      onbStepIdx = onbSteps.indexOf("passions");
      showOnbStep("passions");
      selectedPassions.length = 0;
      renderPassionGrid();
    });

    // La copie annonce la recherche — c'est la formulation exigée par le cahier
    // des charges du 2026-09-01, mot pour mot.
    const copie = await page.evaluate(() => ({
      titre: document.querySelector("#onbPassionsTitle").textContent.trim(),
      texte: document.querySelector("#onbPassionsText").textContent.trim(),
    }));
    expect(copie.titre).toBe("Qu'est-ce qui te passionne ?");
    expect(copie.texte).toBe("Recherche et choisis directement ce que tu aimes.");

    // Le champ de recherche du sélecteur est là, et le champ HISTORIQUE est
    // masqué : deux champs de recherche à l'écran seraient un doublon muet.
    await expect(page.locator(".psel-input")).toBeVisible();
    const histo = await page.locator("#onbPassionSearch").evaluate((el) => el.style.display);
    expect(histo, "le champ de recherche historique subsiste à côté du neuf").toBe("none");

    // ⚠️ ON NE MONTE QU'UNE FOIS. `renderPassionGrid` est rappelée à CHAQUE
    // sélection : re-monter le composant viderait le champ et refermerait le
    // clavier à chaque passion cochée.
    await page.locator(".psel-input").fill("enduro");
    await page.waitForTimeout(450);
    await page.evaluate(() => renderPassionGrid());
    expect(await page.locator(".psel-input").inputValue(),
      "le composant a été remonté : la frappe est perdue").toBe("enduro");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ㉑ À ㉕ — LA PORTE A DÉMÉNAGÉ, ET ELLE EST PLAFONNÉE (2026-09-01)
//
// Deux demandes de Benjamin après essai réel de la preview : la bulle d'ajout
// appartient au Profil, pas au Fil ; et au-delà de trois passions, ce sera
// payant — sans tarif affiché tant que l'offre n'est pas ouverte.
// ══════════════════════════════════════════════════════════════════════════
test.describe("la porte d'ajout et son plafond", () => {
  // Amène le compte à N passions vivantes, en écrivant dans l'état comme le
  // ferait l'application. On ne passe PAS par le sélecteur : ce helper sert à
  // POSER la situation, pas à prouver le chemin.
  async function poserNPassions(page, n) {
    await page.evaluate((cible) => {
      const dispo = ["musique", "photo", "sport", "cuisine", "voyage"];
      state.user.profiles = dispo.slice(0, cible).map((pid, i) => ({
        id: "p_test_" + i,
        name: state.user.general.username,
        passion: pid,
        emoji: "✨",
        bio: "",
        color: "#8b5cf6",
        createdAt: Date.now(),
      }));
      state.user.currentProfileId = state.user.profiles[0].id;
      saveState();
    }, n);
  }

  test("㉑ la bulle « + » est sur le Profil, et nulle part dans le Fil", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await page.waitForTimeout(800);
    // Le Fil n'en porte plus : c'est une commande de lecture.
    expect(await page.locator('#profileStrip [data-passion-tile="__ajouter__"]').count()).toBe(0);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(600);
    const bulle = page.locator('#v9ProfilePassions [data-passion-tile="__ajouter__"]');
    await expect(bulle).toHaveCount(1);
    await expect(bulle).toBeVisible();
    // Et elle ouvre bien la recherche.
    await bulle.click();
    await expect(page.locator(".psel-input")).toBeVisible({ timeout: 10000 });
  });

  test("㉒ à trois passions, la porte annonce que la suite sera payante", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(600);
    await page.locator('#v9ProfilePassions [data-passion-tile="__ajouter__"]').click();
    await page.waitForTimeout(500);

    // Pas de feuille de recherche : on n'ouvre pas ce qui ne peut rien conclure.
    expect(await page.locator(".psel-input").count()).toBe(0);
    const modale = page.locator("#modalContent");
    await expect(modale).toContainText("Trois passions offertes");
    await expect(modale).toContainText("payante");
    // ⚠️ AUCUN TARIF. Ordre explicite de Benjamin : « ne mets pas de valeur, tu
    // mets juste que ça va être payant mais pas de tarif pour l'instant ».
    const texte = (await modale.textContent()) || "";
    expect(texte, "un montant est affiché alors que l'offre n'est pas ouverte")
      .not.toMatch(/\d+\s*(?:[,.]\d+)?\s*(?:€|euros?|EUR)/i);
    // ⚠️ AUCUN BOUTON « PAYER » : le paiement n'est pas ouvert, un bouton qui
    // ne mène nulle part est un clic mort.
    expect(texte).not.toMatch(/payer|s'abonner|souscrire/i);
    // ⚠️ REPRISE EXPLICITE DE LA GARANTIE D'ADR-009. Le test « créer un 4ᵉ
    // profil est libre » (adr-009-retrait-economie) observe la surface d'avant
    // le plafond et pose donc le kill switch. Ce qu'il protégeait vraiment,
    // c'est l'ABSENCE DE MONNAIE INTERMÉDIAIRE — pas l'absence de tout paiement,
    // que l'ADR autorise explicitement en monnaie réelle. Cette garantie-là est
    // reprise ici, sur la surface neuve, sinon l'éteindre là-bas l'aurait
    // simplement fait disparaître.
    expect(texte, "l'économie retirée par ADR-009 réapparaît dans la fenêtre")
      .not.toMatch(/💎|Passia|Pass Passion|points?\b|étoiles?|solde|rang/i);
    // La seule action réelle est proposée : réorganiser ses trois passions.
    await expect(page.locator('[data-tel="passion_paywall_gerer"]')).toBeVisible();
  });

  test("㉒ bis — le plafond tient au POINT D'ÉCRITURE, pas seulement à la porte", async ({ page }) => {
    // ⚠️ Garder la porte ne suffit pas : tout appelant futur d'`ajouterPassionAuCompte`
    // contournerait le plafond. C'est la leçon de `meOpen`, prise dans l'autre sens.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const apres = await page.evaluate(() => {
      const rendu = ajouterPassionAuCompte("moto-enduro", "");
      return {
        rendu: rendu,
        vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
      };
    });
    expect(apres.rendu, "l'écriture a été acceptée au-delà du plafond").toBe(null);
    expect(apres.vivantes).toBe(3);
    await expect(page.locator("#modalContent")).toContainText("Trois passions offertes");
  });

  test("㉓ archiver libère une place, et restaurer reste gratuit sous le plafond", async ({ page }) => {
    // ⚠️ NE PAS ROUVRIR LA PORTE DÉROBÉE ④ DU LOT UI-8 : là-bas, le paywall
    // barrait la restauration d'une passion DÉJÀ possédée. Ici, reprendre une
    // archive est gratuit tant qu'on reste sous trois vivantes — sinon le
    // compte au plafond n'aurait aucune sortie.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const etat = await page.evaluate(() => {
      const id = state.user.profiles[2].id;
      archiverPassion(id);
      const apresArchivage = (state.user.profiles || []).filter((p) => !p.archived).length;
      const placeLibre = passionsRestantesOffertes();
      restaurerPassion(id);
      return {
        apresArchivage,
        placeLibre,
        apresRestauration: (state.user.profiles || []).filter((p) => !p.archived).length,
        archivee: !!(state.user.profiles || []).find((p) => p.id === id && p.archived),
      };
    });
    expect(etat.apresArchivage).toBe(2);
    expect(etat.placeLibre).toBe(1);
    expect(etat.apresRestauration, "la restauration a été barrée sous le plafond").toBe(3);
    expect(etat.archivee).toBe(false);
  });

  test("㉓ bis — restaurer une QUATRIÈME passion vivante est barré", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const etat = await page.evaluate(() => {
      // Une quatrième, archivée d'emblée : le compte la possède déjà.
      state.user.profiles.push({
        id: "p_test_arch", name: state.user.general.username, passion: "voyage",
        emoji: "✨", bio: "", color: "#8b5cf6", createdAt: Date.now(), archived: true,
      });
      saveState();
      restaurerPassion("p_test_arch");
      return {
        vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
        toujoursArchivee: !!(state.user.profiles || []).find((p) => p.id === "p_test_arch" && p.archived),
      };
    });
    expect(etat.vivantes, "le plafond se contourne par la liste des archives").toBe(3);
    expect(etat.toujoursArchivee).toBe(true);
    await expect(page.locator("#modalContent")).toContainText("Trois passions offertes");
  });

  test("㉓ ter — depuis la PORTE réelle, reprendre une passion archivée est gratuit", async ({ page }) => {
    // ⚠️ CONTREPARTIE DU KILL SWITCH POSÉ SUR `ui-v8-passions.spec.js`.
    // Cette suite-là portait le verrou « quota : archiver puis restaurer ne
    // réclame jamais de paiement » — la porte dérobée ④ du lot UI-8, où l'on
    // réclamait de l'argent pour reprendre une passion qu'on possédait déjà.
    // Son test passe par `#newProfileGrid`, la grille que ce lot remplace : il
    // est donc éteint chez lui. L'éteindre SANS reprendre la garantie ici,
    // c'eût été désarmer un verrou de sécurité au motif que la surface a changé.
    //
    // On l'exerce ici par le geste RÉEL — la bulle « + » du Profil — et non en
    // appelant `restaurerPassion` directement (ce que fait déjà ㉓) : ce que le
    // verrou protège, c'est la PORTE.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    // On archive : 3 vivantes → 2. Une place se libère, la passion reste
    // possédée, rangée dans les archives.
    await page.evaluate(() => archiverPassion(state.user.profiles[2].id));
    await page.waitForTimeout(300);

    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(600);
    await page.locator('#v9ProfilePassions [data-passion-tile="__ajouter__"]').click();
    // Aucune fenêtre payante : on est sous le plafond.
    await expect(page.locator(".psel-input")).toBeVisible({ timeout: 10000 });
    expect(await page.locator("#modalContent").textContent() || "").not.toContain("Trois passions offertes");

    await page.waitForFunction(() => window.PassioPassions && window.PassioPassions.pret(), null, { timeout: 15000 });
    await chercher(page, "sport");
    await page.locator('.psel-item[data-psel-id="sport"]').click();
    await page.locator('[data-psel="valider"]').click();
    await page.waitForTimeout(900);

    const etat = await page.evaluate(() => {
      const tous = (state.user.profiles || []).filter((p) => p.passion === "sport");
      return { entrees: tous.length, vivantes: tous.filter((p) => !p.archived).length };
    });
    // ⚠️ UNE SEULE ENTRÉE : la passion est RESTAURÉE, pas recréée. Un doublon
    // serait dédupliqué plus tard par la fusion défensive d'app-02, en silence,
    // et l'utilisateur perdrait la photo et la bio de l'entrée d'origine.
    expect(etat.entrees, "la passion a été recréée en doublon au lieu d'être restaurée").toBe(1);
    expect(etat.vivantes).toBe(1);
  });

  test("㉔ kill switch : drapeau coupé, aucun plafond", async ({ page }) => {
    // Le plafond vit sous `flat_passions_v1`. Coupé, aucun compte existant ne
    // se voit imposer une limite qu'il n'avait pas hier.
    await page.addInitScript(() => { localStorage.setItem("flat_passions_v1", "0"); });
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const etat = await page.evaluate(() => ({
      restantes: passionsRestantesOffertes(),
      atteint: plafondPassionsAtteint(),
      ajout: !!ajouterPassionAuCompte("voyage", ""),
      vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
    }));
    expect(etat.restantes).toBe(Infinity);
    expect(etat.atteint).toBe(false);
    expect(etat.ajout, "le kill switch n'a pas rendu l'ajout illimité").toBe(true);
    expect(etat.vivantes).toBe(4);
  });

  test("㉕ à deux passions, la recherche s'ouvre et ne laisse en prendre qu'une", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 2);
    await ouvrirRecherche(page);
    await chercher(page, "enduro");
    await page.locator('.psel-item[data-psel-id="moto-enduro"]').click();
    await page.waitForTimeout(200);
    // La deuxième dépasse : la fenêtre prend la place du toast générique.
    await chercher(page, "astrophoto");
    await page.locator('.psel-item[data-psel-id="photo-astrophoto"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator("#modalContent")).toContainText("Trois passions offertes");
  });
});
