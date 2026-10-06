// ═══════════════════════════════════════════════════════════════════════════
// POPULAIRES EN DIRECT (2026-10-06) — le panneau « Qu'est-ce qui te passionne ? »
// d'un visiteur met en tête les passions où des gens PUBLIENT.
//
// Mesuré le 2026-10-06 sur 90 jours de publications visibles d'un visiteur :
// Yoga 8 (2 auteurs), Podcast 2, Musculation, Photo, Voyage, Tech, Cuisine — rien
// en Musique, Sport ni Art, trois des quatre premières tuiles de la liste écrite.
//
// Le client Supabase est RÉEL (SDK local) et la base SIMULÉE : `sansDonneesDistantes`
// rend `[]` à toute lecture de table, et la lecture des populaires est servie par
// une route posée APRÈS (Playwright donne la main à la dernière route posée).
// MUTATIONS éprouvées : ôter le plafond de 8 → ② rougit ; classer par
// publications avant les personnes → ⑥ rougit ; ne plus mettre les vivantes en
// tête → ①②③ rougissent. Ne rougit PAS, et c'est dit : retirer la mémorisation
// `_refVues` d'une tuile du référentiel (③ reste vert — au clic le référentiel
// est chargé, `metaPassion` la connaît ; la mémorisation est une ceinture pour
// le rechargement, comme pour la recherche) ; avaler un refus en liste vide
// (même grille : la liste écrite).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { sansDonneesDistantes } = require("./app-helper");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

const LISTE_ECRITE = ["musique", "sport", "cuisine", "voyage", "photo", "art", "cinema", "tech", "jeuxvideo", "yoga", "litterature", "moto"];
const ilYa = (j) => new Date(Date.now() - j * 864e5).toISOString().replace("Z", "");
const estLecturePopulaires = (url) => /\/rest\/v1\/posts\?/.test(url) && /select=passion_id%2Cauthor_id%2Ccreated_at/.test(url);

/** Visiteur avec le VRAI client Supabase, base simulée ; `reponse` sert la lecture des populaires. */
async function visiteur(page, reponse) {
  const lectures = [];
  await sansDonneesDistantes(page);
  await page.route((url) => estLecturePopulaires(url.toString()), (route) => {
    lectures.push(route.request().url());
    return reponse(route);
  });
  await page.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    sessionStorage.setItem("passio_first_run_bienvenue_fermee", "1");
  }, [GATE_KEY, GATE_TOKEN]);
  await page.goto("/index.html");
  await page.waitForFunction(() => window._supaReal === true && window.PassioFirstRun && PassioFirstRun.estVisiteur(), null, { timeout: 20000 });
  return lectures;
}

const servir = (lignes) => (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(lignes) });
const tuiles = () => Array.from(document.querySelectorAll("#frGrid .fr-tile[data-fr-passion]")).map((b) => b.getAttribute("data-fr-passion"));

async function ouvrir(page) {
  await page.evaluate(() => PassioFirstRun.ouvrirPersonnalisation("test"));
  await page.waitForSelector("#frGrid .fr-tile", { timeout: 10000 });
}

test("① les passions où des gens publient passent en tête, la liste écrite complète jusqu'à 12", async ({ page }) => {
  const lectures = await visiteur(page, servir([
    { passion_id: "yoga", author_id: "a1", created_at: ilYa(3) },
    { passion_id: "yoga", author_id: "a2", created_at: ilYa(5) },
    { passion_id: "yoga", author_id: "a1", created_at: ilYa(9) },
    { passion_id: "podcast", author_id: "a3", created_at: ilYa(2) },
    { passion_id: "podcast", author_id: "a3", created_at: ilYa(4) },
    { passion_id: "photo", author_id: "a4", created_at: ilYa(20) },
  ]));
  await ouvrir(page);
  await expect.poll(() => page.evaluate(tuiles)).toEqual(
    ["yoga", "podcast", "photo", "musique", "sport", "cuisine", "voyage", "art", "cinema", "tech", "jeuxvideo", "litterature"]);
  // La tuile « Voir toutes les passions » reste là, et UNE lecture a suffi.
  await expect(page.locator("#frGrid .fr-tile-more")).toHaveCount(1);
  expect(lectures.length).toBe(1);
  // La lecture est celle du fil invité : 3 colonnes, 90 jours, 300 lignes au plus, la plus récente d'abord.
  const u = new URL(lectures[0]);
  expect(u.searchParams.get("select")).toBe("passion_id,author_id,created_at");
  expect(u.searchParams.get("order")).toBe("created_at.desc");
  expect(u.searchParams.get("limit")).toBe("300");
  const depuis = Date.parse(u.searchParams.get("created_at").replace(/^gte\./, ""));
  expect(Math.round((Date.now() - depuis) / 864e5)).toBe(90);
});

