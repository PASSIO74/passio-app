// Suite CDV (Carnets de Voyage) — carnets + lives.
// Couvre les régressions trouvées lors de l'audit du 2026-07-21 :
//   · compteur de suivis « undefined » (followers stocké en NOMBRE aléatoire)
//   · ❤️ du viewer de live qui s'empilait au lieu de basculer
//   · filtre « 🔴 Lives » ignoré dès qu'un autre filtre était coché
//   · recherche aveugle à la description / au pseudo / aux étapes d'un live
//   · brouillon de carnet perdu en quittant le Studio
//   · lien partagé #cdv-live-<id> qui n'ouvrait jamais le live
//   · état du composeur d'étape (photos/note/budget) collé à l'étape suivante
// Aucune écriture Supabase : les fonctions de sync sont neutralisées après boot.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function bootCdv(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    // Neutralise TOUTE la sync CDV : la suite doit rester locale.
    ["supaPublishCdvLive", "supaAddCdvLiveStep", "supaUpdateCdvLiveStep", "supaDeleteCdvLiveStep",
      "supaAddCdvLiveComment", "supaReactCdvLive", "supaRemoveCdvLiveReaction", "supaSetCdvLiveLike",
      "supaUpdateCdvLiveStatus", "supaUpdateCdvLive", "supaDeleteCdvLive",
      "supaFollowCdvLive", "supaUnfollowCdvLive", "supaRefreshCdvLives",
      "supaLoadCdvLive", "supaLoadCdvLives", "supaLoadCdvLiveLikes", "supaUpdateCdvLiveStepCoords",
      "supaAddCdvCollaborator", "supaRemoveCdvCollaborator", "supaUpdateVlogPost",
      "supaAddCarnetCollaborator", "supaRemoveCarnetCollaborator",
      "supaLoadCarnetCollaborators"].forEach((fn) => { window[fn] = async () => null; });
    // Géocodage : réseau interdit en test → réponse déterministe.
    window._geocodeAddress = async (q) => (/ursa|lisbonne|cascais|porto|sintra/i.test(q) ? { lat: 38.72, lng: -9.14 } : null);
    localStorage.removeItem("passio_cdv_lives");
    localStorage.removeItem("passio_vlog_draft_v1");
    localStorage.removeItem("passio_cdv_geo_v1");
    window._cdvGeoCacheObj = null;
  });
}

// Crée un live directement par l'API interne (le parcours modal est testé à part).
async function seedLive(page, over = {}) {
  return page.evaluate((o) => {
    const live = Object.assign({
      id: "live_test_1", authorId: (window.MY_UID || "me"), destination: "Lisbonne",
      description: "Road trip côtier", duration: "semaine", visibility: "public",
      status: "live", steps: [], followers: [], viewers: [], currentViewers: 0,
      reactions: [], reactionsBy: [], comments: [], createdAt: Date.now(),
    }, o);
    saveCdvLives([live]);
    goTo("cdv");
    renderCdvScreen();
    return live.id;
  }, over);
}

test.describe("CDV — carnets de voyage", () => {
  test("l'écran CDV s'ouvre sur son point d'entrée unique", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => goTo("cdv"));
    await expect(page.locator("#screen-cdv")).toHaveClass(/active/);
    await expect(page.getByRole("button", { name: /Nouveau voyage/ })).toBeVisible();
    // Content-first (2026-08-07) : « Mes lieux » et « Passeport » ne sont plus sur
    // l'écran mais dans le panneau d'outils contextuel (ContextualTools). Ils
    // restent accessibles — et chacun garde son état vide pédagogique.
    await expect(page.locator("#cdvToolsBtn")).toBeVisible();
    await page.evaluate(() => ContextualTools.open("cdv"));
    await expect(page.locator("#ctxToolsBody")).toContainText("Mes lieux");
    await expect(page.locator("#ctxToolsBody")).toContainText("Passeport");
    await page.evaluate(() => ContextualTools.close());
  });

  test("l'éditeur de carnet vit dans l'écran CDV, PAS dans le Studio", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => { goTo("cdv"); setStudioToVlog(); });
    await expect(page.locator("#cdvEditor")).toBeVisible({ timeout: 5000 });
    expect(await page.evaluate(() => studioType)).toBe("vlog");

    // On est bien resté sur l'écran CDV, la liste est masquée au profit de l'éditeur.
    await expect(page.locator("#screen-cdv")).toHaveClass(/active/);
    await expect(page.locator("#screen-studio")).not.toHaveClass(/active/);
    await expect(page.locator("#cdvBrowse")).toBeHidden();
    // Le formulaire de carnet est DANS l'écran CDV.
    expect(await page.evaluate(() => !!document.querySelector("#screen-cdv #studioVlog"))).toBe(true);
    expect(await page.evaluate(() => !!document.querySelector("#screen-studio #studioVlog"))).toBe(false);
    // Et le Studio n'a plus de bloc de création de CDV Live.
    expect(await page.evaluate(() => !!document.getElementById("studiocdvlive"))).toBe(false);

    // Retour : l'éditeur se referme et la liste revient.
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page.locator("#cdvEditor")).toBeHidden();
    await expect(page.locator("#cdvBrowse")).toBeVisible();
    expect(await page.evaluate(() => studioType)).not.toBe("vlog");
  });

  test("publier un carnet le crée et revient à la liste des voyages", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => { goTo("cdv"); setStudioToVlog(); });
    await page.fill("#vlogDestination", "Islande");
    await page.evaluate(() => {
      vlogState.steps = [{ id: uid(), place: "Reykjavik", text: "Bains chauds", tip: "", photo: null }];
      renderVlogSteps();
    });
    await page.getByRole("button", { name: /Publier mon carnet/ }).click();

    await expect.poll(
      () => page.evaluate(() => (state.userPosts || []).filter((p) => p.type === "vlog").length),
      { timeout: 15000 }
    ).toBe(1);
    const carnet = await page.evaluate(() => state.userPosts.find((p) => p.type === "vlog"));
    expect(carnet.destination).toBe("Islande");
    expect(carnet.steps[0].place).toBe("Reykjavik");

    // On atterrit sur la liste CDV, pas dans le fil ni dans le Studio.
    await expect(page.locator("#screen-cdv")).toHaveClass(/active/);
    await expect(page.locator("#cdvEditor")).toBeHidden();
    await expect(page.locator("#cdvBrowse")).toBeVisible();
  });

  test("le brouillon d'un carnet survit à la sortie du Studio", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => { goTo("cdv"); setStudioToVlog(); });
    await expect(page.locator("#cdvEditor")).toBeVisible({ timeout: 5000 });

    await page.fill("#vlogDestination", "Patagonie");
    await page.fill("#vlogTip", "Réserver les refuges 3 mois avant");
    await page.waitForTimeout(900); // debounce de l'autosave

    // On quitte le Studio (le scénario qui faisait tout perdre) puis on revient.
    await page.evaluate(() => goTo("feed"));
    await page.evaluate(() => { $("#vlogDestination").value = ""; $("#vlogTip").value = ""; });
    await page.evaluate(() => { goTo("studio"); activateStudioVlog(); });

    await expect(page.locator("#vlogDraftBanner")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Reprendre" }).click();
    await expect(page.locator("#vlogDestination")).toHaveValue("Patagonie");
    await expect(page.locator("#vlogTip")).toHaveValue("Réserver les refuges 3 mois avant");
  });
});

