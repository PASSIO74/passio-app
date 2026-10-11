// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — UN ÉVÉNEMENT PART UNE FOIS, ET UN SUCCÈS NE JETTE QUE CE QUI
// EST PARTI (2026-10-11)
//
// Mesuré en production sur 30 jours (`telemetry_events`, env = production) :
// 718 lignes sur 3 949 (18 %) étaient la copie d'un événement déjà reçu (même
// `event_id`), dont 602 arrivées moins de 5 s après l'original. Exemple vécu le
// 2026-10-04 : UN tap sur « Continuer avec Google », enregistré QUATRE fois —
// lu au pilotage comme quatre taps d'un visiteur qui s'impatiente.
//
// Mécanisme : le chemin `keepalive` (onglet masqué, `pagehide`) ignore
// `sending` et reprenait `queue.slice(0, 20)` — la TÊTE de la file, donc
// exactement les événements déjà partis dans la requête ordinaire en vol — puis
// chaque succès retirait `batch.length` événements de la tête. Deux défauts :
//   · des DOUBLONS, qui gonflent tout ce qui se compte ;
//   · des PERTES : le second retrait jetait des événements jamais envoyés,
//     sans la moindre trace.
//
// Ce banc garde :
//   ① onglet masqué pendant un envoi ordinaire : le keepalive ne reprend PAS ce
//      qui est en vol — chaque événement arrive une fois ;
//   ② un succès retire CE qui est parti, par identité : un événement arrivé
//      entre-temps n'est pas jeté, il part au tour suivant ;
//   ③ `pagehide` : ce qu'une requête ORDINAIRE porte est doublé en keepalive
//      (le navigateur l'annule au déchargement) — c'est l'exception voulue, sans
//      elle une visite qui se termine perdrait ses derniers gestes ;
//   ④ masquage puis `pagehide` : un événement déjà parti en KEEPALIVE n'est
//      jamais redoublé (le keepalive survit au déchargement).
//
// ⚠️ AUCUN OCTET NE PART VERS LA TABLE DE PRODUCTION : tous les POST vers
// `telemetry_events` sont interceptés (201 simulé, retenus, ou annulés), et
// `fetch` est neutralisé avant la fermeture du contexte.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { poserGateSansPremiereVisite } = require("./gate-helper");

const MOTIF_TEL = "**/rest/v1/telemetry_events*";

// Intercepteur à trois modes : « ok » répond 201, « retenu » garde la requête
// EN VOL jusqu'à ce que le banc la règle, « annule » la coupe comme le fait le
// navigateur au déchargement. Chaque lot est journalisé avec son mode.
async function intercepter(page) {
  const etat = { mode: "ok", lots: [], retenus: [] };
  await page.route(MOTIF_TEL, (route) => {
    let rows = [];
    try { rows = JSON.parse(route.request().postData() || "[]"); } catch (e) { rows = []; }
    if (!Array.isArray(rows)) rows = [];
    // `issue` : ce que le « serveur » a fait du lot — c'est elle qui décide s'il
    // est ARRIVÉ, jamais le mode en vigueur à l'envoi (un lot retenu peut finir
    // annulé, comme le fait le navigateur au déchargement).
    const lot = { mode: etat.mode, rows, issue: etat.mode === "retenu" ? "en_vol" : etat.mode };
    etat.lots.push(lot);
    if (etat.mode === "annule") return route.abort("failed");
    if (etat.mode === "retenu") { etat.retenus.push({ route, lot }); return undefined; }
    return route.fulfill({ status: 201, body: "" });
  });
  return etat;
}

async function charger(page, etat) {
  await poserGateSansPremiereVisite(page);
  await page.goto("/index.html?telemetry=1");
  await page.waitForSelector("#landing.active", { timeout: 30000 });
  expect(await page.evaluate(() => !!(window.tel && window.tel.enabled)), "télémétrie active").toBe(true);
  await expect.poll(() => etat.lots.filter((l) => l.mode === "ok").length, {
    message: "aucun lot de télémétrie n'est parti en 30 s", timeout: 30000,
  }).toBeGreaterThan(0);
  // Laisse s'écouler ce que le démarrage a encore en file : chaque cas part
  // d'une file vide, sans envoi en vol.
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.tel.flush());
  await page.waitForTimeout(500);
}

