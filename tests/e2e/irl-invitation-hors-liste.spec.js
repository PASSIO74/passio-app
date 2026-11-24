const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const cible = { id: "ev_sortie_partagee", title: "Balade des trois belvédères",
  city: "Annecy", date_at: "2030-06-14T09:00:00", status: "active" };
async function servirActivites(page) {
  const recentes = Array.from({ length: 60 }, (_, i) => ({
    ...cible, id: "ev_recente_" + i, title: "Sortie récente " + i,
  }));
  const requetesCiblees = [];
  await page.route(/\/rest\/v1\/events(?:\?|$)/, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const filtre = params.get("id");
    let lignes;
    if (filtre) {
      requetesCiblees.push(filtre);
      lignes = filtre === "eq." + cible.id ? [cible] : [];
    } else {
      lignes = [...recentes, cible].slice(0, Number(params.get("limit") || 61));
    }
    await route.fulfill({ json: lignes });
  });

  return requetesCiblees;
}

test("une invitation ouvre la sortie même après la création de 60 autres activités", async ({ page }) => {
  await bootOnboarded(page);
  const requetesCiblees = await servirActivites(page);
  // Le cache vient du vrai chargeur de liste. La sortie plus ancienne en est absente.
  const debut = await page.evaluate(async (id) => {
    const liste = await supaLoadEvents();
    fusionnerEvenementsServeur(liste);
    return { chargees: liste.length, cibleEnMemoire: allEvents().some(ev => ev.id === id) };
  }, cible.id);
  expect(debut).toEqual({ chargees: 60, cibleEnMemoire: false });

  await page.evaluate(id => { location.hash = "#irl-event-" + id; }, cible.id);
  const fiche = page.locator("#eventDetailPage");
  await expect(fiche).toBeVisible({ timeout: 15000 });
  await expect(fiche).toContainText(cible.title);
  expect(requetesCiblees).toEqual(["eq." + cible.id]);
});

for (const verdict of ["ok", "code_incorrect", "non_inscrit", "visiteur"]) {
  test("QR hors des 60 dernières sorties : verdict serveur " + verdict, async ({ page }) => {
    await bootOnboarded(page);
    const lectures = await servirActivites(page);
    await page.evaluate(async ({ id, verdict }) => {
      fusionnerEvenementsServeur(await supaLoadEvents());
      window.__pointagesQr = [];
      _uidEstUnCompte = () => verdict !== "visiteur";
      if (verdict === "visiteur") {
        _checkInViaCode = () => { window.__pointagesQr.push("pointage local"); };
        _eventCheckinCode = () => "TEST42";
      }
      supaPointerParCode = async (eventId, code) => {
        window.__pointagesQr.push([eventId, code]);
        return verdict;
      };
      location.hash = "#irl-checkin-" + id + "-TEST42";
    }, { id: cible.id, verdict });
    await expect(page.locator("#eventDetailPage")).toContainText(cible.title);
    await expect.poll(() => page.evaluate(() => window.__pointagesQr)).toEqual(verdict === "visiteur" ? [] : [[cible.id, "TEST42"]]);
    expect(lectures).toEqual(["eq." + cible.id]);
    expect(await page.evaluate(id => (state.user.checkedInEvents || []).includes(id), cible.id)).toBe(verdict === "ok");
  });
}

test("quitter un scan pendant le démarrage annule la recherche et le pointage", async ({ page }) => {
  await bootOnboarded(page);
  const lectures = await servirActivites(page);
  await page.evaluate(id => {
    const prete = _irlLienAppPrete;
    _irlLienAppPrete = () => false;
    history.replaceState(null, "", "#irl-checkin-" + id + "-TEST42");
    _openIrlCheckinFromHash();
    history.pushState(null, "", "#feed");
    _irlLienAppPrete = prete;
  }, cible.id);
  await page.waitForFunction(() => _irlCkLinkTimer === null && !_irlCkLinkId);
  expect(lectures).toEqual([]);
  await expect(page.locator("#eventDetailPage")).toBeHidden();
});

