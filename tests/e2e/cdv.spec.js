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
      "supaAddCdvLiveComment", "supaReactCdvLive", "supaRemoveCdvLiveReaction", "supaToggleCdvLiveLike",
      "supaUpdateCdvLiveStatus", "supaFollowCdvLive", "supaUnfollowCdvLive", "supaRefreshCdvLives",
      "supaLoadCdvLive", "supaLoadCdvLives", "supaLoadCdvLiveLikes"].forEach((fn) => { window[fn] = async () => null; });
    localStorage.removeItem("passio_cdv_lives");
    localStorage.removeItem("passio_vlog_draft_v1");
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
  test("l'écran CDV s'ouvre avec ses deux points d'entrée de création", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => goTo("cdv"));
    await expect(page.locator("#screen-cdv")).toHaveClass(/active/);
    await expect(page.getByRole("button", { name: /Nouveau carnet/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Démarrer un Live/ })).toBeVisible();
  });

  test("« Nouveau carnet » bascule le Studio en mode carnet", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => goTo("cdv"));
    await page.getByRole("button", { name: /Nouveau carnet/ }).click();
    await expect(page.locator("#studioVlog")).toBeVisible({ timeout: 5000 });
    expect(await page.evaluate(() => studioType)).toBe("vlog");
  });

  test("le brouillon d'un carnet survit à la sortie du Studio", async ({ page }) => {
    await bootCdv(page);
    await page.evaluate(() => { goTo("cdv"); });
    await page.getByRole("button", { name: /Nouveau carnet/ }).click();
    await expect(page.locator("#studioVlog")).toBeVisible({ timeout: 5000 });

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
    await page.getByRole("button", { name: /Démarrer un Live/ }).click();
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
    await page.evaluate(() => { setStepRating(5); selectBudget(document.querySelector(".budget-btn"), "€€€"); });
    await page.evaluate(() => closeModal()); // abandon : rien ne doit fuiter

    await page.evaluate((i) => addCdvLiveStep(i), id);
    expect(await page.evaluate(() => _stepRating)).toBe(0);
    expect(await page.evaluate(() => _stepBudget)).toBe("");
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

  test("terminer un live demande confirmation puis propose le carnet", async ({ page }) => {
    await bootCdv(page);
    const id = await seedLive(page, { steps: [{ id: "s1", city: "Porto", emoji: "📍", content: "Ribeira", photos: [], createdAt: Date.now() }] });

    await page.evaluate((i) => confirmEndCdvLive(i), id);
    await expect(page.locator(".modal")).toContainText("Terminer ce carnet en direct ?");
    expect(await page.evaluate(() => getCdvLives()[0].status)).toBe("live"); // rien tant qu'on n'a pas confirmé

    await page.getByRole("button", { name: /Oui, terminer/ }).click();
    expect(await page.evaluate(() => getCdvLives()[0].status)).toBe("ended");
    await expect(page.locator(".modal")).toContainText("En faire un carnet ?", { timeout: 5000 });
  });
});