const emettre = (page, noms) => page.evaluate((n) => { n.forEach((x) => window.tel.action(x)); }, noms);
const masquer = (page, cache) => page.evaluate((c) => {
  Object.defineProperty(document, "visibilityState", { get: () => (c ? "hidden" : "visible"), configurable: true });
  Object.defineProperty(document, "hidden", { get: () => c, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}, cache);
const regler = async (etat) => {
  while (etat.retenus.length) { const r = etat.retenus.shift(); r.lot.issue = "ok"; await r.route.fulfill({ status: 201, body: "" }); }
};
const annulerEnVol = async (etat) => {
  while (etat.retenus.length) { const r = etat.retenus.shift(); r.lot.issue = "annule"; await r.route.abort("failed"); }
};

// Combien de fois chaque événement nommé est arrivé « au serveur » : les lots
// répondus 201, immédiatement ou après avoir été retenus — jamais un lot annulé.
function arrivees(etat, noms) {
  const n = {};
  noms.forEach((x) => { n[x] = 0; });
  etat.lots.filter((l) => l.issue === "ok").forEach((l) => l.rows.forEach((r) => {
    if (r && r.type === "action" && r.action in n) n[r.action]++;
  }));
  return n;
}
const enFile = (page, noms) => page.evaluate((n) => window.tel._queue()
  .filter((r) => r && r.type === "action" && n.includes(r.action)).map((r) => r.action), noms);

async function fermerSansTrafic(page, ctx) {
  await page.evaluate(() => { window.fetch = function () { return Promise.reject(new Error("e2e: contexte fermé")); }; }).catch(() => {});
  await ctx.close();
}

test.describe("Télémétrie — un événement part une fois", () => {
  test("① onglet masqué pendant un envoi : le keepalive ne reprend pas ce qui est en vol", async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const etat = await intercepter(page);
    await charger(page, etat);
    const noms = ["e2e_a1", "e2e_a2", "e2e_a3"];

    etat.mode = "retenu";
    await emettre(page, noms);
    await page.evaluate(() => window.tel.flush());
    await expect.poll(() => etat.retenus.length, { message: "l'envoi ordinaire est en vol" }).toBe(1);

    etat.mode = "ok";
    await masquer(page, true);            // → flush({ keepalive: true })
    await page.waitForTimeout(500);
    await regler(etat);                   // l'envoi ordinaire aboutit
    await page.waitForTimeout(500);

    expect(arrivees(etat, noms), "chaque événement arrive UNE fois").toEqual({ e2e_a1: 1, e2e_a2: 1, e2e_a3: 1 });
    expect(await enFile(page, noms), "et plus rien d'eux n'attend en file").toEqual([]);
    await fermerSansTrafic(page, ctx);
  });

  test("② un succès retire ce qui est parti, jamais un événement arrivé entre-temps", async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const etat = await intercepter(page);
    await charger(page, etat);
    const enVol = ["e2e_b1", "e2e_b2", "e2e_b3"];
    const pendant = ["e2e_c1", "e2e_c2", "e2e_c3"];
    const apres = ["e2e_d1", "e2e_d2", "e2e_d3"];

    etat.mode = "retenu";
    await emettre(page, enVol);
    await page.evaluate(() => window.tel.flush());
    await expect.poll(() => etat.retenus.length, { message: "l'envoi ordinaire est en vol" }).toBe(1);

    // Pendant le vol : de nouveaux événements, puis un masquage bref (keepalive
    // qui part et aboutit), puis le retour au premier plan.
    etat.mode = "ok";
    await emettre(page, pendant);
    await masquer(page, true);
    await page.waitForTimeout(500);
    await masquer(page, false);
    // Encore des événements, qui attendent leur tour derrière l'envoi en vol.
    await emettre(page, apres);
    await page.waitForTimeout(200);

    await regler(etat);                   // l'envoi ordinaire aboutit enfin
    await page.waitForTimeout(500);
    // L'ancien code retirait ici les TROIS PREMIERS de la file — c'est-à-dire
    // `apres`, jamais envoyés. Ils doivent être là, ou déjà partis.
    const restants = await enFile(page, apres);
    const partis = arrivees(etat, apres);
    apres.forEach((x) => {
      expect(restants.includes(x) || partis[x] === 1, `${x} n'est pas perdu`).toBe(true);
    });
    await page.evaluate(() => window.tel.flush());
    await page.waitForTimeout(800);
    expect(arrivees(etat, enVol.concat(pendant, apres)), "chacun arrive exactement une fois").toEqual({
      e2e_b1: 1, e2e_b2: 1, e2e_b3: 1, e2e_c1: 1, e2e_c2: 1, e2e_c3: 1, e2e_d1: 1, e2e_d2: 1, e2e_d3: 1,
    });
    await fermerSansTrafic(page, ctx);
  });

  test("③ pagehide : ce qu'une requête ordinaire porte est doublé en keepalive (anti-perte)", async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const etat = await intercepter(page);
    await charger(page, etat);
    const noms = ["e2e_e1", "e2e_e2", "e2e_e3"];

    etat.mode = "retenu";
    await emettre(page, noms);
    await page.evaluate(() => window.tel.flush());
    await expect.poll(() => etat.retenus.length, { message: "l'envoi ordinaire est en vol" }).toBe(1);

    etat.mode = "ok";
    await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); });
    await page.waitForTimeout(500);
    // Le navigateur annule la requête ordinaire au déchargement.
    await annulerEnVol(etat);
    await page.waitForTimeout(500);

    expect(arrivees(etat, noms), "le keepalive les a portés, une fois").toEqual({ e2e_e1: 1, e2e_e2: 1, e2e_e3: 1 });
    expect(await enFile(page, noms), "et la file ne les rejouera pas").toEqual([]);
    await fermerSansTrafic(page, ctx);
  });

  test("④ masquage puis pagehide : un événement parti en keepalive n'est jamais redoublé", async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const etat = await intercepter(page);
    await charger(page, etat);
    const noms = ["e2e_f1", "e2e_f2", "e2e_f3"];

    await emettre(page, noms);
    etat.mode = "retenu";
    await masquer(page, true);            // keepalive n° 1, retenu en vol
    await expect.poll(() => etat.retenus.length, { message: "le premier keepalive est en vol" }).toBe(1);

    etat.mode = "ok";
    await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); });   // keepalive n° 2
    await page.waitForTimeout(500);
    await regler(etat);
    await page.waitForTimeout(500);

    expect(arrivees(etat, noms), "chaque événement arrive UNE fois").toEqual({ e2e_f1: 1, e2e_f2: 1, e2e_f3: 1 });
    await fermerSansTrafic(page, ctx);
  });
});
