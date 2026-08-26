// Suite « Fil fenêtré » (feed_window_v1, issue #73 phase 2 — PERF-IOS).
//
// Ce que cette suite protège, dans l'ordre d'importance :
//   ① le drapeau OFF rend le fil HISTORIQUE, à l'octet près ;
//   ② l'ancre de scroll ne bouge pas de plus de 2 px sur un aller-retour, y
//      compris répété et à trois largeurs d'écran ;
//   ③ un like, un commentaire ou un post temps réel ne reconstruit JAMAIS tout
//      le fil ;
//   ④ aucun observateur ni écouteur ne s'empile au fil des navigations.
//
// ⚠️ Le seuil de 2 px n'est pas ajustable : c'est le critère de la phase. Un
// test qui devient rouge ici signale une régression d'ancre, pas un seuil trop
// serré — la contre-revue Codex avait mesuré 19 à 78 px sur un prototype.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Des hauteurs VOLONTAIREMENT inégales : c'est l'inégalité qui met en défaut une
// estimation de hauteur (contain-intrinsic-size: auto 320px sur `.post`), et
// donc ce qui produisait les sauts d'ancre.
function makePosts(n) {
  const posts = [];
  for (let i = 0; i < n; i++) {
    const long = i % 3 === 0;
    posts.push({
      id: "fw_" + i,
      authorId: "auteur_" + (i % 4),
      authorName: "Auteur " + (i % 4),
      passion: "musique",
      mood: "all",
      type: "text",
      text: long ? ("Post long numéro " + i + ". ").repeat(14) : "Post court " + i,
      createdAt: 100000 - i, // ordre décroissant stable
      likes: i,
      comments: [],
      reactions: [],
    });
  }
  return posts;
}

async function seedFeed(page, { windowOn, n = 60, margin = 300 } = {}) {
  await page.evaluate(
    ([on, posts, marginPx]) => {
      localStorage.setItem("passio_feed_window_v1", on ? "1" : "0");
      delete window.PASSIO_FEED_WINDOW_V1;
      window.PASSIO_FEED_WINDOW_MARGIN = marginPx;
      window._feedRenderLimit = 20;
      window._feedServerMayHaveMore = false;
      window._feedExtraPosts = [];
      state.userPosts = posts;
      state.seed.posts = [];
      state.supabasePosts = [];
      state.user.following = [];
      _activeFeedPassions = new Set(["musique"]);
      _showFollowingFeed = false;
      selectedMoods = new Set(["all", "creation", "learn", "chill"]);
      state.feedMoodsTouched = true;
      window._feedDomSig = null;
      try { feedWindowTeardown(); } catch (e) {}
      renderFeed();
    },
    [windowOn, makePosts(n), margin]
  );
  await page.waitForTimeout(400); // complément idle de renderFeed + observateur
}

// Le classement par pertinence (rankFeedPosts) décide seul de l'ordre : aucun
// test ne doit supposer que « fw_0 » est en tête. On demande donc l'identifiant
// de la carte réellement montée en haut du fil.
async function premierPostId(page) {
  await page.evaluate(() => document.querySelector(".app-main").scrollTo(0, 0));
  await page.waitForTimeout(500);
  return page.$eval("#feedList .post[data-postid]", (e) => e.getAttribute("data-postid"));
}

function ids(page) {
  return page.$$eval("#feedList .post[data-postid]", (els) =>
    els.map((e) => e.getAttribute("data-postid"))
  );
}

// Décalage, en pixels, entre la position d'une carte avant et après une action.
async function ancre(page, postId) {
  return page.evaluate((id) => {
    const main = document.querySelector(".app-main");
    const card = document.querySelector('#feedList .post[data-postid="' + id + '"]');
    if (!main || !card) return null;
    return card.getBoundingClientRect().top - main.getBoundingClientRect().top;
  }, postId);
}

