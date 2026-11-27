// Rencontrer — le LIEU et les DATES d'une activité (2026-11-27).
// Navigateur seul, aucune écriture : le formulaire tourne en mode local, le
// géocodage est un faux déterministe.
//
//   A. `cityToLatLng` prenait une SOUS-CHAÎNE pour une ville : « Riom » partait à
//      Rio de Janeiro, « Venice » à Nice, « Limay » à Lima — et ce dictionnaire
//      passe AVANT le géocodage, donc le point faux partait en base (①②③).
//   B. Le point d'une suggestion choisie, ou celui de l'activité modifiée,
//      survivait à une ville retapée à la main : Paris → Lyon gardait le
//      marqueur à Paris (④⑤⑥).
//   C. Séries : le mensuel débordait (31 janvier → 3 mars), l'hebdomadaire
//      glissait d'une heure au changement d'heure (⑦⑧).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Les dates d'une série se jugent à l'heure LOCALE : on fixe le fuseau.
test.use({ timezoneId: "Europe/Paris" });

const PARIS = [48.8566, 2.3522], LYON = [45.764, 4.8357], RIOM = { lat: 45.8936, lng: 3.1126 };

async function boot(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    ["supaPublishEvent", "supaUpdateEvent", "supaJoinEvent", "supaSetEventRsvp", "supaLoadEvents", "supaLoadMyRsvps",
      "supaCreateEventConversation", "supaJoinEventConversation"].forEach((fn) => { window[fn] = async () => null; });
    window._supaReal = false;
    window.passioGeoSuggest = async () => [];
    window.passioGeocode = async () => null;
    window.passioReverseGeocode = async () => null;
    window.__geocodes = [];
    window._geocodeAddress = async (q) => { window.__geocodes.push(q); return window.__reponseGeo || null; };
    window.irlUserLocation = { lat: 48.8566, lng: 2.3522 };
    state.userEvents = [];
    saveState();
  });
}

// Remplit le minimum du formulaire ouvert, puis l'envoie.
async function creer(page, { titre, ville, adresse }) {
  await page.evaluate(({ titre, ville, adresse }) => {
    openCreateEvent();
    document.getElementById("evTitle").value = titre;
    document.getElementById("evTime").value = "18:00";
    const c = document.getElementById("evCity");
    c.value = ville; c.dispatchEvent(new Event("input", { bubbles: true }));
    if (adresse) { const a = document.getElementById("evAddress"); a.value = adresse; a.dispatchEvent(new Event("input", { bubbles: true })); }
  }, { titre, ville, adresse: adresse || "" });
  await page.evaluate(() => submitEvent());
  await expect.poll(() => page.evaluate((t) => state.userEvents.some((e) => e.title === t), titre)).toBe(true);
  return page.evaluate((t) => { const e = state.userEvents.find((x) => x.title === t); return { lat: e.lat, lng: e.lng, city: e.city, id: e.id }; }, titre);
}

