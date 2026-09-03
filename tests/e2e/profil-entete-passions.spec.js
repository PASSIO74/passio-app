// EN-TÊTE DE PROFIL — la photo jusqu'au pseudo, un avatar plus grand, et des
// passions qui sont des PORTES (2026-09-01).
//
// Trois demandes de Benjamin, après essai réel sur son appareil :
//   ① « la photo de fond devrait prendre plus de place, elle devrait aller
//      jusqu'à juste au-dessus du nom de profil » ;
//   ② « la photo de profil plus grande » ;
//   ③ « je voudrais que les passions soient cliquables et que ça renvoie vers la
//      page de cette passion, pour que les utilisateurs puissent aller découvrir
//      les passions directement ».
//
// ⚠️ LE POINT ③ A ÉTÉ DÉFAIT LE LENDEMAIN, ET LA SECTION QUI LE COUVRAIT A ÉTÉ
// RETOURNÉE PLUTÔT QUE SUPPRIMÉE. Le 2026-09-02, Benjamin fait retirer cette
// rangée : « supprime les titres de passion dans le profil sous le pseudo et
// garde seulement les bulles dessous. » Les tests vérifient désormais que la
// ligne NE REVIENT PAS, et ce que ③ avait acquis (cible tactile, aucune fuite de
// passion archivée) est mesuré sur le rail, où les passions vivent.
//
// ⚠️ ET LES BULLES DU RAIL, ELLES, N'ONT PAS CHANGÉ. Elles sont passées par des
// pastilles de texte pendant quelques heures ce même jour, sur une lecture trop
// littérale de « enlève les onglets ronds violets » — qui visait la ligne de
// titres, pas le rail. « Sur le profil remets les bulles rondes comme avant, pas
// de rangée de passions ovale » : c'est ce que ③ mesure explicitement
// (`.profile-tile-avatar` présent), pour qu'un troisième tour n'ait pas lieu.
//
// ⚠️ ① ET ② SONT LIÉS, ET C'EST LE CŒUR DE LA SUITE. Ce qui rend la place à la
// photo n'est pas un plafond plus haut — c'est l'avatar, qui passe ENTIÈREMENT
// sur la couverture au lieu d'y déborder de moitié. Les trois nombres du CSS
// (taille de l'avatar, `margin-top` négatif, `margin-bottom`) tiennent ensemble :
// changer l'un sans les autres fait déborder l'avatar dans le corps blanc, ou le
// fait flotter au milieu de la photo. Les tests mesurent donc la RELATION
// (avatar dans la couverture, pseudo au ras du bord bas), jamais une constante
// isolée qui gèlerait le design.
//
// ⚠️ Ces tests mesurent des RECTANGLES : ils sont écrits en viewport fixe et
// tolérants de quelques pixels. Ce qu'ils verrouillent, ce sont des invariants
// (« dedans », « juste en dessous »), pas une maquette au pixel.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Benjamin, trois passions. Aucune écriture réseau.
async function poser(page, opts = {}) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((o) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};
    window.supaUpsertProfile = async () => {};

    state.user.general = { username: "Benjamin", bio: "Passionné de tout" };
    state.user.name = "Benjamin";
    state.user.profiles = (o.profiles || [
      { id: "pp_moto", name: "Benjamin", passion: "moto", emoji: "🏍", color: "#7c3aed", createdAt: 1 },
      { id: "pp_pod", name: "Benjamin", passion: "podcast", emoji: "🎙", color: "#7c3aed", createdAt: 2 },
      { id: "pp_voy", name: "Benjamin", passion: "voyage", emoji: "✈️", color: "#7c3aed", createdAt: 3 },
    ]);
    state.user.currentProfileId = state.user.profiles[0].id;
    state.userPosts = [];
    saveState();
    goTo("profiles");
  }, opts);
  await page.waitForTimeout(700);
}