test.describe("CDV — lives", () => {
  test("un live créé affiche un compteur de suivis chiffré (jamais « undefined »)", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => goTo("cdv"));
    await page.getByRole("button", { name: /Nouveau voyage/ }).click();
    await page.getByText("Je pars maintenant").click();
    await page.fill("#cdvLiveDest", "Kyoto");
    await page.getByRole("button", { name: /Lancer le Live/ }).click();
    // La modale « ajouter une étape » s'ouvre automatiquement → on la ferme.
    await expect(page.locator("#liveStepCity")).toBeVisible({ timeout: 5000 });
    await page.evaluate(() => closeModal());

    const live = await page.evaluate(() => getCdvLives()[0]);
    expect(Array.isArray(live.followers), "followers doit être un TABLEAU d'ids").toBe(true);
    expect(live.followers).toHaveLength(0);
    expect(await page.evaluate(() => cdvLiveFollowerCount(getCdvLives()[0]))).toBe(0);

    await page.evaluate(() => { cdvFilters = new Set(["live"]); renderCdvScreen(); });
    const html = await page.locator("#cdvList").innerHTML();
    expect(html).not.toContain("undefined");
    expect(html).toContain("👁 0");
  });

  test("l'auteur peut publier, modifier puis supprimer une étape", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page);

    await page.evaluate((i) => openCdvLiveViewer(i), id);
    await page.evaluate((i) => { closeModal(); addCdvLiveStep(i); }, id);
    await page.fill("#liveStepCity", "Belém");
    await page.fill("#liveStepContent", "Pastéis chauds à 8h");
    await page.getByRole("button", { name: /Publier l'étape/ }).click();

    let steps = await page.evaluate(() => getCdvLives()[0].steps);
    expect(steps).toHaveLength(1);
    expect(steps[0].city).toBe("Belém");

    // Modification : le formulaire doit être PRÉ-REMPLI puis mis à jour.
    await page.evaluate((i) => addCdvLiveStep(i, getCdvLives()[0].steps[0].id), id);
    await expect(page.locator("#liveStepCity")).toHaveValue("Belém");
    await page.fill("#liveStepContent", "Pastéis chauds à 8h — file d'attente évitée");
    await page.getByRole("button", { name: /Enregistrer/ }).click();
    steps = await page.evaluate(() => getCdvLives()[0].steps);
    expect(steps).toHaveLength(1);
    expect(steps[0].content).toContain("file d'attente");
    expect(steps[0].editedAt).toBeTruthy();

    // Suppression (confirm natif accepté).
    page.on("dialog", (d) => d.accept());
    await page.evaluate((i) => deleteCdvLiveStep(i, getCdvLives()[0].steps[0].id), id);
    expect(await page.evaluate(() => getCdvLives()[0].steps)).toHaveLength(0);
  });

  test("le composeur d'étape ne garde pas la note/le budget de l'étape précédente", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page);

    await page.evaluate((i) => addCdvLiveStep(i), id);
    await page.fill("#liveStepCity", "Sintra");
    // Budget = montant en euros (nombre) depuis le 2026-08-03, plus de paliers €/€€/€€€.
    await page.fill("#liveStepBudget", "80");
    await page.evaluate(() => { setStepRating(5); });
    await page.evaluate(() => closeModal()); // abandon : rien ne doit fuiter

    await page.evaluate((i) => addCdvLiveStep(i), id);
    expect(await page.evaluate(() => _stepRating)).toBe(0);
    expect(await page.evaluate(() => _stepBudget)).toBe("");
    expect(await page.evaluate(() => _stepVideo)).toBeNull();
    expect(await page.evaluate(() => _liveStepPhotos.length)).toBe(0);
  });

  test("le ❤️ du viewer bascule (1 par compte) au lieu de s'empiler", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page);
    await page.evaluate((i) => openCdvLiveViewer(i), id);

    const btn = page.locator('#cdvReactBar [data-livelike]');
    await expect(btn).toBeVisible();
    await btn.click();
    expect(await page.evaluate(() => state.user.likedLives || [])).toContain(id);
    await expect(btn).toContainText("❤️ 1");
    await btn.click();
    expect(await page.evaluate(() => state.user.likedLives || [])).not.toContain(id);
    await expect(btn).toContainText("🤍 0");
    // Le like ne doit JAMAIS polluer les réactions emoji.
    expect(await page.evaluate(() => getCdvLives()[0].reactions || [])).toHaveLength(0);
  });

  test("une réaction emoji reste unique par personne (remplacement + toggle off)", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page);
    await page.evaluate((i) => { reactCdvLive(i, "🔥"); reactCdvLive(i, "😍"); }, id);
    let r = await page.evaluate(() => getCdvLives()[0].reactions);
    expect(r).toEqual(["😍"]);
    await page.evaluate((i) => reactCdvLive(i, "😍"), id);
    expect(await page.evaluate(() => getCdvLives()[0].reactions)).toHaveLength(0);
  });

  test("le filtre « Lives » reste actif combiné à « Mes carnets »", async ({ page }) => {
    await bootCdv(page);
    await seedLive(page);
    await page.evaluate(() => { cdvFilters = new Set(["live", "mine"]); renderCdvScreen(); });
    await expect(page.locator("#cdvList")).toContainText("Lisbonne");
    await expect(page.locator("#cdvList")).toContainText("EN DIRECT");
  });

  test("la recherche trouve un live par sa description et par le lieu d'une étape", async ({ page }) => {
    await bootCdv(page);
    await seedLive(page, { steps: [{ id: "s1", city: "Cascais", emoji: "📍", content: "", photos: [], createdAt: Date.now() }] });

    for (const q of ["côtier", "cascais"]) {
      await page.evaluate((term) => { $("#cdvSearchInput").value = term; renderCdvScreen(); }, q);
      await expect(page.locator("#cdvList"), `recherche « ${q} »`).toContainText("Lisbonne");
    }
  });

  test("un live « privé » n'est pas visible par les autres comptes", async ({ page }) => {
    await bootCdv(page);
    await seedLive(page, { authorId: "u_autre", visibility: "private" });
    expect(await page.evaluate(() => getActiveCdvLives().length)).toBe(0);
    // Même chose pour « abonnés » quand on ne suit pas l'auteur.
    await seedLive(page, { authorId: "u_autre", visibility: "followers" });
    expect(await page.evaluate(() => getActiveCdvLives().length)).toBe(0);
    await page.evaluate(() => { state.following = ["u_autre"]; });
    expect(await page.evaluate(() => getActiveCdvLives().length)).toBe(1);
  });

  test("un lien partagé #cdv-live-<id> ouvre le live", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page);
    await page.evaluate((i) => { location.hash = "#cdv-live-" + i; }, id);
    await expect(page.locator(`.modal[data-live-id="${id}"]`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".modal[data-live-id]")).toContainText("Lisbonne");
  });

  test("terminer un live demande confirmation puis enchaîne sur le carnet", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page, { steps: [{ id: "s1", city: "Porto", emoji: "📍", content: "Ribeira", photos: [], rating: 4, budget: "€€", createdAt: Date.now() }] });

    await page.evaluate((i) => confirmEndCdvLive(i), id);
    await expect(page.locator(".modal")).toContainText("Terminer ce carnet en direct ?");
    expect(await page.evaluate(() => getCdvLives()[0].status)).toBe("live"); // rien tant qu'on n'a pas confirmé

    await page.getByRole("button", { name: /Terminer et créer le carnet/ }).click();
    expect(await page.evaluate(() => getCdvLives()[0].status)).toBe("ended");
    // Atterrissage DIRECT dans l'éditeur de carnet pré-rempli (écran CDV).
    await expect(page.locator("#cdvEditor")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("#vlogDestination")).toHaveValue("Lisbonne", { timeout: 6000 });
    // La note ★ (dans le conseil) et le budget (dans son propre champ, item
    // 2026-08-03 : le budget d'étape a QUITTÉ le conseil pour un champ dédié) ne
    // sont pas perdus à la conversion.
    const steps = await page.evaluate(() => vlogState.steps.map((s) => ({ tip: s.tip, budget: s.budget })));
    expect(steps[0].budget).toContain("€€");
    expect(steps[0].tip).toContain("★");
  });

  // Commenter / partager / réagir CHAQUE journée une par une (2026-08-03).
  // Chaque étape (live) et chaque JOUR (carnet) a ses 3 actions, scopées au thread
  // « cdvstep:<liveId>:<stepId> » / « carnetstep:<postId>:<index> ». Les réactions
  // et commentaires vivent dans un store À PART (state.user.stepReactions /
  // .stepComments) pour survivre au refresh serveur du live (qui remplace steps).
  test("chaque étape d'un live a réagir · commenter · partager, indépendamment", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page, { steps: [
      { id: "s1", city: "Paris", emoji: "🗼", content: "Jour 1", createdAt: Date.now() },
      { id: "s2", city: "Lyon", emoji: "🍷", content: "Jour 2", createdAt: Date.now() },
    ] });
    await page.evaluate((i) => openCdvLiveViewer(i), id);

    // La barre CANONIQUE .post-actions (identique aux posts/événements) est présente
    // sur CHACUNE des 2 étapes : ❤️ like · 💬 commenter · 😊 emoji/GIF · partage.
    expect(await page.locator('.post-actions span[onclick*="toggleStepLike"]').count()).toBe(2);
    expect(await page.locator('.post-actions span[onclick*="openStepComments"]').count()).toBe(2);
    expect(await page.locator('.post-actions span[onclick*="showStepEmojiPicker"]').count()).toBe(2);
    expect(await page.locator('.post-actions span[onclick*="shareCdvStep"]').count()).toBe(2);

    // ❤️ like d'une étape = toggle 1/personne, indépendant par journée.
    const likes = await page.evaluate((i) => {
      const t = "cdvstep:" + i + ":s1";
      toggleStepLike(t); const on = _stepLikeCount(t);
      toggleStepLike(t); const off = _stepLikeCount(t);
      const other = _stepLikeCount("cdvstep:" + i + ":s2");
      return { on, off, other };
    }, id);
    expect(likes.on).toBe(1);
    expect(likes.off).toBe(0);
    expect(likes.other).toBe(0);

    // Réagir à l'étape 2 : UNE réaction par personne (re-taper le même la retire).
    const react = await page.evaluate((i) => {
      const tid = "cdvstep:" + i + ":s2";
      _applyStepReaction(tid, "🔥");
      const add = _stepReactions(tid).map((r) => r.text);
      _applyStepReaction(tid, "😍");            // remplace
      const rep = _stepReactions(tid).map((r) => r.text);
      const chip = document.querySelector('[data-stepreact="' + tid + '"]').innerHTML;
      _applyStepReaction(tid, "😍");            // toggle off
      const off = _stepReactions(tid).length;
      // L'étape 1 n'a PAS été touchée (indépendance des journées).
      const s1 = _stepReactions("cdvstep:" + i + ":s1").length;
      return { add, rep, chipHasHeart: /😍/.test(chip), off, s1 };
    }, id);
    expect(react.add).toEqual(["🔥"]);
    expect(react.rep).toEqual(["😍"]);
    expect(react.chipHasHeart).toBe(true);
    expect(react.off).toBe(0);
    expect(react.s1).toBe(0);

    // Commenter l'étape 1 : atterrit dans le store scopé à CETTE étape, pas l'autre.
    await page.evaluate((i) => { openCdvStepComments(i, "s1"); }, id);
    await page.locator("#cmtThreadInput").fill("Superbe première journée !");
    await page.evaluate((i) => submitStepComment("cdvstep:" + i + ":s1"), id);
    const cmt = await page.evaluate((i) => ({
      s1: (state.user.stepComments["cdvstep:" + i + ":s1"] || []).length,
      s2: (state.user.stepComments["cdvstep:" + i + ":s2"] || []).length,
    }), id);
    expect(cmt.s1).toBe(1);
    expect(cmt.s2).toBe(0);
  });
});

