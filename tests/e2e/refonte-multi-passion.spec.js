// REFONTE MULTI-PASSION — les tests d'acceptation de la consigne §8.
//
// Une personne, UN profil public, PLUSIEURS passions. Les passions classent le
// contenu et servent de préférence de lecture ; elles n'ont ni identité, ni
// abonnés, ni pseudo. Cette suite verrouille les quatre promesses qui décident
// du produit, et une par une :
//
//   ① PROFIL — une passion sélectionnée filtre « Publications » ET « Activité ».
//   ② IDENTITÉ — une publication affiche toujours le pseudo du compte, avec ses
//      passions sous le pseudo, quelle que soit la passion de la publication.
//   ③ SUIVIS SANS PASSION COMMUNE — tout le contenu d'un compte suivi reste
//      admissible, quelle que soit sa passion.
//   ④ COMBINAISON + DÉDUPLICATION — « Suivis » + deux passions + une envie
//      donnent UNE liste, et une publication qui satisfait plusieurs critères
//      n'y apparaît qu'une fois.
//   ⑤ STUDIO — le choix de la passion de destination y est, et NULLE PART ailleurs.
//   ⑥ SUPPRESSIONS — « À propos », « Passion active » et « Carnet de voyage »
//      ne sont plus ni visibles ni atteignables.
//
// ⚠️ Le fil ne consulte les envies QUE lorsque le rail d'intentions est actif
// (`feedIntentsEnabled`, actif par défaut). Les cas qui les exercent le
// vérifient explicitement plutôt que de le supposer : un test qui mesurerait le
// chemin legacy passerait pour la mauvaise raison.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Benjamin possède Moto, Podcast et Voyage. Alice est suivie, sans passion
// commune. Un inconnu publie en Moto.
async function poser(page, opts = {}) {
  // ⚠️ CONVENTION DE TEST — la même qu'aux mises en ligne d'UI-3A, UI-4 et UI-8.
  // Cette suite pose le kill switch du lot qui la recouvre et GARDE TOUTES SES
  // ASSERTIONS — jamais de suppression, sinon une extinction accidentelle du lot
  // deviendrait invisible.
  //
  // ⚠️ LE MOTIF D'ORIGINE EST MORT, LA COUPURE RESTE. Elle avait été posée parce
  // que `flat_passions_v1` ajoutait la bulle « + » dans le rail du Profil, que
  // cette suite compte : elle l'aurait vue comme une passion de plus. La bulle a
  // quitté le rail le 2026-09-03 (elle vit dans `#passionManager`), donc ce
  // motif-là ne vaut plus — mais le lot recouvre d'autres surfaces de cette
  // suite, et LEVER la coupure ferait mesurer un autre programme que celui
  // annoncé. On réécrit la raison, on ne touche pas au geste.
  await page.addInitScript(() => localStorage.setItem("flat_passions_v1", "0"));
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((o) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};

    state.seed.users = (state.seed.users || []).filter(u => ["u_alice", "u_inconnu"].indexOf(u.id) === -1);
    state.seed.users.push({
      id: "u_alice", name: "Alice", profileEmoji: "🍳", avatar: "#8b5cf6",
      passion: "cuisine",
      passions: [{ id: "cuisine", emoji: "🍳" }, { id: "jardinage", emoji: "🌱" }],
    });
    state.seed.users.push({ id: "u_inconnu", name: "Inconnu", profileEmoji: "🎸", avatar: "#8b5cf6" });

    const t = Date.now();
    state.seed.posts = [
      // Alice, comptes suivis, AUCUNE passion commune avec moi.
      { id: "p_alice_cuisine", authorId: "u_alice", passion: "cuisine", type: "text",
        text: "ALICE_CUISINE", mood: "all", createdAt: t - 1000, likes: 0, comments: [] },
      { id: "p_alice_jardin", authorId: "u_alice", passion: "jardinage", type: "text",
        text: "ALICE_JARDIN", mood: "all", createdAt: t - 2000, likes: 0, comments: [] },
      // Un inconnu, en Moto : entre par la passion seulement.
      { id: "p_moto", authorId: "u_inconnu", passion: "moto", type: "text",
        text: "MOTO_INCONNU", mood: "all", createdAt: t - 3000, likes: 0, comments: [] },
      // Un inconnu, en Voyage : entre par la passion seulement.
      { id: "p_voyage", authorId: "u_inconnu", passion: "voyage", type: "text",
        text: "VOYAGE_INCONNU", mood: "all", createdAt: t - 4000, likes: 0, comments: [] },
      // Un inconnu, passion NON cochée, mais mood « Idées » (envie create).
      { id: "p_idee", authorId: "u_inconnu", passion: "tech", type: "text",
        text: "IDEE_TECH", mood: "creation", createdAt: t - 5000, likes: 0, comments: [] },
      // ⚠️ LE POST DE LA DÉDUPLICATION : compte suivi ET passion cochée ET envie
      // cochée. Il entre par les TROIS sources à chaque rendu.
      { id: "p_triple", authorId: "u_alice", passion: "moto", type: "text",
        text: "TRIPLE_SOURCE", mood: "creation", createdAt: t - 6000, likes: 0, comments: [] },
    ];
    state.supabasePosts = [];
    // QUATRIÈME tableau : `window._feedExtraPosts` est fait pour SURVIVRE aux
    // écrasements de `supabasePosts` (il protège un post arrivé pendant qu'une
    // requête était en vol). Le vider n'est donc pas une redondance : sans cela,
    // une publication RÉELLE de production ramenée par un rafraîchissement
    // asynchrone se réinvite dans le fil APRÈS le semis, et le test mesure autre
    // chose que son fixture. Défaut mesuré le 2026-09-02 sur `main` (run 2409).
    window._feedExtraPosts = [];
    state.user.following = o.following === undefined ? ["u_alice"] : o.following;
    state.user.general = { username: "Benjamin" };
    state.user.name = "Benjamin";
    state.user.profiles = [
      { id: "pp_moto", name: "Benjamin", passion: "moto", emoji: "🏍", color: "#7c3aed", createdAt: 1 },
      { id: "pp_pod", name: "Benjamin", passion: "podcast", emoji: "🎙", color: "#7c3aed", createdAt: 2 },
      { id: "pp_voy", name: "Benjamin", passion: "voyage", emoji: "✈️", color: "#7c3aed", createdAt: 3 },
    ];
    state.user.currentProfileId = "pp_moto";
    state.user.profilePostFilterId = null;
    state.user.profileEventFilterId = null;

    // Mes publications, une par passion — pour l'onglet « Publications ».
    state.userPosts = [
      { id: "me_moto", authorId: "me", profileId: "pp_moto", passion: "moto", type: "text",
        text: "MES_MOTO", mood: "all", createdAt: t - 100, likes: 0, comments: [] },
      { id: "me_pod", authorId: "me", profileId: "pp_pod", passion: "podcast", type: "text",
        text: "MES_PODCAST", mood: "all", createdAt: t - 200, likes: 0, comments: [] },
    ];

    // Mes activités, une par passion — pour l'onglet « Activité ».
    state.userEvents = [
      { id: "ev_moto", title: "BALADE_MOTO", passion: "moto", organizerId: (window.MY_UID || "me"),
        date: t + 86400000, city: "Annecy", attendees: [], emoji: "🏍" },
      { id: "ev_pod", title: "REC_PODCAST", passion: "podcast", organizerId: (window.MY_UID || "me"),
        date: t + 172800000, city: "Lyon", attendees: [], emoji: "🎙" },
    ];

    setFeedPassions(o.passions === undefined ? ["moto"] : o.passions);
    state.feedFollowingOn = (o.suivis === undefined) ? true : !!o.suivis;
    if (typeof setFeedIntents === "function") setFeedIntents(o.envies || []);
    selectedMoods = new Set(["all", "creation", "learn", "chill", "actu"]);
    state.feedMoodsTouched = true;
    saveState();
    window._feedDomSig = null;
    goTo("feed");
    renderFeed();
  }, opts);
  await page.waitForTimeout(400);
}

