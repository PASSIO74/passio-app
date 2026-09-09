// Suite « Envie du moment » (rail à cinq intentions du Feed).
//
// ⚠️ CE QUE LE RAIL FAIT A CHANGÉ DEUX FOIS, ET LA SECONDE EST UN REVIREMENT.
//  ① À l'origine : une couche de RÉORDONNANCEMENT à choix unique. Elle gardait
//    le set complet autorisé par les passions et les suivis, et n'en changeait
//    que l'ORDRE.
//  ② ADR-011 §1 en a fait une TROISIÈME SOURCE en OU inclusif : une envie cochée
//    faisait ENTRER du contenu, au même titre qu'une passion ou que « Suivis ».
//  ③ 2026-09-09 — DÉFAIT (amendement d'ADR-011 §1). Mesuré en production : une
//    envie cochée ouvrait le fil à TOUT PASSIO. Une publication « Musculation »
//    d'un autre compte s'affichait chez quelqu'un qui n'a pas cette passion et
//    n'avait même pas « Suivis » coché — son seul tort était de partager le mood
//    « learn ». Une envie est désormais un FILTRE (ET) sur l'union
//    passions ∪ suivis : elle ne peut que RETRANCHER, jamais apporter.
//
// Ce qui ne change pas, et que cette suite continue de garantir : le legacy
// reste strictement intact sous kill switch, et la télémétrie n'émet jamais
// d'identifiant ni de texte libre.
//
// UI-2 n'a plus d'activation propre : il suit UI-1 + UI-2, actives par défaut
// depuis validation du 2026-08-26. Les valeurs positives héritées restent
// inertes ; seules les coupures explicites peuvent retirer la V2.
const { test, expect } = require("@playwright/test");
const { bootOnboarded, sansDonneesDistantes } = require("./app-helper");

const PREVIEW = "?passio_preview=passio-ui-v2";

const POSTS = [
  { id: "intent_create", authorId: "author_a", authorName: "A", passion: "musique", mood: "creation", type: "text", text: "Créer", createdAt: 1000, likes: 0, comments: [] },
  { id: "intent_learn", authorId: "author_b", authorName: "B", passion: "musique", mood: "learn", type: "text", text: "Apprendre", createdAt: 3000, likes: 0, comments: [] },
  { id: "intent_generic", authorId: "author_c", authorName: "C", passion: "musique", mood: "chill", type: "text", text: "Générique", createdAt: 2000, likes: 0, comments: [] },
  { id: "intent_meet", authorId: "author_d", authorName: "D", passion: "musique", mood: "irl", type: "text", text: "Rencontrer", createdAt: 4000, likes: 0, comments: [] },
];

// Le paramètre d'aperçu est conservé pour compatibilité avec les anciens liens.
async function boot(page, { preview = false } = {}) {
  await bootOnboarded(page, null, 1, preview ? { query: PREVIEW } : {});
}

