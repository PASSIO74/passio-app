// ══════════════════════════════════════════════════════════════════════════
// PREMIÈRE VISITE — LE PANNEAU « Qu'est-ce qui te passionne ? » CHERCHE DANS
// LES 5 001 PASSIONS, PLUS DANS LES 19 DU SOCLE (2026-09-12)
// ──────────────────────────────────────────────────────────────────────────
// Rapporté à l'écran : taper « Ski » rendait « Aucune passion ne correspond.
// Essaie un autre mot. » alors que la production porte 5 003 passions actives,
// dont 15 de ski (mesuré au canal ① d'ADR-012 le 2026-09-12) et que
// `data/passions-v1.json` en livre 21.
//
// Cause : `catalogue()` de `js/first-run.js` rend `allPassions()`, c'est-à-dire
// le socle embarqué (19) plus les passions perso du compte. Le référentiel plat
// n'était branché nulle part sur CET écran — le seul que tout nouveau visiteur
// traverse. C'est le défaut corrigé le 2026-09-03 sur la page « Rechercher »
// (`_exChercherPassions`, app-07) et jamais porté jusqu'ici.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootVisiteur } = require("./first-run-helper");

const CHEMIN_REFERENTIEL = "**/data/passions-v1.json";

async function ouvrirPanneau(page) {
  await page.evaluate(() => PassioFirstRun.ouvrirPersonnalisation());
  await page.waitForSelector("#frSearch", { timeout: 10000 });
}

async function taper(page, texte) {
  await page.fill("#frSearch", texte);
  await page.evaluate((t) => PassioFirstRun.chercherDansPanneau(t), texte);
}

const libellesGrille = () =>
  Array.from(document.querySelectorAll("#frGrid .fr-tile-label")).map((n) => n.textContent.trim());

