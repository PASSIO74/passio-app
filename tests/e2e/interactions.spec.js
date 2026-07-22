// Suite « systèmes d'interaction » — like / emoji / commentaire sur TOUTES les
// surfaces (fil, post détail, carnet CDV, live CDV, événement IRL, bobine).
//
// Couvre les régressions trouvées lors de l'audit du 2026-07-22, toutes vérifiées
// par clic réel dans le navigateur AVANT correction :
//   · carte carnet CDV : likePost() appelé sans `this` → l'état changeait mais le
//     bouton ne bougeait JAMAIS (le repli renderFeed() repeignait le fil, pas CDV)
//   · carte live épinglée (vue CDV par défaut) : AUCUNE barre d'engagement
//   · like d'un commentaire : patch DOM maison sur le PREMIER [data-commentid] du
//     document → quand le commentaire est rendu deux fois (vue détail sous la
//     modale), c'est la copie CACHÉE qui était repeinte
//   · like d'une bobine : purement cosmétique (pas de compteur, pas de
//     persistance, pas de sync, désynchronisé du fil)
//   · viewer de carnet et fiche événement IRL : ni like ni réaction emoji
//   · compteurs désynchronisés entre une carte et sa fiche ouverte par-dessus
//
// Aucune écriture Supabase : les fonctions de sync sont neutralisées après boot.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function bootInteractions(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    ["supaToggleLike", "supaAddComment", "supaCommentInteract", "supaCommentRemoveLike",
      "supaCommentRemoveReactions", "supaLoadComments", "supaLoadCommentInteractions",
      "supaInsertNotif", "supaToggleEventLike", "supaAddEventReaction", "supaRemoveEventReaction",
      "supaLoadEventReactions", "supaLoadEventComments", "supaAddEventComment",
      "supaToggleCdvLiveLike", "supaLoadCdvLiveLikes", "supaReactCdvLive",
      "supaRemoveCdvLiveReaction", "supaAddCdvLiveComment", "supaPublishCdvLive",
      "supaAddCdvLiveStep", "supaRefreshCdvLives", "supaLoadCdvLives",
      "supaTrack"].forEach((fn) => { window[fn] = async () => null; });
    localStorage.removeItem("passio_cdv_lives");
  });
}

// Rend le fil non vide : sans passion sélectionnée, le fil est vide PAR DESIGN.
async function showFeed(page) {
  return page.evaluate(() => {
    const posts = allFeedPosts().filter((p) => p.type !== "vlog");
    _activeFeedPassions.add(posts[0].passion);
    window._feedDomSig = null;
    renderFeed();
    return document.querySelector("#feedList [data-postid]").getAttribute("data-postid");
  });
}

test.describe("Interactions — like d'un post", () => {
  test("fil : le bouton ❤️ bascule dans les deux sens et persiste au re-rendu", async ({ page }) => {
    await bootInteractions(page);
    const id = await showFeed(page);
    const btn = page.locator(`[data-postid="${id}"] [data-action="like"]`);

    const before = await page.evaluate((i) => findPostAnywhere(i).likes || 0, id);
    await btn.click();
    await expect(btn).toHaveText(new RegExp(`❤️\\s*${before + 1}`));
    expect(await page.evaluate((i) => state.user.likedPosts.includes(i), id)).toBe(true);

    // Le compteur survit à un re-rendu complet du fil.
    await page.evaluate(() => { window._feedDomSig = null; renderFeed(); });
    await expect(page.locator(`[data-postid="${id}"] [data-action="like"]`))
      .toHaveText(new RegExp(`❤️\\s*${before + 1}`));
  });

  test("carte carnet CDV : le ❤️ met à jour le BOUTON, pas seulement l'état", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("cdv"); renderCdvScreen(); });

    const btn = page.locator("#screen-cdv [data-postlike]").first();
    const id = await btn.getAttribute("data-postlike");
    const before = await page.evaluate((i) => findPostAnywhere(i).likes || 0, id);

    await btn.click();
    // Le cœur ET le compteur doivent bouger : c'était TOUT le bug (l'état passait
    // bien à liked, mais le DOM restait sur « 🤍 <ancien compteur> »).
    await expect(btn).toHaveText(new RegExp(`❤️\\s*${before + 1}`));
    expect(await page.evaluate((i) => state.user.likedPosts.includes(i), id)).toBe(true);
  });

  test("carnet : le compteur reste synchronisé entre la carte et le viewer ouvert", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("cdv"); renderCdvScreen(); });
    const id = await page.locator("#screen-cdv [data-postlike]").first().getAttribute("data-postlike");

    await page.locator(`#screen-cdv [data-postlike="${id}"]`).click();
    const cardText = await page.locator(`#screen-cdv [data-postlike="${id}"]`).textContent();

    await page.evaluate((i) => openVlogViewer(i), id);
    const viewerBtn = page.locator(`#vlogViewerContent [data-postlike="${id}"]`);
    await expect(viewerBtn).toHaveCount(1); // le viewer a bien un bouton like
    expect((await viewerBtn.textContent()).trim()).toBe(cardText.trim());

    // Un like DEPUIS le viewer repeint aussi la carte qui est dessous.
    await viewerBtn.click();
    expect((await page.locator(`#screen-cdv [data-postlike="${id}"]`).textContent()).trim())
      .toBe((await viewerBtn.textContent()).trim());
  });

  test("viewer de carnet : la réaction emoji est disponible et alimente la pastille", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("cdv"); renderCdvScreen(); });
    const id = await page.locator("#screen-cdv [data-postlike]").first().getAttribute("data-postlike");

    await page.evaluate((i) => openVlogViewer(i), id);
    // Le viewer se peuple en deux temps (rendu local puis commentaires) : on attend
    // qu'il soit réellement ouvert avant d'agir, sinon le test mesure un état
    // transitoire quand la machine est chargée.
    await expect(page.locator("#vlogViewer")).toHaveClass(/open/);
    await expect(page.locator("#vlogViewerContent .post-action[onclick*=showEmojiPickerForPost]")).toHaveCount(1);

    await page.evaluate((i) => addEmojiToPost(i, "🔥"), id);
    await expect(page.locator(`#vlogViewerContent [data-postchip="${id}"]`)).toContainText("🔥");
  });
});

