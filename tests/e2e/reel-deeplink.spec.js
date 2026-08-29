// Lien partagé d'une bobine — #reel=<id>.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① un lien de bobine ouvert au démarrage montre CETTE bobine (avant ce
//      correctif, il retombait sur le fil : le lien était fabriqué et envoyé sur
//      six canaux, mais lu par personne) ;
//   ② une bobine plus ancienne que les 30 plus récentes est épinglée — sans
//      quoi le viewer affichait la PREMIÈRE de la liste, c'est-à-dire un lien
//      qui montre autre chose que ce qu'il promet, sans le dire ;
//   ③ un identifiant inconnu le DIT et n'ouvre rien ;
//   ④ un lien collé en cours de session est routé lui aussi (hashchange) ;
//   ⑤ l'ouverture normale des Bobines n'est pas modifiée par l'épinglage.
const { test, expect } = require("@playwright/test");
const { bootOnboarded, onboardedState } = require("./app-helper");

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Une bobine du contenu de démonstration : présente dès le boot, sans réseau.
const BOBINE_SEED = "reel_seed_cuisine_1";

function bobine(id, createdAt) {
  return {
    id, authorId: "author_lien", userId: "author_lien", authorName: "Lina", authorEmoji: "🎬",
    passion: "musique", type: "photo", isReel: true, photo: PIXEL, image: PIXEL,
    text: "Bobine " + id, createdAt, likes: 0, comments: [],
  };
}

// Démarre l'application AVEC un lien dans l'URL. L'état local est posé AVANT
// celui de `bootOnboarded` (dont l'écriture est gardée par un `if absent`), sans
// quoi les bobines injectées n'existeraient pas encore quand le lien est routé.
async function bootAvecLien(page, hash, opts = {}) {
  if (opts.userPosts) {
    const st = onboardedState(1);
    st.userPosts = opts.userPosts;
    await page.addInitScript((s) => {
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(s));
    }, st);
  }
  await bootOnboarded(page, opts.errors || null, 1, { query: hash });
}

function viewerOuvert(page, timeout = 25000) {
  return page.waitForFunction(() => {
    const v = document.getElementById("reelsViewer");
    return !!(v && v.classList.contains("open"));
  }, null, { timeout });
}

function bobineAffichee(page) {
  return page.evaluate(() => {
    const it = (reelsState.items || [])[reelsState.current || 0];
    return it ? it.id : null;
  });
}

test.describe("Lien partagé #reel=<id>", () => {
  test("au démarrage, le lien ouvre la bobine qu'il désigne", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootAvecLien(page, "#reel=" + BOBINE_SEED, { errors });

    await viewerOuvert(page);
    expect(await bobineAffichee(page)).toBe(BOBINE_SEED);

    // Le hash du lien est consommé : le retour arrière ferme le viewer au lieu
    // de rejouer le lien indéfiniment.
    expect(await page.evaluate(() => location.hash)).not.toContain("reel=");
    expect(errors.js, "aucune erreur JS pendant le routage").toEqual([]);
  });

  test("une bobine hors des 30 plus récentes est épinglée, pas remplacée", async ({ page }) => {
    // 31 bobines récentes + la cible, volontairement la plus ancienne : sans
    // épinglage elle tombe hors de la fenêtre lue par le viewer.
    const recentes = [];
    for (let i = 0; i < 31; i++) recentes.push(bobine("reel_recent_" + i, 9_000_000 + i));
    const cible = bobine("reel_ancienne", 1000);

    await bootAvecLien(page, "#reel=reel_ancienne", { userPosts: recentes.concat([cible]) });
    await viewerOuvert(page);

    expect(await bobineAffichee(page)).toBe("reel_ancienne");
    // Épinglée EN TÊTE, et la liste ne s'allonge pas pour autant.
    const info = await page.evaluate(() => ({
      premier: (reelsState.items || [])[0] ? reelsState.items[0].id : null,
      taille: (reelsState.items || []).length,
      courant: reelsState.current,
    }));
    expect(info.premier).toBe("reel_ancienne");
    expect(info.courant).toBe(0);
    expect(info.taille).toBeLessThanOrEqual(30);
  });

  test("un identifiant inconnu le dit, et n'ouvre aucune autre bobine", async ({ page }) => {
    await bootAvecLien(page, "#reel=bobine_qui_nexiste_pas");

    // Le routage retente (le contenu réel arrive avec Supabase) avant de conclure.
    await expect(page.locator("#toastStack .toast", { hasText: "Bobine introuvable ou supprimée" }))
      .toBeVisible({ timeout: 25000 });

    expect(await page.evaluate(() => !!(reelsState && reelsState.open))).toBe(false);
    await expect(page.locator("#reelsViewer.open")).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).not.toContain("reel=");
  });

  test("un lien collé en cours de session est routé aussi", async ({ page }) => {
    await bootOnboarded(page, null, 1, {});
    await page.evaluate((id) => { location.hash = "#reel=" + id; }, BOBINE_SEED);

    await viewerOuvert(page);
    expect(await bobineAffichee(page)).toBe(BOBINE_SEED);
  });

  test("sans lien, l'ouverture des Bobines est inchangée", async ({ page }) => {
    const recentes = [];
    for (let i = 0; i < 31; i++) recentes.push(bobine("reel_recent_" + i, 9_000_000 + i));
    const st = onboardedState(1);
    st.userPosts = recentes;
    await page.addInitScript((s) => {
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(s));
    }, st);
    await bootOnboarded(page, null, 1, {});

    const info = await page.evaluate(() => {
      state.seed.posts = (state.seed.posts || []).filter((p) => !p.isReel);
      state.supabasePosts = [];
      openReels();
      return {
        taille: (reelsState.items || []).length,
        premier: reelsState.items[0].id,
        courant: reelsState.current,
      };
    });
    // 31 bobines, fenêtre de 30, la plus récente en tête : exactement le
    // comportement d'avant l'épinglage.
    expect(info.taille).toBe(30);
    expect(info.premier).toBe("reel_recent_30");
    expect(info.courant).toBe(0);
  });
});
