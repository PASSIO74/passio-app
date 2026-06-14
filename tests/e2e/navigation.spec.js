// Missions 1c + 5 — tour complet des écrans : zéro erreur JS, écran actif,
// navigation rapide, bottom-nav cohérente. Entre dans l'app via un état
// local onboardé (pas de compte réel créé : CI-safe).
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

const SCREENS = ["feed", "profiles", "studio", "explore", "irl", "wallet", "messages", "cdv"];
const NAV_LABELS = ["Fil", "Bobines", "Explorer", "Messages", "IRL", "CDV"];

// État local minimal d'un utilisateur onboardé (même forme que onbFinish, app-02)
const ONBOARDED_STATE = {
  onboarded: true, landingSeen: true, tourSeen: true,
  user: {
    name: "Audit QA", birthYear: 1995, isMinor: false, score: 10, passia: 5,
    currentProfileId: "pp_audit",
    profiles: [{ id: "pp_audit", name: "Audit QA", passion: "musique", emoji: "🎵", bio: "Profil de test", color: "#7c3aed", createdAt: 1 }],
    drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
    following: [], savedCarnets: [], general: {},
  },
  userPosts: [], userEvents: [], transactions: [], notifications: [], quests: [],
  currentMood: "all", selectedFeedPassions: [],
};

async function bootOnboarded(page, errors) {
  page.on("pageerror", (e) => errors.js.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const txt = m.text();
    // Les échecs réseau (Supabase injoignable depuis la CI, 400 de monitoring…)
    // sont comptés à part : ce test cible les erreurs JS de l'app.
    if (/Failed to load resource|net::|ERR_/.test(txt)) errors.network.push(txt);
    else errors.console.push(txt);
  });
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    localStorage.setItem("passio_state", JSON.stringify(st));
    // Pas de tour guidé ni d'overlay PWA pendant l'audit
    sessionStorage.setItem("passio_pwa_dismissed", "1");
  }, [GATE_KEY, GATE_TOKEN, ONBOARDED_STATE]);
  await page.goto("/index.html");
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2500); // initApp (emoji-misc, ~600 ms) + boot async
  // Sans session Supabase (test offline), boot() affiche la landing par-dessus l'app.
  // En prod, un utilisateur onboardé a une session anonyme persistante → pas de landing.
  // On reproduit cet état (app prête, landing fermée) pour tester la navigation réelle.
  await page.evaluate(() => {
    const l = document.getElementById("landing");
    if (l) l.classList.remove("active");
  });
}

test("tour des 8 écrans : zéro erreur JS, chaque écran devient actif", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);

  const timings = {};
  for (const s of SCREENS) {
    const t0 = Date.now();
    await page.evaluate((scr) => goTo(scr), s);
    await page.waitForFunction((scr) => {
      const el = document.getElementById("screen-" + scr);
      return el && el.classList.contains("active");
    }, s, { timeout: 5000 });
    timings[s] = Date.now() - t0;
    await page.waitForTimeout(350); // laisse les rendus async (cartes, listes) s'exécuter
  }
  console.log("Timings navigation (ms):", JSON.stringify(timings));
  if (errors.network.length) console.log("(info) erreurs réseau ignorées:", errors.network.length);

  expect(errors.js, "exceptions JS pendant le tour").toEqual([]);
  expect(errors.console, "console.error applicatifs pendant le tour").toEqual([]);
  for (const s of SCREENS) {
    expect(timings[s], `navigation vers ${s} < 1500 ms`).toBeLessThan(1500);
  }
});

test("bottom-nav : libellés, clics réels et écran attendu", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);

  // Libellés attendus présents dans la nav
  for (const label of NAV_LABELS) {
    await expect(page.locator(".nav-item", { hasText: label }).first(), `nav « ${label} »`).toBeVisible();
  }

  // Clic réel sur chaque item de la nav.
  // Cas particulier : « Bobines » (data-screen=bobines) ouvre l'overlay #reelsViewer
  // via openReels(), ce n'est pas un #screen-<nom> (comportement voulu de l'app).
  const items = await page.$$eval(".nav-item[data-screen]", els => els.map(e => e.getAttribute("data-screen")));
  for (const s of items) {
    await page.click(`.nav-item[data-screen="${s}"]`);
    if (s === "bobines") {
      await page.waitForFunction(() => {
        const v = document.getElementById("reelsViewer");
        return v && v.classList.contains("open");
      }, null, { timeout: 5000 });
      await page.evaluate(() => { if (typeof closeReels === "function") closeReels(); });
    } else {
      await page.waitForFunction((scr) => {
        const el = document.getElementById("screen-" + scr);
        return el && el.classList.contains("active");
      }, s, { timeout: 5000 });
    }
  }
  expect(errors.js, "exceptions JS pendant les clics nav").toEqual([]);
});
