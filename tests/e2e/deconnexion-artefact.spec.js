// ═══════════════════════════════════════════════════════════════════════════
// LA DÉCONNEXION VIDE LA TÉLÉMÉTRIE QUAND LE BLOC APP ARRIVE APRÈS 60 S
// (2026-11-10)
//
// `js/identity-transition.js` enveloppe `doLogout` (app-02) : avant que le
// jeton tombe, la déconnexion attend que la file de télémétrie soit vidée.
// Sinon telemetry.js désattribue les lignes du compte au lieu de les envoyer
// sous son identité. Le module n'est PAS dans index.html : `scripts/build.js`
// l'injecte après telemetry.js et l'inline dans le <head>, dans l'artefact
// seulement. Le bloc app, lui, arrive en neuf scripts injectés APRÈS le gate.
// Le module sondait `doLogout` 240 × 250 ms = 60 s sans écouter
// `passio:app-ready` : un bloc app arrivé plus tard laissait toutes les
// déconnexions de la session partir sans vidange, sans aucune erreur. C'est
// latent tant que le gate est levé. Ça devient réel dès qu'il est réarmé : les
// 60 s courent pendant que la personne tape le code.
//
// Même montage que `navigation-artefact.spec.js` : l'artefact construit
// (`scripts/build.js`, 0,2 s) est servi À LA PLACE des fichiers de
// développement, sur la même origine. Un script du bloc est RETENU pendant que
// l'horloge simulée de la page avance : le scénario ne dépend pas de la vitesse
// de la machine. La télémétrie est muette sur localhost : `?telemetry=1`.
//
//   ① le bloc app arrive après la fin du sondage : `doLogout` est l'enveloppe,
//      et une déconnexion attend qu'un envoi de télémétrie en vol soit acquitté
//      avant de commencer ;
//   ② le chargement ordinaire : le sondage enveloppe `doLogout` AVANT
//      `passio:app-ready`, et le signal n'ajoute pas de seconde enveloppe ;
//   ③ un second `passio:app-ready`, sous l'enveloppe d'un autre module qui
//      cache le marqueur, ne pose pas de seconde enveloppe non plus : chaque
//      déconnexion attendrait deux vidanges.
// Fiche : docs/lots-ui/27-UI6A0-ARTEFACT-2026-11-09.md, « Les survivants
// corrigés (2026-11-10) ».
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
// Le sondage abandonne au 240ᵉ essai de 250 ms, soit à 60 s.
const AU_DELA_DU_SONDAGE_MS = 61000;
// La vidange rend la main au bout de 2,8 s, même si un envoi est encore en vol.
const DELAI_DE_LA_VIDANGE_MS = 2800;
const MOTIF_TELEMETRIE = /\/rest\/v1\/telemetry_events(\?|$)/;
const ACTION_SONDE = "deconnexion_artefact_sonde";
const UNE_ENVELOPPE = { retenue: true, couches: 1 };
let dist = null;

test.beforeAll(() => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "passio-deconnexion-artefact-"));
  execFileSync(process.execPath, ["scripts/build.js", path.join(dist, "index.html")], { cwd: RACINE, stdio: "pipe" });
});

test.afterAll(() => {
  if (dist) fs.rmSync(dist, { recursive: true, force: true });
});

