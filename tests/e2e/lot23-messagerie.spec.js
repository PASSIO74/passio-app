// ═══════════════════════════════════════════════════════════════════════════
// LOT-23 (audit UX/UI du 2026-11-10) — MESSAGERIE (SUITE)
//   ① MSG-C87 : une conversation d'exemple le dit dans l'en-tête, et la saisie
//      est remplacée par la sortie (« Découvrir des profils »).
//   ② MSG-C78 : une conversation avec un compte que J'AI bloqué remplace la
//      saisie par « Tu as bloqué … » + « Débloquer » ; débloquer rend la saisie.
//   ③ une conversation ordinaire garde sa saisie, sans ligne d'issue.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function ouvrir(page, conv, avant) {
  await page.evaluate(async ([c, a]) => {
    window._convNetLoaded = true;
    if (a === "bloquer") { state.user.blocked = [c.userId]; }
    conversationsState = [c];
    goTo("messages");
    await openConversation(c.id);
  }, [conv, avant || null]);
  await page.waitForSelector("#conv-fullpage.active");
}
const barreVisible = (page) => page.evaluate(() => getComputedStyle(document.querySelector("#conv-fullpage .conv-toolbar")).display !== "none");

test("① MSG-C87 : une conversation d'exemple le dit et propose la sortie", async ({ page }) => {
  await bootOnboarded(page);
  const demo = await page.evaluate(() => (typeof SEED_CONVERSATIONS !== "undefined" && SEED_CONVERSATIONS[0]) ? JSON.parse(JSON.stringify(SEED_CONVERSATIONS[0])) : null);
  test.skip(!demo, "aucune conversation d'exemple dans ce socle");
  await ouvrir(page, demo);
  await expect(page.locator("#convFpHead .conv-fp-passion")).toHaveText("Exemple PASSIO");
  await expect(page.locator("#convFpIssue")).toHaveAttribute("data-issue", "exemple");
  await expect(page.locator("#convFpIssue")).toContainText("Conversation d'exemple");
  expect(await barreVisible(page)).toBe(false);
  await page.locator("#convFpIssue button").click();
  await page.waitForFunction(() => document.getElementById("screen-explore").classList.contains("active"));
});

test("② MSG-C78 : compte bloqué — la saisie laisse place à « Débloquer », qui la rend", async ({ page }) => {
  await bootOnboarded(page);
  await ouvrir(page, { id: "c_l23_bloque", userId: "u_l23_ines", userName: "Inès", lastAt: Date.now(), unread: 0, messages: [] }, "bloquer");
  await expect(page.locator("#convFpIssue")).toHaveAttribute("data-issue", "bloque");
  await expect(page.locator("#convFpIssue")).toContainText("Tu as bloqué");
  expect(await barreVisible(page)).toBe(false);
  await page.locator("#convFpIssue button", { hasText: "Débloquer" }).click();
  await expect(page.locator("#convFpIssue")).toHaveCount(0);
  expect(await barreVisible(page)).toBe(true);
});

test("③ une conversation ordinaire garde sa saisie", async ({ page }) => {
  await bootOnboarded(page);
  await ouvrir(page, { id: "c_l23_ok", userId: "u_l23_lea", userName: "Léa", lastAt: Date.now(), unread: 0, messages: [] });
  await expect(page.locator("#convFpIssue")).toHaveCount(0);
  expect(await barreVisible(page)).toBe(true);
});
