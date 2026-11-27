// ═══════════════════════════════════════════════════════════════════════════
// LECTEURS DE STORY ET DE BOBINES FAÇON INSTAGRAM (2026-11-27)
// Suite du retour de Benjamin (« story et bobines pas ergonomiques, copie
// Instagram »). Verrous :
//   ① story sur téléphone : plein cadre — toute la largeur, du haut de l'écran
//      à la barre de réponse, sans jamais passer DESSOUS ; chaque commande
//      reçoit son toucher ;
//   ② au-delà de 520 px, la story reste une carte 9:16 ;
//   ③ bobines au doigt : plus de flèches, l'indice dit les gestes du doigt, la
//      légende reprend la place de la flèche du bas ;
//   ④ double toucher sur une bobine = j'aime (cœur), jamais « je n'aime plus » ;
//      un bouton posé sur la bobine garde son propre toucher ;
//   ⑤ à la souris, les flèches restent (rien ne change hors tactile).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "a1b2c3d4-0000-4000-8000-00000000c870";
const LEA = "a1b2c3d4-0000-4000-8000-00000000c871";

async function ouvrirStory(page) {
  await bootOnboarded(page);
  await page.evaluate(({ moi, lea }) => {
    MY_UID = moi;
    window._uidEstUnCompte = () => true;
    window.requireAuthentication = () => true;
    window._sendTextToSupa = () => {};
    storyGroups = [{ authorId: lea, stories: [
      { id: "s_lec_1", authorId: lea, authorName: "Léa", text: "Sortie vélo dimanche", createdAt: Date.now() - 600000, bg: "#7c3aed" },
      { id: "s_lec_2", authorId: lea, authorName: "Léa", text: "Le parcours", createdAt: Date.now() - 500000, bg: "#0ea5e9" },
    ] }];
    openStoryViewerAt(0, 0);
  }, { moi: MOI, lea: LEA });
  await expect(page.locator("#storyViewer")).toHaveClass(/active/);
}
const boite = (page, sel) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, d: r.right, b: r.bottom, w: r.width, h: r.height }; });
const atteint = (page, sel) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t)); });

