// ═══════════════════════════════════════════════════════════════════════════
// LOT-14 (audit UX/UI du 2026-11-10) — BOBINES ET STORIES
//   ① BOB-C14 / C19 / C06 : l'envie sous le nom, plus d'étiquette du haut, le
//      nombre de commentaires, un toucher met en pause, rien ne part seul sous
//      « réduire les animations », l'état vide dit le vrai chemin.
//   ② BOB-C12 : Échap et retour ferment le panneau de commentaires d'abord.
//   ③ BOB-C10 : fermer une bobine ouverte depuis un profil y ramène.
//   ④ BOB-C07 / C16 : maintenir met en pause, relâcher ne navigue pas, clavier,
//      ✕ nommé de 44 px, piste visible.
//   ⑤ BOB-C21 : ma story a « ⋯ » ; mon groupe n'entre pas dans l'enchaînement.
//   ⑥ BOB-C13 / C18 / C05 / C08 : « Fermer » à 44 px, plus de réactions locales,
//      une image de la vidéo en vignette, l'heure des stories du serveur.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① BOB-C14 / C19 / C06 : la ligne de passion porte l'envie, la pause au toucher, rien d'automatique sous « réduire les animations »", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    openReels();
    const item = document.querySelector("#reelsList .reel-item");
    const post = reelsState.items[0];
    const out = {
      etiquetteHaut: document.querySelectorAll("#reelsList .reel-tag-mood").length,
      passion: item.querySelector(".reel-passion").textContent,
      envie: moodShortLabel(post.mood),
      libelleCmt: item.querySelectorAll(".reel-action-label")[1].textContent.trim(),
      pauseAuToucher: [...document.querySelectorAll("#reelsList .reel-item")].some((it) => {
        const c = it.querySelector(".reel-media-container");
        return it.querySelector("video") && /basculerLectureBobine/.test(c.getAttribute("onclick") || "");
      }),
    };
    closeReels();
    return out;
  });
  expect(r.etiquetteHaut, "l'étiquette du haut est retirée").toBe(0);
  if (r.envie) expect(r.passion).toContain(r.envie);
  expect(r.libelleCmt, "un nombre, plus « Commentaire »").toMatch(/^\d+$/);
  expect(r.pauseAuToucher, "toucher une bobine vidéo la met en pause").toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => videoPubliqueAutoplay()), "aucune lecture automatique").toBe(false);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const vide = await page.evaluate(() => {
    const avant = buildReels;
    window.buildReels = () => [];
    try { openReels(); return document.querySelector("#reelsList .reels-empty-text").textContent; }
    finally { closeReels(); window.buildReels = avant; }
  });
  expect(vide).toBe("Filme un moment de ta passion.");
});

test("② BOB-C12 : Échap et retour ferment le panneau de commentaires avant le lecteur", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { openReels(); openReelComments(reelsState.items[0].id); });
  await page.waitForTimeout(400);
  const etat = () => page.evaluate(() => ({
    panneau: document.getElementById("reelCommentsPanel").classList.contains("open"),
    lecteur: !!reelsState.open,
  }));
  await page.keyboard.press("Escape");
  expect(await etat(), "Échap ferme le panneau, le lecteur reste").toEqual({ panneau: false, lecteur: true });
  await page.keyboard.press("Escape");
  expect((await etat()).lecteur, "Échap suivant ferme le lecteur").toBe(false);

  await page.evaluate(() => { openReels(); });
  await page.waitForTimeout(200);
  await page.evaluate(() => openReelComments(reelsState.items[0].id));
  await page.waitForTimeout(300);
  await page.goBack();
  await page.waitForTimeout(400);
  expect(await etat(), "le retour ferme le panneau, pas la bobine").toEqual({ panneau: false, lecteur: true });
});

test("③ BOB-C10 : fermer une bobine ouverte depuis un profil ramène à ce profil", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__ouvert = null;
    window.openUserProfile = (id) => { window.__ouvert = id; };
    window._visited = { authorId: "u_lea" };
    ouvrirBobineDepuisProfil(buildReels()[0].id);
    closeReels();
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__ouvert)).toBe("u_lea");
});

