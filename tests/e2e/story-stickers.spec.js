// ═══════════════════════════════════════════════════════════════════════════
// STICKERS DE STORY ET DE BOBINE (2026-11-26, lot B) — façon Instagram
//   ① 📍 Activité : choisie parmi les activités à venir, posée sur la story ;
//      dans le lecteur, un toucher ferme la story et ouvre la fiche ;
//   ② @ Mention : choisie par son nom ; dans le lecteur, un toucher ouvre le
//      profil ; à la publication réussie, le compte mentionné reçoit un
//      message (jamais un compte d'exemple, jamais soi) ;
//   ③ ❓ Question : posée sur la story ; un spectateur répond, la réponse part
//      en message à l'auteur, la story est en pause pendant qu'il écrit ;
//   ④ bobine : Activité et Mention proposées, pas la Question ;
//   ⑤ un sticker hostile d'un autre compte ne sort pas de ses attributs.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

const LEA = "a1b2c3d4-0000-4000-8000-00000000d101";

async function banc(page, mode) {
  await bootOnboarded(page);
  await page.evaluate(({ lea, mode }) => {
    window.requireAuthentication = () => true;
    try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc")); } catch (e) {}
    state.seed.users = (state.seed.users || []).filter((u) => u.id !== lea);
    state.seed.users.push({ id: lea, name: "Léa Martin", profileEmoji: "🎸", avatar: "#ec4899" });
    window.__envois = [];
    window._envoyerALAuteurStory = async (s, nom, texte) => { window.__envois.push({ a: s.authorId, texte }); return true; };
    meOpen(mode);
    if (mode === "bobine") meEnterEditPhase();
  }, { lea: LEA, mode });
  if (mode === "story") {
    await page.locator("#meBgBtn").click();
    await page.locator("#meTeChamp").fill("Ce soir");
    await page.locator("#meTeOk").click();
  }
}

test("① 📍 Activité : posée, puis ouvre la fiche depuis le lecteur", async ({ page }) => {
  await banc(page, "story");
  const ev = await page.evaluate(() => allEvents().find((e) => Number(e.date) > Date.now()));
  expect(ev, "le socle porte une activité à venir").toBeTruthy();
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Activité"]').click();
  await page.locator(`#meStickerPanel [data-eid="${ev.id}"]`).click();
  await expect(page.locator("#meStickerPanel")).toHaveCount(0);
  await expect(page.locator("#meOverlays .me-sticker-evenement")).toContainText(ev.title);
  await page.evaluate(() => { window._supaReal = false; meState._enteredEditAt = 0; mePublish(); });
  const s = await page.evaluate(() => state.seed.stories[0]);
  expect(s.overlays.find((o) => o.type === "evenement")).toMatchObject({ eid: ev.id, titre: ev.title });
  await page.evaluate((st) => { storyGroups = [{ authorId: st.authorId, stories: [st] }]; openStoryViewerAt(0, 0); }, s);
  const sticker = page.locator("#storyOverlays .story-sticker.st-evt");
  await expect(sticker).toBeVisible();
  // Le sticker est AU-DESSUS des zones de tap : c'est lui qui reçoit le toucher.
  const dessus = await sticker.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(t && t.closest(".story-sticker")); });
  expect(dessus).toBe(true);
  await sticker.click();
  await expect(page.locator("#storyViewer")).not.toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => window._openEventDetailId)).toBe(ev.id);
});

test("② @ Mention : posée, ouvre le profil, et prévient le compte à la publication", async ({ page }) => {
  await banc(page, "story");
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Mention"]').click();
  await page.locator("#meStickerPanel .me-sticker-recherche").fill("léa m");
  await page.locator(`#meStickerPanel [data-uid="${LEA}"]`).click();
  await expect(page.locator("#meOverlays .me-sticker-mention")).toHaveText("@Léa Martin");
  // Un compte d'exemple mentionné en plus : jamais prévenu.
  await page.evaluate(() => meAddOverlay({ type: "mention", uid: "u_lea", nom: "Léa Moreau", x: 50, y: 70 }));
  await page.evaluate(() => { window._supaReal = false; meState._enteredEditAt = 0; mePublish(); });
  await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
  const envoi = await page.evaluate(() => window.__envois[0]);
  expect(envoi.a).toBe(LEA);
  expect(envoi.texte).toContain("mentionné·e dans ma story");
  const s = await page.evaluate(() => state.seed.stories[0]);
  await page.evaluate((st) => { window.__profil = null; window.openUserProfile = (id) => { window.__profil = id; }; storyGroups = [{ authorId: st.authorId, stories: [st] }]; openStoryViewerAt(0, 0); }, s);
  await page.locator(`#storyOverlays .story-sticker.st-mention[data-uid="${LEA}"]`).click();
  await expect(page.locator("#storyViewer")).not.toHaveClass(/active/);
  expect(await page.evaluate(() => window.__profil)).toBe(LEA);
});