function mesures(page) {
  return page.evaluate(() => {
    const r = (sel) => {
      const e = document.querySelector(sel);
      return e ? e.getBoundingClientRect() : null;
    };
    const c = r(".main-profile-cover");
    const a = r(".main-profile-avatar");
    const u = r(".main-profile-username");
    return {
      cover: { top: c.top, bottom: c.bottom, height: c.height },
      avatar: { top: a.top, bottom: a.bottom, width: a.width, height: a.height },
      usernameTop: u.top,
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ① LA COUVERTURE DESCEND JUSQU'AU PSEUDO
// ══════════════════════════════════════════════════════════════════════════

test("① la couverture s'arrête juste AU-DESSUS du pseudo", async ({ page }) => {
  await poser(page);
  const m = await mesures(page);
  // « Juste au-dessus » : le pseudo commence sous le bord bas de la photo, et
  // l'écart se compte en pixels, pas en dizaines. Avant ce lot il valait 45 px
  // — la moitié de l'avatar — plus la marge du bloc.
  const ecart = m.usernameTop - m.cover.bottom;
  expect(ecart, "le pseudo est SOUS la photo").toBeGreaterThanOrEqual(0);
  expect(ecart, "et juste en dessous, pas à distance").toBeLessThanOrEqual(12);
});

test("① bis — l'avatar tient ENTIÈREMENT sur la couverture", async ({ page }) => {
  await poser(page);
  const m = await mesures(page);
  // C'est CE déplacement qui rend la place à la photo : l'avatar ne déborde
  // plus dans le corps blanc, donc la photo occupe toute la hauteur jusqu'au
  // pseudo. Un `margin-top` mal accordé à la taille de l'avatar casse ici.
  expect(m.avatar.top, "bord haut de l'avatar sous le bord haut de la photo")
    .toBeGreaterThanOrEqual(m.cover.top);
  expect(m.avatar.bottom, "bord bas de l'avatar au-dessus du bord bas de la photo")
    .toBeLessThanOrEqual(m.cover.bottom);
  // Et il respire : collé au bord, il se lirait comme un débordement raté.
  expect(m.cover.bottom - m.avatar.bottom, "garde sous l'avatar")
    .toBeGreaterThanOrEqual(6);
});

test("② la photo de profil est nettement plus grande qu'avant (90 px)", async ({ page }) => {
  await poser(page);
  const m = await mesures(page);
  expect(m.avatar.width, "largeur de l'avatar").toBeGreaterThan(100);
  expect(Math.round(m.avatar.width), "avatar carré")
    .toBe(Math.round(m.avatar.height));
});

test("① ter — la carte d'identité reste sous les deux tiers de l'écran", async ({ page }) => {
  await poser(page);
  // ⚠️ CONTRE-MESURE, et elle a une histoire : le 2026-08-31 Benjamin avait
  // demandé l'INVERSE (« le grand carré avec photo prend trop de place »). Les
  // deux demandes ne se contredisent pas — l'une visait la carte entière,
  // l'autre la seule photo — mais rien ne garantit tout seul que la carte ne
  // regonfle pas. Ce test est le garde-fou de la demande précédente.
  const part = await page.evaluate(() => {
    const carte = document.querySelector(".main-profile-card").getBoundingClientRect().height;
    const zone = document.querySelector(".app-main").getBoundingClientRect().height;
    return carte / zone;
  });
  expect(part).toBeLessThan(0.66);
});

// ══════════════════════════════════════════════════════════════════════════
// ③ LES PASSIONS SONT DES PORTES
// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// ③ LES PASSIONS DU PROFIL — UNE SEULE RANGÉE, LES BULLES
// ──────────────────────────────────────────────────────────────────────────
// ⚠️ ASSERTIONS RETOURNÉES LE 2026-09-02, JAMAIS VIDÉES — et il a fallu deux
// tours pour comprendre ce que Benjamin demandait, ce que ces tests fixent
// maintenant pour de bon.
//
// Le lot du 2026-09-01 avait posé sous le pseudo une rangée de pastilles-portes,
// chacune ouvrant la page de sa passion. Le lendemain matin : « enlève les
// onglets ronds violets sous le pseudo des passions, c'est trop gros trop
// visible ; tu mets juste les passions en question, fin élégant. » Lu comme une
// consigne sur les BULLES du rail, il en est sorti une rangée de pastilles de
// texte — et un profil qui nommait ses passions deux fois. Le soir, l'arbitrage :
// « supprime les titres de passion dans le profil sous le pseudo et garde
// seulement les bulles dessous », puis « remets les bulles rondes comme avant,
// pas de rangée de passions ovale ».
//
// État final, celui que cette section verrouille : AUCUNE ligne de passions sous
// le pseudo, les BULLES du rail inchangées, sur mon profil comme sur celui d'un
// autre. Les acquis du lot d'hier (cible tactile, aucune fuite de passion
// archivée) sont vérifiés là où les passions vivent désormais.
// ══════════════════════════════════════════════════════════════════════════

test("③ aucune ligne de passions sous le pseudo — les bulles du rail les portent", async ({ page }) => {
  await poser(page);
  const vu = await page.evaluate(() => {
    const carte = document.querySelector("#screen-profiles .main-profile-card");
    const rail = document.getElementById("v9ProfilePassions");
    return {
      ligneIdent: !!document.getElementById("mainProfileIdent"),
      dansLaCarte: carte ? carte.querySelectorAll(".ident-passions, .ident-passion-lien").length : -1,
      // ⚠️ Les BULLES, pas des pastilles de texte : la vignette ronde est ce que
      // Benjamin a explicitement redemandé. Une rangée « ovale » (un
      // `.v9-passion-chip`, sans `.profile-tile-avatar`) ferait rougir ce test.
      bulles: rail
        ? [...rail.querySelectorAll(".profile-tile[data-passion-tile]")]
            .map((c) => c.getAttribute("data-passion-tile"))
        : [],
      vignettes: rail ? rail.querySelectorAll(".profile-tile .profile-tile-avatar").length : 0,
    };
  });
  expect(vu.ligneIdent, "la ligne sous le pseudo ne doit pas revenir").toBe(false);
  expect(vu.dansLaCarte, "aucune passion nommée dans la carte d'identité").toBe(0);
  // ⚠️ LA PORTE D'AJOUT A QUITTÉ CE RAIL LE 2026-09-03 (demande de Benjamin :
  // « enlever la bulle + sur le profil passion et la mettre dans Gérer mes
  // passions »). Elle était en tête depuis le 2026-09-02 ; elle vit désormais
  // dans `#passionManager`. Ce rail ne contient plus QUE des passions possédées
  // — une commande de lecture, comme celui du Fil.
  expect(vu.bulles).toEqual(["pp_moto", "pp_pod", "pp_voy"]);
  expect(vu.vignettes, "des bulles rondes, pas une rangée ovale").toBe(3);
});

// ⚠️ LE VERROU DU DÉMÉNAGEMENT, DANS LES DEUX SENS. Vérifier seulement l'absence
// laisserait passer le pire des deux résultats : une porte retirée du rail et
// jamais reposée ailleurs. C'est exactement ce qui est arrivé à la gestion des
// passions quand l'onglet « À propos » a disparu. On exige donc les deux moitiés
// dans le même cas.
test("③ bis bis — la porte d'ajout a quitté le rail pour « Gérer mes passions »", async ({ page }) => {
  await poser(page);
  const avant = await page.evaluate(() => ({
    dansLeRail: document.querySelectorAll('#v9ProfilePassions [data-passion-tile="__ajouter__"]').length,
    dansLeFil: document.querySelectorAll('#profileStrip [data-passion-tile="__ajouter__"]').length,
    // Elle EXISTE dans le panneau, mais celui-ci est replié : invisible tant
    // qu'on ne l'ouvre pas, ce qui est le comportement voulu.
    dansLePanneau: document.querySelectorAll('#passionManager [data-passion-tile="__ajouter__"]').length,
    panneauReplie: !!document.getElementById("passionManager").hidden,
  }));
  expect(avant.dansLeRail, "plus aucune bulle « + » dans le rail du profil").toBe(0);
  expect(avant.dansLeFil, "ni dans le Fil, qui ne l'a jamais reprise").toBe(0);
  expect(avant.dansLePanneau, "mais elle existe dans le panneau de gestion").toBe(1);
  expect(avant.panneauReplie).toBe(true);

  // Et la porte du menu ⋯ l'amène bien à l'écran, sous son nouveau nom.
  await page.evaluate(() => { openPassionManager(); });
  await page.waitForTimeout(400);
  const apres = await page.evaluate(() => {
    const b = document.querySelector('#passionManager [data-passion-tile="__ajouter__"]');
    const r = b.getBoundingClientRect();
    return {
      visible: r.width > 0 && r.height > 0,
      titre: (document.getElementById("passionManagerTitre").textContent || "").trim(),
      offertes: (typeof PASSIONS_OFFERTES === "number") ? PASSIONS_OFFERTES : -1,
      desarmee: !b.hasAttribute("role") && !b.hasAttribute("tabindex")
                && b.getAttribute("aria-disabled") === "true",
      // C'est la MÊME porte : l'id que vise l'aide contextuelle est conservé.
      memeId: b.id,
      onclick: b.getAttribute("onclick"),
      invite: (function () {
        const m = document.querySelector("#passionManager .passion-manager-porte-mot");
        return m ? (m.textContent || "").trim() : "";
      })(),
      inviteCliquable: !!document.querySelector(
        "#passionManager .passion-manager-porte-mot[onclick]"),
    };
  });
  expect(apres.visible, "la porte est réellement peinte une fois la page ouverte").toBe(true);
  expect(apres.titre, "la page dit où l'on est").toBe("Mes passions");
  // ⚠️ LA LIGNE D'INVITE EST UN VERROU, PAS UNE DÉCORATION. Dans le rail, la
  // bulle se lisait par contraste avec les passions qui l'entouraient ; seule
  // dans le panneau, « Ajouter » n'annonce plus QUOI. Cette ligne porte donc,
  // selon l'état, l'invitation ou LE MOTIF DU REFUS. Ici le socle pose trois
  // passions, donc le plafond : elle doit dire pourquoi, avec le nombre lu dans
  // `PASSIONS_OFFERTES` et jamais écrit en dur.
  expect(apres.invite, "au plafond, la porte dit pourquoi elle refuse")
    .toBe("Limite de " + apres.offertes + " atteinte");
  expect(apres.inviteCliquable, "une seule cible pour un seul geste").toBe(false);
  expect(apres.memeId, "l'ancre de l'aide « second_profil » survit").toBe("nouveauProfilLien");
  expect(apres.onclick, "et elle passe par la porte qui garde le plafond").toContain("openCreateProfile");
  // ⚠️ AU PLAFOND ELLE EST DÉSARMÉE, PAS SEULEMENT GRISÉE : sans `role` ni
  // `tabindex`, l'écouteur délégué d'app-08 (Entrée/Espace sur tout
  // `[role=button]` non natif) n'a plus de prise. Une cible grisée qui répond
  // encore promet un refus et fait quand même le geste.
  expect(apres.desarmee, "la porte refusée reste activable au clavier").toBe(true);
});

// L'AUTRE MOITIÉ DU MÊME VERROU : sous le plafond, la porte INVITE et elle est
// armée. Sans ce cas, un rendu qui refuserait TOUJOURS resterait vert.
test("③ bis bis bis — sous le plafond, la porte d'ajout invite et reste armée", async ({ page }) => {
  await poser(page, {
    profiles: [
      { id: "pp_moto", name: "Benjamin", passion: "moto", emoji: "🏍", color: "#7c3aed", createdAt: 1 },
      { id: "pp_pod", name: "Benjamin", passion: "podcast", emoji: "🎙", color: "#7c3aed", createdAt: 2 },
    ],
  });
  await page.evaluate(() => { openPassionManager(); });
  await page.waitForTimeout(400);
  const vu = await page.evaluate(() => {
    const b = document.getElementById("nouveauProfilLien");
    const m = document.getElementById("nouveauProfilSous");
    return {
      invite: (m.textContent || "").trim(),
      role: b.getAttribute("role"),
      tabindex: b.getAttribute("tabindex"),
      desactivee: b.getAttribute("aria-disabled"),
      etat: b.getAttribute("data-passion-porte"),
    };
  });
  expect(vu.invite, "la porte dit ce qu'elle ajoute").toContain("passion");
  expect(vu.role).toBe("button");
  expect(vu.tabindex).toBe("0");
  expect(vu.desactivee, "une porte ouverte ne se déclare pas désactivée").toBeNull();
  expect(vu.etat).toBe("ouverte");
});

// ⚠️ LE CÂBLAGE, PAS LA FONCTION. `③ bis bis` ouvre le panneau par
// `page.evaluate(() => openPassionManager())` — comme les onze autres cas du
// dépôt qui touchent ce panneau. Aucun d'eux ne clique la porte qui y mène :
// supprimez l'entrée « 🗂️ Gérer mes passions » du menu ⋯ (app-06,
// `openMainProfileMenu`) — la SEULE porte vers la seule porte d'ajout — et la
// suite complète reste VERTE. C'est mot pour mot la leçon d'`adopterCompteConnecte`
// inscrite dans CLAUDE.md : « tester la fonction ne suffit pas ; le câblage, non
// couvert, pouvait être supprimé sans un seul rouge ».
//
// Ce cas-ci ne fait donc que des GESTES, du profil jusqu'à la bulle.
test("③ bis ter — la chaîne complète : crayon → « Gérer mes passions » → la bulle", async ({ page }) => {
  // ⚠️ DEUX passions, pas trois. `PASSIONS_OFFERTES = 3` : au plafond, la bulle
  // ouvre la fenêtre payante et non la recherche — c'est le comportement voulu
  // (cas suivant), mais il ne prouverait pas que le chemin d'AJOUT s'ouvre.
  await poser(page, {
    profiles: [
      { id: "pp_moto", name: "Benjamin", passion: "moto", emoji: "🏍", color: "#7c3aed", createdAt: 1 },
      { id: "pp_pod", name: "Benjamin", passion: "podcast", emoji: "🎙", color: "#7c3aed", createdAt: 2 },
    ],
  });
  // UI-6B est actif par défaut : le « ⋯ » de la couverture est masqué et
  // remplacé par le crayon. Les deux ouvrent le MÊME menu.
  await page.locator("#v6bModifier").click();
  await page.waitForTimeout(400);
  const menu = page.locator("#profileDotsMenu .profile-dots-item", { hasText: "Gérer mes passions" });
  await expect(menu, "l'entrée du menu nomme la gestion des passions").toHaveCount(1);
  await menu.click();
  await page.waitForTimeout(600);
  const vu = await page.evaluate(() => {
    const porte = document.getElementById("nouveauProfilLien");
    const r = porte ? porte.getBoundingClientRect() : null;
    return {
      panneauOuvert: !document.getElementById("passionManager").hidden,
      portePeinte: !!(r && r.width > 0 && r.height > 0),
    };
  });
  expect(vu.panneauOuvert, "le tap déplie le panneau").toBe(true);
  expect(vu.portePeinte, "et la bulle « + » est réellement à l'écran").toBe(true);

  // Le geste suivant : la bulle ouvre bien la porte d'ajout.
  await page.locator("#nouveauProfilLien").click();
  await page.waitForTimeout(800);
  const ouvert = await page.evaluate(() => ({
    recherche: document.querySelectorAll(".psel-input").length,
    grille: document.querySelectorAll("#newProfileGrid").length,
  }));
  expect(ouvert.recherche + ouvert.grille,
    "un des deux chemins d'ajout s'est ouvert — jamais un tap mort").toBeGreaterThan(0);
});

// ⚠️ « MUR → PANNEAU → MUR », LA BOUCLE QUE LE DÉMÉNAGEMENT A ROUVERTE.
// L'invariant existait pour le quota épuisé : une fenêtre qui ne mène nulle part
// ne doit pas offrir « Gérer mes passions ». Tant que la porte d'ajout vivait
// dans le RAIL, ce bouton déplaçait vraiment. Depuis qu'elle est DANS le
// panneau, le chemin le plus fréquent au plafond est « je suis dans le panneau,
// je tape la bulle, le mur s'ouvre » — et le bouton m'y renvoyait, devant la
// même bulle qui vient de refuser. Un clic mort sur le seul chemin qui compte.
test("③ bis quinquies — au plafond, la fenêtre ne renvoie pas au panneau d'où l'on vient", async ({ page }) => {
  await poser(page);                       // trois passions = le plafond
  await page.evaluate(() => { openPassionManager(); });
  await page.waitForTimeout(500);

  // ⚠️ LA PORTE NE S'OUVRE PLUS DU TOUT AU PLAFOND (2026-09-03). Ce cas la
  // CLIQUAIT pour faire apparaître le mur ; la page désarme désormais la porte
  // et écrit le motif dedans (« Limite de N atteinte »), donc le clic ne part
  // plus. On vérifie d'abord ce désarmement — c'est ce que l'utilisateur voit —
  // puis on ouvre la fenêtre par le chemin qui reste (`restaurerPassion` au
  // plafond y mène) pour mesurer l'invariant de boucle, qui n'a pas changé.
  const porte = await page.evaluate(() => {
    const b = document.getElementById("nouveauProfilLien");
    return {
      desactivee: b.getAttribute("aria-disabled"),
      pointeur: getComputedStyle(b).pointerEvents,
      motif: (document.getElementById("nouveauProfilSous").textContent || "").trim(),
      modaleOuverte: !!document.querySelector("#modalBackdrop.active"),
    };
  });
  expect(porte.desactivee, "au plafond la porte se déclare désactivée").toBe("true");
  expect(porte.pointeur, "et le pointeur ne l'atteint plus").toBe("none");
  expect(porte.motif, "elle dit pourquoi").toContain("Limite de");
  expect(porte.modaleOuverte, "aucune fenêtre ne s'ouvre toute seule").toBe(false);

  await page.evaluate(() => openPassionPaywall());
  await page.waitForTimeout(500);
  const vu = await page.evaluate(() => {
    const m = document.getElementById("modalContent");
    return {
      murOuvert: !!(m && (m.textContent || "").includes("Trois passions offertes")),
      renvoiPanneau: !!(m && m.querySelector('[data-tel="passion_paywall_gerer"]')),
      // La sortie restante prend le style primaire : une fenêtre à une seule
      // issue ne laisse pas deviner laquelle.
      sortie: !!(m && m.querySelector('[data-tel="passion_paywall_compris"].primary')),
    };
  });
  expect(vu.murOuvert, "au plafond la fenêtre annonce l'offre").toBe(true);
  expect(vu.renvoiPanneau, "et ne propose pas de retourner là où l'on est déjà").toBe(false);
  expect(vu.sortie, "la seule sortie est mise en avant").toBe(true);

  // ⚠️ ET LE BOUTON REVIENT QUAND IL SERT VRAIMENT : depuis le Fil, panneau
  // replié, il déplace réellement. Le retirer partout aurait fermé une porte
  // utile en corrigeant celle qui bouclait.
  await page.evaluate(() => { closeModal(); closePassionManager(); goTo("feed"); });
  await page.waitForTimeout(400);
  await page.evaluate(() => openPassionPaywall());
  await page.waitForTimeout(500);
  const depuisLeFil = await page.evaluate(() =>
    !!document.querySelector('#modalContent [data-tel="passion_paywall_gerer"]'));
  expect(depuisLeFil, "hors du panneau, la fenêtre garde sa porte vers la gestion").toBe(true);
});

// ⚠️ CONTRAT DE FRATRIE. `renderProfilesScreen` réécrit `#profileList.innerHTML`
// EN ENTIER (deux branches), plus `#profilesQuotaSub` et `#passionArchiveBox`.
// La porte d'ajout est posée en SŒUR de `#profileList` pour y survivre — mais
// rien ne le prouvait. Deux rendus successifs suffisent à attraper une future
// version qui la rendrait depuis cette fonction.
test("③ bis quater — la porte survit à deux rendus du panneau", async ({ page }) => {
  await poser(page);
  const vu = await page.evaluate(() => {
    openPassionManager();
    renderProfilesScreen();
    renderProfilesScreen();
    const porte = document.getElementById("nouveauProfilLien");
    const r = porte ? porte.getBoundingClientRect() : null;
    return {
      combien: document.querySelectorAll('#passionManager [data-passion-tile="__ajouter__"]').length,
      peinte: !!(r && r.width > 0 && r.height > 0),
      // Ses enfants sont intacts : un `textContent =` posé par un futur
      // décorateur les remplacerait par un mot nu, porte toujours cliquable.
      rond: !!(porte && porte.querySelector(".passion-manager-porte-plus")),
      libelle: porte ? (porte.querySelector(".passion-manager-porte-titre") || {}).textContent : null,
      // La ligne d'état est réécrite à chaque rendu : elle doit être là après
      // deux, pas seulement après le premier.
      etat: porte ? porte.getAttribute("data-passion-porte") : null,
    };
  });
  expect(vu.combien, "une seule porte, jamais dupliquée par un rendu").toBe(1);
  expect(vu.peinte).toBe(true);
  expect(vu.rond, "le rond pointillé est toujours là").toBe(true);
  expect(vu.libelle).toBe("Ajouter une passion");
  expect(vu.etat, "trois passions : la porte est au plafond").toBe("fermee");
});

test("③ bis — toucher une bulle FILTRE, elle ne quitte plus le profil", async ({ page }) => {
  // ⚠️ RETOURNEMENT ASSUMÉ. Ce test exigeait qu'un tap sous le pseudo OUVRE la
  // page de la passion ; cette rangée n'existe plus. La seule qui reste est le
  // rail, dont le geste est le filtre — et une bulle ne peut pas avoir deux
  // destinations.
  await poser(page);
  await page.evaluate(() => {
    window.__ouvert = [];
    const vrai = window.openPassionExplorer;
    window.openPassionExplorer = function () { window.__ouvert.push([...arguments]); return vrai.apply(this, arguments); };
  });
  await page.click('#v9ProfilePassions [data-passion-tile="pp_pod"]');
  await page.waitForTimeout(500);
  const vu = await page.evaluate(() => ({
    appels: window.__ouvert,
    filtre: state.user.profilePassionIds,
    modaleOuverte: !!document.querySelector("#modalBackdrop.active"),
  }));
  expect(vu.filtre, "le tap coche la passion").toEqual(["pp_pod"]);
  expect(vu.appels, "et n'ouvre aucune page de passion").toEqual([]);
  expect(vu.modaleOuverte, "on reste sur le profil").toBe(false);
});

// ⚠️ DES IDENTIFIANTS QUI EXISTENT VRAIMENT AU CATALOGUE (`PASSIONS`, app-01).
// « lecture » et « peinture » n'y sont pas : `passionById` retombe alors sur
// `{ emoji: "✨", label: "Passion" }`, et la mesure portait sur deux bulles
// homonymes au lieu des passions annoncées — un fixture qui ne dit pas ce qu'il
// croit dire.
const DIX_REELLES = ["moto", "podcast", "voyage", "cuisine", "musique",
                     "sport", "photo", "litterature", "jardinage", "danse"];

// Géométrie du rail de passions — partagée par les trois mesures ci-dessous.
// Évaluée DANS la page (elle est sérialisée par `page.evaluate`).
function mesurerRail() {
  const rail = document.getElementById("v9ProfilePassions");
  const tuiles = [...rail.querySelectorAll(".profile-tile")];
  const rects = tuiles.map((c) => c.getBoundingClientRect());
  let chevauche = false;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) chevauche = true;
    }
  }
  const railRect = rail.getBoundingClientRect();
  // ⚠️ `plus` / `plusDansLeChamp` ONT ÉTÉ RETIRÉS ICI (2026-09-03) avec la bulle
  // « + » qu'ils mesuraient. Les garder aurait rendu `null` sans échouer : une
  // sonde qui survit à la disparition de sa cible ne mesure plus rien et le dit
  // en vert. La mesure de visibilité réelle de la porte n'est pas perdue pour
  // autant — elle est reprise par `③ nonies`, sur le panneau de gestion.
  return {
    chevauche,
    // ⚠️ `offsetTop`, PAS `getBoundingClientRect().top` : une bulle cochée porte
    // `transform: translateY(-2px)`, que le rectangle inclut. Sur une sélection
    // MIXTE (des cochées et des non cochées) on compterait deux « lignes » là où
    // il n'y en a qu'une. Les suites actuelles ont des rails tout cochés ou tout
    // décochés — elles seraient passées par chance.
    lignes: new Set(tuiles.map((c) => c.offsetTop)).size,
    nb: rects.length,
    largeurMin: Math.min(...rects.map((r) => r.width)),
    largeurMax: Math.max(...rects.map((r) => r.width)),
    // ⚠️ PAS DE SEUIL EN PIXELS SUR LE LIBELLÉ. Un « au moins N px de large »
    // dépend des métriques de police et bascule entre le CI et un poste local
    // (« Moto » mesure ~23-25 px selon la fonte). Ce qui prouve vraiment la
    // lisibilité, c'est la LARGEUR DE LA BULLE, mesurée juste au-dessus ; ici on
    // vérifie seulement que chaque bulle nomme bien la passion attendue — ce qui
    // attrape au passage un identifiant de fixture absent du catalogue, que
    // `passionById` rendrait « Passion » pour toutes.
    libelles: tuiles.map((c) => {
      const l = c.querySelector(".profile-tile-label");
      return l ? l.textContent.trim() : null;
    }),
    coulisse: rail.scrollWidth > rail.clientWidth + 1,
    railDansEcran: railRect.right <= window.innerWidth + 1 && railRect.left >= -1,
    hauteur: Math.round(railRect.height),
  };
}

// Géométrie de la PORTE D'AJOUT, là où elle vit depuis le 2026-09-03 : dans
// `#passionManager`. Évaluée DANS la page, comme `mesurerRail`.
function mesurerPorteAjout() {
  const panneau = document.getElementById("passionManager");
  const porte = document.getElementById("nouveauProfilLien");
  if (!panneau || !porte) return { existe: false };
  const pr = porte.getBoundingClientRect();
  return {
    existe: true,
    panneauReplie: !!panneau.hidden,
    largeur: Math.round(pr.width),
    hauteur: Math.round(pr.height),
    // ⚠️ ENTIÈREMENT dans la fenêtre, sur les DEUX axes. La bulle ne vit plus
    // dans un conteneur `overflow-x: auto`, donc elle ne peut plus sortir d'un
    // scrollport — mais elle peut encore déborder de l'écran à 320 px, ou être
    // poussée sous la ligne de flottaison par les passions au-dessus d'elle.
    dansLaFenetre: pr.left >= -1 && pr.right <= window.innerWidth + 1,
    // Le panneau se déroule dans le flux de la page : la porte est atteignable
    // au défilement, ce qui est vrai dès que sa boîte n'est pas vide.
    peinte: pr.width > 0 && pr.height > 0,
  };
}

test("③ ter — une bulle reste une cible tactile confortable", async ({ page }) => {
  await poser(page);
  const min = await page.evaluate(() => {
    const b = [...document.querySelectorAll("#v9ProfilePassions .profile-tile")];
    return Math.min(...b.map((c) => c.getBoundingClientRect().height));
  });
  expect(min, "cible tactile d'une bulle de passion").toBeGreaterThanOrEqual(44);
});

test("③ quater — six passions : la rangée COULISSE, elle ne se comprime pas", async ({ page }) => {
  // ⚠️ CE TEST A CHANGÉ DE QUESTION DEUX FOIS, ET LA SECONDE EST LA BONNE.
  // Il a d'abord vérifié qu'une rangée de pastilles passée à la ligne ne se
  // chevauchait pas. Il a ensuite garanti l'inverse de ce que son titre disait :
  // les bulles portaient `flex: 1 1 0`, donc elles RÉTRÉCISSAIENT pour tenir
  // dans la largeur, et il exigeait justement que rien ne déborde
  // (`scrollWidth === clientWidth`). C'est ce contrat-là qui a produit le défaut
  // du 2026-09-02 : à dix passions, chaque bulle tombait sous 26 px, la vignette
  // de 34/46 px débordait de sa case — les bulles se recouvraient — et le
  // libellé était rogné jusqu'à disparaître. « Met plutôt un système coulissant,
  // je switch gauche ou droite pour faire défiler les passions » (Benjamin).
  //
  // Le contrat est donc INVERSÉ : la largeur d'une bulle est FIXE, la rangée
  // déborde, et c'est l'`overflow-x: auto` du rail qui la fait coulisser. Ce
  // qu'on garantit ici : une seule rangée, aucune bulle qui en recouvre une
  // autre, une largeur de bulle qui laisse le libellé lisible, un rail qui
  // défile réellement, et une hauteur qui ne repousse pas la carte d'identité.
  await poser(page, {
    profiles: ["moto", "podcast", "voyage", "cuisine", "musique", "sport"].map((p, i) => ({
      id: "pp_" + p, name: "Benjamin", passion: p, emoji: "✨", color: "#7c3aed", createdAt: i + 1,
    })),
  });
  const vu = await page.evaluate(mesurerRail);
  expect(vu.nb, "six passions, et plus aucune porte d'ajout dans le rail").toBe(6);
  expect(vu.chevauche, "aucune paire de bulles ne se recouvre").toBe(false);
  expect(vu.lignes, "une seule rangée : elles coulissent, elles ne s'empilent pas").toBe(1);
  expect(vu.largeurMin, "une bulle garde la largeur de son libellé").toBeGreaterThanOrEqual(60);
  expect(vu.coulisse, "la rangée déborde du rail, donc elle se fait défiler").toBe(true);
  expect(vu.railDansEcran, "le rail lui-même ne sort pas de l'écran en 390 px").toBe(true);
  expect(vu.hauteur, "le rail reste une rangée, pas un bloc").toBeLessThan(120);
});

// ⚠️ LE CAS QUI A PRODUIT LA DEMANDE : dix passions. C'est le seuil auquel
// l'ancien `flex: 1 1 0` rendait les bulles illisibles et superposées, sur le
// Profil comme sur le Fil. Un rail coulissant, lui, se comporte pareil à 3 ou à
// 30 : seule la longueur de la rangée change.
test("③ quater bis — DIX passions : les bulles gardent leur taille et leur nom", async ({ page }) => {
  await poser(page, {
    profiles: DIX_REELLES.map((p, i) => ({
      id: "pp_" + i, name: "Benjamin", passion: p, emoji: "✨", color: "#7c3aed", createdAt: i + 1,
    })),
  });
  const vu = await page.evaluate(mesurerRail);
  expect(vu.nb, "dix passions, et plus aucune porte d'ajout dans le rail").toBe(10);
  expect(vu.chevauche, "AUCUNE bulle n'en recouvre une autre — le défaut d'origine").toBe(false);
  expect(vu.lignes, "toujours une seule rangée").toBe(1);
  expect(vu.largeurMin, "à dix, une bulle fait la même largeur qu'à trois").toBeGreaterThanOrEqual(60);
  expect(vu.largeurMax - vu.largeurMin, "toutes les bulles ont la MÊME largeur").toBeLessThanOrEqual(1);
  expect(vu.libelles, "chaque bulle nomme sa passion").toEqual(
    ["Moto", "Podcast", "Voyage", "Cuisine", "Musique",
     "Sport", "Photo", "Littérature", "Jardinage", "Danse"]);
  expect(vu.coulisse, "la rangée se fait défiler à gauche et à droite").toBe(true);
  expect(vu.hauteur, "et elle reste une rangée").toBeLessThan(120);
});

// ══════════════════════════════════════════════════════════════════════════
// LA PORTE D'AJOUT EST RÉELLEMENT PEINTE — la question survit au déménagement
// ──────────────────────────────────────────────────────────────────────────
// HISTOIRE DE CE CAS, parce qu'elle explique sa forme. Tant que les bulles se
// PARTAGEAIENT la largeur, la bulle « + » posée en dernier dans le rail restait
// visible quel qu'en soit le nombre. Le rail coulissant (2026-09-02) l'a poussée
// hors du scrollport : mesuré à 320 px avec 3 passions — le plafond gratuit
// (`PASSIONS_OFFERTES`) — elle commençait à x=326 alors que le rail s'arrêtait à
// 304, donc ENTIÈREMENT hors écran, pas même un liseré. Elle est alors passée en
// tête du rail, et ce cas mesurait qu'elle y restait dans le champ.
//
// Le 2026-09-03, Benjamin l'a fait descendre du rail vers « Gérer mes passions ».
// LE CAS N'EST PAS SUPPRIMÉ POUR AUTANT, il change de surface : la question
// « la porte est-elle réellement à l'écran, ou seulement dans le DOM ? » vaut
// pour toute porte, où qu'elle vive. Supprimer le cas avec la bulle aurait rendu
// le déménagement gratuit — et c'est précisément le genre de trou par lequel une
// porte redevient introuvable.
//
// ⚠️ CE DÉFAUT EST INVISIBLE À UN TEST D'EXISTENCE : pour Playwright un nœud
// hors champ reste « visible » (sa boîte n'est pas vide) et `.click()` fait
// défiler tout seul avant de cliquer. Seule une mesure de rectangles l'attrape.
// ══════════════════════════════════════════════════════════════════════════
for (const [largeur, nb] of [[320, 3], [320, 10], [390, 10]]) {
  test("③ nonies — " + largeur + " px, " + nb + " passions : la porte d'ajout est peinte dans « Gérer mes passions »", async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 844 });
    await poser(page, {
      profiles: DIX_REELLES.slice(0, nb).map((p, i) => ({
        id: "pp_" + i, name: "Benjamin", passion: p, emoji: "✨", color: "#7c3aed", createdAt: i + 1,
      })),
    });
    // Le rail, lui, ne porte plus que les passions possédées.
    const rail = await page.evaluate(mesurerRail);
    expect(rail.nb, nb + " passions, et rien d'autre, dans le rail").toBe(nb);
    expect(rail.chevauche, "et rien ne se recouvre").toBe(false);

    // Repliée, la porte existe mais n'est pas peinte : c'est le comportement
    // voulu, et le mesurer évite qu'un test se croie concluant sur un panneau
    // qu'il n'a jamais ouvert.
    const repliee = await page.evaluate(mesurerPorteAjout);
    expect(repliee.existe, "la porte existe dans le DOM même repliée").toBe(true);
    expect(repliee.panneauReplie).toBe(true);
    expect(repliee.peinte, "un panneau `hidden` ne peint rien").toBe(false);

    await page.evaluate(() => { openPassionManager(); });
    await page.waitForTimeout(400);
    const vu = await page.evaluate(mesurerPorteAjout);
    expect(vu.panneauReplie, "le panneau s'est bien ouvert").toBe(false);
    expect(vu.peinte, "la porte d'ajout a une boîte non vide").toBe(true);
    expect(vu.dansLaFenetre, "et elle ne déborde pas de l'écran en " + largeur + " px").toBe(true);
    // Cible tactile : la même exigence que pour une bulle du rail.
    expect(vu.hauteur, "cible tactile de la porte d'ajout").toBeGreaterThanOrEqual(44);
  });
}

