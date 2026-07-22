// Suite IRL (événements réels) — filtres, cycle de vie, participation.
// Couvre les régressions trouvées lors de l'audit du 2026-07-21 :
//   · filtres passion PRÉ-COCHÉS masquant 31 des 35 événements EN SILENCE
//     (barre ne listant que mes passions → aucun moyen d'afficher les autres)
//   · événement disparu à la seconde où il commençait (pas de notion de fin)
//   · lien partagé #irl-event-<id> qui n'ouvrait jamais l'événement
//   · organisateur absent de ses propres inscrits (« 0 inscrit » chez les autres)
//   · carte recadrée à CHAQUE like / inscription (zoom et scroll perdus)
//   · séparateur « Lyon · · Café des Arts » et recherche aveugle au lieu/description
//   · état vide « crée le premier » affiché alors que 35 événements existaient
// et les 9 fonctionnalités livrées ensuite (RSVP 3 états, liste d'attente,
// album, check-in, co-organisateurs, récurrence, calendrier, digest, groupe).
// Aucune écriture Supabase : les fonctions de sync sont neutralisées après boot.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function bootIrl(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    ["supaPublishEvent", "supaUpdateEvent", "supaCancelEvent", "supaDeleteEvent",
      "supaJoinEvent", "supaLeaveEvent", "supaSetEventRsvp", "supaCheckInEvent",
      "supaPromoteFromWaitlist", "supaFirstWaitlisted", "supaLoadMyRsvps",
      "supaLoadEvents", "supaLoadEventPosts", "supaLoadEventReactions",
      "supaLoadEventComments", "supaLoadEventCommentCounts", "supaCreateEventConversation",
      "supaJoinEventConversation", "supaLeaveEventConversation", "supaReport",
    ].forEach((fn) => { window[fn] = async () => null; });
    window._supaReal = false;
    // Géocodage : aucun appel réseau en test → réponses déterministes.
    window.passioGeoSuggest = async () => [];
    window.passioGeocode = async () => null;
    window.passioReverseGeocode = async () => null;
    window._geocodeAddress = async () => null;
    // Position de référence fixée (Paris) : les distances deviennent prévisibles
    // et la géoloc du navigateur n'est jamais sollicitée pendant les tests.
    window.irlUserLocation = { lat: 48.8566, lng: 2.3522 };
    localStorage.removeItem("passio_irl_digest_week");
  });
}

// Remplace le jeu d'événements par un jeu MAÎTRISÉ, puis rend l'écran.
async function seedEvents(page, events) {
  await page.evaluate((evs) => {
    const now = Date.now();
    state.seed.events = evs.map((e, i) => Object.assign({
      id: "ev" + i, title: "Événement " + i, passion: "musique", emoji: "🎸",
      city: "Paris", lat: 48.8566, lng: 2.3522,
      date: now + (i + 1) * 86400000, time: "18:00",
      desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [],
      organizerId: "someone_else", status: "active",
    }, e));
    state.userEvents = [];
    state.user.joinedEvents = [];
    state.user.eventRsvp = {};
    state.user.checkedInEvents = [];
    window._irlRenderLimit = null;
    window._irlFilterSig = null;
    window._irlMapSig = null;
    if (typeof irlPassionFilters !== "undefined") irlPassionFilters.clear();
    if (typeof irlDateFilters !== "undefined") irlDateFilters.clear();
    if (typeof irlFilters !== "undefined") irlFilters.clear();
    irlSearchQuery = "";
    irlShowPast = false;
    state.user.irlExtraPassions = [];
    window._irlExtraOpen = false;
    goTo("irl");
    renderIRL();
  }, events);
}

const cards = (page) => page.locator("#eventList .event-card");