// ═══ CDV v2 : voyage unifié, géoloc, collaboratif, story, itinéraires ═══
test.describe("CDV v2 — un seul « voyage »", () => {
  test("l'entrée unique propose les deux formats et reprend un voyage en cours", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => goTo("cdv"));
    await page.getByRole("button", { name: /Nouveau voyage/ }).click();
    await expect(page.locator(".modal")).toContainText("Je pars maintenant");
    await expect(page.locator(".modal")).toContainText("Je raconte un voyage passé");
    await page.evaluate(() => closeModal());

    // Avec un live en cours, la feuille propose de le reprendre directement.
    await seedLive(page);
    await page.evaluate(() => openNewTripSheet());
    await expect(page.locator(".modal")).toContainText("Voyage en cours");
    await expect(page.locator(".modal")).toContainText("Lisbonne");
  });

  test("« Je raconte un voyage passé » ouvre le Studio en mode carnet", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => goTo("cdv"));
    await page.getByRole("button", { name: /Nouveau voyage/ }).click();
    await page.getByText("Je raconte un voyage passé").click();
    await expect(page.locator("#cdvEditor")).toBeVisible({ timeout: 6000 });
    expect(await page.evaluate(() => studioType)).toBe("vlog");
  });
});

test.describe("CDV v2 — géolocalisation des étapes", () => {
  test("une étape hors du dictionnaire de villes finit quand même sur la carte", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page);
    // Un spot précis (plage, refuge, restaurant) n'est dans aucun dictionnaire :
    // sans géocodage l'étape était simplement absente de la carte.
    expect(await page.evaluate(() => cityToLatLng("Praia da Ursa"))).toBeNull();

    await page.evaluate((i) => addCdvLiveStep(i), id);
    await page.fill("#liveStepCity", "Praia da Ursa");
    await page.getByRole("button", { name: /Publier l'étape/ }).click();

    await expect.poll(
      () => page.evaluate(() => typeof getCdvLives()[0].steps[0].lat),
      { timeout: 8000 }
    ).toBe("number");
    const ll = await page.evaluate(() => cdvStepLatLng(getCdvLives()[0].steps[0]));
    expect(ll).toEqual([38.72, -9.14]);
  });

  test("cdvStepLatLng gère GPS, dictionnaire et absence de lieu", async ({ page }) => {
    await bootCdv(page);
    const res = await page.evaluate(() => ({
      gps: cdvStepLatLng({ city: "Nulle part", lat: 10, lng: 20 }),
      dict: cdvStepLatLng({ city: "Lyon" }),
      none: cdvStepLatLng({ city: "Zzzzz inconnu" }),
    }));
    expect(res.gps).toEqual([10, 20]);       // le GPS prime
    expect(Array.isArray(res.dict)).toBe(true); // repli dictionnaire
    expect(res.none).toBeNull();
  });
});

