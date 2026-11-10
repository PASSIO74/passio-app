// ═══════════════════════════════════════════════════════════════════════════
// LA NAVIGATION RESTE MESURÉE QUAND LE BLOC APP ARRIVE APRÈS 18 S (2026-11-10)
//
// `js/telemetry.js` et `js/perf-ios.js` enveloppent `goTo` (app-02) pour
// compter la navigation : `screen_view` et `_telScreen` d'un côté, parcours
// `nav_*` et `feed_to_irl` de l'autre. Dans l'artefact de production, les deux
// sont inlinés dans le <head>, et le bloc app arrive en neuf scripts injectés
// APRÈS le gate. Ils sondaient `goTo` 60 × 300 ms = 18 s sans écouter
// `passio:app-ready` : un bloc app arrivé plus tard perdait la navigation de
// toute la session, sans aucune erreur. C'est latent tant que le gate est levé
// (11 chargements publics en trois jours, 2,8 s au plus). Ça devient réel dès
// qu'il est réarmé : les 18 s courent pendant que la personne tape le code.
//
// La suite construit l'artefact (`scripts/build.js`, 0,2 s) et le sert À LA
// PLACE des fichiers de développement, sur la même origine (le motif de
// `ui-v6a0-artefact.spec.js`). Un script du bloc est RETENU pendant que
// l'horloge simulée de la page avance : le scénario ne dépend pas de la vitesse
// de la machine. La télémétrie est muette sur localhost : `?telemetry=1`.
//
//   ① le bloc app arrive après la fin des deux sondages : la navigation est
//      comptée, et une seule fois (`screen_view`, `nav_irl`, `feed_to_irl`) ;
//   ② le chargement ordinaire d'un téléphone : les sondages enveloppent `goTo`
//      AVANT `passio:app-ready`. Le signal n'ajoute pas d'enveloppe. Une garde
//      au seul marqueur en ajouterait une : perf-ios.js enveloppe par-dessus
//      telemetry.js et cache `goTo.__tel`, et la navigation serait comptée deux
//      fois chez tout le monde ;
//   ③ un second `passio:app-ready`, sous l'enveloppe d'un autre module qui
//      cache les marqueurs `__tel` et `__perf`, ne pose pas de seconde
//      enveloppe non plus.
// Fiche : docs/lots-ui/27-UI6A0-ARTEFACT-2026-11-09.md, « Les survivants ».
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
// Les deux sondages abandonnent au 61ᵉ essai de 300 ms, soit à 18,3 s.
const AU_DELA_DU_SONDAGE_MS = 19000;
let dist = null;

test.beforeAll(() => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "passio-nav-artefact-"));
  execFileSync(process.execPath, ["scripts/build.js", path.join(dist, "index.html")], { cwd: RACINE, stdio: "pipe" });
});

test.afterAll(() => {
  if (dist) fs.rmSync(dist, { recursive: true, force: true });
});

// Sert l'artefact à la place des fichiers de développement. Le script du bloc
// app désigné par `retenu` attend `liberer()`. Rend le journal des chemins
// demandés (la preuve que c'est l'artefact qui a tourné) et une promesse tenue
// à `DOMContentLoaded`.
// ⚠️ APRÈS `page.clock.install()` : le relevé des sondages enveloppe le
// `setInterval` de l'horloge simulée. Avant elle, l'horloge le remplacerait et
// le relevé resterait vide.
async function servirArtefact(page, baseURL, retenu) {
  const origine = new URL(baseURL).origin;
  const journal = [];
  let liberer;
  const appLiberee = new Promise((ok) => { liberer = ok; });
  let signalerDom;
  const domPret = new Promise((ok) => { signalerDom = ok; });
  await page.exposeFunction("__passioDomPret", () => { signalerDom(); });
  await page.addInitScript(() => {
    // Les intervalles de 300 ms posés avant `DOMContentLoaded` : ce sont les
    // deux sondages de `goTo` (telemetry.js puis perf-ios.js), et eux seuls
    // dans le <head>. On relève s'ils tournent encore quand le bloc app arrive.
    const poser = window.setInterval;
    const retirer = window.clearInterval;
    const sondages = [];
    let domCharge = false;
    window.setInterval = function (fn, ms) {
      const id = poser.apply(window, arguments);
      if (!domCharge && Number(ms) === 300) sondages.push({ id, actif: true });
      return id;
    };
    window.clearInterval = function (id) {
      for (const s of sondages) if (s.id === id) s.actif = false;
      return retirer.apply(window, arguments);
    };
    window.__sondagesActifs = () => sondages.map((s) => s.actif);
    window.__appReady = 0;
    window.addEventListener("passio:app-ready", () => { window.__appReady++; });
    document.addEventListener("DOMContentLoaded", () => {
      domCharge = true;
      window.__moteurAuDcl = typeof window.goTo;
      window.__passioDomPret();
    }, { once: true });
  });
  await page.route((url) => url.origin === origine, async (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, "") || "index.html";
    journal.push(rel);
    if (retenu && retenu.test(rel)) await appLiberee;
    const f = path.join(dist, rel);
    if (f.startsWith(dist + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ path: f });
    return route.continue();
  });
  return { journal, domPret, liberer };
}

