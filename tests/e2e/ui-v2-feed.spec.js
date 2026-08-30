// Lot UI-2 — Feed V2 actif par défaut depuis validation du 2026-08-26.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① le kill switch restaure le Feed historique et ses moods ;
//   ② l'URL normale montre la barre du bas UI-1 ET les cinq intentions UI-2 ;
//   ③ les bobines sont une RANGÉE insérée dans le fil (jamais une carte pleine
//      largeur), sans lecture automatique, et le tap ouvre le viewer EXISTANT
//      sur la bobine touchée — la première comme la suivante ;
//   ④ « Passionnés à découvrir » n'apparaît jamais en tête, se limite à trois
//      personnes, exclut moi/suivis/bloqués, n'apparaît pas sous deux candidats
//      et n'offre qu'une issue : le profil existant ;
//   ⑤ l'état vide de la V2 se termine par une action, l'état vide historique
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

async function boot(page, { preview = false, legacy = false, errors = null } = {}) {
  if (legacy) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_v2", "0"));
  }
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
    // ⚠️ `hintsVus` empêche les PROCHAINES aides, il ne retire pas la bulle DÉJÀ
    // posée pendant le démarrage — elle s'ancre après le premier rendu du fil de
    // démonstration, donc bien avant ce seed. Elle est `position: fixed` et
    // intercepte alors le tap (clic refusé, jamais forcé). On la ferme par le
    // MÉCANISME PRODUIT — le bouton « Compris », qui appelle `fermerHint()` —
    // exactement comme le ferait l'utilisateur ; repli direct sur `fermerHint()`
    // si la bulle existe sans son bouton.
    var hintOk = document.querySelector(".passio-hint .passio-hint-ok");
    if (hintOk) hintOk.click();
    else if (typeof fermerHint === "function") fermerHint();
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
    // ADR-010 : la bascule `_showFollowingFeed` est remplacée par une VUE
    // persistée. `following_feed: true` demandait « montre-moi mes suivis » →
    // c'est désormais la vue « Suivis ».
    state.feedView = cfg.following_feed ? "suivis" : "accueil";
    activeFeedIntent = "for_you";
    window._feedDomSig = null;
    renderFeed();
  }, [opts.posts || POSTS, opts.reels || [], opts]);
}

// ── ① Le kill switch restaure le Feed historique ────────────────────────────
test("kill switch : aucun module UI-2, aucune Bobine injectée, moods intacts", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { legacy: true, errors });
  await seedFeed(page, { reels: REELS });

  await expect(page.locator("#feedList [data-v2-module]")).toHaveCount(0);
  await expect(page.locator("#feedList .v2-reels")).toHaveCount(0);
  await expect(page.locator("#feedList .v2-reel-tile")).toHaveCount(0);
  await expect(page.locator("#feedList .v2-people")).toHaveCount(0);
  await expect(page.locator("#feedEmpty [data-v2-empty-cta]")).toHaveCount(0);

  // Le haut du fil reste celui de `main` : moods historiques, bulles de profils.
  await expect(page.locator("#moodSelector")).toBeVisible();
  await expect(page.locator("#feedIntentSelector")).toBeHidden();
  await expect(page.locator("#profileStrip")).toHaveCount(1);
  // …et la navigation aussi.
  await expect(page.locator("#appNav")).toBeVisible();
  await expect(page.locator("#appNavV2")).toHaveCount(0);

  expect(errors.js, "exceptions JS avec le kill switch").toEqual([]);
  // `decorateFeed` signale ses échecs par un console.error préfixé : aucun ne
  // doit apparaître (le reste de la console est couvert par ui-v2-shell.spec).
  expect(errors.console.filter((m) => m.includes("[ui-v2]"))).toEqual([]);
});

