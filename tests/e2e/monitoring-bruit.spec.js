// ═══════════════════════════════════════════════════════════════════════════
// MONITORING — la table d'erreurs ne doit contenir que des erreurs de VRAIS
// utilisateurs.
//
// Constat du 2026-08-16 sur la production : « Uncaught SyntaxError: Failed to
// execute 'dispatchEvent' … Unexpected token ')' » occupait la PREMIÈRE place de
// `client_errors` — 55 occurrences, 55 clients distincts, la plus récente du
// jour. Toutes émises depuis 127.0.0.1, avec `eval at evaluate` et
// `NodeList.forEach` dans la pile : la signature de Playwright.
//
// Leur origine est même souhaitable. `echappement.spec.js` secoue le DOM avec
// une charge hostile ; correctement échappée, elle rend le handler inline non
// compilable, et le SyntaxError EST la preuve que l'attaque est inerte. Le
// défaut n'était pas l'erreur, mais le fait qu'elle parte en production.
//
// Ce que ce test garde : une table d'erreurs où le bruit de test ne peut plus
// enterrer une panne réelle. Une table de monitoring à laquelle on ne croit
// plus ne se consulte plus.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

/** Compte les POST vers client_errors, et les empêche d'aboutir. */
async function compteurRemontees(page) {
  const envois = [];
  await page.route("**/rest/v1/client_errors*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      try { envois.push(JSON.parse(req.postData() || "{}")); } catch (e) { envois.push({}); }
    }
    await route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  return envois;
}

/** Provoque une vraie erreur non capturée, celle que `window.onerror` voit. */
async function provoquerErreur(page) {
  await page.evaluate(() => {
    setTimeout(() => { throw new Error("erreur de test volontaire"); }, 0);
  });
  await page.waitForTimeout(2500);
}

test.describe("Monitoring — bruit de test", () => {
  test("une erreur survenue en local ne part PAS dans la table de production", async ({ browser }) => {
    test.setTimeout(60000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const envois = await compteurRemontees(page);

    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    await page.goto("/index.html");
    await page.waitForSelector("#landing.active", { timeout: 30000 });
    await provoquerErreur(page);

    console.log(`[monitoring] local sans indicateur : ${envois.length} remontée(s)`);
    expect(envois.length, "aucune erreur locale ne doit atteindre client_errors").toBe(0);
    await ctx.close();
  });

  test("l'indicateur explicite ?monitoring=1 réactive la remontée", async ({ browser }) => {
    test.setTimeout(60000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const envois = await compteurRemontees(page);

    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    await page.goto("/index.html?monitoring=1");
    await page.waitForSelector("#landing.active", { timeout: 30000 });
    await provoquerErreur(page);

    console.log(`[monitoring] avec ?monitoring=1 : ${envois.length} remontée(s)`);
    // Sans cette seconde direction, une remontée cassée pour TOUT LE MONDE
    // passerait pour un filtre qui fonctionne — la panne silencieuse parfaite.
    expect(envois.length, "la chaîne de remontée doit rester fonctionnelle").toBeGreaterThan(0);
    expect(envois[0].message || "", "le message d'erreur doit être transmis").toContain("erreur de test volontaire");
    await ctx.close();
  });
});
