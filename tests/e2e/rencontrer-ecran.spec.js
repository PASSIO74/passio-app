// Rencontrer — l'ÉCRAN : liste, recherche, filtres, ville, géolocalisation,
// carte (2026-11-27). Navigateur seul (état local) ou faux serveur PostgREST
// multi-comptes ; fond de carte et géocodeurs simulés. AUCUNE écriture réelle.
//
// Défauts fermés (numéros du dossier de correction ECR), chacun ROUGE sur le
// code d'avant :
//   ①  103 — « 10 km » sans ville ni position filtrait en silence autour de PARIS.
//   ②  103 — sans `navigator.geolocation`, Paris passait pour « Position actuelle ».
//   ③  102 — après un refus ou un délai, « Utiliser ma position » ne redemandait
//            plus rien de la session.
//   ④  127 — lot UI-4A0 coupé : la position était demandée à l'ouverture.
//   ⑤  101 — la carte rejouait son dernier cadrage à chaque rendu : zoom manuel
//            perdu, « Autour de Bordeaux » laissé sur Annecy.
//   ⑥  121 — la vue Filtre était hors historique : le retour quittait Rencontrer,
//            et la fermer depuis la Carte ramenait à la Liste.
//   ⑦  105 — le catalogue était coupé aux 60 dernières activités CRÉÉES.
//   ⑧  128 — un échec de lecture des activités était muet.
//   ⑨  116 — trois lectures réseau à chaque rendu de la liste.
//   ⑩  115 — MapLibre construit en vue Liste ; un échec de chargement définitif.
//   ⑪  107 — une panne du géocodeur était mise en cache 7 jours.
//   ⑫  108 — la recherche d'adresse de l'épingle n'avait ni suggestions ni Entrée.
//   ⑬  118 — marqueur périmé après modification d'une activité.
//   ⑭  112 — bulle groupée sans mention « exemple ».
//   ⑮  114 — attribution OpenStreetMap invisible en vue Carte.
//   ⑯  122 — Échap en plein écran laissait une entrée d'historique morte.
//   ⑰  109 / 110 / 111 / 124 — filtres : « Cette semaine », plages horaires,
//            accents, minuteur de recherche, pastilles du calendrier.
//   ⑱  119 / 120 / 126 — « Mes passions » sans passion, Entrée à vide dans le
//            sélecteur de ville, case « Chercher » sans sélecteur.
//   ⑲  131 — globales de test en production.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");

// Les requêtes du fichier de carte doivent être VUES par `page.route` (⑩) : le
// service worker de l'application les servirait sinon depuis son cache. Il
// n'est le sujet d'aucun cas ici.
test.use({ serviceWorkers: "block" });

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const STYLE_VIDE = JSON.stringify({ version: 8, sources: {}, layers: [] });
const ANNECY = [45.8992, 6.1294], BORDEAUX = [44.8378, -0.5792], LYON = [45.764, 4.8357];

// Géolocalisation pilotée : chaque appel consomme la réponse suivante du plan.
async function geoPilotee(page, { absente = false } = {}) {
  await page.addInitScript((absente) => {
    window.__geo = { appels: 0, plan: [] };
    const faux = {
      getCurrentPosition(ok, ko) {
        window.__geo.appels++;
        const r = window.__geo.plan.shift() || { code: 3 };
        setTimeout(() => (r.code ? ko({ code: r.code, message: "simulé" }) : ok({ coords: { latitude: r.lat, longitude: r.lng, accuracy: 20 } })), 10);
      },
      watchPosition() { return 1; }, clearWatch() {},
    };
    Object.defineProperty(Navigator.prototype, "geolocation", { configurable: true, get: () => (absente ? undefined : faux) });
  }, absente);
}

async function boot(page, opts = {}) {
  await page.route(/tiles\.openfreemap\.org/, (route) => (/styles/.test(route.request().url())
    ? route.fulfill({ status: 200, contentType: "application/json", body: STYLE_VIDE })
    : route.fulfill({ status: 204, body: "" })));
  if (opts.geo !== false) await geoPilotee(page, { absente: !!opts.geoAbsente });
  if (opts.initScript) await page.addInitScript(opts.initScript);
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.__toasts = [];
    const t = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); };
  });
}
const toasts = (page) => page.evaluate(() => window.__toasts.slice());
const ouvrirIrl = async (page) => {
  await page.evaluate(() => goTo("irl"));
  await page.waitForFunction(() => document.getElementById("screen-irl")?.classList.contains("active"));
};

