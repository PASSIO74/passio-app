// Suite « Envie du moment » (feed_intents_v1, issue #68).
//
// Le nouveau rail est une couche de réordonnancement : il doit conserver le set
// complet des posts déjà autorisés par les passions/suivis, laisser le legacy
// strictement intact quand le flag est OFF et ne jamais émettre d'identifiant ni
// de texte libre dans sa télémétrie.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const POSTS = [
  { id: "intent_create", authorId: "author_a", authorName: "A", passion: "musique", mood: "creation", type: "text", text: "Créer", createdAt: 1000, likes: 0, comments: [] },
  { id: "intent_learn", authorId: "author_b", authorName: "B", passion: "musique", mood: "learn", type: "text", text: "Apprendre", createdAt: 3000, likes: 0, comments: [] },
  { id: "intent_generic", authorId: "author_c", authorName: "C", passion: "musique", mood: "chill", type: "text", text: "Générique", createdAt: 2000, likes: 0, comments: [] },
  { id: "intent_meet", authorId: "author_d", authorName: "D", passion: "musique", mood: "irl", type: "text", text: "Rencontrer", createdAt: 4000, likes: 0, comments: [] },
];

async function setFlags(page, intents, bridge = false) {
  await page.evaluate(([on, bridgeOn]) => {
    localStorage.setItem("passio_feed_intents_v1", on ? "1" : "0");
    localStorage.setItem("passio_feed_irl_bridge_v1", bridgeOn ? "1" : "0");
    delete window.PASSIO_FEED_INTENTS_V1;
    delete window.PASSIO_FEED_IRL_BRIDGE_V1;
  }, [intents, bridge]);
}

async function seedFeed(page, intents, bridge = false) {
  await setFlags(page, intents, bridge);
  await page.evaluate((posts) => {
    window.__intentTel = [];
    window.tel = window.tel || {};
    window.tel.action = function(name, meta) { window.__intentTel.push({ name, meta }); };
    state.userPosts = posts;
    state.seed.posts = [];
    state.supabasePosts = [];
    state.user.following = [];
    state.user.profiles = [{ id: "qa", name: "QA", passion: "musique" }];
    _activeFeedPassions = new Set(["musique"]);
    _showFollowingFeed = false;
    selectedMoods = new Set(["creation"]);
    activeFeedIntent = "for_you";
    window._feedIrlBridgeViewed = {};
    window._feedDomSig = null;
    renderFeed();
  }, POSTS);
}

function renderedIds(page) {
  return page.locator("#feedList .post").evaluateAll((els) => els.map((el) => el.dataset.postid));
}