test.describe("CDV v2 — voyage collaboratif", () => {
  test("un co-voyageur peut publier une étape, pas modifier celles des autres", async ({ page }) => {
    await bootCdv(page);
    // Live d'un AUTRE compte, sur lequel je suis invité.
    const id = await seedLive(page, {
      authorId: "u_autre",
      collaborators: [],
      steps: [{ id: "s_owner", authorId: "u_autre", city: "Porto", emoji: "📍", content: "", photos: [], createdAt: Date.now() }],
    });

    expect(await page.evaluate(() => canEditLive(getCdvLives()[0]))).toBe(false);
    await page.evaluate(() => {
      const l = getCdvLives(); l[0].collaborators = [window.MY_UID || "me"]; saveCdvLives(l);
    });
    expect(await page.evaluate(() => canEditLive(getCdvLives()[0]))).toBe(true);

    // Je publie MON étape sur SON voyage.
    await page.evaluate((i) => addCdvLiveStep(i), id);
    await page.fill("#liveStepCity", "Sintra");
    await page.getByRole("button", { name: /Publier l'étape/ }).click();
    const steps = await page.evaluate(() => getCdvLives()[0].steps);
    expect(steps).toHaveLength(2);
    expect(steps[1].authorId).toBe(await page.evaluate(() => window.MY_UID || "me"));

    // Mais je ne peux pas supprimer l'étape de l'auteur.
    page.on("dialog", (d) => d.accept());
    await page.evaluate((i) => deleteCdvLiveStep(i, "s_owner"), id);
    expect(await page.evaluate(() => getCdvLives()[0].steps.length)).toBe(2);
  });

  test("l'auteur invite et retire un co-voyageur", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page);
    await page.evaluate((i) => addCdvCollaborator(i, "u_lea", "Léa"), id);
    expect(await page.evaluate(() => cdvCollaborators(getCdvLives()[0]))).toEqual(["u_lea"]);
    await expect(page.locator(".modal")).toContainText("Co-voyageurs");
    await page.evaluate((i) => removeCdvCollaborator(i, "u_lea"), id);
    expect(await page.evaluate(() => cdvCollaborators(getCdvLives()[0]))).toEqual([]);
  });
});

test.describe("CDV v2 — story de voyage", () => {
  test("les étapes se parcourent en plein écran, avant/arrière et fermeture", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page, {
      steps: [
        { id: "s1", city: "Lisbonne", emoji: "📍", content: "Alfama", photos: [], createdAt: Date.now() },
        { id: "s2", city: "Cascais", emoji: "🍽", content: "Poisson grillé", photos: [], createdAt: Date.now() },
      ],
    });

    await page.evaluate((i) => openCdvStepStory(i, 0), id);
    const ov = page.locator("#cdvStoryOverlay");
    await expect(ov).toBeVisible();
    await expect(ov).toContainText("Lisbonne");
    await expect(ov).toContainText("1/2");

    await page.evaluate(() => cdvStoryNext());
    await expect(ov).toContainText("Cascais");
    await expect(ov).toContainText("2/2");
    await page.evaluate(() => cdvStoryPrev());
    await expect(ov).toContainText("1/2");

    await page.evaluate(() => closeCdvStepStory());
    await expect(ov).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });

  test("passer la dernière étape ferme la story", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page, { steps: [{ id: "s1", city: "Porto", emoji: "📍", content: "", photos: [], createdAt: Date.now() }] });
    await page.evaluate((i) => openCdvStepStory(i, 0), id);
    await expect(page.locator("#cdvStoryOverlay")).toBeVisible();
    await page.evaluate(() => cdvStoryNext());
    await expect(page.locator("#cdvStoryOverlay")).toBeHidden();
  });
});

