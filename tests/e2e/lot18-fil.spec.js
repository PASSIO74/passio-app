// ═══════════════════════════════════════════════════════════════════════════
// LOT-18 (audit UX/UI du 2026-11-10) — LE FIL
//   ① FIL-C03 : mon j'aime lu en base se peint tout de suite (cœur rouge),
//      et un toucher le RETIRE au lieu d'en envoyer un second.
//   ② FIL-C07 : « Masquer ce commentaire » tient à la relecture.
//   ③ FIL-C09 : « Texte copié » attend le presse-papiers ; un refus le dit.
//   ④ FIL-C04 / C11 / C29 : la discussion prend la hauteur, ses champs sont
//      nommés, la limite de 400 caractères se dit.
//   ⑤ FIL-C12 / C05 : la page « Publication » dit « Discussion » et offre
//      « Écrire un commentaire ».
//   ⑥ FIL-C17 / C18 / C25 / C28 : bouton d'état vide juste, image indisponible
//      dite, bandeau hors ligne sous la barre du haut, « Afficher la suite ».
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① FIL-C03 : un j'aime lu en base est peint, et le toucher le retire", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const id = "5d0c1f7e-0000-4000-8000-0000000018a1";
    state.user.likedPosts = (state.user.likedPosts || []).filter((x) => x !== id);
    state.supabasePosts = (state.supabasePosts || []).concat([{
      id, authorId: "a1a1a1a1-0000-4000-8000-0000000018a1", authorName: "Léa", passion: "musique", mood: "all",
      type: "text", text: "LOT18_AIME", createdAt: Date.now() - 60000, likes: 5, liked: true, comments: [], fromSupabase: true,
    }]);
    const box = document.createElement("div");
    box.innerHTML = renderPostHTML(findPostAnywhere(id));
    const peint = !!box.querySelector(".post-action.liked");
    const adopte = state.user.likedPosts.includes(id);
    // Le toucher : l'état VU est « aimé » → l'intention est de RETIRER.
    likePost(id, true);
    const p = findPostAnywhere(id);
    return { peint, adopte, apres: state.user.likedPosts.includes(id), likes: p.likes };
  });
  expect(r.peint, "le cœur est rouge dès la première peinture").toBe(true);
  expect(r.adopte, "la liste locale s'aligne sur la base").toBe(true);
  expect(r.apres, "le toucher retire le j'aime").toBe(false);
  expect(r.likes, "aucun j'aime de trop : 5 → 4").toBe(4);
});

test("② FIL-C07 : un commentaire masqué ne revient pas à la relecture", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const liste = () => [
      { id: "c_l18_a", authorId: "u_l18", text: "à masquer", createdAt: Date.now() - 2000 },
      { id: "c_l18_b", authorId: "u_l18", text: "à garder", createdAt: Date.now() - 1000 },
    ];
    const avant = _renderCommentsList(liste(), "p_l18");
    memoriserCommentaireMasque("c_l18_a");
    // La relecture rend une liste NEUVE, qui porte encore le commentaire.
    const apres = _renderCommentsList(liste(), "p_l18");
    return {
      avant: avant.includes('data-commentid="c_l18_a"'),
      apres: apres.includes('data-commentid="c_l18_a"'),
      garde: apres.includes('data-commentid="c_l18_b"'),
      memorise: (state.user.hiddenComments || []).includes("c_l18_a"),
    };
  });
  expect(r.avant).toBe(true);
  expect(r.apres, "masqué, il ne revient pas").toBe(false);
  expect(r.garde).toBe(true);
  expect(r.memorise, "mémorisé dans l'état du compte").toBe(true);
});

test("③ FIL-C09 : « Texte copié » n'est annoncé qu'au succès ; un refus le dit", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("NotAllowedError")) } });
    window._cmtSheetCtx = { threadId: "x", commentId: "y", text: "bonjour" };
    _cmtAct("copy");
  });
  await expect(page.locator("body")).toContainText("Copie impossible");
  await expect(page.locator("body")).not.toContainText("Texte copié");
});

