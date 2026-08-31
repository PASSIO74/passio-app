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
      memeComposant: rail.classList.contains("profile-strip")
        && rail.querySelectorAll(".profile-tile .profile-tile-avatar").length > 0,
      cles: Array.from(rail.querySelectorAll("[data-passion-tile]"))
        .map(t => t.getAttribute("data-passion-tile")),
      // Au-DESSUS des onglets : le rail précède la barre dans le document.
      avantLesOnglets: !!barre &&
        (rail.compareDocumentPosition(barre) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    };
  });
  expect(vu.rail, "le rail de passions doit exister sur le profil").toBe(true);
  expect(vu.memeComposant, "il réutilise le composant .profile-tile du Fil").toBe(true);
  expect(vu.cles, "« Toutes » en tête, puis une bulle par passion")
    .toEqual(["", "pp_moto", "pp_pod", "pp_voy"]);
  expect(vu.avantLesOnglets, "le sélecteur se pose AU-DESSUS des onglets").toBe(true);
});

test("① bis bis — une bulle s'active au CLAVIER, comme le rôle qu'elle annonce", async ({ page }) => {
  // ⚠️ Une bulle est un `<div role="button" tabindex="0">`. Annoncer le rôle de
  // bouton sans réagir à Entrée ni à Espace, c'est promettre une commande qu'un
  // lecteur d'écran énonce et que le clavier ne déclenche pas — pire que de ne
  // rien annoncer du tout.
  await poser(page);
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    document.querySelector('#v9ProfilePassions [data-passion-tile="pp_pod"]').focus();
  });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.user.profilePostFilterId),
    "Entrée pose le filtre, comme un tap").toBe("pp_pod");

  await page.evaluate(() => {
    document.querySelector('#v9ProfilePassions [data-passion-tile=""]').focus();
  });
  await page.keyboard.press(" ");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.user.profilePostFilterId),
    "Espace aussi, et sans faire défiler la page").toBeFalsy();
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

test("① ter — choisir une passion filtre Publications ET Activité d'un seul geste", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(600);

  const avant = await page.evaluate(() => ({
    posts: document.getElementById("myPosts").innerText,
    events: document.getElementById("profileEvents").innerText,
  }));
  expect(avant.posts, "« Toutes » : les deux publications").toContain("MES_MOTO");
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
  // diverger, c'est l'incohérence que ce rail supprime.
  expect(apres.postFilter).toBe("pp_moto");
  expect(apres.eventFilter).toBe("pp_moto");
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

test("② une publication Moto affiche Benjamin, avec toutes ses passions", async ({ page }) => {
  await poser(page);
  const vu = await page.evaluate(() => {
    const carte = document.querySelector('#feedList [data-postid="me_moto"]')
      || document.querySelector("#feedList .post");
    // Publication de MOI, dans la passion Moto : l'auteur reste le compte.
    const mienne = renderPostHTML(Object.assign({}, state.userPosts[0], { _source: "me" }));
    const box = document.createElement("div");
    box.innerHTML = mienne;
    return {
      nom: box.querySelector(".post-author-name").textContent.trim(),
      passions: box.querySelector(".ident-passions") ? box.querySelector(".ident-passions").textContent.trim() : "",
    };
  });
  expect(vu.nom, "l'auteur visible est le profil principal").toBe("Benjamin");
  // Les trois passions du compte, pas seulement celle de la publication.
  expect(vu.passions).toContain("Moto");
  expect(vu.passions).toContain("Podcast");
  expect(vu.passions).toContain("Voyage");
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
  const vu = await page.evaluate(() => ({
    ouvert: !document.getElementById("passionManager").hidden,
    cartes: document.querySelectorAll("#profileList .profile-card").length,
    ajouter: !!document.getElementById("nouveauProfilLien"),
  }));
  expect(vu.ouvert).toBe(true);
  expect(vu.cartes).toBe(3);
  expect(vu.ajouter).toBe(true);
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
