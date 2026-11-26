// ═══════════════════════════════════════════════════════════════════════════
// STORY « CRÉER » FAÇON INSTAGRAM (2026-11-26)
// Retour de Benjamin : « quand je clique sur la palette en bas à droite, tu
// remplis tout d'une couleur, ce n'est pas ergonomique ». Le bouton de la
// capture posait un aplat et s'arrêtait là. Verrous :
//   ① un toucher sur « Aa » (capture) = fond coloré ET éditeur de texte ouvert,
//      champ focalisé (clavier), consigne visible ;
//   ② couleur, fond du texte et alignement s'appliquent au texte posé ;
//   ③ un toucher sur le texte le rouvre ; vidé, il disparaît ;
//   ④ le fond change sans rien perdre ; une story vide n'est pas publiée ;
//   ⑤ le fond choisi VOYAGE (overlay `bg` = indice) et le lecteur le rend,
//      avec le style du texte — y compris pour une story venue du serveur.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

async function ouvrirCreer(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.requireAuthentication = () => true;
    // Pas de caméra dans le banc : la capture tombe sur son repli, le bouton reste là.
    try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc")); } catch (e) {}
    meOpen("story");
  });
  await expect(page.locator("#meBgBtn")).toBeVisible();
  await page.locator("#meBgBtn").click();
}

test("① « Aa » de la capture : fond coloré + écriture directe, champ focalisé", async ({ page }) => {
  await ouvrirCreer(page);
  const ed = page.locator("#mediaEditor");
  await expect(ed).toHaveClass(/phase-edit/);
  await expect(ed).toHaveClass(/me-fond/);
  await expect(page.locator("#meTexteEditeur")).toBeVisible();
  const focus = await page.evaluate(() => document.activeElement && document.activeElement.id);
  expect(focus).toBe("meTeChamp");
  // Publier et la barre d'outils sont masqués pendant l'écriture.
  await expect(page.locator("#mePublishBtn")).toBeHidden();
  // Toucher dehors sans rien écrire : retour au fond, consigne « Touche pour écrire ».
  await page.locator("#meTeOk").click();
  await expect(page.locator("#meTexteEditeur")).toBeHidden();
  await expect(page.locator("#meCreerHint")).toBeVisible();
  await expect(page.locator("#meFondBtn")).toBeVisible();
  // Toucher le fond rouvre l'écriture.
  await page.locator("#meCanvas").click({ position: { x: 190, y: 300 } });
  await expect(page.locator("#meTexteEditeur")).toBeVisible();
});

test("② couleur, fond du texte et alignement s'appliquent au texte posé", async ({ page }) => {
  await ouvrirCreer(page);
  await page.locator("#meTeChamp").fill("Sortie vélo\ndimanche");
  await page.locator('#meTeCouleurs [data-couleur="#facc15"]').click();
  await page.locator("#meTeStyle").click();
  await page.locator("#meTeAlign").click(); // center → left
  await page.locator("#meTeOk").click();
  const r = await page.evaluate(() => {
    const ov = meState.overlays[0];
    const el = document.getElementById(ov.id);
    const span = el.firstChild;
    return { text: ov.text, color: ov.color, style: ov.style, align: ov.align, couleurTexte: getComputedStyle(el).color, fond: getComputedStyle(span).backgroundColor, alignRendu: el.style.textAlign };
  });
  expect(r.text).toBe("Sortie vélo\ndimanche");
  expect(r.color).toBe("#facc15");
  expect(r.style).toBe("fond");
  expect(r.align).toBe("left");
  expect(r.fond).toBe("rgb(250, 204, 21)");
  expect(r.couleurTexte, "texte sombre sur fond jaune").toBe("rgb(17, 17, 17)");
  expect(r.alignRendu).toBe("left");
  await expect(page.locator("#meCreerHint")).toBeHidden();
});

test("③ un toucher sur le texte le rouvre ; vidé, il disparaît", async ({ page }) => {
  await ouvrirCreer(page);
  await page.locator("#meTeChamp").fill("Bonjour");
  await page.locator("#meTeOk").click();
  const texte = page.locator("#meOverlays .me-overlay.text");
  await expect(texte).toHaveCount(1);
  await texte.tap();
  await expect(page.locator("#meTexteEditeur")).toBeVisible();
  await expect(page.locator("#meTeChamp")).toHaveValue("Bonjour");
  await page.locator("#meTeChamp").fill("Bonjour à tous");
  await page.locator("#meTeOk").click();
  await expect(texte).toHaveText(/Bonjour à tous/);
  await texte.tap();
  await page.locator("#meTeChamp").fill("");
  await page.locator("#meTeOk").click();
  await expect(page.locator("#meOverlays .me-overlay")).toHaveCount(0);
});

