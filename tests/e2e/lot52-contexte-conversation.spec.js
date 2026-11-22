// ═══════════════════════════════════════════════════════════════════════════
// LOT-52 (audit UX/UI du 2026-11-10, PCS-C05) — LA CONVERSATION RAPPELLE LA
// PUBLICATION QUI L'A MOTIVÉE
//   ① publication → profil de son auteur → « Message » : la conversation
//      rappelle la publication au-dessus du champ ; rien n'est envoyé ;
//   ② le rappel se ferme ; une conversation ouverte autrement n'en a pas.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LEA = "a1b2c3d4-0000-4000-8000-00000000c852";

async function banc(page) {
  await bootOnboarded(page);
  await page.evaluate((lea) => {
    conversationsState = []; saveConversationsNow();
    state.seed.posts.unshift({ id: "p_l52", authorId: lea, authorName: "Léa", passion: "musique", type: "text", text: "Qui veut jammer jeudi soir au parc ?", createdAt: Date.now(), likes: 0, comments: [] });
    window.__envois = 0;
    window._sendTextToSupa = () => { window.__envois++; };
    window.openUserProfile = () => {};
  }, LEA);
}

test("① depuis une publication : la conversation la rappelle, rien n'est envoyé", async ({ page }) => {
  await banc(page);
  const r = await page.evaluate(async (lea) => {
    _contexteDepuisPublication("p_l52");
    await startDirectMessage(lea, "Léa");
    await new Promise((res) => setTimeout(res, 500));
    const c = document.getElementById("convContexte");
    return { texte: c && c.textContent, envois: window.__envois, messages: (getConversations().find((x) => x.userId === lea) || {}).messages.length };
  }, LEA);
  expect(r.texte).toContain("Qui veut jammer jeudi soir au parc ?");
  expect(r.envois).toBe(0);
  expect(r.messages).toBe(0);
});

test("② le rappel se ferme ; sans publication d'origine, aucun rappel", async ({ page }) => {
  await banc(page);
  const r = await page.evaluate(async (lea) => {
    _contexteDepuisPublication("p_l52");
    await startDirectMessage(lea, "Léa");
    await new Promise((res) => setTimeout(res, 500));
    document.querySelector("#convContexte .conv-contexte-fermer").click();
    const ferme = !document.getElementById("convContexte");
    closeConversation();
    await startDirectMessage(lea, "Léa");
    await new Promise((res) => setTimeout(res, 500));
    return { ferme, sansOrigine: !document.getElementById("convContexte") };
  }, LEA);
  expect(r).toEqual({ ferme: true, sansOrigine: true });
});