// Le geste lui-même : on pousse le rail vers la gauche, il défile, et la
// position SURVIT à la reconstruction que provoque le choix d'une passion
// (`ecrireRailCoulissant`, app-02). Sans elle, la bulle qu'on vient de toucher
// tout à droite repartait hors de vue à l'instant où elle s'allumait.
test("③ quater ter — le rail défile, et sa position survit au choix d'une passion", async ({ page }) => {
  await poser(page, {
    profiles: DIX_REELLES.map((p, i) => ({
      id: "pp_" + i, name: "Benjamin", passion: p, emoji: "✨", color: "#7c3aed", createdAt: i + 1,
    })),
  });
  const vu = await page.evaluate(() => {
    const rail = document.getElementById("v9ProfilePassions");
    rail.scrollLeft = 200;
    const apresDefilement = Math.round(rail.scrollLeft);
    const htmlAvant = rail.innerHTML;
    // Une passion visible seulement après avoir fait défiler.
    setProfilePassion("pp_9");
    return {
      apresDefilement,
      apresChoix: Math.round(rail.scrollLeft),
      // Sans reconstruction, la position tiendrait toute seule : le test serait
      // vert sans rien prouver.
      reconstruit: rail.innerHTML !== htmlAvant,
      cochee: !!rail.querySelector('.profile-tile.active[data-passion-tile="pp_9"]'),
    };
  });
  expect(vu.apresDefilement, "le rail accepte réellement un défilement horizontal").toBeGreaterThan(0);
  expect(vu.cochee, "la passion choisie s'allume").toBe(true);
  expect(vu.reconstruit, "choisir une passion RECONSTRUIT bien le rail").toBe(true);
  expect(vu.apresChoix, "et le rail n'est pas reparti tout à gauche").toBe(vu.apresDefilement);
});


