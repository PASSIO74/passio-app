// ═══════════════════════════════════════════════════════════════════════════
// LOT-29 (audit UX/UI du 2026-11-10) — MESSAGERIE (SUITE)
//   ① MSG-C20 : l'en-tête d'un groupe montre l'avatar du groupe (pas la photo
//      d'un membre), son nom ouvre la fenêtre du groupe, et la discussion d'une
//      activité mène à l'activité.
//   ② MSG-C25 : ouvrir une conversation ne déclenche plus la demande système de
//      notifications.
//   ③ MSG-C86 : la barre « Réponse à … » ne cache plus le dernier message.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LEA = "a1b2c3d4-0000-4000-8000-00000000c3a1";
const MALIK = "a1b2c3d4-0000-4000-8000-00000000c3a2";

test("① MSG-C20 : avatar du groupe, nom qui ouvre le groupe, lien vers l'activité", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async ([lea, malik]) => {
    const attendre = (ms) => new Promise((res) => setTimeout(res, ms));
    state.seed.users = (state.seed.users || []).concat([{ id: lea, name: "Léa", photoUrl: "https://example.org/lea.jpg" }]);
    const ev = (allEvents() || [])[0];
    conversationsState = [
      { id: "c_grp", isGroup: true, groupName: "Rando", userIds: [lea, malik], userId: lea, lastAt: Date.now(), messages: [{ id: "m", from: lea, text: "yo", at: Date.now() }] },
      { id: "evgrp_" + ev.id, isGroup: true, groupName: "📍 " + ev.title, userIds: [lea], userId: lea, lastAt: Date.now(), messages: [] },
    ];
    openConversation("c_grp");
    await attendre(80);
    const av = document.querySelector("#convFpHead .conv-fp-head-avatar");
    const fond = av ? av.getAttribute("style") || "" : "";
    const ligne = document.querySelector("#convFpHead .conv-fp-passion").textContent;
    document.querySelector("#convFpHead .conv-fp-head-info").click();
    await attendre(80);
    const fenetre = (document.getElementById("modalContent") || {}).textContent || "";
    try { closeModal(); } catch (e) {}
    try { closeConversation(); } catch (e) {}
    await attendre(80);
    openConversation("evgrp_" + ev.id);
    await attendre(80);
    const lien = document.querySelector("#convFpHead .conv-fp-lien-activite");
    return { fond, ligne, fenetre, lien: lien ? { texte: lien.textContent, ev: lien.getAttribute("data-ev") } : null, evId: ev.id };
  }, [LEA, MALIK]);
  expect(r.fond).not.toContain("lea.jpg");
  expect(r.ligne).toBe("👥 3 membres");
  expect(r.fenetre).toContain("Membres (3)");
  expect(r.lien).toEqual({ texte: "Voir l'activité ›", ev: r.evId });
});

test("② MSG-C25 : ouvrir une conversation ne demande pas la permission au système", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (lea) => {
    window.__demandes = 0;
    window.Notification = function () {};
    window.Notification.permission = "default";
    window.Notification.requestPermission = async () => { window.__demandes++; return "default"; };
    window._callNotifAsked = false;
    conversationsState = [{ id: "c_dm", userId: lea, userName: "Léa", lastAt: Date.now(), messages: [{ id: "m", from: lea, text: "salut", at: Date.now() }] }];
    openConversation("c_dm");
    await new Promise((res) => setTimeout(res, 120));
    return window.__demandes;
  }, LEA);
  expect(r).toBe(0);
});

test("③ MSG-C86 : la barre de réponse ne cache pas le dernier message", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootOnboarded(page);
  const r = await page.evaluate(async (lea) => {
    const attendre = (ms) => new Promise((res) => setTimeout(res, ms));
    const t0 = Date.now() - 60 * 60000;
    const messages = Array.from({ length: 30 }, (_, i) => ({ id: "m" + i, from: i % 2 ? "me" : lea, text: "message numéro " + i, at: t0 + i * 60000 }));
    conversationsState = [{ id: "c_rep", userId: lea, userName: "Léa", lastAt: Date.now(), messages }];
    openConversation("c_rep");
    await attendre(250);
    const fil = document.getElementById("convFpThread");
    fil.scrollTop = fil.scrollHeight;
    await attendre(50);
    _setReplyTo("c_rep", "m29");
    await attendre(80);
    const bulles = fil.querySelectorAll(".conv-bubble-wrap");
    const derniere = bulles[bulles.length - 1];
    const barre = document.getElementById("convReplyBar");
    return {
      bas: derniere ? derniere.getBoundingClientRect().bottom : null,
      barreHaut: barre ? barre.getBoundingClientRect().top : null,
      filBas: fil.getBoundingClientRect().bottom,
      annuler: (() => { const b = barre && barre.querySelector("button[aria-label='Annuler la réponse']"); if (!b) return null; const q = b.getBoundingClientRect(); return { l: q.width, h: q.height }; })(),
    };
  }, LEA);
  expect(r.bas).not.toBeNull();
  expect(r.barreHaut).not.toBeNull();
  expect(r.annuler, "le ✕ est un bouton nommé").not.toBeNull();
  expect(Math.min(r.annuler.l, r.annuler.h)).toBeGreaterThanOrEqual(44);
  expect(r.bas, "le dernier message reste au-dessus de la barre").toBeLessThanOrEqual(Math.min(r.barreHaut, r.filBas) + 1);
});