const filTexte = (page) => page.evaluate(() => document.getElementById("feedList").innerText);

// ══════════════════════════════════════════════════════════════════════════
// ① PROFIL — un sélecteur unique commande les deux onglets
// ══════════════════════════════════════════════════════════════════════════

test("① le profil porte le rail de passions du Fil, au-dessus des onglets", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(600);

  const vu = await page.evaluate(() => {
    const rail = document.getElementById("v9ProfilePassions");
    const barre = document.getElementById("v7ProfileTabs");
    if (!rail) return { rail: false };
    return {
      rail: true,
      // MÊME composant que le Fil : mêmes classes, donc mêmes dimensions.
      // ⚠️ Ce test a été retourné le 2026-09-02, puis REMIS DANS SON SENS
      // D'ORIGINE le soir même : « sur le profil remets les bulles rondes comme
      // avant, pas de rangée de passions ovale ». Ce qui a changé ce jour-là et
      // qui reste, c'est la LIGNE DE TITRES de la carte d'identité, retirée.
      memeComposant: rail.classList.contains("profile-strip")
        && rail.querySelectorAll(".profile-tile .profile-tile-avatar").length > 0,
      cles: Array.from(rail.querySelectorAll("[data-passion-tile]"))
        .map(t => t.getAttribute("data-passion-tile")),
      // ⚠️ LE RAIL EST UNE COMMANDE DE LECTURE, ET C'EST LE SEUL CAS DE CETTE
      // SUITE QUI PEUT LE DIRE INDÉPENDAMMENT DU DRAPEAU. `cles` passe désormais
      // par construction (la porte a quitté le rail le 2026-09-03) ; sans cette
      // ligne, remettre la bulle dans le rail ne ferait rougir personne ici.
      porteDansLeRail: rail.querySelectorAll('[data-passion-tile="__ajouter__"]').length,
      // Au-DESSUS des onglets : le rail précède la barre dans le document.
      avantLesOnglets: !!barre &&
        (rail.compareDocumentPosition(barre) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    };
  });
  expect(vu.rail, "le rail de passions doit exister sur le profil").toBe(true);
  expect(vu.memeComposant, "il réutilise le composant .profile-tile du Fil").toBe(true);
  // ⚠️ PLUS DE BULLE « Toutes » (demande de Benjamin, 2026-08-31). Le rail est
  // passé en MULTISÉLECTION comme celui du Fil : ne rien cocher DIT « toutes »,
  // donc la bulle offrait une seconde commande pour un état déjà atteignable.
  expect(vu.cles, "une bulle par passion, et rien d'autre")
    .toEqual(["pp_moto", "pp_pod", "pp_voy"]);
  expect(vu.porteDansLeRail,
    "aucune porte d'ACQUISITION dans une commande de lecture (2026-09-03)").toBe(0);
  expect(vu.avantLesOnglets, "le sélecteur se pose AU-DESSUS des onglets").toBe(true);
});