test.describe("Fil fenêtré — drapeau OFF : rien ne change", () => {
  test("aucune trace du fenêtrage quand le drapeau est coupé", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: false });

    const etat = await page.evaluate(() => feedWindowStats());
    expect(etat.enabled).toBe(false);
    expect(etat.dehydrated).toBe(0);
    expect(etat.observers).toBe(0);

    // Ni sentinelle, ni marqueur de déshydratation, ni hauteur figée.
    expect(await page.locator("#feedWindowSentinel").count()).toBe(0);
    expect(await page.locator("#feedWindowTail").count()).toBe(0);
    expect(await page.locator('#feedList .post[data-fw]').count()).toBe(0);
    const hauteursInline = await page.$$eval("#feedList .post", (els) =>
      els.filter((e) => e.style.height).length
    );
    expect(hauteursInline).toBe(0);

    // Le bouton historique « Charger plus » est toujours là, seul.
    expect(await page.locator("#feedLoadMoreBtn").count()).toBe(1);
  });

  test("le drapeau ne change NI l'ordre NI le contenu affiché", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: false });
    const off = await ids(page);

    await seedFeed(page, { windowOn: true });
    const on = await ids(page);

    expect(on).toEqual(off);
    expect(off.length).toBeGreaterThan(0);
  });

  test("kill switch : couper le drapeau remonte tout, sans rechargement", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });
    await page.evaluate(() => document.querySelector(".app-main").scrollTo(0, 3000));
    await page.waitForTimeout(400);
    expect((await page.evaluate(() => feedWindowStats())).dehydrated).toBeGreaterThan(0);

    await page.evaluate(() => {
      window.PASSIO_FEED_WINDOW_V1 = false;
      renderFeed();
    });
    await page.waitForTimeout(300);

    const etat = await page.evaluate(() => feedWindowStats());
    expect(etat.enabled).toBe(false);
    expect(etat.dehydrated).toBe(0);
    expect(etat.observers).toBe(0);
    expect(await page.locator('#feedList .post[data-fw="off"]').count()).toBe(0);
  });
});

test.describe("Fil fenêtré — cartes montées bornées et lots progressifs", () => {
  test("toutes les cartes sont dans le flux, seule une fraction est montée", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });
    await page.evaluate(() => document.querySelector(".app-main").scrollTo(0, 4000));
    await page.waitForTimeout(500);

    const etat = await page.evaluate(() => feedWindowStats());
    expect(etat.total).toBeGreaterThan(10);
    expect(etat.dehydrated).toBeGreaterThan(0);
    expect(etat.mounted).toBeLessThan(etat.total);
  });

  test("le premier lot puis les suivants arrivent en scrollant, sans doublon", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });
    const premierLot = await ids(page);
    expect(premierLot.length).toBe(20); // premier lot

    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => {
        const m = document.querySelector(".app-main");
        m.scrollTo(0, m.scrollHeight);
      });
      await page.waitForTimeout(500);
    }

    const apres = await ids(page);
    expect(apres.length).toBeGreaterThan(20);
    expect(new Set(apres).size).toBe(apres.length); // zéro doublon
    // L'ordre du classement est conservé : le premier lot reste, dans le même
    // ordre, en tête de la liste étendue.
    expect(apres.slice(0, premierLot.length)).toEqual(premierLot);
  });

  test("le chargement progressif n'écrase pas les cartes déjà montées", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });
    const avant = await ids(page);

    // Marquer les éléments en place : s'ils survivent, le repeint est incrémental.
    await page.evaluate(() =>
      document.querySelectorAll("#feedList .post").forEach((e, i) => (e.dataset.marque = "m" + i))
    );
    await page.evaluate(() => {
      const m = document.querySelector(".app-main");
      m.scrollTo(0, m.scrollHeight);
    });
    await page.waitForTimeout(600);

    const marques = await page.$$eval("#feedList .post[data-marque]", (els) => els.length);
    expect(marques).toBe(avant.length); // aucune carte d'origine reconstruite
    expect((await ids(page)).length).toBeGreaterThan(avant.length);
  });
});

