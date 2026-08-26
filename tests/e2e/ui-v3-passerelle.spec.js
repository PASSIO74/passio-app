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

// Marge de la restitution de position, en pixels. Elle absorbe l'arrondi de
// mise en page, pas un saut : un retour en tête du fil ferait des centaines de
// pixels d'écart.
const SEUIL_PX = 4;
const TAILLE_FIL = 9;
const DEFILEMENT_PX = 500;

// Position de la carte `id` DANS LA FENÊTRE. C'est la bonne mesure de « la
// position du Feed » : `#appMain.scrollTop` est réévalué en continu par
// Chromium à cause de `content-visibility: auto` sur `.post`, précisément pour
// garder le contenu visible immobile — le suivre reviendrait à mesurer la
// virtualisation du navigateur, pas ce que le testeur voit.
function hautCarte(page, id) {
  return page.evaluate((postId) => {
    const el = document.querySelector(`#feedList article.post[data-postid="${postId}"]`);
    return el ? Math.round(el.getBoundingClientRect().top) : null;
  }, id);
}

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

  // ⚠️ Neutraliser les chargements de posts, comme le fait `bootInteractions`.
  // Plusieurs chemins font `state.supabasePosts = posts.concat(extra)` : une
  // requête du démarrage encore EN VOL se résout APRÈS le seed et remplace le
  // tableau en bloc — le fil ne contient alors plus les publications semées, et
  // un `toHaveCount(3)` tombe sur 0 ou 4 au hasard de la charge. Mesuré en CI
  // sur le test « l'ancien CTA ne coexiste jamais ». La cause est une course de
  // DONNÉES, pas de rendu : on la coupe à la source.
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaLoadEventPosts = async () => [];
  });
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
  // ⚠️ L'aide contextuelle « auteur » est `position: fixed` et INTERCEPTE les
  // taps. La marquer vue ne suffit pas : celle déclenchée par le `renderFeed`
  // du démarrage est déjà à l'écran quand ce helper s'exécute. On la ferme donc
  // explicitement — sinon un tap échoue en « subtree intercepts pointer events »,
  // au hasard de la charge du runner.
  await page.evaluate(() => {
    try { if (typeof fermerHint === "function") fermerHint(); } catch (e) {}
    document.querySelectorAll(".passio-hint").forEach((h) => h.remove());
  });
  // Attente DÉTERMINISTE de la décoration. Un délai fixe suffisait en local et
  // rendait la suite instable sur un runner CI chargé : on attend que le fil ait
  // cessé de bouger (nombre de cartes ET de traits stables sur plusieurs tours),
  // sinon Playwright tape dans une carte que `renderFeed` déplace encore.
  await page.waitForFunction(() => {
    const l = document.getElementById("feedList");
    if (!l) return false;
    const traits = l.querySelectorAll("[data-v3-bridge]").length;
    // ⚠️ La stabilité seule ne suffit PAS : « 0 trait » est parfaitement stable
    // tant que la décoration n'a pas tourné. Le garde rendait donc la main sur
    // un fil non décoré, et l'assertion suivante échouait au hasard de la charge
    // (mesuré en CI). Quand l'aperçu est actif, on exige d'abord qu'un trait
    // soit posé — toutes les publications semées sous aperçu en ont au moins un.
    const actif = !!(window.PassioUIV3 && window.PassioUIV3.isEnabled());
    if (actif && traits === 0) { window.__v3Stable = 0; return false; }
    const sig = l.querySelectorAll("article.post").length + ":" + traits + ":" + l.scrollHeight;
    if (window.__v3Sig === sig) { window.__v3Stable = (window.__v3Stable || 0) + 1; }
    else { window.__v3Sig = sig; window.__v3Stable = 0; }
    return window.__v3Stable >= 4;
  }, null, { timeout: 15000, polling: 100 });
}