async function setFlags(page, intents, bridge = false) {
  await page.evaluate(([on, bridgeOn]) => {
    // Le rail ne s'allume plus par `localStorage` : on ne fait ici qu'ôter (ou
    // poser) la COUPURE dédiée. `on = true` retire simplement le kill switch.
    if (on) localStorage.removeItem("passio_feed_intents_v1");
    else localStorage.setItem("passio_feed_intents_v1", "0");
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
    // QUATRIÈME tableau : `window._feedExtraPosts` est fait pour SURVIVRE aux
    // écrasements de `supabasePosts` (il protège un post arrivé pendant qu'une
    // requête était en vol). Le vider n'est donc pas une redondance : sans cela,
    // une publication RÉELLE de production ramenée par un rafraîchissement
    // asynchrone se réinvite dans le fil APRÈS le semis, et le test mesure autre
    // chose que son fixture. Défaut mesuré le 2026-09-02 sur `main` (run 2409).
    window._feedExtraPosts = [];
    state.user.following = [];
    state.user.profiles = [{ id: "qa", name: "QA", passion: "musique" }];
    _activeFeedPassions = new Set(["musique"]);
    // ⚠️ ADR-011 : « Suivis » est un critère persisté, plus une vue.
    // `state.user.following` est vide ici, donc le cocher n'apporte aucune
    // source : le périmètre observé est exactement celui d'avant.
    state.feedFollowingOn = true;
    state.feedIntents = [];
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

test.describe("Fil — Envie du moment (UI-2 active par défaut)", () => {
  test("l'URL normale active le rail sans rien rendre persistant", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("passio_feed_intents_v1"));
    await boot(page);

    await expect(page.locator("#feedIntentSelector")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#moodSelector")).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("passio_feed_intents_v1"))).toBeNull();
    // Aucune garde n'écrit : le drapeau du shell reste vierge lui aussi.
    expect(await page.evaluate(() => localStorage.getItem("passio_ui_v2"))).toBeNull();

    await page.evaluate(() => {
      localStorage.setItem("passio_feed_intents_v1", "0");
      window._feedDomSig = null;
      renderFeed();
    });
    await expect(page.locator("#moodSelector")).toBeVisible();
    await expect(page.locator("#feedIntentSelector")).toBeHidden();

    await page.evaluate(() => localStorage.removeItem("passio_feed_intents_v1"));
    // ⚠️ ISOLATION DES DONNÉES DISTANTES — POSÉE ICI PARCE QUE CETTE SUITE
    // NAVIGUE ELLE-MÊME. `bootOnboarded` la pose par défaut, mais sa portée est
    // L'APPEL, pas le fichier : un `page.goto` maison garde son chemin exposé, et
    // le verdict du test dépend alors du CONTENU DE LA PRODUCTION. C'est ce qui a
    // rendu `main` rouge six fois en quatre jours et fait sauter autant de
    // déploiements. Verrou mécanique : `scripts/audit-tests-isolation.js`.
    await sansDonneesDistantes(page);
    await page.goto("/index.html");
    await expect(page.locator("#moodSelector")).toBeHidden({ timeout: 20000 });
    await expect(page.locator("#feedIntentSelector")).toBeVisible();
  });

  // ── Valeurs héritées : inertes, sans contredire le défaut actif ────────────
  test("URL normale : un passio_feed_intents_v1 « 1 » hérité est sans effet", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("passio_feed_intents_v1", "1"));
    await boot(page);

    await expect(page.locator("#moodSelector")).toBeHidden();
    await expect(page.locator("#feedIntentSelector")).toBeVisible();
    expect(await page.evaluate(() => feedIntentsEnabled())).toBe(true);
    // Ignorée, pas réécrite : la garde ne touche pas au navigateur.
    expect(await page.evaluate(() => localStorage.getItem("passio_feed_intents_v1"))).toBe("1");
  });

  test("URL normale : window.PASSIO_FEED_INTENTS_V1 = true reste sans effet", async ({ page }) => {
    await page.addInitScript(() => { window.PASSIO_FEED_INTENTS_V1 = true; });
    await boot(page);

    await expect(page.locator("#moodSelector")).toBeHidden();
    await expect(page.locator("#feedIntentSelector")).toBeVisible();
    expect(await page.evaluate(() => feedIntentsEnabled())).toBe(true);
  });

  test("URL normale : window.PASSIO_UI_V2 = true ne change pas le défaut actif", async ({ page }) => {
    await page.addInitScript(() => { window.PASSIO_UI_V2 = true; });
    await boot(page);

    await expect(page.locator("#appNavV2")).toBeVisible();
    await expect(page.locator("#appNav")).toBeHidden();
    await expect(page.locator("#moodSelector")).toBeHidden();
    await expect(page.locator("#feedIntentSelector")).toBeVisible();
    expect(await page.evaluate(() => window.PassioUIV2.isEnabled())).toBe(true);
    expect(await page.evaluate(() => feedIntentsEnabled())).toBe(true);
  });

  test("URL normale : un passio_ui_v2 « 1 » hérité reste sans effet", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("passio_ui_v2", "1"));
    await boot(page);

    await expect(page.locator("#moodSelector")).toBeHidden();
    await expect(page.locator("#feedIntentSelector")).toBeVisible();
    expect(await page.evaluate(() => feedIntentsEnabled())).toBe(true);
  });

  test("l'ancien paramètre feed-intents-v1 ne crée aucun mode séparé", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: "?passio_preview=feed-intents-v1" });

    await expect(page.locator("#moodSelector")).toBeHidden();
    await expect(page.locator("#feedIntentSelector")).toBeVisible();
    await expect(page.locator("#appNavV2")).toBeVisible();
    expect(await page.evaluate(() => feedIntentsEnabled())).toBe(true);
  });

  test("le kill switch du shell coupe aussi le rail", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#feedIntentSelector")).toBeVisible();

    expect(await page.evaluate(() => {
      window.PASSIO_UI_V2 = false;
      return feedIntentsEnabled();
    })).toBe(false);

    await page.evaluate(() => {
      delete window.PASSIO_UI_V2;
      localStorage.setItem("passio_ui_v2", "0");
    });
    expect(await page.evaluate(() => feedIntentsEnabled())).toBe(false);
    await page.evaluate(() => localStorage.removeItem("passio_ui_v2"));
  });

  test("kill switch du rail : ancien sélecteur visible et ancien filtre mood inchangé", async ({ page }) => {
    await boot(page);
    await seedFeed(page, false);

    await expect(page.locator("#moodSelector")).toBeVisible();
    await expect(page.locator("#feedIntentSelector")).toBeHidden();
    expect(await renderedIds(page)).toEqual(["intent_create"]);
    const legacyHandler = await page.locator("#feedList .post .post-body").getAttribute("onclick");
    expect(legacyHandler).toContain("openPost(");
    expect(legacyHandler).not.toContain("openFeedPost(");
  });

  test("ON : quatre intentions accessibles, aucune cochée, aucun hard filter", async ({ page }) => {
    await boot(page, { preview: true });
    await seedFeed(page, true);

    await expect(page.locator("#moodSelector")).toBeHidden();
    await expect(page.locator("#feedIntentSelector")).toBeVisible();
    // ⚠️ QUATRE depuis le 2026-08-31 : la pastille « Tous » a été retirée sur
    // demande de Benjamin. En multisélection elle faisait double emploi — ne
    // rien cocher DIT « tous ». Le neutre `for_you` existe toujours DANS le
    // moteur, il n'a simplement plus de bouton, ce que la ligne suivante vérifie.
    await expect(page.locator(".feed-intent-btn")).toHaveCount(4);
    await expect(page.locator('.feed-intent-btn[data-intent="for_you"]')).toHaveCount(0);
    expect(await page.evaluate(() => activeFeedIntent)).toBe("for_you");
    expect(await page.evaluate(() => feedIntentsSelected())).toEqual([]);
    // Et AUCUNE n'est cochée au départ : le neutre ne doit pas élargir le fil.
    expect(await page.locator(".feed-intent-btn[aria-pressed='true']").count()).toBe(0);

    // Les quatre libellés, dans l'ordre.
    expect(await page.locator(".feed-intent-btn").allTextContents())
      .toEqual(["Explorer", "Apprendre", "Idées", "Rencontrer"]);

    const ids = await renderedIds(page);
    expect(ids.slice().sort()).toEqual(POSTS.map((p) => p.id).sort());
  });

  test("le neutre garde tout le set, et une envie RETRANCHE — jamais n'ajoute", async ({ page }) => {
    // ⚠️ REVIREMENT DU 2026-09-09. Ce cas exigeait « ensemble complet pour chaque
    // envie » : c'était la conséquence directe de l'union (une envie ne pouvait
    // qu'ajouter à une passion déjà cochée). Depuis que l'envie FILTRE, elle
    // retranche — et c'est très exactement ce qu'on veut prouver ici, sur un lot
    // dont les quatre publications portent la même passion cochée et QUATRE moods
    // différents. Aucune envie cochée = le neutre = tout.
    await boot(page, { preview: true });
    await seedFeed(page, true);

    const tout = POSTS.map((p) => p.id).sort();

    // Le NEUTRE laisse passer l'union entière.
    await page.evaluate(() => { setFeedIntents([]); window._feedDomSig = null; renderFeed(); });
    expect((await renderedIds(page)).slice().sort(), "aucune envie cochée = tout").toEqual(tout);

    // Chaque envie de MOOD ne garde que ce qui la satisfait.
    const attendu = { learn: ["intent_learn"], create: ["intent_create"], meet: ["intent_meet"] };
    for (const intent of ["learn", "create", "meet"]) {
      await page.evaluate((i) => { setFeedIntents([]); setFeedIntent(i); }, intent);
      expect((await renderedIds(page)).slice().sort(), `« ${intent} » ne garde que son mood`)
        .toEqual(attendu[intent]);
    }

    // Deux envies s'additionnent ENTRE ELLES (au moins une satisfaite), sans
    // jamais dépasser l'union de départ.
    await page.evaluate(() => { setFeedIntents([]); setFeedIntent("learn"); setFeedIntent("create"); });
    expect((await renderedIds(page)).slice().sort()).toEqual(["intent_create", "intent_learn"]);

    // « Explorer » n'est pas un mood : elle garde ce qui vient d'ailleurs que de
    // mes abonnements (ici : personne n'est suivi, donc tout le lot).
    await page.evaluate(() => { setFeedIntents([]); setFeedIntent("discover"); });
    expect((await renderedIds(page)).slice().sort()).toEqual(tout);
  });

  test("une envie SEULE n'amène RIEN — c'est un filtre, pas une source", async ({ page }) => {
    // ⚠️ CE CAS EST L'EXACT INVERSE DE CE QU'IL EXIGEAIT AVANT, et c'est le
    // défaut rapporté par Benjamin le 2026-09-09 : « son post apparaît alors que
    // je n'ai pas sélectionné la passion en question ». Son compte avait
    // « Suivis » DÉCOCHÉ et `feedIntents = ["learn"]` ; la publication d'un autre
    // compte entrait par la seule envie. Sans source, il n'y a pas de fil.
    await boot(page, { preview: true });
    await seedFeed(page, true);

    await page.evaluate(() => {
      setFeedPassions([]);                 // aucune passion
      state.feedFollowingOn = false;       // aucun compte suivi coché
      setFeedIntents([]);
      window._feedDomSig = null;
      renderFeed();
    });
    expect(await renderedIds(page), "aucun critère : aucune carte").toEqual([]);

    await page.evaluate(() => setFeedIntent("learn"));
    expect(await renderedIds(page), "« Apprendre » seule n'ouvre aucune source")
      .toEqual([]);

    await page.evaluate(() => setFeedIntent("create"));
    expect(await renderedIds(page), "deux envies n'en ouvrent pas davantage").toEqual([]);
    expect(await page.evaluate(() => feedIntentsSelected().sort()))
      .toEqual(["create", "learn"]);

    // L'écran vide dit la bonne chose : aucune SOURCE choisie, pas « aucune envie ».
    expect(await page.evaluate(() => {
      const t = document.querySelector("#feedEmpty .empty-title");
      return t ? t.textContent : "";
    })).toBe("Choisis tes passions");

    // Et cocher une SOURCE la rouvre immédiatement.
    await page.evaluate(() => { setFeedPassions(["musique"]); window._feedDomSig = null; renderFeed(); });
    expect((await renderedIds(page)).slice().sort())
      .toEqual(["intent_create", "intent_learn"]);
  });

  test("retaper l'intention active revient immédiatement au neutre", async ({ page }) => {
    await boot(page, { preview: true });
    await seedFeed(page, true);

    await page.locator('.feed-intent-btn[data-intent="create"]').click();
    await expect(page.locator('.feed-intent-btn[data-intent="create"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('.feed-intent-btn[data-intent="create"]').click();
    // ⚠️ Le retour au neutre ne se LIT plus sur un bouton « Tous » : il se lit à
    // ce qu'AUCUNE pastille n'est cochée. C'est la même garantie, sur la seule
    // surface qui subsiste.
    await expect(page.locator('.feed-intent-btn[data-intent="create"]')).toHaveAttribute("aria-pressed", "false");
    expect(await page.locator(".feed-intent-btn[aria-pressed='true']").count()).toBe(0);
    expect(await page.evaluate(() => activeFeedIntent)).toBe("for_you");
    expect(await page.evaluate(() => feedIntentsSelected())).toEqual([]);
  });

  test("le retour au neutre est enregistré comme un retour, pas une sélection", async ({ page }) => {
    await boot(page, { preview: true });
    await seedFeed(page, true);
    await page.locator('.feed-intent-btn[data-intent="learn"]').click();
    // Le neutre se pose en DÉCOCHANT la dernière envie — le bouton « Tous » qui
    // servait à ça n'existe plus, mais l'événement de télémétrie, lui, ne change pas.
    await page.locator('.feed-intent-btn[data-intent="learn"]').click();

    const last = await page.evaluate(() => window.__intentTel.filter((e) =>
      e.name.indexOf("feed_intent_") === 0).pop());
    expect(last).toEqual({
      name: "feed_intent_reset",
      meta: { v: "v1", flag: "on", intent: "for_you" },
    });
  });

  test("mapping legacy exact : creation/learn/irl seulement, le reste générique", async ({ page }) => {
    await boot(page);
    const mapping = await page.evaluate(() => [
      "creation", "learn", "irl", "actu", "chill", "all", undefined,
    ].map(legacyMoodToFeedIntent));
    expect(mapping).toEqual(["create", "learn", "meet", "generic", "generic", "generic", "generic"]);
  });

  test("Créer remonte le contenu correspondant sans perdre ni ajouter de post", async ({ page }) => {
    await boot(page, { preview: true });
    await seedFeed(page, true);
    const ids = await page.evaluate((posts) =>
      rankFeedPostsForIntent(posts, "create").map((p) => p.id), POSTS);
    expect(ids[0]).toBe("intent_create");
    expect(ids.slice().sort()).toEqual(POSTS.map((p) => p.id).sort());
  });

  test("Découvrir sans signal fiable restitue exactement le classement Tous", async ({ page }) => {
    await boot(page, { preview: true });
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
    await boot(page, { preview: true });
    await seedFeed(page, true);

    await page.locator('.feed-intent-btn[data-intent="create"]').click();
    // ⚠️ ON FERME L'AIDE CONTEXTUELLE AVANT DE CLIQUER, DEPUIS LE 2026-09-09, et
    // pour une raison de MISE EN PAGE : « Idées » ne laisse plus qu'UNE carte à
    // l'écran (l'envie FILTRE l'union, elle ne l'élargit plus), et la bulle
    // « feed_auteur » se pose exactement dessus. On la ferme par le MÉCANISME
    // PRODUIT — le bouton « Compris » — comme le ferait l'utilisateur ; un
    // `click({force:true})` ne ferait qu'envoyer le clic À LA BULLE, et le cas
    // rougirait sur un événement manquant sans dire pourquoi (mesuré).
    await page.evaluate(() => {
      state.hintsVus = state.hintsVus || {};
      state.hintsVus.feed_auteur = true;
      const ok = document.querySelector(".passio-hint .passio-hint-ok");
      if (ok) ok.click();
      else if (typeof fermerHint === "function") fermerHint();
    });
    await expect(page.locator(".passio-hint")).toHaveCount(0);
    await page.locator('#feedList .post[data-postid="intent_create"] .post-body').click();
    await page.evaluate(() => setFeedIntent("create")); // active → reset Tous (for_you)

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

  // Deux contrats se rencontrent sur l'intention « Rencontrer ». Ils sont
  // prouvés SÉPARÉMENT plutôt qu'arbitrés l'un contre l'autre :
  //   ① la télémétrie `feed_intent_meet_irl` du rail est portée par le CTA
  //      HISTORIQUE — elle se mesure donc UI-3A coupée, sinon le CTA est masqué
  //      et l'absence d'événement passerait pour une régression de télémétrie ;
  //   ② le chemin NOMINAL (UI-3A active par défaut) doit présenter « Trouver une
  //      expérience » sans rien engager à la place de l'utilisateur.
  test("Rencontrer sous kill switch UI-3A → CTA IRL existant, sans activer une proposition", async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem("passio_ui_3", "0"); });
    await boot(page, { preview: true });
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

  test("Rencontrer, UI-3A active : « Trouver une activité », sans proposition automatique", async ({ page }) => {
    await boot(page);
    await seedFeed(page, true, true);
    // Le module doit être LÀ. Un module absent est un défaut de livraison, pas
    // une raison d'ignorer ce test : on l'affirme au lieu de le contourner.
    expect(await page.evaluate(() => !!window.PassioUIV3)).toBe(true);

    await page.locator('.feed-intent-btn[data-intent="meet"]').click();
    const carte = page.locator('#feedList .post[data-postid="intent_meet"]');

    // Le vocabulaire validé est présent et réellement atteignable…
    await expect(carte.getByText("Trouver une activité", { exact: true }).first()).toBeVisible();

    // …et le CTA historique reste dans le DOM, seulement masqué : aucun doublon
    // à l'écran, et les kill switches le restituent sans repeindre le fil.
    const historique = carte.locator(".feed-irl-cta");
    await expect(historique).toHaveCount(1);
    await expect(historique).toBeHidden();

    // Rien n'est engagé à la place de l'utilisateur : ni événement, ni RSVP, ni
    // proposition activée.
    expect(await page.evaluate(() => (state.userEvents || []).length)).toBe(0);
    expect(await page.evaluate(() => (state.user.joinedEvents || []).length)).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem("passio_irl_proposal_v1"))).not.toBe("1");
  });

  test("kill switch à 0 : retour immédiat au rail et au filtre historiques", async ({ page }) => {
    await boot(page, { preview: true });
    await seedFeed(page, true);
    await page.locator('.feed-intent-btn[data-intent="learn"]').click();
    // ⚠️ UN SEUL POST DEPUIS LE 2026-09-09 : l'envie FILTRE l'union des sources
    // (elle en amenait une quatrième, en OU inclusif, jusqu'à l'amendement
    // d'ADR-011 §1). Ce que ce cas éprouve reste le KILL SWITCH, pas ce nombre.
    expect(await renderedIds(page)).toEqual(["intent_learn"]);

    await page.evaluate(() => {
      localStorage.setItem("passio_feed_intents_v1", "0");
      window._feedDomSig = null;
      renderFeed();
    });
    await expect(page.locator("#moodSelector")).toBeVisible();
    await expect(page.locator("#feedIntentSelector")).toBeHidden();
    expect(await page.evaluate(() => activeFeedIntent)).toBe("for_you");
    expect(await renderedIds(page)).toEqual(["intent_create"]);
  });

  test("la signature DOM varie avec l'intention active", async ({ page }) => {
    await boot(page, { preview: true });
    await seedFeed(page, true);
    const before = await page.evaluate(() => window._feedDomSig);
    await page.locator('.feed-intent-btn[data-intent="learn"]').click();
    const after = await page.evaluate(() => window._feedDomSig);
    expect(after).not.toBe(before);
    expect(after).toContain("intents1:learn");
  });

  // UI-2 §2 : sur écran étroit le rail DÉFILE, il ne tronque pas. L'assertion
  // « aucun débordement du rail » d'avant UI-2 est remplacée par les deux
  // propriétés qui comptent réellement : aucun libellé coupé, et la PAGE qui ne
  // déborde jamais horizontalement (c'était l'objet du test d'origine).
  test("360/375/390/430 px : aucun libellé tronqué, page sans débordement", async ({ page }) => {
    await boot(page, { preview: true });
    await seedFeed(page, true);

    for (const width of [360, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const geo = await page.evaluate(() => {
        const rail = document.getElementById("feedIntentSelector");
        const buttons = Array.from(rail.querySelectorAll(".feed-intent-btn"));
        return {
          tronques: buttons.filter((b) => b.scrollWidth > Math.ceil(b.clientWidth) + 1)
            .map((b) => b.textContent),
          minHeight: Math.min.apply(null, buttons.map((b) => b.getBoundingClientRect().height)),
          docScroll: document.documentElement.scrollWidth,
          docClient: document.documentElement.clientWidth,
        };
      });
      expect(geo.tronques, `libellés tronqués en ${width} px`).toEqual([]);
      // La PAGE ne déborde jamais : c'était l'objet du test d'origine, et le
      // débordement éventuel du rail est désormais absorbé par son propre
      // défilement (cf. test suivant) au lieu d'être coupé.
      expect(geo.docScroll, `page débordante en ${width} px`).toBeLessThanOrEqual(geo.docClient);
      expect(geo.minHeight).toBeGreaterThanOrEqual(43.9);
    }
  });

  // ⚠️ RÉÉCRIT AU LOT UI-7. Le test d'origine exigeait que la bande DÉFILE
  // horizontalement (`overflow-x: auto`, `flex-shrink: 0`) : c'était la réponse
  // d'UI-2 à « Rencontrer » tronqué à 360 px. Le §3 de l'ordre du 2026-08-28
  // demande l'inverse et le rend possible — les libellés raccourcis
  // (Explorer, Idées) tiennent à cinq sans geste de défilement. L'exigence de
  // fond, elle, ne bouge pas : AUCUN libellé coupé. Elle est donc conservée,
  // et c'est le moyen qui change. Sous kill switch, la bande défilante d'UI-2
  // revient telle quelle — ce que la seconde moitié du test vérifie.
  test("le rail tient sans défilement horizontal, et le kill switch rend la bande défilante", async ({ page }) => {
    await boot(page, { preview: true });
    await seedFeed(page, true);
    await page.setViewportSize({ width: 360, height: 844 });

    const style = await page.evaluate(() => {
      const rail = document.getElementById("feedIntentSelector");
      const btn = rail.querySelector('.feed-intent-btn[data-intent="meet"]');
      return {
        railOverflowX: getComputedStyle(rail).overflowX,
        deborde: rail.scrollWidth > rail.clientWidth + 1,
        tronque: btn.scrollWidth > Math.ceil(btn.clientWidth) + 1,
        tousTronques: [...rail.querySelectorAll(".feed-intent-btn")]
          .filter((b) => b.scrollWidth > Math.ceil(b.clientWidth) + 1).map((b) => b.textContent),
      };
    });
    expect(style.railOverflowX).toBe("hidden");
    expect(style.deborde, "la bande ne déborde plus").toBe(false);
    expect(style.tronque).toBe(false);
    expect(style.tousTronques, "libellés coupés").toEqual([]);

    // Kill switch du lot UI-7 : la bande défilante d'UI-2 est rendue à
    // l'identique, sans rechargement.
    const apres = await page.evaluate(() => {
      localStorage.setItem("passio_ui_7", "0");
      PassioUIV7.apply();
      const rail = document.getElementById("feedIntentSelector");
      const btn = rail.querySelector('.feed-intent-btn[data-intent="meet"]');
      const cs = getComputedStyle(btn);
      return {
        railOverflowX: getComputedStyle(rail).overflowX,
        flexShrink: cs.flexShrink,
        textOverflow: cs.textOverflow,
      };
    });
    expect(apres.railOverflowX).toBe("auto");
    expect(apres.flexShrink).toBe("0");
    expect(apres.textOverflow).toBe("clip");
  });
});