test.describe("IRL — découverte et filtres", () => {
  test("aucun filtre par défaut : TOUS les événements sont visibles", async ({ page }) => {
    await bootIrl(page);
    // Le compte n'a qu'un profil « musique » : c'est exactement le cas qui
    // masquait 31 événements sur 35 avant le 2026-07-21.
    await seedEvents(page, [
      { passion: "musique" }, { passion: "sport" }, { passion: "cuisine" },
      { passion: "photo" }, { passion: "art" },
    ]);
    await expect(cards(page)).toHaveCount(5);
    // Aucune pastille de filtre : rien n'est masqué, et ça se voit.
    await expect(page.locator("#irlFiltersBadge")).toBeHidden();
  });

  test("la barre affiche MES passions ; les autres s'ajoutent depuis le panneau", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ passion: "sport" }, { passion: "musique" }, { passion: "art" }]);
    const tiles = page.locator("#irlPassionRow .msg-tile[data-irlpassion]");
    // Le compte de test n'a qu'un profil « musique » : une seule tuile principale…
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first()).toHaveAttribute("data-irlpassion", "musique");
    await expect(tiles.first().locator(".irl-tile-mine")).toBeVisible();
    // …mais TOUS les événements restent visibles (aucun filtre par défaut).
    await expect(cards(page)).toHaveCount(3);

    // Le panneau « Autres » liste les passions restantes, à cocher.
    await page.locator("#irlExtraToggle").click();
    await expect(page.locator("#irlExtraPanel .irl-extra-chip")).toHaveCount(2);
    await page.locator("#irlExtraPanel .irl-extra-chip", { hasText: "Sport" }).click();
    await expect(tiles).toHaveCount(2);
    // Cocher AJOUTE la tuile, ça ne filtre pas : la liste est inchangée.
    await expect(cards(page)).toHaveCount(3);
  });

  test("décocher une passion ajoutée retire aussi son filtre", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ passion: "musique" }, { passion: "sport" }, { passion: "art" }]);
    await page.evaluate(() => { toggleIrlExtraPassion("sport"); });
    await page.locator('[data-irlpassion="sport"]').click();
    await expect(cards(page)).toHaveCount(1);
    await page.evaluate(() => { toggleIrlExtraPassion("sport"); });
    // Sans le nettoyage du filtre, on filtrerait sur une tuile disparue = liste
    // vide sans moyen de la débloquer.
    await expect(cards(page)).toHaveCount(3);
    expect(await page.evaluate(() => irlPassionFilters.size)).toBe(0);
  });

  test("filtrer par passion réduit la liste et la pastille de filtres le dit", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [
      { passion: "musique" }, { passion: "sport" }, { passion: "cuisine" }, { passion: "art" },
    ]);
    await page.locator('[data-irlpassion="musique"]').click();
    await expect(cards(page)).toHaveCount(1);
    await expect(page.locator("#irlFiltersBadge")).toHaveText("1");
    await page.evaluate(() => clearAllIrlFilters());
    await expect(cards(page)).toHaveCount(4);
    await expect(page.locator("#irlFiltersBadge")).toBeHidden();
  });

  test("la recherche filtre sur le lieu et la description, pas seulement le titre", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [
      { title: "Concert", venue: "Café des Arts", desc: "ambiance jazz" },
      { title: "Rando", venue: "Parc", desc: "montagne" },
      { title: "Atelier guitare", venue: "Studio", desc: "" },
    ]);
    await page.fill("#irlCitySearch", "jazz");
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Concert");
    await page.fill("#irlCitySearch", "café des arts");
    await expect(cards(page)).toHaveCount(1);
  });

  test("état vide : « rien avec ces filtres » ≠ « aucun événement »", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ passion: "musique" }, { passion: "sport" }]);
    await page.fill("#irlCitySearch", "zzzintrouvable");
    await expect(page.locator("#eventList .empty-title")).toHaveText(/Rien avec ces filtres/);
    // Ne JAMAIS inviter à « créer le premier » quand des événements existent.
    await expect(page.locator("#eventList")).not.toContainText("Crée le premier");
  });

  test("le séparateur ville · lieu ne se dédouble pas", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ city: "Lyon", venue: "Café des Arts" }]);
    const meta = await cards(page).first().locator(".event-meta").innerText();
    expect(meta).not.toMatch(/·\s*·/);
    expect(meta).toContain("Lyon · Café des Arts");
  });

  test("la liste est paginée et la pagination repart à zéro quand un filtre change", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, Array.from({ length: 20 }, (_, i) => ({ title: "Ev " + i })));
    await expect(cards(page)).toHaveCount(12);
    await page.locator("#eventList > button", { hasText: "Afficher plus" }).click();
    await expect(cards(page)).toHaveCount(20);
    await page.fill("#irlCitySearch", "Ev 1"); // Ev 1, Ev 10..19 = 11 résultats
    await expect(cards(page)).toHaveCount(11);
    await page.fill("#irlCitySearch", "");
    await expect(cards(page)).toHaveCount(12); // retour à la première page
  });

  test("le tri « les plus proches » classe par distance croissante", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [
      { title: "Marseille", lat: 43.2965, lng: 5.3698 },
      { title: "Paris", lat: 48.8566, lng: 2.3522 },
      { title: "Lyon", lat: 45.764, lng: 4.8357 },
    ]);
    await page.evaluate(() => setIrlSort("near"));
    await expect(cards(page).nth(0)).toContainText("Paris");
    await expect(cards(page).nth(1)).toContainText("Lyon");
    await expect(cards(page).nth(2)).toContainText("Marseille");
  });
});