// Fait défiler le fil À UNE POSITION CHOISIE, puis renvoie l'identifiant du
// « Ça me tente » le plus proche du centre de l'écran.
//
// ⚠️ Pourquoi ne pas simplement faire `.nth(N).click()` : Playwright amène
// d'abord la cible dans la vue, puis exige qu'elle soit STABLE deux frames de
// suite. Or `.post` porte `content-visibility: auto` — les cartes hors écran ne
// sont pas mises en page, elles valent `contain-intrinsic-size: auto 320px`, et
// chaque carte qui entre dans la vue remplace son estimation par sa hauteur
// RÉELLE, ce qui décale tout ce qui suit. Défiler loin dans un fil long
// déclenche donc une cascade de re-mesures : sur le runner CI, à 1600 px dans
// 26 cartes, la boîte ne s'est jamais stabilisée — ni pour Playwright, ni pour
// le garde ci-dessous (15 s de timeout, vert en local sur une machine rapide).
//
// Le scénario était irréaliste, pas le produit : un utilisateur tape une carte
// qu'il VOIT, dans un fil posé. On défile donc modérément (§ TAILLE_FIL /
// DEFILEMENT_PX), on attend que la cible ait cessé de bouger, et on tape une
// cible DÉJÀ dans la vue — Playwright n'a plus rien à faire défiler.
async function taperCarteVisible(page, offset) {
  await page.evaluate((y) => { document.getElementById("appMain").scrollTop = y; }, offset);
  await page.waitForTimeout(400);
  const id = await page.evaluate(() => {
    const centre = window.innerHeight / 2;
    let best = null, dist = Infinity;
    document.querySelectorAll("#feedList [data-v3-tempt]").forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 80) return;
      const d = Math.abs((r.top + r.bottom) / 2 - centre);
      if (d < dist) { dist = d; best = b.getAttribute("data-v3-tempt"); }
    });
    return best;
  });
  expect(id, "un « Ça me tente » doit être visible à cette position").toBeTruthy();

  // On attend que la cible ait cessé de bouger AVANT de taper. Playwright exige
  // deux frames identiques et abandonne au bout de 15 s ; sur un runner chargé,
  // la réévaluation des cartes `content-visibility` ne lui laissait pas toujours
  // cette fenêtre. On la lui donne explicitement.
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const t = Math.round(el.getBoundingClientRect().top);
    // Tolérance de 1 px : on veut détecter un fil qui BOUGE, pas l'arrondi
    // sous-pixel d'une mise en page par ailleurs posée.
    if (window.__v3Top != null && Math.abs(window.__v3Top - t) <= 1) {
      window.__v3TopN = (window.__v3TopN || 0) + 1;
    } else { window.__v3TopN = 0; }
    window.__v3Top = t;
    return window.__v3TopN >= 3;
  }, `[data-v3-tempt="${id}"]`, { timeout: 15000, polling: 100 });

  await page.locator(`[data-v3-tempt="${id}"]`).click();
  return id;
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

// L'aperçu ne tient QUE par `?passio_preview=…` dans l'URL, et `goTo` fait
// `history.pushState(..., "#" + ecran)` à chaque navigation. Si cet appel
// perdait la chaîne de requête, la passerelle disparaîtrait au premier
// aller-retour — sans erreur, sans trace. Ce test l'exerce pour de vrai.
test("aperçu : la passerelle survit à un aller-retour entre écrans", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);
  await expect(page.locator("#feedList [data-v3-tempt]")).toHaveCount(3);

  await page.evaluate(() => goTo("irl"));
  await expect(page.locator("#screen-irl")).toHaveClass(/active/);
  await page.evaluate(() => goTo("feed"));
  await expect(page.locator("#screen-feed")).toHaveClass(/active/);

  // Le drapeau se relit à CHAQUE rendu : s'il ne trouvait plus le paramètre,
  // le fil reviendrait nu.
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(true);
  await expect(page.locator("#feedList [data-v3-tempt]").first()).toBeVisible();

  // …et le parcours reste complet après l'aller-retour.
  await page.locator("#feedList [data-v3-tempt]").first().click();
  await expect(page.locator("#v3PassioSheet")).toBeVisible();
  await expect(page.locator("#v3PassioSheet [data-v3-choice]")).toHaveCount(3);
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
  // TAILLE_FIL = 9 : assez pour défiler réellement, et sous le seuil de peinture
  // rapide de `renderFeed` (12), donc SANS complément en idle qui rallongerait le
  // fil après coup. DEFILEMENT_PX = 500 : franchement au-dessus de zéro, et assez
  // proche du haut pour que seules deux ou trois cartes aient à se mesurer — le
  // fil se pose alors en quelques centaines de millisecondes, même sur un runner
  // chargé (cf. la note de `taperCarteVisible`).
  const beaucoup = [];
  for (let i = 0; i < TAILLE_FIL; i++) beaucoup.push(post("v3_s" + "x".repeat(i), "Auteur " + i));
  await seedFeed(page, beaucoup);

  const identiteAvant = await page.evaluate(() => state.user.currentProfileId);

  // On défile PROFONDÉMENT dans le fil, puis on tape une carte déjà visible. La
  // position réelle au moment de l'ouverture n'est donc pas le haut du fil :
  // c'est CELLE-LÀ que la fermeture doit rendre.
  // Les trois fermetures possibles doivent toutes rendre la même chose : la
  // carte tapée, au même endroit de l'écran, sur le Feed, sans changer d'identité.
  const fermetures = [
    ["le « × » du panneau", () => page.locator("#v3PassioSheet [data-v3-close]").click()],
    ["Escape", () => page.keyboard.press("Escape")],
    ["un tap hors panneau", () => page.locator("#v3PassioSheet").click({ position: { x: 5, y: 5 } })],
  ];

  for (const [nom, fermer] of fermetures) {
    const id = await taperCarteVisible(page, DEFILEMENT_PX);
    await expect(page.locator("#v3PassioSheet")).toBeVisible();
    const avant = await hautCarte(page, id);
    // Le fil a réellement défilé : la carte tapée n'est pas la première du fil.
    expect(await page.evaluate(() => document.getElementById("appMain").scrollTop),
      "le fil doit réellement avoir défilé").toBeGreaterThan(100);

    await fermer();
    await expect(page.locator("#v3PassioSheet")).toBeHidden();

    const apres = await hautCarte(page, id);
    expect(Math.abs(apres - avant), `fermeture par ${nom}`).toBeLessThanOrEqual(SEUIL_PX);
    // …et on est toujours sur le Feed, avec la même identité active.
    await expect(page.locator("#screen-feed")).toHaveClass(/active/);
    expect(await page.evaluate(() => state.user.currentProfileId)).toBe(identiteAvant);
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
  // Le CTA historique est bien RENDU par le moteur (le pont est allumé)…
  await expect(page.locator("#feedList .feed-irl-bridge")).toHaveCount(3);
  // …mais aucun n'est visible, et son libellé n'apparaît nulle part.
  await expect(page.locator("#feedList .feed-irl-bridge").first()).toBeHidden();
  expect(await page.locator("#feedList").innerText()).not.toContain("Organiser un IRL");
});

