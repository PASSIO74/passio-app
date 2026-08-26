// Lot UI-2 — Feed V2 derrière l'aperçu UNIQUE `?passio_preview=passio-ui-v2`.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① l'URL NORMALE ne reçoit AUCUN module UI-2 et garde ses moods ;
//   ② l'aperçu montre la barre du bas UI-1 ET les cinq intentions UI-2 ;
//   ③ une Bobine est insérée DANS le fil, sans lecture automatique, et le tap
//      ouvre le viewer EXISTANT sur cette bobine précise ;
//   ④ « Passionnés à découvrir » n'apparaît jamais en tête, se limite à trois
//      personnes, exclut moi/suivis/bloqués, n'apparaît pas sous deux candidats
//      et n'offre qu'une issue : le profil existant ;
//   ⑤ l'état vide de l'aperçu se termine par une action, l'état vide historique
//      reste strictement inchangé.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const PREVIEW = "?passio_preview=passio-ui-v2";

// 1×1 transparent : aucune requête réseau, la vignette existe quand même.
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function post(id, authorId, name) {
  return {
    id, authorId, authorName: name, authorEmoji: "🎧", authorColor: "#7c3aed",
    passion: "musique", mood: "creation", type: "text", text: "Post de " + name,
    createdAt: 9000 - id.length, likes: 0, comments: [],
  };
}

const POSTS = [
  post("v2_a", "author_a", "Alice"),
  post("v2_bb", "author_b", "Bruno"),
  post("v2_ccc", "author_c", "Carla"),
  post("v2_dddd", "author_d", "Diane"),
  post("v2_eeeee", "author_e", "Elias"),
  post("v2_ffffff", "author_f", "Fanny"),
];

const REELS = [
  { id: "v2_reel_recent", authorId: "author_e", authorName: "Elias", authorEmoji: "🎬",
    passion: "musique", type: "photo", isReel: true, photo: PIXEL, image: PIXEL,
    text: "Ma bobine récente", createdAt: 9000, likes: 0, comments: [] },
  { id: "v2_reel_vieux", authorId: "author_f", authorName: "Fanny", authorEmoji: "🎬",
    passion: "musique", type: "photo", isReel: true, photo: PIXEL, image: PIXEL,
    text: "Ma bobine plus ancienne", createdAt: 1000, likes: 0, comments: [] },
];

async function boot(page, { preview = false, errors = null } = {}) {
  await bootOnboarded(page, errors, 1, preview ? { query: PREVIEW } : {});
}

// Peuple le fil de façon déterministe. `opts.reels` injecte des bobines dans une
// source que `buildReels()` lit réellement ; `opts.following` / `opts.blocked`
// pilotent les exclusions du module « Passionnés ».
async function seedFeed(page, opts = {}) {
  await page.evaluate(([posts, reels, cfg]) => {
    window.__v2Tel = [];
    window.tel = window.tel || {};
    window.tel.action = function(name, meta) { window.__v2Tel.push({ name, meta }); };
    // L'aide contextuelle « auteur » est `position: fixed` : ouverte au-dessus
    // du fil elle rendrait les taps de cette suite non déterministes. On la
    // marque vue, comme un utilisateur qui l'a déjà lue.
    state.hintsVus = state.hintsVus || {};
    state.hintsVus.feed_auteur = true;
    state.seed.posts = [];
    state.userPosts = [];
    // Auteurs « du réseau » : ils doivent arriver par une source qui n'est pas
    // la mienne, sinon ils seraient exclus au titre de « moi ».
    state.supabasePosts = posts.concat(reels);
    state.user.following = cfg.following || [];
    state.user.blocked = cfg.blocked || [];
    // Même id que `currentProfileId` de l'état onboardé : le profil actif doit
    // rester résoluble, sinon le haut du fil se rend sur un profil absent.
    state.user.profiles = [{ id: "pp_0", name: "Audit QA", passion: "musique", emoji: "🎵", color: "#7c3aed" }];
    _activeFeedPassions = new Set(cfg.passions || ["musique"]);
    _showFollowingFeed = !!cfg.following_feed;
    activeFeedIntent = "for_you";
    window._feedDomSig = null;
    renderFeed();
  }, [opts.posts || POSTS, opts.reels || [], opts]);
}