test.describe("IRL — cycle de vie d'un événement", () => {
  test("un événement EN COURS reste visible (il ne disparaît plus à son début)", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [
      { title: "En cours", date: Date.now() - 30 * 60000, endAt: Date.now() + 90 * 60000 },
      { title: "À venir", date: Date.now() + 86400000 },
    ]);
    await expect(cards(page)).toHaveCount(2);
    await expect(page.locator(".event-card-banner.live")).toContainText("maintenant");
  });

  test("un événement TERMINÉ sort de « à venir » et reste joignable en mode passé", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [
      { title: "Fini", date: Date.now() - 3 * 86400000, endAt: Date.now() - 3 * 86400000 + 7200000 },
      { title: "À venir", date: Date.now() + 86400000 },
    ]);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("À venir");
    // L'onglet « Passés » a été retiré de l'UI (2026-07-22) ; le mode existe encore.
    await page.evaluate(() => setIrlPastMode(true));
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Fini");
  });

  test("un événement ANNULÉ reste visible, barré, et ne peut plus être rejoint", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ title: "Annulé", status: "cancelled" }]);
    await expect(page.locator(".event-card.is-cancelled")).toHaveCount(1);
    await expect(page.locator(".event-card-banner.cancelled")).toContainText("annulé");
    // Rejoindre est refusé : personne ne doit se déplacer pour rien.
    await page.evaluate(() => toggleJoinEvent("ev0"));
    expect(await page.evaluate(() => myRsvp("ev0"))).toBeNull();
  });

  test("l'organisateur peut modifier son événement, les inscrits sont prévenus", async ({ page }) => {
    await bootIrl(page);
    await page.evaluate(() => {
      state.seed.events = [];
      state.userEvents = [{
        id: "mine1", title: "Titre initial", passion: "musique", emoji: "🎸",
        city: "Paris", lat: 48.85, lng: 2.35, date: Date.now() + 5 * 86400000,
        time: "18:00", desc: "", attendees: [MY_UID, "autre"], maybes: [], waitlist: [],
        organizerId: MY_UID, status: "active",
      }];
      window._notified = [];
      window.supaInsertNotif = (to, kind) => { window._notified.push(to + ":" + kind); };
      goTo("irl"); renderIRL();
      // Chemin de notification : il n'est emprunté QUE si l'écriture serveur a
      // réussi (on ne prévient pas d'une modification qui n'a pas été persistée).
      window._supaReal = true;
      window.supaUpdateEvent = async () => true;
      openCreateEvent("mine1");
      document.getElementById("evTitle").value = "Titre corrigé";
    });
    await page.evaluate(() => submitEvent("mine1"));
    await expect.poll(() => page.evaluate(() => _findCanonicalEvent("mine1").title)).toBe("Titre corrigé");
    // Un seul événement : l'édition ne doit PAS créer de doublon.
    expect(await page.evaluate(() => state.userEvents.filter((e) => e.id === "mine1").length)).toBe(1);
    expect(await page.evaluate(() => window._notified)).toContain("autre:event_update");
  });

  test("le lien partagé #irl-event-<id> ouvre bien la fiche", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ title: "Partagé" }, { title: "Autre" }]);
    await page.evaluate(() => { location.hash = "#irl-event-ev0"; });
    await expect(page.locator("#eventDetailPage")).toBeVisible();
    await expect(page.locator("#eventDetailHeroTitle")).toContainText("Partagé");
  });
});