test("① bis bis — une bulle s'active au CLAVIER, comme le rôle qu'elle annonce", async ({ page }) => {
  // ⚠️ Ce test a révélé un défaut RÉEL le 2026-08-31 : Chromium active déjà un
  // `role="button"` au clavier, donc notre écouteur maison produisait un SECOND
  // clic. Une affectation encaissait la répétition sans broncher ; la bascule
  // de la multisélection, elle, s'annulait — la touche ne faisait plus rien.
  // Le compteur ci-dessous est la garantie : UNE touche, UN basculement.
  // ⚠️ Une bulle est un `<div role="button" tabindex="0">`. Annoncer le rôle de
  // bouton sans réagir à Entrée ni à Espace, c'est promettre une commande qu'un
  // lecteur d'écran énonce et que le clavier ne déclenche pas — pire que de ne
  // rien annoncer du tout.
  await poser(page);
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    window.__setCalls = 0;
    const orig = window.setProfilePassion;
    window.setProfilePassion = function () { window.__setCalls++; return orig.apply(this, arguments); };
    document.querySelector('#v9ProfilePassions [data-passion-tile="pp_pod"]').focus();
  });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.user.profilePassionIds),
    "Entrée coche la passion, comme un tap").toEqual(["pp_pod"]);
  expect(await page.evaluate(() => window.__setCalls),
    "UNE touche = UN basculement (le clic du navigateur ne doit pas s'ajouter au nôtre)").toBe(1);

  // ⚠️ La bulle « Toutes » a disparu : on re-teste donc Espace sur la MÊME
  // bulle, qui doit la DÉCOCHER — c'est le seul chemin de retour au neutre.
  await page.evaluate(() => {
    document.querySelector('#v9ProfilePassions [data-passion-tile="pp_pod"]').focus();
  });
  await page.keyboard.press(" ");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.user.profilePassionIds),
    "Espace aussi, et sans faire défiler la page").toEqual([]);
  expect(await page.evaluate(() => window.__setCalls),
    "deux touches = deux basculements, pas quatre").toBe(2);

  // Et le dédoublonnage ne doit PAS avaler un vrai clic de souris : il est borné
  // à la bulle qu'on vient d'activer au clavier.
  await page.evaluate(() => { window.__setCalls = 0; });
  await page.locator('#v9ProfilePassions [data-passion-tile="pp_moto"]').click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.user.profilePassionIds)).toEqual(["pp_moto"]);
  expect(await page.evaluate(() => window.__setCalls), "un tap reste un tap").toBe(1);
});

test("① bis — le profil n'a plus que deux onglets : Publications et Activité", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(600);
  const onglets = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#v7ProfileTabs [data-v7-tab]"))
      .map(b => ({ cle: b.getAttribute("data-v7-tab"), libelle: b.textContent.trim() })));
  expect(onglets.map(o => o.cle)).toEqual(["publications", "activites"]);
  expect(onglets.map(o => o.libelle)).toEqual(["Publications", "Activité"]);
});