// ══════════════════════════════════════════════════════════════════════════
// ③ decies — LA RANGÉE EST CENTRÉE QUAND ELLE TIENT, ET SEULEMENT ALORS
// ══════════════════════════════════════════════════════════════════════════
// Défaut mesuré le 2026-09-03, à 390 px avec trois passions : les bulles
// occupaient 51 → 293 dans une colonne de contenu qui va de 16 à 374. Trente-
// cinq pixels de vide à gauche, quatre-vingt-un à droite — le rail se lisait
// décalé, sous une carte d'identité qui, elle, est centrée. La cause n'est pas
// un décalage : un conteneur flex aligne au DÉBUT, donc tout le libre s'entasse
// du même côté.
//
// ⚠️ CE QUE CES QUATRE CAS GARDENT ENSEMBLE EST UN ÉQUILIBRE CONDITIONNEL, PAS
// UN CENTRAGE. Le correctif évident — `justify-content: center` — centrerait
// AUSSI la rangée qui déborde : le trop-plein partirait des deux côtés et les
// premières bulles deviendraient INATTEIGNABLES, `scrollLeft` ne descendant pas
// sous zéro. `③ decies bis` existe précisément pour ça : il tombe au rouge sur
// `justify-content: center` là où `③ decies` resterait vert. Les deux ensemble,
// jamais l'un sans l'autre.

