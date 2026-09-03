// ══════════════════════════════════════════════════════════════════════════
// « GÉRER MES PASSIONS » — LE PANNEAU DEVIENT LA SEULE PORTE, ET UNE VRAIE
// PAGE DE GESTION  (2026-09-03)
// ──────────────────────────────────────────────────────────────────────────
// Quatre demandes de Benjamin, après essai réel :
//   ① « dans les paramètres du profil : écris GÉRER MES PASSIONS au lieu de
//      mes passions » ;
//   ② « enlève sur la page de profil dans les bulles la bulle +, elle fait
//      tache et en trop » ;
//   ③ « tu mets la possibilité de rajouter des passions dans les paramètres
//      gérer mes passions » ;
//   ④ « réaligne les bulles de passion : l'objectif est 3 bulles de passion
//      principales visibles, ensuite on glisse sur le côté pour voir les
//      autres » ;
//   ⑤ « améliore la page de gérer mes passions, il faut que ça soit simple à
//      utiliser et gérer : je crée des passions, j'en cherche des nouvelles,
//      j'archive, je change de passion archivée = profil ».
//
// ⚠️ ② ET ③ SONT INDISSOCIABLES, ET C'EST TOUT L'ENJEU DE CETTE SUITE. Retirer
// la bulle « + » retirait la seule porte d'ajout VISIBLE : l'autre vivait dans
// un lien de 11 px, dans un panneau `hidden`, derrière le menu « ⋯ ». Un
// retrait qui emporte la commande d'une fonction, c'est le défaut du Studio
// après le retrait d'un carnet (2026-08-29) et celui de `meOpen` (« garder la
// fonction qui ÉCRIT ne suffit pas, il faut garder celle qui OUVRE LA PORTE »).
// Les cas ③ à ⑤ vérifient donc la CHAÎNE ENTIÈRE : le menu nomme le panneau, le
// panneau porte la porte, la porte ouvre la recherche.
//
// ⚠️ ET LA GÉOMÉTRIE SE MESURE EN RECTANGLES. « Trois bulles visibles » est
// invisible à un test d'existence : hors du scrollport d'un conteneur
// `overflow-x: auto`, un nœud reste « visible » pour Playwright et `.click()`
// fait défiler tout seul. Ces mesures-là vivent dans
// `profil-entete-passions.spec.js` (③ nonies), qui portait déjà l'outillage.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// `n` passions vivantes, aux identifiants stables, sans aucune écriture réseau.
async function poser(page, n = 2) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((cible) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};
    window.supaUpsertProfile = async () => {};
    const dispo = ["moto", "podcast", "voyage", "cuisine", "musique"];
    state.user.general = { username: "Benjamin" };
    state.user.profiles = dispo.slice(0, cible).map((pid, i) => ({
      id: "g_" + i, name: "Benjamin", passion: pid, emoji: "✨",
      bio: "", color: "#7c3aed", createdAt: i + 1,
    }));
    state.user.currentProfileId = "g_0";
    state.userPosts = [];
    saveState();
    goTo("profiles");
  }, n);
  await page.waitForTimeout(700);
}

// ══════════════════════════════════════════════════════════════════════════
// ① LE VOCABULAIRE — le menu dit le GESTE, pas le contenu
// ══════════════════════════════════════════════════════════════════════════

