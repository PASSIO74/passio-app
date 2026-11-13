// ═══════════════════════════════════════════════════════════════════════════
// LOT-36 (audit UX/UI du 2026-11-10) — RENCONTRER : LIEUX ET CARTE
//   ① IRL-C18 : « Autres communes » ne montre que des communes dont le NOM
//      contient la saisie ; une faute de frappe sans résultat local garde la
//      réponse du géocodeur.
//   ② IRL-C15 : trois activités au même lieu → UNE pastille « 3 », dont la bulle
//      les liste toutes.
//   ③ IRL-C15 : fond de carte refusé → un message sur la carte, pas un gris muet.
// Compte de démonstration local, géocodage et réseau de la carte simulés.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function bootIrl(page, geo) {
  await bootOnboarded(page);
  await page.evaluate((reponses) => {
    window.supaLoadPosts = async () => [];
    window.passioGeoSuggest = async (q) => (reponses[String(q).toLowerCase()] || []);
    window.irlUserLocation = { lat: 48.8566, lng: 2.3522 };
  }, geo || {});
  await page.evaluate(() => goTo("irl"));
  await page.waitForFunction(() => document.getElementById("screen-irl")?.classList.contains("active"));
}

test("① IRL-C18 : seules les communes qui contiennent la saisie", async ({ page }) => {
  await bootIrl(page, {
    grenoble: [{ city: "Le Boupère", lat: 46.79, lng: -0.93 }, { city: "Arcisses", lat: 48.3, lng: 0.8 }],
    bouperre: [{ city: "Le Boupère", lat: 46.79, lng: -0.93 }],
    vinou: [{ city: "Saint-Martin-le-Vinoux", lat: 45.2, lng: 5.7 }, { city: "Aulnay-sous-Bois", lat: 48.9, lng: 2.5 }],
  });
  await page.evaluate(() => openIrlCitySelector());
  const remote = page.locator("#irlCityRemote");
  const saisir = async (t) => {
    await page.locator("#irlCitySearchInput").fill(t);
    await page.waitForTimeout(650);
    return (await remote.textContent()) || "";
  };
  const g = await saisir("grenoble");
  expect(g).not.toContain("Le Boupère");
  expect(g).not.toContain("Arcisses");
  const v = await saisir("vinou");
  expect(v).toContain("Saint-Martin-le-Vinoux");
  expect(v).not.toContain("Aulnay-sous-Bois");
  // Faute de frappe, rien en local : la réponse du géocodeur reste proposée.
  const f = await saisir("bouperre");
  expect(f).toContain("Le Boupère");
});

const ACTIVITE = (id, titre, lat, lng, j) => ({
  id, title: titre, passion: "musique", emoji: "", city: "Paris", lat, lng,
  date: Date.now() + j * 86400000, time: "18:00", desc: "", attendees: [], maybes: [],
  waitlist: [], checkedIn: [], organizerId: "someone_else", status: "active",
});

test("② IRL-C15 : un même lieu = une pastille chiffrée qui liste ses activités", async ({ page }) => {
  await bootIrl(page);
  const supporte = await page.evaluate(() => !!(window.passioMapSupported && window.passioMapSupported()));
  test.skip(!supporte, "WebGL indisponible : la carte ne se construit pas");
  const r = await page.evaluate(async (evs) => {
    state.seed.events = evs; state.userEvents = [];
    window._irlMapSig = null;
    renderIRL();
    await window.ensureLeaflet();
    initIrlMap();
    await new Promise((res) => setTimeout(res, 200));
    updateIrlMapMarkers();
    await new Promise((res) => setTimeout(res, 300));
    const marqueurs = [...document.querySelectorAll("#irlMap .passio-marker")];
    const groupe = document.querySelector("#irlMap .passio-marker-groupe");
    groupe.closest(".maplibregl-marker, .passio-marker-wrap").click();
    await new Promise((res) => setTimeout(res, 200));
    const lignes = [...document.querySelectorAll(".maplibregl-popup .irl-popup-ligne-titre")].map((x) => x.textContent);
    return { n: marqueurs.length, texte: groupe.textContent, nom: groupe.getAttribute("aria-label"), lignes };
  }, [
    ACTIVITE("ev_a", "Jam du mardi", 48.8566, 2.3522, 1),
    ACTIVITE("ev_b", "Atelier chant", 48.8566, 2.3522, 2),
    ACTIVITE("ev_c", "Scène ouverte", 48.85661, 2.35221, 3),
    ACTIVITE("ev_d", "Concert au parc", 48.88, 2.40, 4),
  ]);
  expect(r.n).toBe(2);
  expect(r.texte).toBe("3");
  expect(r.nom).toBe("3 activités à cet endroit");
  expect(r.lignes.sort()).toEqual(["Atelier chant", "Jam du mardi", "Scène ouverte"]);
});

test("③ IRL-C15 : fond de carte refusé → la carte le dit", async ({ page }) => {
  await page.route("**/tiles.openfreemap.org/**", (route) => route.abort());
  await bootIrl(page);
  const supporte = await page.evaluate(() => !!(window.passioMapSupported && window.passioMapSupported()));
  test.skip(!supporte, "WebGL indisponible : la carte ne se construit pas");
  await page.evaluate(async () => { await window.ensureLeaflet(); initIrlMap(); });
  const msg = page.locator("#irlMap .irl-map-tuiles");
  await expect(msg).toHaveCount(1, { timeout: 8000 });
  await expect(msg).toContainText("Le fond de carte ne charge pas");
  await expect(msg).toHaveAttribute("role", "status");
});