// Écarts de la rangée aux deux bords INTÉRIEURS du rail (le `padding` du rail
// n'est pas du vide décalé : c'est la marge voulue de la colonne).
// Évaluée DANS la page, comme `mesurerRail`.
function mesurerEquilibreRail(sel) {
  const rail = document.querySelector(sel);
  if (!rail) return { existe: false };
  const tuiles = [...rail.querySelectorAll(".profile-tile")];
  if (!tuiles.length) return { existe: false };
  const st = getComputedStyle(rail);
  const r = rail.getBoundingClientRect();
  const debut = r.left + parseFloat(st.paddingLeft);
  const fin = r.right - parseFloat(st.paddingRight);
  const premiere = tuiles[0].getBoundingClientRect();
  const derniere = tuiles[tuiles.length - 1].getBoundingClientRect();
  return {
    existe: true,
    nb: tuiles.length,
    deborde: rail.scrollWidth > rail.clientWidth + 1,
    // ⚠️ Mesuré à `scrollLeft` remis à zéro par l'appelant : un rail déjà défilé
    // décalerait les deux écarts d'autant, et l'équilibre ne voudrait plus rien
    // dire.
    videGauche: Math.round(premiere.left - debut),
    videDroite: Math.round(fin - derniere.right),
    // La preuve d'atteignabilité, et le seul point qui distingue les marges auto
    // de `justify-content: center` : au tout début du défilement, la première
    // bulle est-elle ENTIÈREMENT dans le scrollport ?
    premiereEntiere: premiere.left >= r.left - 1 && premiere.right <= r.right + 1,
  };
}

