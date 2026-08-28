// Lot UI-6A — l'inbox Messages du §10.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① la tête est en place : « Messages », un « + », puis la recherche —
//      et les deux gros boutons ont cédé la place ;
//   ② le « + » regroupe les deux gestes et appelle les moteurs EXISTANTS ;
//   ③ une conversation 1:1 porte la Passio de son interlocuteur devant
//      l'aperçu, un groupe n'en porte pas ;
//   ④ LE contrôle central : cette ligne SURVIT à un nouveau rendu.
//      `renderMessages()` repart de zéro à chaque envoi, chaque réception et
//      chaque frappe dans la recherche — une décoration posée une seule fois
//      disparaîtrait au premier message reçu, en silence ;
//   ⑤ la recherche DÉPLACÉE alimente toujours le même moteur ;
//   ⑥ les deux kill switches, au boot et en cours de session, rendent l'inbox
//      historique — boutons, recherche à sa place, aucune ligne de Passio ;
//   ⑦ mobile 320 / 390 / 430 px : aucun débordement, cibles ≥ 44 px.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_6a", "0"));
  }
  await bootOnboarded(page, opts.errors || null, 1, {});
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    // Le squelette de chargement masque la liste tant que le réseau n'a pas
    // répondu : ici il n'y a pas de réseau, on déclare le chargement fini.
    window._convNetLoaded = true;
  });
}

// Deux conversations construites à la main : une 1:1 avec Nina (dont la Passio
// de démonstration est « voyage ») et un groupe. On écrit dans l'état en
// mémoire plutôt que dans localStorage : `getConversations()` sert le cache
// s'il existe, et un test qui écrirait à côté mesurerait l'ancien contenu.
async function poserConversations(page) {
  await page.evaluate(() => {
    conversationsState = [
      {
        id: "v6a_nina", userId: "u_nina", userName: "Nina Costa",
        lastAt: Date.now() - 60000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m1", from: "u_nina", text: "On part quand ?", at: Date.now() - 60000 }],
      },
      {
        id: "v6a_groupe", isGroup: true, groupName: "Rando du dimanche",
        userIds: ["u_nina", "u_lea"],
        lastAt: Date.now() - 120000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m2", from: "u_lea", text: "Rendez-vous à 9h", at: Date.now() - 120000 }],
      },
    ];
  });
}

async function ouvrirMessages(page) {
  await page.evaluate(() => goTo("messages"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-messages");
    return el && el.classList.contains("active");
  });
  await page.evaluate(() => renderMessages());
  await page.waitForTimeout(250);
}

const carte = (page, id) => page.locator(`#messageList .msg-card[onclick*="${id}"]`);