test.describe("CDV v2 — réutiliser un itinéraire", () => {
  test("enregistrer les lieux d'un voyage, les revoir, en retirer un", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page, {
      steps: [
        { id: "s1", city: "Lisbonne", emoji: "📍", content: "Alfama au coucher du soleil", photos: [], rating: 5, budget: "€€", lat: 38.7, lng: -9.1, createdAt: Date.now() },
        { id: "s2", city: "Cascais", emoji: "🍽", content: "", photos: [], createdAt: Date.now() },
      ],
    });

    await page.evaluate((i) => saveItineraryPlaces(i, "live"), id);
    const places = await page.evaluate(() => savedPlaces());
    expect(places).toHaveLength(2);
    expect(places[0].name).toBe("Lisbonne");
    expect(places[0].lat).toBe(38.7);
    expect(places[0].fromTrip).toContain("Lisbonne");

    // Le compteur s'affiche dans l'item « Mes lieux » du panneau d'outils.
    await page.evaluate(() => { renderCdvScreen(); ContextualTools.open("cdv"); });
    await expect(page.locator("#ctxToolsBody")).toContainText("2 lieux");
    await page.evaluate(() => ContextualTools.close());

    // Pas de doublon si on ré-enregistre le même voyage.
    await page.evaluate((i) => saveItineraryPlaces(i, "live"), id);
    expect(await page.evaluate(() => savedPlaces().length)).toBe(2);

    await page.evaluate(() => openSavedPlaces());
    await expect(page.locator(".modal")).toContainText("Alfama au coucher du soleil");
    await page.evaluate(() => removeSavedPlace(savedPlaces()[0].id));
    expect(await page.evaluate(() => savedPlaces().length)).toBe(1);
  });

  test("les lieux d'un carnet sont enregistrables depuis son viewer", async ({ page }) => {
    await bootCdv(page);
    const pid = await page.evaluate(() => {
      const p = {
        id: "vlog_test", authorId: window.MY_UID || "me", type: "vlog", destination: "Toscane",
        text: "Toscane", createdAt: Date.now(), likes: 0, comments: [],
        steps: [{ place: "Florence", text: "Duomo", tip: "", lat: 43.77, lng: 11.25 }],
      };
      state.userPosts.unshift(p); saveState();
      goTo("cdv"); renderCdvScreen();
      return p.id;
    });
    await page.evaluate((i) => openVlogViewer(i), pid);
    await page.getByRole("button", { name: /Enregistrer les lieux/ }).click();
    const places = await page.evaluate(() => savedPlaces());
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe("Florence");
    expect(places[0].fromTrip).toBe("Toscane");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MES LIEUX v2 (2026-07-22) — la liste d'envies : statut + actions + ajout manuel.
// v1 était une liste morte (« on ne comprend pas à quoi ça sert ») ; ce qui la
// rend utile, c'est de pouvoir COCHER un lieu visité et d'en SORTIR (étape,
// événement, itinéraire).
// ═══════════════════════════════════════════════════════════════════════════
test.describe("CDV — Mes lieux (liste d'envies)", () => {
  async function seedPlaces(page) {
    await bootCdv(page);
    return page.evaluate(() => {
      state.user.savedPlaces = [
        { id: "pl_a", name: "Lisbonne", note: "Alfama", status: "wish", fromTrip: "Portugal", lat: 38.7, lng: -9.1, country: "Portugal", at: 1 },
        { id: "pl_b", name: "Cascais", note: "", status: "wish", fromTrip: "Portugal", at: 2 },
      ];
      saveState(); goTo("cdv"); renderCdvScreen();
    });
  }

  test("l'état vide EXPLIQUE à quoi sert la liste au lieu d'être invisible", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => openSavedPlaces());
    await expect(page.locator(".modal")).toContainText("liste d'envies");
    await expect(page.locator(".modal")).toContainText("Enregistrer les lieux");
    await expect(page.getByRole("button", { name: /Ajouter un lieu/ })).toBeVisible();
  });

  test("marquer un lieu visité bascule son statut sans le supprimer", async ({ page }) => {
    await seedPlaces(page);
    await page.evaluate(() => openSavedPlaces());
    await page.evaluate(() => toggleSavedPlaceDone("pl_a"));
    expect(await page.evaluate(() => savedPlaces().find(p => p.id === "pl_a").status)).toBe("done");
    expect(await page.evaluate(() => savedPlaces().length)).toBe(2);
    // Toggle inverse.
    await page.evaluate(() => toggleSavedPlaceDone("pl_a"));
    expect(await page.evaluate(() => savedPlaces().find(p => p.id === "pl_a").status)).toBe("wish");
  });

  test("les filtres À visiter / Visités et la recherche trient la liste", async ({ page }) => {
    await seedPlaces(page);
    await page.evaluate(() => {
      state.user.savedPlaces.push({ id: "pl_c", name: "Porto", status: "done", fromTrip: "Portugal", at: 3 });
      state.user.savedPlaces.push({ id: "pl_d", name: "Sintra", status: "wish", fromTrip: "Portugal", at: 4 });
      saveState();
      openSavedPlaces();
    });
    expect(await page.evaluate(() => _splVisiblePlaces().length)).toBe(4);
    await page.evaluate(() => _splSetFilter("done"));
    expect(await page.evaluate(() => _splVisiblePlaces().map(p => p.name))).toEqual(["Porto"]);
    await page.evaluate(() => _splSetFilter("wish"));
    expect(await page.evaluate(() => _splVisiblePlaces().length)).toBe(3);
    await page.evaluate(() => { _splSetFilter("all"); _splSetQuery("sintra"); });
    expect(await page.evaluate(() => _splVisiblePlaces().map(p => p.name))).toEqual(["Sintra"]);
    await page.evaluate(() => _splSetQuery(""));
  });

  test("un lieu s'ajoute à la main et rejoint la liste immédiatement", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => { window.passioGeocode = async () => null; openAddSavedPlace(); });
    // ⚠️ Instabilité CI mesurée le 2026-08-28 — course de FOCUS, pas de rendu.
    // `openAddSavedPlace()` arme `setTimeout(focus #splNewName, 80)` (app-03).
    // Or `fill()` procède en DEUX aller-retours : le script injecté focalise le
    // champ, puis `Input.insertText` vise l'élément focalisé À CET INSTANT. Sur
    // une machine lente, la minuterie du produit tombe entre les deux pour
    // #splNewNote : la note s'écrit dans le champ NOM, qui vaut alors
    // « Cap FréhelCoucher de soleil » — un seul lieu enregistré, mais mal nommé
    // (exactement l'échec vu sur la CI). On attend donc la CONDITION observable
    // « le focus différé a déjà eu lieu » avant toute saisie : la minuterie ne
    // peut plus déplacer le focus ensuite.
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === "splNewName");
    await page.fill("#splNewName", "Cap Fréhel");
    await page.fill("#splNewNote", "Coucher de soleil");
    // Le formulaire porte bien ce qui a été saisi (garde explicite du piège ci-dessus).
    await expect(page.locator("#splNewName")).toHaveValue("Cap Fréhel");
    await expect(page.locator("#splNewNote")).toHaveValue("Coucher de soleil");
    await page.getByRole("button", { name: /Ajouter à ma liste/ }).click();
    // Attendre l'ÉCRITURE observable, jamais une durée.
    await expect.poll(() => page.evaluate(() => savedPlaces().length), { timeout: 15000 }).toBe(1);
    const pl = await page.evaluate(() => savedPlaces());
    expect(pl).toHaveLength(1);
    expect(pl[0].name).toBe("Cap Fréhel");
    expect(pl[0].status).toBe("wish");
    // Et la modale « Mes lieux » est bien réaffichée avec le lieu.
    await expect(page.locator("#splList")).toContainText("Cap Fréhel");
  });

  test("« Étape » exige un voyage en direct, puis pré-remplit le composeur", async ({ page }) => {
    await seedPlaces(page);
    // Sans live en cours : refus explicite, aucune modale d'étape.
    await page.evaluate(() => addSavedPlaceToLive("pl_a"));
    await expect(page.locator("#liveStepCity")).toHaveCount(0);

    const id = await seedLive(page);
    await page.evaluate(() => openSavedPlaces());
    await page.evaluate(() => addSavedPlaceToLive("pl_a"));
    await page.waitForTimeout(150);
    await expect(page.locator("#liveStepCity")).toHaveValue("Lisbonne");
    expect(await page.evaluate(() => _stepLat)).toBe(38.7);
    expect(id).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PASSEPORT v2 (2026-07-22) — niveau, records, récap annuel, badges, partage.
// ═══════════════════════════════════════════════════════════════════════════
test.describe("CDV — Passeport", () => {
  test("un passeport vierge explique la mécanique et propose de partir", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => openCdvPassport());
    await expect(page.locator(".modal")).toContainText("passeport est encore vierge");
    await expect(page.getByRole("button", { name: /Commencer un voyage/ })).toBeVisible();
  });

  test("les niveaux de voyageur progressent avec les km cumulés", async ({ page }) => {
    await bootCdv(page);
    const r = await page.evaluate(() => [
      cdvTravelLevel(0).level.name,
      cdvTravelLevel(600).level.name,
      cdvTravelLevel(600).next.name,
      cdvTravelLevel(600).remaining,
      cdvTravelLevel(999999).next,
    ]);
    expect(r[0]).toBe("Premier départ");
    expect(r[1]).toBe("Baroudeur");
    expect(r[2]).toBe("Grand rouleur");
    expect(r[3]).toBe(400);
    expect(r[4]).toBeNull();   // dernier palier : plus de « prochain niveau »
  });

  test("le passeport agrège les voyages, leur niveau et le récap annuel", async ({ page }) => {
    await bootCdv(page);
    await seedLive(page, {
      id: "live_pp", destination: "Portugal", createdAt: Date.UTC(2026, 2, 1),
      steps: [
        { id: "s1", city: "Lisbonne", country: "Portugal", photos: ["u"], lat: 38.72, lng: -9.14, createdAt: Date.UTC(2026, 2, 1) },
        { id: "s2", city: "Porto", country: "Portugal", photos: [], lat: 41.15, lng: -8.61, createdAt: Date.UTC(2026, 2, 4) },
      ],
    });
    const p = await page.evaluate(() => cdvPassportStats());
    expect(p.trips).toHaveLength(1);
    expect(p.km).toBeGreaterThan(250);          // Lisbonne → Porto ≈ 275 km
    expect(p.cities.sort()).toEqual(["Lisbonne", "Porto"]);
    expect(p.countries).toEqual(["Portugal"]);
    expect(p.years[0].year).toBe(2026);
    expect(p.years[0].trips).toBe(1);
    expect(p.longest.id).toBe("live_pp");

    await page.evaluate(() => openCdvPassport());
    await expect(page.locator(".cdv-pp-hero")).toBeVisible();
    await expect(page.locator(".cdv-pp-next")).toContainText(/Encore .* km avant|Niveau maximum/);
    await expect(page.locator(".modal")).toContainText("Mes records");
    await expect(page.locator(".modal")).toContainText("Plus long voyage");
    await expect(page.locator(".cdv-pp-badges .cdv-pp-badge").first()).toBeVisible();
    // L'item « Passeport » du panneau d'outils porte les km cumulés.
    await page.evaluate(() => { closeModal(); renderCdvScreen(); ContextualTools.open("cdv"); });
    await expect(page.locator("#ctxToolsBody")).toContainText("km");
    await page.evaluate(() => ContextualTools.close());
  });

  test("le partage du passeport produit un résumé chiffré", async ({ page }) => {
    await bootCdv(page);
    await seedLive(page, {
      id: "live_share", destination: "Portugal",
      steps: [
        { id: "s1", city: "Lisbonne", country: "Portugal", lat: 38.72, lng: -9.14, createdAt: Date.now() },
        { id: "s2", city: "Porto", country: "Portugal", lat: 41.15, lng: -8.61, createdAt: Date.now() },
      ],
    });
    const txt = await page.evaluate(() => {
      let captured = "";
      navigator.share = undefined;
      navigator.clipboard.writeText = (t) => { captured = t; return Promise.resolve(); };
      shareCdvPassport();
      return captured;
    });
    expect(txt).toContain("passeport PASSIO");
    expect(txt).toMatch(/\d+ km/);
    expect(txt).toContain("2 villes");
  });
});