async function equilibreRail(page, sel) {
  await page.evaluate((s) => {
    const r = document.querySelector(s);
    if (r) r.scrollLeft = 0;
  }, sel);
  return page.evaluate(mesurerEquilibreRail, sel);
}

test("③ decies — trois passions : la rangée est CENTRÉE, elle ne colle plus à gauche", async ({ page }) => {
  await poser(page);
  const vu = await equilibreRail(page, "#v9ProfilePassions");
  expect(vu.existe, "le rail du profil porte bien ses trois bulles").toBe(true);
  expect(vu.nb, "trois passions").toBe(3);
  expect(vu.deborde, "à trois passions la rangée TIENT dans la largeur").toBe(false);
  expect(Math.abs(vu.videGauche - vu.videDroite),
    "le vide est réparti à égalité des deux côtés").toBeLessThanOrEqual(1);
  // ⚠️ SANS CETTE LIGNE, LE TEST SERAIT VERT SUR UNE RANGÉE QUI REMPLIT TOUT.
  // Un `0 === 0` prouverait l'équilibre sans prouver qu'il reste du vide à
  // répartir — donc sans distinguer le correctif de son absence.
  expect(vu.videGauche, "et il reste bien du vide à répartir").toBeGreaterThan(0);
});

test("③ decies bis — DIX passions : la rangée déborde, et la PREMIÈRE bulle reste atteignable", async ({ page }) => {
  // ⚠️ LE VERROU ANTI-`justify-content: center`. Ce cas-ci est le seul qui
  // sépare les deux écritures : à trois passions elles rendent EXACTEMENT la
  // même image. Ici, `justify-content: center` sortirait la rangée de ~90 px à
  // gauche du scrollport — définitivement, `scrollLeft` étant borné à zéro.
  await poser(page, {
    profiles: DIX_REELLES.map((p, i) => ({
      id: "pp_" + i, name: "Benjamin", passion: p, emoji: "✨", color: "#7c3aed", createdAt: i + 1,
    })),
  });
  const vu = await equilibreRail(page, "#v9ProfilePassions");
  expect(vu.nb, "dix passions").toBe(10);
  expect(vu.deborde, "à dix passions la rangée DÉBORDE : c'est le cas coulissant").toBe(true);
  expect(vu.videGauche,
    "au débordement les marges auto retombent à 0 : la rangée part du vrai début").toBe(0);
  expect(vu.premiereEntiere,
    "et la première bulle est entièrement dans le champ dès le début du défilement").toBe(true);
});

