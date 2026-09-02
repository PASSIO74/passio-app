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
  // ⚠️ LA PORTE D'AJOUT EST EN TÊTE DEPUIS LE 2026-09-02, et cet ordre-ci est le
  // contrat : en queue d'un rail devenu coulissant, elle sortait du scrollport
  // (mesuré à 320 px avec 3 passions : elle commençait à x=326 pour un rail qui
  // s'arrête à 304). Voir `③ nonies`, qui mesure sa visibilité réelle.
  expect(vu.bulles).toEqual(["__ajouter__", "pp_moto", "pp_pod", "pp_voy"]);
  expect(vu.vignettes, "des bulles rondes, pas une rangée ovale").toBe(4);
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
  const plus = rail.querySelector('[data-passion-tile="__ajouter__"]');
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
    // La porte d'ajout est-elle ENTIÈREMENT dans le champ visible du rail ?
    // Un test de présence ne le dirait pas : hors du scrollport, le nœud reste
    // « visible » pour Playwright et `.click()` fait défiler tout seul.
    plusDansLeChamp: !plus ? null : (function () {
      const pr = plus.getBoundingClientRect();
      return pr.left >= railRect.left - 1 && pr.right <= railRect.right + 1;
    })(),
    hauteur: Math.round(railRect.height),
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
  expect(vu.nb, "six passions plus la porte d'ajout").toBe(7);
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
  expect(vu.nb, "dix passions plus la porte d'ajout").toBe(11);
  expect(vu.chevauche, "AUCUNE bulle n'en recouvre une autre — le défaut d'origine").toBe(false);
  expect(vu.lignes, "toujours une seule rangée").toBe(1);
  expect(vu.largeurMin, "à dix, une bulle fait la même largeur qu'à trois").toBeGreaterThanOrEqual(60);
  expect(vu.largeurMax - vu.largeurMin, "toutes les bulles ont la MÊME largeur").toBeLessThanOrEqual(1);
  expect(vu.libelles, "chaque bulle nomme sa passion").toEqual(
    ["Ajouter", "Moto", "Podcast", "Voyage", "Cuisine", "Musique",
     "Sport", "Photo", "Littérature", "Jardinage", "Danse"]);
  expect(vu.coulisse, "la rangée se fait défiler à gauche et à droite").toBe(true);
  expect(vu.hauteur, "et elle reste une rangée").toBeLessThan(120);
});

// ══════════════════════════════════════════════════════════════════════════
// LA PORTE D'AJOUT RESTE DANS LE CHAMP — le prix caché du rail coulissant
// ──────────────────────────────────────────────────────────────────────────
// Tant que les bulles se PARTAGEAIENT la largeur, la bulle « + » posée en
// dernier restait visible quel qu'en soit le nombre. Le rail coulissant l'a
// poussée hors du scrollport : mesuré à 320 px avec 3 passions — le plafond
// gratuit (`PASSIONS_OFFERTES`) — elle commençait à x=326 alors que le rail
// s'arrêtait à 304, donc ENTIÈREMENT hors écran, pas même un liseré. Et c'est
// la seule porte VISIBLE : l'autre vit dans `#passionManager`, `hidden` par
// défaut, derrière le menu options. Elle est désormais en TÊTE du rail.
//
// ⚠️ CE DÉFAUT EST INVISIBLE À UN TEST D'EXISTENCE, et c'est tout l'intérêt de
// celui-ci : pour Playwright, un nœud poussé hors du scrollport d'un conteneur
// `overflow-x: auto` reste « visible » (sa boîte n'est pas vide), et `.click()`
// fait défiler tout seul avant de cliquer. `passions-plates.spec.js` serait
// resté VERT pendant que la porte était introuvable à l'écran. Seule une
// mesure de rectangles l'attrape.
// ══════════════════════════════════════════════════════════════════════════
for (const [largeur, nb] of [[320, 3], [320, 10], [390, 10]]) {
  test("③ nonies — " + largeur + " px, " + nb + " passions : la porte « + » reste dans le champ", async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 844 });
    await poser(page, {
      profiles: DIX_REELLES.slice(0, nb).map((p, i) => ({
        id: "pp_" + i, name: "Benjamin", passion: p, emoji: "✨", color: "#7c3aed", createdAt: i + 1,
      })),
    });
    const vu = await page.evaluate(mesurerRail);
    expect(vu.nb, nb + " passions plus la porte d'ajout").toBe(nb + 1);
    expect(vu.plusDansLeChamp,
      "la porte d'ajout est ENTIÈREMENT visible sans avoir à faire défiler").toBe(true);
    expect(vu.chevauche, "et rien ne se recouvre").toBe(false);
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