test("④ le fond change sans perdre le texte ; une story vide n'est pas publiée", async ({ page }) => {
  await ouvrirCreer(page);
  const fond0 = await page.evaluate(() => document.getElementById("meCanvas").style.background);
  await page.locator("#meTeFond").click();
  const apres = await page.evaluate(() => ({ fond: document.getElementById("meCanvas").style.background, idx: meState.bgIdx, focus: document.activeElement && document.activeElement.id }));
  expect(apres.fond).not.toBe(fond0);
  expect(apres.idx).toBe(1);
  await page.locator("#meTeOk").click();
  // Vide : refus, l'éditeur se rouvre, rien n'est publié.
  const avant = await page.evaluate(() => (state.seed.stories || []).length);
  await page.evaluate(() => { meState._enteredEditAt = 0; mePublish(); });
  await expect(page.locator("#meTexteEditeur")).toBeVisible();
  expect(await page.evaluate(() => (state.seed.stories || []).length)).toBe(avant);
});

test("⑤ le fond voyage (indice) et le lecteur rend fond + style du texte", async ({ page }) => {
  await ouvrirCreer(page);
  await page.locator("#meTeFond").click();
  await page.locator("#meTeFond").click(); // indice 2
  await page.locator("#meTeChamp").fill("Atelier poterie");
  await page.locator('#meTeCouleurs [data-couleur="#7c3aed"]').click();
  await page.locator("#meTeStyle").click();
  await page.locator("#meTeOk").click();
  await page.evaluate(() => { window._supaReal = false; meState._enteredEditAt = 0; mePublish(); });
  const s = await page.evaluate(() => state.seed.stories[0]);
  expect(s.overlays.find((o) => o.type === "bg")).toEqual({ type: "bg", i: 2 });
  expect(s.overlays.find((o) => o.type === "text")).toMatchObject({ text: "Atelier poterie", color: "#7c3aed", style: "fond" });
  // Le lecteur, sur une story « venue du serveur » (sans `bg` local).
  const rendu = await page.evaluate((st) => {
    const copie = Object.assign({}, st, { id: "s_creer_srv", bg: undefined, fromSupabase: true });
    storyGroups = [{ authorId: copie.authorId, stories: [copie] }];
    openStoryViewerAt(0, 0);
    const card = document.getElementById("storyCard");
    const span = document.querySelector("#storyOverlays .story-txt-fond");
    return { fond: card.style.background, span: !!span, spanFond: span && getComputedStyle(span).backgroundColor, texte: span && getComputedStyle(span.parentNode).color };
  }, s);
  expect(rendu.fond).toContain("linear-gradient");
  expect(rendu.fond).toContain("rgb(14, 165, 233)"); // STORY_BGS[2] = #0ea5e9 → #22d3ee
  expect(rendu.span).toBe(true);
  expect(rendu.spanFond).toBe("rgb(124, 58, 237)");
  expect(rendu.texte).toBe("rgb(255, 255, 255)");
});

test("⑤bis un indice hostile ou une couleur piégée ne sortent pas de l'attribut", async ({ page }) => {
  await bootOnboarded(page);
  const html = await page.evaluate(() => ({
    fond: _storyFondCss({ overlays: [{ type: "bg", i: "1;background:url(x)" }] }),
    hors: _storyFondCss({ overlays: [{ type: "bg", i: 999 }] }),
    txt: _storyOverlaysHtml([{ type: "text", text: "<b>x</b>", color: 'red;" onmouseover="alert(1)', style: "fond", align: 'left;"><img' }]),
  }));
  expect(html.fond).toBe("var(--grad-hero)");
  expect(html.hors).toBe("var(--grad-hero)");
  expect(html.txt).not.toContain("onmouseover");
  expect(html.txt).not.toContain("<img");
  expect(html.txt).not.toContain("<b>");
  expect(html.txt).toContain("text-align:center");
});