test.describe("IRL — participation (RSVP, liste d'attente, check-in)", () => {
  test("le RSVP a 3 états et seuls les « je viens » occupent une place", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ maxAttendees: 10 }]);
    await page.evaluate(() => setEventRsvp("ev0", "maybe"));
    expect(await page.evaluate(() => myRsvp("ev0"))).toBe("maybe");
    // Un « peut-être » ne consomme pas de place.
    expect(await page.evaluate(() => _findCanonicalEvent("ev0").attendees.length)).toBe(0);
    expect(await page.evaluate(() => _findCanonicalEvent("ev0").maybes.length)).toBe(1);
    await expect(cards(page).first().locator(".event-footer button")).toContainText("Peut-être");

    await page.evaluate(() => setEventRsvp("ev0", "going"));
    expect(await page.evaluate(() => _findCanonicalEvent("ev0").attendees.length)).toBe(1);
    expect(await page.evaluate(() => _findCanonicalEvent("ev0").maybes.length)).toBe(0);

    await page.evaluate(() => setEventRsvp("ev0", null));
    expect(await page.evaluate(() => myRsvp("ev0"))).toBeNull();
    expect(await page.evaluate(() => _findCanonicalEvent("ev0").attendees.length)).toBe(0);
  });

  test("rejoindre un événement COMPLET bascule en liste d'attente", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ maxAttendees: 2, attendees: ["u1", "u2"] }]);
    await page.evaluate(() => setEventRsvp("ev0", "going"));
    expect(await page.evaluate(() => myRsvp("ev0"))).toBe("waitlist");
    expect(await page.evaluate(() => _findCanonicalEvent("ev0").attendees.length)).toBe(2);
    await expect(cards(page).first().locator(".event-footer button")).toContainText("En attente");
  });

  test("une place libérée promeut le premier de la liste d'attente", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ maxAttendees: 2, attendees: ["u1", "u2"], waitlist: ["u3", "u4"] }]);
    await page.evaluate(() => {
      // Je suis inscrit·e, je me désiste : une place s'ouvre pour u3.
      const ev = _findCanonicalEvent("ev0");
      ev.attendees = [MY_UID, "u2"];
      _setMyRsvpLocal("ev0", "going");
      return setEventRsvp("ev0", null);
    });
    await expect
      .poll(() => page.evaluate(() => _findCanonicalEvent("ev0").attendees))
      .toContain("u3");
    expect(await page.evaluate(() => _findCanonicalEvent("ev0").waitlist)).toEqual(["u4"]);
  });

  test("le check-in n'ouvre qu'à l'approche de l'événement", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ title: "Loin", date: Date.now() + 5 * 86400000 }]);
    expect(await page.evaluate(() => _canCheckIn(_findCanonicalEvent("ev0")))).toBe(false);
    await page.evaluate(() => {
      const ev = _findCanonicalEvent("ev0");
      ev.date = Date.now() - 10 * 60000;
      ev.endAt = Date.now() + 60 * 60000;
    });
    expect(await page.evaluate(() => _canCheckIn(_findCanonicalEvent("ev0")))).toBe(true);
  });

  test("inscription et like ne recadrent PAS la carte", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ title: "A" }, { title: "B" }]);
    // La carte est initialisée EN DIFFÉRÉ puis recadrée : on attend qu'elle se
    // STABILISE (deux mesures identiques), sinon on compare à un état transitoire.
    // Stabilité exigée sur 3 relevés consécutifs ET sur le zoom + le centre :
    // avec un seul relevé identique sur le seul zoom, un palier momentané de
    // l'animation de recadrage suffisait à faire croire que la carte était posée
    // (le recadrage se poursuivait ensuite et faisait échouer la comparaison).
    await page.waitForFunction(() => {
      if (!window.irlMap || !irlMap.getZoom()) return false;
      const c = irlMap.getCenter();
      const sig = [irlMap.getZoom(), c.lat, c.lng].join(",");
      window.__stableRuns = (window.__lastSig === sig) ? (window.__stableRuns || 0) + 1 : 0;
      window.__lastSig = sig;
      return window.__stableRuns >= 3;
    }, null, { timeout: 30000, polling: 500 });
    const before = await page.evaluate(() => ({ z: irlMap.getZoom(), lat: irlMap.getCenter().lat }));
    await page.evaluate(() => setEventRsvp("ev0", "going"));
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ z: irlMap.getZoom(), lat: irlMap.getCenter().lat }));
    expect(after.z).toBeCloseTo(before.z, 5);
    expect(after.lat).toBeCloseTo(before.lat, 5);
  });
});