test.describe("Rencontrer — le lieu d'une activité", () => {
  test("① une ville n'est jamais reconnue par une sous-chaîne : Riom n'est pas Rio, Venice n'est pas Nice", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((noms) => Object.fromEntries(noms.map((n) => [n, cityToLatLng(n)])),
      ["Riom", "Brioude", "Limay", "Venice", "Mittelwihr", "Parisot", "Lyons-la-Forêt", "Tours-sur-Marne", "Aix", "an", "Vannes-sur-Cosson"]);
    for (const [nom, point] of Object.entries(r)) expect(point, nom + " n'est dans le dictionnaire sous aucun nom").toBeNull();
  });

  test("② la même ville, écrite autrement ou précisée, est toujours reconnue", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      paris: cityToLatLng("paris"),
      memes: ["Paris", "  PARIS ", "Paris 11e", "Paris 11ème arrondissement", "Paris 75011", "Paris, France"].map((n) => cityToLatLng(n)),
      lyon: cityToLatLng("lyon"), lyon3: cityToLatLng("Lyon 3ème"),
      bordeaux: cityToLatLng("bordeaux"), bordeauxCentre: cityToLatLng("Bordeaux centre"),
      stEtienne: cityToLatLng("saint-étienne"), stEtienneNu: cityToLatLng("saint etienne"), stEtienneAbrege: cityToLatLng("St Etienne"),
      stMalo: cityToLatLng("saint-malo"), stMaloAbrege: cityToLatLng("St-Malo"),
      leHavre: cityToLatLng("le havre"), leHavreMaj: cityToLatLng("Le Havre"),
    }));
    expect(r.paris, "témoin : Paris est au dictionnaire").toBeTruthy();
    for (const p of r.memes) expect(p).toEqual(r.paris);
    expect(r.lyon3).toEqual(r.lyon);
    expect(r.bordeauxCentre).toEqual(r.bordeaux);
    expect(r.stEtienne).toBeTruthy();
    expect(r.stEtienneNu).toEqual(r.stEtienne);
    expect(r.stEtienneAbrege).toEqual(r.stEtienne);
    expect(r.stMaloAbrege).toEqual(r.stMalo);
    expect(r.leHavreMaj).toEqual(r.leHavre);
  });

  test("③ créer une activité à « Riom », ville tapée à la main : le point est celui du géocodage, pas Rio de Janeiro ; sans géocodage, pas de point du tout", async ({ page }) => {
    await boot(page);
    await page.evaluate((p) => { window.__reponseGeo = p; }, RIOM);
    const avec = await creer(page, { titre: "Marche à Riom", ville: "Riom" });
    expect(avec.lat, "latitude de Riom (Puy-de-Dôme)").toBeCloseTo(RIOM.lat, 3);
    expect(avec.lng).toBeCloseTo(RIOM.lng, 3);
    expect(await page.evaluate(() => window.__geocodes.length), "la ville inconnue du dictionnaire est bien géocodée").toBe(1);

    await page.evaluate(() => { window.__reponseGeo = null; });
    const sans = await creer(page, { titre: "Marche à Brioude", ville: "Brioude" });
    expect(sans.lat, "un point absent vaut mieux qu'un point à Rio").toBeNull();
    expect(sans.lng).toBeNull();
  });

  test("④ modifier la VILLE à la main déplace le point : Paris → Lyon ne laisse pas le marqueur à Paris", async ({ page }) => {
    await boot(page);
    const cree = await creer(page, { titre: "Atelier itinérant", ville: "Paris" });
    expect([cree.lat, cree.lng], "témoin : créée à Paris").toEqual(PARIS);
    await page.evaluate((id) => {
      openCreateEvent(id);
      const c = document.getElementById("evCity");
      c.value = "Lyon"; c.dispatchEvent(new Event("input", { bubbles: true }));
    }, cree.id);
    await expect(page.locator("#evPlacePicked"), "la mention « Position précise enregistrée » ne survit pas à une ville retapée").toBeHidden();
    await page.evaluate((id) => submitEvent(id), cree.id);
    await expect.poll(() => page.evaluate((id) => state.userEvents.find((e) => e.id === id).city, cree.id)).toBe("Lyon");
    const apres = await page.evaluate((id) => { const e = state.userEvents.find((x) => x.id === id); return [e.lat, e.lng]; }, cree.id);
    expect(apres, "le point suit la ville").toEqual(LYON);
  });

  test("⑤ modifier autre chose que le lieu (titre, nom du lieu) garde le point tel quel", async ({ page }) => {
    await boot(page);
    // Un point précis, tel qu'une suggestion l'aurait donné — pas le centre de Paris.
    const cree = await creer(page, { titre: "Répétition", ville: "Paris" });
    await page.evaluate((id) => { const e = state.userEvents.find((x) => x.id === id); e.lat = 48.8721; e.lng = 2.3415; saveState(); }, cree.id);
    await page.evaluate((id) => {
      openCreateEvent(id);
      document.getElementById("evTitle").value = "Répétition générale";
      document.getElementById("evVenue").value = "Studio Bleu";
    }, cree.id);
    await expect(page.locator("#evPlacePicked")).toBeVisible();
    await page.evaluate((id) => submitEvent(id), cree.id);
    await expect.poll(() => page.evaluate((id) => state.userEvents.find((e) => e.id === id).title, cree.id)).toBe("Répétition générale");
    const apres = await page.evaluate((id) => { const e = state.userEvents.find((x) => x.id === id); return [e.lat, e.lng]; }, cree.id);
    expect(apres, "le point précis est conservé").toEqual([48.8721, 2.3415]);
  });

  test("⑥ une suggestion choisie puis une ville retapée : le point de la suggestion n'est plus le bon, il est abandonné", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      openCreateEvent();
      document.getElementById("evTitle").value = "Sortie vélo";
      document.getElementById("evTime").value = "09:00";
      window._evSuggestCache = [{ name: "Café du Lac", postcode: "74000", city: "Annecy", lat: 45.9, lng: 6.12 }];
      _evPlacePick(0);
    });
    await expect(page.locator("#evPlacePicked")).toBeVisible();
    expect(await page.evaluate(() => window._evPickedCoords.lat), "témoin : la suggestion a posé son point").toBe(45.9);
    await page.evaluate(() => {
      const c = document.getElementById("evCity"); c.value = "Lyon"; c.dispatchEvent(new Event("input", { bubbles: true }));
      const p = document.getElementById("evPostal"); p.value = "69001"; p.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.locator("#evPlacePicked")).toBeHidden();
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => state.userEvents.some((e) => e.title === "Sortie vélo"))).toBe(true);
    const ev = await page.evaluate(() => { const e = state.userEvents.find((x) => x.title === "Sortie vélo"); return [e.lat, e.lng, e.city]; });
    expect(ev, "le point est celui de Lyon, pas celui du café d'Annecy").toEqual([LYON[0], LYON[1], "Lyon"]);
  });
});

