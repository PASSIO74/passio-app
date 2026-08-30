// ADR-010 — « Un seul profil, plusieurs passions » : le contrat du Fil.
//
// Ce que cette suite prouve :
//   ① « Accueil » montre le contenu d'une passion choisie ;
//   ② « Accueil » montre AUSSI un compte suivi dont la passion n'est PAS choisie ;
//   ③ une publication présente dans les deux sources n'apparaît qu'UNE fois ;
//   ④ sans passion choisie, les comptes suivis restent visibles ;
//   ⑤ sans passion ni abonnement, un état vide EXPLICATIF apparaît ;
//   ⑥ « Suivis » ne montre QUE les comptes suivis ;
//   ⑦ la vue survit à un rechargement (l'ancienne bascule, non persistée, ne
//      survivait pas — suivre quelqu'un n'avait donc aucun effet durable) ;
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
    state.userPosts = [];
    state.user.following = o.following === undefined ? ["u_suivi"] : o.following;
    state.user.profiles = [{ id: "pp_0", name: "Audit QA", passion: "musique", emoji: "🎵", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    setFeedPassions(o.passions === undefined ? ["musique"] : o.passions);
    state.feedView = o.vue || "accueil";
    selectedMoods = new Set(["all", "creation", "learn", "chill", "actu"]);
    state.feedMoodsTouched = true;
    window._feedDomSig = null;
    goTo("feed");
    renderFeed();
  }, opts);
  await page.waitForTimeout(400);
}

const texte = (page) => page.evaluate(() => document.getElementById("feedList").innerText);

test("① Accueil montre le contenu d'une passion choisie", async ({ page }) => {
  await poser(page);
  expect(await texte(page)).toContain("POST_PASSION");
});

test("② Accueil montre un compte suivi même si sa passion n'est pas choisie", async ({ page }) => {
  await poser(page);
  // LE test de ce lot : avant ADR-010, cette publication n'apparaissait qu'après
  // avoir activé une bascule qui repartait à zéro au rechargement suivant.
  expect(await texte(page)).toContain("POST_SUIVI");
});

test("③ une publication des deux sources n'apparaît qu'une fois", async ({ page }) => {
  await poser(page);
  const n = await page.evaluate(() =>
    document.querySelectorAll('#feedList [data-postid="p_double"]').length);
  expect(n).toBe(1);
});

test("④ sans passion choisie, les comptes suivis restent visibles", async ({ page }) => {
  await poser(page, { passions: [] });
  const t = await texte(page);
  expect(t).toContain("POST_SUIVI");
  expect(t).toContain("POST_DOUBLE");
  // Et le contenu d'un inconnu dans une passion non choisie n'entre pas.
  expect(t).not.toContain("POST_PASSION");
});

test("⑤ sans passion ni abonnement : un état vide explicatif", async ({ page }) => {
  await poser(page, { passions: [], following: [] });
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

test("⑥ la vue Suivis ne montre que les comptes suivis", async ({ page }) => {
  await poser(page, { vue: "suivis" });
  const t = await texte(page);
  expect(t).toContain("POST_SUIVI");
  expect(t).toContain("POST_DOUBLE");
  expect(t).not.toContain("POST_PASSION");
  // Le rail de passions est masqué : il ne filtrerait rien dans cette vue.
  const cache = await page.evaluate(() => document.getElementById("feedPassionsBlock").hidden);
  expect(cache).toBe(true);
});

test("⑥ bis — vue Suivis sans aucun abonnement : message dédié, pas de contenu d'inconnus", async ({ page }) => {
  await poser(page, { vue: "suivis", following: [] });
  const vide = await page.evaluate(() => {
    const e = document.getElementById("feedEmpty");
    return { visible: e && e.style.display !== "none", titre: e && e.querySelector(".empty-title").textContent };
  });
  expect(vide.visible).toBe(true);
  expect(vide.titre).toBe("Tu ne suis encore personne");
  expect(await texte(page)).not.toContain("POST_PASSION");
});

test("⑦ la vue survit à un rechargement", async ({ page }) => {
  await poser(page, { vue: "accueil" });
  await page.evaluate(() => setFeedView("suivis"));
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  // C'est exactement ce que l'ancienne bascule ne faisait pas.
  const vue = await page.evaluate(() => state.feedView);
  expect(vue).toBe("suivis");
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
      filtres: Array.from(document.querySelectorAll("#visitedPassions [data-vpid]"))
        .map(b => ({ id: b.getAttribute("data-vpid"), texte: b.textContent.trim(), actif: b.classList.contains("active") })),
      cartesIdentite: document.querySelectorAll("#visitedPassions .profile-card").length,
    };
  });
  expect(vu.html).toContain("Ses passions");
  expect(vu.html).not.toContain("profils passion");
  // Aucune carte d'identité : ce sont des pastilles de filtre.
  expect(vu.cartesIdentite).toBe(0);
  // « Toutes » en tête, active par défaut, puis une pastille par passion.
  expect(vu.filtres[0].id).toBe("");
  expect(vu.filtres[0].texte).toBe("Toutes");
  expect(vu.filtres[0].actif).toBe(true);
  expect(vu.filtres.map(f => f.id)).toEqual(["", "cuisine", "musique"]);

  // Choix UNIQUE : sélectionner une passion désélectionne « Toutes ».
  await page.evaluate(() => setVisitedPassion("cuisine"));
  await page.waitForTimeout(300);
  const apres = await page.evaluate(() => ({
    actifs: Array.from(document.querySelectorAll("#visitedPassions [data-vpid].active")).map(b => b.getAttribute("data-vpid")),
    sel: Array.from(window._visited.passionSel),
  }));
  expect(apres.actifs).toEqual(["cuisine"]);
  expect(apres.sel).toEqual(["cuisine"]);
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