test("③ decies ter — une SEULE passion se centre aussi", async ({ page }) => {
  // La même bulle est `:first-child` ET `:last-child` : elle reçoit les deux
  // marges. Ce cas est le démarrage à froid de tout compte — il ne peut pas être
  // celui qu'on oublie.
  await poser(page, {
    profiles: [{ id: "pp_moto", name: "Benjamin", passion: "moto", emoji: "🏍", color: "#7c3aed", createdAt: 1 }],
  });
  const vu = await equilibreRail(page, "#v9ProfilePassions");
  expect(vu.nb, "une passion").toBe(1);
  expect(Math.abs(vu.videGauche - vu.videDroite),
    "la bulle unique est au milieu, pas dans le coin").toBeLessThanOrEqual(1);
  expect(vu.videGauche, "et largement entourée").toBeGreaterThan(50);
});

test("③ decies quater — le Fil se centre AUSSI, le profil visité garde son alignement", async ({ page }) => {
  // ⚠️ `.profile-strip` EST PARTAGÉE PAR TROIS SURFACES, ET DEUX SEULEMENT SONT
  // CENTRÉES. Le 2026-09-03, Benjamin étend la demande au Fil : « aligne sur la
  // largeur les bulles de passion sur le fil ». Le rail du Fil (`#profileStrip`)
  // reçoit donc les mêmes marges auto que celui du Profil — mais la règle reste
  // ancrée à des IDENTIFIANTS, jamais à `.profile-strip` seule : le profil
  // visité (`#visitedPassions`) n'a rien demandé et garde son alignement au
  // début. Ce test mesure les deux surfaces plutôt que de relire le sélecteur.
  //
  // ⚠️ UNE SEULE PASSION, ET C'EST LA CONDITION DE VALIDITÉ DU CAS. Avec les
  // trois du socle, le rail du Fil porte CINQ bulles (« Suivis » et les envies
  // s'y ajoutent) et DÉBORDE — or une rangée qui déborde n'a plus de libre à
  // répartir : marges auto ou non, elle reste collée au début. Le test aurait
  // été vert sans rien distinguer, exactement le genre de vert par accident que
  // le socle a déjà produit ailleurs. Il faut une rangée qui TIENT pour que le
  // centrage, s'il fuitait jusqu'ici, se voie.
  await poser(page, {
    profiles: [{ id: "pp_moto", name: "Benjamin", passion: "moto", emoji: "🏍", color: "#7c3aed", createdAt: 1 }],
  });

  await page.evaluate(() => goTo("feed"));
  await page.waitForTimeout(600);
  const fil = await equilibreRail(page, "#profileStrip");
  expect(fil.existe, "le rail du Fil est bien peint").toBe(true);
  expect(fil.deborde, "la rangée du Fil TIENT : le cas est donc discriminant").toBe(false);
  // ⚠️ TOLÉRANCE DE QUELQUES PIXELS, ET ELLE EST MOTIVÉE. Une bulle porte des
  // décorations qui déplacent son RECTANGLE sans déplacer sa boîte de mise en
  // page : `transform: scale(0.95)` sur les non-cochées quand un filtre est
  // actif, `translateY(-2px)` sur la cochée. Mesuré à 2,2 px d'écart sur le Fil
  // pour une mise en page, elle, parfaitement symétrique (40 px / 40 px en
  // `offsetLeft`). Ce qui est prouvé ici n'est donc pas « exactement égal » mais
  // « au milieu, et pas dans le coin » — l'ancien état laissait 60 px de plus
  // d'un côté que de l'autre.
  expect(Math.abs(fil.videGauche - fil.videDroite),
    "le Fil aussi répartit le vide à égalité des deux côtés").toBeLessThanOrEqual(5);
  // ⚠️ SANS CETTE LIGNE, LE TEST SERAIT VERT SUR UNE RANGÉE QUI REMPLIT TOUT :
  // un `0 === 0` prouverait l'équilibre sans prouver qu'il reste du vide à
  // répartir — donc sans distinguer le correctif de son absence.
  expect(fil.videGauche, "et il reste bien du vide à répartir").toBeGreaterThan(0);

  // Le profil visité : Léa a deux passions, elles tiennent dans la largeur.
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(400);
  await ouvrirProfilVisite(page);
  const visite = await equilibreRail(page, ".modal #visitedPassions");
  expect(visite.existe, "le rail du profil visité est bien peint").toBe(true);
  expect(visite.deborde, "les deux passions de Léa tiennent : cas discriminant lui aussi").toBe(false);
  expect(Math.abs(visite.videGauche), "le profil visité part bien de son début").toBeLessThanOrEqual(5);
  expect(visite.videDroite - visite.videGauche,
    "tout le libre reste du même côté : le profil visité n'est PAS centré").toBeGreaterThan(60);
});
// ══════════════════════════════════════════════════════════════════════════
// ③ decies quinquies — LE FIL DANS SA CONFIGURATION DE DÉPART : QUATRE BULLES
// ══════════════════════════════════════════════════════════════════════════
// C'est le cas que Benjamin décrit le 2026-09-03 : « la configuration de base
// des utilisateurs est de 4 bulles, 1 pour Suivis et trois passions ; ensuite
// les autres seront payantes donc ils switcheront sur le côté pour les voir,
// mais je veux que la configuration à 4 bulles soit équilibrée dans la largeur,
// centrée. » Les deux moitiés de la phrase sont mesurées ici, dans cet ordre —
// centrée tant qu'elle TIENT, coulissante depuis son vrai début dès qu'elle
// déborde, sans jamais perdre une bulle à gauche.
//
// ⚠️ `_activeFeedPassions` EST VIDÉ EXPRÈS. Le rail du Fil complète les passions
// possédées par les « envies » actives sans profil (`_interet_…`) : avec le
// socle, il peint CINQ bulles et déborde — le cas ne mesurerait plus rien. On
// pose donc la prémisse (quatre bulles) plutôt que d'espérer la trouver.
async function poserFil(page, passions) {
  await poser(page, {
    profiles: passions.map((nom, i) => ({
      id: "pf_" + i, name: "Benjamin", passion: nom, emoji: "✨", color: "#7c3aed", createdAt: i + 1,
    })),
  });
  await page.evaluate(() => {
    _activeFeedPassions.clear();
    const rail = document.getElementById("profileStrip");
    if (rail) rail._lastHtml = null;
    goTo("feed");
    renderProfileStrip();
  });
  await page.waitForTimeout(500);
}

test("③ decies quinquies — QUATRE bulles (Suivis + 3 passions) : la rangée est centrée", async ({ page }) => {
  await poserFil(page, ["moto", "podcast", "voyage"]);
  const fil = await equilibreRail(page, "#profileStrip");
  expect(fil.nb, "« Suivis » plus les trois passions offertes").toBe(4);
  expect(fil.deborde, "à quatre bulles la rangée TIENT dans la largeur").toBe(false);
  expect(Math.abs(fil.videGauche - fil.videDroite),
    "le vide est réparti à égalité des deux côtés").toBeLessThanOrEqual(5);
  expect(fil.videGauche, "et il reste bien du vide à répartir").toBeGreaterThan(10);
});

test("③ decies sexies — au-delà, le Fil déborde et sa PREMIÈRE bulle reste atteignable", async ({ page }) => {
  // ⚠️ LE VERROU ANTI-`justify-content: center` CÔTÉ FIL, jumeau de
  // `③ decies bis`. Quand les passions payantes arriveront, la rangée dépassera
  // la largeur : le centrage doit alors DISPARAÎTRE de lui-même, sans quoi les
  // premières bulles sortiraient du scrollport pour de bon (`scrollLeft` ne
  // descend pas sous zéro). Les marges auto ne distribuent que du libre POSITIF.
  //
  // Mesuré par réinjection : avec `justify-content: center` sur `#profileStrip`,
  // la rangée démarre à **−224 px** du bord intérieur du rail, et ce cas-ci est
  // le SEUL des six à le voir — `③ decies quinquies` reste vert, les deux
  // écritures rendant exactement la même image quand la rangée tient.
  await poserFil(page, DIX_REELLES);
  const fil = await equilibreRail(page, "#profileStrip");
  expect(fil.nb, "« Suivis » plus dix passions").toBe(11);
  expect(fil.deborde, "à onze bulles la rangée DÉBORDE : c'est le cas coulissant").toBe(true);
  expect(Math.abs(fil.videGauche),
    "au débordement les marges auto retombent à 0 : la rangée part du vrai début").toBeLessThanOrEqual(5);
  expect(fil.premiereEntiere,
    "et la première bulle est entièrement dans le champ dès le début du défilement").toBe(true);
});

