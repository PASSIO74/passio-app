// LE CONTRAT DU FIL — sélection ADDITIVE (refonte multi-passion, §4).
//
// ⚠️ CETTE SUITE A ÉTÉ RÉÉCRITE, PAS ASSOUPLIE. Elle verrouillait le modèle
// d'ADR-010 : deux VUES EXCLUSIVES, « Accueil » (union passions + suivis) et
// « Suivis » (rien d'autre), où toucher une passion quittait « Suivis ». La
// refonte remplace cette exclusivité par un OU INCLUSIF : « Suivis » est un
// critère au même titre qu'une passion ou qu'une envie, et cocher l'un
// n'éteint jamais l'autre. Trois cas exigeaient littéralement l'inverse de ce
// contrat-ci (⑥, ⑥ ter, ⑥ quater) : ils sont réécrits sur la nouvelle règle.
//
// ⚠️ CE QUI NE BOUGE PAS, et qu'il ne faut pas affaiblir en passant :
//   · la PERSISTANCE du choix (⑦) — l'ancienne bascule `_showFollowingFeed`
//     n'était pas persistée, donc suivre quelqu'un n'avait aucun effet durable ;
//   · le garde de ⑥ quinquies — sans passion, la tuile « Suivis » doit survivre,
//     sinon un compte neuf qui suit déjà quelqu'un n'a plus aucune commande.
//
// Ce que cette suite prouve :
//   ① une passion cochée fait entrer son contenu ;
//   ② « Suivis » coché fait entrer un compte suivi, passion NON cochée ;
//   ③ une publication présente dans plusieurs sources n'apparaît qu'UNE fois ;
//   ④ sans passion cochée, les comptes suivis restent visibles ;
//   ⑤ sans aucun critère, un état vide EXPLICATIF apparaît ;
//   ⑥ « Suivis » seul ne montre QUE les comptes suivis ;
//   ⑥ ter la tuile bascule « Suivis » et le choix persiste ;
//   ⑥ quater cocher une passion N'ÉTEINT PAS « Suivis » (le cœur de §4) ;
//   ⑦ le choix survit à un rechargement ;
//   ⑧ se désabonner retire bien la source ;
//   ⑨ changer « Publier dans » ne touche pas « Passions à afficher » ;
//   ⑩ changer « Passions à afficher » ne touche pas « Publier dans » ;
//   ⑪ le profil d'autrui montre UNE identité et filtre ses publications par passion ;
//   ⑫ résultats vides et erreur Supabase ne cassent pas le fil.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Deux auteurs : « u_suivi » que je suis (passion cuisine), « u_inconnu » que je
// ne suis pas (passion musique). Ma passion choisie est « musique ».
async function poser(page, opts = {}) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((o) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = async () => {};

    state.seed.users = (state.seed.users || []).filter(u => u.id !== "u_suivi" && u.id !== "u_inconnu");
    // `passions` est posé ICI : en test le client Supabase est neutralisé, donc
    // `openUserProfile` ne fait aucun aller serveur et lit l'objet user du seed.
    state.seed.users.push({ id: "u_suivi", name: "Sacha", profileEmoji: "🍳", avatar: "#8b5cf6",
      passion: "cuisine",
      passions: [{ id: "cuisine", emoji: "🍳", label: "Cuisine" }, { id: "musique", emoji: "🎵", label: "Musique" }] });
    state.seed.users.push({ id: "u_inconnu", name: "Alex", profileEmoji: "🎸", avatar: "#8b5cf6" });

    const t = Date.now();
    state.seed.posts = [
      // Passion choisie, auteur non suivi → entre par la source « passions ».
      { id: "p_passion", authorId: "u_inconnu", userId: "u_inconnu", passion: "musique", type: "text", text: "POST_PASSION", mood: "all", createdAt: t - 1000, likes: 0, comments: [] },
      // Auteur suivi, passion NON choisie → entre par la source « suivis ».
      { id: "p_suivi", authorId: "u_suivi", userId: "u_suivi", passion: "cuisine", type: "text", text: "POST_SUIVI", mood: "all", createdAt: t - 2000, likes: 0, comments: [] },
      // Auteur suivi ET passion choisie → entre par les DEUX sources.
      { id: "p_double", authorId: "u_suivi", userId: "u_suivi", passion: "musique", type: "text", text: "POST_DOUBLE", mood: "all", createdAt: t - 3000, likes: 0, comments: [] },
    ];
    state.supabasePosts = [];
    // QUATRIÈME tableau : `window._feedExtraPosts` est fait pour SURVIVRE aux
    // écrasements de `supabasePosts` (il protège un post arrivé pendant qu'une
    // requête était en vol). Le vider n'est donc pas une redondance : sans cela,
    // une publication RÉELLE de production ramenée par un rafraîchissement
    // asynchrone se réinvite dans le fil APRÈS le semis, et le test mesure autre
    // chose que son fixture. Défaut mesuré le 2026-09-02 sur `main` (run 2409).
    window._feedExtraPosts = [];
    state.userPosts = [];
    state.user.following = o.following === undefined ? ["u_suivi"] : o.following;
    state.user.profiles = [{ id: "pp_0", name: "Audit QA", passion: "musique", emoji: "🎵", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    setFeedPassions(o.passions === undefined ? ["musique"] : o.passions);
    // « Suivis » est désormais un booléen persisté, pas une vue exclusive.
    state.feedFollowingOn = (o.suivis === undefined) ? true : !!o.suivis;
    if (typeof setFeedIntents === "function") setFeedIntents(o.envies || []);
    selectedMoods = new Set(["all", "creation", "learn", "chill", "actu"]);
    state.feedMoodsTouched = true;
    window._feedDomSig = null;
    goTo("feed");
    renderFeed();
  }, opts);
  await page.waitForTimeout(400);
}