test.describe("CDV v2 — modifier un carnet publié", () => {
  // Crée un carnet local appartenant au compte de test.
  async function seedCarnet(page) {
    return page.evaluate(() => {
      const p = {
        id: "vlog_edit", authorId: window.MY_UID || "me", type: "vlog", destination: "Norvège",
        text: "Norvège", createdAt: Date.now(), likes: 0, comments: [], budget: "800",
        steps: [{ place: "Bergen", text: "Pluie", tip: "" }],
      };
      state.userPosts.unshift(p); saveState();
      goTo("cdv"); renderCdvScreen();
      return p.id;
    });
  }

  test("le menu ⋯ propose « Modifier » sur un carnet, pas sur un post ordinaire", async ({ page }) => {
    await bootCdv(page);
    const id = await seedCarnet(page);
    await page.evaluate((i) => openPostOptions(i), id);
    await expect(page.locator(".modal")).toContainText("Modifier le carnet");
    await page.evaluate(() => closeModal());

    // Un post texte n'a pas d'entrée « Modifier ».
    const tid = await page.evaluate(() => {
      const p = { id: "txt_1", authorId: window.MY_UID || "me", type: "text", text: "hello", createdAt: Date.now(), comments: [] };
      state.userPosts.unshift(p); saveState(); return p.id;
    });
    await page.evaluate((i) => openPostOptions(i), tid);
    await expect(page.locator(".modal")).not.toContainText("Modifier le carnet");
  });

  test("modifier un carnet met à jour le post au lieu d'en créer un second", async ({ page }) => {
    await bootCdv(page);
    const id = await seedCarnet(page);
    const before = await page.evaluate(() => state.userPosts.filter((p) => p.type === "vlog").length);
    expect(before).toBe(1);

    await page.evaluate((i) => editCarnet(i), id);
    await expect(page.locator("#cdvEditor")).toBeVisible({ timeout: 5000 });
    // Le formulaire est PRÉ-REMPLI et l'UI passe en mode édition.
    await expect(page.locator("#vlogDestination")).toHaveValue("Norvège");
    await expect(page.locator("#cdvEditorTitle")).toContainText("Modifier");
    await expect(page.locator("#cdvPublishBtn")).toContainText("Enregistrer");

    await page.fill("#vlogDestination", "Norvège — fjords de l'ouest");
    await page.getByRole("button", { name: /Enregistrer les modifications/ }).click();

    await expect.poll(
      () => page.evaluate(() => state.userPosts.filter((p) => p.type === "vlog").length),
      { timeout: 10000 }
    ).toBe(1); // toujours UN seul carnet
    const p = await page.evaluate(() => state.userPosts.find((x) => x.type === "vlog"));
    expect(p.id).toBe(id);                      // même post
    expect(p.destination).toBe("Norvège — fjords de l'ouest");
    expect(p.steps[0].place).toBe("Bergen");    // le reste est conservé
    expect(p.editedAt).toBeTruthy();

    // L'éditeur se referme et repasse en mode création pour la prochaine fois.
    await expect(page.locator("#cdvEditor")).toBeHidden();
    expect(await page.evaluate(() => window._editingCarnetId)).toBeFalsy();
    await expect(page.locator("#cdvEditorTitle")).toContainText("Nouveau carnet");
  });

  test("annuler une modification ne touche pas le carnet", async ({ page }) => {
    await bootCdv(page);
    const id = await seedCarnet(page);
    await page.evaluate((i) => editCarnet(i), id);
    await page.fill("#vlogDestination", "Jamais enregistré");
    await page.getByRole("button", { name: "Annuler" }).click();
    const p = await page.evaluate(() => state.userPosts.find((x) => x.type === "vlog"));
    expect(p.destination).toBe("Norvège");
    expect(await page.evaluate(() => window._editingCarnetId)).toBeFalsy();
  });
});