test("③ quinquies — une passion ARCHIVÉE ne réapparaît pas dans le rail", async ({ page }) => {
  // ⚠️ PORTE DÉROBÉE DÉJÀ FERMÉE UNE FOIS (lot UI-8, ②). Le jsonb
  // `profiles.passions` garde les passions archivées — c'est voulu, la colonne
  // sert de sauvegarde. Aucune surface ne doit les rendre : ranger une passion
  // la ferait sinon réapparaître chez tout le monde.
  await poser(page);
  const vu = await page.evaluate(() => {
    archiverPassion("pp_pod");
    renderMainProfile();
    renderProfilePassionRail();
    return {
      rail: [...document.querySelectorAll("#v9ProfilePassions .profile-tile[data-passion-tile]")]
        .map((c) => c.getAttribute("data-passion-tile")),
      // Et l'identité TEXTE des surfaces denses ne la laisse pas fuir non plus.
      texte: identitePassionsTexte({ id: MY_UID, passions: state.user.profiles }),
    };
  });
  expect(vu.rail).not.toContain("pp_pod");
  expect(vu.rail).toContain("pp_moto");
  expect(vu.texte, "une passion archivée ne s'affiche chez personne").not.toContain("Podcast");
});

// ══════════════════════════════════════════════════════════════════════════
// ③ SUR LE PROFIL D'UN AUTRE — la même règle, et le retour resté disponible
// ══════════════════════════════════════════════════════════════════════════

async function ouvrirProfilVisite(page) {
  await page.evaluate(() => {
    state.seed.users = (state.seed.users || []).filter((u) => u.id !== "u_lea2");
    state.seed.users.push({
      id: "u_lea2", name: "Léa", profileEmoji: "🍳", avatar: "#8b5cf6",
      passion: "cuisine",
      passions: [{ id: "cuisine", emoji: "🍳" }, { id: "jardinage", emoji: "🌱" }],
    });
    window._supaReal = false;
    openUserProfile("u_lea2");
  });
  await page.waitForTimeout(900);
}

test("③ sexies — un profil visité suit la même règle : une seule rangée, en bulles", async ({ page }) => {
  await poser(page);
  await ouvrirProfilVisite(page);
  // ⚠️ La requête est bornée à la MODALE : mon propre profil est toujours dans
  // le document derrière elle. Un sélecteur global ramasserait les deux et
  // ferait passer ce test pour la mauvaise raison.
  const vu = await page.evaluate(() => ({
    sousLePseudo: document.querySelectorAll(".modal .main-profile-body .ident-passions").length,
    rail: [...document.querySelectorAll(".modal #visitedPassions .profile-tile")]
      .map((c) => c.getAttribute("data-passion-tile")),
    vignettes: document.querySelectorAll(".modal #visitedPassions .profile-tile-avatar").length,
  }));
  expect(vu.sousLePseudo, "aucune ligne de passions sous son pseudo").toBe(0);
  expect(vu.rail, "ses passions sont dans le rail, une seule fois").toEqual(["cuisine", "jardinage"]);
  expect(vu.vignettes, "des bulles rondes, comme sur mon profil").toBe(2);
});

test("③ septies — le RETOUR de la page de passion reste servi (chemin dormant)", async ({ page }) => {
  // ⚠️ CE TEST GARDE UN CHEMIN SANS APPELANT, ET C'EST DÉLIBÉRÉ. Le second
  // argument d'`openPassionExplorer` peint « ← Retour au profil » ; plus aucune
  // surface ne le passe depuis le retrait des pastilles-portes (2026-09-02). Il
  // est conservé parce que `openModal` N'EMPILE PAS : le jour où une porte vers
  // une page de passion réapparaît dans une modale, l'oublier ferait perdre la
  // personne par qui on l'a découverte, sans aucun chemin de retour. On
  // l'appelle donc directement, au lieu de compter sur une porte disparue.
  await poser(page);
  await ouvrirProfilVisite(page);
  await page.evaluate(() => openPassionExplorer("cuisine", "u_lea2"));
  await page.waitForTimeout(500);
  const surLaPassion = await page.evaluate(() => ({
    retour: !!document.querySelector(".passion-explorer-retour"),
    texte: (document.querySelector(".modal") || {}).innerText || "",
  }));
  expect(surLaPassion.retour, "le lien de retour est là").toBe(true);
  expect(surLaPassion.texte).toContain("Créateurs");

  await page.click(".passion-explorer-retour .link");
  await page.waitForTimeout(900);
  const revenu = await page.evaluate(() =>
    (document.querySelector(".modal") || {}).innerText || "");
  expect(revenu, "on est bien revenu sur le profil de Léa").toContain("Léa");
});

test("③ octies — ouverte depuis un ÉCRAN, la page de passion n'invente pas de retour", async ({ page }) => {
  // Les appels historiques (Explorer, tuiles de tendance, IA, passerelle UI-3)
  // ne passent pas de second argument : ils viennent d'un écran, pas d'une
  // modale, et n'ont rien à restituer. Un lien « Retour au profil » y mentirait.
  await poser(page);
  await page.evaluate(() => openPassionExplorer("voyage"));
  await page.waitForTimeout(400);
  const retour = await page.evaluate(() => !!document.querySelector(".passion-explorer-retour"));
  expect(retour).toBe(false);
});

// ══════════════════════════════════════════════════════════════════════════
// LES SURFACES DENSES NE BOUGENT PAS
// ══════════════════════════════════════════════════════════════════════════

test("une carte de publication ne nomme la passion QU'UNE FOIS", async ({ page }) => {
  // ⚠️ ASSERTION RETOURNÉE LE 2026-09-02, jamais vidée. Ce test exigeait la
  // ligne d'identité sur la carte, en TEXTE inerte ; Benjamin l'a fait retirer
  // après essai réel : « sur un post dans le fil tu écris deux fois la passion
  // concernée, je veux qu'il n'y en ait qu'une, celle avec l'heure du post. »
  // Les deux lignes se suivaient et, sur un compte mono-passion, répétaient
  // littéralement le même mot.
  //
  // Ce qui reste garanti, et c'est le vrai périmètre : la carte nomme la passion
  // DE LA PUBLICATION, une seule fois, à côté de l'heure — et aucune pastille
  // cliquable n'y apparaît (une carte a déjà son geste ; un bouton imbriqué y
  // donnerait deux destinations pour un tap).
  await poser(page);
  const vu = await page.evaluate(() => {
    const box = document.createElement("div");
    box.innerHTML = renderPostHTML({
      id: "p_x", authorId: "me", passion: "moto", type: "text", text: "Coucou",
      mood: "all", createdAt: Date.now(), likes: 0, comments: [], _source: "me",
    });
    const meta = box.querySelector(".post-author-meta");
    return {
      lignesIdentite: box.querySelectorAll(".ident-passions").length,
      meta: meta ? meta.textContent.trim() : "",
      boutons: box.querySelectorAll(".ident-passion-lien").length,
    };
  });
  expect(vu.lignesIdentite, "plus de ligne d'identité sur une carte du fil").toBe(0);
  expect(vu.meta, "la seule mention de la passion est celle de la publication").toContain("Moto");
  expect(vu.boutons, "aucune pastille cliquable dans une carte de publication").toBe(0);
});