const texte = (page) => page.evaluate(() => document.getElementById("feedList").innerText);

test("① une passion cochée fait entrer son contenu", async ({ page }) => {
  await poser(page);
  expect(await texte(page)).toContain("POST_PASSION");
});

test("② « Suivis » fait entrer un compte suivi même sans passion commune", async ({ page }) => {
  await poser(page);
  // LE test de ce lot : avant ADR-010, cette publication n'apparaissait qu'après
  // avoir activé une bascule qui repartait à zéro au rechargement suivant.
  expect(await texte(page)).toContain("POST_SUIVI");
});

test("③ une publication de plusieurs sources n'apparaît qu'une fois", async ({ page }) => {
  await poser(page);
  const n = await page.evaluate(() =>
    document.querySelectorAll('#feedList [data-postid="p_double"]').length);
  expect(n).toBe(1);
});

test("④ sans passion cochée, les comptes suivis restent visibles", async ({ page }) => {
  await poser(page, { passions: [] });
  const t = await texte(page);
  expect(t).toContain("POST_SUIVI");
  expect(t).toContain("POST_DOUBLE");
  // Et le contenu d'un inconnu dans une passion non choisie n'entre pas.
  expect(t).not.toContain("POST_PASSION");
});

test("⑤ sans aucun critère : un état vide explicatif", async ({ page }) => {
  await poser(page, { passions: [], following: [], suivis: false });
  const vide = await page.evaluate(() => {
    const e = document.getElementById("feedEmpty");
    return { visible: e && e.style.display !== "none",
             titre: e && e.querySelector(".empty-title").textContent,
             texte: e && e.querySelector(".empty-text").textContent };
  });
  expect(vide.visible).toBe(true);
  expect(vide.titre).toBe("Choisis tes passions");
  // « Utile » = il nomme les DEUX sources, donc les deux sorties possibles.
  expect(vide.texte).toContain("passions que tu choisis");
  expect(vide.texte).toContain("personnes que tu suis");
});

test("⑥ « Suivis » SEUL ne montre que les comptes suivis", async ({ page }) => {
  // « Suivis » coché, aucune passion, aucune envie : la sélection ne porte
  // qu'un critère, donc le fil n'a qu'une source.
  await poser(page, { suivis: true, passions: [] });
  const t = await texte(page);
  expect(t).toContain("POST_SUIVI");
  expect(t).toContain("POST_DOUBLE");
  expect(t).not.toContain("POST_PASSION");
  const rail = await page.evaluate(() => ({
    visible: !document.getElementById("feedPassionsBlock").hidden,
    suivisActif: !!document.querySelector("#profileStrip .profile-tile.active[title='Suivis']"),
    passionsActives: document.querySelectorAll("#profileStrip .profile-tile.active:not([title='Suivis'])").length,
  }));
  expect(rail.visible, "le rail porte la commande de retour : le masquer enfermerait").toBe(true);
  expect(rail.suivisActif, "la tuile « Suivis » montre le critère coché").toBe(true);
  expect(rail.passionsActives, "aucune passion cochée dans ce scénario").toBe(0);
});

