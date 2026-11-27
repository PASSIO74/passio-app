// ═══════════════════════════════════════════════════════════════════════════
// STORY ET BOBINE — TAILLE, POLICES, DESSIN, RETOUR (2026-11-26, lot A)
// L'éditeur est PARTAGÉ par la story et la bobine (« il faut pareil avec
// bobine », Benjamin) : chaque outil est éprouvé dans les deux modes.
//   ① taille (réglette) et police s'appliquent au texte posé, et voyagent ;
//   ② le geste RETOUR pendant l'écriture ferme le clavier, garde le texte, et
//      l'éditeur média reste ouvert ;
//   ③ dessin : un trait, annuler, gomme, et il voyage en VECTEURS ;
//   ④ bobine : texte, police et dessin dans le même éditeur, rendus par le
//      lecteur de bobines ;
//   ⑤ un dessin ou une police hostiles d'un autre compte ne sortent pas du SVG
//      ni de l'attribut style.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

async function ouvrir(page, mode) {
  await bootOnboarded(page);
  await page.evaluate((m) => {
    window.requireAuthentication = () => true;
    try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc")); } catch (e) {}
    meOpen(m);
    if (m === "bobine") meEnterEditPhase(); // pas de caméra : on saute la prise
  }, mode);
  if (mode === "story") await page.locator("#meBgBtn").click();
  else await page.locator('.me-tool[aria-label="Ajouter un texte"]').click();
  await expect(page.locator("#meTexteEditeur")).toBeVisible();
}

async function tracer(page, x0, y0, x1, y1) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8);
  await page.mouse.up();
}

test("① taille et police s'appliquent au texte posé et voyagent", async ({ page }) => {
  await ouvrir(page, "story");
  await page.locator("#meTeChamp").fill("Concert");
  await page.locator("#meTeTaille").fill("48");
  await page.locator('#meTePolices [data-police="machine"]').click();
  const champ = await page.evaluate(() => { const c = getComputedStyle(document.getElementById("meTeChamp")); return { fs: c.fontSize, ff: c.fontFamily }; });
  expect(champ.fs).toBe("48px");
  expect(champ.ff).toContain("Courier New");
  await page.locator("#meTeOk").click();
  const ov = await page.evaluate(() => { const o = meState.overlays[0]; const el = document.getElementById(o.id); return { size: o.size, font: o.font, fs: el.style.fontSize, ff: getComputedStyle(el).fontFamily, data: _meOverlaysData()[0] }; });
  expect(ov.size).toBe(48);
  expect(ov.fs).toBe("48px");
  expect(ov.ff).toContain("Courier New");
  expect(ov.data).toMatchObject({ font: "machine", size: 48 });
  const html = await page.evaluate((d) => _storyOverlaysHtml([d]), ov.data);
  expect(html).toContain("font-size:48px");
  expect(html).toContain("Courier New");
});

test("② retour pendant l'écriture : clavier fermé, texte gardé, éditeur ouvert", async ({ page }) => {
  await ouvrir(page, "story");
  await page.locator("#meTeChamp").fill("Ne pas perdre");
  await page.goBack();
  await expect(page.locator("#meTexteEditeur")).toBeHidden();
  await expect(page.locator("#mediaEditor")).toHaveClass(/open/);
  await expect(page.locator("#meOverlays .me-overlay.text")).toHaveText(/Ne pas perdre/);
  // Un second retour atteint bien l'éditeur média (l'entrée a été reposée, pas
  // perdue). Depuis le 2026-11-27, il ne jette plus le texte d'un seul geste : il
  // DEMANDE (« Abandonner cette story ? »), l'éditeur reste ouvert.
  await page.goBack();
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille.locator(".feuille-conf-titre")).toHaveText("Abandonner cette story ?");
  await expect(page.locator("#mediaEditor")).toHaveClass(/open/);
  await expect(page.locator("#meOverlays .me-overlay.text")).toHaveText(/Ne pas perdre/);
  // « Abandonner » rend l'appareil photo ; le retour suivant ferme l'éditeur.
  await feuille.locator('[data-conf="abandonner"]').click();
  await expect(page.locator("#mediaEditor")).toHaveClass(/phase-capture/);
  await expect(page.locator("#meOverlays .me-overlay")).toHaveCount(0);
  await page.goBack();
  await expect(page.locator("#mediaEditor")).not.toHaveClass(/open/);
});