test.describe("Fil — Envie du moment (feed_intents_v1)", () => {
  test("le lien canari active l'aperçu sans rendre le flag persistant", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => localStorage.removeItem("passio_feed_intents_v1"));

    await page.goto("/index.html?passio_preview=feed-intents-v1");
    await expect(page.locator("#feedIntentSelector")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#moodSelector")).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("passio_feed_intents_v1"))).toBeNull();

    await page.goto("/index.html");
    await expect(page.locator("#moodSelector")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#feedIntentSelector")).toBeHidden();
  });

  test("OFF par défaut : ancien rail visible et ancien filtre mood inchangé", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, false);

    await expect(page.locator("#moodSelector")).toBeVisible();
    await expect(page.locator("#feedIntentSelector")).toBeHidden();
    expect(await renderedIds(page)).toEqual(["intent_create"]);
    const legacyHandler = await page.locator("#feedList .post .post-body").getAttribute("onclick");
    expect(legacyHandler).toContain("openPost(");
    expect(legacyHandler).not.toContain("openFeedPost(");
  });

  test("ON : cinq intentions accessibles, Pour toi actif et aucun hard filter", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, true);

    await expect(page.locator("#moodSelector")).toBeHidden();
    await expect(page.locator("#feedIntentSelector")).toBeVisible();
    await expect(page.locator(".feed-intent-btn")).toHaveCount(5);
    await expect(page.locator('.feed-intent-btn[data-intent="for_you"]')).toHaveAttribute("aria-pressed", "true");

    const ids = await renderedIds(page);
    expect(ids.slice().sort()).toEqual(POSTS.map((p) => p.id).sort());
  });

  test("retaper l'intention active revient immédiatement à Pour toi", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, true);

    await page.locator('.feed-intent-btn[data-intent="create"]').click();
    await expect(page.locator('.feed-intent-btn[data-intent="create"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('.feed-intent-btn[data-intent="create"]').click();
    await expect(page.locator('.feed-intent-btn[data-intent="for_you"]')).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => activeFeedIntent)).toBe("for_you");
  });

  test("le bouton Pour toi est aussi enregistré comme un retour, pas une sélection", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, true);
    await page.locator('.feed-intent-btn[data-intent="learn"]').click();
    await page.locator('.feed-intent-btn[data-intent="for_you"]').click();

    const last = await page.evaluate(() => window.__intentTel.filter((e) =>
      e.name.indexOf("feed_intent_") === 0).pop());
    expect(last).toEqual({
      name: "feed_intent_reset",
      meta: { v: "v1", flag: "on", intent: "for_you" },
    });
  });

  test("mapping legacy exact : creation/learn/irl seulement, le reste générique", async ({ page }) => {
    await bootOnboarded(page);
    const mapping = await page.evaluate(() => [
      "creation", "learn", "irl", "actu", "chill", "all", undefined,
    ].map(legacyMoodToFeedIntent));
    expect(mapping).toEqual(["create", "learn", "meet", "generic", "generic", "generic", "generic"]);
  });

  test("Créer remonte le contenu correspondant sans perdre ni ajouter de post", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, true);
    const ids = await page.evaluate((posts) =>
      rankFeedPostsForIntent(posts, "create").map((p) => p.id), POSTS);
    expect(ids[0]).toBe("intent_create");
    expect(ids.slice().sort()).toEqual(POSTS.map((p) => p.id).sort());
  });

  test("Découvrir sans signal fiable restitue exactement le classement Pour toi", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, true);
    const result = await page.evaluate((posts) => {
      state.user.profiles = [];
      state.user.following = [];
      const base = rankFeedPosts(posts).map((p) => p.id);
      const discover = rankFeedPostsForIntent(posts, "discover").map((p) => p.id);
      return { base, discover };
    }, POSTS);
    expect(result.discover).toEqual(result.base);
  });

  test("télémétrie sélection/reset/clic contenu : seulement version, flag et intention", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, true);

    await page.locator('.feed-intent-btn[data-intent="create"]').click();
    await page.locator('#feedList .post[data-postid="intent_create"] .post-body').click();
    await page.evaluate(() => setFeedIntent("create")); // active → reset Pour toi

    const events = await page.evaluate(() => window.__intentTel.filter((e) => e.name.indexOf("feed_intent_") === 0));
    expect(events.map((e) => e.name)).toEqual([
      "feed_intent_selected", "feed_intent_content_click", "feed_intent_reset",
    ]);
    for (const event of events) {
      expect(Object.keys(event.meta).sort()).toEqual(["flag", "intent", "v"]);
      expect(event.meta.v).toBe("v1");
      expect(event.meta.flag).toBe("on");
      expect(JSON.stringify(event.meta)).not.toContain("intent_create");
      expect(JSON.stringify(event.meta)).not.toContain("Créer");
    }
  });

  test("Rencontrer → CTA IRL existant, sans activer une proposition", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, true, true);
    await page.locator('.feed-intent-btn[data-intent="meet"]').click();

    await page.locator('#feedList .post[data-postid="intent_meet"] .feed-irl-cta').click();
    await expect(page.locator("#modalBackdrop.active #evPassion")).toBeVisible();
    const meetEvents = await page.evaluate(() =>
      window.__intentTel.filter((e) => e.name === "feed_intent_meet_irl"));
    expect(meetEvents).toHaveLength(1);
    expect(meetEvents[0].meta).toEqual({ v: "v1", flag: "on", intent: "meet" });
    expect(await page.evaluate(() => localStorage.getItem("passio_irl_proposal_v1"))).not.toBe("1");
  });

  test("kill switch à 0 : retour immédiat au rail et au filtre historiques", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, true);
    await page.locator('.feed-intent-btn[data-intent="learn"]').click();
    expect(await renderedIds(page)).toHaveLength(POSTS.length);

    await page.evaluate(() => {
      localStorage.setItem("passio_feed_intents_v1", "0");
      renderFeed();
    });
    await expect(page.locator("#moodSelector")).toBeVisible();
    await expect(page.locator("#feedIntentSelector")).toBeHidden();
    expect(await page.evaluate(() => activeFeedIntent)).toBe("for_you");
    expect(await renderedIds(page)).toEqual(["intent_create"]);
  });

  test("la signature DOM varie avec l'intention active", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, true);
    const before = await page.evaluate(() => window._feedDomSig);
    await page.locator('.feed-intent-btn[data-intent="learn"]').click();
    const after = await page.evaluate(() => window._feedDomSig);
    expect(after).not.toBe(before);
    expect(after).toContain("intents1:learn");
  });

  test("360/375/390/430 px : rail sans débordement et cibles tactiles de 44 px", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, true);

    for (const width of [360, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const geo = await page.evaluate(() => {
        const rail = document.getElementById("feedIntentSelector");
        const buttons = Array.from(rail.querySelectorAll(".feed-intent-btn"));
        return {
          railScroll: rail.scrollWidth,
          railClient: rail.clientWidth,
          minHeight: Math.min.apply(null, buttons.map((b) => b.getBoundingClientRect().height)),
          docScroll: document.documentElement.scrollWidth,
          docClient: document.documentElement.clientWidth,
        };
      });
      expect(geo.railScroll).toBeLessThanOrEqual(geo.railClient);
      expect(geo.docScroll).toBeLessThanOrEqual(geo.docClient);
      expect(geo.minHeight).toBeGreaterThanOrEqual(43.9);
    }
  });
});
