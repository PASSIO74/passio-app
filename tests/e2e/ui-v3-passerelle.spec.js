// Lot UI-3A — passerelle « Ça me tente » du Feed vers l'IRL.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① l'URL NORMALE est strictement inchangée (aucun trait, aucun lien) et
//      l'aperçu n'écrit aucune activation dans localStorage ;
//   ② les deux kill switches (localStorage et mémoire) coupent l'aperçu ;
//   ③ une publication portant une Passio et SANS événement lié reçoit le trait
//      Passio et le lien ; une publication reliée à un événement, non (UI-3B) ;
//   ④ le tap ouvre « Autour de cette Passio » avec EXACTEMENT trois actions ;
//   ⑤ chacune des trois ouvre le moteur EXISTANT, sans rien créer ;
//   ⑥ la fermeture restitue la position exacte du Feed et l'identité active ;
//   ⑦ l'ancien CTA « Organiser un IRL » n'apparaît jamais en doublon ;
//   ⑧ mobile : 320 / 390 / 430 px sans débordement, cible tactile ≥ 44 px.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const PREVIEW = "?passio_preview=passio-ui-3";

// Marge de la restitution de position, en pixels. Elle absorbe la respiration
// propre au fil (`content-visibility: auto` sur `.post`), pas un saut : un
// retour en tête du fil ferait des milliers de pixels d'écart.
const SEUIL_PX = 8;

function post(id, name, extra) {
  return Object.assign({
    id, authorId: "auteur_" + id, authorName: name, authorEmoji: "🎧",
    authorColor: "#7c3aed", passion: "musique", mood: "creation", type: "text",
    text: "Publication de " + name, createdAt: 9000 - id.length,
    likes: 0, comments: [],
  }, extra || {});
}

const POSTS = [
  post("v3_a", "Alice"),
  post("v3_bb", "Bruno"),
  post("v3_ccc", "Carla"),
];

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_3", "0"));
  }
  if (opts.killMemoire) {
    await page.addInitScript(() => { window.PASSIO_UI_3 = false; });
  }
  await bootOnboarded(page, opts.errors, 1, opts.preview === false ? {} : { query: PREVIEW });
}

// Peuple le fil de façon déterministe et capture la télémétrie émise.
async function seedFeed(page, posts) {
  await page.evaluate((liste) => {
    window.__v3Tel = [];
    window.tel = window.tel || {};
    window.tel.action = function (name, meta) { window.__v3Tel.push({ name, meta }); };
    // L'aide contextuelle « auteur » est `position: fixed` : ouverte au-dessus du
    // fil, elle rendrait les taps non déterministes.
    state.hintsVus = state.hintsVus || {};
    state.hintsVus.feed_auteur = true;
    state.seed.posts = [];
    state.userPosts = [];
    state.supabasePosts = liste;
    state.user.profiles = [{ id: "pp_0", name: "Audit QA", passion: "musique", emoji: "🎵", color: "#7c3aed" }];
    _activeFeedPassions = new Set(["musique"]);
    activeFeedIntent = "for_you";
    window._feedDomSig = null;
    renderFeed();
  }, posts);
  await page.waitForTimeout(200); // l'observateur décore à la frame suivante
}

// ── ① L'URL normale reste la production ────────────────────────────────────
test("URL normale : aucun trait, aucun lien, aucune écriture d'activation", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { preview: false, errors });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(0);
  await expect(page.locator("#feedList [data-v3-tempt]")).toHaveCount(0);
  await expect(page.locator("#v3PassioSheet")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains("passio-ui-3"))).toBe(false);
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(false);

  // Les acquis UI-1 + UI-2 restent intacts sur cette même URL.
  await expect(page.locator("#appNavV2")).toBeVisible();
  await expect(page.locator("#feedIntentSelector")).toBeVisible();

  expect(errors.js, "exceptions JS sur l'URL normale").toEqual([]);
  expect(errors.console.filter((m) => m.includes("[ui-v3]"))).toEqual([]);
});

test("aperçu : aucune activation positive n'est écrite dans localStorage", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);
  await expect(page.locator("#feedList [data-v3-tempt]").first()).toBeVisible();

  // Ni la clé du lot, ni aucune autre clé qui rendrait l'aperçu « collant ».
  expect(await page.evaluate(() => localStorage.getItem("passio_ui_3"))).toBeNull();
  expect(await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => /ui_?3|ui-3/i.test(k)))).toEqual([]);
});

// ── ② Kill switches ────────────────────────────────────────────────────────
test("kill switch localStorage : l'aperçu est coupé malgré l'URL", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { killLocal: true, errors });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(0);
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(false);
  expect(errors.js).toEqual([]);
});