// ⚠️ DÉFAUT VISUEL RÉEL, corrigé le 2026-08-31. La barre d'onglets du profil
// était une grille figée à TROIS colonnes, du temps où l'écran avait trois
// onglets. ADR-011 n'en a laissé que deux : ils occupaient les deux tiers
// gauches, avec une case vide à droite. Même famille côté Fil après le retrait
// de « Tous ». Aucun test ne l'attrapait — un onglet mal centré ne lève rien.
// On mesure donc la SYMÉTRIE, seule propriété qui distingue « centré » de
// « aligné à gauche avec un trou ».
test("① ter bis — les onglets du profil et les envies du Fil sont CENTRÉS", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(600);

  const onglets = await page.evaluate(() => {
    const bar = document.getElementById("v7ProfileTabs");
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    const b = Array.from(bar.querySelectorAll(".v7-tab")).map((x) => x.getBoundingClientRect());
    if (!b.length) return null;
    return { n: b.length,
             gauche: b[0].left - r.left,
             droite: r.right - b[b.length - 1].right };
  });
  expect(onglets, "la barre d'onglets doit exister").not.toBeNull();
  expect(onglets.n).toBe(2);
  // Tolérance de 2 px : une bordure ou un demi-pixel de sous-pixel ne fait pas
  // un décalage. Le défaut mesuré, lui, laissait un TIERS de la barre vide.
  expect(Math.abs(onglets.gauche - onglets.droite),
    `onglets décalés : ${Math.round(onglets.gauche)} px à gauche, ${Math.round(onglets.droite)} px à droite`)
    .toBeLessThanOrEqual(2);

  await page.evaluate(() => goTo("feed"));
  await page.waitForTimeout(600);
  const envies = await page.evaluate(() => {
    const sel = document.getElementById("feedIntentSelector");
    if (!sel || sel.hidden) return null;
    const b = Array.from(sel.querySelectorAll(".feed-intent-btn")).map((x) => x.getBoundingClientRect());
    if (!b.length) return null;
    const r = sel.getBoundingClientRect();
    return { n: b.length, gauche: b[0].left - r.left, droite: r.right - b[b.length - 1].right };
  });
  expect(envies, "le rail d'envies doit être visible").not.toBeNull();
  expect(envies.n, "quatre envies depuis le retrait de « Tous »").toBe(4);
  expect(Math.abs(envies.gauche - envies.droite),
    `envies décalées : ${Math.round(envies.gauche)} px à gauche, ${Math.round(envies.droite)} px à droite`)
    .toBeLessThanOrEqual(2);
});

test("① ter — choisir une passion filtre Publications ET Activité d'un seul geste", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(600);

  const avant = await page.evaluate(() => ({
    posts: document.getElementById("myPosts").innerText,
    events: document.getElementById("profileEvents").innerText,
  }));
  expect(avant.posts, "rien de coché = les deux publications").toContain("MES_MOTO");
  expect(avant.posts).toContain("MES_PODCAST");
  expect(avant.events).toContain("BALADE_MOTO");
  expect(avant.events).toContain("REC_PODCAST");

  // UN SEUL geste — la bulle « Moto » du rail.
  await page.evaluate(() => {
    document.querySelector('#v9ProfilePassions [data-passion-tile="pp_moto"]').click();
  });
  await page.waitForTimeout(500);

  const apres = await page.evaluate(() => ({
    posts: document.getElementById("myPosts").innerText,
    events: document.getElementById("profileEvents").innerText,
    postFilter: state.user.profilePostFilterId,
    eventFilter: state.user.profileEventFilterId,
  }));
  expect(apres.posts, "Publications ne montre que Moto").toContain("MES_MOTO");
  expect(apres.posts).not.toContain("MES_PODCAST");
  expect(apres.events, "Activité ne montre que Moto").toContain("BALADE_MOTO");
  expect(apres.events).not.toContain("REC_PODCAST");
  // ⚠️ Les deux clés historiques restent écrites, et ÉGALES : les laisser
  // diverger, c'est l'incohérence que ce rail supprime. Elles ne sont plus la
  // source de vérité (`profilePassionIds` l'est) mais restent un miroir pour un
  // appareil resté sur l'ancienne version.
  expect(apres.postFilter).toBe("pp_moto");
  expect(apres.eventFilter).toBe("pp_moto");
  expect(await page.evaluate(() => state.user.profilePassionIds)).toEqual(["pp_moto"]);

  // MULTISÉLECTION : cocher « Podcast » AJOUTE, il ne remplace pas — et les deux
  // onglets suivent ensemble.
  await page.evaluate(() => {
    document.querySelector('#v9ProfilePassions [data-passion-tile="pp_pod"]').click();
  });
  await page.waitForTimeout(500);
  const deux = await page.evaluate(() => ({
    posts: document.getElementById("myPosts").innerText,
    events: document.getElementById("profileEvents").innerText,
    ids: state.user.profilePassionIds,
    // Le miroir de compatibilité vaut « toutes » dès qu'il y en a plusieurs :
    // un ancien client ne saurait pas représenter deux passions.
    postFilter: state.user.profilePostFilterId,
  }));
  expect(deux.ids.slice().sort()).toEqual(["pp_moto", "pp_pod"]);
  expect(deux.posts).toContain("MES_MOTO");
  expect(deux.posts).toContain("MES_PODCAST");
  expect(deux.events).toContain("BALADE_MOTO");
  expect(deux.events).toContain("REC_PODCAST");
  expect(deux.postFilter).toBeFalsy();
});

