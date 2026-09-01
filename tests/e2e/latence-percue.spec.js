// ═══════════════════════════════════════════════════════════════════════════
// LATENCE PERÇUE — le délai entre le tap et la première image peinte.
//
// `PASSIO_PRODUCTION_READINESS.md` portait « ❌ NON MESURÉ » sur ce domaine :
// aucun p50/p95 entre le geste et le retour visuel. La télémétrie chronomètre
// désormais chaque clic (deux `requestAnimationFrame` enchaînés depuis la phase
// de capture) et joint le délai à l'événement, dans `meta.ms`.
//
// Ce test ne vérifie PAS que l'application est rapide — un chiffre relevé sur un
// navigateur sans réseau ni données ne dirait rien de l'expérience réelle. Il
// vérifie que la MESURE EXISTE et arrive intacte jusqu'au payload : sans quoi le
// tableau de bord afficherait un p95 calculé sur rien.
//
// Deux pièges couverts explicitement :
//   ① le champ doit franchir `scrubMeta` (liste noire de clés + primitives
//      seules). Un renommage malheureux le ferait disparaître EN SILENCE.
//   ② `requestAnimationFrame` ne se déclenche jamais sur un onglet caché. Sans
//      le délai de secours, le clic lui-même serait perdu, pas seulement sa
//      mesure — une régression bien pire que l'absence de chiffre.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY, poserGateSansPremiereVisite } = require("./gate-helper");

/**
 * Capture les lignes POSTées vers telemetry_events — et les ARRÊTE avant la base.
 *
 * `?telemetry=1` force la capture, et il n'existe qu'UNE base Supabase : sans
 * interception, chaque exécution déposerait une dizaine de lignes `development`
 * dans la table de PRODUCTION. Le dashboard les filtre, mais la table, son coût
 * et toute analyse SQL directe, non — 128 lignes s'y étaient déjà réaccumulées
 * après la purge du 2026-08-16.
 *
 * Répondre 201 plutôt qu'échouer : un refus déclencherait la file de reprise du
 * client, qui rejouerait le lot indéfiniment. Ce test n'a besoin que du contenu
 * envoyé, jamais de sa persistance.
 */
async function interceptePayloads(page) {
  const lignes = [];
  // `page.route` est asynchrone : ne pas l'attendre laisserait `goto` partir
  // avant que l'interception soit posée, et les premiers lots fileraient en base.
  await page.route("**/rest/v1/telemetry_events*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      try { lignes.push(...JSON.parse(req.postData() || "[]")); } catch (e) { /* payload illisible */ }
    }
    await route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  return lignes;
}

test.describe("Latence perçue", () => {
  test("chaque clic transporte son délai jusqu'à la première image peinte", async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const lignes = await interceptePayloads(page);

    await poserGateSansPremiereVisite(page);
    await page.goto("/index.html?telemetry=1");
    await page.waitForSelector("#landing.active", { timeout: 30000 });

    // Un bouton bien réel de la landing, pas un élément fabriqué pour le test.
    const cible = page.locator("button, [role=button]").first();
    await cible.waitFor({ state: "visible", timeout: 15000 });
    await cible.click();

    // Laisser le lot partir (la file est vidée périodiquement).
    await page.waitForTimeout(6000);
    await page.evaluate(() => window.PassioTelemetry && window.PassioTelemetry.flush && window.PassioTelemetry.flush());
    await page.waitForTimeout(2000);

    const clics = lignes.filter((l) => l.type === "click");
    console.log(`[latence] ${lignes.length} ligne(s) envoyée(s), dont ${clics.length} clic(s)`);
    expect(clics.length, "au moins un clic doit être transmis").toBeGreaterThan(0);

    const avecMesure = clics.filter((c) => c.meta && typeof c.meta.ms === "number");
    for (const c of avecMesure) console.log(`[latence] ${c.action} → ${c.meta.ms} ms`);

    // Le champ doit survivre au filtre PII. S'il est absent partout, c'est soit
    // qu'il n'est pas émis, soit que `scrubMeta` le jette : dans les deux cas la
    // mesure n'existe pas, et le dire tout de suite vaut mieux qu'un p95 vide.
    expect(avecMesure.length, "le délai doit franchir scrubMeta et figurer dans meta.ms").toBeGreaterThan(0);

    // Un délai négatif ou absurde signalerait une horloge mal lue.
    for (const c of avecMesure) {
      expect(c.meta.ms, `délai plausible pour « ${c.action} »`).toBeGreaterThanOrEqual(0);
      expect(c.meta.ms).toBeLessThan(60000);
    }
    await ctx.close();
  });

  test("un clic reste transmis quand aucune image n'est jamais peinte", async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const lignes = await interceptePayloads(page);

    await poserGateSansPremiereVisite(page);

    // On neutralise `requestAnimationFrame` AVANT le chargement : il enregistre
    // les demandes et ne rappelle jamais. C'est l'état exact d'un onglet passé en
    // arrière-plan, reproduit de façon déterministe.
    //
    // Première version de ce test : forcer `document.visibilityState` à "hidden"
    // par `defineProperty`. Elle ne prouvait RIEN — en headless, rAF continue de
    // tourner malgré cette propriété, et le test restait vert même après
    // suppression du filet de sécurité. Il a fallu le test de mutation pour le
    // voir. Conservé comme rappel : un test qui passe n'est pas un test qui prouve.
    await page.addInitScript(() => {
      window.__rafDemandes = 0;
      window.requestAnimationFrame = function () { window.__rafDemandes++; return 0; };
    });

    await page.goto("/index.html?telemetry=1");
    await page.waitForSelector("#landing.active", { timeout: 30000 });

    const cible = page.locator("button, [role=button]").first();
    await cible.click({ force: true });

    expect(await page.evaluate(() => window.__rafDemandes),
      "le code doit bien demander une frame — sinon ce test ne vérifie pas le bon chemin")
      .toBeGreaterThan(0);

    await page.waitForTimeout(6000);
    await page.evaluate(() => window.PassioTelemetry && window.PassioTelemetry.flush && window.PassioTelemetry.flush());
    await page.waitForTimeout(2000);

    const clics = lignes.filter((l) => l.type === "click");
    console.log(`[latence] sans peinture : ${clics.length} clic(s) transmis`);
    expect(clics.length, "le clic doit partir même sans peinture — on perd la mesure, jamais l'événement").toBeGreaterThan(0);
    // Et la mesure doit être ABSENTE, pas inventée : un délai fabriqué ici
    // fausserait le p95 avec une valeur qui ne correspond à aucun rendu.
    for (const c of clics) {
      expect(c.meta && c.meta.ms == null, "aucun délai ne doit être rapporté sans peinture").toBeTruthy();
    }
    await ctx.close();
  });
});
