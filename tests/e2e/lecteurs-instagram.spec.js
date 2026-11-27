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
//   ⑤ à la souris, les flèches restent (rien ne change hors tactile) ;
//   ⑥ ⑦ double toucher : le second sur « ▶ Lire » compte ; une bobine aimée côté
//      serveur n'est jamais « désaimée » ;
//   ⑧ story : fermer et « ⋯ » restent au-dessus d'un sticker posé tout en haut.
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
// Deux touchers au même point, dans le MÊME tour du navigateur. Deux appels Playwright
// successifs peuvent être séparés de plus de 320 ms (la fenêtre du double toucher) sur une
// machine chargée — vu en CI le 2026-11-27 : le geste n'était alors plus un double toucher,
// et c'est le test qui échouait, pas le produit. La cible du second est relue APRÈS le
// premier : un bouton (« ▶ Lire ») a pu paraître sous le doigt entre les deux.
const doubleToucher = (page, x, y) => page.evaluate(([px, py]) => {
  for (let i = 0; i < 2; i++) {
    const el = document.elementFromPoint(px, py);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, clientX: px, clientY: py }));
  }
}, [x, y]);
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
    await doubleToucher(page, x, y);
    await expect(coeur).toHaveClass(/liked/);
    await expect(coeur.locator(".reel-action-label")).toHaveText(String(avant + 1));
    await expect(item.locator(".reel-media-container .heart-burst")).toHaveCount(1);
    const id = await item.getAttribute("data-post-id");
    expect(await page.evaluate((i) => state.user.likedPosts.includes(i), id)).toBe(true);
    // Recommencer ne retire PAS le j'aime (seul le cœur de la colonne le fait).
    await page.waitForTimeout(450);
    await doubleToucher(page, x, y);
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
    await doubleToucher(page, bb.x + 30, bb.y + 30);
    await page.waitForTimeout(200);
    await expect(coeur).not.toHaveClass(/liked/);
  });
});