test("① le menu ⋯ du profil dit « Gérer mes passions », et ouvre le panneau", async ({ page }) => {
  // ⚠️ « Mes passions » nommait la même chose que le rail de bulles juste
  // au-dessus : deux fonctions différentes — filtrer d'un côté, GÉRER de
  // l'autre — sous le même nom.
  await poser(page, 2);
  // ⚠️ ON CLIQUE LA PORTE QUE L'UTILISATEUR A, PAS CELLE DU MARKUP. Sous le lot
  // UI-6B — actif par défaut — `.profile-dots-btn.on-cover` est en
  // `display: none` (styles.css) et c'est le crayon `#v6bModifier`, posé par
  // `poserModifier()`, qui ouvre `openMainProfileMenu`. Un `.click()`
  // programmatique se déclenche sur un nœud masqué : viser l'ancien bouton
  // aurait rendu ce cas VERT alors même que le crayon aurait cessé d'appeler le
  // menu — le test nommé « le menu ⋯ » n'aurait plus rien mesuré du chemin réel.
  await page.locator("#v6bModifier").click();
  await page.waitForTimeout(400);

  const menu = await page.evaluate(() => {
    const m = document.querySelector(".profile-dots-menu");
    return m ? m.textContent : "";
  });
  expect(menu, "l'entrée du menu doit nommer le geste").toContain("Gérer mes passions");

  // Et le panneau qu'elle ouvre porte le même titre : une porte et sa
  // destination ne peuvent pas s'appeler autrement l'une que l'autre.
  await page.evaluate(() => { document.body.click(); openPassionManager(); });
  await page.waitForTimeout(500);
  const panneau = page.locator("#passionManager");
  await expect(panneau).toBeVisible();
  expect(await page.evaluate(() =>
    document.querySelector("#passionManager > .section-title").textContent))
    .toContain("Gérer mes passions");
});

// ══════════════════════════════════════════════════════════════════════════
// ② LE RAIL REDEVIENT UNE COMMANDE DE LECTURE PURE
// ══════════════════════════════════════════════════════════════════════════

test("② aucune commande d'écriture dans le rail de bulles du profil", async ({ page }) => {
  await poser(page, 3);
  const vu = await page.evaluate(() => {
    const rail = document.getElementById("v9ProfilePassions");
    return {
      tuiles: [...rail.querySelectorAll(".profile-tile")].map((t) => t.getAttribute("data-passion-tile")),
      // La bulle « + », sous ses deux marques historiques.
      porte: rail.querySelectorAll('[data-passion-tile="__ajouter__"], .psel-tile-plus').length,
      // Et AUCUN handler d'ajout, quelle que soit la façon dont on l'écrirait.
      handlers: [...rail.querySelectorAll("[onclick]")]
        .map((t) => t.getAttribute("onclick"))
        .filter((h) => /ajout|Ajout|CreateProfile|RecherchePassions/.test(h)).length,
    };
  });
  expect(vu.tuiles, "le rail ne porte que les passions possédées")
    .toEqual(["g_0", "g_1", "g_2"]);
  expect(vu.porte, "la bulle « + » ne doit pas revenir dans le rail").toBe(0);
  expect(vu.handlers, "un handler d'ajout subsiste dans le rail").toBe(0);
});

// ══════════════════════════════════════════════════════════════════════════
// ③ LA PORTE D'AJOUT A UNE DESTINATION — et elle est dans le panneau
// ══════════════════════════════════════════════════════════════════════════

test("③ le panneau porte le bouton d'ajout, et il ouvre la recherche", async ({ page }) => {
  await poser(page, 2);
  await page.evaluate(() => openPassionManager());
  await page.waitForTimeout(500);

  const porte = page.locator("#passionAddBtn");
  await expect(porte).toBeVisible();
  await expect(porte).toContainText("Ajouter une passion");
  // ⚠️ CIBLE TACTILE, pas un lien de 11 px : c'est le geste le plus fréquent
  // de ce panneau, il ne peut pas être le plus discret.
  const h = await porte.evaluate((el) => el.getBoundingClientRect().height);
  expect(h, "hauteur du bouton d'ajout").toBeGreaterThanOrEqual(44);

  await porte.click();
  await expect(page.locator(".psel-input")).toBeVisible({ timeout: 10000 });
});

