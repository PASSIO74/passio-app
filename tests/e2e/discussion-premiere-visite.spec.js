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

// Vrai SDK du dépôt, adressé au seul serveur local du test. Seules ses réponses
// HTTP sont simulées ; le résolveur, les filtres, les pages et le rendu tournent.
async function installerLectureLocale(page, tables) {
  const lectures = [];
  await page.route("**/__discussion/rest/v1/**", async route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    const params = url.searchParams;
    let rows = tables[table] || [];
    for (const [colonne, filtre] of params) {
      if (filtre.startsWith("eq.")) rows = rows.filter(row => row[colonne] === filtre.slice(3));
    }
    const curseur = (params.get("or") || "").match(/created_at\.lt\."([^"]+)"/);
    if (curseur) rows = rows.filter(row => row.created_at < curseur[1]);
    const debut = Number(params.get("offset")) || 0;
    const fin = params.has("limit") ? debut + Number(params.get("limit")) : undefined;
    lectures.push({ table, id: params.get("id"), colonnes: params.get("select") });
    const resultats = rows.slice(debut, fin);
    const objet = (route.request().headers().accept || "").includes("vnd.pgrst.object");
    await route.fulfill({ json: objet ? (resultats[0] || null) : resultats });
  });
  await page.route("**/js/vendor/supabase-js-*", route => route.continue());
  await page.addScriptTag({ url: "/js/vendor/supabase-js-2.116.0.js" });
  await page.evaluate(() => {
    supa = window.supabase.createClient(location.origin + "/__discussion", "cle-test-locale", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    window.supa = supa;
    window._supaReal = true;
  });
  return lectures;
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

test("une publication publique se lit au-delà des deux aperçus, sans compte, jusqu’à la dernière page", async ({ page }) => {
  await bootVisiteur(page, { sansBienvenue: true });
  const id = "publication-publique-du-test";
  const commentaires = Array.from({ length: 31 }, (_, i) => ({
    id: "commentaire-" + i, post_id: id, author_id: "lectrice", content: "Témoignage numéro " + (i + 1) + ".",
    created_at: new Date(Date.UTC(2026, 10, 20, 12, 0, 59 - i)).toISOString(),
  }));
  await installerLectureLocale(page, { post_comments: commentaires });
  await page.evaluate(id => {
    MY_UID = null;
    state.supabasePosts = [{ id, fromSupabase: true, comments: [], commentsTotal: 31 }];
    openComments(id);
  }, id);
  await expect(lire(page)).toContainText("Témoignage numéro 3.");
  await expect(creerCompte(page)).toBeVisible();
  const plus = lire(page).getByRole("button", { name: /Voir .*commentaires de plus/ });
  while (await plus.count()) await plus.click();
  await lire(page).getByRole("button", { name: /Charger les commentaires précédents/ }).click();
  await expect(lire(page)).toContainText("Témoignage numéro 31.");
  await expect(page.locator("#newComment")).toHaveCount(0);
});

async function soumettreInscription(page, compteExistant = false) {
  await page.evaluate(existant => {
    supa.auth.signUp = async () => ({
      data: { user: { id: "lectrice-locale", identities: existant ? [] : [{ id: "identite-locale" }] }, session: null },
      error: null,
    });
  }, compteExistant);
  await page.locator("#authName").fill("Camille");
  await page.locator("#authBirthYear").fill("1995");
  await page.locator("#authEmail").fill("lecture@example.test");
  await page.locator("#authPassword").fill("lectureDuFil123");
  await page.locator("#authConsent").click();
  await page.locator("#authSubmitBtn").click();
  await expect(page.locator("#authMsg")).toContainText(compteExistant ? "déjà utilisé" : "Compte créé");
}

for (const renvoyer of [false, true]) {
  test("adresse existante : " + (renvoyer ? "renvoi demandé" : "annulation sans renvoi"), async ({ page }) => {
    const id = await ouvrirDiscussion(page);
    await creerCompte(page).click();
    await soumettreInscription(page, true);
    if (renvoyer) {
      await page.evaluate(() => { supa.auth.resend = async () => ({ data: {}, error: null }); });
      await page.locator("#authResendLink").click();
      await expect(page.locator("#authMsg")).toContainText("renvoyé");
    }
    await page.locator("#frBackToExplore").click();
    await expect(lire(page)).toHaveAttribute("data-thread", id);
    const destination = await page.evaluate(() => PassioFirstRun.prefs().retour);
    if (renvoyer) expect(destination.cible.id).toBe(id);
    else expect(destination).toBeNull();
  });
}

for (const accessible of [true, false]) {
  test("confirmation avec un cache vide : discussion " + (accessible ? "retrouvée" : "indisponible"), async ({ page, context }) => {
    const id = await ouvrirDiscussion(page);
    await creerCompte(page).click();
    // Le compte attend la confirmation ; la personne continue sa lecture avant
    // d'ouvrir le lien du mail dans un nouvel onglet du même navigateur.
    await soumettreInscription(page);
    await page.locator("#authTabSignin").click();
    await page.locator("#authTabSignup").click();
    await page.locator("#frBackToExplore").click();
    await expect(lire(page)).toHaveAttribute("data-thread", id);
    const confirmation = await context.newPage();
    await bootVisiteur(confirmation, { sansBienvenue: true });
    await confirmation.evaluate(id => {
      state.seed.posts = state.seed.posts.filter(p => p.id !== id);
    }, id);
    // Plus ancienne que les 60 publications de la première page de cet auteur.
    const posts = Array.from({ length: 61 }, (_, i) => ({
      id: i === 60 ? id : "publication-plus-recente-" + i, author_id: "auteur-du-test", content: "Sortie",
      passion_id: "nature", profiles: { username: "Ari" }, created_at: new Date(Date.UTC(2026, 10, 20, 12, 0, 59 - i)).toISOString(),
    }));
    const lectures = await installerLectureLocale(confirmation, { posts: accessible ? posts : posts.slice(0, 60) });
    await terminerAuthentification(confirmation);
    if (accessible) {
      await expect(lire(confirmation)).toHaveAttribute("data-thread", id);
      await expect(confirmation.locator("#newComment")).toHaveValue("");
      expect(lectures.some(l => l.table === "posts" && l.id === "eq." + id && l.colonnes.includes("passion_id"))).toBe(true);
    } else {
      await expect(confirmation.getByText("Cette discussion n’est plus disponible.", { exact: true })).toBeVisible();
      await expect(lire(confirmation)).toHaveCount(0);
    }
  });
}