// ── ① L'URL normale n'apprend rien d'UI-2 ───────────────────────────────────
test("URL normale : aucun module UI-2, aucune Bobine injectée, moods intacts", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors });
  await seedFeed(page, { reels: REELS });

  await expect(page.locator("#feedList [data-v2-module]")).toHaveCount(0);
  await expect(page.locator("#feedList .v2-reel-card")).toHaveCount(0);
  await expect(page.locator("#feedList .v2-people")).toHaveCount(0);
  await expect(page.locator("#feedEmpty [data-v2-empty-cta]")).toHaveCount(0);

  // Le haut du fil reste celui de `main` : moods historiques, bulles de profils.
  await expect(page.locator("#moodSelector")).toBeVisible();
  await expect(page.locator("#feedIntentSelector")).toBeHidden();
  await expect(page.locator("#profileStrip")).toHaveCount(1);
  // …et la navigation aussi.
  await expect(page.locator("#appNav")).toBeVisible();
  await expect(page.locator("#appNavV2")).toHaveCount(0);

  expect(errors.js, "exceptions JS sur l'URL normale").toEqual([]);
  // `decorateFeed` signale ses échecs par un console.error préfixé : aucun ne
  // doit apparaître (le reste de la console est couvert par ui-v2-shell.spec).
  expect(errors.console.filter((m) => m.includes("[ui-v2]"))).toEqual([]);
});

// ── ② Bottom-nav UI-1 et cinq intentions UI-2, ensemble ─────────────────────
test("aperçu : barre du bas UI-1 et cinq intentions UI-2 simultanément", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { preview: true, errors });
  await seedFeed(page, { reels: REELS });

  await expect(page.locator("#appNavV2")).toBeVisible();
  await expect(page.locator("#appNav")).toBeHidden();
  expect(await page.$$eval("#appNavV2 .nav-v2-item", (els) =>
    els.map((e) => e.querySelector(".nav-label").textContent)))
    .toEqual(["Découvrir", "Rencontrer", "Créer", "Messages", "Profil"]);

  await expect(page.locator("#feedIntentSelector")).toBeVisible();
  await expect(page.locator("#moodSelector")).toBeHidden();
  expect(await page.locator(".feed-intent-btn").allTextContents())
    .toEqual(["Pour toi", "Découvrir", "Apprendre", "Créer", "Rencontrer"]);

  expect(errors.js, "exceptions JS dans l'aperçu").toEqual([]);
  expect(errors.console.filter((m) => m.includes("[ui-v2]"))).toEqual([]);
});

// ── ③ La Bobine est un format DU fil ────────────────────────────────────────
test("aperçu : une Bobine est insérée dans le fil, jamais en tête, sans lecture auto", async ({ page }) => {
  await boot(page, { preview: true });
  await seedFeed(page, { reels: REELS });

  const carte = page.locator("#feedList .v2-reel-card");
  await expect(carte).toHaveCount(1);           // un format du fil, pas un univers
  await expect(carte).toBeVisible();

  // La plus récente des bobines, et la carte porte bien son identifiant.
  await expect(carte).toHaveAttribute("data-reel-id", "v2_reel_recent");

  // Jamais la première carte du fil : deux posts la précèdent.
  const rang = await page.evaluate(() => {
    const kids = Array.from(document.getElementById("feedList").children);
    const idx = kids.findIndex((el) => el.classList.contains("v2-reel-card"));
    return { idx, postsAvant: kids.slice(0, idx).filter((el) => el.classList.contains("post")).length };
  });
  expect(rang.idx).toBeGreaterThan(0);
  expect(rang.postsAvant).toBe(2);

  // AUCUNE lecture automatique : pas un seul <video> injecté dans le fil.
  await expect(page.locator("#feedList video")).toHaveCount(0);
  await expect(carte.locator("img.v2-reel-poster")).toHaveCount(1);

  // La Bobine reste hors du set de posts : le fil garde exactement ses 6 cartes.
  await expect(page.locator("#feedList .post")).toHaveCount(POSTS.length);
});

