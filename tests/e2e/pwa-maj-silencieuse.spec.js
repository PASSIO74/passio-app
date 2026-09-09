// ═══════════════════════════════════════════════════════════════════════════
// PWA — LA VÉRIFICATION DE MISE À JOUR NE DOIT RIEN REMONTER
//
// Défaut relevé par la sentinelle le 2026-09-08 sur la production : cinq
// remontées en 24 h, un seul compte,
//
//     Promise rejetée: newestWorker is null
//     update@[native code]
//     @https://passio-app.netlify.app/:6:41270
//
// « newestWorker is null » est le libellé de WebKit (iOS/Safari) quand
// `ServiceWorkerRegistration.update()` est demandé sur une registration qui n'a
// plus AUCUN worker (installing, waiting et active tous nuls : désinscription,
// worker devenu redondant, stockage du site vidé). Le seul appelant du dépôt
// est `js/pwa-detect.js` — au démarrage, puis toutes les 60 s.
//
// ⚠️ CE QUI RENDAIT LE DÉFAUT VISIBLE JUSQU'EN BASE : `update()` rend une
// PROMESSE, et le `try/catch` qui entoure le bloc ne l'attrape pas (elle rejette
// plus tard, hors de la pile). Le rejet partait donc dans `unhandledrejection`
// (js/platform.js) → `client_errors`, alors qu'il n'a aucun effet pour
// l'utilisateur : une vérification d'arrière-plan qui n'aboutit pas ne se
// raconte pas.
//
// Ce que ce banc garde — et il ÉCHOUE sur le code d'avant (réinjection) :
//   ① registration sans worker → on ne demande même pas la mise à jour ;
//   ② registration avec worker et `update()` qui rejette → rien ne remonte,
//      mais la vérification A BIEN ÉTÉ DEMANDÉE (le correctif ne l'éteint pas) ;
//   ③ cas nominal → la vérification part toujours ;
//   ④ contrat de source : UN SEUL point d'appel, celui qui est gardé — sans quoi
//      la minuterie de 60 s rouvrirait le défaut à elle seule, une fois par
//      minute, hors de portée d'un test de démarrage.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SOURCE_PWA = path.join(__dirname, "..", "..", "js", "pwa-detect.js");

/**
 * Remplace le conteneur `navigator.serviceWorker` par un faux AVANT tout script
 * de la page : `pwa-detect` s'enregistre sur `load`, un stub posé après ne
 * mesurerait plus rien. Le faux registre est celui de la panne : ses trois
 * workers sont nuls quand `worker` est faux, et son `update()` rejette comme
 * WebKit quand `rejette` est vrai.
 */
async function faussePWA(page, { worker, rejette }) {
  // Les écritures de monitoring ne doivent JAMAIS partir en production depuis un
  // test : sur le code défectueux ce banc PROVOQUE le rejet, donc la remontée.
  await page.route("**/rest/v1/client_errors*", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
  await page.route("**/rest/v1/telemetry_events*", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));

  await page.addInitScript((cfg) => {
    window.__rejets = [];
    window.addEventListener("unhandledrejection", function (e) {
      var r = (e && e.reason) || {};
      window.__rejets.push(String(r.message || r));
    });
    window.__majAppels = 0;
    var faux = {
      installing: null,
      waiting: null,
      active: cfg.worker ? { postMessage: function () {} } : null,
      addEventListener: function () {},
      update: function () {
        window.__majAppels++;
        return cfg.rejette
          ? Promise.reject(new TypeError("newestWorker is null"))
          : Promise.resolve();
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: null,
        ready: Promise.resolve(faux),
        register: function () { return Promise.resolve(faux); },
        getRegistration: function () { return Promise.resolve(faux); },
        addEventListener: function () {},
        removeEventListener: function () {},
      },
    });
  }, { worker: !!worker, rejette: !!rejette });
}

/** Les rejets non capturés qui parlent du service worker, et eux seuls. */
async function rejetsServiceWorker(page) {
  const tous = await page.evaluate(() => window.__rejets || []);
  return tous.filter((m) => /newestWorker|serviceWorker|ServiceWorker/i.test(m));
}

test.describe("PWA — vérification de mise à jour silencieuse", () => {
  test("① registration sans worker : aucune mise à jour demandée, aucun rejet remonté", async ({ page }) => {
    await faussePWA(page, { worker: false, rejette: true });
    await bootOnboarded(page);

    expect(await page.evaluate(() => window.__majAppels)).toBe(0);
    expect(await rejetsServiceWorker(page)).toEqual([]);
  });

  test("② update() qui rejette : rien ne remonte, mais la vérification est demandée", async ({ page }) => {
    await faussePWA(page, { worker: true, rejette: true });
    await bootOnboarded(page);

    // Le correctif AVALE le rejet ; il ne débranche pas la vérification.
    expect(await page.evaluate(() => window.__majAppels)).toBe(1);
    expect(await rejetsServiceWorker(page)).toEqual([]);
  });

  test("③ cas nominal : la vérification de mise à jour part toujours", async ({ page }) => {
    await faussePWA(page, { worker: true, rejette: false });
    await bootOnboarded(page);

    expect(await page.evaluate(() => window.__majAppels)).toBe(1);
    expect(await rejetsServiceWorker(page)).toEqual([]);
  });

  test("④ contrat de source : un seul appel à update(), et la minuterie passe par lui", async () => {
    const src = fs.readFileSync(SOURCE_PWA, "utf8");

    // Un seul point d'appel : c'est LUI qui porte la garde et le `catch`.
    const appels = src.match(/\.update\s*\(/g) || [];
    expect(appels.length).toBe(1);

    // La minuterie ne rappelle pas `update()` directement : sinon elle rouvrirait
    // le défaut toutes les 60 s, hors de portée d'un banc de démarrage.
    expect(src).not.toMatch(/setInterval\([^;]*\.update\s*\(/);

    // Et le rejet est explicitement avalé.
    expect(src).toMatch(/\.catch\s*\(/);
  });
});