test("③ ❓ Question : la réponse d'un spectateur part en message à l'auteur", async ({ page }) => {
  await banc(page, "story");
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Question"]').click();
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille).toBeVisible();
  await page.locator("#feuilleConfirmationChamp").fill("Ton meilleur spot ?");
  await feuille.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.locator("#meOverlays .me-sticker-question")).toContainText("Ton meilleur spot ?");
  const data = await page.evaluate(() => _meOverlaysData().find((o) => o.type === "question"));
  expect(data.q).toBe("Ton meilleur spot ?");
  // Spectateur : la story est celle de Léa.
  await page.evaluate(({ d, lea }) => {
    meClose();
    const st = { id: "s_q", authorId: lea, authorName: "Léa Martin", text: "", overlays: [d], createdAt: Date.now() - 1000 };
    storyGroups = [{ authorId: lea, stories: [st] }];
    openStoryViewerAt(0, 0);
  }, { d: data, lea: LEA });
  await page.locator("#storyOverlays .st-q-rep").click();
  expect(await page.evaluate(() => window._storyEnPause)).toBe(true);
  const f2 = page.locator("#feuilleConfirmation");
  await page.locator("#feuilleConfirmationChamp").fill("La plage du Moulin");
  await f2.getByRole("button", { name: "Envoyer" }).click();
  await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
  const e = await page.evaluate(() => window.__envois[0]);
  expect(e.a).toBe(LEA);
  expect(e.texte).toContain("Ton meilleur spot ?");
  expect(e.texte).toContain("La plage du Moulin");
  expect(await page.evaluate(() => window._storyEnPause)).toBe(false);
});

test("④ bobine : Activité et Mention proposées, pas la Question", async ({ page }) => {
  await banc(page, "bobine");
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await expect(page.locator('#meStickerPanel [data-sticker="Activité"]')).toBeVisible();
  await expect(page.locator('#meStickerPanel [data-sticker="Mention"]')).toBeVisible();
  await expect(page.locator('#meStickerPanel [data-sticker="Question"]')).toHaveCount(0);
  // Le lecteur de bobines rend le sticker, touchable.
  const html = await page.evaluate((lea) => renderReelHTML({ id: "reel_s", authorId: "x", type: "video", isReel: true, video: "https://example.invalid/v.mp4", overlays: [{ type: "mention", uid: lea, nom: "Léa", x: 50, y: 50 }], text: "", likes: 0, comments: [] }, 0), LEA);
  expect(html).toContain('class="story-ov story-sticker st-mention"');
});

test("⑤ un sticker hostile d'un autre compte ne sort pas de ses attributs", async ({ page }) => {
  await bootOnboarded(page);
  const h = await page.evaluate(() => _storyOverlaysHtml([
    { type: "evenement", eid: 'e1" onclick="alert(1)', titre: "x" },
    { type: "evenement", eid: "e1", titre: "<img src=x onerror=alert(1)>", quand: "<b>" },
    { type: "mention", uid: "u'><svg onload=1>", nom: "x" },
    { type: "mention", uid: "u_ok", nom: '"><script>alert(1)</script>' },
    { type: "question", q: '" onmouseover="alert(1)' },
  ]));
  // Analysé comme le ferait le navigateur : aucun élément actif, aucun attribut on*.
  const dom = await page.evaluate((html) => {
    const d = document.createElement("div"); d.innerHTML = html;
    const els = Array.from(d.querySelectorAll("*"));
    return {
      interdits: els.filter((e) => /^(IMG|SVG|SCRIPT)$/i.test(e.tagName)).length,
      on: els.filter((e) => Array.from(e.attributes).some((a) => /^on/i.test(a.name))).length,
      evt: Array.from(d.querySelectorAll("[data-evt]")).map((e) => e.getAttribute("data-evt")),
      uid: Array.from(d.querySelectorAll("[data-uid]")).map((e) => e.getAttribute("data-uid")),
    };
  }, h);
  expect(dom.interdits).toBe(0);
  expect(dom.on).toBe(0);
  expect(dom.evt).toEqual(["e1"]);
  expect(dom.uid).toEqual(["u_ok"]);
});