test.describe("téléphone (tactile) — double toucher, cas de bord", () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

  test("⑥ le second toucher tombe sur « ▶ Lire » (vidéo mise en pause par le premier) : c'est quand même un j'aime", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      window.requireAuthentication = () => true;
      // Vidéo factice : sans ces deux gardes, son erreur de décodage remplacerait le
      // lecteur par un repli (et retirerait « ▶ Lire », l'objet du test).
      window._reelVideoError = () => {};
      HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      state.supabasePosts = [{ id: "reel_dt_video", authorId: "u_bob", authorName: "Bob", isReel: true, type: "video", video: "data:video/mp4;base64,AAAA", passion: "cuisine", mood: "all", text: "Vidéo", fromSupabase: true, createdAt: Date.now() - 60000, likes: 3, comments: [] }];
      openReelById("reel_dt_video");
    });
    const item = page.locator('#reelsList .reel-item[data-post-id="reel_dt_video"]');
    await expect(item).toHaveCount(1);
    const coeur = item.locator("[data-reellike]");
    await expect(coeur).not.toHaveClass(/liked/);
    // « ▶ Lire » est au centre, par-dessus la vidéo — exactement là où tombe le second toucher.
    const lireEl = item.locator("[data-video-public-play]");
    const enLecture = () => item.locator("video").evaluate((v) => {
      // La vidéo factice ne joue pas vraiment : on la déclare « en lecture », bouton masqué.
      Object.defineProperty(v, "paused", { configurable: true, get: () => false });
      v.pause = () => {};
      v.closest(".reel-item").querySelector("[data-video-public-play]").hidden = true;
    });
    // Seul, un toucher sur « ▶ Lire » n'arme rien et n'aime pas.
    await lireEl.evaluate((b) => { b.hidden = false; });
    const lire = await lireEl.boundingBox();
    await page.touchscreen.tap(lire.x + lire.width / 2, lire.y + lire.height / 2);
    await page.waitForTimeout(450);
    await expect(coeur).not.toHaveClass(/liked/);
    // La lecture est lancée : PAS de barre native dans le lecteur de bobines — elle
    // captait les touchers (ni pause au toucher, ni double toucher au centre).
    expect(await item.locator("video").evaluate((v) => ({ src: v.hasAttribute("src"), natives: v.controls }))).toEqual({ src: true, natives: false });
    // À la place, un trait de progression suit la lecture.
    const trait = await item.locator("video").evaluate((v) => {
      Object.defineProperty(v, "duration", { configurable: true, get: () => 20 });
      Object.defineProperty(v, "currentTime", { configurable: true, get: () => 5 });
      v.dispatchEvent(new Event("timeupdate"));
      return v.closest(".reel-item").querySelector(".reel-progres > span").style.width;
    });
    expect(trait).toBe("25%");
    // Vidéo en lecture : deux touchers AU CENTRE. Le premier met en pause — c'est
    // l'application qui fait paraître « ▶ Lire » sous le doigt ; le second tombe dessus.
    await enLecture();
    await expect(lireEl).toBeHidden();
    await doubleToucher(page, lire.x + lire.width / 2, lire.y + lire.height / 2);
    await expect(coeur).toHaveClass(/liked/);
    await expect(coeur.locator(".reel-action-label")).toHaveText("4");
    await expect(item.locator(".reel-media-container .heart-burst")).toHaveCount(1);
  });

  test("⑦ bobine déjà aimée CÔTÉ SERVEUR (liste locale en retard) : le double toucher ne retire rien", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      window.requireAuthentication = () => true;
      state.user.likedPosts = [];
      state.supabasePosts = [{ id: "reel_dt_serveur", authorId: "u_bob", authorName: "Bob", isReel: true, type: "photo", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", passion: "cuisine", mood: "all", text: "Photo", fromSupabase: true, liked: true, createdAt: Date.now() - 60000, likes: 7, comments: [] }];
      window.__bascules = 0;
      const vrai = window.toggleReelLike;
      window.toggleReelLike = function () { window.__bascules++; return vrai.apply(this, arguments); };
      openReelById("reel_dt_serveur");
    });
    const item = page.locator('#reelsList .reel-item[data-post-id="reel_dt_serveur"]');
    const coeur = item.locator("[data-reellike]");
    // Le cœur de la colonne est déjà rouge : la copie serveur « aimée » compte.
    await expect(coeur).toHaveClass(/liked/);
    const zone = await item.locator(".reel-media-container").boundingBox();
    await doubleToucher(page, zone.x + zone.width / 2, zone.y + zone.height / 3);
    await expect(item.locator(".reel-media-container .heart-burst")).toHaveCount(1);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__bascules), "aucune bascule : rien n'est retiré").toBe(0);
    await expect(coeur).toHaveClass(/liked/);
    await expect(coeur.locator(".reel-action-label")).toHaveText("7");
  });

  test("⑧ story : un sticker posé tout en haut ne recouvre ni « fermer » ni « ⋯ »", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(({ moi, lea }) => {
      MY_UID = moi;
      window._uidEstUnCompte = () => true;
      window.requireAuthentication = () => true;
      // Deux stickers géants, placés sur l'en-tête : à gauche (nom) et à droite (fermer, « ⋯ »).
      const haut = (x) => ({ type: "mention", uid: lea, nom: "Léa Léa Léa Léa", x, y: 6, scale: 3 });
      storyGroups = [{ authorId: lea, stories: [{ id: "s_haut", authorId: lea, authorName: "Léa", text: "", createdAt: Date.now() - 60000, bg: "#7c3aed", overlays: [haut(20), haut(85)] }] }];
      openStoryViewerAt(0, 0);
    }, { moi: MOI, lea: LEA });
    await expect(page.locator("#storyOverlays .story-sticker").first()).toBeVisible();
    await expect.poll(async () => (await boite(page, "#storyCard")).y).toBeLessThanOrEqual(1);
    // Prémisse : le sticker est bien SOUS le bouton (sinon le test ne prouverait rien).
    const dessous = await page.evaluate(() => {
      const f = document.querySelector("#storyViewer .story-viewer-close").getBoundingClientRect();
      return Array.from(document.querySelectorAll("#storyOverlays .story-sticker")).some((s) => { const r = s.getBoundingClientRect(); return r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top; });
    });
    expect(dessous, "prémisse : un sticker chevauche le bouton fermer").toBe(true);
    expect(await atteint(page, "#storyViewer .story-viewer-close"), "fermer reste au-dessus").toBe(true);
    expect(await atteint(page, "#storyReportBtn"), "« ⋯ » signaler reste au-dessus").toBe(true);
    await page.locator("#storyViewer .story-viewer-close").tap();
    await expect(page.locator("#storyViewer")).not.toHaveClass(/active/);
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