test.describe("IRL — création, récurrence et vues", () => {
  test("créer un événement m'inscrit dessus et refuse une date passée", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, []);
    // Date passée → refus (avant, l'événement partait puis restait invisible).
    await page.evaluate(() => {
      openCreateEvent();
      document.getElementById("evTitle").value = "Dans le passé";
      document.getElementById("evCity").value = "Paris";
      document.getElementById("evDate").value = "2020-01-01";
    });
    await page.evaluate(() => submitEvent());
    expect(await page.evaluate(() => state.userEvents.length)).toBe(0);

    await page.evaluate(() => {
      openCreateEvent();
      document.getElementById("evTitle").value = "Bien créé";
      document.getElementById("evCity").value = "Paris";
    });
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    // L'organisateur DOIT compter parmi ses propres inscrits.
    const ev = await page.evaluate(() => state.userEvents[0]);
    expect(ev.attendees).toContain(await page.evaluate(() => MY_UID));
    expect(await page.evaluate(() => myRsvp(state.userEvents[0].id))).toBe("going");
  });

  test("un événement récurrent crée de VRAIS événements partageant une série", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, []);
    await page.evaluate(() => {
      openCreateEvent();
      document.getElementById("evTitle").value = "Club hebdo";
      document.getElementById("evCity").value = "Paris";
      document.getElementById("evRecurrence").value = "weekly";
      _evSyncRecurrenceUi();
      document.getElementById("evOccurrences").value = "4";
    });
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(4);
    const info = await page.evaluate(() => {
      const s = state.userEvents.filter((e) => e.title === "Club hebdo").sort((a, b) => a.date - b.date);
      return {
        series: new Set(s.map((e) => e.seriesId)).size,
        ids: new Set(s.map((e) => e.id)).size,
        gapsDays: s.slice(1).map((e, i) => Math.round((e.date - s[i].date) / 86400000)),
      };
    });
    expect(info.series).toBe(1);   // une seule série
    expect(info.ids).toBe(4);      // 4 événements distincts
    expect(info.gapsDays).toEqual([7, 7, 7]);
  });

  test("le filtre de date tient dans UN bouton calendrier (plus de pastilles)", async ({ page }) => {
    await bootIrl(page);
    const d = new Date();
    d.setDate(d.getDate() + 2);
    d.setHours(18, 0, 0, 0);
    await seedEvents(page, [{ title: "Le bon jour", date: d.getTime() }, { title: "Autre", date: d.getTime() + 5 * 86400000 }]);
    await page.evaluate(() => openIrlFiltersPanel());
    await expect(page.locator("#irlDateBtnLabel")).toHaveText("Toutes les dates");
    await expect(page.locator("#irlDateClearBtn")).toBeHidden();
    // Les 5 pastilles Aujourd'hui/Demain/… ont disparu.
    await expect(page.locator("#irlDateCarousel")).toHaveCount(0);

    const iso = await page.evaluate((ts) => new Date(ts).toISOString().split("T")[0], d.getTime());
    await page.locator("#irlDateBtn").click();
    await page.fill("#irlCalStart", iso);
    await page.locator("#modalBackdrop button", { hasText: "Appliquer" }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Le bon jour");
    await expect(page.locator("#irlDateClearBtn")).toBeVisible();

    await page.evaluate(() => clearIrlDateFilter());
    await expect(cards(page)).toHaveCount(2);
    await expect(page.locator("#irlDateBtnLabel")).toHaveText("Toutes les dates");
  });

  test("le digest hebdo ne se déclenche qu'une fois par semaine", async ({ page }) => {
    await bootIrl(page);
    await seedEvents(page, [{ title: "Tout près", date: Date.now() + 2 * 86400000 }]);
    const first = await page.evaluate(() => {
      const before = state.notifications.length;
      _irlWeeklyDigest();
      return { added: state.notifications.length - before, week: localStorage.getItem("passio_irl_digest_week") };
    });
    expect(first.added).toBe(1);
    expect(first.week).toMatch(/^\d{4}-W\d{2}$/);
    const second = await page.evaluate(() => {
      const before = state.notifications.length;
      _irlWeeklyDigest();
      return state.notifications.length - before;
    });
    expect(second).toBe(0);
  });
});
