// ══════════════════════════════════════════════════════════════════════════
// LES TROIS REPÈRES ATTEIGNENT AUSSI UN COMPTE NEUF  (2026-09-12)
// ──────────────────────────────────────────────────────────────────────────
// Rapport d'essai réel : « toutes les bulles d'explications sont en place sur
// les nouveaux comptes ? » Mesuré : NON. Les trois repères (« Ce qui
// t'inspire » · « Ce que tu veux vivre » · « Ce que tu veux partager ») étaient
// gardés par `estVisiteur()` — ils s'éteignaient donc à la seconde où un compte
// existe, c'est-à-dire pour exactement les personnes à qui l'application est
// envoyée. Quelqu'un qui explore d'abord les voit ; quelqu'un qui crée son
// compte directement (lien de confirmation sur un appareil neuf, chemin NORMAL
// depuis « Confirm email ») ne les voyait JAMAIS, et ne pouvait pas les
// rejouer : « Revoir les repères » portait `.fr-only`, masqué dès qu'un compte
// existe. Même famille que `filDecouverte()` le 2026-09-10 : c'est l'ÉTAT qui
// décide, jamais la présence d'un compte.
//
// ⚠️ LA CARTE DE BIENVENUE, ELLE, RESTE VISITEUR. Son texte tranche tout seul :
// « Crée ton compte pour les garder » — c'est une carte de CONVERSION. La
// montrer à quelqu'un qui vient de créer son compte serait sourd.
// ══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { onboardedState, bootOnboarded } = require("./app-helper");

const SRC_FR = fs.readFileSync(path.join(__dirname, "..", "..", "js", "first-run.js"), "utf8");
const SRC_APP02 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-02-state-utils.js"), "utf8");

// L'état exact d'un compte qui vient de confirmer son e-mail : `tourSeen` purgé
// par `adopterCompteConnecte`, aucune aide vue, et le profil de REMPLISSAGE que
// `boot()` fabrique — marqué `_parDefaut`, il n'est une passion voulue nulle part.
function compteNeuf() {
  const s = onboardedState(1);
  delete s.tourSeen;
  s.hintsVus = {};
  s.user.profiles = [{ id: "p0", name: "Neuf", passion: "musique", emoji: "🎵", _parDefaut: true }];
  s.user.following = [];
  return s;
}

// Un compte GARNI : deux passions voulues et quelqu'un de suivi. C'est
// l'habitué qui se connecte sur un téléphone neuf — ses préférences locales
// sont vides elles aussi (`adopterCompteConnecte` vient de purger), donc seul
// l'état du COMPTE permet de le distinguer.
function compteGarni() {
  const s = onboardedState(2);
  delete s.tourSeen;
  s.hintsVus = {};
  s.user.following = ["u_quelquun"];
  return s;
}

// Budget de reprise : 40 × 600 ms. On laisse largement de quoi voir la première
// marche se poser, sans attendre la fin du budget.
const APRES_REPRISE = 6000;

function lire(page) {
  return page.evaluate(() => ({
    repere: document.querySelector(".fr-tip")
      ? document.querySelector(".fr-tip").getAttribute("data-fr-tip") : null,
    hint: document.querySelector(".passio-hint")
      ? document.querySelector(".passio-hint").getAttribute("data-hint") : null,
    bienvenue: !!document.getElementById("frWelcome"),
  }));
}