test("kill switch mémoire : window.PASSIO_UI_3 = false coupe l'aperçu", async ({ page }) => {
  await boot(page, { killMemoire: true });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(0);
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(false);

  // …et une coupure décidée en cours de session retire ce qui était déjà posé.
  await page.evaluate(() => { window.PASSIO_UI_3 = undefined; window.PassioUIV3.apply(); });
  await page.waitForTimeout(150);
  await expect(page.locator("#feedList [data-v3-bridge]").first()).toBeVisible();
  await page.evaluate(() => { window.PASSIO_UI_3 = false; window.PassioUIV3.apply(); });
  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(0);
});

// ── ③ Éligibilité ──────────────────────────────────────────────────────────
test("aperçu : le trait Passio et le lien n'apparaissent que sur les publications éligibles", async ({ page }) => {
  await boot(page);
  await seedFeed(page, [
    post("v3_ok", "Alice"),                                       // éligible
    post("v3_evt", "Bruno", { eventId: "e_42" }),                  // déjà relié → UI-3B
    post("v3_share", "Carla", { sharedReelData: { kind: "event", id: "e_7" } }),
    post("v3_nopsn", "Diane", { passion: "passion_inexistante" }), // Passio inconnue
  ]);

  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(1);
  const carte = page.locator('article.post[data-postid="v3_ok"]');
  await expect(carte.locator(".v3-bridge-trace")).toHaveCount(1);
  await expect(carte.locator(".v3-bridge-label")).toHaveText("Musique");
  await expect(carte.locator("[data-v3-tempt]")).toHaveText("Ça me tente");

  await expect(page.locator('article.post[data-postid="v3_evt"] [data-v3-bridge]')).toHaveCount(0);
  await expect(page.locator('article.post[data-postid="v3_share"] [data-v3-bridge]')).toHaveCount(0);
  await expect(page.locator('article.post[data-postid="v3_nopsn"] [data-v3-bridge]')).toHaveCount(0);
});

// ── ④ Le panneau et ses trois actions ──────────────────────────────────────
test("aperçu : le tap ouvre « Autour de cette Passio » avec exactement trois actions", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  await page.locator('article.post[data-postid="v3_a"] [data-v3-tempt]').click();
  const sheet = page.locator("#v3PassioSheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("#v3SheetTitle")).toHaveText("Autour de cette Passio");
  expect(await sheet.locator("[data-v3-choice] .v2-sheet-item-title").allTextContents()).toEqual([
    "Voir les activités", "Découvrir des personnes", "Proposer une sortie",
  ]);

  // Rôle de dialogue, état exposé au lecteur d'écran, focus entré dans la feuille.
  await expect(sheet.locator('[role="dialog"]')).toHaveAttribute("aria-modal", "true");
  await expect(page.locator('[data-v3-tempt="v3_a"]')).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() =>
    !!document.activeElement.closest("#v3PassioSheet"))).toBe(true);

  // Télémétrie : ouverture tracée, sans texte libre ni identifiant de personne.
  const tel = await page.evaluate(() => window.__v3Tel);
  const ouverture = tel.find((e) => e.name === "ui_v3_tempt_open");
  expect(ouverture).toBeTruthy();
  expect(Object.keys(ouverture.meta).sort()).toEqual(["has_psn", "has_ref", "v"]);
});

test("aperçu : Escape ferme le panneau et rien n'a été créé", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  const avant = await page.evaluate(() => ({
    events: (state.userEvents || []).length,
    joined: (state.user.joinedEvents || []).length,
    convs: Object.keys(window.conversations || {}).length,
    follows: (state.user.following || []).length,
  }));

  await page.locator('article.post[data-postid="v3_a"] [data-v3-tempt]').click();
  await expect(page.locator("#v3PassioSheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#v3PassioSheet")).toBeHidden();
  await expect(page.locator('[data-v3-tempt="v3_a"]')).toHaveAttribute("aria-expanded", "false");

  expect(await page.evaluate(() => ({
    events: (state.userEvents || []).length,
    joined: (state.user.joinedEvents || []).length,
    convs: Object.keys(window.conversations || {}).length,
    follows: (state.user.following || []).length,
  }))).toEqual(avant);
});

