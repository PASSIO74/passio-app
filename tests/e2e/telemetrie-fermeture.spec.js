// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — UNE FERMETURE DE PAGE N'EST PAS UNE PANNE RÉSEAU
//
// Constat du 2026-09-13 dans le centre de pilotage : bug « Échec d'envoi de la
// télémétrie #1 (appareil peut-être hors ligne) », gravité error, 9 occurrences
// sur 5 appareils d'un seul testeur — cinq fermetures d'onglet, aucune coupure.
//
// Mécanisme : au `pagehide`, le navigateur ANNULE les requêtes en vol (c'est son
// comportement normal). Or telemetry.js et perf-ios.js émettent à cet instant un
// burst (fin de session + ~8 snapshots « exit ») qui franchit le seuil de 12 et
// déclenche un envoi non-keepalive… aussitôt annulé. `onSendFailure` prenait
// cette annulation pour « appareil injoignable », fabriquait une alarme
// `connectivity/send_failed`, la persistait dans le backlog et la rejouait au
// chargement suivant. Et comme l'alarme relançait elle-même un envoi, qui
// échouait de nouveau, le compteur atteignait 3 en quelques millisecondes :
// gravité « error » sur un appareil parfaitement en ligne.
//
// Deux tests, symétriques — retirer l'un rendrait l'autre trompeur :
//   1. un échec d'envoi PENDANT une fermeture de page ne produit AUCUNE alarme,
//      et rien n'est perdu (le lot reste dans le backlog persistant) ;
//   2. un échec d'envoi page VISIBLE et EN LIGNE lève TOUJOURS l'alarme — y
//      compris après un `pageshow` (retour de bfcache), qui doit réarmer le
//      drapeau. Sans ce test, un `unloading` jamais remis à faux passerait vert.
//
// ⚠️ AUCUN OCTET NE PART VERS LA TABLE DE PRODUCTION. Il n'existe qu'une seule
// base Supabase : ce qui part de localhost avec `?telemetry=1` y atterrit. Tous
// les POST vers telemetry_events sont donc interceptés ici (201 simulé, ou
// annulation pour simuler ce que fait le navigateur), et `fetch` est neutralisé
// avant la fermeture du contexte — le `pagehide` réel de la fermeture émet un
// dernier lot keepalive que l'interception ne rattrape pas toujours.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { poserGateSansPremiereVisite } = require("./gate-helper");

const MOTIF_TEL = "**/rest/v1/telemetry_events*";
const BACKLOG_KEY = "passio_tel_backlog";

const estAlarme = (r) => r && r.type === "connectivity" && r.action === "send_failed";

// Intercepteur à deux modes : « ok » répond 201 (l'envoi réussit), « annule »
// coupe la requête comme le fait le navigateur au déchargement. Chaque lot est
// journalisé avec le mode en vigueur, qu'il ait abouti ou non.
async function intercepter(page) {
  const etat = { mode: "ok", lots: [] };
  await page.route(MOTIF_TEL, (route) => {
    const req = route.request();
    let rows = [];
    try { rows = JSON.parse(req.postData() || "[]"); } catch (e) { rows = []; }
    if (!Array.isArray(rows)) rows = [];
    etat.lots.push({ mode: etat.mode, rows });
    if (etat.mode === "annule") return route.abort("failed");
    return route.fulfill({ status: 201, body: "" });
  });
  return etat;
}

const lireBacklog = (page) => page.evaluate((k) => {
  try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}, BACKLOG_KEY);

// Charge l'app en capture forcée et attend qu'un premier lot soit PARTI avec
// succès : la config d'envoi est prête et les compteurs d'échec sont à zéro.
async function chargerEtAttendrePremierEnvoi(page, etat) {
  await poserGateSansPremiereVisite(page);
  await page.goto("/index.html?telemetry=1");
  await page.waitForSelector("#landing.active", { timeout: 30000 });
  expect(await page.evaluate(() => !!(window.tel && window.tel.enabled)), "télémétrie active").toBe(true);
  await expect.poll(() => etat.lots.filter((l) => l.mode === "ok").length, {
    message: "aucun lot de télémétrie n'est parti en 30 s",
    timeout: 30000,
  }).toBeGreaterThan(0);
}