test("① quater — un profil sans passion affiche un état propre, pas une rangée vide", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => {
    state.user.profiles = [];
    state.user.currentProfileId = null;
    state.user.profilePostFilterId = null;
    saveState();
    goTo("profiles");
  });
  await page.waitForTimeout(600);
  const vu = await page.evaluate(() => {
    const rail = document.getElementById("v9ProfilePassions");
    return { txt: rail ? rail.innerText : "", bulles: rail ? rail.querySelectorAll(".profile-tile").length : -1 };
  });
  expect(vu.bulles, "aucune bulle, mais pas une rangée muette").toBe(0);
  expect(vu.txt).toContain("Aucune passion");
  expect(vu.txt, "et une sortie explicite").toContain("Ajouter une passion");
});

test("① quinquies — une passion sans publication et sans activité le DIT", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => { goTo("profiles"); setProfilePassion("pp_voy"); });
  await page.waitForTimeout(600);
  const vu = await page.evaluate(() => ({
    posts: document.getElementById("myPosts").innerText,
    events: document.getElementById("profileEvents").innerText,
  }));
  // ⚠️ L'état vide doit nommer le FILTRE. Sans cela il affirme « tu n'as rien
  // publié » à quelqu'un qui a publié ailleurs.
  expect(vu.posts).toContain("Voyage");
  expect(vu.events).toContain("Voyage");
});

// ══════════════════════════════════════════════════════════════════════════
// ② IDENTITÉ — le pseudo du compte, ses passions dessous
// ══════════════════════════════════════════════════════════════════════════

test("② une publication Moto affiche Benjamin, et la seule passion du post", async ({ page }) => {
  // ⚠️ ASSERTION AMENDÉE LE 2026-09-02. §3 (identité centralisée) tient toujours,
  // mais la CARTE n'en est plus une surface : Benjamin y a fait retirer la ligne
  // d'identité, qui doublait la passion écrite juste dessous avec l'heure. Ce que
  // la refonte garantissait ici — l'auteur est le COMPTE, pas une persona par
  // passion — reste vérifié ; les trois passions du compte, elles, se vérifient
  // là où elles s'affichent désormais (les deux en-têtes de profil, testés par
  // profil-entete-passions.spec.js, et `identitePassionsTexte` ci-dessous).
  await poser(page);
  const vu = await page.evaluate(() => {
    // Publication de MOI, dans la passion Moto : l'auteur reste le compte.
    const mienne = renderPostHTML(Object.assign({}, state.userPosts[0], { _source: "me" }));
    const box = document.createElement("div");
    box.innerHTML = mienne;
    const meta = box.querySelector(".post-author-meta");
    return {
      nom: box.querySelector(".post-author-name").textContent.trim(),
      identite: box.querySelectorAll(".ident-passions").length,
      meta: meta ? meta.textContent.trim() : "",
      // L'identité complète reste calculable pour toutes les surfaces qui la rendent.
      texteIdentite: identitePassionsTexte(userById(MY_UID) || { passions: state.user.profiles }),
    };
  });
  expect(vu.nom, "l'auteur visible est le profil principal").toBe("Benjamin");
  expect(vu.identite, "la carte ne répète plus les passions du compte").toBe(0);
  expect(vu.meta, "elle nomme la passion DE LA PUBLICATION, avec l'heure").toContain("Moto");
  expect(vu.texteIdentite).toContain("Moto");
  expect(vu.texteIdentite).toContain("Podcast");
  expect(vu.texteIdentite).toContain("Voyage");
});