test("aperçu : un tap sur la Bobine ouvre le viewer EXISTANT sur cette bobine", async ({ page }) => {
  await boot(page, { preview: true });
  await seedFeed(page, { reels: REELS });

  await page.locator("#feedList .v2-reel-card").click();
  await page.waitForFunction(() => {
    const v = document.getElementById("reelsViewer");
    return v && v.classList.contains("open");
  }, null, { timeout: 8000 });

  // C'est bien le viewer du projet, positionné sur la bobine de la carte.
  const courant = await page.evaluate(() => {
    const item = (reelsState.items || [])[reelsState.current];
    return { id: item && item.id, lecteurs: document.querySelectorAll("#reelsList .reel-item").length };
  });
  expect(courant.id).toBe("v2_reel_recent");
  expect(courant.lecteurs).toBe(REELS.length);

  await page.evaluate(() => closeReels());
});

// ── ④ Passionnés à découvrir ────────────────────────────────────────────────
test("aperçu : « Passionnés » après les premiers contenus, 3 max, exclusions respectées", async ({ page }) => {
  await boot(page, { preview: true });
  await seedFeed(page, { following: ["author_b"], blocked: ["author_c"] });

  const module = page.locator("#feedList .v2-people");
  await expect(module).toHaveCount(1);
  await expect(module.locator(".v2-people-title")).toHaveText("Passionnés à découvrir");

  // Jamais en tête : au moins quatre posts le précèdent.
  const rang = await page.evaluate(() => {
    const kids = Array.from(document.getElementById("feedList").children);
    const idx = kids.findIndex((el) => el.classList.contains("v2-people"));
    return { idx, postsAvant: kids.slice(0, idx).filter((el) => el.classList.contains("post")).length };
  });
  expect(rang.idx).toBeGreaterThan(0);
  expect(rang.postsAvant).toBe(4);

  // Trois personnes au maximum, et ni le compte suivi, ni le compte bloqué.
  const ids = await module.locator(".v2-person").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-v2-person")));
  expect(ids).toHaveLength(3);
  expect(ids).not.toContain("author_b");   // déjà suivi
  expect(ids).not.toContain("author_c");   // bloqué
  expect(new Set(ids).size).toBe(3);       // jamais deux fois la même personne

  // Aucune action de contact à ce stade : une seule issue par tuile.
  await expect(module.locator("button")).toHaveCount(3);
});

test("aperçu : le module exclut mon propre compte", async ({ page }) => {
  await boot(page, { preview: true });
  // `MY_UID` est un `let` de premier niveau : on ne peut pas le réaffecter
  // depuis l'extérieur, mais le module lit AUSSI `window.MY_UID` — c'est cette
  // seconde source qu'on utilise ici pour endosser l'identité d'un auteur du fil.
  await page.evaluate(() => { window.MY_UID = "author_a"; });
  await seedFeed(page, {});

  const ids = await page.locator("#feedList .v2-person").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-v2-person")));
  expect(ids.length).toBeGreaterThanOrEqual(2);   // le module s'affiche bien
  expect(ids).not.toContain("author_a");
  expect(ids).not.toContain("me");
});

test("aperçu : moins de deux candidats → aucun module affiché", async ({ page }) => {
  await boot(page, { preview: true });
  // Un seul auteur non suivi et non bloqué : le module n'a rien à raconter.
  await seedFeed(page, {
    posts: [POSTS[0], POSTS[1], POSTS[2], POSTS[3]],
    following: ["author_b", "author_d"],
    blocked: ["author_c"],
  });

  await expect(page.locator("#feedList .v2-people")).toHaveCount(0);
  // …et le fil, lui, reste rendu (les posts bloqués en moins).
  expect(await page.locator("#feedList .post").count()).toBeGreaterThan(0);
});

