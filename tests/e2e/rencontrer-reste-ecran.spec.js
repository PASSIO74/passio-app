// Rencontrer — les derniers défauts de l'ÉCRAN (2026-11-27), après
// rencontrer-ecran.spec.js. Navigateur seul (état local), fond de carte,
// géocodeur et réglages distants simulés. AUCUNE écriture réelle.
//
// Défauts fermés (numéros du dossier de correction ECR), chacun ROUGE sur le
// code d'avant :
//   ①  113 — distance « 411 m » affichée à qui se tenait SUR le lieu, alors que
//            la base arrondit les coordonnées à 0,01° (~1 km).
//   ②  113 — deux lieux distants de 800 m, arrondis au même point, annoncés
//            « 2 activités à cet endroit ».
//   ③  120 — le sélecteur de ville proposait des quartiers (« Mitte »,
//            « Côte De Granit Rose ») ; la position à Lisbonne s'appelait
//            « Alfama » ; la commune cherchée à la BAN prenait les coordonnées
//            d'une rue (aucun `type=municipality`).
//   ④  122 — changer d'écran carte en plein écran laissait la classe posée.
//   ⑤  126 — une coupure distante en cours de session ne déposait pas les lots :
//            calendrier et passions restaient dans le panneau caché d'UI-4A5,
//            le commutateur d'UI-4A3 restait en place.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ serviceWorkers: "block" });

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const STYLE_VIDE = JSON.stringify({ version: 8, sources: {}, layers: [] });

async function boot(page, opts = {}) {
  await page.route(/tiles\.openfreemap\.org/, (route) => (/styles/.test(route.request().url())
    ? route.fulfill({ status: 200, contentType: "application/json", body: STYLE_VIDE })
    : route.fulfill({ status: 204, body: "" })));
  await page.addInitScript(() => {
    // Aucune demande de position réelle : la suite ne parle pas de géolocalisation.
    Object.defineProperty(Navigator.prototype, "geolocation", { configurable: true, get: () => ({
      getCurrentPosition(ok, ko) { setTimeout(() => ko({ code: 1, message: "simulé" }), 5); },
      watchPosition() { return 1; }, clearWatch() {},
    }) });
  });
  if (opts.initScript) await page.addInitScript(opts.initScript);
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.__toasts = [];
    const t = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); };
  });
}
const ouvrirIrl = async (page) => {
  await page.evaluate(() => goTo("irl"));
  await page.waitForFunction(() => document.getElementById("screen-irl")?.classList.contains("active"));
};

const ACT = (id, titre, lat, lng, j, extra = {}) => Object.assign({
  id, title: titre, passion: "musique", emoji: "🎸", city: "Paris", lat, lng,
  date: Date.now() + j * 86400000, time: "18:00", desc: "", attendees: [], maybes: [],
  waitlist: [], checkedIn: [], organizerId: "quelqu_un", status: "active",
}, extra);