const ACT = (id, titre, lat, lng, j, extra = {}) => Object.assign({
  id, title: titre, passion: "musique", emoji: "🎸", city: "Annecy", lat, lng,
  date: Date.now() + j * 86400000, time: "18:00", desc: "", attendees: [], maybes: [],
  waitlist: [], checkedIn: [], organizerId: "quelqu_un", status: "active",
}, extra);

// Vue Carte, carte construite, activités maîtrisées autour d'Annecy.
async function carteAnnecy(page, evs) {
  await ouvrirIrl(page);
  const supporte = await page.evaluate(() => !!(window.passioMapSupported && window.passioMapSupported()));
  test.skip(!supporte, "WebGL indisponible : la carte ne se construit pas");
  await page.evaluate((evs) => { state.seed.events = evs; state.userEvents = []; window._irlMapSig = null; renderIRL(); }, evs);
  await page.locator('[data-v4a3-onglet="carte"]').click();
  await page.waitForFunction(() => typeof irlMap !== "undefined" && !!irlMap, null, { timeout: 30000 });
  await page.evaluate(() => selectIrlCity("annecy", "Annecy"));
  await page.waitForFunction(() => document.querySelectorAll("#irlMap .passio-marker").length > 0, null, { timeout: 15000 });
  await pause(500);
}
// Ouvre la bulle d'un marqueur (repéré par son texte) comme le ferait un toucher :
// la carte, rangée sous les boutons flottants, ne se laisse pas toujours viser.
const ouvrirBulle = (page, texte) => page.evaluate((texte) => {
  const mk = irlMap._markers.find((m) => (m.getElement().textContent || "").includes(texte));
  if (!mk) throw new Error("marqueur introuvable : " + texte);
  if (!mk.getPopup().isOpen()) mk.togglePopup();
}, texte);
const vueCarte = (page) => page.evaluate(() => { const c = irlMap.getCenter(); return { lat: c.lat, lng: c.lng, z: irlMap.getZoom() }; });

const PROCHES = () => [
  ACT("ev_a", "Jam au lac", 45.92, 6.15, 1),
  ACT("ev_b", "Atelier chant", 45.86, 6.08, 2, { emoji: "🎤" }),
  ACT("ev_c", "Scène ouverte", 45.95, 6.2, 3, { emoji: "🦄" }),
];