test.describe("CDV v2 — carnets collaboratifs", () => {
  test("un co-auteur peut modifier le carnet d'un autre compte", async ({ page }) => {
    await bootCdv(page);
    const id = await page.evaluate(() => {
      const p = {
        id: "vlog_collab", authorId: "u_autre", type: "vlog", destination: "Pérou",
        text: "Pérou", createdAt: Date.now(), likes: 0, comments: [], collaborators: [],
        steps: [{ place: "Cusco", text: "", tip: "" }],
      };
      state.supabasePosts = state.supabasePosts || [];
      state.supabasePosts.unshift(p); saveState();
      goTo("cdv"); renderCdvScreen();
      return p.id;
    });

    expect(await page.evaluate((i) => canEditCarnet(findPostAnywhere(i)), id)).toBe(false);
    await page.evaluate((i) => {
      findPostAnywhere(i).collaborators = [window.MY_UID || "me"];
    }, id);
    expect(await page.evaluate((i) => canEditCarnet(findPostAnywhere(i)), id)).toBe(true);

    await page.evaluate((i) => editCarnet(i), id);
    await expect(page.locator("#cdvEditor")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#vlogDestination")).toHaveValue("Pérou");
  });

  test("l'auteur invite puis retire un co-auteur, et les crédits s'affichent", async ({ page }) => {
    await bootCdv(page);
    const id = await page.evaluate(() => {
      const p = {
        id: "vlog_credits", authorId: window.MY_UID || "me", type: "vlog", destination: "Corse",
        text: "Corse", createdAt: Date.now(), likes: 0, comments: [],
        steps: [{ place: "Bonifacio", text: "", tip: "" }],
      };
      state.userPosts.unshift(p); saveState();
      // Auteur connu pour l'affichage du crédit.
      state.seed.users.push({ id: "u_lea", name: "Léa", profileEmoji: "🎵", avatar: "#8b5cf6" });
      goTo("cdv"); renderCdvScreen();
      return p.id;
    });

    await page.evaluate((i) => addCarnetCollaborator(i, "u_lea", "Léa"), id);
    expect(await page.evaluate((i) => carnetCollaborators(findPostAnywhere(i)), id)).toEqual(["u_lea"]);
    await expect(page.locator(".modal")).toContainText("Co-auteurs du carnet");
    await page.evaluate(() => closeModal());

    // Crédité dans le viewer : « par Moi · avec Léa ».
    await page.evaluate((i) => openVlogViewer(i), id);
    await expect(page.locator(".vlog-viewer-author")).toContainText("avec Léa");

    await page.evaluate((i) => removeCarnetCollaborator(i, "u_lea"), id);
    expect(await page.evaluate((i) => carnetCollaborators(findPostAnywhere(i)), id)).toEqual([]);
  });
});

test.describe("CDV v2 — favoris", () => {
  test("un voyage en direct se sauvegarde et se retrouve dans « Mes favoris »", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page, { authorId: "u_autre" });
    expect(await page.evaluate((i) => isLiveSaved(i), id)).toBe(false);

    await page.evaluate((i) => toggleLiveSave(i), id);
    expect(await page.evaluate((i) => isLiveSaved(i), id)).toBe(true);

    // Le filtre « ⭐ Mes favoris » seul doit faire apparaître le live sauvegardé.
    await page.evaluate(() => { cdvFilters = new Set(["saved"]); renderCdvScreen(); });
    await expect(page.locator("#cdvList")).toContainText("Lisbonne");

    await page.evaluate((i) => toggleLiveSave(i), id);
    await page.evaluate(() => renderCdvScreen());
    await expect(page.locator("#cdvList")).not.toContainText("Lisbonne");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Refonte du 2026-07-22 : entrées de même gabarit, numéros carte ↔ liste,
// tuiles-filtres cumulables, et ⋯ modifier/supprimer sur un voyage.
// ═══════════════════════════════════════════════════════════════════════════
// Refonte content-first (2026-08-07) : la rangée d'entrée se réduit à l'ACTION
// principale (Nouveau voyage) pleine largeur + un déclencheur « Outils ». « Mes
// lieux » et « Passeport » vivent dans le panneau contextuel.
test.describe("CDV — entrée content-first + panneau d'outils", () => {
  test("l'action principale prend la largeur, le déclencheur Outils reste compact", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => { goTo("cdv"); renderCdvScreen(); });
    const boxes = await page.evaluate(() => {
      const row = document.querySelector(".cdv-entry-row-lean");
      const primary = row.querySelector(".cdv-entry.primary");
      const trigger = row.querySelector("#cdvToolsBtn");
      return {
        row: Math.round(row.getBoundingClientRect().width),
        primary: Math.round(primary.getBoundingClientRect().width),
        trigger: Math.round(trigger.getBoundingClientRect().width),
      };
    });
    // « Nouveau voyage » domine (> la moitié), « Outils » reste petit (< 40%).
    expect(boxes.primary).toBeGreaterThan(boxes.row * 0.5);
    expect(boxes.trigger).toBeLessThan(boxes.row * 0.4);
  });

  test("le panneau d'outils expose Mes lieux + Passeport (icône dessinée + km)", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => {
      window.cdvPassportStats = () => ({ km: 1234, trips: [1, 2], countries: [], cities: [], years: [] });
      goTo("cdv"); renderCdvScreen(); ContextualTools.open("cdv");
    });
    // L'item Passeport garde son icône SVG dessinée, et son sous-libellé les km.
    expect(await page.locator("#ctxToolsBody .ctx-item-ico svg").count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#ctxToolsBody")).toContainText("km");
    await expect(page.locator("#ctxToolsBody")).toContainText("Mes lieux");
    await page.evaluate(() => ContextualTools.close());
  });
});

test.describe("CDV — Mes lieux : numéros et filtres cumulables", () => {
  async function seedNumbered(page) {
    await bootCdv(page);
    await page.evaluate(() => {
      state.user.savedPlaces = [
        { id: "p1", name: "Lisbonne", status: "wish", country: "Portugal", lat: 38.7, lng: -9.1, at: 1 },
        { id: "p2", name: "Cascais", status: "done", country: "Portugal", lat: 38.7, lng: -9.4, at: 2 },
        { id: "p3", name: "Kyoto", status: "wish", country: "Japon", lat: 35.0, lng: 135.7, at: 3 },
        { id: "p4", name: "Sans GPS", status: "wish", country: "", at: 4 },
      ];
      saveState(); goTo("cdv"); renderCdvScreen(); openSavedPlaces();
    });
  }

  test("chaque ligne porte le numéro de son épingle, dans le même ordre", async ({ page }) => {
    await seedNumbered(page);
    const nums = await page.$$eval("#splList .spl-card-num", (els) => els.map((e) => e.textContent.trim()));
    // 3 lieux géolocalisés numérotés 1..3 dans l'ordre d'affichage, le 4e sans épingle.
    expect(nums).toEqual(["·", "1", "2", "3"]);
    const names = await page.$$eval("#splList .spl-card-name > span:first-child", (els) => els.map((e) => e.textContent.trim()));
    expect(names).toEqual(["Sans GPS", "Kyoto", "Cascais", "Lisbonne"]);
  });

  test("les tuiles À visiter / Visités / Pays filtrent en multi-sélection, liste ET carte", async ({ page }) => {
    await seedNumbered(page);
    // Les 3 tuiles sont de vrais boutons cliquables.
    expect(await page.locator(".spl-tile").count()).toBe(3);

    await page.evaluate(() => _splToggleStatus("done"));
    expect(await page.evaluate(() => _splVisiblePlaces().map((p) => p.name))).toEqual(["Cascais"]);

    // Cumul : « à visiter » s'AJOUTE à « visités » (union), il ne le remplace pas.
    await page.evaluate(() => _splToggleStatus("wish"));
    expect(await page.evaluate(() => _splVisiblePlaces().length)).toBe(4);

    // Le pays est un filtre à part, cumulable avec le statut.
    await page.evaluate(() => { _splToggleStatus("wish"); _splToggleCountry("Portugal"); });
    expect(await page.evaluate(() => _splVisiblePlaces().map((p) => p.name))).toEqual(["Cascais"]);

    // La carte suit : un seul point → une seule épingle, numérotée 1.
    await page.waitForTimeout(320);
    const nums = await page.$$eval("#splList .spl-card-num", (els) => els.map((e) => e.textContent.trim()));
    expect(nums).toEqual(["1"]);

    // « Tout voir » remet la sélection à zéro.
    await page.evaluate(() => _splClearFilters());
    expect(await page.evaluate(() => _splVisiblePlaces().length)).toBe(4);
  });
});