test("② bis — les passions ARCHIVÉES ne fuient pas dans l'identité affichée", async ({ page }) => {
  // ⚠️ DÉFAUT DÉJÀ FERMÉ UNE FOIS (porte dérobée ② du lot UI-8). Le jsonb
  // `profiles.passions` contient AUSSI les passions archivées — c'est voulu, la
  // colonne sert de sauvegarde relue au démarrage d'un appareil neuf. Les
  // afficher ferait réapparaître chez tout le monde ce qu'on a rangé.
  await poser(page);
  const txt = await page.evaluate(() => {
    state.seed.users.push({
      id: "u_range", name: "Rangé", profileEmoji: "📦", avatar: "#8b5cf6",
      passions: [{ id: "moto", emoji: "🏍" }, { id: "cuisine", emoji: "🍳", archived: true }],
    });
    return identitePassionsTexte(userById("u_range"));
  });
  expect(txt).toContain("Moto");
  expect(txt, "une passion archivée ne s'affiche chez personne").not.toContain("Cuisine");
});

test("② ter — l'identité est bornée et échappée (contenu d'un autre compte)", async ({ page }) => {
  await poser(page);
  const vu = await page.evaluate(() => {
    state.seed.users.push({
      id: "u_hostile", name: "Hostile", profileEmoji: "😈", avatar: "#8b5cf6",
      passions: [
        { id: "p1", label: "<img src=x onerror=alert(1)>", emoji: "🎸" },
        { id: "p2", label: "Deux", emoji: "🎹" },
        { id: "p3", label: "Trois", emoji: "🥁" },
        { id: "p4", label: "Quatre", emoji: "🎺" },
        { id: "p5", label: "Cinq", emoji: "🎷" },
      ],
    });
    const html = identitePassionsHTML(userById("u_hostile"));
    const box = document.createElement("div");
    box.innerHTML = html;
    return { html: html, images: box.querySelectorAll("img").length, texte: box.textContent };
  });
  expect(vu.images, "aucune balise ne doit naître du libellé d'autrui").toBe(0);
  // ⚠️ ASSERTION CORRIGÉE : `escapeHtml` neutralise les CHEVRONS, pas la chaîne
  // « onerror=alert », qui survit en texte inerte — l'exiger absente aurait fait
  // rougir un échappement pourtant correct. Ce qu'il faut prouver, c'est que le
  // `<` est devenu `&lt;` et qu'aucun élément n'est né du libellé (vu.images).
  expect(vu.html, "les chevrons sont neutralisés à la source").toContain("&lt;img");
  expect(vu.html, "et aucun n'a survécu tel quel").not.toContain("<img");
  // Borné à trois, puis « +N » : une identité longue pousserait hors de l'écran
  // l'action posée à côté d'elle.
  expect(vu.texte).toContain("+2");
});

// ══════════════════════════════════════════════════════════════════════════
// ③ ④ FIL — OU inclusif, une seule liste, dédupliquée
// ══════════════════════════════════════════════════════════════════════════

test("③ je suis Alice sans passion commune : TOUT son contenu est admissible", async ({ page }) => {
  await poser(page, { passions: [], suivis: true });
  const t = await filTexte(page);
  expect(t, "sa publication Cuisine").toContain("ALICE_CUISINE");
  expect(t, "et sa publication Jardinage, une autre passion encore").toContain("ALICE_JARDIN");
  expect(t, "un inconnu, lui, n'entre pas").not.toContain("MOTO_INCONNU");
});

test("④ Suivis + Moto + Voyage + une envie : tout arrive dans UNE liste", async ({ page }) => {
  await poser(page, { passions: ["moto", "voyage"], suivis: true, envies: ["create"] });

  // Prémisse contrôlée : sans le rail d'intentions, les envies ne sont pas
  // consultées et ce test mesurerait autre chose.
  expect(await page.evaluate(() => feedIntentsEnabled()),
    "les envies ne sont un critère que si le rail d'intentions est actif").toBe(true);

  const t = await filTexte(page);
  expect(t, "les comptes suivis, toutes passions confondues").toContain("ALICE_CUISINE");
  expect(t).toContain("ALICE_JARDIN");
  expect(t, "Moto, d'un compte non suivi").toContain("MOTO_INCONNU");
  expect(t, "Voyage, d'un compte non suivi").toContain("VOYAGE_INCONNU");
  expect(t, "l'envie « Idées », d'une passion non cochée").toContain("IDEE_TECH");

  // UNE seule liste : pas de section par source.
  const sections = await page.evaluate(() =>
    document.querySelectorAll("#feedList .feed-section, #feedList [data-feed-source]").length);
  expect(sections, "aucune section par passion, mood ou source").toBe(0);
});

test("④ bis — DÉDUPLICATION : trois critères satisfaits, une seule carte", async ({ page }) => {
  await poser(page, { passions: ["moto"], suivis: true, envies: ["create"] });
  const n = await page.evaluate(() =>
    document.querySelectorAll('#feedList [data-postid="p_triple"]').length);
  expect(n, "compte suivi ET passion cochée ET envie cochée = une carte").toBe(1);
});