test("③ bis — sous le plafond le bouton est PRINCIPAL, au plafond il s'efface et dit pourquoi", async ({ page }) => {
  // Le bouton ne ment jamais sur ce qui va se passer : au plafond, l'action
  // réelle n'est plus « ajouter » mais « archiver », qui est juste en dessous.
  await poser(page, 2);
  await page.evaluate(() => openPassionManager());
  await page.waitForTimeout(500);
  let vu = await page.evaluate(() => ({
    principal: document.getElementById("passionAddBtn").classList.contains("primary"),
    aide: (document.querySelector(".v9-mgr-aide") || {}).textContent || "",
  }));
  expect(vu.principal, "sous le plafond, l'ajout est l'action principale").toBe(true);
  expect(vu.aide).toContain("emplacement");

  await page.evaluate(() => { ajouterPassionAuCompte("voyage", ""); renderProfilesScreen(); });
  await page.waitForTimeout(500);
  vu = await page.evaluate(() => ({
    principal: document.getElementById("passionAddBtn").classList.contains("primary"),
    aide: (document.querySelector(".v9-mgr-aide") || {}).textContent || "",
  }));
  expect(vu.principal, "au plafond, l'ajout n'est plus l'action principale").toBe(false);
  // ⚠️ UNE PORTE FERMÉE DIT PAR OÙ PASSER (invariant du lot archives/quota).
  expect(vu.aide, "l'aide ne nomme pas le geste qui débloque").toContain("Archive");
});

// ══════════════════════════════════════════════════════════════════════════
// ④ ARCHIVER EST UN BOUTON, PLUS UNE ENTRÉE DE MENU
// ══════════════════════════════════════════════════════════════════════════

test("④ chaque carte porte « Modifier » et « Archiver », et l'archivage a bien lieu", async ({ page }) => {
  await poser(page, 3);
  await page.evaluate(() => openPassionManager());
  await page.waitForTimeout(500);

  // Une paire de boutons par passion vivante — pas une seule, pas une de plus.
  expect(await page.locator("#profileList [data-v9-modifier]").count()).toBe(3);
  expect(await page.locator("#profileList [data-v9-archiver]").count()).toBe(3);

  await page.locator('[data-v9-archiver="g_2"]').click();
  await page.waitForTimeout(400);
  // La confirmation d'`archiverPassion` — le même moteur que le menu « ⋯ »,
  // avec ses gardes (quota, dernière passion vivante).
  await expect(page.locator("#modalContent")).toContainText("Archiver cette passion");
  await page.locator('[data-v8-archiver="g_2"]').click();
  await page.waitForTimeout(600);

  const etat = await page.evaluate(() => ({
    vivantes: (state.user.profiles || []).filter((p) => !p.archived).map((p) => p.id),
    archivee: !!(state.user.profiles || []).find((p) => p.id === "g_2" && p.archived),
    // ⚠️ RIEN N'EST SUPPRIMÉ : l'entrée reste, elle change seulement de côté.
    entrees: (state.user.profiles || []).length,
    dansLeRail: [...document.querySelectorAll("#v9ProfilePassions .profile-tile")]
      .map((t) => t.getAttribute("data-passion-tile")),
    dansLesArchives: [...document.querySelectorAll("#passionArchiveBox [data-v8-archived]")]
      .map((t) => t.getAttribute("data-v8-archived")),
  }));
  expect(etat.archivee).toBe(true);
  expect(etat.vivantes).toEqual(["g_0", "g_1"]);
  expect(etat.entrees, "l'archivage a supprimé une entrée").toBe(3);
  expect(etat.dansLeRail, "la passion archivée reste dans le rail").toEqual(["g_0", "g_1"]);
  expect(etat.dansLesArchives, "elle n'est pas arrivée dans la liste des archives").toContain("g_2");
});

test("④ bis — la DERNIÈRE passion vivante ne s'archive pas, et le bouton le dit AVANT le geste", async ({ page }) => {
  // ⚠️ `confirmArchivePassion` refuse déjà par un toast. Mais un bouton qui
  // échoue toujours est un bouton qui ment : il annonce son refus.
  await poser(page, 1);
  await page.evaluate(() => openPassionManager());
  await page.waitForTimeout(500);
  const b = page.locator('[data-v9-archiver="g_0"]');
  await expect(b).toBeDisabled();
  await expect(b).toHaveAttribute("title", /au moins une passion active/);
});

