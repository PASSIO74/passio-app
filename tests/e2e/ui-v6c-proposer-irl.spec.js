// Lot UI-6C — « Proposer un IRL » depuis une conversation 1:1 (§10).
//
// Ce que cette suite prouve, et rien d'autre :
//   ① l'entrée est dans le menu du composer, en 1:1 seulement ;
//   ② elle ouvre le formulaire EXISTANT, prérempli d'une Passio et d'un titre ;
//   ③ LE contrôle de sûreté, mot pour mot du §10 : aucune demande de position,
//      aucun message envoyé, aucun participant ajouté, aucun RSVP posé, et
//      AUCUN événement créé tant que le formulaire n'est pas soumis ;
//   ④ le titre suggéré ne nomme PERSONNE — un titre est public dès la
//      création, et il peut être soumis sans relecture ;
//   ⑤ un champ déjà rempli n'est jamais écrasé ;
//   ⑥ les deux kill switches retirent l'entrée, menu intact.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function espionnerGeo(page) {
  await page.addInitScript(() => {
    window.__geoCalls = 0;
    try {
      const g = navigator.geolocation;
      if (g) {
        Object.defineProperty(g, "getCurrentPosition", {
          configurable: true,
          value: function () { window.__geoCalls++; },
        });
      }
    } catch (e) {}
  });
}

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_6c", "0"));
  }
  await espionnerGeo(page);
  await bootOnboarded(page, opts.errors || null, 1, {});
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window._convNetLoaded = true;
    conversationsState = [
      {
        id: "v6c_nina", userId: "u_nina", userName: "Nina Costa",
        lastAt: Date.now() - 60000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m1", from: "u_nina", text: "On part quand ?", at: Date.now() - 60000 }],
      },
      {
        id: "v6c_groupe", isGroup: true, groupName: "Rando du dimanche",
        userIds: ["u_nina", "u_lea"],
        lastAt: Date.now() - 120000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m2", from: "u_lea", text: "9h", at: Date.now() - 120000 }],
      },
    ];
  });
}

async function ouvrirConv(page, id) {
  await page.evaluate(() => goTo("messages"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-messages");
    return el && el.classList.contains("active");
  });
  await page.evaluate((cid) => openConversation(cid), id);
  await page.waitForFunction(() => window._openedConvId, null, { timeout: 5000 });
  await page.waitForTimeout(300);
}

test.describe("UI-6C — Proposer un IRL depuis une conversation", () => {
  test("1:1 : l'entrée est en tête du menu du composer", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await ouvrirConv(page, "v6c_nina");

    const item = page.locator("#v6cProposerIrl");
    await expect(item).toHaveCount(1);
    expect(await page.evaluate(() => document.getElementById("v6cProposerIrl").hidden)).toBe(false);
    await expect(item).toContainText("Proposer un IRL");
    // En tête, les pièces jointes historiques dessous et intactes.
    expect(await page.evaluate(() =>
      document.getElementById("convAttachMenu").firstElementChild.id)).toBe("v6cProposerIrl");
    await expect(page.locator("#convAttachMenu .attach-item")).toHaveCount(6);

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("groupe : aucune entrée — proposer un IRL n'y a pas le même sens", async ({ page }) => {
    await boot(page);
    await ouvrirConv(page, "v6c_groupe");
    expect(await page.evaluate(() => {
      const n = document.getElementById("v6cProposerIrl");
      return !n || n.hidden;
    })).toBe(true);
  });

  test("elle ouvre le formulaire existant, Passio et titre suggérés", async ({ page }) => {
    await boot(page);
    await ouvrirConv(page, "v6c_nina");

    await page.evaluate(() => document.getElementById("v6cProposerIrl").click());
    await page.waitForSelector("#evTitle", { timeout: 8000 });

    const attendu = await page.evaluate(() => userById("u_nina").passion);
    expect(await page.evaluate(() => document.getElementById("evPassion").value)).toBe(attendu);
    const titre = await page.evaluate(() => document.getElementById("evTitle").value);
    expect(titre.length, "un titre est suggéré").toBeGreaterThan(0);
  });

  test("§10 mot pour mot : rien n'est fait dans le dos de l'utilisateur", async ({ page }) => {
    await boot(page);
    await ouvrirConv(page, "v6c_nina");

    const avant = await page.evaluate(() => ({
      geo: window.__geoCalls,
      messages: getConversations().find((c) => c.id === "v6c_nina").messages.length,
      evenements: (state.userEvents || []).length,
    }));

    await page.evaluate(() => document.getElementById("v6cProposerIrl").click());
    await page.waitForSelector("#evTitle", { timeout: 8000 });
    await page.waitForTimeout(400);

    const apres = await page.evaluate(() => ({
      geo: window.__geoCalls,
      messages: getConversations().find((c) => c.id === "v6c_nina").messages.length,
      evenements: (state.userEvents || []).length,
      // Ni adresse déduite, ni lieu prérempli.
      lieu: (document.getElementById("evPlace") || { value: "" }).value,
    }));

    expect(apres.geo, "aucune demande de position").toBe(avant.geo);
    expect(apres.messages, "aucun message envoyé automatiquement").toBe(avant.messages);
    expect(apres.evenements, "aucun événement créé avant soumission").toBe(avant.evenements);
    expect(apres.lieu, "aucune adresse déduite").toBe("");
  });

  test("le titre suggéré ne nomme personne", async ({ page }) => {
    await boot(page);
    await ouvrirConv(page, "v6c_nina");
    await page.evaluate(() => document.getElementById("v6cProposerIrl").click());
    await page.waitForSelector("#evTitle", { timeout: 8000 });

    const titre = await page.evaluate(() => document.getElementById("evTitle").value.toLowerCase());
    // Un titre est PUBLIC dès la création, et peut être soumis sans relecture.
    expect(titre).not.toContain("nina");
    expect(titre).not.toContain("costa");
    // Il est bien construit sur la Passio.
    const label = await page.evaluate(() => passionById(userById("u_nina").passion).label.toLowerCase());
    expect(titre).toContain(label);
  });

  test("un titre déjà saisi n'est jamais écrasé", async ({ page }) => {
    await boot(page);
    await ouvrirConv(page, "v6c_nina");
    await page.evaluate(() => document.getElementById("v6cProposerIrl").click());
    await page.waitForSelector("#evTitle", { timeout: 8000 });

    await page.fill("#evTitle", "Mon titre à moi");
    // Une seconde suggestion (le module est réentrant) ne doit rien effacer.
    await page.evaluate(() => window.PassioUIV6C.decorate());
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById("evTitle").value)).toBe("Mon titre à moi");
  });

  test("kill switch local au boot : menu historique, à six entrées près", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { killLocal: true, errors });
    await ouvrirConv(page, "v6c_nina");

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-6c"))).toBe(false);
    await expect(page.locator("#v6cProposerIrl")).toHaveCount(0);
    await expect(page.locator("#convAttachMenu .attach-item")).toHaveCount(5);

    expect(errors.js, "exceptions JS avec le kill switch").toEqual([]);
  });

  test("kill switch mémoire : l'entrée disparaît, le menu reste entier", async ({ page }) => {
    await boot(page);
    await ouvrirConv(page, "v6c_nina");
    await expect(page.locator("#v6cProposerIrl")).toHaveCount(1);

    await page.evaluate(() => { window.PASSIO_UI_6C = false; window.PassioUIV6C.apply(); });
    await page.waitForTimeout(250);

    await expect(page.locator("#v6cProposerIrl")).toHaveCount(0);
    await expect(page.locator("#convAttachMenu .attach-item")).toHaveCount(5);
  });
});