// Une navigation du fil vers Rencontrer, et ce qu'elle laisse derrière elle.
// Les `screen_view` sont lus dans la file de telemetry.js, DANS LA MÊME TÂCHE
// que `goTo` : aucun envoi n'a pu les en retirer. Les parcours de perf-ios.js
// se closent à la peinture, ou au bout de 1,5 s faute de peinture : l'horloge
// avance de 2 s avant de les compter.
async function naviguerVersRencontrer(page) {
  const r = await page.evaluate(() => {
    const vues = () => window.tel._queue().filter((e) => e.action === "screen_view" && e.screen === "irl").length;
    const ecranAvant = (document.querySelector(".screen.active") || {}).id || null;
    const avant = vues();
    goTo("irl");
    return { ecranAvant, vues: vues() - avant, telScreen: window._telScreen };
  });
  await page.clock.runFor(2000);
  const parcours = await page.evaluate(() => ({
    nav: (window.PassioPerf.stats("nav_irl") || { n: 0 }).n,
    pont: (window.PassioPerf.stats("feed_to_irl") || { n: 0 }).n,
  }));
  return { ...r, ...parcours };
}

// `expect.soft` : chacun des deux modules rend son verdict, même quand l'autre
// a échoué.
function uneFoisChacun(r) {
  expect(r.ecranAvant, "la navigation part du fil").toBe("screen-feed");
  expect.soft(r.vues, "telemetry.js : une navigation, un screen_view (0 : goTo n'est pas enveloppé ; 2 : il l'est deux fois)").toBe(1);
  expect.soft(r.telScreen, "telemetry.js : _telScreen suit l'écran").toBe("irl");
  expect.soft(r.nav, "perf-ios.js : un parcours nav_irl (0 : goTo n'est pas enveloppé ; 2 : il l'est deux fois)").toBe(1);
  expect.soft(r.pont, "perf-ios.js : un parcours feed_to_irl").toBe(1);
}

test.describe("Navigation mesurée sur l'artefact de production", () => {
  test("① le bloc app arrive après la fin des deux sondages : la navigation est comptée, une fois", async ({ page, baseURL }) => {
    await page.clock.install();
    const { journal, domPret, liberer } = await servirArtefact(page, baseURL, /^app\/app-01/);
    const demarrage = bootOnboarded(page, null, 1, { query: "?telemetry=1" });

    // La page est analysée, le bloc app est retenu : 19 s passent à l'horloge de
    // la page, le temps de taper le code d'un gate réarmé.
    await domPret;
    await page.clock.runFor(AU_DELA_DU_SONDAGE_MS);
    expect(await page.evaluate(() => typeof window.goTo), "le bloc app n'est pas encore là").toBe("undefined");
    expect(await page.evaluate(() => window.__sondagesActifs()),
      "les deux sondages de goTo (telemetry.js, perf-ios.js) sont arrêtés avant l'arrivée du bloc app").toEqual([false, false]);
    liberer();
    await demarrage;

    // C'est bien l'artefact, et bien le scénario de production.
    expect(journal, "la page servie est l'artefact construit").toContain("app/app-02-state-utils.js");
    expect(journal.filter((r) => r.startsWith("js/app-0") || r === "js/telemetry.js" || r === "js/perf-ios.js"),
      "aucun fichier de développement").toEqual([]);
    expect(await page.evaluate(() => window.__moteurAuDcl), "goTo absent à DOMContentLoaded, comme en production").toBe("undefined");
    expect(await page.evaluate(() => window.__appReady), "passio:app-ready est parti une fois").toBe(1);

    uneFoisChacun(await naviguerVersRencontrer(page));
  });

  test("② chargement ordinaire : les sondages enveloppent goTo avant passio:app-ready, le signal n'en ajoute pas", async ({ page, baseURL }) => {
    await page.clock.install();
    const { liberer } = await servirArtefact(page, baseURL, /^app\/app-03/);
    const demarrage = bootOnboarded(page, null, 1, { query: "?telemetry=1" });

    // app-02 a défini `goTo`, app-03 est retenu : les sondages ont le temps de
    // passer (deux tours), comme sur un téléphone où le bloc s'exécute en plus
    // de 300 ms.
    await page.waitForFunction(() => typeof window.goTo === "function", null, { timeout: 15000, polling: 50 });
    await page.clock.runFor(700);
    expect(await page.evaluate(() => window.__appReady), "passio:app-ready n'est pas encore parti").toBe(0);
    expect(await page.evaluate(() => window.__sondagesActifs()),
      "les deux sondages ont enveloppé goTo et se sont arrêtés").toEqual([false, false]);
    expect(await page.evaluate(() => window.goTo.__perf === true && !window.goTo.__tel),
      "perf-ios.js a enveloppé par-dessus telemetry.js : le marqueur __tel est caché").toBe(true);
    liberer();
    await demarrage;
    expect(await page.evaluate(() => window.__appReady), "passio:app-ready est parti une fois").toBe(1);

    uneFoisChacun(await naviguerVersRencontrer(page));
  });

  test("③ un second passio:app-ready, sous l'enveloppe d'un autre module, ne double pas le compte", async ({ page, baseURL }) => {
    await page.clock.install();
    await servirArtefact(page, baseURL, null);
    await bootOnboarded(page, null, 1, { query: "?telemetry=1" });
    expect(await page.evaluate(() => window.__appReady), "passio:app-ready est parti une fois").toBe(1);

    await page.evaluate(() => {
      // Un autre module enveloppe `goTo` par-dessus les deux mesures : la
      // fonction exposée ne porte plus ni `__tel` ni `__perf`.
      const mesuree = window.goTo;
      window.goTo = function () { return mesuree.apply(this, arguments); };
      window.dispatchEvent(new Event("passio:app-ready"));
    });

    uneFoisChacun(await naviguerVersRencontrer(page));
  });
});