test("⑥ ter — la tuile « Suivis » est une bascule, et son état persiste", async ({ page }) => {
  // ⚠️ LA GARANTIE QUI COMPTE EST LA PERSISTANCE, et elle ne change pas avec le
  // modèle. L'ancienne tuile de `main` inversait `_showFollowingFeed`, une
  // variable de session : elle repartait à faux à chaque ouverture, donc suivre
  // quelqu'un n'avait aucun effet durable. Ce qui change : la bascule ne quitte
  // plus une « vue », elle décoche un CRITÈRE parmi d'autres.
  await poser(page, { suivis: true, passions: [] });
  const clicSuivis = () => page.evaluate(() => {
    document.querySelector("#profileStrip .profile-tile[title='Suivis']").click();
  });

  expect(await texte(page)).toContain("POST_SUIVI");

  // Décoché : plus aucun critère → l'état vide explicatif, pas le fil entier.
  await clicSuivis();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.feedFollowingOn)).toBe(false);
  expect(await texte(page)).not.toContain("POST_SUIVI");

  // Re-coché : la source revient.
  await clicSuivis();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.feedFollowingOn)).toBe(true);
  expect(await texte(page)).toContain("POST_SUIVI");

  // Et le choix survit au rechargement — ce que l'ancienne bascule ne faisait pas.
  await clicSuivis();
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => state.feedFollowingOn)).toBe(false);
});

test("⑥ quater — cocher une passion N'ÉTEINT PAS « Suivis » (le cœur de §4)", async ({ page }) => {
  // ⚠️ CE TEST EXIGE MAINTENANT L'INVERSE DE CE QU'IL EXIGEAIT SOUS ADR-010, et
  // c'est le changement de contrat lui-même. Auparavant, toucher une passion
  // ramenait en vue « accueil » parce que le moteur ignorait les passions tant
  // que « Suivis » était allumé — un tap y aurait été un clic mort. Le moteur
  // fait désormais l'UNION : les deux critères tiennent ensemble.
  await poser(page, { suivis: true, passions: [] });
  expect(await texte(page)).not.toContain("POST_PASSION");

  await page.evaluate(() => toggleProfileFilter("musique"));
  await page.waitForTimeout(400);

  expect(await page.evaluate(() => state.feedFollowingOn),
    "« Suivis » reste coché : les critères sont additifs").toBe(true);
  const t = await texte(page);
  expect(t, "la passion cochée entre").toContain("POST_PASSION");
  expect(t, "et le compte suivi reste, sans passion commune").toContain("POST_SUIVI");

  // Les deux tuiles s'affichent actives EN MÊME TEMPS : un rail qui n'en
  // montrerait qu'une mentirait sur ce que le fil contient.
  const actives = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#profileStrip .profile-tile.active"))
      .map(t => t.getAttribute("data-passion-tile")).sort());
  expect(actives).toEqual(["__suivis__", "musique"]);
});

test("⑥ bis — « Suivis » sans aucun abonnement : message dédié, pas de contenu d'inconnus", async ({ page }) => {
  await poser(page, { suivis: true, passions: [], following: [] });
  const vide = await page.evaluate(() => {
    const e = document.getElementById("feedEmpty");
    return { visible: e && e.style.display !== "none", titre: e && e.querySelector(".empty-title").textContent };
  });
  expect(vide.visible).toBe(true);
  expect(vide.titre).toBe("Tu ne suis encore personne");
  expect(await texte(page)).not.toContain("POST_PASSION");
});