// ── ② Bottom-nav UI-1 et cinq intentions UI-2, ensemble ─────────────────────
test("URL normale : barre du bas UI-1 et cinq intentions UI-2 simultanément", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors });
  await seedFeed(page, { reels: REELS });

  await expect(page.locator("#appNavV2")).toBeVisible();
  await expect(page.locator("#appNav")).toBeHidden();
  expect(await page.$$eval("#appNavV2 .nav-v2-item", (els) =>
    els.map((e) => e.querySelector(".nav-label").textContent)))
    .toEqual(["Découvrir", "Rencontrer", "Créer", "Messages", "Profil"]);

  await expect(page.locator("#feedIntentSelector")).toBeVisible();
  await expect(page.locator("#moodSelector")).toBeHidden();
  expect(await page.locator(".feed-intent-btn").allTextContents())
    .toEqual(["Tous", "Explorer", "Apprendre", "Idées", "Rencontrer"]);

  expect(errors.js, "exceptions JS dans l'aperçu").toEqual([]);
  expect(errors.console.filter((m) => m.includes("[ui-v2]"))).toEqual([]);
});

// ── ③ Les bobines sont une RANGÉE du fil, pas une carte plein format ────────
test("URL normale : une rangée de bobines dans le fil, jamais en tête, sans lecture auto", async ({ page }) => {
  await boot(page);
  await seedFeed(page, { reels: REELS });

  // UN module, plusieurs vignettes — c'est tout l'objet du changement du
  // 2026-08-28 : la carte pleine largeur occupait ~530 px de haut sur mobile.
  const module = page.locator("#feedList .v2-reels");
  await expect(module).toHaveCount(1);
  await expect(module).toBeVisible();
  await expect(module.locator(".v2-reels-title")).toHaveText("Bobines à découvrir");

  const tuiles = module.locator(".v2-reel-tile");
  await expect(tuiles).toHaveCount(REELS.length);
  // Ordre : la plus récente en premier (buildReels trie par createdAt décroissant).
  await expect(tuiles.nth(0)).toHaveAttribute("data-reel-id", "v2_reel_recent");
  await expect(tuiles.nth(1)).toHaveAttribute("data-reel-id", "v2_reel_vieux");

  // Jamais la première carte du fil : deux posts la précèdent.
  const rang = await page.evaluate(() => {
    const kids = Array.from(document.getElementById("feedList").children);
    const idx = kids.findIndex((el) => el.classList.contains("v2-reels"));
    return { idx, postsAvant: kids.slice(0, idx).filter((el) => el.classList.contains("post")).length };
  });
  expect(rang.idx).toBeGreaterThan(0);
  expect(rang.postsAvant).toBe(2);

  // AUCUNE lecture automatique : pas un seul <video> injecté dans le fil.
  await expect(page.locator("#feedList video")).toHaveCount(0);
  await expect(module.locator("img.v2-reel-poster")).toHaveCount(REELS.length);

  // Les bobines restent hors du set de posts : le fil garde ses 6 cartes.
  await expect(page.locator("#feedList .post")).toHaveCount(POSTS.length);

  // Le module est NETTEMENT plus court que la carte d'avant : elle valait
  // 1,25 × la largeur du fil rien que pour son média. On borne à cette largeur,
  // ce qui interdit tout retour à un format plein écran sans réécrire le test.
  const mesures = await page.evaluate(() => {
    const sec = document.querySelector("#feedList .v2-reels");
    const list = document.getElementById("feedList");
    return { hauteur: sec.getBoundingClientRect().height, largeur: list.getBoundingClientRect().width };
  });
  expect(mesures.hauteur).toBeLessThan(mesures.largeur);
});

test("URL normale : aucune bobine éligible → aucune rangée", async ({ page }) => {
  await boot(page);
  await seedFeed(page, { reels: [] });
  await expect(page.locator("#feedList .v2-reels")).toHaveCount(0);
  // …et le fil reste complet : l'absence de module ne coûte aucun post.
  await expect(page.locator("#feedList .post")).toHaveCount(POSTS.length);
});