// Coupe tout envoi résiduel (pagehide réel de la fermeture) avant de fermer.
async function fermerSansTrafic(page, ctx) {
  await page.evaluate(() => { window.fetch = function () { return Promise.reject(new Error("e2e: contexte fermé")); }; }).catch(() => {});
  await ctx.close();
}

test.describe("Télémétrie — fermeture de page ≠ panne réseau", () => {
  test("un envoi annulé pendant la fermeture ne fabrique aucune alarme, et rien n'est perdu", async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const etat = await intercepter(page);
    await chargerEtAttendrePremierEnvoi(page, etat);
    const sessionId = await page.evaluate(() => window.tel.sessionId);

    // À partir d'ici, le réseau se comporte comme au déchargement : chaque
    // requête meurt. Puis on déclenche ce que fait le navigateur quand l'onglet
    // se ferme — les DEUX écouteurs `pagehide` (telemetry.js puis perf-ios.js)
    // se succèdent dans l'ordre de chargement, burst de snapshots compris.
    etat.mode = "annule";
    await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); });
    await page.waitForTimeout(2500);         // laisse les rejets se propager

    const annules = etat.lots.filter((l) => l.mode === "annule");
    expect(annules.length, "le chemin d'échec doit avoir été exercé (aucun envoi annulé observé)").toBeGreaterThan(0);

    // ── Le constat qui compte ──────────────────────────────────────────────
    // Ni dans ce qui a tenté de partir, ni dans ce qui sera rejoué au prochain
    // chargement : aucune « panne réseau » fabriquée.
    const backlog = await lireBacklog(page);
    const alarmesEnvoyees = annules.flatMap((l) => l.rows).filter(estAlarme);
    const alarmesPersistees = backlog.filter(estAlarme);
    expect(alarmesEnvoyees.map((r) => r.message), "alarme send_failed dans un lot parti à la fermeture").toEqual([]);
    expect(alarmesPersistees.map((r) => r.message), "alarme send_failed persistée pour rejeu").toEqual([]);

    // Et rien n'est perdu : la fin de session annulée attend dans le backlog,
    // prête à être rejouée au chargement suivant (loadBacklog).
    const finDeSession = backlog.filter((r) => r.type === "session" && r.action === "end" && r.session_id === sessionId);
    expect(finDeSession.length, "la fin de session annulée doit rester dans le backlog").toBeGreaterThan(0);

    await fermerSansTrafic(page, ctx);
  });

  test("page visible et en ligne, un échec d'envoi lève toujours l'alarme — même après un retour de bfcache", async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const etat = await intercepter(page);
    await chargerEtAttendrePremierEnvoi(page, etat);

    // Aller-retour : la page « part » puis « revient » (bfcache). Le drapeau de
    // déchargement doit être retombé, sinon toute panne réelle serait avalée
    // en silence pour le reste de la vie de l'onglet.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("pagehide"));
      window.dispatchEvent(new Event("pageshow"));
    });
    await page.waitForTimeout(1000);         // les lots keepalive de l'aller-retour aboutissent (mode ok)

    // Maintenant une VRAIE panne inexpliquée : page visible, navigateur en ligne,
    // et pourtant l'envoi meurt. Celle-là doit remonter.
    etat.mode = "annule";
    await page.evaluate(() => { window.tel.action("e2e_panne_visible"); window.tel.flush(); });
    await expect.poll(async () => (await lireBacklog(page)).filter(estAlarme).length, {
      message: "un échec inexpliqué (page visible, en ligne) doit produire une alarme send_failed",
      timeout: 15000,
    }).toBeGreaterThan(0);

    const alarme = (await lireBacklog(page)).filter(estAlarme)[0];
    expect(alarme.severity, "première alarme : avertissement, pas erreur").toBe("warn");
    expect(alarme.status).toBe("error");

    await fermerSansTrafic(page, ctx);
  });

  // ── 2026-09-19 : iOS coupe les requêtes AVANT de dire que la page se cache ──
  // Chronologie réelle du pilotage : GET /passions, /events, /posts et le POST
  // télémétrie tous en `error` à la même seconde, page « visible » et en ligne,
  // puis `lifecycle hidden` UNE SECONDE PLUS TARD. À l'instant de l'échec, aucun
  // des trois drapeaux (masquée / hors ligne / fermeture) n'est encore posé : le
  // verdict doit donc être DIFFÉRÉ, et la preuve qui arrive dans la seconde doit
  // requalifier l'échec en échec expliqué. Sans ce test, le cas ② ci-dessus (qui
  // tolère l'alarme jusqu'à 15 s) resterait vert sur un verdict immédiat.
  test("iOS : un échec suivi d'un masquage dans la seconde ne fabrique aucune alarme, et rien n'est perdu", async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const etat = await intercepter(page);
    await chargerEtAttendrePremierEnvoi(page, etat);

    // 1. L'envoi meurt, page VISIBLE et EN LIGNE (rien ne l'explique encore).
    etat.mode = "annule";
    await page.evaluate(() => { window.tel.action("e2e_panne_ios"); window.tel.flush(); });
    await expect.poll(() => etat.lots.filter((l) => l.mode === "annule").length, {
      message: "le chemin d'échec doit avoir été exercé", timeout: 10000,
    }).toBeGreaterThan(0);

    // 2. Une seconde plus tard, la preuve arrive : la page se masque (ordre iOS).
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true });
      Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // 3. Au-delà du délai de verdict (4 s) + marge : AUCUNE alarme, ni partie ni
    //    persistée, et l'événement d'origine attend toujours dans le backlog.
    await page.waitForTimeout(6000);
    const backlog = await lireBacklog(page);
    const alarmesEnvoyees = etat.lots.filter((l) => l.mode === "annule").flatMap((l) => l.rows).filter(estAlarme);
    expect(alarmesEnvoyees.map((r) => r.message), "alarme send_failed fabriquée par une coupure iOS").toEqual([]);
    expect(backlog.filter(estAlarme).map((r) => r.message), "alarme send_failed persistée pour rejeu").toEqual([]);
    expect(backlog.some((r) => r.type === "action" && r.action === "e2e_panne_ios"), "l'événement d'origine doit rester dans le backlog").toBe(true);

    await fermerSansTrafic(page, ctx);
  });

  test("un premier échec effacé par le réessai suivant ne produit ni alarme ni « recovered »", async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const etat = await intercepter(page);
    await chargerEtAttendrePremierEnvoi(page, etat);

    etat.mode = "annule";
    await page.evaluate(() => { window.tel.action("e2e_panne_breve"); window.tel.flush(); });
    await expect.poll(() => etat.lots.filter((l) => l.mode === "annule").length, { timeout: 10000 }).toBeGreaterThan(0);
    etat.mode = "ok";                        // le réessai (3 s) passera

    // Le lot d'origine doit finir par partir, sans qu'aucune alarme ni aucune
    // « récupération » ne l'accompagne : un accroc de 3 s n'est pas un incident.
    await expect.poll(() => etat.lots.filter((l) => l.mode === "ok").flatMap((l) => l.rows)
      .some((r) => r.type === "action" && r.action === "e2e_panne_breve"), {
      message: "le lot d'origine doit repartir au réessai", timeout: 15000,
    }).toBe(true);
    await page.waitForTimeout(5000);         // au-delà du délai de verdict
    const tout = etat.lots.flatMap((l) => l.rows).concat(await lireBacklog(page));
    const bruit = tout.filter((r) => r.type === "connectivity" && (r.action === "send_failed" || r.action === "recovered"));
    expect(bruit.map((r) => r.action + " · " + r.message), "aucun send_failed ni recovered pour un accroc résolu").toEqual([]);

    await fermerSansTrafic(page, ctx);
  });
});
