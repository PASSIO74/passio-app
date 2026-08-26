// Lot UI-2 — Feed V2 et intentions, derrière l'aperçu `passio-ui-v2`.
//
// Ce que cette suite prouve :
//   ① l'URL NORMALE garde le fil actuel — moods, aucune Bobine, aucun module ;
//   ② l'aperçu unique allume « Envie du moment » (5 intentions, sans pastille
//      ni libellé tronqué) ;
//   ③ changer d'intention ne RETIRE jamais un post — aucun filtre dur ;
//   ④ une Bobine entre dans le fil et son tap ouvre le viewer plein écran ;
//   ⑤ le module « Passionnés à découvrir » mène au PROFIL, pas à un message ;
//   ⑥ l'état vide de la V2 nomme la suite au lieu de constater l'absence.
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { onboardedState } = require("./app-helper");

const PREVIEW = "?passio_preview=passio-ui-v2";
const INTENTS = ["Pour toi", "Découvrir", "Apprendre", "Créer", "Rencontrer"];

async function boot(page, { preview = false, errors = null } = {}) {
  if (errors) {
    page.on("pageerror", (e) => errors.js.push("pageerror: " + e.message));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const txt = m.text();
      if (/Failed to load resource|net::|ERR_/.test(txt)) errors.network.push(txt);
      else errors.console.push(txt);
    });
  }
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    if (!localStorage.getItem("passio_mvp_state_v1")) {
      // Les aides contextuelles (spec §8) flottent au-dessus du fil et
      // intercepteraient les taps. On les marque « déjà vues » via le mécanisme
      // prévu par le produit : aucune assertion de ce fichier ne les concerne.
      st.hintsVus = { feed_auteur: 1, profil_visite: 1, second_profil: 1, conversation_irl: 1 };
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    }
  }, [GATE_KEY, GATE_TOKEN, onboardedState(1)]);
  await page.goto("/index.html" + (preview ? PREVIEW : ""));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const l = document.getElementById("landing");
    if (l) l.classList.remove("active");
    window.supaPublishPostWithRetry = async () => false;
    window.supaUpsertProfile = async () => {};
  });
}

// Le fil se peint en DEUX temps (12 cartes, puis le reste en idle) et ses
// images arrivent en différé : pendant quelques centaines de millisecondes, tout
// ce qui est en dessous se décale. Playwright refuse alors de cliquer (« element
// is not stable »). On attend donc que la hauteur du fil ne bouge plus — c'est un
// alignement sur le rendu réel, pas un contournement d'assertion.
async function attendreFilStable(page) {
  await page.waitForFunction(() => {
    const l = document.getElementById("feedList");
    if (!l) return false;
    const h = l.scrollHeight;
    const n = l.children.length;
    const memo = window.__filStable || { h: -1, n: -1, fois: 0 };
    if (memo.h === h && memo.n === n) memo.fois++;
    else { memo.h = h; memo.n = n; memo.fois = 0; }
    window.__filStable = memo;
    return memo.fois >= 3;
  }, null, { timeout: 15000 });
  await page.evaluate(() => { window.__filStable = null; });
}

// Attend que le rectangle d'UN élément précis cesse de bouger. Le fil entier
// peut continuer à se réagencer plus bas (images différées) sans que la carte
// visée bouge : viser l'élément plutôt que le document rend le clic déterministe
// même quand la suite Playwright tourne à plusieurs workers.
async function attendreElementStable(page, selector) {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const memo = window.__elStable || { y: NaN, h: NaN, fois: 0 };
    if (Math.abs(memo.y - r.top) < 1 && Math.abs(memo.h - r.height) < 1) memo.fois++;
    else { memo.y = r.top; memo.h = r.height; memo.fois = 0; }
    window.__elStable = memo;
    return memo.fois >= 4 && r.height > 0;
  }, selector, { timeout: 15000, polling: 120 });
  await page.evaluate(() => { window.__elStable = null; });
}

// Active toutes les passions du jeu de démonstration : sans ça le fil reste sur
// « Choisis une Passio » et aucun test de contenu ne prouverait quoi que ce soit.
async function remplirLeFil(page) {
  await page.evaluate(() => {
    const passions = new Set((state.seed.posts || []).map((p) => p.passion).filter(Boolean));
    passions.forEach((p) => { if (!_activeFeedPassions.has(p)) toggleProfileFilter(p); });
    window._feedDomSig = null;
    renderFeed();
  });
  await page.waitForFunction(() => document.querySelectorAll("#feedList .post").length > 0,
    null, { timeout: 8000 });
  await attendreFilStable(page);
}