test("④ ter — une envie se coche et se décoche sans toucher aux autres critères", async ({ page }) => {
  await poser(page, { passions: ["moto"], suivis: true, envies: [] });
  expect(await filTexte(page)).not.toContain("IDEE_TECH");

  await page.evaluate(() => setFeedIntent("create"));
  await page.waitForTimeout(400);
  let etat = await page.evaluate(() => ({
    envies: feedIntentsSelected(),
    suivis: state.feedFollowingOn,
    passions: Array.from(_activeFeedPassions),
  }));
  expect(etat.envies).toEqual(["create"]);
  expect(etat.suivis, "cocher une envie n'éteint pas « Suivis »").toBe(true);
  expect(etat.passions, "ni les passions").toEqual(["moto"]);
  expect(await filTexte(page)).toContain("IDEE_TECH");

  // Plusieurs envies à la fois.
  await page.evaluate(() => setFeedIntent("learn"));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => feedIntentsSelected().sort())).toEqual(["create", "learn"]);

  // « Tous » est le neutre : il remet à zéro les envies, et elles seules.
  await page.evaluate(() => setFeedIntent("for_you"));
  await page.waitForTimeout(300);
  etat = await page.evaluate(() => ({
    envies: feedIntentsSelected(),
    suivis: state.feedFollowingOn,
    passions: Array.from(_activeFeedPassions),
  }));
  expect(etat.envies).toEqual([]);
  expect(etat.suivis).toBe(true);
  expect(etat.passions).toEqual(["moto"]);
});

test("④ quater — le classement du fil est conservé (aucun tri inventé)", async ({ page }) => {
  await poser(page, { passions: ["moto", "voyage"], suivis: true, envies: ["create"] });
  const ordre = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll("#feedList [data-postid]"))
      .map(e => e.getAttribute("data-postid"));
    // Le moteur historique reste seul juge de l'ordre : on vérifie que la liste
    // rendue est exactement ce qu'il produit sur le même ensemble.
    const posts = allFeedPosts().filter(p => p.type !== "vlog");
    const attendu = rankFeedPostsForIntents(
      posts.filter(p => ids.indexOf(p.id) > -1), feedIntentsSelected()
    ).map(p => p.id);
    return { rendu: ids, attendu: attendu.slice(0, ids.length) };
  });
  expect(ordre.rendu).toEqual(ordre.attendu);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑤ STUDIO — le seul endroit où l'on choisit la passion de destination
// ══════════════════════════════════════════════════════════════════════════

test("⑤ le Studio propose les passions du compte et enregistre l'association", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => goTo("studio"));
  await page.waitForTimeout(500);

  const options = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#postPassion option")).map(o => o.value));
  expect(options.sort()).toEqual(["moto", "podcast", "voyage"]);

  // Choisir « Podcast » : l'association est retenue pour la prochaine création.
  await page.evaluate(() => {
    const s = document.getElementById("postPassion");
    s.value = "podcast";
    s.dispatchEvent(new Event("change"));
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.user.currentProfileId)).toBe("pp_pod");

  // Et cela ne touche AUCUNE préférence de lecture (écriture ≠ lecture).
  expect(await page.evaluate(() => Array.from(_activeFeedPassions))).toEqual(["moto"]);
});