test.describe("Rencontrer — le reste de l'écran", () => {
  test("① 113 : sous le kilomètre, la distance à une activité ne se dit pas au mètre", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    const r = await page.evaluate((evs) => {
      state.seed.events = evs; state.userEvents = [];
      // La personne se tient SUR le lieu réel ; la base a stocké 48.86 / 2.35.
      selectIrlGeoCity("Paris", 48.8566, 2.3522);
      renderIRL();
      return document.getElementById("eventList").innerText;
    }, [ACT("ev_hdv", "Jam à l'Hôtel de Ville", 48.86, 2.35, 1)]);
    expect(r).toContain("Jam à l'Hôtel de Ville");
    expect(r).not.toMatch(/\b\d+ m\b/);
    expect(r).toContain("moins d'1 km");
  });

  test("② 113 : deux activités arrondies au même point sont « dans ce secteur », pas « à cet endroit »", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    const supporte = await page.evaluate(() => !!(window.passioMapSupported && window.passioMapSupported()));
    test.skip(!supporte, "WebGL indisponible : la carte ne se construit pas");
    await page.evaluate((evs) => { state.seed.events = evs; state.userEvents = []; window._irlMapSig = null; renderIRL(); },
      [ACT("ev_a", "Place de l'Hôtel de Ville", 48.86, 2.35, 1), ACT("ev_b", "780 m plus au nord", 48.86, 2.35, 2)]);
    await page.locator('[data-v4a3-onglet="carte"]').click();
    await page.waitForFunction(() => typeof irlMap !== "undefined" && !!irlMap, null, { timeout: 30000 });
    await page.evaluate(() => selectIrlGeoCity("Paris", 48.8566, 2.3522));
    await page.waitForFunction(() => !!document.querySelector("#irlMap .passio-marker-groupe"), null, { timeout: 15000 });
    const nom = await page.evaluate(() => document.querySelector("#irlMap .passio-marker-groupe").getAttribute("aria-label"));
    expect(nom).toBe("2 activités dans ce secteur");
  });

  test("③ 120 : le sélecteur ne propose que des communes", async ({ page }) => {
    await boot(page);
    const urls = [];
    await page.route(/api-adresse\.data\.gouv\.fr\/search/, (route) => {
      urls.push(route.request().url());
      // Une RUE d'abord (ce que renvoie la BAN sans filtre de type), puis la commune.
      const tout = !/type=municipality/.test(route.request().url());
      const features = (tout ? [{ properties: { type: "street", name: "Rue de Meylanville", city: "Meylanville" }, geometry: { coordinates: [5.77, 45.21] } }] : [])
        .concat([{ properties: { type: "municipality", name: "Meylanville", city: "Meylanville" }, geometry: { coordinates: [5.778, 45.209] } }]);
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ features: features.slice(0, 1) }) });
    });
    await page.route(/photon\.komoot\.io/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"features":[]}' }));
    await ouvrirIrl(page);
    const dico = await page.evaluate(() => ({
      liste: _irlCityList().map((c) => c.name),
      lisbonne: getClosestCity(38.7118, -9.13),
      bretagne: getClosestCity(48.83, -3.49),
    }));
    for (const quartier of ["Mitte", "Alfama", "Souks", "Côte De Granit Rose", "Pointe Du Raz"]) expect(dico.liste).not.toContain(quartier);
    expect(dico.liste).toContain("Lisbonne");
    expect(dico.lisbonne).toBe("Lisbonne");
    expect(dico.bretagne).toBe("Perros-Guirec");
    // La recherche d'une commune hors dictionnaire demande une COMMUNE à la BAN,
    // et la commune proposée porte ses propres coordonnées.
    await page.evaluate(() => openIrlCitySelector());
    const champ = page.locator("#irlCitySearchInput");
    await expect(champ).toBeVisible();
    await champ.fill("Meylanville");
    const bouton = page.locator("#irlCityRemote button", { hasText: "Meylanville" });
    await expect(bouton).toBeVisible({ timeout: 10000 });
    expect(urls.some((u) => /type=municipality/.test(u))).toBe(true);
    expect(await bouton.getAttribute("onclick")).toContain("45.209");
    await champ.fill("mitte");
    await pause(500);
    expect(await page.locator("#irlCitiesGrid button:visible", { hasText: /^Mitte$/ }).count()).toBe(0);
  });

  test("④ 122 : quitter Rencontrer carte en plein écran referme le plein écran", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await page.locator('[data-v4a3-onglet="carte"]').click();
    await page.locator("#irlMapExpandBtn").click();
    await expect.poll(() => page.evaluate(() => document.getElementById("irlMapWrap").classList.contains("fullscreen"))).toBe(true);
    // Une porte extérieure (notification, lien) change d'écran.
    await page.evaluate(() => goTo("feed"));
    expect(await page.evaluate(() => document.getElementById("irlMapWrap").classList.contains("fullscreen"))).toBe(false);
    await ouvrirIrl(page);
    expect(await page.evaluate(() => ({
      plein: document.getElementById("irlMapWrap").classList.contains("fullscreen"),
      libelle: document.getElementById("irlMapExpandBtn").getAttribute("aria-label"),
    }))).toEqual({ plein: false, libelle: "Carte en plein écran" });
  });

  test("⑤ 126 : une coupure distante en cours de session dépose UI-4A5 et UI-4A3 proprement, la levée les repose", async ({ page }) => {
    let coupures = [];
    await boot(page, { initScript: () => { window.PASSIO_REGLAGES_DISTANTS = true; } });
    await page.route(/\/rest\/v1\/reglages_distants/, (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(coupures.length ? [{ cle: "coupures", valeur: { cles: coupures }, maj: "t1" }] : []),
    }));
    await ouvrirIrl(page);
    // Lots posés : le calendrier vit dans la vue Filtre, le déclencheur dans le commutateur.
    await page.locator("#irlToolsBtn").click();
    await expect.poll(() => page.evaluate(() => PassioUIV4A5.isOpen())).toBe(true);
    await page.evaluate(() => PassioUIV4A5.close && PassioUIV4A5.close());
    await expect.poll(() => page.evaluate(() => !!document.querySelector("#v4a3Vue #irlToolsBtn"))).toBe(true);
    expect(await page.evaluate(() => !!document.getElementById("irlPaneDate").closest("#v4a5Avance"))).toBe(true);

    // L'opérateur coupe UI-4A5 et UI-4A3 depuis le pilotage, appli ouverte.
    coupures = ["passio_ui_4a5", "passio_ui_4a3"];
    expect(await page.evaluate(() => PassioReglages.rafraichir(true))).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("passio_ui_4a5"))).toBe("0");
    await expect.poll(() => page.evaluate(() => {
      const date = document.getElementById("irlPaneDate");
      const passions = document.getElementById("irlPassionRow");
      const btn = document.getElementById("irlToolsBtn");
      return {
        dateDansLeDialogue: !!(date && date.closest("#irlFiltersPanel") && !date.closest("#v4a5Avance")),
        passionsRendues: !!(passions && !passions.closest("#v4a5Passions")),
        commutateur: !!document.getElementById("v4a3Vue"),
        attrVue: document.documentElement.hasAttribute("data-v4a3-vue"),
        declencheur: !!(btn && btn.isConnected && btn.offsetParent !== null),
      };
    })).toEqual({ dateDansLeDialogue: true, passionsRendues: true, commutateur: false, attrVue: false, declencheur: true });

    // La coupure est levée : les lots se reposent.
    coupures = [];
    expect(await page.evaluate(() => PassioReglages.rafraichir(true))).toBe(true);
    await expect.poll(() => page.evaluate(() => !!document.querySelector("#v4a3Vue #irlToolsBtn"))).toBe(true);
  });
});