test("④ FIL-C04 / C11 / C29 : la discussion prend la hauteur, ses champs sont nommés, la limite se dit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootOnboarded(page);
  await page.evaluate(() => openComments((state.seed.posts || [])[0].id));
  const box = page.locator("#commentsBox");
  await expect(box).toBeVisible();
  const r = await page.evaluate(() => ({
    hauteurMax: parseFloat(getComputedStyle(document.getElementById("commentsBox")).maxHeight),
    sousTitre: (document.getElementById("modalContent").textContent || "").includes("Réponds à cette publication."),
    nom: document.getElementById("newComment").getAttribute("aria-label"),
  }));
  expect(r.hauteurMax, "plus de lucarne de 260 px").toBeGreaterThan(400);
  expect(r.sousTitre).toBe(false);
  expect(r.nom).toBe("Écrire un commentaire");
  const compteur = page.locator("#newCommentCompteur");
  await page.locator("#newComment").fill("a".repeat(100));
  await expect(compteur).toBeHidden();
  await page.locator("#newComment").fill("a".repeat(360));
  await expect(compteur).toHaveText("360 / 400");
});

test("⑤ FIL-C12 / C05 : la page « Publication » dit « Discussion » et offre d'écrire", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => openPost((state.seed.posts || [])[0].id));
  const pageDetail = page.locator("#postDetailPage");
  await expect(pageDetail).toBeVisible();
  await expect(pageDetail).toContainText("Publication");
  await expect(pageDetail.locator(".post-page-intertitre")).toContainText("Discussion (");
  await expect(pageDetail).not.toContainText("Commentaires (");
  const ecrire = pageDetail.getByRole("button", { name: "Écrire un commentaire" });
  await expect(ecrire).toBeVisible();
  await ecrire.click();
  await expect(page.locator("#newComment")).toBeVisible();
});

test("⑥ FIL-C17 / C18 / C25 / C28 : bouton d'état vide, image indisponible, bandeau hors ligne, suite du fil", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    // C17
    const vide = document.createElement("div");
    document.body.appendChild(vide);
    window.PassioUIV2.decorateEmpty(vide, { nothingSelected: false, aucunSuivi: true });
    const cta = vide.querySelector("[data-v2-empty-cta]");
    // C18
    const m = document.createElement("div");
    m.className = "post-media";
    const img = document.createElement("img");
    m.appendChild(img);
    document.body.appendChild(m);
    imageFilIndisponible(img);
    // C25
    const b = document.getElementById("offlineBanner");
    b.style.display = "flex";
    const rb = b.getBoundingClientRect();
    const barre = document.querySelector(".app-topbar");
    const rt = barre ? barre.getBoundingClientRect() : { bottom: 0 };
    const croix = b.querySelector("button").getBoundingClientRect();
    b.style.display = "none";
    return {
      cta: cta && cta.textContent, ctaGenre: cta && cta.getAttribute("data-v2-empty-cta"),
      image: m.textContent.trim(),
      bandeauSousBarre: rb.top >= rt.bottom, croix: [Math.round(croix.width), Math.round(croix.height)],
      nomCroix: b.querySelector("button").getAttribute("aria-label"),
    };
  });
  expect(r.cta).toBe("Trouver des personnes à suivre");
  expect(r.ctaGenre).toBe("people");
  expect(r.image).toBe("Image indisponible");
  expect(r.bandeauSousBarre, "le bandeau ne recouvre plus la barre du haut").toBe(true);
  expect(r.croix[0]).toBeGreaterThanOrEqual(44);
  expect(r.croix[1]).toBeGreaterThanOrEqual(44);
  expect(r.nomCroix).toBeTruthy();
  const source = await page.evaluate(() => renderFeed.toString());
  expect(source).not.toContain("Charger plus de posts");
});