test("URL normale : un tap sur une vignette ouvre le viewer EXISTANT sur CETTE bobine", async ({ page }) => {
  await boot(page);
  await seedFeed(page, { reels: REELS });

  await page.locator("#feedList .v2-reel-tile").first().click();
  await page.waitForFunction(() => {
    const v = document.getElementById("reelsViewer");
    return v && v.classList.contains("open");
  }, null, { timeout: 8000 });

  // C'est bien le viewer du projet, positionné sur la bobine touchée.
  const courant = await page.evaluate(() => {
    const item = (reelsState.items || [])[reelsState.current];
    return { id: item && item.id, lecteurs: document.querySelectorAll("#reelsList .reel-item").length };
  });
  expect(courant.id).toBe("v2_reel_recent");
  expect(courant.lecteurs).toBe(REELS.length);

  await page.evaluate(() => closeReels());

  // La SECONDE vignette ouvre la SECONDE bobine : sans ce contrôle, une rangée
  // dont toutes les tuiles ouvrent la première passerait pour correcte
  // (openReelById ne se déplace que sur `idx > 0`).
  await page.locator("#feedList .v2-reel-tile").nth(1).click();
  await page.waitForFunction(() => {
    const v = document.getElementById("reelsViewer");
    return v && v.classList.contains("open");
  }, null, { timeout: 8000 });
  await page.waitForFunction(() => {
    const item = (reelsState.items || [])[reelsState.current];
    return item && item.id === "v2_reel_vieux";
  }, null, { timeout: 8000 });

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

test("kill switch : l'état vide historique est strictement inchangé", async ({ page }) => {
  await boot(page, { legacy: true });
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
    const bobines = document.querySelector("#feedList .v2-reels");
    const rangee = document.querySelector("#feedList .v2-reels-row");
    const vignettes = Array.from(document.querySelectorAll("#feedList .v2-reel-tile"));
    const tuiles = Array.from(document.querySelectorAll("#feedList .v2-person"));
    return {
      debordement: doc.scrollWidth > doc.clientWidth + 1,
      bobinesLargeur: bobines ? bobines.getBoundingClientRect().width : 0,
      rangeeLargeur: rangee ? rangee.getBoundingClientRect().width : 0,
      conteneur: document.getElementById("feedList").clientWidth,
      minVignette: vignettes.length ? Math.min.apply(null, vignettes.map((t) => t.getBoundingClientRect().height)) : 0,
      minTuile: tuiles.length ? Math.min.apply(null, tuiles.map((t) => t.getBoundingClientRect().height)) : 0,
      nomsTronques: tuiles.filter((t) => {
        const n = t.querySelector(".v2-person-name");
        return n && n.scrollWidth > Math.ceil(n.clientWidth) + 1;
      }).length,
    };
  });

  expect(mesures.debordement, "la page déborde horizontalement").toBe(false);
  expect(mesures.bobinesLargeur).toBeLessThanOrEqual(mesures.conteneur + 1);
  expect(mesures.rangeeLargeur).toBeLessThanOrEqual(mesures.conteneur + 1);
  expect(mesures.minVignette, "hauteur tactile d'une vignette Bobine").toBeGreaterThanOrEqual(44);
  expect(mesures.minTuile, "hauteur tactile d'une tuile Passionné").toBeGreaterThanOrEqual(44);
  expect(mesures.nomsTronques).toBe(0);
});

// La rangée doit DÉFILER quand il y a plus de bobines que de place — et c'est
// exactement là qu'une tuile sans `flex: 0 0` ferait déborder la PAGE. Les deux
// mesures sont indissociables : le débordement autorisé est celui de la rangée,
// jamais celui du document.
test("390 × 844 : la rangée de bobines défile sans faire déborder la page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const beaucoup = [];
  for (let i = 0; i < 8; i++) {
    beaucoup.push({
      id: "v2_reel_n" + i, authorId: "author_e", authorName: "Elias " + i, authorEmoji: "🎬",
      passion: "musique", type: "photo", isReel: true, photo: PIXEL, image: PIXEL,
      text: "Bobine " + i, createdAt: 9000 - i, likes: 0, comments: [],
    });
  }
  await seedFeed(page, { reels: beaucoup });

  await expect(page.locator("#feedList .v2-reel-tile")).toHaveCount(8);
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const r = document.querySelector("#feedList .v2-reels-row");
    return {
      pageDeborde: doc.scrollWidth > doc.clientWidth + 1,
      rangeeDefile: r.scrollWidth > r.clientWidth + 1,
    };
  });
  expect(m.pageDeborde, "la page déborde horizontalement").toBe(false);
  expect(m.rangeeDefile, "la rangée devrait défiler avec 8 bobines").toBe(true);
});