// Le jeu de démonstration ne contient AUCUNE bobine : on en injecte une en
// mémoire (jamais en base) pour éprouver le chemin réel Bobine → fil.
async function injecterBobine(page) {
  await page.evaluate(() => {
    state.userPosts = state.userPosts || [];
    if (!state.userPosts.some((p) => p.id === "reel_e2e_1")) {
      state.userPosts.push({
        id: "reel_e2e_1", authorId: "u_lea", authorName: "Léa Moreau",
        passion: "musique", mood: "creation", type: "video", isReel: true,
        video: "https://example.invalid/demo.mp4",
        // Vignette en data: URI — c'est le cas réel (une bobine publiée porte sa
        // cover) et, surtout, elle rend la carte immédiatement stable : un
        // <video> dont l'URL est injoignable retente le chargement en boucle et
        // fait vibrer la mise en page, ce que Playwright refuse de cliquer.
        coverPhotoUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        text: "Bobine de test", createdAt: Date.now(), likes: 0, comments: [],
      });
    }
    if (!_activeFeedPassions.has("musique")) toggleProfileFilter("musique");
    // Deux réglages, tous deux des soupapes existantes de l'app, pour rendre ce
    // test déterministe sans rien affaiblir de ce qu'il vérifie :
    //  ① ordre chronologique strict (`passio_feed_rank="0"`) → la Bobine, qui
    //     vient d'être créée, est la PREMIÈRE carte. Le classement par
    //     pertinence ne la garantissait pas dans une fenêtre courte ;
    //  ② fenêtre de rendu réduite → presque aucune image ne charge au-dessus
    //     d'elle, donc la carte ne se décale pas sous le pointeur (Playwright
    //     refuse de cliquer une cible mouvante).
    try { localStorage.setItem("passio_feed_rank", "0"); } catch (e) {}
    window._feedRenderLimit = 5;
    window._feedDomSig = null;
    renderFeed();
  });
  await page.waitForTimeout(400);
  await attendreFilStable(page);
}

// ── ① L'URL normale ne bouge pas ────────────────────────────────────────────
test("URL normale : le fil actuel est intact, aucune surface V2", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors });
  await remplirLeFil(page);
  await injecterBobine(page);

  // Ligne d'onglets : les moods historiques, pas les intentions.
  await expect(page.locator("#moodSelector")).toBeVisible();
  await expect(page.locator("#feedIntentSelector")).toBeHidden();

  // Aucune surface du lot UI-2.
  await expect(page.locator("#feedList .v2-reel-media")).toHaveCount(0);
  await expect(page.locator("#feedList .v2-people")).toHaveCount(0);

  // La Bobine injectée reste HORS du fil — comportement historique.
  await expect(page.locator('#feedList .post[data-postid="reel_e2e_1"]')).toHaveCount(0);

  // Les bulles de profils restent en place (langage visuel verrouillé).
  await expect(page.locator("#profileStrip")).toHaveCount(1);

  expect(errors.js, "exceptions JS sur l'URL normale").toEqual([]);
  expect(errors.console, "console.error sur l'URL normale").toEqual([]);
});

// ── ② Un seul aperçu allume aussi « Envie du moment » ───────────────────────
test("aperçu : « Envie du moment » remplace les moods, sans pastille ni troncature", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { preview: true, errors });
  await remplirLeFil(page);

  await expect(page.locator("#feedIntentSelector")).toBeVisible();
  await expect(page.locator("#moodSelector")).toBeHidden();

  const btns = page.locator(".feed-intent-btn");
  await expect(btns).toHaveCount(5);
  expect(await btns.allTextContents()).toEqual(INTENTS);

  // Le composant reste une LIGNE D'ONGLETS soulignés : ni fond plein, ni
  // pastille arrondie. La direction verrouille ce langage visuel.
  const style = await page.$eval(".feed-intent-btn.active", (el) => {
    const cs = getComputedStyle(el);
    return { radius: parseFloat(cs.borderTopLeftRadius) || 0, underline: cs.borderBottomColor };
  });
  expect(style.radius, "onglet actif : pas de pastille arrondie").toBeLessThanOrEqual(8);

  // Aucun libellé rogné : la ligne défile au lieu de tronquer (direction §6).
  const tronques = await page.$$eval(".feed-intent-btn", (els) =>
    els.filter((b) => b.scrollWidth > Math.ceil(b.getBoundingClientRect().width) + 1)
       .map((b) => b.textContent));
  expect(tronques, "libellés tronqués").toEqual([]);

  expect(errors.js, "exceptions JS dans l'aperçu").toEqual([]);
});

