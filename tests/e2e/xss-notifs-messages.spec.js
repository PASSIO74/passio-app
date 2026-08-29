// XSS stockées — notifications distantes et réactions de message.
//
// Deux surfaces rendaient en HTML BRUT une donnée écrite par un autre compte :
//   ① `_notifListHtml` interpole `n.text`, et `notifications.content` est une
//      ligne insérable par n'importe quel compte authentifié ;
//   ② les badges de réaction d'un message interpolent la CLÉ de `m.reactions`,
//      qui vient de la ligne `conv_messages` de l'autre personne.
// Un troisième défaut, plus discret : le message « 📍 position » construisait son
// `href` avec `escapeHtml`, qui ferme l'attribut mais PAS le schéma `javascript:`.
//
// La preuve est ACTIVE, comme dans `echappement.spec.js` : chaque charge appelle
// `window.__pwn()`. Chercher la chaîne dans le DOM ne prouverait rien — une
// charge correctement échappée y figure en clair et reste inerte.
//
// ⚠️ Ce que ces tests protègent AUSSI : le rendu HTML des notifications LOCALES
// est un choix délibéré (`<b>` posé autour d'un contenu déjà échappé à la
// construction). Un correctif qui échapperait tout au rendu casserait ce gras et
// afficherait « Ben&#39;j » au lieu de « Ben'j » — deux tests l'interdisent.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const CHARGE = '<img src=x onerror="window.__pwn()">';

async function bootAvecSonde(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__xss = 0;
    window.__pwn = function () { window.__xss++; };
  });
}

async function secouerEtRelever(page) {
  return page.evaluate(() => {
    document.querySelectorAll("body *").forEach((el) => {
      try {
        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        if (el.tagName === "IMG") el.dispatchEvent(new Event("error"));
      } catch (_) {}
    });
    return window.__xss;
  });
}

test.describe("XSS stockée — notifications distantes", () => {
  test("le texte d'une notification distante ne s'exécute pas, et reste lisible", async ({ page }) => {
    await bootAvecSonde(page);

    await page.evaluate((charge) => {
      // Le contenu de démonstration porte déjà sept notifications : on repart
      // d'une liste vide pour que le comptage désigne la charge et elle seule.
      state.notifications = [];
      mergeSupaNotifs([{
        id: "n_hostile", kind: "like", fromId: "u_attaquant", refId: "p1",
        text: charge, emoji: "❤️", createdAt: Date.now(), unread: true, fromSupabase: true,
      }]);
      openNotifications();
    }, CHARGE);

    // Prémisse : la notification est bien rendue, sinon le test ne prouve rien.
    await expect(page.locator(".notif-row")).toHaveCount(1);
    expect(await secouerEtRelever(page)).toBe(0);

    // Neutralisée, pas supprimée : la charge est affichée comme du TEXTE.
    const ligne = page.locator(".notif-row .notif-text").first();
    await expect(ligne).toContainText("<img");
    expect(await ligne.locator("img").count(), "aucune balise réelle").toBe(0);
  });

  test("un nom déjà échappé par l'émetteur n'est pas ré-échappé à l'affichage", async ({ page }) => {
    // `supaInsertNotif` compose `escapeHtml(nom) + " " + libellé` : le texte
    // stocké contient donc DÉJÀ des entités. Les ré-échapper afficherait
    // « Ben&#39;j a aimé » à l'écran.
    await bootAvecSonde(page);
    await page.evaluate(() => {
      state.notifications = [];
      mergeSupaNotifs([{
        id: "n_apostrophe", kind: "like", fromId: "u_ben", refId: "p1",
        text: "Ben&#39;j a aimé ta publication", emoji: "❤️",
        createdAt: Date.now(), unread: true, fromSupabase: true,
      }]);
      openNotifications();
    });
    const t = await page.locator(".notif-row .notif-text").first().innerText();
    expect(t).toContain("Ben'j a aimé");
    expect(t, "pas de double échappement").not.toContain("&#39;");
  });

  test("une notification LOCALE garde son gras : le rendu HTML voulu n'est pas cassé", async ({ page }) => {
    await bootAvecSonde(page);
    await page.evaluate(() => {
      state.notifications = [];
      pushNotification("🤝 Tu rejoins <b>Atelier céramique</b>", "🤝");
      openNotifications();
    });
    expect(await page.locator(".notif-row .notif-text b").count(), "le <b> local survit").toBe(1);
    await expect(page.locator(".notif-row .notif-text b").first()).toHaveText("Atelier céramique");
    expect(await secouerEtRelever(page)).toBe(0);
  });
});

test.describe("XSS stockée — fil de conversation", () => {
  async function ouvrirFilAvecMessage(page, message) {
    await page.evaluate(async (msg) => {
      state.hintsVus = { feed_auteur: true, profil_visite: true, second_profil: true };
      try { fermerHint(); } catch (e) {}
      const convs = getConversations();
      const conv = {
        id: "conv_xss", userId: "u_attaquant", userName: "Attaquant", userEmoji: "✨",
        userColor: "#7c3aed", passion: "musique", unread: 0, lastAt: Date.now(),
        isGroup: false, messages: [msg],
      };
      const i = convs.findIndex((c) => c.id === "conv_xss");
      if (i >= 0) convs[i] = conv; else convs.unshift(conv);
      await openConversation("conv_xss");
    }, message);
  }

  test("la clé d'une réaction de message ne s'exécute pas", async ({ page }) => {
    await bootAvecSonde(page);
    await ouvrirFilAvecMessage(page, {
      id: "m_react", from: "them", text: "Coucou", at: Date.now(),
      reactions: { [CHARGE]: 2 },
    });

    // Prémisse : le badge de réaction est bien rendu.
    await expect(page.locator(".conv-react-badge")).toHaveCount(1);
    expect(await secouerEtRelever(page)).toBe(0);
    expect(await page.locator(".conv-react-badge img").count()).toBe(0);
  });

  test("un message « position » ne peut pas porter un lien javascript:", async ({ page }) => {
    await bootAvecSonde(page);
    await ouvrirFilAvecMessage(page, {
      id: "m_pos", from: "them", at: Date.now(),
      text: "📍 Ma position: javascript:window.__pwn()",
    });

    const lien = page.locator(".conv-bubble a").first();
    await expect(lien).toHaveCount(1);
    const href = await lien.getAttribute("href");
    expect(href, "le schéma javascript: est refusé").toBe("#");

    await lien.click({ force: true }).catch(() => {});
    expect(await secouerEtRelever(page)).toBe(0);
  });

  test("une position légitime reste un vrai lien cliquable", async ({ page }) => {
    // Le correctif ne doit pas casser l'usage normal : safeUrlAttr garde http(s).
    await bootAvecSonde(page);
    await ouvrirFilAvecMessage(page, {
      id: "m_pos_ok", from: "them", at: Date.now(),
      text: "📍 Ma position: https://maps.example.test/?q=48.85,2.35",
    });
    const href = await page.locator(".conv-bubble a").first().getAttribute("href");
    expect(href).toContain("https://maps.example.test/");
  });
});
