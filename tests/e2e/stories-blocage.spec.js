// Blocage d'un compte — les STORIES y échappaient.
//
// ⚠️ LE DÉFAUT, mesuré le 2026-08-30. `isBlocked()` (app-02) porte en commentaire :
// « Centralisé pour filtrer feed, commentaires, STORIES, conversations et
// notifications. » Le filtre est effectivement appliqué à dix-sept endroits du
// dépôt — commentaires, conversations, notifications, lives, événements,
// bobines, publications du fil. Mais `buildStoryGroups()` (app-08) lit
// `state.seed.stories` EN ENTIER et n'appelle jamais `isBlocked()`.
//
// Or `buildStoryGroups()` est la source UNIQUE du rail de stories ET du
// visionneur : bloquer quelqu'un laissait sa bulle en tête du fil, et son
// contenu s'ouvrait en plein écran. La garantie était écrite, pas tenue.
//
// ⚠️ Second défaut, dans le même geste. `openStoryGroup(authorId)` fait
// `if (gi < 0) gi = 0;` : un auteur introuvable ouvre le groupe n° 0, c'est-à-dire
// les stories de QUELQU'UN D'AUTRE. Filtrer sans corriger ça aurait remplacé une
// fuite par un mensonge — exactement le piège déjà payé sur `#reel=<id>`, où
// `openReels()` montrait la première bobine de la liste quand l'id était absent.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const BLOQUE = "u_lea";   // porte la story « s1 » du contenu de démonstration

async function bloquer(page, id) {
  await page.evaluate((uid) => {
    state.user.blocked = [uid];
    saveState();
    renderStories();
  }, id);
}

const groupes = (page) => page.evaluate(() =>
  buildStoryGroups().map((g) => String(g.authorId)));

const viewerOuvert = (page) => page.evaluate(() => {
  const v = document.getElementById("storyViewer");
  return !!(v && v.classList.contains("active"));
});

test.describe("Stories et blocage", () => {
  test("un compte bloqué disparaît des groupes de stories", async ({ page }) => {
    await bootOnboarded(page);
    // Anti-creux : il doit y ÊTRE avant, sinon le test ne prouve rien.
    expect(await groupes(page)).toContain(BLOQUE);

    await bloquer(page, BLOQUE);
    expect(await groupes(page)).not.toContain(BLOQUE);
  });

  test("sa bulle quitte le rail du fil", async ({ page }) => {
    await bootOnboarded(page);
    const bulle = page.locator(`#storiesRowFeed .story-item[onclick*="${BLOQUE}"]`);
    await expect(bulle).toHaveCount(1);

    await bloquer(page, BLOQUE);
    await expect(bulle).toHaveCount(0);
  });

  test("ouvrir ses stories n'ouvre RIEN — et surtout pas celles de quelqu'un d'autre", async ({ page }) => {
    await bootOnboarded(page);
    await bloquer(page, BLOQUE);

    await page.evaluate((uid) => { openStoryGroup(uid); }, BLOQUE);
    await page.waitForTimeout(800);

    // Le point qui compte : pas de repli sur le groupe n° 0.
    expect(await viewerOuvert(page), "le visionneur ne doit pas s'ouvrir").toBe(false);
  });

  // Garde anti-creux : la mécanique normale doit rester entière. Sans ce test,
  // un correctif qui casserait toutes les stories passerait pour une réussite.
  test("sans blocage, la bulle est là et le visionneur s'ouvre sur le bon auteur", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate((uid) => { openStoryGroup(uid); }, BLOQUE);
    await page.waitForTimeout(800);

    expect(await viewerOuvert(page)).toBe(true);
    expect(await page.evaluate(() => String(storyGroups[storyGroupIdx].authorId))).toBe(BLOQUE);
  });
});
