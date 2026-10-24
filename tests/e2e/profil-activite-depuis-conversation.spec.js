// Profil visité ouvert DEPUIS une conversation → onglet « Activité » → tap sur
// une activité : la fiche doit être À L'ÉCRAN, pas cachée derrière le fil de
// messages. Défaut signalé le 2026-10-23 (« ça m'emmène sur la messagerie et
// non sur l'activité ») : la fiche (#eventDetailPage, z-index 200) s'ouvrait
// SOUS #conv-fullpage (z-index 1200), resté actif.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Aucune requête ne quitte le banc : les tables que `bootOnboarded` isole
// répondent vide (sa route, posée APRÈS, passe en premier), tout le reste de
// `*.supabase.co` est coupé — l'ouverture d'une conversation ne lit ni
// n'écrit rien en production.
async function boot(page, errors) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await bootOnboarded(page, errors);
}

async function ouvrirActiviteDepuisConversation(page) {
  return page.evaluate(async () => {
    const ev = allEvents().find(e => e.organizerId && e.organizerId !== "me" && userById(e.organizerId));
    const u = userById(ev.organizerId);
    // Conversation LOCALE (jamais `startDirectMessage`, qui crée la conversation en base).
    const convs = getConversations();
    convs.push({ id: "dm_test_activite", isGroup: false, userId: u.id, userName: u.name || "Passionné",
      userEmoji: u.profileEmoji || "✨", userColor: u.avatar || "#8b5cf6", unread: 0, lastAt: Date.now(), messages: [] });
    saveConversations();
    goTo("messages");
    await openConversation("dm_test_activite");
    await new Promise(r => setTimeout(r, 600));
    const convAvant = document.getElementById("conv-fullpage").classList.contains("active");
    await openUserProfile(u.id, "seed");
    await new Promise(r => setTimeout(r, 600));
    switchVisitedSection("activite");
    return { convAvant, organisateur: u.id };
  });
}

test("une activité tapée sur un profil ouvert depuis une conversation s'affiche au premier plan", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, errors);
  const r = await ouvrirActiviteDepuisConversation(page);
  expect(r.convAvant).toBe(true);

  const ligne = page.locator("#visitedEvents > div[onclick]").first();
  await expect(ligne).toBeVisible();
  await ligne.click();

  const fiche = page.locator("#eventDetailPage");
  await expect(fiche).toBeVisible();
  // Mesuré par le point : c'est la FICHE qui reçoit le doigt au centre de
  // l'écran, pas le fil de messages (fiche « zone tactile » : elementFromPoint).
  // La conversation glisse hors champ (transition de 280 ms) : on laisse passer
  // l'animation, rien de plus.
  await expect.poll(() => page.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return {
      dansFiche: !!(el && el.closest("#eventDetailPage")),
      dansConv: !!(el && el.closest("#conv-fullpage")),
      convActive: document.getElementById("conv-fullpage").classList.contains("active"),
    };
  }), { timeout: 3000 }).toEqual({ dansFiche: true, dansConv: false, convActive: false });

  // Le retour ferme la fiche et ne laisse aucun panneau figé.
  await page.evaluate(() => closeEventDetail());
  await expect(fiche).toBeHidden();
  expect(errors.js).toEqual([]);
});

test("hors conversation, la fiche d'activité d'un profil visité s'ouvre toujours", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, errors);
  await page.evaluate(async () => {
    const ev = allEvents().find(e => e.organizerId && e.organizerId !== "me" && userById(e.organizerId));
    await openUserProfile(ev.organizerId, "seed");
    await new Promise(r => setTimeout(r, 600));
    switchVisitedSection("activite");
  });
  await page.locator("#visitedEvents > div[onclick]").first().click();
  await expect(page.locator("#eventDetailPage")).toBeVisible();
  const dansFiche = await page.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return !!(el && el.closest("#eventDetailPage"));
  });
  expect(dansFiche).toBe(true);
  expect(errors.js).toEqual([]);
});