test("④ BOB-C07 / C16 : maintenir met en pause, relâcher ne navigue pas, clavier, ✕ nommé", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { storyGroups = buildStoryGroups(); openStoryViewerAt(0, 0); });
  await page.waitForTimeout(300);
  const fermer = page.locator("#storyViewer .story-viewer-close");
  await expect(fermer).toHaveAttribute("aria-label", "Fermer");
  expect((await fermer.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".story-progress")).backgroundColor)).toBe("rgba(255, 255, 255, 0.35)");

  const zone = page.locator("#storyCard .story-tap-next");
  const b = await zone.boundingBox();
  const position = () => page.evaluate(() => ({ g: storyGroupIdx, i: storyItemIdx, w: parseFloat(document.getElementById("sp-" + storyItemIdx).style.width) || 0 }));
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  const debut = await position();
  await page.waitForTimeout(1200);
  const pendant = await position();
  await page.mouse.up();
  await page.waitForTimeout(150);
  const apres = await position();
  expect(pendant.w - debut.w, "maintenir met en pause").toBeLessThan(5);
  expect([apres.g, apres.i], "relâcher ne navigue pas").toEqual([debut.g, debut.i]);

  await page.keyboard.press("ArrowRight");
  const droite = await position();
  expect([droite.g, droite.i], "→ avance").not.toEqual([debut.g, debut.i]);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.getElementById("storyViewer").classList.contains("active")), "Échap ferme").toBe(false);
});

test("⑤ BOB-C21 : ma story a « ⋯ », et mon groupe n'entre pas dans l'enchaînement des autres", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    state.seed.stories = (state.seed.stories || []).concat([{ id: "st_moi", authorId: MY_UID, authorName: "Moi", text: "ma story", createdAt: Date.now() }]);
    storyGroups = buildStoryGroups();
    const mien = storyGroups.findIndex((g) => String(g.authorId) === String(MY_UID));
    openStoryViewerAt(mien, 0);
    const plus = !!document.querySelector("#storyViewer .story-more-btn");
    closeStoryViewer();
    storyGroups = buildStoryGroups();
    const autre = storyGroups.findIndex((g) => String(g.authorId) !== String(MY_UID));
    openStoryViewerAt(autre, 0);
    const vus = [];
    for (let k = 0; k < 60 && document.getElementById("storyViewer").classList.contains("active"); k++) {
      vus.push(String(storyGroups[storyGroupIdx].authorId));
      storyNext();
    }
    closeStoryViewer();
    return { plus, mienAtteint: vus.includes(String(MY_UID)) };
  });
  expect(r.plus, "« ⋯ » sur ma story").toBe(true);
  expect(r.mienAtteint, "ma story ne s'intercale pas").toBe(false);
});

test("⑥ BOB-C13 / C18 / C05 / C08 : « Fermer » à 44 px, réactions locales retirées, vignette vidéo, heure des stories", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { openReels(); openReelComments(reelsState.items[0].id); });
  await page.waitForTimeout(400);
  const fermer = page.locator("#reelCommentsPanel .reel-comments-close");
  await expect(fermer).toHaveText("Fermer");
  expect((await fermer.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("#reelCommentInput")).toHaveAttribute("placeholder", "Écris un commentaire…");
  const r = await page.evaluate(() => ({
    rangee: !!document.getElementById("reelEmojiReactions"),
    fonctions: ["reactToReel", "showQuickEmojiForReelComment", "addEmojiReactionToReelComment"].filter((f) => typeof window[f] === "function"),
    vignette: miniatureVideoPubliqueHTML("", "https://exemple.org/v.mp4"),
  }));
  expect(r.rangee).toBe(false);
  expect(r.fonctions).toEqual([]);
  expect(r.vignette).toMatch(/^<video[^>]+src="https:\/\/exemple\.org\/v\.mp4#t=0\.5"[^>]+preload="metadata"/);
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js"), "utf8");
  const ligne = src.split("\n").find((l) => l.includes('media: r.media_url'));
  expect(ligne, "supaLoadStories rend l'heure de la story").toContain("createdAt: supaTs(r.created_at)");
});