test.describe("téléphone (tactile)", () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

  test("① story : plein cadre, jamais sous la barre de réponse, commandes au doigt", async ({ page }) => {
    await ouvrirStory(page);
    // L'ouverture est animée (fondu de 220 ms) : on mesure la story une fois posée.
    await expect.poll(async () => (await boite(page, "#storyCard")).y).toBeLessThanOrEqual(1);
    const carte = await boite(page, "#storyCard");
    const barre = await boite(page, "#storyActionsBar");
    expect(Math.round(carte.x), "bord gauche").toBe(0);
    expect(Math.round(carte.w), "toute la largeur").toBe(390);
    expect(carte.y, "depuis le haut de l'écran").toBeLessThanOrEqual(1);
    expect(carte.b, "la story s'arrête AU-DESSUS de la barre de réponse").toBeLessThanOrEqual(barre.y + 1);
    expect(carte.h, "bien plus haute que l'ancienne carte (615 px)").toBeGreaterThan(680);
    for (const sel of ["#storyViewer .story-viewer-close", "#storyReplyBar .story-reply-input", "#storyLikeBtn", "#storyShareBtn", "#storyCommentBtn"]) {
      expect(await atteint(page, sel), sel + " reçoit le toucher").toBe(true);
    }
    // Les zones de toucher couvrent la story : à droite la suivante, à gauche la précédente.
    await page.touchscreen.tap(330, 400);
    expect(await page.evaluate(() => storyItemIdx)).toBe(1);
    await page.touchscreen.tap(40, 400);
    expect(await page.evaluate(() => storyItemIdx)).toBe(0);
    // Le texte de la story reste lisible au-dessus de la barre.
    const texte = await page.evaluate(() => { const r = document.getElementById("storyContent").getBoundingClientRect(); return { b: r.bottom, h: r.height }; });
    expect(texte.h).toBeGreaterThan(10);
    expect(texte.b).toBeLessThanOrEqual(barre.y);
    // Le champ de réponse en main : les réactions rapides se posent au-dessus, la story reste.
    await page.locator("#storyReplyBar .story-reply-input").tap();
    await expect(page.locator("#storyReactions .story-reaction-btn").first()).toBeVisible();
    expect(await atteint(page, "#storyReactions .story-reaction-btn:first-child")).toBe(true);
  });

  test("③ bobines au doigt : plus de flèches, indice des gestes, légende redescendue", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => { window.requireAuthentication = () => true; openReels(); });
    await expect(page.locator("#reelsViewer")).toHaveClass(/open/);
    await expect(page.locator("#reelsPrevBtn")).toBeHidden();
    await expect(page.locator("#reelsNextBtn")).toBeHidden();
    await expect(page.locator("#reelsHint .reels-hint-tactile")).toHaveText("Glisse vers le haut · touche deux fois pour aimer");
    expect(await page.evaluate(() => ({ doigt: getComputedStyle(document.querySelector("#reelsHint .reels-hint-tactile")).display, souris: getComputedStyle(document.querySelector("#reelsHint .reels-hint-souris")).display }))).toEqual({ doigt: "inline", souris: "none" });
    // La légende est posée en bas (22 px), plus à 76 px pour dégager une flèche absente.
    const r = await page.evaluate(() => {
      const it = document.querySelector("#reelsList .reel-item[data-v5]") || document.querySelector("#reelsList .reel-item");
      const info = it.querySelector(".reel-info").getBoundingClientRect(), item = it.getBoundingClientRect();
      const col = it.querySelector(".reel-actions").getBoundingClientRect();
      return { ecart: Math.round(item.bottom - info.bottom), infoDroite: info.right, colGauche: col.left };
    });
    expect(r.ecart).toBe(22);
    expect(r.infoDroite, "la légende ne passe pas sous la colonne d'actions").toBeLessThanOrEqual(r.colGauche);
    // Les quatre actions de la colonne reçoivent leur toucher.
    const n = await page.locator("#reelsList .reel-item").first().locator(".reel-action-btn").count();
    expect(n).toBe(4);
    for (let i = 0; i < n; i++) {
      const ok = await page.locator("#reelsList .reel-item").first().locator(".reel-action-btn").nth(i).evaluate((el) => { const b = el.getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 3); return !!t && (t === el || el.contains(t)); });
      expect(ok, "action " + i).toBe(true);
    }
    // Glisser reste le geste : la bobine suivante vient par le défilement.
    await page.evaluate(() => { const l = document.getElementById("reelsList"); l.scrollTop = l.clientHeight; });
    await expect.poll(() => page.evaluate(() => reelsState.current)).toBe(1);
  });

  test("④ double toucher = j'aime, jamais « je n'aime plus » ; un bouton garde son toucher", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => { window.requireAuthentication = () => true; openReels(); });
    const item = page.locator("#reelsList .reel-item").first();
    const coeur = item.locator("[data-reellike]");
    const avant = Number(await coeur.locator(".reel-action-label").textContent());
    await expect(coeur).not.toHaveClass(/liked/);
    const zone = await item.locator(".reel-media-container").boundingBox();
    const x = zone.x + zone.width / 2, y = zone.y + zone.height / 3;
    // Un seul toucher n'aime pas.
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(450);
    await expect(coeur).not.toHaveClass(/liked/);
    // Deux touchers rapprochés : aimée, compteur + 1, cœur au centre.
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
    await expect(coeur).toHaveClass(/liked/);
    await expect(coeur.locator(".reel-action-label")).toHaveText(String(avant + 1));
    await expect(item.locator(".reel-media-container .heart-burst")).toHaveCount(1);
    const id = await item.getAttribute("data-post-id");
    expect(await page.evaluate((i) => state.user.likedPosts.includes(i), id)).toBe(true);
    // Recommencer ne retire PAS le j'aime (seul le cœur de la colonne le fait).
    await page.waitForTimeout(450);
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(200);
    await expect(coeur).toHaveClass(/liked/);
    await expect(coeur.locator(".reel-action-label")).toHaveText(String(avant + 1));
    // Le cœur de la colonne retire le j'aime, comme avant (passé l'anti double-clic de 800 ms).
    await page.waitForTimeout(900);
    await coeur.tap();
    await expect(coeur).not.toHaveClass(/liked/);
    await expect(coeur.locator(".reel-action-label")).toHaveText(String(avant));
    // Deux touchers sur un BOUTON de la bobine (le son, la colonne) ne valent pas un j'aime.
    await page.evaluate(() => {
      const it = document.querySelector("#reelsList .reel-item");
      const b = document.createElement("button"); b.id = "boutonSurBobine"; b.textContent = "x";
      b.style.cssText = "position:absolute;left:40px;top:160px;width:60px;height:60px;z-index:9;";
      it.querySelector(".reel-media-container").appendChild(b);
    });
    const bb = await page.locator("#boutonSurBobine").boundingBox();
    await page.touchscreen.tap(bb.x + 30, bb.y + 30);
    await page.touchscreen.tap(bb.x + 30, bb.y + 30);
    await page.waitForTimeout(200);
    await expect(coeur).not.toHaveClass(/liked/);
  });
});

test.describe("écran large, souris", () => {
  test.use({ viewport: { width: 820, height: 900 } });

  test("② au-delà de 520 px, la story reste une carte 9:16", async ({ page }) => {
    await ouvrirStory(page);
    const carte = await boite(page, "#storyCard");
    expect(Math.round(carte.w)).toBe(360);
    expect(Math.abs(carte.w / carte.h - 9 / 16)).toBeLessThan(0.01);
  });

  test("⑤ à la souris, les flèches des bobines restent et mènent à la suivante", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => { window.requireAuthentication = () => true; openReels(); });
    await expect(page.locator("#reelsNextBtn")).toBeVisible();
    await expect(page.locator("#reelsHint .reels-hint-souris")).toHaveText("Glisse vers le haut ou utilise les flèches ↑ ↓");
    expect(await page.evaluate(() => ({ doigt: getComputedStyle(document.querySelector("#reelsHint .reels-hint-tactile")).display, souris: getComputedStyle(document.querySelector("#reelsHint .reels-hint-souris")).display }))).toEqual({ doigt: "none", souris: "inline" });
    await page.locator("#reelsNextBtn").click();
    await expect.poll(() => page.evaluate(() => reelsState.current)).toBe(1);
  });
});