test("une confirmation de présence tardive ne marque pas le compte suivant", async ({ page }) => {
  await bootOnboarded(page);
  const resultat = await page.evaluate(async () => {
    const ev = allEvents().find(e => e.id === "e1");
    let confirmer;
    supaPointerParCode = () => new Promise(resolve => { confirmer = resolve; });
    const enVol = _pointerParCodeServeur(ev, "TEST42");
    MY_UID = "u_autre_compte";
    state = { ...state, user: { ...state.user, checkedInEvents: [] } };
    confirmer("ok");
    await enVol;
    return state.user.checkedInEvents;
  });
  expect(resultat).toEqual([]);
});

test("après inscription, une fiche hors du cache revient sans inscrire à la sortie", async ({ page }) => {
  await bootOnboarded(page);
  const requetesCiblees = await servirActivites(page);
  const avantInscription = page.url();
  const participations = [];
  page.on("request", (r) => {
    if (/\/rest\/v1\/event_attendees\b/.test(r.url()) && /^(POST|PATCH|DELETE)$/.test(r.method())) {
      participations.push(r.method());
    }
  });

  // Au retour dans un onglet neuf, il ne reste que la route mémorisée par le formulaire.
  await page.evaluate(id => {
    window.__rappelsParticipation = [];
    const afficher = window.toast;
    window.toast = function (message) {
      if (message === "Tu peux confirmer ta participation.") {
        const fiche = document.getElementById("eventDetailPage");
        window.__rappelsParticipation.push(fiche && fiche.style.display !== "none" ? window._openEventDetailId : null);
      }
      return afficher.apply(this, arguments);
    };
    PassioFirstRun.prefs().retour = {
      screen: "irl", hash: "#event-" + id, action: "rejoindre", cible: { genre: "activite", id },
    };
    PassioFirstRun.apresAuthentification();
  }, cible.id);
  const fiche = page.locator("#eventDetailPage");
  await expect(fiche).toBeVisible({ timeout: 15000 });
  await expect(fiche).toContainText(cible.title);
  expect(requetesCiblees).toEqual(["eq." + cible.id]);
  await expect.poll(() => page.evaluate(() => window.__rappelsParticipation)).toEqual([cible.id]);
  expect(await page.evaluate(id => state.user.joinedEvents.includes(id), cible.id)).toBe(false);
  expect(participations).toEqual([]);

  await page.goBack();
  await expect(fiche).toBeHidden();
  await expect(page).toHaveURL(avantInscription);
});

test("une réponse en retard laisse ouverte la dernière invitation choisie", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(id => {
    const recente = allEvents().find(e => e.id === "e1");
    const premiere = { ...recente, id, title: "Première invitation", fromSupabase: true };
    const lire = window.supaLoadEvents;
    window.supaLoadEvents = function (auteur, cibleId) {
      if (cibleId !== id) return lire.apply(this, arguments);
      return new Promise(resolve => {
        window.__livrerPremiereInvitation = () => resolve([premiere]);
      });
    };
    location.hash = "#irl-event-" + id;
  }, cible.id);
  await page.waitForFunction(() => typeof window.__livrerPremiereInvitation === "function");
  await page.evaluate(() => { location.hash = "#irl-event-e1"; });
  const fiche = page.locator("#eventDetailPage");
  await expect(fiche).toBeVisible();
  await expect(fiche).toContainText("Jam session");

  const apres = await page.evaluate(async id => {
    window.__livrerPremiereInvitation();
    await new Promise(resolve => setTimeout(resolve, 0));
    return { ouverte: window._openEventDetailId, ancienneFusionnee: allEvents().some(ev => ev.id === id) };
  }, cible.id);
  expect(apres).toEqual({ ouverte: "e1", ancienneFusionnee: false });
});
