// SUP-04 / TCI-04 (contre-revue Astra, 2026-09-14) — le client sait viser un
// autre projet Supabase que la production.
//
// LE DÉFAUT : un seul projet servait au développement, aux aperçus de PR, aux
// tests à comptes réels (qui ÉCRIVENT avec la clé de service et purgent des
// comptes) et à la production ; l'URL était en dur dans app-08, rien n'était
// injecté. Le staging existait depuis le 17/08 et ne pouvait pas être visé.
// LA CORRECTION : `window.PASSIO_SUPABASE_CIBLE = { url, anon }` posé AVANT
// app-08 fait viser ce projet à tout le client ; les suites `prod` l'injectent
// depuis PASSIO_SUPABASE_URL / PASSIO_SUPABASE_ANON (`cible-supabase.js`).
// Prouvé le 14/09 : authz-critical, blocage-acces et user-state-horodatage
// verts contre le staging, comptes créés là-bas (5), production intacte (8).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const fs = require("fs");
const path = require("path");

const PROD = "https://njkiyoklssvefstljemx.supabase.co";
const CIBLE = { url: "https://fcksxofaelcdmmifnwjo.supabase.co", anon: "cle-anon-de-banc" };

async function lire(page) {
  return page.evaluate(() => ({
    url: window.PASSIO_SUPABASE && window.PASSIO_SUPABASE.url,
    anon: window.PASSIO_SUPABASE && window.PASSIO_SUPABASE.anon,
    sdk: (typeof supa !== "undefined" && supa && supa.rest && supa.rest.url) || (typeof supa !== "undefined" && supa && supa.supabaseUrl) || null,
  }));
}

test.describe("cible Supabase — un autre projet que la production, sur demande explicite", () => {
  test("① sans cible, c'est la production — à l'octet près", async ({ page }) => {
    await page.route(/supabase\.co/, (route) => route.abort());
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
    const r = await lire(page);
    expect(r.url).toBe(PROD);
    expect(r.anon).toMatch(/^eyJ/);
  });

  test("② une cible complète posée avant app-08 est prise par le SDK ET par la télémétrie", async ({ page }) => {
    await page.route(/supabase\.co/, (route) => route.abort());
    await page.addInitScript((c) => { window.PASSIO_SUPABASE_CIBLE = c; }, CIBLE);
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
    const r = await lire(page);
    expect(r.url).toBe(CIBLE.url);
    expect(r.anon).toBe(CIBLE.anon);
    if (r.sdk) expect(String(r.sdk)).toContain("fcksxofaelcdmmifnwjo");
  });

  test("③ une cible partielle ou mal formée est IGNORÉE : jamais une production à moitié détournée", async ({ page }) => {
    await page.route(/supabase\.co/, (route) => route.abort());
    // url sans clé → ignorée ; url qui n'est pas un projet Supabase → ignorée.
    await page.addInitScript(() => { window.PASSIO_SUPABASE_CIBLE = { url: "https://fcksxofaelcdmmifnwjo.supabase.co" }; });
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
    expect((await lire(page)).url).toBe(PROD);
    await page.addInitScript(() => { window.PASSIO_SUPABASE_CIBLE = { url: "https://evil.example.com", anon: "x" }; });
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
    expect((await lire(page)).url).toBe(PROD);
  });

  test("④ à la SOURCE : chaque suite `prod` et le helper QA visent la cible avant de naviguer", () => {
    const racine = path.join(__dirname, "..", "..");
    const cfg = fs.readFileSync(path.join(racine, "playwright.config.js"), "utf8");
    const bloc = /const SUITES_PROD = \[([\s\S]*?)\];/.exec(cfg);
    expect(bloc).not.toBeNull();
    const suites = [...bloc[1].matchAll(/"([a-z0-9-]+\.spec\.js)"/g)].map((m) => m[1]);
    expect(suites.length).toBeGreaterThanOrEqual(7);
    for (const f of suites) {
      const src = fs.readFileSync(path.join(__dirname, f), "utf8");
      // Directement, ou par qa-helper (confidentialite, qa-campaign).
      const parHelper = /require\("\.\/qa-helper"\)/.test(src);
      expect(parHelper || /viserCibleSupabase\(/.test(src), `${f} ne vise pas la cible avant de naviguer`).toBe(true);
    }
    const qa = fs.readFileSync(path.join(__dirname, "qa-helper.js"), "utf8");
    expect(qa).toMatch(/viserCibleSupabase\(page\)/);
    // Et l'appel précède le `page.goto` : un script d'initialisation posé après
    // la navigation ne s'applique qu'à la suivante.
    const idxV = qa.indexOf("viserCibleSupabase(page)"), idxG = qa.indexOf('page.goto("/index.html")');
    expect(idxV).toBeGreaterThan(0);
    expect(idxV).toBeLessThan(idxG);
  });

  test("⑤ le jeton du SDK se purge par MOTIF, pas par le nom du projet de production", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-02-state-utils.js"), "utf8");
    expect(src).not.toMatch(/sb-njkiyoklssvefstljemx-auth-token/);
  });
});