test.describe("Première visite — le référentiel plat dans le panneau", () => {
  // ① LE DÉFAUT DE LA CAPTURE, RÉINJECTÉ À L'IDENTIQUE.
  test("① taper « Ski » rend des passions, pas « Aucune passion ne correspond »", async ({ page }) => {
    await bootVisiteur(page);
    await ouvrirPanneau(page);

    // Prémisse VÉRIFIÉE, jamais supposée : le socle embarqué ne connaît aucun
    // ski. Sans cette ligne, un socle qui en gagnerait un rendrait le cas vert
    // sans rien prouver du référentiel (défaut « un test qui tient par accident »).
    const skiDansSocle = await page.evaluate(() =>
      allPassions().filter((p) => /ski/i.test(p.id + " " + p.label)).length
    );
    expect(skiDansSocle).toBe(0);

    await taper(page, "Ski");
    await page.waitForFunction(
      () => !/Aucune passion ne correspond|Recherche/.test(document.getElementById("frGrid").textContent),
      null,
      { timeout: 15000 }
    );

    const libelles = await page.evaluate(libellesGrille);
    expect(libelles.length).toBeGreaterThan(2);
    expect(libelles.join(" · ")).toMatch(/Ski alpin/);
    // Le message du défaut a disparu de l'écran.
    const texte = await page.locator("#frGrid").textContent();
    expect(texte).not.toMatch(/Aucune passion ne correspond/);
  });

  // ② CHOISIE PUIS INVISIBLE — le piège du lot.
  // `interetsDuVisiteur` filtre par `metaPassion`, qui passe par
  // `estPassionCanonique` : celle-ci ne connaît hors ligne que les 19 du socle.
  // Sans le registre `_refVues`, « Ski alpin » était choisi, validé, puis JETÉ
  // EN SILENCE — le fil ne changeait pas et rien ne le disait.
  test("② une passion du référentiel choisie atteint réellement le fil", async ({ page }) => {
    await bootVisiteur(page);
    await ouvrirPanneau(page);
    await taper(page, "Ski alpin");
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("#frGrid .fr-tile[data-fr-passion]"))
        .some((b) => b.getAttribute("data-fr-passion") === "glisse-ski-alpin"),
      null,
      { timeout: 15000 }
    );

    // Un GESTE, pas un appel de fonction : c'est le câblage qu'on mesure.
    await page.click('#frGrid .fr-tile[data-fr-passion="glisse-ski-alpin"]');
    await page.click("#frValider");
    await page.waitForTimeout(600);

    const retenues = await page.evaluate(() => PassioFirstRun.prefs().passions);
    expect(retenues).toContain("glisse-ski-alpin");

    // Et surtout : elle est bien devenue un critère du fil.
    // ⚠️ `_activeFeedPassions` est un `let` de PORTÉE SCRIPT (app-01), PAS une
    // propriété de `window` — le lire par `window.` rend `undefined`, donc un
    // tableau vide, donc un cas VERT SUR LE DÉFAUT. Il se lit par son nom nu.
    const actives = await page.evaluate(() => Array.from(_activeFeedPassions));
    expect(actives).toContain("glisse-ski-alpin");
  });

  // ③ ON NE PEINT JAMAIS 5 001 TUILES.
  test("③ « Voir toutes les passions » reste un aperçu borné", async ({ page }) => {
    await bootVisiteur(page);
    await ouvrirPanneau(page);

    await page.evaluate(() => PassioFirstRun.voirToutes());
    await page.waitForTimeout(2500);

    const n = await page.locator("#frGrid .fr-tile[data-fr-passion]").count();
    expect(n).toBeGreaterThan(12);   // le référentiel a bien élargi l'aperçu
    expect(n).toBeLessThanOrEqual(60);
  });

  // ④ L'INVARIANT « 568 Ko JAMAIS AU DÉMARRAGE » TIENT.
  // Le référentiel part à l'OUVERTURE du panneau, jamais au boot.
  test("④ le référentiel ne part pas au démarrage, seulement à l'ouverture", async ({ page }) => {
    const demandes = [];
    page.on("request", (r) => {
      if (/passions-v1\.json/.test(r.url())) demandes.push(r.url());
    });

    await bootVisiteur(page);
    expect(demandes.length).toBe(0);

    await ouvrirPanneau(page);
    await taper(page, "Ski");
    await page.waitForTimeout(2500);
    expect(demandes.length).toBeGreaterThan(0);
  });

  // ⑤ « AUCUNE PASSION NE CORRESPOND » PENDANT QUE LE RÉFÉRENTIEL RÉPOND EST UN
  // MENSONGE — et c'est le message que l'utilisateur a lu à l'écran.
  //
  // ⚠️ ON NE MESURE PAS LE RÉSEAU ICI, ET C'EST MESURÉ : le service worker sert
  // `data/passions-v1.json` HORS du routage de Playwright — un `page.route` sur
  // ce chemin n'est jamais appelé alors que la requête part bel et bien. Un cas
  // bâti sur une route retenue serait donc resté vert quoi qu'il arrive. On
  // mute `PassioPassions.chercherAsync`, comme la maison mute `window.supa.from`.
  test("⑤ pendant la recherche, l'écran dit qu'il cherche", async ({ page }) => {
    await bootVisiteur(page);
    await ouvrirPanneau(page);

    await page.evaluate(() => {
      window.__libere = null;
      const vrai = PassioPassions.chercherAsync;
      PassioPassions.chercherAsync = function (q, o) {
        return new Promise((resoudre) => {
          window.__libere = () => resoudre(vrai.call(PassioPassions, q, o));
        });
      };
    });

    await taper(page, "Ski");
    await page.waitForTimeout(700);   // anti-rebond (160 ms) largement écoulé

    const texte = await page.locator("#frGrid").textContent();
    expect(texte).toMatch(/Recherche/);
    expect(texte).not.toMatch(/Aucune passion ne correspond/);

    // Le message est TRANSITOIRE, pas un état où l'on reste coincé.
    await page.evaluate(() => window.__libere && window.__libere());
    await page.waitForFunction(
      () => /Ski alpin/.test(document.getElementById("frGrid").textContent),
      null,
      { timeout: 15000 }
    );
  });

  // ⑥ REPLI : référentiel en échec ⇒ le socle répond quand même.
  // Le repli, c'est le comportement d'AVANT le lot. Il ne doit jamais laisser
  // une page morte ni un « Recherche… » éternel.
  test("⑥ référentiel en échec : le socle répond, l'écran ne reste pas figé", async ({ page }) => {
    await bootVisiteur(page);
    await ouvrirPanneau(page);

    await page.evaluate(() => {
      PassioPassions.chercherAsync = function () {
        return Promise.reject(new Error("referentiel indisponible (banc)"));
      };
    });

    // « Musique » EST dans le socle des 19 : c'est ce qui doit survivre.
    await taper(page, "Musique");
    await page.waitForFunction(
      () => !/Recherche/.test(document.getElementById("frGrid").textContent),
      null,
      { timeout: 15000 }
    );

    const libelles = await page.evaluate(libellesGrille);
    expect(libelles.join(" · ")).toMatch(/Musique/);

    // Et un mot que SEUL le référentiel connaît dit honnêtement qu'il n'a rien,
    // au lieu de laisser tourner « Recherche… » pour toujours.
    await taper(page, "Ski");
    await page.waitForFunction(
      () => /Aucune passion ne correspond/.test(document.getElementById("frGrid").textContent),
      null,
      { timeout: 15000 }
    );
  });
});
