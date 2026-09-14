// MSG-10 — un membre bloqué ne s'affiche pas dans un groupe commun.
//
// LE DÉFAUT. Le blocage ne s'appliquait aux messages qu'à la RÉCEPTION temps
// réel (`_handleIncomingConvMessage` ignore un expéditeur bloqué). L'historique
// rechargé au démarrage (`supaLoadMessages`) et le fil rendu
// (`renderConvFpThread`) montraient tout ce que la personne bloquée avait écrit
// dans un groupe partagé ; l'aperçu de la liste Messages reprenait son dernier
// message ; et « @ » la proposait encore. Elle reste membre du groupe — c'est
// l'organisateur qui l'exclut — mais ce qu'elle écrit ne doit pas atteindre
// celui qui l'a bloquée.
//
// ① ② ③ sont éprouvés par RÉINJECTION : ils rougissent sur le code d'avant.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function preparer(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    state.hintsVus = { feed_auteur: true, profil_visite: true, second_profil: true };
    try { fermerHint(); } catch (e) {}
    cacheRemoteProfile({ id: "u_lea", username: "Léa", emoji: "🌿", color: "#22c55e" });
    cacheRemoteProfile({ id: "u_tom", username: "Tom", emoji: "🎸", color: "#f97316" });
    state.user.blocked = ["u_tom"];
    const convs = getConversations();
    convs.push({ id: "grp_1", isGroup: true, groupName: "Rando", userIds: ["u_lea", "u_tom"], unread: 0, lastAt: Date.now(),
      messages: [
        { id: "m1", from: "u_lea", fromName: "Léa", text: "on part à 9h", at: Date.now() - 3000 },
        { id: "m2", from: "u_tom", fromName: "Tom", text: "TEXTE DU BLOQUÉ", at: Date.now() - 2000 },
        { id: "m3", from: "me", text: "ok pour moi", at: Date.now() - 1000 },
        { id: "m4", from: "u_tom", fromName: "Tom", text: "DERNIER MOT DU BLOQUÉ", at: Date.now() },
      ] });
    saveConversations();
  });
}

test.describe("MSG-10 — blocage dans un groupe commun", () => {
  test("① le fil du groupe ne montre pas les messages du membre bloqué, et garde les autres", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => openConversation("grp_1"));
    const fil = page.locator("#convFpThread");
    await expect(fil).toContainText("on part à 9h");
    await expect(fil).toContainText("ok pour moi");
    // RÉINJECTION : sur le code d'avant, les deux textes du bloqué sont rendus.
    await expect(fil).not.toContainText("TEXTE DU BLOQUÉ");
    await expect(fil).not.toContainText("DERNIER MOT DU BLOQUÉ");
    expect(await page.evaluate(() => getConversations().find((c) => c.id === "grp_1").messages.length),
      "rien n'est supprimé : le filtre est à l'affichage, le débloquer rend tout").toBe(4);
  });

  test("② l'aperçu de la liste Messages ne reprend pas le dernier mot du bloqué", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => { goTo("messages"); renderMessages(); });
    const carte = page.locator("#screen-messages").getByText("Rando").first();
    await expect(carte).toBeVisible();
    await expect(page.locator("#screen-messages")).not.toContainText("DERNIER MOT DU BLOQUÉ");
    await expect(page.locator("#screen-messages")).toContainText("ok pour moi");
  });

  test("③ « @ » ne propose plus le membre bloqué", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => openConversation("grp_1"));
    const input = page.locator("#convFpInput");
    await input.click();
    await page.keyboard.type("@");
    await expect(page.locator("#convMentionBox")).toBeVisible();
    await expect(page.locator("#convMentionBox")).toContainText("Léa");
    await expect(page.locator("#convMentionBox")).not.toContainText("Tom");
  });

  test("④ débloquer rend tout : le filtre est à l'affichage, rien n'est perdu", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => { state.user.blocked = []; saveState(); return openConversation("grp_1"); });
    await expect(page.locator("#convFpThread")).toContainText("TEXTE DU BLOQUÉ");
    await expect(page.locator("#convFpThread")).toContainText("DERNIER MOT DU BLOQUÉ");
  });
});