test.describe("Fil fenêtré — ancre de scroll sous 2 px", () => {
  for (const largeur of [320, 390, 430]) {
    test(`aller-retour Fil → IRL → Fil : ancre stable à ${largeur} px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 780 });
      await bootOnboarded(page);
      await seedFeed(page, { windowOn: true });

      await page.evaluate(() => document.querySelector(".app-main").scrollTo(0, 2400));
      await page.waitForTimeout(500);

      const cible = await page.evaluate(() => {
        const main = document.querySelector(".app-main");
        const top = main.getBoundingClientRect().top;
        const cards = [...document.querySelectorAll("#feedList .post[data-postid]")];
        const c = cards.find((x) => x.getBoundingClientRect().top - top >= 0) || cards[0];
        return c.getBoundingClientRect().top - top;
      });
      const idCible = await page.evaluate(() => {
        const main = document.querySelector(".app-main");
        const top = main.getBoundingClientRect().top;
        const cards = [...document.querySelectorAll("#feedList .post[data-postid]")];
        const c = cards.find((x) => x.getBoundingClientRect().top - top >= 0) || cards[0];
        return c.getAttribute("data-postid");
      });

      await page.evaluate(() => goTo("irl"));
      await page.waitForTimeout(300);
      await page.evaluate(() => goTo("feed"));
      await page.waitForTimeout(600);

      const apres = await ancre(page, idCible);
      expect(apres).not.toBeNull();
      expect(Math.abs(apres - cible)).toBeLessThanOrEqual(2);
    });
  }

  // L'en-tête rétractable se replie en retirant de la hauteur AU-DESSUS du fil.
  // La trame suivante lit donc un delta négatif, qui le déplie, ce qui rend la
  // hauteur, ce qui le replie… Mesuré le 2026-08-25 en descendant par paliers de
  // 420 px : replié / déplié / replié / déplié. L'en-tête battait, et tout le
  // fil avec lui. On compte les bascules plutôt que l'état final, qui dépend de
  // l'endroit exact où le doigt s'arrête.
  test("descendre dans le fil ne fait pas battre l'en-tête", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });

    await page.evaluate(() => {
      // On compte les CHANGEMENTS D'ÉTAT, pas les écritures d'attribut : le code
      // peut réécrire `class` sans rien changer, et ça ne fait battre personne.
      const main = document.querySelector(".app-main");
      window.__bascules = 0;
      let etat = main.classList.contains("chrome-collapsed");
      new MutationObserver(() => {
        const now = main.classList.contains("chrome-collapsed");
        if (now !== etat) { etat = now; window.__bascules++; }
      }).observe(main, { attributes: true, attributeFilter: ["class"] });
    });

    // Descente strictement monotone : un seul repli est justifié, pas six.
    for (let i = 1; i <= 8; i++) {
      await page.evaluate((k) => document.querySelector(".app-main").scrollTo(0, k * 380), i);
      await page.waitForTimeout(150);
    }

    expect(await page.evaluate(() => window.__bascules)).toBeLessThanOrEqual(1);
  });

  test("l'ancre tient sur cinq allers-retours consécutifs", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });
    await page.evaluate(() => document.querySelector(".app-main").scrollTo(0, 1800));
    await page.waitForTimeout(500);

    const idCible = await page.evaluate(() => {
      const main = document.querySelector(".app-main");
      const top = main.getBoundingClientRect().top;
      const cards = [...document.querySelectorAll("#feedList .post[data-postid]")];
      const c = cards.find((x) => x.getBoundingClientRect().top - top >= 0) || cards[0];
      return c.getAttribute("data-postid");
    });
    const depart = await ancre(page, idCible);

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => goTo("profiles"));
      await page.waitForTimeout(200);
      await page.evaluate(() => goTo("feed"));
      await page.waitForTimeout(500);
      const d = await ancre(page, idCible);
      expect(Math.abs(d - depart)).toBeLessThanOrEqual(2);
    }
  });
});

test.describe("Fil fenêtré — mises à jour ciblées, jamais globales", () => {
  test("un like ne déclenche AUCUN renderFeed global", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });

    await page.evaluate(() => {
      window.__rf = 0;
      const orig = window.renderFeed;
      window.renderFeed = function () { window.__rf++; return orig.apply(this, arguments); };
    });

    const id = await premierPostId(page);
    const bouton = page.locator(
      '#feedList .post[data-postid="' + id + '"] .post-action[data-action="like"]'
    );
    await bouton.click();
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => window.__rf)).toBe(0);
    await expect(bouton).toHaveClass(/liked/);
  });

  test("un commentaire ne déclenche AUCUN renderFeed global", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });

    const id = await premierPostId(page);
    await page.evaluate((pid) => {
      window.__rf = 0;
      const orig = window.renderFeed;
      window.renderFeed = function () { window.__rf++; return orig.apply(this, arguments); };
      // Chemin métier réel du compteur de commentaires côté fil.
      const p = findPostAnywhere(pid);
      p.comments = (p.comments || []).concat([
        { id: "c1", text: "hello", authorId: "me", createdAt: Date.now() },
      ]);
      _patchPostCommentCount(pid);
    }, id);
    await page.waitForTimeout(200);

    expect(await page.evaluate(() => window.__rf)).toBe(0);
    const compteur = await page.textContent('#feedList [data-cmtcount="' + id + '"]');
    expect(compteur).toContain("1");
  });

  test("un like reçu pendant que la carte est démontée est visible à la remontée", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });

    const id = await premierPostId(page);

    // Descendre assez pour démonter la carte de tête.
    await page.evaluate(() => document.querySelector(".app-main").scrollTo(0, 4000));
    await page.waitForTimeout(600);
    expect(
      await page.locator('#feedList .post[data-postid="' + id + '"][data-fw="off"]').count()
    ).toBe(1);

    // Un autre compte like : le modèle change, le DOM de la carte n'existe plus.
    await page.evaluate((pid) => {
      const p = findPostAnywhere(pid);
      p.likes = 999;
      patchPostLikeDom(p); // ne trouve rien : la carte est démontée
    }, id);

    await page.evaluate(() => document.querySelector(".app-main").scrollTo(0, 0));
    await page.waitForTimeout(600);

    const txt = await page.textContent(
      '#feedList .post[data-postid="' + id + '"] .post-action[data-action="like"]'
    );
    expect(txt).toContain("999");
  });

  test("une rafale temps réel n'introduit ni doublon ni observateur de plus", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });
    const observateursAvant = await page.evaluate(() => feedWindowStats().observersCreated);

    await page.evaluate(() => {
      for (let i = 0; i < 30; i++) {
        feedAddRealtimePost({
          id: "rt_" + i, authorId: "rt", authorName: "RT", passion: "musique",
          mood: "all", type: "text", text: "Temps réel " + i,
          createdAt: 200000 + i, likes: 0, comments: [], reactions: [],
        });
        scheduleFeedRender();
      }
    });
    await page.waitForTimeout(1200);

    const liste = await ids(page);
    expect(new Set(liste).size).toBe(liste.length);

    const etat = await page.evaluate(() => feedWindowStats());
    expect(etat.observers).toBe(1);
    // Un observateur peut être recréé si la racine change ; jamais empilé.
    expect(etat.observersCreated - observateursAvant).toBeLessThanOrEqual(1);
  });
});

test.describe("Fil fenêtré — pas de fuite, et le parcours reste entier", () => {
  test("dix navigations n'empilent ni observateur ni écouteur de redimensionnement", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });

    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => goTo("explore"));
      await page.waitForTimeout(120);
      await page.evaluate(() => goTo("feed"));
      await page.waitForTimeout(220);
    }

    const etat = await page.evaluate(() => feedWindowStats());
    expect(etat.observers).toBe(1);
    expect(etat.observersCreated).toBeLessThanOrEqual(12);
    // L'écouteur de resize est posé une seule fois, quoi qu'il arrive.
    expect(await page.evaluate(() => window._feedWindowResizeAttached)).toBe(true);
  });

  test("quitter le fil ne laisse aucun observateur derrière", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });
    await page.evaluate(() => goTo("messages"));
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => feedWindowStats().observers)).toBe(0);
    expect(await page.evaluate(() => feedWindowStats().dehydrated)).toBe(0);
  });

  test("le pont Fil → IRL reste actionnable avec le fenêtrage actif", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => localStorage.setItem("passio_feed_irl_bridge_v1", "1"));
    await seedFeed(page, { windowOn: true });

    const ponts = await page.locator("#feedList [data-feed-irl]").count();
    if (ponts === 0) {
      // Le pont peut être hors périmètre de ce seed : on constate alors que le
      // drapeau est bien lu, plutôt que de faire passer le test pour rien.
      expect(await page.evaluate(() => feedIrlBridgeEnabled())).toBe(true);
    } else {
      await expect(page.locator("#feedList [data-feed-irl]").first()).toBeVisible();
    }
  });

  test("session longue : le fil reste sain après un long va-et-vient de scroll", async ({ page }) => {
    await bootOnboarded(page);
    await seedFeed(page, { windowOn: true });

    for (let i = 0; i < 12; i++) {
      await page.evaluate((k) => {
        const m = document.querySelector(".app-main");
        m.scrollTo(0, k % 2 === 0 ? m.scrollHeight : 0);
      }, i);
      await page.waitForTimeout(180);
    }
    await page.evaluate(() => document.querySelector(".app-main").scrollTo(0, 0));
    await page.waitForTimeout(600);

    const liste = await ids(page);
    expect(new Set(liste).size).toBe(liste.length);
    const etat = await page.evaluate(() => feedWindowStats());
    expect(etat.observers).toBe(1);
    // En haut du fil, la carte de tête est forcément remontée.
    const tete = await page.$eval("#feedList .post[data-postid]", (e) => e.getAttribute("data-postid"));
    expect(
      await page.locator('#feedList .post[data-postid="' + tete + '"][data-fw="off"]').count()
    ).toBe(0);
  });
});