test.describe("CDV — ⋯ modifier / supprimer un voyage", () => {
  test("le ⋯ de ma carte ouvre les options et n'ouvre PAS le viewer", async ({ page }) => {
    await bootCdv(page);
    await seedLive(page);
    await page.locator(".cdv-live-card .cdv-live-menu-btn").first().click();
    await expect(page.locator(".modal")).toContainText("Modifier le voyage");
    await expect(page.locator(".modal")).toContainText("Supprimer le voyage");
    // Le viewer plein écran ne s'est pas ouvert.
    expect(await page.locator(".modal.modal-fullscreen").count()).toBe(0);
  });

  test("modifier change destination, description et visibilité sans toucher aux étapes", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page, { steps: [{ id: "s1", city: "Belém", emoji: "📍", createdAt: Date.now() }] });
    await page.evaluate((i) => editCdvLive(i), id);
    await page.fill("#cdvEditDest", "Porto");
    await page.fill("#cdvEditDesc", "Nouvelle version");
    await page.evaluate(() => document.querySelectorAll(".cdv-vis-btn")[2].click()); // 🔒 Privé
    await page.evaluate((i) => saveCdvLiveEdits(i), id);
    const live = await page.evaluate((i) => getCdvLives().find((l) => l.id === i), id);
    expect(live.destination).toBe("Porto");
    expect(live.description).toBe("Nouvelle version");
    expect(live.visibility).toBe("private");
    expect(live.steps).toHaveLength(1);
  });

  test("supprimer retire le voyage de la liste, mais pas sans confirmation", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page);
    await page.evaluate((i) => confirmDeleteCdvLive(i), id);
    // Tant qu'on n'a pas confirmé, le voyage est intact.
    expect(await page.evaluate((i) => !!getCdvLives().find((l) => l.id === i), id)).toBe(true);
    await page.evaluate((i) => deleteCdvLive(i), id);
    expect(await page.evaluate((i) => !!getCdvLives().find((l) => l.id === i), id)).toBe(false);
    // Plus aucune carte de voyage en direct dans la liste.
    expect(await page.locator("#cdvList .cdv-live-card").count()).toBe(0);
  });

  test("le voyage d'un autre compte ne propose ni modification ni suppression", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page, { authorId: "u_autre" });
    await page.evaluate((i) => openCdvLiveMenu(i), id);
    await expect(page.locator(".modal")).toContainText("Signaler");
    await expect(page.locator(".modal")).not.toContainText("Supprimer le voyage");
    // Et l'appel direct est refusé côté modèle (la RLS l'exige côté serveur).
    await page.evaluate((i) => deleteCdvLive(i), id);
    expect(await page.evaluate((i) => !!getCdvLives().find((l) => l.id === i), id)).toBe(true);
  });
});

test.describe("CDV — ⋯ dans le voyage OUVERT", () => {
  test("le viewer plein écran a le ⋯, un seul ×, et on y revient en annulant", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page, { steps: [{ id: "s1", city: "Belém", emoji: "📍", createdAt: Date.now() }] });
    await page.evaluate((i) => openCdvLiveViewer(i), id);

    // Le ⋯ est là, et openModal n'injecte qu'UNE croix (le viewer en remettait une).
    await expect(page.locator(".modal .cdv-viewer-menu-btn")).toBeVisible();
    expect(await page.locator(".modal .modal-close").count()).toBe(1);

    await page.locator(".modal .cdv-viewer-menu-btn").click();
    await expect(page.locator(".modal")).toContainText("Modifier le voyage");
    await expect(page.locator(".modal")).toContainText("Supprimer le voyage");

    // ⚠️ openModal n'empile pas : « Annuler » doit ramener au voyage ouvert,
    // pas refermer tout et renvoyer sur la liste.
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page.locator(`.modal.modal-fullscreen[data-live-id="${id}"]`)).toHaveCount(1);

    // Idem après une modification : on revient au voyage, avec le nouveau titre.
    await page.locator(".modal .cdv-viewer-menu-btn").click();
    await page.getByRole("button", { name: /Modifier le voyage/ }).click();
    await page.fill("#cdvEditDest", "Lisbonne & Sintra");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator(`.modal.modal-fullscreen[data-live-id="${id}"]`)).toHaveCount(1);
    await expect(page.locator(".modal")).toContainText("Lisbonne & Sintra");
  });
});

// Pont IRL↔CDV : le bandeau « Sorties près d'ici » dans un voyage (2026-08-03).
// Croise les événements IRL réels avec le lieu du voyage — preuve sociale + 1 tap.
test.describe("CDV↔IRL — Sorties près d'ici", () => {
  // Injecte 1 événement à Lisbonne (auquel un abonnement participe) + 1 loin (Paris).
  async function seedEventsNearLisbon(page) {
    await page.evaluate(() => {
      state.user.following = Array.from(new Set([...(state.user.following || []), "u_lea"]));
      state.seed.events = (state.seed.events || []).filter((e) => !/^ev_tn_/.test(e.id));
      const base = { organizerId: "u_lea", authorId: "u_lea", passion: "music", emoji: "🎸",
        status: "active", date: Date.now() + 3 * 86400000, durationH: 3, maybes: [], city: "Lisbonne" };
      state.seed.events.push(Object.assign({}, base, { id: "ev_tn_near", title: "Jam au bord du Tage", lat: 38.7225, lng: -9.14, attendees: ["u_lea", "u_x"] }));
      state.seed.events.push(Object.assign({}, base, { id: "ev_tn_far", title: "Trop loin (Paris)", lat: 48.8566, lng: 2.3522, attendees: ["u_x"] }));
    });
  }

  test("un voyage géolocalisé affiche les sorties proches, avec preuve sociale, et pas les lointaines", async ({ page }) => {
    await bootCdv(page);
    await seedEventsNearLisbon(page);
    const id = await seedLive(page, { steps: [{ id: "s1", city: "Lisbonne", emoji: "📍", lat: 38.7223, lng: -9.1393, createdAt: Date.now() }] });
    await page.evaluate((i) => openCdvLiveViewer(i), id);

    const band = page.locator(".modal .trip-nearby");
    await expect(band).toBeVisible();
    await expect(band).toContainText("Sorties près d'ici");
    await expect(band).toContainText("Jam au bord du Tage");
    await expect(band).toContainText("y va"); // preuve sociale (Léa)
    await expect(band).not.toContainText("Trop loin"); // hors rayon → exclu
  });

  test("tap sur une sortie ferme le voyage et ouvre la fiche de l'événement", async ({ page }) => {
    await bootCdv(page);
    await seedEventsNearLisbon(page);
    const id = await seedLive(page, { steps: [{ id: "s1", city: "Lisbonne", emoji: "📍", lat: 38.7223, lng: -9.1393, createdAt: Date.now() }] });
    await page.evaluate((i) => openCdvLiveViewer(i), id);

    await page.locator(".modal .trip-nearby-ev").first().click();
    // openNearbyEventFromTrip ferme le viewer puis ouvre la fiche en différé (~130 ms).
    await expect.poll(() => page.evaluate(() => window._openEventDetailId), { timeout: 4000 }).toBe("ev_tn_near");
  });

  test("un voyage sans sortie autour propose d'organiser la première", async ({ page }) => {
    await bootCdv(page);
    await seedEventsNearLisbon(page); // les événements sont à Lisbonne, pas à Tokyo
    const id = await seedLive(page, { destination: "Tokyo", steps: [{ id: "s1", city: "Tokyo", emoji: "📍", lat: 35.6762, lng: 139.6503, createdAt: Date.now() }] });
    await page.evaluate((i) => openCdvLiveViewer(i), id);

    const band = page.locator(".modal .trip-nearby");
    await expect(band).toBeVisible();
    await expect(band).toContainText("Sois le premier");
    // Le bouton d'organisation ouvre le composeur d'événement pré-rempli.
    await band.getByRole("button", { name: /Organiser la première/ }).click();
    await expect(page.locator("#evTitle")).toHaveValue(/Tokyo/, { timeout: 4000 });
  });
});