test("aperçu : une tuile « Passionnés » ouvre le profil existant, et rien d'autre", async ({ page }) => {
  await boot(page, { preview: true });
  await seedFeed(page, {});

  const avant = await page.evaluate(() => document.querySelector(".screen.active").id);
  expect(avant).toBe("screen-feed");

  await page.evaluate(() => {
    window.__profilsOuverts = [];
    window.openUserProfile = function(id) { window.__profilsOuverts.push(id); };
  });
  const premier = page.locator("#feedList .v2-person").first();
  const id = await premier.getAttribute("data-v2-person");
  await premier.click();

  expect(await page.evaluate(() => window.__profilsOuverts)).toEqual([id]);
  // Aucune conversation, aucune modale de rencontre n'a été ouverte.
  expect(await page.evaluate(() => document.querySelector(".screen.active").id)).toBe("screen-feed");
  await expect(page.locator("#modalBackdrop.active")).toHaveCount(0);
});

// ── ⑤ États vides : aperçu vs historique, testés séparément ─────────────────
test("aperçu : l'état vide se termine par une action", async ({ page }) => {
  await boot(page, { preview: true });
  await seedFeed(page, { passions: [] });

  const vide = page.locator("#feedEmpty");
  await expect(vide).toBeVisible();
  const cta = vide.locator("[data-v2-empty-cta]");
  await expect(cta).toHaveCount(1);
  await expect(cta).toHaveAttribute("data-v2-empty-cta", "explore");
  await expect(cta).toHaveText("Explorer les passions");

  await cta.click();
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-explore");
    return el && el.classList.contains("active");
  }, null, { timeout: 8000 });
});

test("aperçu : sans contenu de mes suivis, l'action proposée est de publier", async ({ page }) => {
  await boot(page, { preview: true });
  await seedFeed(page, { passions: [], following_feed: true });

  const cta = page.locator("#feedEmpty [data-v2-empty-cta]");
  await expect(cta).toHaveCount(1);
  await expect(cta).toHaveAttribute("data-v2-empty-cta", "create");
  await cta.click();
  // Elle rouvre le sélecteur « Créer » d'UI-1 — aucun nouvel éditeur.
  await expect(page.locator("#v2CreateSheet")).toBeVisible();
});

test("URL normale : l'état vide historique est strictement inchangé", async ({ page }) => {
  await boot(page);
  await seedFeed(page, { passions: [] });

  const vide = page.locator("#feedEmpty");
  await expect(vide).toBeVisible();
  await expect(vide.locator("[data-v2-empty-cta]")).toHaveCount(0);
  await expect(vide.locator(".empty-title")).toHaveText("Choisis une passion");
  await expect(vide.locator(".empty-text"))
    .toHaveText("Sélectionne une passion ci-dessus pour voir le contenu de ta communauté.");
});

// ── Cadrage mobile de référence ─────────────────────────────────────────────
test("aperçu 390 × 844 : modules dans le cadre, cibles tactiles suffisantes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, { preview: true });
  await seedFeed(page, { reels: REELS });

  const mesures = await page.evaluate(() => {
    const doc = document.documentElement;
    const reel = document.querySelector("#feedList .v2-reel-card");
    const tuiles = Array.from(document.querySelectorAll("#feedList .v2-person"));
    return {
      debordement: doc.scrollWidth > doc.clientWidth + 1,
      reelLargeur: reel ? reel.getBoundingClientRect().width : 0,
      conteneur: document.getElementById("feedList").clientWidth,
      minTuile: tuiles.length ? Math.min.apply(null, tuiles.map((t) => t.getBoundingClientRect().height)) : 0,
      nomsTronques: tuiles.filter((t) => {
        const n = t.querySelector(".v2-person-name");
        return n && n.scrollWidth > Math.ceil(n.clientWidth) + 1;
      }).length,
    };
  });

  expect(mesures.debordement, "la page déborde horizontalement").toBe(false);
  expect(mesures.reelLargeur).toBeLessThanOrEqual(mesures.conteneur + 1);
  expect(mesures.minTuile, "hauteur tactile d'une tuile Passionné").toBeGreaterThanOrEqual(44);
  expect(mesures.nomsTronques).toBe(0);
});