// Sert l'artefact à la place des fichiers de développement. Le script du bloc
// app désigné par `retenu` attend `liberer()`. Rend le journal des chemins
// demandés et une promesse tenue à `DOMContentLoaded`.
// ⚠️ APRÈS `page.clock.install()` : le relevé du sondage enveloppe le
// `setInterval` de l'horloge simulée (fiche 27, « À savoir »).
async function servirArtefact(page, baseURL, retenu) {
  const origine = new URL(baseURL).origin;
  const journal = [];
  let liberer;
  const appLiberee = new Promise((ok) => { liberer = ok; });
  let signalerDom;
  const domPret = new Promise((ok) => { signalerDom = ok; });
  await page.exposeFunction("__passioDomPret", () => { signalerDom(); });
  await page.addInitScript(() => {
    // Les intervalles de 250 ms posés avant `DOMContentLoaded` : c'est le
    // sondage de `doLogout`, seul de cette période avant l'application. On
    // relève s'il tourne encore quand le bloc app arrive.
    const poser = window.setInterval;
    const retirer = window.clearInterval;
    const sondages = [];
    let domCharge = false;
    window.setInterval = function (fn, ms) {
      const id = poser.apply(window, arguments);
      if (!domCharge && Number(ms) === 250) sondages.push({ id, actif: true });
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
      window.__moteurAuDcl = typeof window.doLogout;
      window.__moduleAuDcl = typeof window.PassioIdentityTransition;
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

// Les envois de télémétrie, acquittés sur place (201) : rien ne part vers une
// base. `retenir()` arme la retenue : le premier envoi qui arrive ensuite reste
// en vol jusqu'à `liberer()`.
// ⚠️ AVANT la navigation : un envoi du démarrage qui partirait vers le projet
// vide du contexte pourrait y être refusé, et le réessai de telemetry.js
// brouillerait la mesure.
async function telemetrieSurPlace(page) {
  const etat = { recus: 0, acquittes: 0 };
  let armee = false;
  let tenu = false;
  let signalerTenu;
  const enVol = new Promise((ok) => { signalerTenu = ok; });
  let liberer;
  const libere = new Promise((ok) => { liberer = ok; });
  await page.route(MOTIF_TELEMETRIE, async (route) => {
    etat.recus++;
    if (armee && !tenu) {
      tenu = true;
      signalerTenu();
      await libere;
    }
    etat.acquittes++;
    await route.fulfill({ status: 201, contentType: "application/json", body: "" });
  });
  return { etat, retenir: () => { armee = true; }, enVol, liberer };
}

// L'enveloppe de vidange posée sur `doLogout` : retenue par le module, et
// combien de couches la fonction exposée en porte.
async function enveloppe(page) {
  return page.evaluate(() => {
    let couches = 0;
    for (let f = window.doLogout; f && f.__passioTelemetryDrainWrapped; f = f.__passioOriginal) couches++;
    return { retenue: window.PassioIdentityTransition.state().wrappedLogout, couches };
  });
}

// Une déconnexion pendant qu'un envoi de télémétrie est en vol. `doLogout`
// (app-02) commence par `annoncerRechargement()` : une sonde posée sur cette
// fonction dit à quel instant la déconnexion proprement dite démarre, ce qui
// était encore en vol, et si l'événement de la sonde avait quitté la file.
// L'horloge de la page est ARRÊTÉE : la vidange ne peut plus finir par son
// délai de 2,8 s, seulement quand l'envoi retenu est acquitté.
async function deconnexionAttendLaVidange(page, envois) {
  const maintenant = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(maintenant + 1000);
  envois.retenir();
  const depart = await page.evaluate((action) => {
    const demarrages = window.__deconnexionDemarree = [];
    const annoncer = window.annoncerRechargement;
    window.annoncerRechargement = function () {
      demarrages.push({
        t: Date.now(),
        enVol: window.PassioIdentityTransition.state().inFlight,
        sondeEnFile: window.tel._queue().some((e) => e.action === action),
      });
      return annoncer.apply(this, arguments);
    };
    window.tel.track("action", action, { status: "ok" });
    const t0 = Date.now();
    window.doLogout();
    return { t0, demarrages: demarrages.length };
  }, ACTION_SONDE);
  expect(depart.demarrages, "doLogout rend la main sans avoir démarré la déconnexion").toBe(0);

  const tenu = await Promise.race([
    envois.enVol.then(() => true),
    new Promise((ok) => setTimeout(() => ok(false), 10000)),
  ]);
  expect(tenu, "la déconnexion a demandé l'envoi de la file").toBe(true);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.__deconnexionDemarree.length),
    "un envoi est en vol depuis 1 s d'horloge : la déconnexion attend").toBe(0);

  envois.liberer();
  await expect.poll(() => page.evaluate(() => window.PassioIdentityTransition.state().inFlight),
    { message: "l'envoi retenu est acquitté", timeout: 10000 }).toBe(0);
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return page.evaluate(() => window.__deconnexionDemarree.length);
  }, { message: "la déconnexion démarre une fois la file vidée", timeout: 10000 }).toBe(1);

  const [d] = await page.evaluate(() => window.__deconnexionDemarree);
  expect(d.enVol, "plus aucun envoi de télémétrie en vol quand la déconnexion démarre").toBe(0);
  expect(d.sondeEnFile, "l'événement de la sonde est parti avant la déconnexion").toBe(false);
  expect(d.t - depart.t0, "la vidange a fini par l'acquittement, pas par son délai").toBeLessThan(DELAI_DE_LA_VIDANGE_MS);
}

