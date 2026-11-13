// ═══════════════════════════════════════════════════════════════════════════
// LOT-49 (audit UX/UI du 2026-11-10, BOB-C09) — RÉPONDRE À UNE STORY
//   ① sous la story d'un compte réel : « Répondre à Léa… » ; envoyer ouvre la
//      conversation de Léa avec la réponse PRÉREMPLIE (story citée) — rien ne
//      part tout seul ;
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

test("① répondre à la story d'un compte réel : conversation ouverte, réponse préremplie, rien d'envoyé", async ({ page }) => {
  await banc(page);
  await page.evaluate((lea) => window.__story(lea), LEA);
  const champ = page.locator("#storyReplyBar .story-reply-input");
  await expect(champ).toBeVisible();
  await expect(champ).toHaveAttribute("placeholder", "Répondre à Léa…");
  await champ.fill("Moi ! Samedi matin ?");
  await page.locator("#storyReplyBar .story-reply-send").click();
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({
    story: document.getElementById("storyViewer").classList.contains("active"),
    conv: window._openedConvId,
    texte: (document.getElementById("convFpInput") || {}).value || "",
    envois: window.__envois,
  }));
  expect(r.story).toBe(false);
  expect(r.conv).toBe("c_l49");
  expect(r.texte).toContain("Qui passe les essayer avant samedi ?");
  expect(r.texte).toContain("Moi ! Samedi matin ?");
  expect(r.envois, "rien ne part tout seul").toBe(0);
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