// ── ③ Les intentions RÉORDONNENT, elles ne filtrent jamais ──────────────────
test("aperçu : changer d'intention réordonne le fil sans jamais le filtrer", async ({ page }) => {
  await boot(page, { preview: true });
  await remplirLeFil(page);

  // ⚠️ L'assertion porte sur le CLASSEMENT COMPLET, pas sur les cartes peintes :
  // le fil n'en rend que 20 à la fois, si bien qu'un simple réordonnancement
  // change légitimement la fenêtre visible. Comparer le DOM ferait échouer un
  // comportement correct — et masquerait un vrai filtre dès la 21ᵉ carte.
  const mesure = await page.evaluate(() => {
    const posts = allFeedPosts().filter((p) => p.type !== "vlog")
      .filter((p) => _activeFeedPassions.has(p.passion));
    const cle = (arr) => arr.map((p) => p.id).slice().sort().join("|");
    const base = rankFeedPosts(posts);
    const out = { total: base.length, base: cle(base), parIntention: {}, ordres: {} };
    ["for_you", "discover", "learn", "create", "meet"].forEach((i) => {
      const r = rankFeedPostsForIntent(posts, i);
      out.parIntention[i] = cle(r);
      out.ordres[i] = r.map((p) => p.id).join("|");
    });
    return out;
  });

  expect(mesure.total, "le fil de référence n'est pas vide").toBeGreaterThan(0);
  for (const intent of ["for_you", "discover", "learn", "create", "meet"]) {
    expect(mesure.parIntention[intent], `intention « ${intent} » : même ensemble de posts`)
      .toBe(mesure.base);
  }

  // …et une intention doit tout de même AVOIR un effet, sinon le composant
  // n'est qu'un décor : au moins un ordre diffère de « Pour toi ».
  const different = ["discover", "learn", "create", "meet"]
    .some((i) => mesure.ordres[i] !== mesure.ordres.for_you);
  expect(different, "au moins une intention réordonne réellement le fil").toBe(true);

  // Le clic réel reste vérifié : l'onglet devient actif et le fil se repeint.
  await page.click('.feed-intent-btn[data-intent="meet"]');
  await page.waitForTimeout(450);
  await expect(page.locator('.feed-intent-btn[data-intent="meet"]')).toHaveClass(/active/);
  await expect(page.locator("#feedList .post").first()).toBeVisible();
});

// ── ④ Bobines dans le fil ───────────────────────────────────────────────────
test("aperçu : une Bobine entre dans le fil et son tap ouvre le viewer", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { preview: true, errors });
  await remplirLeFil(page);
  await injecterBobine(page);

  const carte = page.locator('#feedList .post[data-postid="reel_e2e_1"]');
  await expect(carte, "la Bobine apparaît dans le fil").toHaveCount(1);

  const media = carte.locator(".v2-reel-media");
  await expect(media).toHaveCount(1);
  await expect(media.locator(".v2-reel-badge")).toHaveText("Bobine");
  // Chemin « bobine sans vignette » : le helper doit alors produire la vidéo
  // muette d'aperçu, jamais un lecteur avec contrôles. Vérifié sur le markup
  // (le rendu réel d'une URL injoignable ne prouverait rien de plus).
  const sansVignette = await page.evaluate(() => window.PassioUIV2Feed.reelMediaHtml({
    id: "reel_sans_cover", video: "https://example.invalid/x.mp4",
  }));
  expect(sansVignette, "aperçu vidéo muet").toContain("muted");
  expect(sansVignette, "aucun lecteur avec contrôles").not.toContain("controls");
  expect(sansVignette, "le tap ouvre le viewer").toContain("openReelById");
  // Ni vignette ni vidéo : rien à montrer, on rend "" et l'appelant garde son
  // rendu habituel plutôt qu'un cadre noir vide.
  const vide = await page.evaluate(() => window.PassioUIV2Feed.reelMediaHtml({ id: "x" }));
  expect(vide, "bobine sans média jouable").toBe("");
  // Pas de lecteur inline : une Bobine se regarde en plein écran, pas dans la
  // carte — sinon le fil redevient un mur de vidéos qui s'autolancent.
  await expect(carte.locator("video[controls]")).toHaveCount(0);

  const selMedia = '#feedList .post[data-postid="reel_e2e_1"] .v2-reel-media';
  await attendreElementStable(page, selMedia);
  await media.first().click();
  await page.waitForFunction(() => {
    const v = document.getElementById("reelsViewer");
    return v && v.classList.contains("open");
  }, null, { timeout: 8000 });
  await page.evaluate(() => { if (typeof closeReels === "function") closeReels(); });

  expect(errors.js, "exceptions JS avec une Bobine dans le fil").toEqual([]);
});