test.describe("Déconnexion sur l'artefact de production : la télémétrie est vidée d'abord", () => {
  // ⚠️ SERVICE WORKER BLOQUÉ. Sous WebKit, une page que le service worker
  // contrôle échappe aux routes du test, même pour un POST qu'il ne traite pas
  // (`sw.js` ignore tout ce qui n'est pas un GET). Mesuré le 2026-11-10 : l'envoi
  // de la déconnexion contournait `telemetrieSurPlace`, ① rougissait (« la
  // déconnexion a demandé l'envoi de la file »), et la sonde arrivait dans la
  // table de production (deux lignes `deconnexion_artefact_sonde`). Le service
  // worker ne touche ni l'enveloppe ni la vidange.
  test.use({ serviceWorkers: "block" });

  test("① le bloc app arrive après la fin du sondage : la déconnexion attend la vidange", async ({ page, baseURL }) => {
    // 61 s d'horloge simulée déclenchent tous les minuteurs de la page en
    // retard : ~6 s sous Chromium, ~55 s sous WebKit (mesuré le 2026-11-10),
    // au-delà des 45 s par défaut.
    test.slow();
    await page.clock.install();
    const envois = await telemetrieSurPlace(page);
    const { journal, domPret, liberer } = await servirArtefact(page, baseURL, /^app\/app-01/);
    const demarrage = bootOnboarded(page, null, 1, { query: "?telemetry=1" });

    // La page est analysée, le bloc app est retenu : 61 s passent à l'horloge
    // de la page, le temps de taper le code d'un gate réarmé.
    await domPret;
    await page.clock.runFor(AU_DELA_DU_SONDAGE_MS);
    expect(await page.evaluate(() => typeof window.doLogout), "le bloc app n'est pas encore là").toBe("undefined");
    expect(await page.evaluate(() => window.__sondagesActifs()),
      "le sondage de doLogout est arrêté avant l'arrivée du bloc app").toEqual([false]);
    liberer();
    await demarrage;

    // C'est bien l'artefact, et bien le scénario de production.
    expect(journal, "la page servie est l'artefact construit").toContain("app/app-02-state-utils.js");
    expect(journal.filter((r) => r.startsWith("js/app-0") || r === "js/identity-transition.js"),
      "aucun fichier de développement").toEqual([]);
    expect(await page.evaluate(() => window.__moduleAuDcl),
      "identity-transition.js tourne déjà à DOMContentLoaded (il n'existe que dans l'artefact)").toBe("object");
    expect(await page.evaluate(() => window.__moteurAuDcl), "doLogout absent à DOMContentLoaded, comme en production").toBe("undefined");
    expect(await page.evaluate(() => window.__appReady), "passio:app-ready est parti une fois").toBe(1);

    expect(await enveloppe(page), "doLogout est l'enveloppe de vidange, une seule fois").toEqual(UNE_ENVELOPPE);
    await deconnexionAttendLaVidange(page, envois);
  });

  test("② chargement ordinaire : le sondage enveloppe doLogout avant passio:app-ready, le signal n'en ajoute pas", async ({ page, baseURL }) => {
    await page.clock.install();
    const { liberer } = await servirArtefact(page, baseURL, /^app\/app-03/);
    const demarrage = bootOnboarded(page, null, 1, { query: "?telemetry=1" });

    // app-02 a défini `doLogout`, app-03 est retenu : le sondage a le temps de
    // passer, comme sur un téléphone où le bloc s'exécute en plus de 250 ms.
    await page.waitForFunction(() => typeof window.doLogout === "function", null, { timeout: 15000, polling: 50 });
    await page.clock.runFor(700);
    expect(await page.evaluate(() => window.__appReady), "passio:app-ready n'est pas encore parti").toBe(0);
    expect(await page.evaluate(() => window.__sondagesActifs()),
      "le sondage a enveloppé doLogout et s'est arrêté").toEqual([false]);
    expect(await enveloppe(page), "le sondage a posé l'enveloppe").toEqual(UNE_ENVELOPPE);
    await page.evaluate(() => { window.__enveloppeDuSondage = window.doLogout; });
    liberer();
    await demarrage;
    expect(await page.evaluate(() => window.__appReady), "passio:app-ready est parti une fois").toBe(1);

    expect(await page.evaluate(() => window.doLogout === window.__enveloppeDuSondage),
      "le signal n'a rien posé par-dessus l'enveloppe du sondage").toBe(true);
    expect(await enveloppe(page), "toujours une seule enveloppe").toEqual(UNE_ENVELOPPE);
  });

  test("③ un second passio:app-ready, sous l'enveloppe d'un autre module, ne pose pas de seconde enveloppe", async ({ page, baseURL }) => {
    await page.clock.install();
    await servirArtefact(page, baseURL, null);
    await bootOnboarded(page, null, 1, { query: "?telemetry=1" });
    expect(await page.evaluate(() => window.__appReady), "passio:app-ready est parti une fois").toBe(1);
    expect(await enveloppe(page), "doLogout est l'enveloppe de vidange").toEqual(UNE_ENVELOPPE);

    const intacte = await page.evaluate(() => {
      // Un autre module enveloppe `doLogout` par-dessus la vidange : la
      // fonction exposée ne porte plus le marqueur.
      const videe = window.doLogout;
      const etrangere = function () { return videe.apply(this, arguments); };
      window.doLogout = etrangere;
      window.dispatchEvent(new Event("passio:app-ready"));
      return window.doLogout === etrangere;
    });
    expect(intacte, "le second signal n'a pas posé de seconde vidange par-dessus l'autre module").toBe(true);
  });
});