test("③ dessin : trait, annuler, gomme ; voyage en vecteurs", async ({ page }) => {
  await ouvrir(page, "story");
  await page.locator("#meTeOk").click();
  await page.evaluate(() => meOuvrirDessin());
  await expect(page.locator("#meDessinBarre")).toBeVisible();
  await page.locator('#meDessinCouleurs [data-couleur="#ef4444"]').click();
  await tracer(page, 80, 300, 300, 420);
  await tracer(page, 80, 500, 300, 520);
  expect(await page.evaluate(() => meState.dessin.length)).toBe(2);
  await page.locator("#meDsAnnulerBtn").click();
  expect(await page.evaluate(() => meState.dessin.length)).toBe(1);
  // Gomme : toucher le trait restant l'efface.
  await page.locator("#meDsGommeBtn").click();
  await tracer(page, 80, 300, 300, 420);
  expect(await page.evaluate(() => meState.dessin.length)).toBe(0);
  await page.locator("#meDsGommeBtn").click();
  await tracer(page, 100, 600, 280, 640);
  await page.locator("#meDessinOk").click();
  await expect(page.locator("#meDessinBarre")).toBeHidden();
  // Publie (local) : le dessin est le PREMIER overlay, en nombres.
  await page.evaluate(() => { window._supaReal = false; meState._enteredEditAt = 0; mePublish(); });
  const s = await page.evaluate(() => state.seed.stories[0]);
  const d = s.overlays[0];
  expect(d.type).toBe("dessin");
  expect(d.traits[0].c).toBe("#ef4444");
  expect(d.traits[0].p.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000)).toBe(true);
  const rendu = await page.evaluate((st) => { storyGroups = [{ authorId: st.authorId, stories: [st] }]; openStoryViewerAt(0, 0); return document.querySelectorAll("#storyOverlays svg.story-ov-dessin polyline").length; }, s);
  expect(rendu).toBe(1);
});

test("④ bobine : texte, police et dessin dans le même éditeur, rendus par le lecteur", async ({ page }) => {
  await ouvrir(page, "bobine");
  await page.locator("#meTeChamp").fill("Mon tour");
  await page.locator('#meTePolices [data-police="neon"]').click();
  await page.locator("#meTeOk").click();
  await page.evaluate(() => meOuvrirDessin());
  await tracer(page, 100, 300, 280, 360);
  await page.locator("#meDessinOk").click();
  const r = await page.evaluate(() => ({ mode: meState.mode, n: meState.overlays.length, d: meState.dessin.length, ombre: document.getElementById(meState.overlays[0].id).style.textShadow }));
  expect(r.mode).toBe("bobine");
  expect(r.n).toBe(1);
  expect(r.d).toBe(1);
  expect(r.ombre).toContain("0px 0px");
  const html = await page.evaluate(() => {
    const ovs = [{ type: "dessin", traits: meState.dessin }].concat(_meOverlaysData());
    return renderReelHTML({ id: "reel_t", authorId: "x", type: "video", isReel: true, video: "https://example.invalid/v.mp4", overlays: ovs, text: "", likes: 0, comments: [] }, 0);
  });
  expect(html).toContain("reel-overlays-layer");
  expect(html).toContain("story-ov-dessin");
  expect(html).toContain("text-shadow:");
});

test("⑤ dessin ou police hostiles d'un autre compte : rien ne sort", async ({ page }) => {
  await bootOnboarded(page);
  const h = await page.evaluate(() => _storyOverlaysHtml([
    { type: "dessin", traits: [{ c: 'red" onload="alert(1)', w: "9;x", p: [10, 20, "30\"><script>", 40] }, { c: "#fff", w: 999, p: [5, 5, 2000, -40] }] },
    { type: "text", text: "x", font: "'); background:url(x", size: "40px;position:fixed" },
  ]));
  expect(h).not.toContain("onload");
  expect(h).not.toContain("<script");
  expect(h).not.toContain("url(");
  expect(h).not.toContain("position:fixed");
  expect(h).toContain('points="5,5 1000,0"');
  expect(h).toContain('stroke-width="40"');
  expect(h).toContain("font-size:26px");
});

test("⑥ un long trait (300 points) ressort ENTIER dans les deux lecteurs", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const p = []; for (let i = 0; i < 300; i++) p.push(Math.round(i * 3), 500 + (i % 7));
    const ovs = [{ type: "dessin", traits: [{ c: "#ffffff", w: 10, p }] }];
    const st = { id: "s_long", authorId: "u_x", authorName: "X", text: "", overlays: ovs, createdAt: Date.now() };
    storyGroups = [{ authorId: "u_x", stories: [st] }];
    openStoryViewerAt(0, 0);
    const pl = document.querySelector("#storyOverlays svg.story-ov-dessin polyline");
    const story = pl ? pl.getAttribute("points").split(" ").length : 0;
    closeStoryViewer();
    const html = renderReelHTML(passioMediaProteges.contextualiser({ id: "reel_l", authorId: "u_x", type: "video", isReel: true, video: "https://example.invalid/v.mp4", overlays: ovs, text: "", likes: 0, comments: [] }, { type: "posts", id: "reel_l" }), 0);
    const m = html.match(/points="([^"]*)"/);
    return { story, bobine: m ? m[1].split(" ").length : 0 };
  });
  expect(r.story).toBe(300);
  expect(r.bobine).toBe(300);
});