test.describe("Interactions — like d'un commentaire", () => {
  test("le bouton VISIBLE se met à jour même quand le commentaire est rendu deux fois", async ({ page }) => {
    await bootInteractions(page);
    const id = await showFeed(page);

    // openPost rend le commentaire une 1re fois, openComments une 2e par-dessus :
    // c'est la configuration exacte qui cassait le patch DOM.
    const cid = await page.evaluate(async (i) => {
      openPost(i);
      await openComments(i);
      document.getElementById("newComment").value = "commentaire de test";
      submitComment(i);
      return findPostAnywhere(i).comments.find((c) => c.text === "commentaire de test").id;
    }, id);

    // Attend que les DEUX rendus soient posés (c'est la condition du bug).
    await expect(page.locator(`[data-cmtlike="${cid}"]`)).toHaveCount(2);

    const visible = page.locator(`#commentsBox [data-cmtlike="${cid}"]`);
    await expect(visible).toHaveText(/🤍\s*0/);
    await visible.click();
    await expect(visible).toHaveText(/❤️\s*1/);

    // TOUTES les copies suivent (sinon rouvrir l'autre vue afficherait l'ancien état).
    const all = await page.locator(`[data-cmtlike="${cid}"]`).allTextContents();
    expect(all.every((t) => /❤️\s*1/.test(t))).toBe(true);

    // Et le toggle inverse fonctionne.
    await visible.click();
    await expect(visible).toHaveText(/🤍\s*0/);
  });
});