// ⚠️ LA PASTILLE D'ÉTAT A UNE GÉOMÉTRIE, ET ELLE N'AVAIT AUCUNE MESURE.
// « Passion du Studio ✓ » est passée d'une barre pleine largeur à une pastille
// compacte : elle a donc cessé d'occuper sa ligne PAR CONSTRUCTION et s'est mise
// à concourir sur la première ligne de la carte, à droite du « ⋯ ». Son passage
// à la ligne ne dépendait plus que de la largeur restante après le nom et la
// bio — vrai à 390 px, faux sur une coquille large (`.app-shell` monte à
// 540 px), et là le « ⋯ » quittait le bord droit. Les deux seules assertions
// existantes sur cette pastille sont TEXTUELLES (`ui-v8-passions`) : elles
// seraient restées vertes. On mesure donc aux deux bornes de la coquille.
for (const largeur of [390, 540]) {
  test("④ ter — " + largeur + " px : la pastille garde sa ligne, le « ⋯ » garde son coin", async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 844 });
    await poser(page, 2);
    await page.evaluate(() => openPassionManager());
    await page.waitForTimeout(600);
    const vu = await page.evaluate(() => {
      const carte = document.querySelector('[data-v8-card="g_0"]');
      const r = (sel) => {
        const e = carte.querySelector(sel);
        return e ? e.getBoundingClientRect() : null;
      };
      const c = carte.getBoundingClientRect();
      const pastille = r("[data-v8-active]");
      const dots = r(".profile-dots-btn");
      const actions = r(".v9-card-actions");
      return {
        // La pastille commence SOUS le bouton d'options : elle est bien passée
        // à la ligne, elle ne s'est pas glissée à côté de lui.
        souslesDots: Math.round(pastille.top - dots.bottom),
        // Et le « ⋯ » reste dans le coin de la carte.
        margeDroite: Math.round(c.right - dots.right),
        // Les actions, elles, restent sous la pastille.
        actionsSousPastille: Math.round(actions.top - pastille.bottom),
      };
    });
    expect(vu.souslesDots, "la pastille s'est glissée à côté du « ⋯ »").toBeGreaterThanOrEqual(0);
    expect(vu.margeDroite, "le « ⋯ » a quitté le coin de la carte").toBeLessThanOrEqual(16);
    expect(vu.actionsSousPastille, "les boutons ne sont plus sous la pastille").toBeGreaterThanOrEqual(0);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ⑤ REPRENDRE UNE PASSION ARCHIVÉE — « je change de passion archivée »
// ══════════════════════════════════════════════════════════════════════════