// ── ⑤ Les trois suites ouvrent les moteurs EXISTANTS ───────────────────────
test("aperçu : « Voir les activités » ouvre l'IRL filtré sur la Passio, sans GPS demandé", async ({ page }) => {
  await boot(page);
  // La géolocalisation est neutralisée AVANT le clic : si un appel partait, la
  // sonde le verrait. UI-3A ne doit jamais en émettre un.
  await page.evaluate(() => {
    window.__geoCalls = 0;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = function () { window.__geoCalls++; };
    }
  });
  await seedFeed(page, POSTS);

  await page.locator('article.post[data-postid="v3_a"] [data-v3-tempt]').click();
  await page.locator('[data-v3-choice="activities"]').click();

  await expect(page.locator("#v3PassioSheet")).toBeHidden();
  await expect(page.locator("#screen-irl")).toHaveClass(/active/);
  // Le filtre EXISTANT porte la Passio, et elle seule.
  expect(await page.evaluate(() => Array.from(irlPassionFilters))).toEqual(["musique"]);
  // …et la tuile correspondante est bien active à l'écran.
  await expect(page.locator('#irlPassionRow [data-irlpassion="musique"]')).toHaveClass(/active/);
  // Aucune activité, aucun RSVP créés par le passage.
  expect(await page.evaluate(() => (state.userEvents || []).length)).toBe(0);
  expect(await page.evaluate(() => (state.user.joinedEvents || []).length)).toBe(0);
  expect(await page.evaluate(() => window.__geoCalls)).toBe(0);

  // …et la suppression est À USAGE UNIQUE : le geste suivant SUR l'écran IRL
  // redemande la position normalement. Le marqueur ne peut donc pas couper
  // durablement la géolocalisation de l'app.
  expect(await page.evaluate(() => window._passioIrlSkipGeoOnce)).toBe(false);
  await page.evaluate(() => renderIRL());
  expect(await page.evaluate(() => window.__geoCalls)).toBe(1);
});

test("aperçu : « Découvrir des personnes » ouvre le parcours Passion, sans contact automatique", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  const suivisAvant = await page.evaluate(() => (state.user.following || []).length);

  await page.locator('article.post[data-postid="v3_a"] [data-v3-tempt]').click();
  await page.locator('[data-v3-choice="people"]').click();

  await expect(page.locator("#v3PassioSheet")).toBeHidden();
  const modal = page.locator("#modalBackdrop");
  await expect(modal).toHaveClass(/active/);
  await expect(modal.locator(".modal-title")).toHaveText("Musique");
  await expect(modal.locator(".section-title").first()).toHaveText("Créateurs");

  // Aucun abonnement, aucune conversation ouverte d'office.
  expect(await page.evaluate(() => (state.user.following || []).length)).toBe(suivisAvant);
  await expect(page.locator("#screen-messages")).not.toHaveClass(/active/);
});

test("aperçu : « Proposer une sortie » préremplit le formulaire IRL existant sans rien créer", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  await page.locator('article.post[data-postid="v3_a"] [data-v3-tempt]').click();
  await page.locator('[data-v3-choice="propose"]').click();

  await expect(page.locator("#v3PassioSheet")).toBeHidden();
  await expect(page.locator("#modalBackdrop")).toHaveClass(/active/);
  // Le formulaire EXISTANT, prérempli par le moteur EXISTANT.
  await expect(page.locator("#evPassion")).toHaveValue("musique");
  expect(await page.evaluate(() =>
    document.getElementById("modalContent").getAttribute("data-feed-irl-source"))).toBe("v3_a");
  // Rien n'est soumis : aucun événement créé tant que le testeur n'a pas validé.
  expect(await page.evaluate(() => (state.userEvents || []).length)).toBe(0);
});

