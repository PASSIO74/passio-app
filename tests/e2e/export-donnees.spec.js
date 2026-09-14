// EXP-08 — « Exporter mes données » : la portabilité en libre-service.
//
// LE DÉFAUT (contre-revue Astra) : la politique promettait accès et
// portabilité « par e-mail » et aucune fonction d'export n'existait. L'Edge
// Function `export-account` (déployée, éprouvée sur un compte jetable : 401 sans
// jeton, 200 avec 27 tables, 429 au 3e appel) rend le JSON ; cette suite exige
// côté client : ① la porte existe dans Confidentialité (RÉINJECTION) ; ② avec un
// compte réel, l'appel part vers `export-account` et le fichier est proposé au
// téléchargement ; ③ un échec est dit ; ④ sans compte réel, rien ne part et on
// le dit ; ⑤ la politique nomme la porte.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

async function banc(page, avecCompte) {
  await page.route(/supabase\.co/, (route) => route.abort());
  if (avecCompte) await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => {
    window._supaReal = true;
    window.__toasts = []; window.toast = (t) => window.__toasts.push(String(t));
    window.__invocations = []; window.__reponse = { data: { format: "passio-export/1", tables: { posts: [{ id: "p1" }], profiles: [{ id: "x" }] }, medias: [{ chemin: "a" }], erreurs: [] }, error: null };
    Object.defineProperty(window.supa, "functions", { configurable: true, value: { invoke: async (nom) => { window.__invocations.push(nom); return window.__reponse; } } });
    window.__telechargements = [];
    window._telechargerJson = (objet, nom) => { window.__telechargements.push({ nom, format: objet.format }); };
  });
}

test.describe("EXP-08 — exporter mes données", () => {
  test("① la porte existe dans Confidentialité", async ({ page }) => {
    await banc(page, true);
    await page.evaluate(() => openPrivacySettings());
    // RÉINJECTION : `#privExporter` n'existe pas sur le code d'avant.
    await expect(page.locator("#privExporter")).toBeVisible();
    await expect(page.locator("#privExporter")).toHaveText(/Exporter mes données/);
  });

  test("② compte réel : l'appel part, le fichier est proposé, le bilan est dit", async ({ page }) => {
    await banc(page, true);
    const r = await page.evaluate(async () => { await openPrivacySettings(); const ok = await exporterMesDonnees(); return { ok, inv: window.__invocations, dl: window.__telechargements, toasts: window.__toasts.slice() }; });
    expect(r.ok).toBe(true);
    expect(r.inv).toEqual(["export-account"]);
    expect(r.dl[0].format).toBe("passio-export/1");
    expect(r.dl[0].nom).toMatch(/^passio-export-3f2a9c64\.json$/);
    expect(r.toasts.some((t) => /Export prêt : 2 tables, 1 média/.test(t))).toBe(true);
  });

  test("③ échec ou plafond : dit, rien de téléchargé", async ({ page }) => {
    await banc(page, true);
    const r = await page.evaluate(async () => {
      window.__reponse = { data: null, error: { message: "Edge Function returned a non-2xx status code (429)" } };
      const ok = await exporterMesDonnees();
      return { ok, dl: window.__telechargements.length, toasts: window.__toasts.slice() };
    });
    expect(r.ok).toBe(false);
    expect(r.dl).toBe(0);
    expect(r.toasts.some((t) => /réessaie dans une minute/.test(t))).toBe(true);
  });

  test("④ sans compte réel : rien ne part, et on le dit", async ({ page }) => {
    await banc(page, false);
    const r = await page.evaluate(async () => { const ok = await exporterMesDonnees(); return { ok, inv: window.__invocations.length, toasts: window.__toasts.slice() }; });
    expect(r.ok).toBe(false);
    expect(r.inv).toBe(0);
    expect(r.toasts.some((t) => /Sans compte/.test(t))).toBe(true);
  });

  test("⑤ la politique de confidentialité nomme la porte", async ({ page }) => {
    await banc(page, true);
    const txt = await page.evaluate(() => passioTextePolitique());
    expect(txt).toMatch(/Exporter mes données/);
    expect(txt).toMatch(/portabilité/);
  });
});