test.describe("Rencontrer — les dates d'une série", () => {
  const locale = (ts) => { const d = new Date(ts); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]; };

  test("⑦ mensuel : une série partie du 31 reste en FIN de mois, sans sauter février", async ({ page }) => {
    await boot(page);
    const dates = await page.evaluate(() => _recurrenceDates(new Date(2027, 0, 31, 19, 0).getTime(), "monthly", 6));
    // Le calcul se relit dans le fuseau du navigateur (Europe/Paris, fixé plus haut).
    const lus = await page.evaluate((ts) => ts.map((t) => { const d = new Date(t); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]; }), dates);
    expect(lus).toEqual([
      [2027, 2, 28, 19, 0], [2027, 3, 31, 19, 0], [2027, 4, 30, 19, 0], [2027, 5, 31, 19, 0], [2027, 6, 30, 19, 0],
    ]);
    // Contre-épreuve de lecture : le même calcul côté Node, pour ne pas mesurer une tautologie.
    expect(locale(new Date(2027, 1, 28, 19, 0).getTime())).toEqual([2027, 2, 28, 19, 0]);
  });

  test("⑧ hebdomadaire et toutes les deux semaines : l'heure choisie tient au passage à l'heure d'été ET d'hiver", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const lire = (ts) => ts.map((t) => { const d = new Date(t); return d.getDate() + "/" + (d.getMonth() + 1) + " " + d.getHours() + "h" + String(d.getMinutes()).padStart(2, "0") + " j" + d.getDay(); });
      return {
        // Mardi 23 mars 2027, 19 h — l'heure d'été arrive le dimanche 28 mars.
        ete: lire(_recurrenceDates(new Date(2027, 2, 23, 19, 0).getTime(), "weekly", 4)),
        // Mardi 19 octobre 2027, 19 h — l'heure d'hiver arrive le dimanche 31 octobre.
        hiver: lire(_recurrenceDates(new Date(2027, 9, 19, 19, 0).getTime(), "biweekly", 3)),
      };
    });
    expect(r.ete, "tous les mardis à 19 h, pas 20 h après le changement d'heure").toEqual(["30/3 19h00 j2", "6/4 19h00 j2", "13/4 19h00 j2"]);
    expect(r.hiver, "un mardi sur deux à 19 h, pas 18 h après le changement d'heure").toEqual(["2/11 19h00 j2", "16/11 19h00 j2"]);
  });
});