test.describe("Les repères atteignent un compte neuf", () => {
  test("① un compte neuf reçoit la première marche, sans carte de bienvenue", async ({ page }) => {
    await bootOnboarded(page, null, 1, { state: compteNeuf() });
    await page.waitForTimeout(APRES_REPRISE);

    const vu = await lire(page);
    expect(vu.repere, "la première marche ne s'est pas posée sur un compte neuf").toBe("decouvrir");
    // La carte de conversion n'a rien à faire là : ce compte vient d'être créé.
    expect(vu.bienvenue).toBe(false);
  });

  test("② un compte GARNI n'en reçoit AUCUNE, et garde ses aides contextuelles", async ({ page }) => {
    // ⚠️ LE CAS QUI PROTÈGE LES HABITUÉS. Un discriminant fondé sur « les
    // préférences locales sont vides » les aurait rattrapés : leur appareil neuf
    // en a d'aussi vides. On tranche sur l'état du COMPTE.
    await bootOnboarded(page, null, 2, { state: compteGarni() });
    await page.waitForTimeout(APRES_REPRISE);

    const vu = await lire(page);
    expect(vu.repere, "un compte garni a reçu une présentation qu'il n'a pas à voir").toBe(null);
    // Et la pause des aides historiques ne déborde pas sur lui.
    expect(vu.hint).toBe("feed_auteur");
  });

  test("③ les trois marches : Fil, Rencontrer, retour au Fil", async ({ page }) => {
    await bootOnboarded(page, null, 1, { state: compteNeuf() });
    await page.waitForTimeout(APRES_REPRISE);
    expect((await lire(page)).repere).toBe("decouvrir");

    await page.evaluate(() => PassioFirstRun.fermerBulle());
    await page.evaluate(() => goTo("irl"));
    await page.waitForTimeout(1800);
    expect((await lire(page)).repere, "« Rencontrer » manque à l'ouverture de l'IRL").toBe("rencontrer");

    await page.evaluate(() => PassioFirstRun.fermerBulle());
    await page.evaluate(() => goTo("feed"));
    await page.waitForTimeout(1800);
    expect((await lire(page)).repere, "« Créer » manque au retour sur le Fil").toBe("creer");
  });

  test("④ les deux systèmes d'aide ne se superposent jamais", async ({ page }) => {
    // ⚠️ LE DÉFAUT QUE CE LOT POUVAIT ROUVRIR. La garde de `montrerHint` lisait
    // `estVisiteur()` : dès que les repères atteignent un compte, elle ne
    // protégeait plus rien et les quatre aides contextuelles se seraient posées
    // SUR les repères (défaut mesuré en capture 390 px).
    await bootOnboarded(page, null, 1, { state: compteNeuf() });
    await page.waitForTimeout(APRES_REPRISE);
    const n = await page.evaluate(() =>
      document.querySelectorAll(".fr-tip, .passio-hint").length);
    expect(n, "deux bulles d'aide à l'écran en même temps").toBe(1);
    expect((await lire(page)).hint).toBe(null);
  });

  test("⑤ la porte de rejeu est rendue au compte", async ({ page }) => {
    // Un tour à un seul coup sans porte de rejeu est une porte fermée qui ne dit
    // pas par où passer (fiche 16). `.fr-only` la masquait dès qu'un compte
    // existe ; elle est désormais pilotée par le kill switch du lot, et par lui
    // seul — un compte qui a DÉJÀ vu les trois repères doit pouvoir les revoir.
    await bootOnboarded(page, null, 1, { state: compteNeuf() });
    await page.waitForTimeout(2000);
    await page.evaluate(() => toggleDevPanel());
    await page.waitForTimeout(300);

    const b = await page.evaluate(() => {
      const el = document.getElementById("frReperesBtn");
      return { existe: !!el, display: el ? getComputedStyle(el).display : "absent" };
    });
    expect(b.existe).toBe(true);
    // ⚠️ ON MESURE LE `display` CALCULÉ, PAS `offsetParent` : la section « Démo »
    // du panneau est REPLIÉE au repos, donc `offsetParent` y est nul pour tous
    // ses boutons — une mesure qui serait restée fausse quoi qu'on fasse.
    expect(b.display).not.toBe("none");
  });

  test("⑥ lot coupé : le bouton disparaît au lieu de rendre un tap mort", async ({ page }) => {
    // `relancerTour` sortirait sur la garde `actif()` de `planifierTour` : un
    // refus qui ne se prononce pas est indiscernable d'une panne (2026-09-04).
    await page.addInitScript(() => { window.PASSIO_FIRST_RUN_V1 = false; });
    await bootOnboarded(page, null, 1, { state: compteNeuf() });
    await page.waitForTimeout(1500);
    await page.evaluate(() => toggleDevPanel());
    await page.waitForTimeout(300);
    const d = await page.evaluate(() => {
      const el = document.getElementById("frReperesBtn");
      return el ? getComputedStyle(el).display : "absent";
    });
    expect(d).toBe("none");
  });

  test("⑦ à la SOURCE : une seule autorité, et la garde de montrerHint la lit", async () => {
    // ⚠️ CE CAS NE REGARDE PAS LA PAGE. Les six précédents resteraient verts si
    // une future garde réintroduisait `estVisiteur()` sur un chemin qu'aucun
    // banc n'emprunte — c'est très exactement ainsi que le défaut a vécu.
    expect(SRC_FR).toMatch(/function reperesAutorises\(\)/);
    expect(SRC_FR).toMatch(/function montrerEtape\(id\)\s*\{\s*\n\s*if \(!reperesAutorises\(\)\) return false;/);
    expect(SRC_FR).toMatch(/function planifierTour\(\)\s*\{\s*\n\s*if \(!reperesAutorises\(\)/);
    expect(SRC_FR).toMatch(/function surNavigation\(screen\)\s*\{\s*\n\s*if \(!reperesAutorises\(\)\) return;/);

    // La carte de bienvenue RESTE visiteur — c'est une carte de conversion.
    expect(SRC_FR).toMatch(/function poserBienvenue\(\)\s*\{\s*\n\s*if \(!estVisiteur\(\)\) return false;/);

    // Et `montrerHint` ne lit plus « visiteur », mais « une présentation est en cours ».
    expect(SRC_APP02).toMatch(/PassioFirstRun\.aidesHistoriquesEnPause\(\)\) return false;/);
    expect(SRC_APP02).not.toMatch(/PassioFirstRun\.estVisiteur\(\)\) return false;/);
  });
});