test("② au plus 8 tuiles vivantes : 4 grands domaines restent toujours là", async ({ page }) => {
  const vivantes = ["podcast", "danse", "mode", "animaux", "jardinage", "actu", "metier", "yoga", "tech", "art"];
  await visiteur(page, servir(vivantes.map((id, i) => ({ passion_id: id, author_id: "a" + i, created_at: ilYa(i + 1) }))));
  await ouvrir(page);
  await expect.poll(() => page.evaluate(tuiles)).toEqual([...vivantes.slice(0, 8), "musique", "sport", "cuisine", "voyage"]);
});

test("③ une passion PRÉCISE du référentiel vient avec son libellé, et choisie elle atteint le fil", async ({ page }) => {
  await visiteur(page, servir([
    { passion_id: "fitness-musculation", author_id: "a1", created_at: ilYa(1) },
    { passion_id: "fitness-musculation", author_id: "a2", created_at: ilYa(2) },
  ]));
  await ouvrir(page);
  const tuile = page.locator('#frGrid .fr-tile[data-fr-passion="fitness-musculation"]');
  await expect(tuile).toHaveCount(1, { timeout: 15000 });
  await expect(tuile.locator(".fr-tile-label")).toHaveText("Musculation");
  expect((await page.evaluate(tuiles))[0]).toBe("fitness-musculation");
  // Un GESTE, pas un appel de fonction : c'est le câblage qu'on mesure.
  await tuile.click();
  await page.click("#frValider");
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => PassioFirstRun.prefs().passions)).toContain("fitness-musculation");
  // ⚠️ `_activeFeedPassions` est un `let` de portée script : il se lit par son nom nu.
  expect(await page.evaluate(() => Array.from(_activeFeedPassions))).toContain("fitness-musculation");
});

test("④ un refus ou une panne laisse la liste écrite À L'IDENTIQUE, et on ne boucle pas", async ({ page }) => {
  const lectures = await visiteur(page, (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "JWT expired", code: "PGRST301" }) }));
  await ouvrir(page);
  await page.waitForTimeout(800);
  expect(await page.evaluate(tuiles)).toEqual(LISTE_ECRITE);
  // Fermer et rouvrir : une nouvelle tentative, pas une boucle.
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  await ouvrir(page);
  await page.waitForTimeout(800);
  expect(await page.evaluate(tuiles)).toEqual(LISTE_ECRITE);
  expect(lectures.length).toBeLessThanOrEqual(2);
  expect(lectures.length).toBeGreaterThanOrEqual(1);
});

test("⑤ rien de vivant (base vide) : la grille ne bouge pas", async ({ page }) => {
  await visiteur(page, servir([]));
  await ouvrir(page);
  await page.waitForTimeout(800);
  expect(await page.evaluate(tuiles)).toEqual(LISTE_ECRITE);
});

test("⑥ classement : les PERSONNES d'abord, puis les publications, puis la plus récente ; `_parDefaut` n'est pas une passion", async ({ page }) => {
  await visiteur(page, servir([]));
  const ordre = await page.evaluate(() => PassioFirstRun.classerPopulaires([
    { passion_id: "solo", author_id: "x", created_at: "2026-10-01T10:00:00" },
    { passion_id: "solo", author_id: "x", created_at: "2026-10-01T11:00:00" },
    { passion_id: "solo", author_id: "x", created_at: "2026-10-01T12:00:00" },
    { passion_id: "duo", author_id: "a", created_at: "2026-09-01T10:00:00" },
    { passion_id: "duo", author_id: "b", created_at: "2026-09-01T10:00:00" },
    { passion_id: "recent", author_id: "c", created_at: "2026-10-05T10:00:00" },
    { passion_id: "ancien", author_id: "d", created_at: "2026-08-05T10:00:00" },
    { passion_id: "_parDefaut", author_id: "e", created_at: "2026-10-05T10:00:00" },
    { passion_id: "", author_id: "f", created_at: "2026-10-05T10:00:00" },
    null,
  ]));
  expect(ordre).toEqual(["duo", "solo", "recent", "ancien"]);
  expect(await page.evaluate(() => PassioFirstRun.classerPopulaires(null))).toEqual([]);
});
