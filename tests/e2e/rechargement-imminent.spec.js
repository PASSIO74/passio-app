// RECHARGEMENT DÉCIDÉ PAR L'APP — les requêtes coupées en vol ne sont pas des « error ».
//
// Mesuré en production le 2026-09-18 (feed, version df49da71) : « Se reconnecter »
// → `_sondeServeurReconnecter` → `doLogout("signin")` → `location.reload()`.
// Sur iOS le rechargement coupe le GET /posts en vol AVANT `pagehide` : page
// « visible », en ligne, `unloading` absent → « Failed to fetch » classé
// `severity: "error"` au centre de pilotage. Corrigé par 5befda93 (PR #491) :
// `annoncerRechargement()` (app-02), lu par le hook fetch de telemetry.js et par
// les rafraîchissements du fil (app-08). Aucun test ne tenait ce câblage ; une
// régression serait repassée par la production. Cette suite exige :
// ① une requête coupée APRÈS l'annonce est `warn` + `meta.rechargement`, et le
//   `status` reste "error" (le fait est écrit, seule la gravité change) ;
// ② `doLogout` annonce AVANT son premier appel réseau ;
// ③ le retour d'arrière-plan ne relance pas le fil une fois le rechargement annoncé ;
// ④ le câblage, à la source.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded } = require("./app-helper");

// `?telemetry=1` : seul opt-in local — sans lui les hooks (dont celui de
// `fetch`) ne sont pas installés ; on mesurerait le vide en se croyant vert.
// Les envois de télémétrie sont servis en 201 par une route : rien ne part.
async function banc(page) {
  await page.route("**/rest/v1/telemetry_events*", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
  await bootOnboarded(page, null, 1, { query: "?telemetry=1" });
  await sansRechargement(page);
}

// Rien ne doit recharger pendant la mesure : on lit la télémétrie APRÈS.
async function sansRechargement(page) {
  await page.evaluate(() => {
    try { Object.defineProperty(window.location, "reload", { value: function () {}, configurable: true }); } catch (e) {}
    window.__api = [];
    const T = window.PassioTelemetry;
    if (T) T.api = (f) => { window.__api.push(f); };
  });
}

test.describe("Rechargement imminent : bruit transitoire, pas un défaut", () => {
  test("① une requête coupée après annoncerRechargement() est warn + meta.rechargement, status error", async ({ page }) => {
    await banc(page);
    // Socket tuée : c'est ce que produit un rechargement sur une requête en vol.
    await page.route(/supabase\.co\/rest\/v1\/posts/, (route) => route.abort("failed"));
    const verdict = await page.evaluate(async () => {
      const url = String(window.PASSIO_SUPABASE.url) + "/rest/v1/posts?select=id&limit=1";
      const p = fetch(url).catch(() => {}); // partie AVANT l'annonce, comme le GET /posts mesuré
      annoncerRechargement();               // l'app décide de partir
      await p;
      return window.__api.filter((e) => /posts/.test(String(e.endpoint || e.action || "")));
    });
    expect(verdict.length, "prémisse : l'échec est passé par le hook fetch").toBeGreaterThan(0);
    for (const e of verdict) {
      expect(e.status, "le fait reste écrit").toBe("error");
      expect(e.severity, "mais ce n'est pas un défaut de l'app").toBe("warn");
      expect(e.meta && e.meta.rechargement, "et la preuve est nommée").toBe(true);
      expect(e.meta && e.meta.fermeture, "sous la même bannière que pagehide").toBe(true);
    }
  });

  test("① bis — RÉINJECTION : sans l'annonce, la même coupure page visible reste une error", async ({ page }) => {
    await banc(page);
    await page.route(/supabase\.co\/rest\/v1\/posts/, (route) => route.abort("failed"));
    const verdict = await page.evaluate(async () => {
      const url = String(window.PASSIO_SUPABASE.url) + "/rest/v1/posts?select=id&limit=1";
      await fetch(url).catch(() => {});
      return window.__api.filter((e) => /posts/.test(String(e.endpoint || e.action || "")));
    });
    expect(verdict.length).toBeGreaterThan(0);
    for (const e of verdict) {
      expect(e.severity, "page visible, en ligne, aucun départ annoncé : on ne sait pas l'expliquer").toBe("error");
      expect(!!(e.meta && e.meta.rechargement)).toBe(false);
    }
  });

  test("② doLogout annonce le rechargement AVANT son premier appel réseau", async ({ page }) => {
    await banc(page);
    const ordre = await page.evaluate(async () => {
      const vu = [];
      const f0 = window.fetch;
      window.fetch = function (u) {
        if (/supabase\.co/.test(String(u))) vu.push(window._rechargementImminent === true);
        return f0.apply(this, arguments);
      };
      // Un appel réseau garanti dans doLogout, quel que soit l'état du banc.
      window.supaSaveUserState = async function () {
        await f0(String(window.PASSIO_SUPABASE.url) + "/rest/v1/user_state?select=uid&limit=1").catch(() => {});
      };
      await Promise.race([doLogout("signin"), new Promise((r) => setTimeout(r, 8000))]);
      return vu;
    });
    expect(ordre.length, "prémisse : doLogout a émis au moins un appel réseau").toBeGreaterThan(0);
    expect(ordre.every(Boolean), "chaque appel réseau de doLogout part drapeau posé").toBe(true);
  });

  test("③ le retour d'arrière-plan ne relance pas le fil une fois le rechargement annoncé", async ({ page }) => {
    await banc(page);
    const n = await page.evaluate(async () => {
      let appels = 0;
      const orig = window.supaLoadPosts;
      window.supaLoadPosts = async function () { appels++; return orig ? orig.apply(this, arguments) : []; };
      annoncerRechargement();
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 400));
      return appels;
    });
    expect(n, "aucun GET /posts lancé : la page part").toBe(0);
  });

  test("④ le câblage, à la source", async () => {
    const app02 = fs.readFileSync(path.join(__dirname, "../../js/app-02-state-utils.js"), "utf8");
    const app08 = fs.readFileSync(path.join(__dirname, "../../js/app-08-ui-modals-tour.js"), "utf8");
    const tel = fs.readFileSync(path.join(__dirname, "../../js/telemetry.js"), "utf8");
    const corps = app02.slice(app02.indexOf("async function doLogout("));
    // En début de ligne, hors commentaire : une ligne `// annoncerRechargement();`
    // ne compte pas (RÉINJECTION mesurée : indexOf la tenait pour vraie).
    const annonce = corps.search(/^\s*annoncerRechargement\(\);/m);
    expect(annonce, "doLogout annonce le rechargement").toBeGreaterThan(-1);
    expect(annonce, "… AVANT le flush d'état (premier appel réseau)").toBeLessThan(corps.indexOf("await supaSaveUserState()"));
    const reconnexion = app02.slice(app02.indexOf("async function reconnecterSession("), app02.indexOf("window.reconnecterSession"));
    expect(reconnexion.indexOf("annoncerRechargement()"), "reconnecterSession annonce avant son reload").toBeLessThan(reconnexion.indexOf("location.reload()"));
    expect(app02).toMatch(/function _sondeServeurReconnecter\(\)[\s\S]{0,200}doLogout\("signin"\)/);
    expect(tel, "le hook fetch nomme la preuve").toMatch(/rechargement:\s*_rechargement/);
    expect((app08.match(/_rechargementImminent === true\) return/g) || []).length, "boucle 60 s ET retour d'arrière-plan s'abstiennent").toBeGreaterThanOrEqual(2);
  });
});