test("⑥ quinquies — sans aucune passion, « Suivis » reste atteignable", async ({ page }) => {
  // ⚠️ DÉFAUT RÉEL, présent aussi sur `main`. `renderProfileStrip` sortait tôt
  // (`box.innerHTML = ""`) dès qu'aucune passion n'était résoluble — et depuis
  // que « Suivis » vit dans ce rail, ce retour emportait la seule commande
  // permettant de voir les comptes suivis. Un compte NEUF qui suit déjà
  // quelqu'un n'avait donc aucune porte vers leurs publications ; et comme la
  // vue est persistée, il ne pouvait pas non plus en sortir une fois dedans.
  await poser(page, { suivis: true, passions: [] });
  await page.evaluate(() => {
    state.user.profiles = [];
    state.user.currentProfileId = null;
    setFeedPassions([]);
    window._feedDomSig = null;
    renderProfileStrip();
    renderFeed();
  });
  await page.waitForTimeout(400);

  const vu = await page.evaluate(() => ({
    tuile: !!document.querySelector("#profileStrip .profile-tile[title='Suivis']"),
    passions: document.querySelectorAll("#profileStrip .profile-tile:not([title='Suivis'])").length,
  }));
  expect(vu.tuile, "la seule porte vers les comptes suivis doit survivre").toBe(true);
  expect(vu.passions, "et rien d'autre : le compte n'a aucune passion").toBe(0);

  // Et elle FONCTIONNE : ce n'est pas une tuile décorative.
  // Elle est déjà cochée dans ce scénario : on la décoche puis on la recoche,
  // ce qui prouve que le geste agit dans les DEUX sens.
  const clic = () => page.evaluate(() => {
    document.querySelector("#profileStrip .profile-tile[title='Suivis']").click();
  });
  await clic();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.feedFollowingOn)).toBe(false);
  await clic();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => state.feedFollowingOn)).toBe(true);
  expect(await texte(page)).toContain("POST_SUIVI");
});

test("⑦ le choix survit à un rechargement", async ({ page }) => {
  await poser(page, { suivis: true });
  await page.evaluate(() => setFeedFollowing(false));
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  // C'est exactement ce que l'ancienne bascule ne faisait pas.
  expect(await page.evaluate(() => state.feedFollowingOn)).toBe(false);
});

test("⑧ se désabonner retire la source correspondante", async ({ page }) => {
  await poser(page);
  expect(await texte(page)).toContain("POST_SUIVI");
  await page.evaluate(() => {
    state.user.following = [];
    saveState();
    window._feedDomSig = null;
    renderFeed();
  });
  await page.waitForTimeout(300);
  const t = await texte(page);
  expect(t).not.toContain("POST_SUIVI");
  // La passion choisie, elle, continue de fournir du contenu.
  expect(t).toContain("POST_PASSION");
});

test("⑨ changer « Publier dans » ne modifie pas « Passions à afficher »", async ({ page }) => {
  await poser(page);
  const avant = await page.evaluate(() => Array.from(_activeFeedPassions).sort());
  await page.evaluate(() => {
    state.user.profiles.push({ id: "pp_1", name: "Audit QA", passion: "cuisine", emoji: "🍳", color: "#7c3aed" });
    switchToProfile("pp_1");
  });
  await page.waitForTimeout(300);
  const apres = await page.evaluate(() => ({
    lecture: Array.from(_activeFeedPassions).sort(),
    ecriture: state.user.currentProfileId,
  }));
  expect(apres.ecriture).toBe("pp_1");
  expect(apres.lecture).toEqual(avant);  // la lecture n'a pas bougé
});

test("⑩ changer « Passions à afficher » ne modifie pas « Publier dans »", async ({ page }) => {
  await poser(page);
  const avant = await page.evaluate(() => state.user.currentProfileId);
  await page.evaluate(() => toggleProfileFilter("cuisine"));
  await page.waitForTimeout(300);
  const apres = await page.evaluate(() => ({
    ecriture: state.user.currentProfileId,
    lecture: Array.from(_activeFeedPassions).sort(),
  }));
  expect(apres.ecriture).toBe(avant);          // l'écriture n'a pas bougé
  expect(apres.lecture).toContain("cuisine");  // la lecture, oui
});