// ── ⑤ Module « Passionnés à découvrir » ─────────────────────────────────────
test("aperçu : « Passionnés à découvrir » mène au profil, jamais à un message", async ({ page }) => {
  await boot(page, { preview: true });
  await remplirLeFil(page);

  const module = page.locator("#feedList .v2-people");
  await expect(module).toHaveCount(1);
  await expect(module.locator(".v2-people-title")).toHaveText("Passionnés à découvrir");

  const cartes = module.locator(".v2-people-card");
  const n = await cartes.count();
  expect(n, "au moins deux personnes, sinon le module ne s'affiche pas").toBeGreaterThanOrEqual(2);

  // Le contenu mène à la PERSONNE d'abord (annexe A17) : aucune carte n'ouvre
  // directement une conversation.
  const handlers = await module.locator(".v2-people-card").evaluateAll(
    (els) => els.map((e) => e.getAttribute("onclick") || ""));
  for (const h of handlers) {
    expect(h, "la carte ouvre un profil").toContain("openUserProfile");
    expect(h, "aucun raccourci message depuis le fil").not.toContain("openConv");
  }

  // Le module est APRÈS les premiers contenus, jamais en tête de fil.
  const positionOk = await page.evaluate(() => {
    const enfants = Array.from(document.getElementById("feedList").children);
    const i = enfants.findIndex((e) => e.classList.contains("v2-people"));
    return i > 0;
  });
  expect(positionOk, "le module n'est pas en tête du fil").toBe(true);

  // Il mène réellement au profil.
  await attendreElementStable(page, "#feedList .v2-people .v2-people-card");
  await cartes.first().click();
  await page.waitForTimeout(900);
  const ouvert = await page.evaluate(() => {
    const b = document.getElementById("modalBackdrop");
    const profil = document.getElementById("screen-profiles");
    return (b && b.classList.contains("active")) || (profil && profil.classList.contains("active"));
  });
  expect(ouvert, "un profil s'ouvre au tap").toBe(true);
});

// ── ⑥ État vide ─────────────────────────────────────────────────────────────
test("aperçu : le fil vide nomme la suite au lieu de constater l'absence", async ({ page }) => {
  await boot(page, { preview: true });
  // Aucune passion active : c'est l'écran le plus vu d'un nouveau compte.
  await page.evaluate(() => {
    _activeFeedPassions.forEach((p) => toggleProfileFilter(p));
    window._feedDomSig = null;
    renderFeed();
  });
  await page.waitForTimeout(500);

  const vide = page.locator("#feedEmpty");
  await expect(vide).toBeVisible();
  await expect(vide.locator(".empty-title")).toHaveText("Choisis une Passio pour commencer");
  await expect(vide.locator(".empty-text")).toContainText("bulle");
});

// ── L'URL normale garde ses textes historiques ─────────────────────────────
test("URL normale : les textes d'état vide historiques sont inchangés", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    _activeFeedPassions.forEach((p) => toggleProfileFilter(p));
    window._feedDomSig = null;
    renderFeed();
  });
  await page.waitForTimeout(500);

  const vide = page.locator("#feedEmpty");
  await expect(vide).toBeVisible();
  await expect(vide.locator(".empty-title")).toHaveText("Choisis une passion");
  await expect(vide.locator(".empty-text"))
    .toHaveText("Sélectionne une passion ci-dessus pour voir le contenu de ta communauté.");
});