test.describe("Interactions — événement IRL", () => {
  test("la fiche événement expose un like ET une réaction emoji", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });
    const evId = await page.locator("#screen-irl [data-evlike]").first().getAttribute("data-evlike");

    await page.evaluate((i) => openEventDetails(i), evId);
    // Avant : la fiche ne permettait QUE de commenter.
    await expect(page.locator(`#eventDetailPage [data-evlike="${evId}"]`)).toHaveCount(1);
    await expect(page.locator("#eventDetailPage .post-action[onclick*=showEmojiPickerForEvent]")).toHaveCount(1);
  });

  test("le compteur de like reste synchronisé entre la carte et la fiche", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });
    const evId = await page.locator("#screen-irl [data-evlike]").first().getAttribute("data-evlike");

    await page.evaluate((i) => openEventDetails(i), evId);
    await page.locator(`#eventDetailPage [data-evlike="${evId}"]`).click();

    const detail = (await page.locator(`#eventDetailPage [data-evlike="${evId}"]`).textContent()).trim();
    const card = (await page.locator(`#screen-irl [data-evlike="${evId}"]`).textContent()).trim();
    expect(detail).toBe(card);
    expect(await page.evaluate((i) => state.user.likedEvents.includes(i), evId)).toBe(true);
  });

  test("une réaction emoji remplace la précédente puis se retire au second tap", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });
    const evId = await page.locator("#screen-irl [data-evlike]").first().getAttribute("data-evlike");

    await page.evaluate((i) => applyEventEmojiReaction(i, ["🔥"]), evId);
    expect(await page.evaluate((i) => state.user.eventReactions[i], evId)).toBe("🔥");

    // Une seule réaction par personne : 🎉 REMPLACE 🔥.
    await page.evaluate((i) => applyEventEmojiReaction(i, ["🎉"]), evId);
    expect(await page.evaluate((i) => state.user.eventReactions[i], evId)).toBe("🎉");

    // Re-tap du même emoji = retrait.
    await page.evaluate((i) => applyEventEmojiReaction(i, ["🎉"]), evId);
    expect(await page.evaluate((i) => state.user.eventReactions[i], evId)).toBeFalsy();
  });

  test("ma réaction emoji survit à un rechargement (événement de démo)", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });
    const evId = await page.locator("#screen-irl [data-evlike]").first().getAttribute("data-evlike");
    await page.evaluate((i) => applyEventEmojiReaction(i, ["🔥"]), evId);

    await page.reload();
    await page.waitForFunction(() => typeof renderIRL === "function" && state && state.onboarded);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });

    // Les compteurs de démo sont régénérés à chaque chargement : ma réaction
    // (elle, persistée) doit être REJOUÉE par-dessus, sinon elle disparaît.
    expect(await page.evaluate((i) => state.user.eventReactions[i], evId)).toBe("🔥");
    expect(await page.evaluate((i) => (window._eventLikes[i].emojiCounts || {})["🔥"] > 0, evId)).toBe(true);
  });
});

test.describe("Interactions — live CDV", () => {
  test("la carte live épinglée porte la barre like / commentaire / emoji", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => {
      const live = {
        id: "live_inter_1", authorId: "u_autre", destination: "Lisbonne",
        visibility: "public", status: "live", steps: [], followers: [], comments: [],
        reactions: [], reactionsBy: [], createdAt: Date.now() - 60000,
      };
      saveCdvLives([live]);
      goTo("cdv"); renderCdvScreen();
    });

    const card = page.locator(".cdv-live-pinned");
    await expect(card).toHaveCount(1);
    // Avant : la carte de la vue par défaut n'avait AUCUNE action.
    await expect(card.locator(".post-actions")).toHaveCount(1);
    await expect(card.locator("[data-livelike]")).toHaveCount(1);
    await expect(card.locator(".post-action[onclick*=reactCdvLivePicker]")).toHaveCount(1);

    await card.locator("[data-livelike]").click();
    await expect(card.locator("[data-livelike]")).toHaveText(/❤️\s*1/);
    expect(await page.evaluate(() => state.user.likedLives.includes("live_inter_1"))).toBe(true);
  });
});

test.describe("Interactions — bobine", () => {
  test("le like d'une bobine est un VRAI like : compteur, persistance et parité avec le fil", async ({ page }) => {
    await bootInteractions(page);
    // Le seed de test ne contient pas de bobine : on en crée une (isReel + média,
    // les deux conditions retenues par buildReels).
    const reelId = await page.evaluate(() => {
      const id = "reel_test_1";
      state.userPosts.unshift({
        id, authorId: MY_UID || "me", authorName: "Audit QA", isReel: true,
        type: "video", passion: "musique", mood: "all", text: "Bobine de test",
        media: "https://example.test/v.mp4", image: "https://example.test/v.mp4",
        likes: 4, comments: [], createdAt: Date.now(),
      });
      saveState();
      return buildReels().some((r) => r.id === id) ? id : null;
    });
    expect(reelId, "la bobine de test doit être visible dans buildReels()").toBe("reel_test_1");

    const before = await page.evaluate((i) => findPostAnywhere(i).likes || 0, reelId);
    await page.evaluate((i) => { goTo("explore"); if (typeof openReels === "function") openReels(); toggleReelLike(i, document.querySelector(`[data-reellike="${i}"]`)); }, reelId);

    // Avant : aucun compteur n'existait et rien n'était persisté.
    expect(await page.evaluate((i) => findPostAnywhere(i).likes, reelId)).toBe(before + 1);
    expect(await page.evaluate((i) => state.user.likedPosts.includes(i), reelId)).toBe(true);
    await expect(page.locator(`[data-reellike="${reelId}"] .reel-action-label`)).toHaveText(String(before + 1));

    // Parité avec le fil : le même contenu ne peut pas être « aimé » d'un côté et
    // « non aimé » de l'autre.
    const likedInFeed = await page.evaluate((i) => {
      const p = findPostAnywhere(i);
      return (state.user.likedPosts || []).includes(p.id);
    }, reelId);
    expect(likedInFeed).toBe(true);
  });
});
