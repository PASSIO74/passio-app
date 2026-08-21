// Suite « pont Fil → IRL » (drapeau feed_irl_bridge_v1, Lot 1A.1).
//
// Le pont ajoute UN CTA discret sur une carte du fil, qui ouvre le formulaire IRL
// EXISTANT en pré-remplissant au plus deux données techniques (passion normalisée,
// identifiant du post source). Il ne crée aucun événement.
//
// Invariants vérifiés :
//   · drapeau OFF (défaut) → aucun CTA, carte strictement inchangée ;
//   · drapeau ON + post éligible → CTA visible et actionnable ;
//   · clic → formulaire IRL existant ouvert, passion + référence pré-remplies ;
//   · données absentes/invalides → formulaire standard, sans préremplissage,
//     sans message d'erreur pour l'utilisateur ;
//   · télémétrie bornée aux métadonnées autorisées (version, état du drapeau,
//     présence/absence de passion et de référence) — aucun texte libre ;
//   · 390×844 : le CTA ne déborde pas de la carte, pas de scroll horizontal.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Texte libre volontairement reconnaissable : il ne doit apparaître NI dans
// l'attribut onclick du CTA, NI dans l'URL, NI dans la télémétrie.
const FREE_TEXT = "Texte-libre-QA-ne-doit-jamais-fuiter";
const POST_ID = "post_bridge_qa";

// Installe un post de test dans le fil et un capteur de télémétrie, puis rend le
// fil. `passion` peut être une passion inconnue (cas « données invalides »).
async function seedFeed(page, passion) {
  await page.evaluate(([id, psn, txt]) => {
    window.__telCap = [];
    // On remplace tel.action : le pont l'appelle via `window.tel && tel.action`.
    window.tel = window.tel || {};
    window.tel.action = function (name, meta) { window.__telCap.push({ name: name, meta: meta }); };
    window.tel.error = function (err, ctx) { window.__telCap.push({ name: "__error", meta: ctx && ctx.meta }); };

    state.userPosts = [{
      id: id, authorId: "me", authorName: "Audit QA", passion: psn,
      type: "text", text: txt, createdAt: Date.now(), likes: 0, comments: [],
    }];
    state.seed.posts = [];
    state.supabasePosts = [];
    _activeFeedPassions = new Set([psn]);
    selectedMoods = new Set(["creation"]);
    window._feedIrlBridgeViewed = {};
    window._feedDomSig = null;
    // Les toasts du démarrage vivent 3 s : on repart d'une pile vide pour que
    // « aucune erreur montrée » porte bien sur le clic et sur rien d'autre.
    var stack = document.getElementById("toastStack");
    if (stack) stack.innerHTML = "";
    renderFeed();
  }, [POST_ID, passion, FREE_TEXT]);
}

async function setFlag(page, on) {
  await page.evaluate((v) => {
    if (v === null) localStorage.removeItem("passio_feed_irl_bridge_v1");
    else localStorage.setItem("passio_feed_irl_bridge_v1", v);
    delete window.PASSIO_FEED_IRL_BRIDGE_V1;
  }, on);
}

function sourcePostCta(page) {
  return page.locator(`#feedList .post[data-postid="${POST_ID}"] .feed-irl-cta`);
}

