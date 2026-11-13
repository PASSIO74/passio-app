// ═══════════════════════════════════════════════════════════════════════════
// LOT-24 (audit UX/UI du 2026-11-10) — MESSAGERIE (SUITE)
//   ① MSG-C73 : le retour système ferme la visionneuse d'image, pas la
//      conversation ; fermer une conversation referme le panneau emoji.
//   ② MSG-C72 : une photo choisie est montrée avant de partir ; « Annuler »
//      ne laisse rien, « Envoyer » la fait partir.
//   ③ MSG-C65 / C76 : une vidéo a son bouton ⋯ ; une bulle est atteignable au
//      clavier (Entrée → actions) ; toucher MA réaction la retire.
//   ④ MSG-C14 / C15 : la rangée « Archivées » dit ses non-lus ; un message ne
//      compte qu'une fois au titre de l'application.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LEA = "a1b2c3d4-0000-4000-8000-00000000c0a1";

async function ouvrir(page, messages) {
  await page.evaluate(async ([id, msgs]) => {
    window._convNetLoaded = true;
    conversationsState = [{ id: "c_l24", userId: id, userName: "Léa", lastAt: Date.now(), unread: 0, messages: msgs }];
    goTo("messages");
    await openConversation("c_l24");
  }, [LEA, messages]);
  await page.waitForSelector("#conv-fullpage.active");
}

test("① MSG-C73 : retour → la visionneuse se ferme, la conversation reste ; le panneau emoji suit la conversation", async ({ page }) => {
  await bootOnboarded(page);
  await ouvrir(page, [{ id: "m1", from: LEA, text: "coucou", at: Date.now() - 1000 }]);
  await page.evaluate(() => openFullImg("data:image/png;base64,iVBORw0KGgo="));
  await expect(page.locator("#fullImgViewer")).toHaveCount(1);
  await page.goBack();
  await expect(page.locator("#fullImgViewer")).toHaveCount(0);
  await expect(page.locator("#conv-fullpage")).toHaveClass(/active/);
  await page.evaluate(() => { toggleEmojiPanel(); });
  await expect(page.locator("#convEmojiPanel")).toHaveClass(/open/);
  await page.evaluate(() => closeConversation());
  await expect(page.locator("#convEmojiPanel")).not.toHaveClass(/open/);
});

test("② MSG-C72 : la photo est montrée avant de partir", async ({ page }) => {
  await bootOnboarded(page);
  await ouvrir(page, []);
  const avant = await page.evaluate(() => {
    window.__envois = 0;
    const p0 = window._processAttach;
    window._processAttach = function () { window.__envois++; };
    window.passioCompressImage = () => Promise.resolve("data:image/png;base64,iVBORw0KGgo=");
    handleAttachFile({ files: [new File([new Uint8Array(10)], "photo.png", { type: "image/png" })], value: "x" }, "media");
    return true;
  });
  expect(avant).toBe(true);
  await expect(page.locator("#modalContent .modal-title")).toHaveText("Envoyer cette photo ?");
  expect(await page.evaluate(() => window.__envois), "rien n'est parti avant la confirmation").toBe(0);
  await page.locator("#pjApercuAnnuler").click();
  expect(await page.evaluate(() => window.__envois), "Annuler n'envoie rien").toBe(0);
  await page.evaluate(() => handleAttachFile({ files: [new File([new Uint8Array(10)], "photo.png", { type: "image/png" })], value: "x" }, "media"));
  await page.locator("#pjApercuEnvoyer").click();
  expect(await page.evaluate(() => window.__envois)).toBe(1);
});

test("③ MSG-C65 / C76 : ⋯ sur une vidéo, Entrée sur une bulle, ma réaction retirée d'un toucher", async ({ page }) => {
  await bootOnboarded(page);
  await ouvrir(page, [
    { id: "v1", from: LEA, video: "https://exemple.passio.test/v.mp4", at: Date.now() - 3000 },
    { id: "t1", from: LEA, text: "salut", at: Date.now() - 2000, reactions: { "❤️": 1 }, myReact: { "❤️": true } },
  ]);
  await page.evaluate(() => { window.__ouvertes = []; const o = window._openMsgActions; window._openMsgActions = function (c, m) { window.__ouvertes.push(m); }; });
  await page.locator('[data-mid="v1"] [data-actions]').click();
  expect(await page.evaluate(() => window.__ouvertes)).toEqual(["v1"]);
  const bulle = page.locator('.conv-bubble-wrap[data-mid="t1"]');
  await expect(bulle).toHaveAttribute("tabindex", "0");
  await expect(bulle).toHaveAttribute("aria-label", /Message de Léa/);
  await bulle.focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.__ouvertes)).toEqual(["v1", "t1"]);
  await page.locator('[data-mid="t1"] .conv-react-badge.mine').click();
  const reste = await page.evaluate(() => { const m = conversationsState[0].messages.find((x) => x.id === "t1"); return { r: m.reactions, mien: m.myReact }; });
  expect(reste.r["❤️"], "ma réaction est retirée").toBeUndefined();
});

test("④ MSG-C14 / C15 : non-lus des archives dits ; un message compte une fois au titre", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    window._convNetLoaded = true;
    conversationsState = [
      { id: "c_arch", userId: "a1b2c3d4-0000-4000-8000-00000000c0a2", userName: "Malik", archived: true, unread: 2, lastAt: Date.now(), messages: [{ id: "x", from: "a1b2c3d4-0000-4000-8000-00000000c0a2", text: "hé", at: Date.now() }] },
      { id: "c_vis", userId: "a1b2c3d4-0000-4000-8000-00000000c0a3", userName: "Nina", unread: 1, lastAt: Date.now(), messages: [{ id: "y", from: "a1b2c3d4-0000-4000-8000-00000000c0a3", text: "yo", at: Date.now() }] },
    ];
    state.notifications = [{ id: "n_msg", kind: "message", unread: true, createdAt: Date.now() }, { id: "n_like", kind: "like", unread: true, createdAt: Date.now() }];
    goTo("messages");
    renderMessages();
    renderBell();
    return { arch: (document.getElementById("archivedToggleRow") || {}).textContent || "", titre: document.title, horsMsg: _notifsNonLuesHorsMessages() };
  });
  expect(r.arch).toContain("2 non lus");
  expect(r.horsMsg, "la notification de message n'est pas recomptée").toBe(1);
  expect(r.titre).not.toContain("(5)");
});
