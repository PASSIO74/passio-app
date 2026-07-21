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
    // « Mes lieux » reste caché tant qu'aucun itinéraire n'a été enregistré.
    await expect(page.locator("#cdvSavedPlacesBtn")).toBeHidden();
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
    // La note ★ et le budget saisis en direct ne sont pas perdus à la conversion.
    const tips = await page.evaluate(() => vlogState.steps.map((s) => s.tip));
    expect(tips[0]).toContain("€€");
    expect(tips[0]).toContain("★");
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

    // Le bouton « Mes lieux » n'apparaît que lorsque la collection existe.
    await page.evaluate(() => renderCdvScreen());
    await expect(page.locator("#cdvSavedPlacesBtn")).toBeVisible();
    await expect(page.locator("#cdvSavedPlacesBtn")).toContainText("(2)");

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