test("⑪ le profil d'autrui : une identité, et des filtres de passion", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => openUserProfile("u_suivi"));
  await page.waitForTimeout(1200);
  const vu = await page.evaluate(() => {
    const c = document.getElementById("modalContent");
    return {
      html: c ? c.innerText : "",
      // Une seule identité : un seul pseudo en tête, pas une carte par passion.
      // ⚠️ On lit `.profile-tile-label`, pas le `textContent` de la bulle : la
      // bulle porte l'emoji DEUX fois (le contenu de l'avatar et le glyphe
      // compact `.profile-tile-glyph`, masqué en CSS). Mesurer le tout rendrait
      // « ✨✨Toutes » — une prémisse fausse, pas un défaut de rendu.
      filtres: Array.from(document.querySelectorAll("#visitedPassions [data-passion-tile]"))
        .map(b => ({ id: b.getAttribute("data-passion-tile"),
                     texte: (b.querySelector(".profile-tile-label") || {}).textContent.trim(),
                     actif: b.classList.contains("active") })),
      cartesIdentite: document.querySelectorAll("#visitedPassions .profile-card").length,
    };
  });
  expect(vu.html).not.toContain("profils passion");
  // Aucune carte d'identité : ce sont les MÊMES bulles que le Fil.
  expect(vu.cartesIdentite).toBe(0);
  // ⚠️ PLUS DE BULLE « Toutes » (2026-08-31) : le profil visité suit la même
  // règle que le mien et que le Fil — multisélection, et rien de coché DIT
  // « toutes ». Une bulle par passion, aucune active au départ.
  expect(vu.filtres.map(f => f.id)).toEqual(["cuisine", "musique"]);
  expect(vu.filtres.filter(f => f.actif)).toEqual([]);

  // MULTISÉLECTION : cocher une passion n'éteint pas les autres, et une seconde
  // s'AJOUTE. C'est l'inversion demandée — le choix unique d'ADR-010 rendait ce
  // rail incohérent avec celui du Fil, qui montre pourtant le même composant.
  await page.evaluate(() => setVisitedPassion("cuisine"));
  await page.waitForTimeout(300);
  let apres = await page.evaluate(() => ({
    actifs: Array.from(document.querySelectorAll("#visitedPassions [data-passion-tile].active")).map(b => b.getAttribute("data-passion-tile")),
    sel: Array.from(window._visited.passionSel),
  }));
  expect(apres.actifs).toEqual(["cuisine"]);
  expect(apres.sel).toEqual(["cuisine"]);

  await page.evaluate(() => setVisitedPassion("musique"));
  await page.waitForTimeout(300);
  apres = await page.evaluate(() => ({
    actifs: Array.from(document.querySelectorAll("#visitedPassions [data-passion-tile].active")).map(b => b.getAttribute("data-passion-tile")),
    sel: Array.from(window._visited.passionSel),
  }));
  expect(apres.actifs.slice().sort()).toEqual(["cuisine", "musique"]);
  expect(apres.sel.slice().sort()).toEqual(["cuisine", "musique"]);

  // Et retoucher une passion cochée la retire SEULE : `toggleVisitedPassion`
  // passait autrefois « » — donc « tout décocher » — ce qui en multisélection
  // aurait effacé la sélection entière.
  await page.evaluate(() => toggleVisitedPassion("cuisine"));
  await page.waitForTimeout(300);
  apres = await page.evaluate(() => Array.from(window._visited.passionSel));
  expect(apres).toEqual(["musique"]);
});

