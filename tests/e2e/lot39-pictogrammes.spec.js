// ═══════════════════════════════════════════════════════════════════════════
// LOT-39 (audit UX/UI du 2026-11-10, FIL-C23, MSG-C82) — PICTOGRAMMES DE FONCTION
// Les quatre menus (commentaire, publication d'autrui, message, réglages d'une
// conversation) dessinent leurs fonctions au trait : chaque entrée porte un
// `svg.picto`, et aucun emoji ne sert d'icône. Les réactions (contenu) restent
// des emojis.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUTRE = "a1b2c3d4-0000-4000-8000-00000000c839";

test("les quatre menus : un pictogramme par entrée, aucun emoji d'icône", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate((autre) => {
    const EMOJI = /\p{Extended_Pictographic}/u;
    const mesure = (entrees, icone) => entrees.map((e) => {
      const ic = icone ? e.querySelector(icone) : e;
      const texteIcone = icone ? (ic ? ic.textContent : "") : [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("");
      return { svg: !!e.querySelector("svg.picto"), emoji: EMOJI.test(texteIcone) };
    });
    const out = {};

    // ① Réglages d'une conversation
    conversationsState = [{ id: "c_l39", userId: autre, userName: "Léa", lastAt: Date.now(),
      messages: [{ id: "m_l39", from: autre, text: "salut", at: Date.now() }] }];
    openConvSettings("c_l39");
    out.reglages = mesure([...document.querySelectorAll("#convSettingsContent .csetting-item")], ".csetting-icon");
    closeConvSettings();

    // ② Feuille d'actions d'un message
    _openMsgActions("c_l39", "m_l39");
    out.message = mesure([...document.querySelectorAll(".modal .csetting-item, #modalContent .csetting-item")], ".csetting-icon");
    closeModal();

    // ③ Publication d'autrui
    const p = JSON.parse(JSON.stringify(state.seed.posts[0]));
    p.id = "p_l39"; p.authorId = autre; state.seed.posts.unshift(p);
    openPostOptionsAutrui("p_l39");
    out.publication = mesure([...document.querySelectorAll(".post-options-sheet .post-option")].filter((b) => !/Annuler/.test(b.textContent)), null);
    closeModal();
    return out;
  }, AUTRE);

  for (const [menu, entrees] of Object.entries(r)) {
    expect(entrees.length, menu + " : des entrées mesurées").toBeGreaterThan(1);
    for (const e of entrees) {
      expect(e.svg, menu + " : pictogramme").toBe(true);
      expect(e.emoji, menu + " : pas d'emoji d'icône").toBe(false);
    }
  }
});

test("menu d'un commentaire : pictogrammes, aucun emoji d'icône", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const EMOJI = /\p{Extended_Pictographic}/u;
    const post = state.seed.posts.find((p) => p.comments && p.comments.length) || state.seed.posts[0];
    if (typeof openPost === "function") openPost(post.id);
    const t = (typeof _findCommentThread === "function") ? _findCommentThread(post.id) : null;
    const c = t && t.comments && t.comments[0];
    if (!c) return null;
    openCommentOptions(post.id, c.id, 0);
    const rangs = [...document.querySelectorAll("#cmtSheet .cmt-sheet-row")].filter((b) => !b.classList.contains("cancel"));
    const out = rangs.map((b) => ({ svg: !!b.querySelector(".cmt-sheet-ic svg.picto"), emoji: EMOJI.test(b.querySelector(".cmt-sheet-ic").textContent) }));
    _closeCmtSheet();
    return out;
  });
  test.skip(r === null, "aucun commentaire d'exemple disponible");
  expect(r.length).toBeGreaterThan(3);
  for (const e of r) { expect(e.svg).toBe(true); expect(e.emoji).toBe(false); }
});
