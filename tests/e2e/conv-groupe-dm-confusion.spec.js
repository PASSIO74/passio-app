// ═══════════════════════════════════════════════════════════════════════════
// UNE RÉACTION DANS UN GROUPE NE PEINT PAS LE DM DE SON AUTEUR DANS LE GROUPE
//
// Contre-revue du 2026-10-19. Les gestionnaires temps réel des réactions /
// suppressions (`_handleIncomingConvMessage`) et des accusés de lecture
// (`conv_reads`) cherchaient la conversation par un SEUL `find` aux deux
// critères : « même identifiant » OU « DM avec cet expéditeur ». Le premier de
// la liste gagnait. Si le DM avec Léa précédait le groupe où Léa venait de
// réagir, le DM était modifié et RENDU dans le panneau du groupe ouvert : la
// personne lisait ses messages privés avec Léa sous le titre du groupe — et
// répondait au groupe en croyant répondre au fil qu'elle voyait.
// L'identifiant exact passe d'abord ; « le DM de cette personne » n'est qu'un
// repli (entrée locale dont l'id diffère de celui du serveur).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("une réaction de Léa dans le groupe ouvert ne peint pas le DM de Léa dans le groupe", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    cacheRemoteProfile({ id: "u_lea", username: "Léa", emoji: "🌿", color: "#22c55e" });
    const convs = getConversations();
    convs.length = 0;
    // Le DM d'abord dans la liste : c'est ce qui faisait gagner le mauvais `find`.
    convs.push({ id: "c_lea", userId: "u_lea", userName: "Léa", unread: 0, lastAt: Date.now(),
      messages: [{ id: "d1", from: "u_lea", text: "SECRET DU DM", at: Date.now() - 5000 }] });
    convs.push({ id: "grp_club", isGroup: true, groupName: "Club", userIds: ["u_lea", "u_tom"], unread: 0, lastAt: Date.now() - 1000,
      messages: [{ id: "g1", from: "u_lea", fromName: "Léa", text: "Message du groupe", at: Date.now() - 4000 }] });
    saveConversationsNow();
  });
  await page.evaluate(() => openConversation("grp_club"));
  const fil = page.locator("#convFpThread");
  await expect(fil).toContainText("Message du groupe");

  await page.evaluate(() => _handleIncomingConvMessage({
    id: "r1", conv_id: "grp_club", from_id: "u_lea", created_at: new Date().toISOString(),
    content: JSON.stringify({ type: "react", target: "g1", emoji: "👍" }),
  }));

  await expect(fil).toContainText("Message du groupe");
  await expect(fil, "le DM de Léa est rendu dans le panneau du groupe").not.toContainText("SECRET DU DM");
  const reactions = await page.evaluate(() => {
    const cs = getConversations();
    return {
      groupe: JSON.stringify(cs.find((c) => c.id === "grp_club").messages.find((m) => m.id === "g1")),
      dm: JSON.stringify(cs.find((c) => c.id === "c_lea").messages),
    };
  });
  expect(reactions.groupe, "la réaction de Léa ne s'est pas posée sur le message du groupe").toContain("👍");
  expect(reactions.dm, "la réaction du groupe s'est posée dans le DM").not.toContain("👍");
});
