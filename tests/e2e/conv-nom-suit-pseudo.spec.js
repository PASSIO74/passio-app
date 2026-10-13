// Un pseudo changé se voit dans la messagerie (2026-10-13).
//
// Vécu : un membre renomme son compte ; la liste Messages continuait de
// l'afficher sous son ANCIEN nom (« Profil »), alors que la ligne de ses
// passions, lue sur le profil vivant, était déjà à jour. `c.userName` est une
// copie écrite à la création du fil : le profil réel en cache fait foi.
//
// Ce que cette suite prouve :
//   ① la liste affiche le nom du profil réel, pas la copie de la conversation ;
//   ② la copie est réalignée (en-tête de la conversation ouverte compris) ;
//   ③ un interlocuteur de DÉMONSTRATION garde le nom du fil (aucun profil réel) ;
//   ④ le cache de profils n'est pas écrasé par une copie périmée.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window._convNetLoaded = true;
  });
}

async function ouvrirMessages(page) {
  await page.evaluate(() => goTo("messages"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-messages");
    return el && el.classList.contains("active");
  });
  await page.evaluate(() => renderMessages());
}

const REEL = "11111111-2222-4333-8444-555555555555";
const carte = (page, id) => page.locator(`#messageList .msg-card[onclick*="${id}"]`);

test.describe("Messagerie — le nom suit le pseudo", () => {
  test("① ② la liste et la conversation prennent le nouveau pseudo", async ({ page }) => {
    await boot(page);
    await page.evaluate((id) => {
      cacheRemoteProfile({ id, username: "Ben test 1 sur portable", emoji: "🎸", color: "#8b5cf6", avatar_url: null });
      conversationsState = [{
        id: "conv_pseudo", userId: id, userName: "Profil",
        lastAt: Date.now() - 1000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m1", from: "me", text: "salut", at: Date.now() - 1000 }],
      }];
    }, REEL);
    await ouvrirMessages(page);

    await expect(carte(page, "conv_pseudo").locator(".msg-name")).toHaveText("Ben test 1 sur portable");
    expect(await page.evaluate(() => getConversations()[0].userName)).toBe("Ben test 1 sur portable");
  });

  test("③ un interlocuteur de démonstration garde le nom du fil", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      conversationsState = [{
        id: "conv_demo_nom", userId: "u_nina", userName: "Nina Costa",
        lastAt: Date.now() - 1000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m1", from: "u_nina", text: "coucou", at: Date.now() - 1000 }],
      }];
    });
    await ouvrirMessages(page);
    await expect(carte(page, "conv_demo_nom").locator(".msg-name")).toHaveText("Nina Costa");
  });

  test("④ une copie périmée n'écrase pas le cache de profils", async ({ page }) => {
    await boot(page);
    const nom = await page.evaluate((id) => {
      _profileCache.set(id, { username: "Nouveau pseudo", emoji: "✨", color: "#8b5cf6" });
      _primeProfileCache([{ id: "c", userId: id, userName: "Ancien pseudo" }]);
      return _profileCache.get(id).username;
    }, REEL);
    expect(nom).toBe("Nouveau pseudo");
  });
});