test.describe("Rencontrer — l'écran", () => {
  test("① 103 : « 10 km » sans ville ni position ne filtre pas autour de Paris — il demande d'abord le centre", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    const total = await page.evaluate(() => _filterIrlEvents(allEvents()).length);
    await page.locator("#irlToolsBtn").click();
    await expect.poll(() => page.evaluate(() => window.PassioUIV4A5 && PassioUIV4A5.isOpen())).toBe(true);
    await page.locator('[data-v4a5-dist="10"]').click();
    expect(await page.evaluate(() => irlDistanceValue())).toBe("");
    expect(await page.evaluate(() => _filterIrlEvents(allEvents()).length)).toBe(total);
    expect((await toasts(page)).join(" | ")).toContain("Choisis d'abord une ville");
    await expect(page.locator("#irlCitySearchInput")).toBeVisible();
    // Avec un vrai centre, le palier filtre autour de LUI.
    await page.evaluate(() => { selectIrlCity("lyon", "Lyon"); setIrlDistanceKm(10); });
    const loin = await page.evaluate((l) => _filterIrlEvents(allEvents()).map(eventLatLng).filter(Boolean)
      .filter((p) => calculateDistance(l[0], l[1], p[0], p[1]) > 10).length, LYON);
    expect(await page.evaluate(() => irlDistanceValue())).toBe("10");
    expect(loin).toBe(0);
  });

  test("② 103 : sans géolocalisation, le repli Paris n'est pas « Position actuelle »", async ({ page }) => {
    await boot(page, { geoAbsente: true });
    await ouvrirIrl(page);
    await page.evaluate(() => useMyPositionForIrl());
    const r = await page.evaluate(() => ({ reelle: _irlAReferenceReelle(), lieu: irlLieuReference() }));
    expect(r.reelle).toBe(false);
    expect(r.lieu.sub).not.toBe("Position actuelle");
    expect((await toasts(page)).join(" | ")).toContain("Position indisponible");
  });

  test("③ 102 : après un délai puis un refus, « Utiliser ma position » redemande — et dit la vraie cause", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await page.evaluate((l) => { window.__geo.plan = [{ code: 3 }, { code: 1 }, { lat: l[0], lng: l[1] }]; }, LYON);
    await page.evaluate(() => useMyPositionForIrl());
    await expect.poll(() => page.evaluate(() => irlUserLocationError)).toBe(true);
    await page.evaluate(() => useMyPositionForIrl());
    await expect.poll(() => page.evaluate(() => window.__geo.appels)).toBe(2);
    await expect.poll(async () => (await toasts(page)).join(" | ")).toContain("Position refusée");
    await page.evaluate(() => useMyPositionForIrl());
    await expect.poll(() => page.evaluate(() => irlLieuReference().sub)).toBe("Position actuelle");
    const r = await page.evaluate(() => ({ appels: window.__geo.appels, loc: irlUserLocation, reelle: _irlAReferenceReelle() }));
    expect(r.appels).toBe(3);
    expect(r.reelle).toBe(true);
    expect(Math.abs(r.loc.lat - LYON[0])).toBeLessThan(0.01);
  });

  test("④ 127 : lot UI-4A0 coupé, ouvrir et filtrer Rencontrer ne demande pas la position", async ({ page }) => {
    await boot(page, { initScript: () => localStorage.setItem("passio_ui_4a0", "0") });
    await page.evaluate(() => { irlUserLocation = null; window.__geo.appels = 0; });
    await ouvrirIrl(page);
    await page.evaluate(() => { renderIRL(); irlDateFilters.add("week"); renderIRL(); irlDateFilters.clear(); renderIRL(); });
    await pause(1200);
    expect(await page.evaluate(() => window.__geo.appels)).toBe(0);
    // Le geste explicite, lui, demande : exactement une fois.
    await page.evaluate(() => useMyPositionForIrl());
    await expect.poll(() => page.evaluate(() => window.__geo.appels)).toBe(1);
  });

  test("⑤ 101 : la carte garde le zoom choisi à la main, et suit la ville choisie", async ({ page }) => {
    await boot(page);
    await carteAnnecy(page, PROCHES());
    // Zoom de la personne (événement d'origine = geste).
    await page.evaluate(() => irlMap._map.jumpTo({ center: [6.13, 45.9], zoom: irlMap._map.getZoom() + 2 }, { originalEvent: new WheelEvent("wheel") }));
    const avant = await vueCarte(page);
    await page.evaluate(() => renderIRL());
    await pause(900);
    const apres = await vueCarte(page);
    expect(Math.abs(apres.z - avant.z), "zoom manuel conservé après un rendu").toBeLessThan(0.05);
    expect(Math.abs(apres.lat - avant.lat)).toBeLessThan(0.01);
    await page.evaluate(() => selectIrlCity("bordeaux", "Bordeaux"));
    await pause(900);
    const bdx = await vueCarte(page);
    expect(Math.abs(bdx.lat - BORDEAUX[0]), "centrée sur Bordeaux").toBeLessThan(0.05);
    expect(Math.abs(bdx.lng - BORDEAUX[1])).toBeLessThan(0.05);
    // Non-régression des cartes de MODALE : conteneur agrandi après le cadrage → recadré.
    const z = await page.evaluate(async () => {
      const d = document.createElement("div");
      d.style.cssText = "position:fixed;left:0;top:0;width:60px;height:60px;";
      document.body.appendChild(d);
      const m = L.map(d, { zoomControl: false });
      m.fitBounds(L.latLngBounds([[45.0, 5.0], [45.2, 5.3]]), { padding: [4, 4] });
      const z0 = m.getZoom();
      d.style.width = "400px"; d.style.height = "400px";
      m.invalidateSize();
      const z1 = m.getZoom();
      m.remove(); d.remove();
      return { z0, z1 };
    });
    expect(z.z1).toBeGreaterThan(z.z0);
  });

  test("⑥ 121 : la vue Filtre est dans l'historique — le retour la referme et rend la Carte", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => goTo("feed"));
    await ouvrirIrl(page);
    await page.locator("#irlToolsBtn").click();
    await expect.poll(() => page.evaluate(() => PassioUIV4A5.isOpen())).toBe(true);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => PassioUIV4A5.isOpen())).toBe(false);
    expect(await page.evaluate(() => ({ irl: document.getElementById("screen-irl").classList.contains("active"), h: location.hash })))
      .toEqual({ irl: true, h: "#irl" });
    await page.goBack();
    await expect.poll(() => page.evaluate(() => document.getElementById("screen-feed").classList.contains("active"))).toBe(true);
    // Depuis la Carte : ouvrir puis fermer (retour) rend la Carte.
    await ouvrirIrl(page);
    await page.locator('[data-v4a3-onglet="carte"]').click();
    await page.locator("#irlToolsBtn").click();
    await expect.poll(() => page.evaluate(() => PassioUIV4A5.isOpen())).toBe(true);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => PassioUIV4A5.isOpen())).toBe(false);
    expect(await page.evaluate(() => PassioUIV4A3.vue())).toBe("carte");
  });

  test("⑯ 122 : Échap en plein écran de carte ne laisse pas d'entrée d'historique morte", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => goTo("feed"));
    await ouvrirIrl(page);
    await page.locator('[data-v4a3-onglet="carte"]').click();
    await page.locator("#irlMapExpandBtn").click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#carte");
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#irl");
    expect(await page.evaluate(() => document.getElementById("irlMapWrap").classList.contains("fullscreen"))).toBe(false);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => document.getElementById("screen-feed").classList.contains("active"))).toBe(true);
  });

  test("⑬ 118 + ⑭ 112 : la bulle suit la modification ; la bulle groupée dit « exemple »", async ({ page }) => {
    await boot(page);
    const demo = await page.evaluate(() => (state.seed.events || []).filter((e) => PassioFirstRun.masquerChiffresDemo(e)).slice(0, 2).map((e) => e.id));
    test.skip(demo.length < 2, "pas d'activités d'exemple signalées");
    const evs = await page.evaluate(([ids, base]) => {
      const ex = state.seed.events.filter((e) => ids.includes(e.id)).map((e) => Object.assign({}, e, { lat: 45.88, lng: 6.17, date: Date.now() + 5 * 86400000, status: "active" }));
      return base.concat(ex);
    }, [demo, PROCHES()]);
    await carteAnnecy(page, evs);
    // ⑬ titre modifié, mêmes ids → la bulle montre le nouveau titre.
    await page.evaluate(() => { const e = state.seed.events.find((x) => x.id === "ev_c"); e.title = "Scène ouverte DÉPLACÉE"; renderIRL(); updateIrlMapMarkers(); });
    await pause(400);
    await ouvrirBulle(page, "🦄");
    await expect(page.locator(".maplibregl-popup .irl-popup-title")).toHaveText("Scène ouverte DÉPLACÉE");
    await page.evaluate(() => irlMap.closePopup());
    // ⑭ pastille groupée d'exemples.
    await ouvrirBulle(page, "2");
    const meta = await page.locator(".maplibregl-popup .irl-popup-ligne-meta").allTextContents();
    expect(meta.length).toBe(2);
    for (const m of meta) expect(m).toContain("Exemple");
  });

  test("⑮ 114 : l'attribution OpenStreetMap est visible en vue Carte", async ({ page }) => {
    await boot(page);
    await carteAnnecy(page, PROCHES());
    const a = await page.evaluate(() => {
      const el = document.querySelector("#irlMapWrap .maplibregl-ctrl-attrib");
      const r = el.getBoundingClientRect(), w = document.getElementById("irlMapWrap").getBoundingClientRect();
      return { d: getComputedStyle(el).display, txt: el.textContent, larg: r.width, dedans: r.left >= w.left - 1 && r.right <= w.right + 1 && r.bottom <= w.bottom + 1 };
    });
    expect(a.d).not.toBe("none");
    expect(a.txt).toContain("OpenStreetMap");
    expect(a.larg).toBeGreaterThan(0);
    expect(a.dedans).toBe(true);
  });

  test("⑫ 108 : la recherche d'adresse de l'épingle suggère en tapant et cherche sur Entrée", async ({ page }) => {
    await boot(page);
    await carteAnnecy(page, [ACT("ev_loin", "Loin", 43.3, 5.4, 2)]);
    await page.evaluate(() => {
      window.__suggest = [];
      window.passioGeoSuggest = async (q) => { window.__suggest.push(q); return [{ name: "10 rue Royale", lat: 45.9, lng: 6.12, city: "Annecy" }]; };
      window.passioGeocode = async (q) => ({ name: q, city: "Annecy", lat: 45.9, lng: 6.12 });
    });
    await ouvrirBulle(page, "📍");
    const champ = page.locator("#irlAddressInput");
    await expect(champ).toBeVisible();
    await champ.fill("10 rue");
    await expect.poll(() => page.evaluate(() => window.__suggest.length)).toBeGreaterThan(0);
    await expect(page.locator("#irlAddressSuggestions")).toBeVisible();
    await champ.press("Enter");
    await expect.poll(async () => (await toasts(page)).join(" | ")).toContain("Autour de Annecy");
  });

  test("⑩ 115 : en vue Liste MapLibre n'est pas chargé ; la vue Carte le charge ; un échec se retente", async ({ page }) => {
    const charges = [];
    let couper = 1;
    await page.route(/maplibre-gl-[0-9.]+\.js/, (route) => {
      charges.push(route.request().url());
      if (couper > 0) { couper--; return route.abort(); }
      return route.fallback();
    });
    await boot(page);
    await ouvrirIrl(page);
    await pause(1500);
    expect(await page.evaluate(() => PassioUIV4A3.vue())).toBe("liste");
    expect(charges.length, "aucun chargement de MapLibre en vue Liste").toBe(0);
    expect(await page.evaluate(() => typeof window.maplibregl)).toBe("undefined");
    const supporte = await page.evaluate(() => !!(window.passioMapSupported && window.passioMapSupported()));
    test.skip(!supporte, "WebGL indisponible");
    // Premier essai coupé (réseau), second essai : la carte arrive.
    const e1 = await page.evaluate(() => ensureLeaflet().then(() => "ok", () => "echec"));
    expect(e1, JSON.stringify(charges)).toBe("echec");
    const e2 = await page.evaluate(() => ensureLeaflet().then(() => "ok", () => "echec"));
    expect(e2).toBe("ok");
    await page.locator('[data-v4a3-onglet="carte"]').click();
    await expect(page.locator("#irlMap canvas")).toHaveCount(1, { timeout: 30000 });
  });

  test("⑪ 107 : une panne du géocodeur n'est pas mise en cache comme « rien trouvé »", async ({ page }) => {
    let enPanne = true;
    await page.route(/api-adresse\.data\.gouv\.fr|photon\.komoot\.io/, (route) => {
      if (enPanne) return route.abort("internetdisconnected");
      if (/photon/.test(route.request().url())) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ features: [] }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ features: [
        { geometry: { coordinates: [5.02, 44.73] }, properties: { label: "Crest", name: "Crest", city: "Crest", postcode: "26400" } }] }) });
    });
    await boot(page);
    const r1 = await page.evaluate(() => passioGeoSuggest("Crest", 6));
    expect(r1).toEqual([]);
    expect(await page.evaluate(() => (localStorage.getItem("passio_geo_cache_v1") || "").includes("s:crest:6"))).toBe(false);
    enPanne = false;
    const r2 = await page.evaluate(() => passioGeoSuggest("Crest", 6));
    expect(r2.map((x) => x.city)).toEqual(["Crest"]);
  });

  test("⑰ 109 / 110 / 111 / 124 : semaine, plages horaires, accents, minuteur de recherche, pastilles", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    const r = await page.evaluate(() => {
      const base = (id, extra) => Object.assign({ id, title: id, passion: "musique", city: "Annecy", lat: 45.9, lng: 6.12, attendees: [], maybes: [], waitlist: [], checkedIn: [], organizerId: "x", status: "active" }, extra);
      const auj = (h, m) => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(h, m, 0, 0); return d.getTime(); };
      state.seed.events = [
        base("en_cours", { date: Date.now() - 30 * 60000, endAt: Date.now() + 90 * 60000, time: "" }),
        base("dans_8j", { date: Date.now() + 8 * 86400000, time: "10:00" }),
        base("h1230", { date: auj(12, 30), time: "12:30" }),
        base("h1200", { date: auj(12, 0), time: "12:00" }),
        base("h2330", { date: auj(23, 30), time: "23:30" }),
        base("nimes", { city: "Nîmes", date: Date.now() + 3 * 86400000, time: "10:00" }),
        base("annulee40", { date: Date.now() + 40 * 86400000, time: "10:00", status: "cancelled" }),
      ];
      state.userEvents = [];
      const ids = () => _filterIrlEvents(allEvents()).map((e) => e.id);
      clearAllIrlFilters();
      irlDateFilters.add("week");
      const semaine = ids();
      clearAllIrlFilters();
      setIrlTimePreset(6, 12);
      const matin = ids();
      clearAllIrlFilters();
      setIrlTimePreset(18, 23);
      const soir = ids();
      clearAllIrlFilters();
      irlSearchQuery = "nimes";
      const accents = ids();
      clearAllIrlFilters();
      const d40 = new Date(Date.now() + 40 * 86400000);
      const pastilleAnnulee = !!_irlEventDaySet()[new Date(d40.getFullYear(), d40.getMonth(), d40.getDate()).getTime()];
      return { semaine, matin, soir, accents, pastilleAnnulee };
    });
    expect(r.semaine).toContain("en_cours");
    expect(r.semaine).not.toContain("dans_8j");
    expect(r.matin).not.toContain("h1230");
    expect(r.matin).not.toContain("h1200");
    expect(r.soir).toContain("h2330");
    expect(r.accents).toEqual(["nimes"]);
    expect(r.pastilleAnnulee).toBe(false);
    // Minuteur : une frappe en attente ne repose pas la recherche après « Tout effacer ».
    await page.evaluate(() => { const c = document.getElementById("irlCitySearch"); c.value = "zzzzqq"; filterIrlByCity(); clearAllIrlFilters(); });
    await pause(500);
    expect(await page.evaluate(() => irlSearchQuery)).toBe("");
  });

  test("⑱ 119 / 120 : « Mes passions » sans passion ne vide rien ; Entrée à vide ne choisit pas Bordeaux", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    const r = await page.evaluate(() => {
      window._irlMyPassions = () => [];
      irlPassionFilterSet().clear(); irlPassionFilterSet().add("photo");
      setIrlPassionsMiennes();
      return [...irlPassionFilterSet()];
    });
    expect(r).toEqual(["photo"]);
    expect((await toasts(page)).join(" | ")).toContain("pas encore de passion");
    await page.evaluate(() => { irlPassionFilterSet().clear(); openIrlCitySelector(); });
    await expect(page.locator("#irlCitySearchInput")).toBeVisible();
    await pause(200);
    await page.locator("#irlCitySearchInput").press("Enter");
    await pause(300);
    expect(await page.evaluate(() => irlSelectedCityName())).toBe("");
    await expect(page.locator("#irlCitySearchInput")).toBeVisible();
  });

  test("⑱ 126 : sans sélecteur de passions, la case « Chercher » de la vue Filtre n'est pas proposée", async ({ page }) => {
    await boot(page, { initScript: () => localStorage.setItem("flat_passions_v1", "0") });
    await ouvrirIrl(page);
    await page.locator("#irlToolsBtn").click();
    await expect.poll(() => page.evaluate(() => PassioUIV4A5.isOpen())).toBe(true);
    await expect(page.locator('[data-v4a5-passions="miennes"]')).toBeVisible();
    await expect(page.locator('[data-v4a5-passions="chercher"]')).toBeHidden();
  });

  test("⑲ 131 : plus de globale de test qui écrit de fausses activités", async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => [typeof window.testIrlDistance, typeof window.openIrlCalendar, typeof window.applyIrlCalendar]))
      .toEqual(["undefined", "undefined", "undefined"]);
  });
});