test("⑤ depuis les archives du panneau, une passion revient et le rail la reprend", async ({ page }) => {
  await poser(page, 3);
  await page.evaluate(() => { openPassionManager(); archiverPassion("g_2"); });
  await page.waitForTimeout(500);

  // Sous le plafond, le bouton annonce « Restaurer » : il dit ce qu'il fera.
  const bouton = page.locator('[data-v8-restaurer="g_2"]');
  await expect(bouton).toBeVisible();
  await expect(bouton).toHaveText("Restaurer");
  await bouton.click();
  await page.waitForTimeout(700);

  const etat = await page.evaluate(() => ({
    vivante: !!(state.user.profiles || []).find((p) => p.id === "g_2" && !p.archived),
    dansLeRail: [...document.querySelectorAll("#v9ProfilePassions .profile-tile")]
      .map((t) => t.getAttribute("data-passion-tile")),
    payante: ((document.getElementById("modalContent") || {}).textContent || "")
      .includes("Trois passions offertes"),
  }));
  expect(etat.vivante, "la passion archivée n'est pas revenue").toBe(true);
  expect(etat.dansLeRail, "elle n'est pas revenue dans le rail du profil").toContain("g_2");
  expect(etat.payante, "reprendre une passion possédée a réclamé un paiement").toBe(false);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑥ LA PAGE SE LIT — un seul titre de niveau 1, une seule hiérarchie
// ══════════════════════════════════════════════════════════════════════════

test("⑥ le panneau a UN titre d'écran, et ses blocs sont au niveau en dessous", async ({ page }) => {
  // ⚠️ Sous UI-V2, `.section-title` vaut 26 px : c'est le « titre d'un écran ».
  // Le panneau en portait TROIS à cette taille — il se lisait comme trois
  // écrans empilés, sans plus aucune hiérarchie.
  await poser(page, 3);
  await page.evaluate(() => { openPassionManager(); archiverPassion("g_2"); });
  await page.waitForTimeout(600);

  const t = await page.evaluate(() => {
    const px = (el) => (el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : 0);
    return {
      entete: px(document.querySelector("#passionManager > .section-title")),
      actives: px(document.querySelector(".v9-mgr-titre")),
      archives: px(document.querySelector("#passionArchiveBox .section-title")),
      // L'en-tête tient sans qu'aucun de ses mots ne se coupe : deux liens
      // portant chacun `margin-left: auto` lui prenaient sa place.
      lignesEntete: (function () {
        const e = document.querySelector("#passionManager > .section-title");
        const h = e.getBoundingClientRect().height;
        const l = parseFloat(getComputedStyle(e).lineHeight) || px(e) * 1.15;
        return Math.round(h / l);
      })(),
    };
  });
  expect(t.entete, "l'en-tête reste le titre du panneau").toBeGreaterThan(t.actives);
  expect(t.actives, "« Mes passions actives » est un titre de bloc").toBe(t.archives);
  expect(t.lignesEntete, "le titre du panneau se coupe en plusieurs lignes")
    .toBeLessThanOrEqual(2);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑦ KILL SWITCH — le lot UI-8 coupé, la barre s'en va avec lui
// ══════════════════════════════════════════════════════════════════════════

test("⑦ kill switch UI-8 : la barre d'actions est RETIRÉE, pas laissée derrière", async ({ page }) => {
  // ⚠️ CE CAS A DÛ ÊTRE RÉÉCRIT : POSER LE DRAPEAU AVANT LE BOOT NE PROUVAIT
  // RIEN. `index.html` livre `<div id="passionManagerActions" hidden></div>` :
  // vide et masqué, c'est l'état INITIAL du markup. Un test qui coupe le lot
  // avant le premier rendu mesurait donc le DOM de départ — vider entièrement
  // le corps de `renderPassionManagerActions` l'aurait laissé vert.
  //
  // Ce que le lot doit garantir est un RETRAIT : la barre est d'abord POSÉE,
  // lot actif, puis le drapeau tombe et un nouveau rendu doit la reprendre.
  // « Une cible supprimée emporte tout ce qui la vise » ne se vérifie qu'après
  // avoir vu la cible exister.
  await poser(page, 2);
  await page.evaluate(() => openPassionManager());
  await page.waitForTimeout(600);
  const avant = await page.evaluate(() => ({
    barre: (document.getElementById("passionManagerActions") || {}).innerHTML || "",
    cache: !!(document.getElementById("passionManagerActions") || {}).hidden,
    actions: document.querySelectorAll("#profileList [data-v9-archiver]").length,
  }));
  expect(avant.barre, "le lot actif n'a rien posé — le test ne prouverait rien").toContain("passionAddBtn");
  expect(avant.cache).toBe(false);
  expect(avant.actions, "le lot actif n'a posé aucun bouton de carte").toBe(2);

  await page.evaluate(() => {
    localStorage.setItem("passio_ui_8", "0");
    renderProfilesScreen();
  });
  await page.waitForTimeout(500);
  const apres = await page.evaluate(() => ({
    barre: (document.getElementById("passionManagerActions") || {}).innerHTML || "",
    cache: !!(document.getElementById("passionManagerActions") || {}).hidden,
    actions: document.querySelectorAll("#profileList [data-v9-archiver]").length,
  }));
  expect(apres.barre, "la barre d'actions survit au kill switch").toBe("");
  expect(apres.cache).toBe(true);
  expect(apres.actions, "les boutons de carte survivent au kill switch").toBe(0);
});
