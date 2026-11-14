// ═══════════════════════════════════════════════════════════════════════════
// LOT-49 (audit UX/UI du 2026-11-10, BOB-C09) — RÉPONDRE À UNE STORY
//   ① sous la story d'un compte réel : « Répondre à Léa… » ; depuis le
//      2026-11-14 (façon Instagram), « Envoyer » écrit la réponse (story citée)
//      dans le fil direct de Léa SANS quitter la story ;
//   ② ma story, ou la story d'un compte bloqué : aucun champ.
// Compte de démonstration local ; conversation et envoi simulés.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "a1b2c3d4-0000-4000-8000-00000000c850";
const LEA = "a1b2c3d4-0000-4000-8000-00000000c851";

async function banc(page) {
  await bootOnboarded(page);
  await page.evaluate(({ moi, lea }) => {
    MY_UID = moi;
    window._uidEstUnCompte = () => true;
    window.__envois = 0;
    window._sendTextToSupa = () => { window.__envois++; };
    window.startDirectMessage = async (uid, nom) => {
      conversationsState = [{ id: "c_l49", userId: uid, userName: nom, lastAt: Date.now(), messages: [] }];
      openConversation("c_l49");
    };
    window.__story = (auteur) => {
      storyGroups = [{ authorId: auteur, stories: [{ id: "s_l49", authorId: auteur, authorName: "Léa", text: "Qui passe les essayer avant samedi ?", createdAt: Date.now() - 600000, bg: "#7c3aed" }] }];
      openStoryViewerAt(0, 0);
    };
  }, { moi: MOI, lea: LEA });
}

test("① répondre à la story d'un compte réel : le message part SANS quitter la story (2026-11-14, façon Instagram)", async ({ page }) => {
  await banc(page);
  await page.evaluate((lea) => window.__story(lea), LEA);
  const champ = page.locator("#storyReplyBar .story-reply-input");
  await expect(champ).toBeVisible();
  await expect(champ).toHaveAttribute("placeholder", "Répondre à Léa…");
  await champ.fill("Moi ! Samedi matin ?");
  await page.locator("#storyReplyBar .story-reply-send").click();
  await page.waitForTimeout(500);
  const r = await page.evaluate((lea) => {
    const c = getConversations().find((x) => x && !x.isGroup && x.userId === lea);
    const m = c && c.messages[c.messages.length - 1];
    return {
      story: document.getElementById("storyViewer").classList.contains("active"),
      texte: (m && m.text) || "",
      envois: window.__envois,
      champ: document.querySelector("#storyReplyBar .story-reply-input").value,
    };
  }, LEA);
  expect(r.story, "la story reste ouverte").toBe(true);
  expect(r.texte).toContain("Qui passe les essayer avant samedi ?");
  expect(r.texte).toContain("Moi ! Samedi matin ?");
  expect(r.envois, "un message, parti au geste « Envoyer »").toBe(1);
  expect(r.champ, "le champ est vidé").toBe("");
});

test("② ma story, ou un compte bloqué : pas de champ", async ({ page }) => {
  await banc(page);
  const r = await page.evaluate(({ moi, lea }) => {
    window.__story(moi);
    const mienne = !!document.getElementById("storyReplyBar");
    closeStoryViewer();
    window.isBlocked = (id) => id === lea;
    window.__story(lea);
    const bloque = !!document.getElementById("storyReplyBar");
    closeStoryViewer();
    return { mienne, bloque };
  }, { moi: MOI, lea: LEA });
  expect(r).toEqual({ mienne: false, bloque: false });
});
