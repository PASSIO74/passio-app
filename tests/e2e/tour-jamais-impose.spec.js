// ══════════════════════════════════════════════════════════════════════════
// LE TOUR HISTORIQUE N'EST JAMAIS IMPOSÉ  (2026-09-12)
// ──────────────────────────────────────────────────────────────────────────
// DÉFAUT MESURÉ EN PRODUCTION. Compte créé le 2026-09-12 à 11:06, confirmé par
// e-mail à 11:07:39 : l'arrivée dans l'app a ouvert le TOUR HISTORIQUE
// (« Étape 1 / 5 ») par-dessus le Fil, au lieu de l'arrivée directe et des
// aides au geste. Rapport : « c'était l'ancien système de présentation ».
//
// LA CHAÎNE, et pourquoi aucune suite ne pouvait la voir :
//   ① `signUp` ne rend plus de session depuis « Confirm email » (2026-08-30) →
//      un compte neuf n'atteint JAMAIS `onbFinish`, seul endroit qui portait la
//      règle §8 (« le tour long ne doit pas suivre l'inscription ») ;
//   ② le retour (lien de confirmation ou « Se connecter ») passe par
//      `adopterCompteConnecte`, qui PURGE `STATE_KEY` — donc `tourSeen` — puis
//      recharge ;
//   ③ `boot()` pose `onboarded = true` et rend le Fil ;
//   ④ `emoji-misc.js` appelle `initApp()` ~600 ms plus tard, qui teste
//      `!state.tourSeen` — faux depuis la purge — et lance le tour.
//
// ⚠️ L'ANGLE MORT ÉTAIT DANS LE FIXTURE : `onboardedState` (app-helper) pose
// `tourSeen: true`. Les ~120 suites qui l'utilisent démarrent donc TOUTES dans
// le seul état où le défaut ne peut pas se produire. Un fixture qui neutralise
// la condition d'un défaut le rend invisible à toute la batterie.
//
// Ces cas mesurent un VRAI démarrage, pas la fonction : le câblage
// `boot → initApp → launchTourSafe` doit rester couvert.
// ══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { onboardedState, bootOnboarded } = require("./app-helper");

const SRC_TOUR = fs.readFileSync(
  path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js"), "utf8");

// L'état exact que laisse `adopterCompteConnecte` + rechargement : onboardé
// (boot le pose dès qu'une session existe) et SANS `tourSeen`.
function etatCompteNeuf() {
  const s = onboardedState(1);
  delete s.tourSeen;
  return s;
}

// Le tour s'ouvre 800 ms après son appel, lui-même différé de ~600 ms par
// `emoji-misc.js` : on laisse largement passer la fenêtre avant de conclure.
const APRES_LA_FENETRE = 3000;

async function etatDuTour(page) {
  return page.evaluate(() => {
    const o = document.getElementById("tourOverlay");
    const l = document.getElementById("tourStepLabel");
    return {
      ouvert: !!(o && o.classList.contains("active")),
      etape: l ? (l.textContent || "").trim() : "",
      vu: (() => { try { return !!(window.state && window.state.tourSeen); } catch (e) { return null; } })(),
    };
  });
}

test.describe("Le tour historique n'est jamais imposé", () => {
  test("① un compte neuf (tourSeen purgé) entre dans le Fil, sans tour", async ({ page }) => {
    await bootOnboarded(page, null, 1, { state: etatCompteNeuf() });
    await page.waitForTimeout(APRES_LA_FENETRE);

    const tour = await etatDuTour(page);
    expect(tour.ouvert, "le tour historique s'est ouvert sur un compte neuf : " + tour.etape).toBe(false);

    // Et l'arrivée directe a bien eu lieu : le Fil est l'écran actif.
    const ecran = await page.evaluate(() => {
      const a = document.querySelector(".screen.active");
      return a ? a.id : null;
    });
    expect(ecran).toBe("screen-feed");
  });

  test("① bis rien n'est PEINT par-dessus le Fil", async ({ page }) => {
    // ⚠️ ET ON NE MESURE PAS ÇA AVEC `offsetParent`. L'overlay est en
    // `position: fixed` (styles.css, `.tour-overlay`) : `offsetParent` y vaut
    // `null` QUOI QU'IL ARRIVE, affiché comme masqué. Écrite ainsi, cette
    // mesure restait verte sous réinjection du défaut — elle ne prouvait rien.
    // La règle générale : pour un élément fixe, mesurer le `display` calculé et
    // le rectangle, jamais `offsetParent`.
    await bootOnboarded(page, null, 1, { state: etatCompteNeuf() });
    await page.waitForTimeout(APRES_LA_FENETRE);
    const peint = await page.evaluate(() => {
      const o = document.getElementById("tourOverlay");
      if (!o) return { display: "absent", hauteur: 0 };
      const r = o.getBoundingClientRect();
      return { display: getComputedStyle(o).display, hauteur: Math.round(r.height) };
    });
    expect(peint.display).toBe("none");
    expect(peint.hauteur).toBe(0);
  });

  test("② la coupure PASSIO_ONBOARDING_V2 = false rend le parcours historique", async ({ page }) => {
    // La garde ne supprime pas le tour, elle cesse de l'imposer : le kill switch
    // doit continuer à rendre le comportement d'avant, à l'octet près.
    await page.addInitScript(() => { window.PASSIO_ONBOARDING_V2 = false; });
    await bootOnboarded(page, null, 1, { state: etatCompteNeuf() });
    await page.waitForTimeout(APRES_LA_FENETRE);

    const tour = await etatDuTour(page);
    expect(tour.ouvert, "coupure posée : le tour historique doit revenir").toBe(true);
    expect(tour.etape).toMatch(/^Étape 1 \/ \d+$/);
  });

  test("③ « Tour démo » reste un geste disponible", async ({ page }) => {
    // Un refus d'imposer n'est pas un retrait : `startTour` ne passe pas par
    // `launchTourSafe` et doit rester entier.
    await bootOnboarded(page, null, 1, { state: etatCompteNeuf() });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.startTour(); });
    await page.waitForTimeout(300);

    const tour = await etatDuTour(page);
    expect(tour.ouvert, "« Tour démo » ne lance plus rien").toBe(true);
    expect(tour.etape).toMatch(/^Étape 1 \/ \d+$/);
  });

  test("④ à la SOURCE : un seul entonnoir pour les lancements automatiques", async () => {
    // ⚠️ CE CAS NE REGARDE PAS LA PAGE, IL REGARDE LE CODE — et c'est voulu.
    // Les trois cas précédents resteraient verts si un cinquième appelant
    // ouvrait l'overlay sans passer par `launchTourSafe` sur un chemin qu'aucun
    // banc n'emprunte (c'est exactement ainsi que `initApp` a rouvert le défaut,
    // pendant que `onbFinish` portait seul la règle).
    // La garde est bien au sommet de l'entonnoir.
    expect(SRC_TOUR).toMatch(/function launchTourSafe\(\)\s*\{\s*\n?\s*if \(typeof onbV2Actif === "function" && onbV2Actif\(\)\) return;/);

    // `showTour()` n'est atteinte que par le moteur du tour lui-même : sa
    // déclaration, `startTour` (geste manuel), `tourNext` (navigation entre
    // étapes) et `launchTourSafe` (l'entonnoir gardé). Quatre occurrences, pas
    // une de plus — une cinquième serait un chemin qui contourne la garde.
    const occurrences = (SRC_TOUR.match(/(^|[^\w.])showTour\(\)/gm) || []).length;
    expect(occurrences, "un nouvel appelant de showTour() est apparu : le faire passer par launchTourSafe").toBe(4);
  });
});
