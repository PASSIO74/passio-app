// ═══════════════════════════════════════════════════════════════════════════
// LOT-46 (audit UX/UI du 2026-11-10) — MESSAGERIE
//   ① MSG-C63 : hors ligne, le bandeau global ne recouvre plus l'en-tête d'une
//      conversation ; l'état se dit sous l'en-tête.
//   ② MSG-C69 : « Proposer un moment IRL » du menu « + » passe par le MÊME
//      verdict serveur que le bouton d'en-tête ; un refus n'ouvre rien.
//   ③ PCS-C02 : une conversation ouverte d'un profil (depuis le fil) revient
//      au fil et rouvre le profil.
//   ④ MSG-C74 : le brouillon survit au rechargement serveur des conversations.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LEA = "a1b2c3d4-0000-4000-8000-00000000c846";

async function ouvrir(page) {
  await bootOnboarded(page);
  await page.evaluate((lea) => {
    conversationsState = [{ id: "c_l46", userId: lea, userName: "Léa", lastAt: Date.now(), messages: [{ id: "q1", from: lea, text: "salut", at: Date.now() }] }];
    saveConversationsNow();
    openConversation("c_l46");
  }, LEA);
  await page.waitForTimeout(350);
}

test("① MSG-C63 : hors ligne, l'en-tête de la conversation reste touchable", async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(() => {
    document.body.classList.add("passio-hors-ligne");
    const ban = document.getElementById("offlineBanner");
    if (ban) ban.style.display = "flex";
    const back = document.querySelector("#conv-fullpage .conv-fp-back");
    const b = back.getBoundingClientRect();
    const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const tete = document.querySelector("#conv-fullpage .conv-fp-head");
    return { banniere: ban ? getComputedStyle(ban).display : "absent", retourTouchable: t === back || back.contains(t), ligne: getComputedStyle(tete, "::after").content };
  });
  expect(r.banniere).toBe("none");
  expect(r.retourTouchable).toBe(true);
  expect(r.ligne).toMatch(/Hors ligne/);
});

test("② MSG-C69 : un refus du serveur n'ouvre pas le formulaire depuis le menu « + »", async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(async () => {
    window.__ouvertures = 0; window.__toasts = [];
    window.openCreateEvent = () => { window.__ouvertures++; };
    if (window.PassioUIV3) window.PassioUIV3.proposeOuting = () => { window.__ouvertures++; };
    window.toast = (m) => window.__toasts.push(String(m));
    window.irlProposalServerVerdict = async () => ({ ok: false, reason: "bloque" });
    const item = document.querySelector(".v6c-item");
    const libelle = item ? item.textContent.trim() : null;
    if (item) item.click();
    await new Promise((res) => setTimeout(res, 250));
    const refus = { ouvertures: window.__ouvertures, toasts: window.__toasts.slice() };
    window.irlProposalServerVerdict = async () => ({ ok: true, reason: "ok" });
    openConversation("c_l46");
    await new Promise((res) => setTimeout(res, 300));
    const item2 = document.querySelector(".v6c-item");
    if (item2) item2.click();
    await new Promise((res) => setTimeout(res, 400));
    return { libelle, refus, accord: window.__ouvertures };
  });
  test.skip(r.libelle === null, "lot UI-6C non monté dans ce banc");
  expect(r.libelle).toBe("Proposer un moment IRL");
  expect(r.refus.ouvertures).toBe(0);
  expect(r.refus.toasts.join(" ")).toMatch(/indisponible/);
  expect(r.accord).toBe(1);
});

test("③ PCS-C02 : retour vers le fil, profil rouvert", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (lea) => {
    conversationsState = []; saveConversationsNow();
    goTo("feed");
    window.__profils = [];
    const vrai = window.openUserProfile;
    window.openUserProfile = (id) => { window.__profils.push(id); };
    _convOrigineProfil(lea);
    await startDirectMessage(lea, "Léa");
    await new Promise((res) => setTimeout(res, 400));
    const ouverte = document.getElementById("conv-fullpage").classList.contains("active");
    closeConversation();
    await new Promise((res) => setTimeout(res, 200));
    const ecran = (document.querySelector(".screen.active") || {}).id;
    window.openUserProfile = vrai;
    return { ouverte, ecran, profils: window.__profils };
  }, LEA);
  expect(r.ouverte).toBe(true);
  expect(r.ecran).toBe("screen-feed");
  expect(r.profils).toEqual([LEA]);
});

test("③bis PCS-C02 : ouverte depuis la liste, elle revient à la liste", async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(async () => {
    goTo("messages");
    openConversation("c_l46");
    await new Promise((res) => setTimeout(res, 250));
    closeConversation();
    return (document.querySelector(".screen.active") || {}).id;
  });
  expect(r).toBe("screen-messages");
});

test("④ MSG-C74 : le brouillon survit au rechargement serveur", async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(async (lea) => {
    const c = getConversations().find((x) => x.id === "c_l46");
    c.draft = "message commencé"; c.bg = "linear-gradient(160deg,#eef6fc,#dcecf7)";
    saveConversationsNow();
    window.supaLoadMyConversations = async () => [{ id: "c_l46", userId: lea, userName: "Léa", lastAt: Date.now(), messages: [] }];
    await _rafraichirConversationsServeur();
    const cc = getConversations().find((x) => x.id === "c_l46");
    return { draft: cc && cc.draft, bg: cc && cc.bg };
  }, LEA);
  expect(r.draft).toBe("message commencé");
  expect(r.bg).toBe("linear-gradient(160deg,#eef6fc,#dcecf7)");
});
