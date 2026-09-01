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
const { bootOnboarded, onboardedState, sansPublicationsDistantes } = require("./app-helper");

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Une bobine du contenu de démonstration : présente dès le boot, sans réseau.
const BOBINE_SEED = "reel_seed_cuisine_1";
const BOBINE_SEED_ID = BOBINE_SEED;

// ⚠️ Les bobines du contenu de démonstration sont datées de `Date.now() - …` :
// un décor daté de 9 000 000 (1970) ne remplit AUCUNE fenêtre, le seed la remplit
// à sa place et le test « épinglage » ne construit pas la situation qu'il décrit.
// On date donc les bobines de décor dans le futur proche, et la cible loin dans
// le passé — là, la fenêtre de 30 est bien celle du test.
const MAINTENANT = Date.now();

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
  // ⚠️ AVANT TOUT LE RESTE. `buildReels` tronque à 30 : en CI, les bobines
  // réelles chargées par le boot poussent dehors la bobine de démonstration que
  // cette suite vise, et le test conclut à un lien mal routé alors que le
  // routage est correct — il montrait simplement une VRAIE bobine. Ce fichier
  // échouait ainsi sur des PR sans rapport avec lui. Détail dans `app-helper.js`.
  await sansPublicationsDistantes(page);
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
    for (let i = 0; i < 31; i++) recentes.push(bobine("reel_recent_" + i, MAINTENANT + 1000 + i));
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

  // ── La cible est DANS les 30, mais pas la plus récente ────────────────────
  // Défaut mesuré le 2026-09-01, en production comme en CI : l'épinglage ne
  // valait que pour une bobine sortie des 30 plus récentes. Quand la cible était
  // dans la liste sans en être la tête, `openReels` ouvrait le viewer sur la
  // bobine n° 0 et `openReelById` la corrigeait par un `scrollIntoView` dont
  // l'effet n'arrive qu'au tour de rendu suivant. Sonde : cible en position 5,
  // lecture immédiate → `reelsState.current === 0` (la bobine de QUELQU'UN
  // D'AUTRE), correction ~2 s plus tard.
  //
  // ⚠️ Ce test lit l'état DÈS l'ouverture du viewer, sans attente : c'est
  // précisément la fenêtre du défaut. Une attente le rendrait vert sur le code
  // fautif, donc aveugle.
  //
  // ⚠️ Il dit aussi pourquoi la CI rougissait : sans bobine plus récente que le
  // contenu de démonstration, la cible EST l'indice 0 et le défaut est
  // invisible. En CI, `supaLoadPosts` atteint la vraie base de production, dont
  // les bobines récentes reléguaient la cible plus bas — d'où trois tests de
  // cette suite au rouge sur `main` sans qu'aucun code n'ait changé.
  test("cible dans les 30 mais pas la plus récente : elle est à l'écran TOUT DE SUITE", async ({ page }) => {
    const recentes = [];
    for (let i = 0; i < 5; i++) recentes.push(bobine("reel_recent_" + i, MAINTENANT + 1000 + i));

    await bootAvecLien(page, "#reel=" + BOBINE_SEED, { userPosts: recentes });
    await viewerOuvert(page);

    // Aucune fenêtre pendant laquelle on montrerait autre chose : la cible est
    // épinglée en tête, donc l'indice courant vaut 0 et désigne bien la cible.
    const vu = await page.evaluate(() => ({
      id: (reelsState.items || [])[reelsState.current || 0]
        ? reelsState.items[reelsState.current || 0].id : null,
      premier: (reelsState.items || [])[0] ? reelsState.items[0].id : null,
      courant: reelsState.current,
      taille: (reelsState.items || []).length,
    }));
    expect(vu.id, "la bobine affichée à l'ouverture").toBe(BOBINE_SEED);
    expect(vu.premier, "la cible est épinglée en tête").toBe(BOBINE_SEED);
    expect(vu.courant).toBe(0);
    // Épingler n'allonge pas la liste, et n'y laisse pas de doublon.
    expect(vu.taille).toBeLessThanOrEqual(30);
    expect(await page.evaluate(
      () => (reelsState.items || []).filter((p) => p.id === "reel_seed_cuisine_1").length,
    )).toBe(1);
  });

  test("un identifiant inconnu le dit, et n'ouvre aucune autre bobine", async ({ page }) => {
    await bootAvecLien(page, "#reel=bobine_qui_nexiste_pas");

    // Le routage retente (le contenu réel arrive avec Supabase) avant de conclure.
    await expect(page.locator("#toastStack .toast", { hasText: "Bobine introuvable ou supprimée" }))
      .toBeVisible({ timeout: 25000 });

    expect(await page.evaluate(() => !!(reelsState && reelsState.open))).toBe(false);
    await expect(page.locator("#reelsViewer.open")).toHaveCount(0);
    // Le hash SURVIT à l'échec — c'est délibéré, et c'est le test suivant qui
    // le prouve : sur un réseau plus lent que le budget, un rechargement doit
    // pouvoir retenter au lieu de perdre le lien.
  });

  test("un lien collé en cours de session est routé aussi", async ({ page }) => {
    await bootOnboarded(page, null, 1, {});
    await page.evaluate((id) => { location.hash = "#reel=" + id; }, BOBINE_SEED);

    await viewerOuvert(page);
    expect(await bobineAffichee(page)).toBe(BOBINE_SEED);
  });

  test("sans lien, l'ouverture des Bobines est inchangée", async ({ page }) => {
    const recentes = [];
    for (let i = 0; i < 31; i++) recentes.push(bobine("reel_recent_" + i, MAINTENANT + 1000 + i));
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

  test("auteur bloqué : rien ne s'ouvre, surtout pas la bobine de quelqu'un d'autre", async ({ page }) => {
    // buildReels() écarte les comptes bloqués. Tester seulement isReel + média
    // laissait passer cette bobine, puis openReels() ouvrait la PREMIÈRE de la
    // liste : le viewer montrait le contenu d'un tiers avec, par-dessus, un
    // toast « introuvable ». C'est le mensonge que ce routage doit exclure.
    const st = onboardedState(1);
    st.user.blocked = ["author_lien"];
    st.userPosts = [bobine("reel_bloquee", MAINTENANT)];
    await page.addInitScript((x) => {
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(x));
    }, st);
    await bootOnboarded(page, null, 1, { query: "#reel=reel_bloquee" });

    await expect(page.locator("#toastStack .toast", { hasText: "Bobine introuvable ou supprimée" }))
      .toBeVisible({ timeout: 25000 });
    await expect(page.locator("#reelsViewer.open")).toHaveCount(0);
    expect(await page.evaluate(() => !!(reelsState && reelsState.open))).toBe(false);
  });

  test("openReelById rend false ET referme, pour un contenu qui n'est pas une bobine", async ({ page }) => {
    await bootOnboarded(page, null, 1, {});
    const r = await page.evaluate(() => {
      const rendu = openReelById("__pas_une_bobine__");
      const v = document.getElementById("reelsViewer");
      return { rendu, ouvert: !!(v && v.classList.contains("open")), etat: !!reelsState.open };
    });
    expect(r.rendu).toBe(false);
    expect(r.ouvert, "le viewer ne reste pas ouvert sur une autre bobine").toBe(false);
    expect(r.etat).toBe(false);
  });

  test("le hash « #reels » du viewer n'est jamais pris pour un lien", async ({ page }) => {
    await bootOnboarded(page, null, 1, {});
    await page.evaluate(() => { location.hash = "#reels"; });
    await page.waitForTimeout(1500);
    await expect(page.locator("#reelsViewer.open")).toHaveCount(0);
    await expect(page.locator("#toastStack .toast", { hasText: "Bobine introuvable" })).toHaveCount(0);
  });

  test("écran occupé (landing) : le lien attend au lieu de recouvrir", async ({ page }) => {
    // Le viewer est en z-index 9999 : ouvert par-dessus la landing ou
    // l'onboarding, il recouvrirait l'inscription de la personne même qui vient
    // d'ouvrir le lien. Il doit attendre — et repartir ensuite.
    await bootOnboarded(page, null, 1, {});
    await page.evaluate(() => { document.getElementById("landing").classList.add("active"); });
    await page.evaluate((id) => { location.hash = "#reel=" + id; }, BOBINE_SEED_ID);
    await page.waitForTimeout(2000);
    await expect(page.locator("#reelsViewer.open")).toHaveCount(0);

    // Le lien n'est pas perdu pour autant : le hash est intact et il repart.
    expect(await page.evaluate(() => location.hash)).toContain("reel=");
    await page.evaluate(() => { document.getElementById("landing").classList.remove("active"); });
    await viewerOuvert(page);
    expect(await bobineAffichee(page)).toBe(BOBINE_SEED_ID);
  });

  test("échec : le hash reste, donc un rechargement peut retenter", async ({ page }) => {
    // Nettoyer le hash sur le chemin d'échec rendait le lien irrécupérable :
    // même F5 ne retentait rien, il fallait retourner dans la conversation.
    await bootAvecLien(page, "#reel=bobine_qui_nexiste_pas");
    await expect(page.locator("#toastStack .toast", { hasText: "Bobine introuvable ou supprimée" }))
      .toBeVisible({ timeout: 25000 });
    expect(await page.evaluate(() => location.hash)).toBe("#reel=bobine_qui_nexiste_pas");
  });
});