test.describe("UI-6A — inbox Messages", () => {
  test("URL normale : « Messages », un « + », la recherche dessous", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await poserConversations(page);
    await ouvrirMessages(page);

    const tete = page.locator("#v6aHead");
    await expect(tete).toBeVisible();
    await expect(page.locator(".v6a-title")).toHaveText("Messages");
    await expect(page.locator("[data-v6a-plus]")).toBeVisible();

    // La recherche est DANS la tête, et c'est bien le champ historique : le
    // même id, donc le même `oninput` et le même moteur.
    await expect(tete.locator("#convGlobalSearch")).toHaveCount(1);

    // Les deux gros boutons sont masqués, JAMAIS retirés.
    await expect(page.locator('#screen-messages button[onclick="openNewMessage()"]')).toHaveCount(1);
    await expect(page.locator('#screen-messages button[onclick="openNewMessage()"]')).toBeHidden();
    await expect(page.locator('#screen-messages button[onclick="openCreateGroup()"]')).toBeHidden();

    // La tête est en PREMIER dans l'écran.
    expect(await page.evaluate(() =>
      document.getElementById("screen-messages").firstElementChild.id)).toBe("v6aHead");

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("le « + » regroupe les deux gestes et appelle les moteurs existants", async ({ page }) => {
    await boot(page);
    await poserConversations(page);
    await ouvrirMessages(page);

    await page.evaluate(() => {
      window.__appels = [];
      window.openNewMessage = () => window.__appels.push("message");
      window.openCreateGroup = () => window.__appels.push("groupe");
    });

    await page.locator("[data-v6a-plus]").click();
    await expect(page.locator("#v6aMenu")).toBeVisible();
    await expect(page.locator("#v6aMenu .v6a-menu-item")).toHaveCount(2);
    await expect(page.locator("[data-v6a-plus]")).toHaveAttribute("aria-expanded", "true");

    await page.locator("#v6aMenu .v6a-menu-item").first().click();
    await expect(page.locator("#v6aMenu")).toHaveCount(0);
    expect(await page.evaluate(() => window.__appels)).toEqual(["message"]);

    await page.locator("[data-v6a-plus]").click();
    await page.locator("#v6aMenu .v6a-menu-item").nth(1).click();
    expect(await page.evaluate(() => window.__appels)).toEqual(["message", "groupe"]);
  });

  test("le menu se ferme à Escape et au clic extérieur", async ({ page }) => {
    await boot(page);
    await poserConversations(page);
    await ouvrirMessages(page);

    await page.locator("[data-v6a-plus]").click();
    await expect(page.locator("#v6aMenu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#v6aMenu")).toHaveCount(0);

    await page.locator("[data-v6a-plus]").click();
    await expect(page.locator("#v6aMenu")).toBeVisible();
    await page.locator(".v6a-title").click();
    await expect(page.locator("#v6aMenu")).toHaveCount(0);
    await expect(page.locator("[data-v6a-plus]")).toHaveAttribute("aria-expanded", "false");
  });

  test("« Passio · aperçu » sur une conversation 1:1, rien sur un groupe", async ({ page }) => {
    await boot(page);
    await poserConversations(page);
    await ouvrirMessages(page);

    const attendu = await page.evaluate(() => passionById(userById("u_nina").passion).label);
    await expect(carte(page, "v6a_nina").locator(".v6a-psn")).toHaveText(attendu + " · ");
    // L'aperçu historique n'a pas été remplacé : il est préfixé.
    await expect(carte(page, "v6a_nina").locator(".msg-preview")).toContainText("On part quand ?");
    // Un groupe n'a pas d'interlocuteur unique : aucune Passio à annoncer.
    await expect(carte(page, "v6a_groupe").locator(".v6a-psn")).toHaveCount(0);
  });

  test("LE contrôle : la ligne de Passio survit à un nouveau rendu", async ({ page }) => {
    await boot(page);
    await poserConversations(page);
    await ouvrirMessages(page);
    await expect(carte(page, "v6a_nina").locator(".v6a-psn")).toHaveCount(1);

    // Exactement ce que fait un message reçu : la liste est reconstruite.
    await page.evaluate(() => {
      const c = getConversations().find((x) => x.id === "v6a_nina");
      c.messages.push({ id: "m3", from: "u_nina", text: "Je réserve le train", at: Date.now() });
      c.lastAt = Date.now();
      renderMessages();
    });
    await page.waitForTimeout(300);

    await expect(carte(page, "v6a_nina").locator(".v6a-psn")).toHaveCount(1);
    await expect(carte(page, "v6a_nina").locator(".msg-preview")).toContainText("Je réserve le train");
  });

  test("la recherche déplacée alimente toujours le même moteur", async ({ page }) => {
    await boot(page);
    await poserConversations(page);
    await ouvrirMessages(page);
    await expect(page.locator("#messageList .msg-card")).toHaveCount(2);

    await page.fill("#convGlobalSearch", "Rando");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window._msgSearchQuery)).toBe("Rando");
    await expect(page.locator("#messageList .msg-card")).toHaveCount(1);
    await expect(carte(page, "v6a_groupe")).toBeVisible();
  });

  test("kill switch local au boot : inbox historique strictement rendue", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { killLocal: true, errors });
    await poserConversations(page);
    await ouvrirMessages(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-6a"))).toBe(false);
    await expect(page.locator("#v6aHead")).toHaveCount(0);
    await expect(page.locator('#screen-messages button[onclick="openNewMessage()"]')).toBeVisible();
    await expect(page.locator('#screen-messages button[onclick="openCreateGroup()"]')).toBeVisible();
    await expect(page.locator("#convGlobalSearch")).toBeVisible();
    await expect(page.locator(".v6a-psn")).toHaveCount(0);

    expect(errors.js, "exceptions JS avec le kill switch").toEqual([]);
  });

  test("kill switch mémoire : la recherche retrouve sa place, rien ne subsiste", async ({ page }) => {
    await boot(page);
    await poserConversations(page);
    await ouvrirMessages(page);
    await expect(page.locator("#v6aHead")).toHaveCount(1);

    await page.evaluate(() => { window.PASSIO_UI_6A = false; window.PassioUIV6A.apply(); });
    await page.waitForTimeout(250);

    await expect(page.locator("#v6aHead")).toHaveCount(0);
    await expect(page.locator(".v6a-psn")).toHaveCount(0);
    await expect(page.locator('#screen-messages button[onclick="openNewMessage()"]')).toBeVisible();
    // La recherche est revenue DANS l'écran, hors de la tête démontée.
    expect(await page.evaluate(() => {
      const ec = document.getElementById("screen-messages");
      const n = document.getElementById("convGlobalSearch");
      return !!(n && ec.contains(n));
    })).toBe(true);
  });

  for (const largeur of [320, 390, 430]) {
    test("mobile " + largeur + " px : aucun débordement, cibles ≥ 44 px", async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await boot(page);
      await poserConversations(page);
      await ouvrirMessages(page);
      await page.locator("[data-v6a-plus]").click();

      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const t = document.getElementById("v6aHead");
        const cibles = Array.from(document.querySelectorAll("[data-v6a-plus], .v6a-menu-item"));
        const menu = document.getElementById("v6aMenu");
        return {
          deborde: doc.scrollWidth > doc.clientWidth + 1,
          dansLeCadre: t.getBoundingClientRect().right <= doc.clientWidth + 1,
          menuDansLeCadre: menu.getBoundingClientRect().left >= -1,
          minHauteur: Math.min.apply(null, cibles.map((c) => c.getBoundingClientRect().height)),
        };
      });
      expect(m.deborde, "la page déborde horizontalement").toBe(false);
      expect(m.dansLeCadre, "la tête sort du cadre").toBe(true);
      expect(m.menuDansLeCadre, "le menu sort du cadre").toBe(true);
      expect(m.minHauteur, "cible tactile").toBeGreaterThanOrEqual(44);
    });
  }
});