test("⑫ résultat vide et erreur Supabase ne cassent pas le fil", async ({ page }) => {
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  await poser(page);
  await page.evaluate(async () => {
    // Erreur serveur : le fil doit survivre et rester rendu depuis le local.
    window.supaLoadPosts = async () => { throw new Error("panne simulee"); };
    try { await supaLoadPosts(); } catch (e) {}
    window._feedDomSig = null;
    renderFeed();
  });
  await page.waitForTimeout(400);
  expect(await texte(page)).toContain("POST_PASSION");

  // Aucune source : état vide propre, sans exception.
  await page.evaluate(() => {
    state.seed.posts = []; state.supabasePosts = []; state.userPosts = [];
    // QUATRIÈME tableau : `window._feedExtraPosts` est fait pour SURVIVRE aux
    // écrasements de `supabasePosts` (il protège un post arrivé pendant qu'une
    // requête était en vol). Le vider n'est donc pas une redondance : sans cela,
    // une publication RÉELLE de production ramenée par un rafraîchissement
    // asynchrone se réinvite dans le fil APRÈS le semis, et le test mesure autre
    // chose que son fixture. Défaut mesuré le 2026-09-02 sur `main` (run 2409).
    window._feedExtraPosts = [];
    window._feedDomSig = null;
    renderFeed();
  });
  await page.waitForTimeout(300);
  const etat = await page.evaluate(() => {
    const e = document.getElementById("feedEmpty");
    const l = document.getElementById("feedList");
    return {
      videVisible: !!(e && e.style.display !== "none"),
      cartes: l ? l.querySelectorAll("[data-postid]").length : -1,
      quelqueChose: !!(l && l.innerText.trim().length > 0) || !!(e && e.style.display !== "none"),
    };
  });
  // Aucune carte périmée ne survit à la disparition de sa source.
  expect(etat.cartes).toBe(0);
  // Et l'écran dit quelque chose — état vide OU repli d'exploration, les deux
  // sont des réponses saines ; ce test ne tranche pas laquelle.
  expect(etat.quelqueChose).toBe(true);
  expect(erreurs).toEqual([]);
});

// ══════════════════════════════════════════════════════════════════════════
// LE RAIL DE PASSIONS DU FIL EST COULISSANT (2026-09-02)
// ──────────────────────────────────────────────────────────────────────────
// Défaut vécu par Benjamin avec dix passions : « l'affichage des bulles sur le
// fil en haut ça chevauche les unes derrière les autres et on ne voit plus
// écrit les noms ». `.profile-tile` portait `flex: 1 1 0` — les bulles se
// partageaient la largeur du rail, donc à onze (dix passions + « Suivis »)
// chacune tombait sous 26 px : la vignette de 34 px débordait de sa case et le
// libellé était rogné jusqu'à l'invisible. Réponse : « met plutôt un système
// coulissant, je switch gauche ou droite pour faire défiler les passions ».
//
// ⚠️ CE PALIER-CI EST DISTINCT DE CELUI DU PROFIL. Le Fil est habillé par le
// lot UI-7 (`:root.passio-ui-7 #screen-feed .profile-tile`), qui redéfinit ses
// dimensions et gagne par spécificité : `profil-entete-passions.spec.js` ne
// couvre donc PAS cette règle-là. Oublier ce test remettrait le défaut en
// production sur la seule surface où il a été vu.
// ══════════════════════════════════════════════════════════════════════════
// ⚠️ LE RAIL SE CONSTRUIT DEPUIS `state.user.profiles`, PAS depuis les passions
// COCHÉES. Le `poser` de cette suite ne pose qu'UN profil (« musique ») : lui
// passer dix passions à afficher n'aurait rendu que deux bulles (elle + « Suivis »),
// et la mesure aurait été verte sans jamais reproduire le cas de Benjamin.
// ⚠️ DES IDENTIFIANTS QUI EXISTENT VRAIMENT AU CATALOGUE (`PASSIONS`, app-01).
// « lecture » et « peinture » n'y sont pas : `passionById` retombe alors sur
// `{ emoji: "✨", label: "Passion" }` et deux bulles s'appelaient « Passion »
// — un fixture qui ne dit pas ce qu'il croit dire.
const DIX = ["musique", "cuisine", "moto", "voyage", "photo",
             "litterature", "sport", "jardinage", "danse", "podcast"];
async function poserDixPassions(page) {
  await poser(page, { passions: DIX });
  await page.evaluate((noms) => {
    state.user.profiles = noms.map((p, i) => ({
      id: "pp_" + i, name: "Audit QA", passion: p, emoji: "🎵", color: "#7c3aed", createdAt: i + 1,
    }));
    state.user.currentProfileId = "pp_0";
    window._feedDomSig = null;
    renderFeed();
  }, DIX);
  await page.waitForTimeout(300);
}