test.describe("Pont Fil → IRL (feed_irl_bridge_v1)", () => {
  test("drapeau OFF (défaut) : aucun CTA sur la carte", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, null); // aucune valeur = défaut du code
    await seedFeed(page, "musique");

    await expect(page.locator("#feedList .post")).toHaveCount(1);
    await expect(page.locator(".feed-irl-cta")).toHaveCount(0);
    // Le drapeau OFF ne doit produire AUCUN événement du pont.
    const events = await page.evaluate(() => window.__telCap.map((e) => e.name));
    expect(events.filter((n) => n.indexOf("feed_irl") === 0)).toEqual([]);
  });

  test("drapeau explicitement à 0 : le kill switch coupe le CTA sans rechargement", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    await seedFeed(page, "musique");
    await expect(sourcePostCta(page)).toHaveCount(1);

    await setFlag(page, "0");
    await page.evaluate(() => { window._feedDomSig = null; renderFeed(); });
    await expect(page.locator(".feed-irl-cta")).toHaveCount(0);
  });

  test("drapeau ON + post éligible : le CTA est visible et accessible", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    await seedFeed(page, "musique");

    const cta = sourcePostCta(page);
    await expect(cta).toHaveCount(1);
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("aria-label", /IRL/i);
    // Libellé explicite (pas une icône seule) et cible tactile ≥ 44 px.
    expect((await cta.innerText()).trim().length).toBeGreaterThan(6);
    const box = await cta.boundingBox();
    // Chromium peut arrondir 44 CSS px à 43.9999 selon le device scale factor.
    expect(box.height).toBeGreaterThanOrEqual(43.9);
    // Focus clavier atteignable.
    await cta.focus();
    expect(await page.evaluate(() => document.activeElement.className)).toContain("feed-irl-cta");
    // Aucun texte libre de l'utilisateur dans l'attribut inline.
    const onclick = await cta.getAttribute("onclick");
    expect(onclick).toContain(POST_ID);
    expect(onclick).not.toContain(FREE_TEXT);
  });

  test("clic : le parcours IRL existant s'ouvre avec passion et référence sûres", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    await seedFeed(page, "musique");

    await sourcePostCta(page).click();

    // Le formulaire IRL EXISTANT (openCreateEvent) est ouvert.
    await expect(page.locator("#modalBackdrop.active #evPassion")).toBeVisible();
    await expect(page.locator("#evTitle")).toHaveValue(""); // aucun texte libre pré-rempli
    await expect(page.locator("#evPassion")).toHaveValue("musique");

    // Référence technique du post source, posée par setAttribute (jamais en HTML).
    await expect(page.locator("#modalContent")).toHaveAttribute("data-feed-irl-source", POST_ID);
    expect(await page.evaluate(() => window._feedIrlBridgeSourcePostId)).toBe(POST_ID);

    // Aucun événement IRL n'est créé automatiquement.
    expect(await page.evaluate(() => (state.userEvents || []).length)).toBe(0);
    // Rien de libre dans l'URL.
    expect(page.url()).not.toContain(FREE_TEXT);
  });

  test("passion inconnue : formulaire IRL standard, sans préremplissage ni erreur", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    await seedFeed(page, "passion_inexistante_qa");

    await sourcePostCta(page).click();
    await expect(page.locator("#modalBackdrop.active #evPassion")).toBeVisible();

    // La passion inconnue n'est jamais injectée : le select garde son option par défaut.
    expect(await page.locator("#evPassion").inputValue()).not.toBe("passion_inexistante_qa");
    // Aucun toast d'erreur montré à l'utilisateur.
    await expect(page.locator("#toastStack .toast")).toHaveCount(0);

    const prefilled = await page.evaluate(() =>
      window.__telCap.filter((e) => e.name === "feed_irl_draft_prefilled").pop());
    expect(prefilled.meta.has_psn).toBe(false);
    expect(prefilled.meta.has_ref).toBe(true);
  });

  test("post source introuvable : parcours IRL standard, sans référence", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    await seedFeed(page, "musique");

    // Le post disparaît de l'état entre le rendu et le clic (cas réel : purge/refresh).
    await page.evaluate(() => { state.userPosts = []; });
    await sourcePostCta(page).click();

    await expect(page.locator("#modalBackdrop.active #evPassion")).toBeVisible();
    await expect(page.locator("#toastStack .toast")).toHaveCount(0);
    await expect(page.locator("#modalContent")).not.toHaveAttribute("data-feed-irl-source", POST_ID);

    const prefilled = await page.evaluate(() =>
      window.__telCap.filter((e) => e.name === "feed_irl_draft_prefilled").pop());
    expect(prefilled.meta.has_psn).toBe(false);
    expect(prefilled.meta.has_ref).toBe(false);
  });

  test("télémétrie : trois événements, bornés aux métadonnées autorisées", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    await seedFeed(page, "musique");
    await sourcePostCta(page).click();
    await expect(page.locator("#modalBackdrop.active #evPassion")).toBeVisible();

    const captured = await page.evaluate(() =>
      window.__telCap.filter((e) => String(e.name).indexOf("feed_irl") === 0));
    expect(captured.map((e) => e.name)).toEqual([
      "feed_irl_cta_view", "feed_irl_cta_click", "feed_irl_draft_prefilled",
    ]);

    const ALLOWED = ["v", "flag", "has_psn", "has_ref"];
    for (const ev of captured) {
      expect(Object.keys(ev.meta).sort()).toEqual(ALLOWED.slice().sort());
      expect(ev.meta.v).toBe("v1a1");
      expect(ev.meta.flag).toBe("on");
      expect(typeof ev.meta.has_psn).toBe("boolean");
      expect(typeof ev.meta.has_ref).toBe("boolean");
      // Ni texte libre, ni identifiant de post, ni identité.
      expect(JSON.stringify(ev.meta)).not.toContain(FREE_TEXT);
      expect(JSON.stringify(ev.meta)).not.toContain(POST_ID);
    }

    // Une vue par post et par session, même après un nouveau rendu du fil.
    await page.evaluate(() => { window._feedDomSig = null; renderFeed(); });
    const views = await page.evaluate(() =>
      window.__telCap.filter((e) => e.name === "feed_irl_cta_view").length);
    expect(views).toBe(1);
  });

  test("390×844 : le CTA ne déborde pas de la carte et n'ajoute pas de scroll horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootOnboarded(page);
    await setFlag(page, "1");
    await seedFeed(page, "musique");

    const cta = sourcePostCta(page);
    await expect(cta).toBeVisible();

    const geo = await page.evaluate(() => {
      const el = document.querySelector('#feedList .post[data-postid="post_bridge_qa"] .feed-irl-cta');
      const card = el.closest(".post");
      const list = document.getElementById("feedList");
      return {
        ctaRight: Math.round(el.getBoundingClientRect().right),
        cardRight: Math.round(card.getBoundingClientRect().right),
        listScroll: list.scrollWidth, listClient: list.clientWidth,
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
        inlineWidth: el.style.width,
      };
    });
    expect(geo.ctaRight).toBeLessThanOrEqual(geo.cardRight);
    expect(geo.listScroll).toBeLessThanOrEqual(geo.listClient);
    expect(geo.docScroll).toBeLessThanOrEqual(geo.docClient);
    expect(geo.inlineWidth).toBe(""); // aucune largeur fixe
  });
});