// Le pendant du test précédent : couper UI-3A doit RENDRE le CTA historique.
// Le masquer par CSS plutôt que le retirer du DOM est ce qui garantit ce retour ;
// l'implémentation initiale le détruisait et la carte se retrouvait sans aucune
// porte vers l'IRL après coupure (défaut relevé en contre-revue).
test("aperçu : couper UI-3A restitue le CTA historique, sans repeindre le fil", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.PASSIO_FEED_IRL_BRIDGE_V1 = true; });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-tempt]")).toHaveCount(3);
  await expect(page.locator("#feedList .feed-irl-bridge").first()).toBeHidden();

  // Coupure en mémoire, SANS toucher au fil : aucun renderFeed n'est appelé.
  await page.evaluate(() => { window.PASSIO_UI_3 = false; window.PassioUIV3.apply(); });

  await expect(page.locator("#feedList [data-v3-tempt]")).toHaveCount(0);
  await expect(page.locator("#feedList .feed-irl-bridge").first()).toBeVisible();
  expect(await page.locator("#feedList").innerText()).toContain("Organiser un IRL");
});

// ── ⑦ bis. L'aide contextuelle ne doit pas barrer la route ─────────────────
// Le harnais de cette suite ferme les aides pour rendre les taps déterministes.
// Ce test fait l'INVERSE : il en affiche une pour de vrai, et prouve que le
// parcours reste atteignable — sinon le confort du test masquerait un défaut
// produit (une bulle `position: fixed` qui intercepte le tap).
test("aperçu : une aide contextuelle VISIBLE n'empêche pas « Ça me tente »", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  // On affiche réellement l'aide « auteur », ancrée sur la première carte.
  const affichee = await page.evaluate(() => {
    state.hintsVus = {};
    return montrerHint("feed_auteur", "#feedList .post .post-author");
  });
  expect(affichee, "l'aide doit réellement s'être affichée").toBe(true);
  const bulle = page.locator('.passio-hint[data-hint="feed_auteur"]');
  await expect(bulle).toBeVisible();

  // Le parcours reste atteignable, aide affichée.
  await page.locator('article.post[data-postid="v3_a"] [data-v3-tempt]').click();
  await expect(page.locator("#v3PassioSheet")).toBeVisible();
  // …et l'aide a été fermée proprement, pas recouverte : aucune bulle orpheline
  // ne flotte au-dessus de la feuille.
  await expect(bulle).toHaveCount(0);

  await expect(page.locator("#v3PassioSheet [data-v3-choice]")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.locator("#v3PassioSheet")).toBeHidden();
});