test("⑤ bis — aucun sélecteur de passion hors du Studio", async ({ page }) => {
  await poser(page);
  const vu = await page.evaluate(() => {
    const res = {};
    // Le profil : plus de ligne « Passion active », plus de « Changer ».
    goTo("profiles");
    res.lignePassionActive = document.querySelectorAll("#v8ActivePassion").length;
    res.boutonChanger = document.querySelectorAll("[data-v8-changer]").length;
    res.rangeesPuces = document.querySelectorAll("#v8PostFilter, #v8EventFilter").length;
    res.switcher = (typeof window.openPassionSwitcher === "function");
    return res;
  });
  expect(vu.lignePassionActive, "« Passion active » est retirée du profil").toBe(0);
  expect(vu.boutonChanger).toBe(0);
  expect(vu.rangeesPuces, "les deux rangées de puces jumelles sont retirées").toBe(0);
  expect(vu.switcher, "le sélecteur d'identité n'existe plus").toBe(false);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑥ SUPPRESSIONS — plus visibles, plus atteignables
// ══════════════════════════════════════════════════════════════════════════

test("⑥ « À propos » n'est plus un onglet ni une section", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(600);
  const vu = await page.evaluate(() => ({
    onglet: document.querySelectorAll('[data-v7-tab="apropos"]').length,
    panneau: document.querySelectorAll('[data-v7-pan="apropos"]').length,
    // La liste des passions n'est plus une section de la page : elle vit dans
    // un panneau masqué, ouvert à la demande.
    managerCache: !!(document.getElementById("passionManager") || {}).hidden,
  }));
  expect(vu.onglet).toBe(0);
  expect(vu.panneau).toBe(0);
  expect(vu.managerCache, "la gestion des passions est repliée, pas dans le flux").toBe(true);
});

test("⑥ bis — la gestion des passions reste ATTEIGNABLE (retirer un onglet ne doit pas fermer une fonction)", async ({ page }) => {
  // ⚠️ Leçon du Studio après un carnet (2026-08-29) : retirer un chemin d'accès
  // peut supprimer le seul chemin de RETOUR. Ajouter, illustrer ou archiver une
  // passion doit rester possible après la disparition de l'onglet.
  await poser(page);
  await page.evaluate(() => { goTo("profiles"); openPassionManager(); });
  await page.waitForTimeout(500);
  // ⚠️ ON MESURE LA BOÎTE, PLUS L'EXISTENCE (2026-09-03). `#nouveauProfilLien`
  // est devenu du balisage STATIQUE : il existe même panneau replié, donc un
  // `!!getElementById(...)` était devenu vrai par construction — ce cas
  // prétendait prouver « la gestion reste ATTEIGNABLE » et ne prouvait plus rien.
  const vu = await page.evaluate(() => {
    const porte = document.getElementById("nouveauProfilLien");
    const r = porte ? porte.getBoundingClientRect() : null;
    return {
      ouvert: !document.getElementById("passionManager").hidden,
      cartes: document.querySelectorAll("#profileList .profile-card").length,
      ajouter: !!(r && r.width > 0 && r.height > 0),
    };
  });
  expect(vu.ouvert).toBe(true);
  expect(vu.cartes).toBe(3);
  expect(vu.ajouter, "la porte d'ajout est PEINTE, pas seulement présente").toBe(true);
});

test("⑥ ter — le Carnet de voyage a disparu : écran, navigation, route", async ({ page }) => {
  await poser(page);
  const vu = await page.evaluate(() => ({
    ecran: document.querySelectorAll("#screen-cdv").length,
    nav: document.querySelectorAll('#appNav .nav-item[data-screen="cdv"]').length,
    viewer: document.querySelectorAll("#vlogViewer").length,
    editeur: document.querySelectorAll("#cdvEditor").length,
    sousFiltre: document.querySelectorAll('.profile-tabs [data-tab="carnets"]').length,
    moteurs: ["renderCdvScreen", "openVlogViewer", "openCdvLiveViewer", "startCdvLive",
              "activateStudioVlog", "closeCarnetEditor", "openCdvPassport", "openSavedPlaces"]
              .filter(n => typeof window[n] === "function"),
  }));
  expect(vu.ecran).toBe(0);
  expect(vu.nav).toBe(0);
  expect(vu.viewer).toBe(0);
  expect(vu.editeur).toBe(0);
  expect(vu.sousFiltre).toBe(0);
  expect(vu.moteurs, "aucun moteur CDV ne survit").toEqual([]);
});

test("⑥ quater — un ancien lien #cdv ne laisse pas l'application sans écran", async ({ page }) => {
  // ⚠️ Même remède qu'ADR-009 pour `#wallet` : la route est REDIRIGÉE, pas
  // supprimée. Sans cela, aucun `#screen-cdv` ne peut recevoir la classe active
  // et l'utilisateur se retrouve devant un écran blanc.
  await poser(page);
  await page.evaluate(() => goTo("cdv"));
  await page.waitForTimeout(500);
  const vu = await page.evaluate(() => ({
    actif: (document.querySelector(".screen.active") || {}).id || "",
    combien: document.querySelectorAll(".screen.active").length,
  }));
  expect(vu.combien, "exactement un écran actif").toBe(1);
  expect(vu.actif).toBe("screen-feed");
});

test("⑥ quinquies — aucune donnée de carnet n'est détruite", async ({ page }) => {
  // La consigne l'exige : la fonctionnalité disparaît de l'application, les
  // données peuvent rester. On vérifie qu'aucun chemin ne les efface au boot.
  await poser(page);
  const restant = await page.evaluate(async () => {
    localStorage.setItem("passio_cdv_lives", JSON.stringify([{ id: "l1", destination: "Lisbonne" }]));
    location.reload();
    return true;
  });
  expect(restant).toBe(true);
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  const apres = await page.evaluate(() => localStorage.getItem("passio_cdv_lives"));
  expect(apres, "le contenu déjà écrit reste stocké").toContain("Lisbonne");
});
