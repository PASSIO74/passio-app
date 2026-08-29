// ============================================================================
// « MA VILLE » SUIT LA VILLE COURANTE (2026-08-29)
// ----------------------------------------------------------------------------
// `ui-v4a1-intentions.js` posait le prédicat ville UNE SEULE FOIS, au clic sur
// l'intention (`poserPredicatVille(nomVille())`), et ne le reprenait plus jamais
// — sauf dans le cas « ville pas encore choisie » (`villeEnAttente`).
//
// Changer de ville ENSUITE, par le sélecteur historique, laissait donc le filtre
// sur l'ancienne : `selectIrlCity` met à jour `irlSelectedCity`, rafraîchit le
// titre et relance `renderIRL()` — mais `irlCityIntent` gardait la valeur
// d'avant. Résultat mesuré : le titre annonce la ville B, la liste ne montre que
// des activités de la ville A, et rien à l'écran ne dit pourquoi.
//
// ⚠️ Le prédicat est stocké NORMALISÉ (`_normIrlCityName` : sans accents, sans
// ponctuation) alors que la ville sélectionnée garde son libellé d'affichage.
// Comparer les deux valeurs brutes ferait croire à une divergence à CHAQUE
// rendu, et le module ré-écrirait sans fin. La comparaison passe donc par la
// même normalisation que le moteur.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Les intentions vivent aujourd'hui dans le panneau UI-4A5 / UI-4A4 ; cette
// suite les pilote par l'API de la tête, pas par un clic, pour rester
// indépendante de l'endroit où elles sont rendues.
async function boot(page) {
  await page.addInitScript(() => {
    try {
      var g = navigator.geolocation;
      window.__geoCalls = 0;
      if (g) Object.defineProperty(g, "getCurrentPosition", {
        configurable: true, value: function () { window.__geoCalls++; },
      });
    } catch (e) {}
  });
  await bootOnboarded(page);
  await page.evaluate(() => { window.supaLoadPosts = async () => []; });
  await page.evaluate(() => goTo("irl"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-irl");
    return el && el.classList.contains("active");
  });
  await page.waitForTimeout(400);
}

// Deux villes DISTINCTES portant chacune au moins une activité visible. Choisies
// dans le moteur et non écrites en dur : le contenu de démonstration est daté en
// relatif, une ville figée ferait rougir la suite selon l'heure d'exécution.
async function deuxVilles(page) {
  return page.evaluate(() => {
    const compte = {};
    _filterIrlEvents(allEvents()).forEach((e) => {
      if (!e.city) return;
      compte[e.city] = (compte[e.city] || 0) + 1;
    });
    const villes = Object.keys(compte);
    return { a: villes[0] || "", b: villes[1] || "" };
  });
}

test.describe("« Ma ville » après un changement de ville", () => {
  test("le filtre suit la ville choisie, il ne reste pas sur la précédente", async ({ page }) => {
    await boot(page);
    const { a, b } = await deuxVilles(page);
    expect(a, "il faut deux villes distinctes dans le jeu d'essai").not.toBe("");
    expect(b).not.toBe("");
    expect(a).not.toBe(b);

    // Ville A choisie, puis l'intention « Ma ville » activée.
    await page.evaluate((v) => selectIrlCity("test_a", v), a);
    await page.waitForTimeout(300);
    // Même événement que celui qu'émet un clic sur la chip. `setIntents` ne le
    // rejoue PAS (c'est la voie de resynchronisation, pas celle du geste), donc
    // l'appeler seul ne déclencherait rien côté UI-4A1.
    await page.evaluate(() => {
      window.PassioUIV4A0.setIntents(["ville"]);
      window.dispatchEvent(new CustomEvent("passio:ui4a0-intents", { detail: { intents: ["ville"] } }));
    });
    await page.waitForTimeout(600);

    const surA = await page.evaluate((v) => ({
      predicat: irlCityIntentName(),
      attendu: _normIrlCityName(v),
      villes: [...new Set(_filterIrlEvents(allEvents()).map((e) => _normIrlCityName(e.city)))],
    }), a);
    expect(surA.predicat).toBe(surA.attendu);
    expect(surA.villes).toEqual([surA.attendu]);

    // Changement de ville, par le chemin historique.
    await page.evaluate((v) => selectIrlCity("test_b", v), b);
    await page.waitForTimeout(800);

    const surB = await page.evaluate((v) => ({
      predicat: irlCityIntentName(),
      attendu: _normIrlCityName(v),
      titre: (document.getElementById("irlCityTitle") || {}).textContent || "",
      villes: [...new Set(_filterIrlEvents(allEvents()).map((e) => _normIrlCityName(e.city)))],
    }), b);

    expect(surB.predicat, "le prédicat doit suivre la nouvelle ville").toBe(surB.attendu);
    expect(surB.villes, "la liste ne doit plus montrer l'ancienne ville").toEqual([surB.attendu]);
    // Et aucune demande de position n'a été déclenchée au passage.
    expect(await page.evaluate(() => window.__geoCalls)).toBe(0);
  });

  test("sans « Ma ville », changer de ville ne pose aucun filtre", async ({ page }) => {
    await boot(page);
    const { a, b } = await deuxVilles(page);

    await page.evaluate((v) => selectIrlCity("test_a", v), a);
    await page.waitForTimeout(300);
    await page.evaluate((v) => selectIrlCity("test_b", v), b);
    await page.waitForTimeout(600);

    const r = await page.evaluate(() => ({
      predicat: irlCityIntentName(),
      nb: _filterIrlEvents(allEvents()).length,
      total: allEvents().filter((e) => e.date >= Date.now() - 86400000).length,
    }));
    // Le prédicat est un choix EXPLICITE : choisir une ville de référence ne
    // filtre rien tant que l'intention n'est pas demandée.
    expect(r.predicat).toBe("");
    expect(r.nb).toBeGreaterThan(1);
  });
});
