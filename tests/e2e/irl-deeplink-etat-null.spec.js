// Liens profonds IRL — #irl-event-<id> et #irl-checkin-<id>-<code>.
//
// CE QUE CETTE SUITE PROUVE, et rien d'autre : ces deux liens survivent à la
// fenêtre où l'application n'est PAS encore prête.
//
// ⚠️ Le défaut, mesuré le 2026-08-30. Les deux routages sondaient `allEvents()`
// une seule fois, à +1 200 ms d'un `setTimeout` d'amorçage. Or `state` vaut
// **null** — pas `undefined` — jusqu'à `state = loadState()`, qui part APRÈS
// `await ensureSupabase()`. Sur un réseau mobile froid, le sondage arrive avant :
// `allEvents()` fait `state.seed.events` et lève un TypeError.
//
// Et cette exception ne se voit nulle part. Venue d'un `setTimeout` (ou d'un
// écouteur `hashchange`), elle n'est rattrapée par personne : la boucle de
// reprise `setInterval` n'est JAMAIS armée, aucun toast ne sort, et le lien est
// mort — définitivement, pour cette ouverture. Le cas du QR de pointage est le
// pire des deux : on est physiquement devant l'organisateur, on scanne, il ne se
// passe rien.
//
// Même famille exactement que le lien `#reel=<id>` (app-06) et que le piège déjà
// consigné dans CLAUDE.md à propos de `ui-v4b-fiche.js` : un `typeof state ===
// "undefined"` ne garde RIEN, puisque `state` est déclaré.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const EVENT_SEED = "e1"; // « Jam session guitaristes débutants », présent dès le boot

// Reproduit la fenêtre réelle : `state` est remis à null, le lien est posé (ce
// qui déclenche le routage), PUIS l'application devient prête.
//
// ⚠️ `state` est un `let` de portée script : il est visible depuis une fonction
// compilée dans le contexte global (donc depuis `page.evaluate`), mais il n'est
// PAS une propriété de `window`. `window.state = null` n'aurait aucun effet et
// le test passerait sans jamais construire la situation qu'il décrit.
async function poserLienAvantQueLAppSoitPrete(page, hash) {
  await page.evaluate((h) => {
    window.__etatVrai = state;
    state = null;
    location.hash = h;
  }, hash);
  // Le temps que le sondage parte et, avant correctif, meure en silence.
  await page.waitForTimeout(400);
  await page.evaluate(() => { state = window.__etatVrai; });
}

// ⚠️ La fiche n'est pas un écran `.active` : c'est un panneau qui vit dans le DOM
// en `display:none` et que `openEventDetails` rend visible. Le mesurer par une
// classe d'écran donnait un test rouge en permanence, cas nominal compris — ce
// que le troisième test de cette suite a révélé tout de suite.
function ficheOuverte(page, timeout = 15000) {
  return page.waitForFunction(() => {
    const el = document.getElementById("eventDetailPage");
    return !!(el && el.style && el.style.display !== "none");
  }, null, { timeout });
}

test.describe("Liens profonds IRL et fenêtre « application pas encore prête »", () => {
  test("#irl-event-<id> posé avant que state existe ouvre quand même la fiche", async ({ page }) => {
    await bootOnboarded(page);
    await poserLienAvantQueLAppSoitPrete(page, "#irl-event-" + EVENT_SEED);

    await ficheOuverte(page);
    const titre = await page.evaluate(() => {
      const el = document.getElementById("eventDetailPage");
      return el ? el.textContent : "";
    });
    expect(titre).toContain("Jam session");
  });

  test("#irl-checkin-<id>-<code> posé avant que state existe ouvre quand même la fiche", async ({ page }) => {
    await bootOnboarded(page);
    const code = await page.evaluate((id) => {
      const ev = allEvents().find((e) => e.id === id);
      return _eventCheckinCode(ev);
    }, EVENT_SEED);
    expect(code, "le code de pointage doit être calculable").toMatch(/^[A-Z0-9]{6}$/);

    await poserLienAvantQueLAppSoitPrete(page, "#irl-checkin-" + EVENT_SEED + "-" + code);
    await ficheOuverte(page);
  });

  // ⚠️ RÉGRESSION QUE J'AI MOI-MÊME INTRODUITE en écrivant ce correctif, trouvée
  // en relisant mon diff contre celui de `#reel=`. Mémoriser l'id du lien est
  // nécessaire (`goTo()` fait un `pushState("#irl")`, donc une navigation pendant
  // l'attente effacerait le lien) — mais un id qui SURVIT à l'ouverture agit sur
  // n'importe quel `hashchange` suivant : un simple retour arrière vers « #feed »
  // rouvrait la fiche sans que personne ne l'ait demandé. Deux gardes : l'id est
  // CONSOMMÉ à l'ouverture, et l'écouteur sort si le hash n'est pas un lien.
  test("après ouverture, un hashchange sans rapport ne rouvre PAS la fiche", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate((id) => { location.hash = "#irl-event-" + id; }, EVENT_SEED);
    await ficheOuverte(page);

    await page.evaluate(() => { closeEventDetail(); });
    await page.waitForFunction(() => {
      const el = document.getElementById("eventDetailPage");
      return !!(el && el.style && el.style.display === "none");
    }, null, { timeout: 8000 });

    await page.evaluate(() => { location.hash = "#feed"; });
    await page.waitForTimeout(2500);

    expect(await page.evaluate(() => {
      const el = document.getElementById("eventDetailPage");
      return !!(el && el.style && el.style.display !== "none");
    }), "la fiche doit rester fermée").toBe(false);
  });

  // Garde anti-creux : le chemin nominal (application déjà prête) doit continuer
  // de marcher. Sans ce test, un correctif qui casserait le cas normal tout en
  // réparant le cas dégradé passerait inaperçu ici.
  test("le chemin nominal, application prête, est inchangé", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate((id) => { location.hash = "#irl-event-" + id; }, EVENT_SEED);
    await ficheOuverte(page);
  });
});