// ── Faux serveur : le catalogue, ses échecs, ses lectures ────────────────────
const ORGA = "aaaaaaaa-0000-4000-8000-000000000041";
const B = "bbbbbbbb-0000-4000-8000-000000000042";
const iso = (ms) => new Date(ms).toISOString().replace("Z", "");

function activite(id, { titre, dans, creeIlYa, statut = "active" }) {
  return { id, author_id: ORGA, organizer_id: ORGA, title: titre, passion_id: "musique", city: "Annecy", emoji: "🎸",
    max_attendees: 10, date_at: iso(Date.now() + dans), status: statut, co_organizers: [], visibilite: "publique",
    created_at: iso(Date.now() - creeIlYa), lat: 45.9, lng: 6.12 };
}

async function ouvrirB(browser, srv) {
  const ctx = await browser.newContext();
  const o = await ouvrirCompte(ctx, srv, B, { nom: "bob_ecr" });
  await o.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
  return { ctx, page: o.page };
}

test.describe("Rencontrer — le catalogue (faux serveur)", () => {
  test("⑦ 105 : une sortie à venir publiée tôt reste au catalogue après 60 créations", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_ecr"); srv.compte(B, "bob_ecr");
    const JOUR = 86400000;
    srv.t.events.push(activite("ev-concert-tot", { titre: "Concert publié tôt", dans: 3 * JOUR, creeIlYa: 40 * JOUR }));
    for (let i = 0; i < 60; i++) {
      srv.t.events.push(activite("ev-ancienne-" + i, { titre: "Ancienne " + i, dans: -(5 + i) * JOUR, creeIlYa: (30 - i * 0.4) * JOUR,
        statut: i % 3 === 0 ? "cancelled" : "active" }));
    }
    const { ctx, page } = await ouvrirB(browser, srv);
    await page.evaluate(() => goTo("irl"));
    await page.evaluate(() => rafraichirEvenements(true));
    await expect.poll(() => page.evaluate(() => allEvents().some((e) => e.id === "ev-concert-tot"))).toBe(true);
    await expect(page.locator("#eventList")).toContainText("Concert publié tôt");
    await ctx.close();
  });

  test("⑧ 128 : un échec de lecture des activités se dit, et « Réessayer » relit", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_ecr"); srv.compte(B, "bob_ecr");
    srv.t.events.push(activite("ev-atelier-a", { titre: "Atelier A", dans: 2 * 86400000, creeIlYa: 3600000 }));
    const { ctx, page } = await ouvrirB(browser, srv);
    srv.pannes.push({ table: "events", methode: "GET", status: 500, fois: 50 });
    await page.evaluate(() => goTo("irl"));
    await page.evaluate(() => rafraichirEvenements(true));
    await expect(page.locator("#irlAvisLecture")).toBeVisible();
    srv.pannes.length = 0;
    // Clic en page : la liste se repeint sous le pointeur (l'avis est reposé à chaque rendu).
    await page.evaluate(() => document.querySelector("#irlAvisLecture button").click());
    await expect(page.locator("#irlAvisLecture")).toHaveCount(0);
    await expect(page.locator("#eventList")).toContainText("Atelier A");
    await ctx.close();
  });

  test("⑨ 116 : rendre la liste cinq fois ne relit pas cinq fois commentaires et réactions", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_ecr"); srv.compte(B, "bob_ecr");
    for (const n of [1, 2, 3]) srv.t.events.push(activite("ev-reel-" + n, { titre: "Réelle " + n, dans: n * 86400000, creeIlYa: 3600000 * n }));
    const { ctx, page } = await ouvrirB(browser, srv);
    await page.evaluate(() => goTo("irl"));
    await page.evaluate(() => rafraichirEvenements(true));
    await expect(page.locator("#eventList")).toContainText("Réelle 1");
    await pause(1200);
    const lectures = () => srv.journal.filter((r) => r.m === "GET" && (r.table === "event_reactions" || r.table === "event_comments")).length;
    const avant = lectures();
    await page.evaluate(() => { for (let i = 0; i < 5; i++) renderIRL(); });
    await pause(1200);
    expect(lectures() - avant, "aucune relecture : mêmes activités, lues il y a moins de 30 s").toBe(0);
    // Écran masqué (rendu de fond depuis le Fil) : aucune lecture.
    await page.evaluate(() => goTo("feed"));
    const avantFil = lectures();
    await page.evaluate(() => renderIRL());
    await pause(1000);
    expect(lectures() - avantFil).toBe(0);
    await ctx.close();
  });
});