// ── ⑥ Retour au Feed : position exacte et identité active ──────────────────
test("aperçu : fermer le panneau restitue la position du Feed et l'identité active", async ({ page }) => {
  await boot(page);
  // Assez de cartes pour que le fil défile réellement ET que la carte tapée
  // reste LOIN du bas : collé au bas, `scrollTop` est borné par la hauteur du
  // contenu, qui bouge encore de quelques pixels pendant que `renderFeed`
  // complète le fil en idle. On mesurerait alors la respiration du fil, pas la
  // restitution de la position.
  const beaucoup = [];
  for (let i = 0; i < 26; i++) beaucoup.push(post("v3_s" + "x".repeat(i), "Auteur " + i));
  await seedFeed(page, beaucoup);

  const identiteAvant = await page.evaluate(() => state.user.currentProfileId);

  // On tape une carte PROFONDE dans le fil : Playwright l'amène dans la vue, donc
  // la position réelle au moment de l'ouverture n'est pas le haut du fil. C'est
  // CETTE position que la fermeture doit rendre — la mesurer après le tap est la
  // seule façon honnête de le prouver (la fixer avant serait écrasé par le tap).
  await page.locator("#feedList [data-v3-tempt]").nth(8).click();
  await expect(page.locator("#v3PassioSheet")).toBeVisible();
  const posOuverture = await page.evaluate(() => document.getElementById("appMain").scrollTop);
  expect(posOuverture, "le fil doit réellement avoir défilé").toBeGreaterThan(0);

  // Fermeture par le « × » du panneau.
  await page.locator("#v3PassioSheet [data-v3-close]").click();
  await expect(page.locator("#v3PassioSheet")).toBeHidden();

  const posFermeture = await page.evaluate(() => document.getElementById("appMain").scrollTop);
  // ⚠️ Pourquoi une tolérance et pas l'égalité stricte : `.post` porte
  // `content-visibility: auto` (styles.css). Les cartes hors écran sont donc
  // estimées, et la hauteur du fil — donc `scrollTop` — respire de quelques
  // pixels d'elle-même, panneau ou pas. Mesuré : ±3 px sur un fil immobile.
  // Exiger l'égalité au pixel reviendrait à tester la virtualisation de
  // Chromium, pas la restitution. Ce qui doit être vrai, et qui l'est ici :
  // le fil ne saute pas, ne remonte pas en tête, on reste sur la même carte.
  expect(Math.abs(posFermeture - posOuverture)).toBeLessThanOrEqual(SEUIL_PX);
  expect(posFermeture).toBeGreaterThan(200);
  expect(await page.evaluate(() => state.user.currentProfileId)).toBe(identiteAvant);
  await expect(page.locator("#screen-feed")).toHaveClass(/active/);

  // Même exigence pour Escape et pour le tap hors panneau.
  for (const fermer of [
    () => page.keyboard.press("Escape"),
    () => page.locator("#v3PassioSheet").click({ position: { x: 5, y: 5 } }),
  ]) {
    await page.locator("#feedList [data-v3-tempt]").nth(8).click();
    await expect(page.locator("#v3PassioSheet")).toBeVisible();
    const pos = await page.evaluate(() => document.getElementById("appMain").scrollTop);
    await fermer();
    await expect(page.locator("#v3PassioSheet")).toBeHidden();
    const apres = await page.evaluate(() => document.getElementById("appMain").scrollTop);
    expect(Math.abs(apres - pos)).toBeLessThanOrEqual(SEUIL_PX);
    expect(apres).toBeGreaterThan(200);
  }
});

// ── ⑦ Aucun doublon avec l'ancien CTA ──────────────────────────────────────
test("aperçu : l'ancien CTA « Organiser un IRL » ne coexiste jamais avec « Ça me tente »", async ({ page }) => {
  await boot(page);
  // Le pont historique est explicitement rallumé : c'est le cas où le doublon
  // pourrait apparaître.
  await page.evaluate(() => { window.PASSIO_FEED_IRL_BRIDGE_V1 = true; });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-tempt]")).toHaveCount(3);
  await expect(page.locator("#feedList .feed-irl-bridge")).toHaveCount(0);
  await expect(page.locator("#feedList .feed-irl-cta")).toHaveCount(0);
  expect(await page.locator("#feedList").innerText()).not.toContain("Organiser un IRL");
});

// ── ⑧ Mobile ───────────────────────────────────────────────────────────────
for (const largeur of [320, 390, 430]) {
  test(`aperçu : aucun débordement et cible tactile ≥ 44 px en ${largeur} px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 844 });
    await boot(page);
    await seedFeed(page, POSTS);

    const cta = page.locator("#feedList [data-v3-tempt]").first();
    await expect(cta).toBeVisible();
    const boite = await cta.boundingBox();
    expect(boite.height).toBeGreaterThanOrEqual(44);

    // La carte ne déborde pas, et la page ne défile pas horizontalement.
    const debord = await page.evaluate(() => {
      const doc = document.documentElement;
      const row = document.querySelector("#feedList .v3-bridge");
      const carte = row.closest("article.post");
      return {
        page: doc.scrollWidth - doc.clientWidth,
        ligne: Math.round(row.getBoundingClientRect().right - carte.getBoundingClientRect().right),
      };
    });
    expect(debord.page).toBeLessThanOrEqual(0);
    expect(debord.ligne).toBeLessThanOrEqual(0);

    // Panneau ouvert : les trois actions restent dans l'écran et ≥ 44 px.
    await cta.click();
    await expect(page.locator("#v3PassioSheet")).toBeVisible();
    const items = await page.locator("#v3PassioSheet [data-v3-choice]").all();
    expect(items.length).toBe(3);
    for (const it of items) {
      const b = await it.boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(Math.round(b.x + b.width)).toBeLessThanOrEqual(largeur);
    }
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
