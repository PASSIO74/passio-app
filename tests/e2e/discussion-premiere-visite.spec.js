const { test, expect } = require("@playwright/test");
const { bootVisiteur } = require("./first-run-helper");

// Le deuxième onglet doit lui aussi passer par les routes réseau du helper.
test.use({ serviceWorkers: "block" });

const lire = (page) => page.locator("#modalBackdrop.active #commentsBox");
const creerCompte = (page) => page.getByRole("button", { name: "Créer un compte pour répondre", exact: true });

async function ouvrirDiscussion(page) {
  await bootVisiteur(page, { sansBienvenue: true });
  const id = await page.evaluate(() => {
    const post = state.seed.posts.find(p => p && p.id && p.text);
    post.comments = [{ id: "avis-local", authorId: "lectrice-locale", text: "On se retrouve au départ du sentier.", createdAt: Date.now() }];
    openComments(post.id);
    return post.id;
  });
  await expect(lire(page)).toContainText("On se retrouve au départ du sentier.");
  return id;
}

// Même crochet que l'inscription et la connexion. Le SDK réseau est coupé
// par bootVisiteur, et le compte utilisé pour vérifier la saisie reste local.
async function terminerAuthentification(page) {
  await page.evaluate(() => {
    state.onboarded = true;
    document.getElementById("onboarding").classList.remove("active");
    PassioFirstRun.apresAuthentification();
  });
}

test("discussion en visiteur : lecture libre, compte avant la saisie, annulation et retour système", async ({ page }) => {
  const id = await ouvrirDiscussion(page);
  await expect(page.locator("#newComment")).toHaveCount(0);
  await creerCompte(page).click();
  await expect(page.locator("#authTabSignup")).toHaveAttribute("aria-selected", "true");
  await expect(lire(page)).toHaveCount(0);
  await page.locator("#authTabSignin").click();
  await expect(page.locator("#authTabSignin")).toHaveAttribute("aria-selected", "true");
  await page.locator("#frBackToExplore").click();
  await expect(lire(page)).toHaveAttribute("data-thread", id);
  expect(await page.evaluate(() => PassioFirstRun.prefs().retour)).toBeNull();
  await expect(creerCompte(page)).toBeVisible();
  await lire(page).getByRole("button", { name: "Répondre", exact: true }).click();
  await expect(page.locator("#onboarding.active")).toBeVisible();
  await expect(page.locator(".reply-field")).toHaveCount(0);
  await page.goBack();
  await expect(lire(page)).toHaveAttribute("data-thread", id);
  await page.goBack();
  await expect(lire(page)).toHaveCount(0);
  await expect(page.locator("#onboarding.active")).toHaveCount(0);
});

test("après connexion, la même discussion reçoit un brouillon sans envoi automatique", async ({ page }) => {
  const id = await ouvrirDiscussion(page);
  await creerCompte(page).click();
  await page.locator("#authTabSignin").click();
  await terminerAuthentification(page);
  await expect(lire(page)).toHaveAttribute("data-thread", id);
  const champ = page.getByRole("textbox", { name: "Écrire un commentaire" });
  await expect(champ).toHaveValue("");
  await expect(creerCompte(page)).toHaveCount(0);
  await champ.fill("Je viendrai aussi.");
  await expect(page.getByRole("button", { name: "Publier", exact: true })).toBeEnabled();
  expect(await page.evaluate(id => findPostAnywhere(id).comments.length, id)).toBe(1);
});

for (const accessible of [true, false]) {
  test("confirmation avec un cache vide : discussion " + (accessible ? "retrouvée" : "indisponible"), async ({ page, context }) => {
    const id = await ouvrirDiscussion(page);
    await creerCompte(page).click();
    // Le compte attend la confirmation ; la personne continue sa lecture avant
    // d'ouvrir le lien du mail dans un nouvel onglet du même navigateur.
    await page.evaluate(() => _showResendConfirmation("lecture@example.test"));
    await page.locator("#frBackToExplore").click();
    await expect(lire(page)).toHaveAttribute("data-thread", id);
    const confirmation = await context.newPage();
    await bootVisiteur(confirmation, { sansBienvenue: true });
    await confirmation.evaluate(({ id, accessible }) => {
      const post = findPostAnywhere(id);
      state.seed.posts = state.seed.posts.filter(p => p.id !== id);
      // Seule la lecture réseau du lien partagé est simulée, après disparition
      // de la publication du cache comme dans l'onglet de confirmation.
      window._lienPartageChercherPost = async function (cible) {
        window.__discussionCherchee = cible;
        if (accessible && cible === id) state.supabasePosts = [post];
      };
    }, { id, accessible });
    await terminerAuthentification(confirmation);
    await expect.poll(() => confirmation.evaluate(() => window.__discussionCherchee)).toBe(id);
    if (accessible) {
      await expect(lire(confirmation)).toHaveAttribute("data-thread", id);
      await expect(confirmation.locator("#newComment")).toHaveValue("");
    } else {
      await expect(confirmation.getByText("Cette discussion n’est plus disponible.", { exact: true })).toBeVisible();
      await expect(lire(confirmation)).toHaveCount(0);
    }
  });
}