// ── ⑦ ter. Accessibilité : le corail doit rester LISIBLE ───────────────────
// Le corail de marque #ff6b57 ne donne que 2,80:1 sur blanc — sous le 4,5:1 de
// WCAG AA pour du texte normal, et même sous le 3:1 des grands caractères (le
// lien fait 13 px). Ce test calcule le ratio RÉEL depuis les styles appliqués
// par le navigateur : une régression de jeton, de fond ou de couleur sera vue.
test("aperçu : le lien « Ça me tente » respecte le contraste AA (4,5:1)", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  const mesure = await page.evaluate(() => {
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // Fond EFFECTIF : on remonte les ancêtres jusqu'au premier fond opaque,
    // sinon on mesurerait contre un `transparent` qui ne veut rien dire.
    const fond = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        const v = parse(bg);
        if (v.length === 3 && !/rgba\(.*,\s*0\)/.test(bg)) return v;
      }
      return [255, 255, 255];
    };
    const cible = document.querySelector("#feedList [data-v3-tempt]");
    const st = getComputedStyle(cible);
    const c = lum(parse(st.color)), f = lum(fond(cible));
    const hi = Math.max(c, f), lo = Math.min(c, f);
    return {
      ratio: (hi + 0.05) / (lo + 0.05),
      couleur: st.color,
      taillePx: parseFloat(st.fontSize),
      graisse: st.fontWeight,
    };
  });

  // 13 px, même en graisse 800, relève du « texte normal » : le seuil des grands
  // caractères (3:1) ne s'applique qu'à partir de 18,66 px en gras.
  expect(mesure.taillePx, "un lien plus grand changerait le seuil applicable").toBeLessThan(18.66);
  expect(mesure.ratio, `contraste réel de ${mesure.couleur} : ${mesure.ratio.toFixed(2)}:1`)
    .toBeGreaterThanOrEqual(4.5);
});

// ── ⑦ quater. Mouvement : `prefers-reduced-motion` doit être respecté ──────
// L'ordre du lot autorise UNE transition courte à l'ouverture du panneau, et
// exige de respecter `prefers-reduced-motion`. Ce test l'exerce dans les deux
// réglages : l'animation existe par défaut, et elle disparaît quand l'utilisateur
// a demandé moins de mouvement — sans que le panneau cesse pour autant de
// s'ouvrir et de fonctionner.
test("aperçu : aucune animation quand l'utilisateur demande moins de mouvement", async ({ page }) => {
  await boot(page);
  // ⚠️ `page.emulateMedia` et non `test.use({ reducedMotion })` : mesuré ici, la
  // seconde forme ne parvenait pas jusqu'à la page (`matchMedia(...)` restait à
  // `false`) et le test aurait alors constaté « pas de réduction » sur un
  // navigateur qui n'avait rien demandé — un vert qui ne prouve rien. L'appel
  // explicite, lui, est vérifiable dans la ligne d'assertion ci-dessous.
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    "prémisse : le réglage doit réellement atteindre la page").toBe(true);

  await seedFeed(page, POSTS);
  await page.locator('article.post[data-postid="v3_a"] [data-v3-tempt]').click();
  await expect(page.locator("#v3PassioSheet")).toBeVisible();

  const m = await page.evaluate(() => {
    const st = getComputedStyle(document.querySelector("#v3PassioSheet .v3-sheet-trace"));
    return { duree: parseFloat(st.transitionDuration), transform: st.transform };
  });
  expect(m.duree, "aucune transition sur le trait").toBe(0);
  // Le trait doit être ENTIÈREMENT déployé, pas figé à scaleX(0) : couper
  // l'animation ne doit pas couper l'élément qu'elle animait.
  expect(m.transform, "le trait reste déployé (identité, pas scaleX(0))")
    .toBe("matrix(1, 0, 0, 1, 0, 0)");

  // Le panneau reste pleinement utilisable.
  await expect(page.locator("#v3PassioSheet [data-v3-choice]")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.locator("#v3PassioSheet")).toBeHidden();
});

// Le pendant : sans réglage particulier, la transition courte EXISTE bien.
test("aperçu : la transition d'ouverture existe par défaut", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);
  await page.locator('article.post[data-postid="v3_a"] [data-v3-tempt]').click();
  await expect(page.locator("#v3PassioSheet")).toBeVisible();

  const duree = await page.evaluate(() => {
    const st = getComputedStyle(document.querySelector("#v3PassioSheet .v3-sheet-trace"));
    return parseFloat(st.transitionDuration);
  });
  expect(duree, "une transition, et courte").toBeGreaterThan(0);
  expect(duree, "pas plus de 400 ms : « transitions courtes et tactiles »").toBeLessThanOrEqual(0.4);
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
