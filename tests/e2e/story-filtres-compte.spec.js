// ═══════════════════════════════════════════════════════════════════════════
// STORY ET BOBINE — FILTRES ET COMPTE À REBOURS (2026-11-26)
//   ① filtres : rangée en capture, choix appliqué à l'aperçu puis au média ; il
//      voyage ({type:"filtre"}) et les DEUX lecteurs posent la classe ;
//   ② ✨ en édition rouvre la rangée ; mode Créer (fond) : pas de filtre ;
//   ③ ⏳ compte à rebours lié à une activité : posé, rendu « dans … », un
//      toucher ouvre la fiche ; sans activité, il n'est pas un bouton ;
//   ④ hostile : filtre inconnu = aucune classe ; compte piégé inerte.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

async function ouvrirAvecPhoto(page, mode) {
  await bootOnboarded(page);
  await page.evaluate((m) => {
    window.requireAuthentication = () => true;
    try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc")); } catch (e) {}
    meOpen(m);
    // Photo minuscule : 1×1 px.
    const c = document.createElement("canvas"); c.width = 4; c.height = 4;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#c33"; ctx.fillRect(0, 0, 4, 4);
    meSetMedia(c.toDataURL("image/jpeg"), "photo");
    meEnterEditPhase();
  }, mode);
}

test("① filtre choisi : appliqué au média, voyage, rendu par les deux lecteurs", async ({ page }) => {
  await ouvrirAvecPhoto(page, "story");
  await page.locator('.me-tool[aria-label="Filtres"]').click();
  await expect(page.locator("#meFiltres")).toBeVisible();
  await page.locator('#meFiltres [data-filtre="nb"]').click();
  const r = await page.evaluate(() => ({ classe: document.getElementById("meMedia").className, filtre: getComputedStyle(document.querySelector("#meMedia img, #meMedia video") || document.body).filter }));
  expect(r.classe).toContain("filtre-nb");
  expect(r.filtre).toContain("grayscale");
  await page.evaluate(() => { window._supaReal = false; meState._enteredEditAt = 0; mePublish(); });
  const s = await page.evaluate(() => state.seed.stories[0]);
  expect(s.overlays).toContainEqual({ type: "filtre", f: "nb" });
  const lecteurs = await page.evaluate((st) => {
    storyGroups = [{ authorId: st.authorId, stories: [st] }];
    openStoryViewerAt(0, 0);
    const story = document.getElementById("storyMedia").className;
    closeStoryViewer();
    const bobine = renderReelHTML({ id: "reel_f", authorId: "x", type: "video", isReel: true, video: "https://example.invalid/v.mp4", overlays: st.overlays, text: "", likes: 0, comments: [] }, 0);
    return { story, bobine: /reel-media-container filtre-nb/.test(bobine) };
  }, s);
  expect(lecteurs.story).toContain("filtre-nb");
  expect(lecteurs.bobine).toBe(true);
});

test("② bobine : filtre aussi ; mode Créer : pas de filtre, pas de bouton ✨", async ({ page }) => {
  await ouvrirAvecPhoto(page, "bobine");
  await page.locator('.me-tool[aria-label="Filtres"]').click();
  await page.locator('#meFiltres [data-filtre="vintage"]').click();
  expect(await page.evaluate(() => meState.filtre)).toBe("vintage");
  // Story « Créer » (fond coloré) : le bouton ✨ est masqué.
  await page.evaluate(() => { meClose(); meOpen("story"); });
  await page.locator("#meBgBtn").click();
  await page.locator("#meTeOk").click();
  await expect(page.locator('.me-tool[aria-label="Filtres"]')).toBeHidden();
  expect(await page.evaluate(() => meState.filtre)).toBe("normal");
});

test("③ ⏳ compte à rebours lié à une activité : rendu, et ouvre la fiche", async ({ page }) => {
  await ouvrirAvecPhoto(page, "story");
  const ev = await page.evaluate(() => allEvents().find((e) => Number(e.date) > Date.now()));
  expect(ev).toBeTruthy();
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Compte à rebours"]').click();
  await page.locator("#meCrEvt").selectOption(ev.id);
  await expect(page.locator("#meCrTitre")).toHaveValue(ev.title.slice(0, 60));
  await page.locator("#meCrOk").click();
  await expect(page.locator("#meOverlays .me-sticker-compte")).toContainText(/dans|maintenant/);
  const d = await page.evaluate(() => _meOverlaysData().find((o) => o.type === "compte"));
  expect(d).toMatchObject({ eid: ev.id, titre: ev.title.slice(0, 60) });
  expect(d.fin).toBe(Number(ev.date));
  await page.evaluate((dd) => {
    meClose();
    const st = { id: "s_cr", authorId: "u_x", authorName: "X", text: "", overlays: [dd], createdAt: Date.now() };
    storyGroups = [{ authorId: "u_x", stories: [st] }];
    openStoryViewerAt(0, 0);
  }, d);
  const sticker = page.locator("#storyOverlays .st-compte");
  await expect(sticker).toContainText(/dans \d+/);
  await sticker.click();
  await expect.poll(() => page.evaluate(() => window._openEventDetailId)).toBe(ev.id);
});

test("④ hostile : filtre inconnu sans classe, compte piégé inerte, texte du reste", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const d = document.createElement("div");
    d.innerHTML = _storyOverlaysHtml([
      { type: "compte", titre: '<img src=x onerror=alert(1)>', fin: Date.now() + 3 * 3600 * 1000 + 60000, eid: 'e1" onclick="x' },
      { type: "compte", titre: "x", fin: "pas un nombre" },
      { type: "compte", titre: "Libre", fin: Date.now() + 90 * 60000 },
    ]);
    const els = Array.from(d.querySelectorAll("*"));
    return {
      classe: storyFiltreClasse([{ type: "filtre", f: 'nb" onload="x' }]) + "|" + storyFiltreClasse([{ type: "filtre", f: "froid" }]),
      actifs: els.filter((e) => /^(IMG|SVG|SCRIPT)$/i.test(e.tagName) || Array.from(e.attributes).some((a) => /^on/i.test(a.name))).length,
      boutons: d.querySelectorAll("button").length,
      comptes: d.querySelectorAll(".st-compte").length,
      textes: Array.from(d.querySelectorAll(".st-compte span")).map((e) => e.textContent),
      cinq: storyCompteTexte(Date.now() + 2 * 86400000 + 5 * 3600000 + 60000) + "|" + storyCompteTexte(Date.now() - 1),
    };
  });
  expect(r.classe).toBe("|filtre-froid");
  expect(r.actifs).toBe(0);
  expect(r.boutons, "eid piégé = pas de lien ; sans activité = pas de bouton").toBe(0);
  expect(r.comptes).toBe(2);
  expect(r.textes[0]).toMatch(/^dans 3 h/);
  expect(r.textes[1]).toMatch(/^dans 1 h 30 min|^dans 1 h 29 min/);
  expect(r.cinq).toBe("dans 2 j 5 h|C'est maintenant !");
});
