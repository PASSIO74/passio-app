// ROB-03 — un serveur en panne ou une session morte SE DISENT.
//
// LE DÉFAUT (contre-revue Astra, chantier 8), mesuré au chaos : toutes les
// requêtes Supabase en 500, 401 ou 429 → fil servi depuis le cache, navigation
// possible, aucun toast, aucune bannière, 28 rejeux en 30 s. Les écritures
// échouaient en silence ; une session expirée laissait la personne « connectée »
// à l'écran sans qu'aucune écriture n'aboutisse.
// Ce que cette suite exige (sonde `_sondeServeurReponse`, app-02) :
//   ① 3 réponses 5xx/429 en 30 s → bandeau « Serveur indisponible » ; une 2xx
//     le retire (RÉINJECTION : la sonde n'existe pas sur le code d'avant) ;
//   ② un 401 REST avec un compte réel et sans session vivante → bandeau
//     « Session expirée » avec « Se reconnecter » ; un 401 chez un visiteur ou
//     avec une session encore vivante → rien ;
//   ③ le câblage : une vraie réponse 500 de l'hôte Supabase passe par la sonde ;
//   ④ les échecs RÉSEAU ne sont pas comptés (domaine du bandeau hors-ligne).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

async function banc(page, avecCompte) {
  await page.route(/supabase\.co/, (route) => route.abort());
  if (avecCompte) await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => { window._supaReal = true; _sondeServeurBandeau(null); _sondeServeur.echecs = []; _sondeServeur.muetJusqua = 0; });
}
const bandeau = (page) => page.evaluate(() => { const b = document.getElementById("serveurBanner"); return b && b.style.display !== "none" ? b.getAttribute("data-serveur") : null; });

test.describe("ROB-03 — état du serveur", () => {
  test("① trois 5xx en 30 s → « Serveur indisponible » ; une 2xx le retire", async ({ page }) => {
    await banc(page, true);
    // RÉINJECTION : `_sondeServeurReponse` n'existe pas sur le code d'avant.
    await page.evaluate(() => { _sondeServeurReponse(500, "https://x.supabase.co/rest/v1/posts"); _sondeServeurReponse(503, "https://x.supabase.co/rest/v1/posts"); });
    expect(await bandeau(page)).toBeNull();
    await page.evaluate(() => { _sondeServeurReponse(429, "https://x.supabase.co/rest/v1/posts"); });
    expect(await bandeau(page)).toBe("panne");
    expect(await page.evaluate(() => document.getElementById("serveurBanner").textContent)).toMatch(/Serveur indisponible/);
    await page.evaluate(() => { _sondeServeurReponse(200, "https://x.supabase.co/rest/v1/posts"); });
    expect(await bandeau(page)).toBeNull();
  });

  test("② 401 REST : session morte → « Se reconnecter » ; visiteur ou session vivante → rien", async ({ page }) => {
    await banc(page, true);
    await page.evaluate(() => { Object.defineProperty(window.supa, "auth", { configurable: true, value: { getSession: async () => ({ data: { session: null } }) } }); });
    await page.evaluate(() => { _sondeServeurReponse(401, "https://x.supabase.co/rest/v1/posts"); });
    await page.waitForFunction(() => { const b = document.getElementById("serveurBanner"); return b && b.style.display !== "none"; });
    expect(await bandeau(page)).toBe("session");
    expect(await page.evaluate(() => document.getElementById("serveurBanner").textContent)).toMatch(/Session expirée/);
    expect(await page.evaluate(() => !!document.querySelector("#serveurBanner button"))).toBe(true);
    // Session vivante : le SDK va rafraîchir, pas de bandeau.
    await page.evaluate(() => { _sondeServeurBandeau(null); _sondeServeur.muetJusqua = 0; Object.defineProperty(window.supa, "auth", { configurable: true, value: { getSession: async () => ({ data: { session: { user: { id: "x" } } } }) } }); _sondeServeurReponse(401, "https://x.supabase.co/rest/v1/posts"); });
    await page.waitForTimeout(150);
    expect(await bandeau(page)).toBeNull();
    // /auth/v1 gère ses propres 401 : ignoré.
    await page.evaluate(() => { _sondeServeur.muetJusqua = 0; Object.defineProperty(window.supa, "auth", { configurable: true, value: { getSession: async () => ({ data: { session: null } }) } }); _sondeServeurReponse(401, "https://x.supabase.co/auth/v1/token"); });
    await page.waitForTimeout(150);
    expect(await bandeau(page)).toBeNull();
  });

  test("② bis visiteur (placeholder u_…) : un 401 est normal, aucun bandeau", async ({ page }) => {
    await banc(page, false);
    await page.evaluate(() => { Object.defineProperty(window.supa, "auth", { configurable: true, value: { getSession: async () => ({ data: { session: null } }) } }); _sondeServeurReponse(401, "https://x.supabase.co/rest/v1/events"); });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => typeof MY_UID === "string" && /^u_/.test(MY_UID))).toBe(true);
    expect(await bandeau(page)).toBeNull();
  });

  test("③ câblage : trois vraies réponses 500 de l'hôte Supabase allument le bandeau", async ({ page }) => {
    await banc(page, true);
    await page.unroute(/supabase\.co/);
    await page.route(/supabase\.co/, (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.evaluate(async () => { for (let i = 0; i < 3; i++) { try { await fetch("https://njkiyoklssvefstljemx.supabase.co/rest/v1/posts?select=id"); } catch (e) {} } });
    expect(await bandeau(page)).toBe("panne");
  });

  test("④ un échec réseau (requête jamais partie) ne compte pas", async ({ page }) => {
    await banc(page, true);
    await page.evaluate(async () => { for (let i = 0; i < 4; i++) { try { await fetch("https://njkiyoklssvefstljemx.supabase.co/rest/v1/posts?select=id"); } catch (e) {} } });
    expect(await bandeau(page)).toBeNull();
  });
});