test("⑬ dix passions : le rail du fil coulisse, les bulles ne se chevauchent plus", async ({ page }) => {
  await poserDixPassions(page);
  const vu = await page.evaluate(() => {
    const rail = document.getElementById("profileStrip");
    const tuiles = [...rail.querySelectorAll(".profile-tile")];
    const rects = tuiles.map((t) => t.getBoundingClientRect());
    let chevauche = false;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) chevauche = true;
      }
    }
    return {
      nb: rects.length,
      chevauche,
      // ⚠️ `offsetTop`, PAS `rect.top` : une bulle cochée porte
      // `transform: translateY(-2px)`, que le rectangle inclut — une sélection
      // MIXTE compterait deux « lignes » là où il n'y en a qu'une.
      lignes: new Set(tuiles.map((t) => t.offsetTop)).size,
      largeurMin: Math.min(...rects.map((r) => r.width)),
      largeurMax: Math.max(...rects.map((r) => r.width)),
      // La vignette doit tenir DANS sa bulle : c'est ce débordement-là qui
      // faisait se recouvrir les ronds, avant même que les cases se touchent.
      vignetteDeborde: tuiles.some((t) => {
        const a = t.querySelector(".profile-tile-avatar");
        return a && a.getBoundingClientRect().width > t.getBoundingClientRect().width + 1;
      }),
      // ⚠️ PAS DE SEUIL EN PIXELS SUR LE LIBELLÉ : il dépend des métriques de
      // police et bascule entre le CI et un poste local. Ce qui prouve la
      // lisibilité, c'est la LARGEUR DE LA BULLE, mesurée juste au-dessus ; ici
      // on vérifie que chaque bulle nomme bien sa passion — ce qui attrape au
      // passage un identifiant de fixture absent du catalogue.
      libelles: tuiles.map((t) => {
        const l = t.querySelector(".profile-tile-label");
        return l ? l.textContent.trim() : null;
      }),
      coulisse: rail.scrollWidth > rail.clientWidth + 1,
    };
  });
  expect(vu.nb, "dix passions plus la bulle « Suivis »").toBe(11);
  expect(vu.chevauche, "AUCUNE bulle n'en recouvre une autre").toBe(false);
  expect(vu.vignetteDeborde, "aucune vignette ne déborde de sa bulle").toBe(false);
  expect(vu.lignes, "une seule rangée").toBe(1);
  expect(vu.largeurMin, "une bulle garde la largeur de son libellé").toBeGreaterThanOrEqual(50);
  expect(vu.largeurMax - vu.largeurMin, "toutes les bulles ont la MÊME largeur").toBeLessThanOrEqual(1);
  expect(vu.libelles, "chaque bulle nomme sa passion").toEqual(
    ["Suivis", "Musique", "Cuisine", "Moto", "Voyage", "Photo",
     "Littérature", "Sport", "Jardinage", "Danse", "Podcast"]);
  expect(vu.coulisse, "la rangée déborde du rail : on la fait défiler gauche/droite").toBe(true);
});

// Le geste, et sa conséquence la moins évidente : cocher une passion reconstruit
// le rail, donc `innerHTML` renverrait la rangée tout à gauche — et ferait
// sortir de l'écran la bulle qu'on vient de toucher. `ecrireRailCoulissant`
// (app-02) repose la position ; sans elle le rail « saute » à chaque tap.
test("⑬ bis — le défilement du rail survit au cochage d'une passion", async ({ page }) => {
  await poserDixPassions(page);
  const vu = await page.evaluate(() => {
    const rail = document.getElementById("profileStrip");
    rail.scrollLeft = 150;
    const avant = Math.round(rail.scrollLeft);
    // Une passion atteignable seulement après avoir fait défiler.
    const htmlAvant = rail.innerHTML;
    toggleProfileFilter("podcast");
    return {
      avant,
      apres: Math.round(rail.scrollLeft),
      // Sans reconstruction, la position se conserverait toute seule et le test
      // serait vert sans rien prouver.
      reconstruit: rail.innerHTML !== htmlAvant,
    };
  });
  expect(vu.avant, "le rail accepte réellement un défilement horizontal").toBeGreaterThan(0);
  expect(vu.reconstruit, "cocher une passion RECONSTRUIT bien le rail").toBe(true);
  expect(vu.apres, "et il ne repart pas tout à gauche quand on coche").toBe(vu.avant);
});
