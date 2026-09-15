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
    window.__invocations = []; window.__reponse = { data: { format: "passio-export/1", bilan: { complet: true, instantane: { snapshot: "742:742:", prise_le: "2026-09-15T18:00:00Z", plafond: 5000 }, tables_exportees: 2, lignes: 2, medias: 1, tables_tronquees: [], tables_sans_ordre_stable: [], erreurs: [], plafond_par_table: 5000 }, tables: { posts: [{ id: "p1" }], profiles: [{ id: "x" }] }, medias: [{ chemin: "a" }], erreurs: [] }, error: null };
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
    expect(r.toasts.some((t) => /Export complet : 2 tables, 1 média/.test(t))).toBe(true);
  });

  // ASTRA-14 (contre-revue Astra, 2026-09-15) : un export incomplet le DIT — au
  // téléchargement, et dans le fichier (`bilan`). Avant : « Export prêt », succès.
  test("② bis export incomplet (table tronquée, dossier illisible) : dit en avertissement, fichier quand même proposé", async ({ page }) => {
    await banc(page, true);
    const r = await page.evaluate(async () => {
      window.__reponse = { data: { format: "passio-export/1", bilan: { complet: false, tables_exportees: 3, lignes: 5000, medias: 2, tables_tronquees: ["conv_messages"], tables_sans_ordre_stable: [], erreurs: ["content/avatars : list refusée"], plafond_par_table: 5000 }, tables: { conv_messages: [], posts: [], profiles: [] }, medias: [{}, {}], tronquees: ["conv_messages"], erreurs: ["content/avatars : list refusée"] }, error: null };
      await openPrivacySettings(); const ok = await exporterMesDonnees();
      return { ok, dl: window.__telechargements, toasts: window.__toasts.slice() };
    });
    expect(r.ok).toBe(true);
    expect(r.dl.length).toBe(1);
    // RÉINJECTION : sur le code du 14/09, « Export prêt : 3 tables, 2 média(s) … 1 table(s) illisible(s) » en succès, sans un mot de la troncature.
    expect(r.toasts.some((t) => /Export INCOMPLET/.test(t) && t.indexOf("1 table(s) tronquée(s) au plafond de 5000") !== -1 && /illisible/.test(t))).toBe(true);
    expect(r.toasts.some((t) => /Export complet/.test(t))).toBe(false);
  });

  // ASTRA-44 (cinquième contre-revue, 2026-09-15) : sans INSTANTANÉ serveur, un
  // export ne peut pas être dit complet — même si le serveur ne signale ni
  // troncature ni erreur (fonction d'instantané absente, ou fonction d'avant).
  test("② ter sans instantané : jamais « Export complet », la raison est nommée, le fichier reste proposé", async ({ page }) => {
    await banc(page, true);
    const r = await page.evaluate(async () => {
      window.__reponse = { data: { format: "passio-export/1", bilan: { complet: false, instantane: null, tables_exportees: 2, lignes: 2, medias: 1, tables_tronquees: [], tables_sans_ordre_stable: [], erreurs: ["instantané : fonction absente (migration non appliquée) — lecture par pages, complétude NON garantie"], plafond_par_table: 5000 }, tables: { posts: [], profiles: [] }, medias: [{}], erreurs: ["instantané : fonction absente (migration non appliquée) — lecture par pages, complétude NON garantie"] }, error: null };
      await openPrivacySettings(); const ok = await exporterMesDonnees();
      return { ok, dl: window.__telechargements.length, toasts: window.__toasts.slice() };
    });
    expect(r.ok).toBe(true);
    expect(r.dl).toBe(1);
    expect(r.toasts.some((t) => /Export INCOMPLET/.test(t) && /sans instantané cohérent/.test(t)), JSON.stringify(r.toasts)).toBe(true);
    expect(r.toasts.some((t) => /Export complet/.test(t))).toBe(false);
    // Et un bilan d'AVANT (sans le champ) n'est pas un succès non plus.
    const r2 = await page.evaluate(async () => {
      window.__toasts.length = 0;
      window.__reponse = { data: { format: "passio-export/1", bilan: { complet: true, tables_exportees: 2, lignes: 2, medias: 1, tables_tronquees: [], erreurs: [] }, tables: { posts: [], profiles: [] }, medias: [{}], erreurs: [] }, error: null };
      await exporterMesDonnees(); return window.__toasts.slice();
    });
    expect(r2.some((t) => /Export complet/.test(t))).toBe(false);
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
