// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LE DÉPART D'UNE PAGE NE PARLE PAS AU PROJET DE PRODUCTION (2026-11-10)
//
// CE QUI FUYAIT. `telemetry_events` de production recevait des lignes
// `env = development` à CHAQUE passage de la CI, après le projet vide du
// 2026-11-09 : une paire de sessions `equipe` par passage, venue de
// `telemetrie-trafic` ④, qui NAVIGUE trois fois dans la même page. À chaque
// départ (`pagehide`, `visibilitychange`), la télémétrie et perf-ios vident leur
// file en `keepalive` — et ces envois-là, émis par le document QUITTÉ, partent
// au réseau sans qu'aucune route ne les voie : ni celle de la page, ni celle du
// contexte. Playwright n'émet même pas d'événement `request` pour eux ; seul un
// proxy, hors du navigateur, les voit passer.
//
// LE REMÈDE (`gardeDepartDePage`, app-helper.js, posé par `projetSupabaseVide`) :
// après un `pagehide` RÉEL, un envoi `keepalive` vers le projet ne part plus, et
// sa promesse ne se règle jamais — ce que vit une page dont le document meurt
// avant la réponse. La file le garde, la page suivante le rejoue, routée.
//
// CE FICHIER le prouve AU RÉSEAU, par un proxy local qui refuse et compte toute
// connexion vers `*.supabase.co` (le reste — polices, cartes — suit son chemin) :
//   ① témoin : les routes SEULES, sans la garde — rien au réseau tant que la page
//      vit, puis le départ l'atteint. Sans ce témoin, un proxy mal branché rendrait
//      ② vert à tort. ⚠️ S'il rougit après une mise à jour de Playwright, c'est que
//      les routes voient enfin ces envois : la garde devient superflue, pas fausse ;
//   ② le projet vide (donc la garde) : le même départ n'atteint plus le réseau, et
//      rien n'est perdu — la page suivante rejoue la fin de la session quittée ;
//   ③ un `pagehide` SYNTHÉTIQUE n'arme pas la garde : les suites qui éprouvent le
//      départ sur une page VIVANTE (telemetrie-fermeture, -doublons) gardent leurs
//      envois, routés.
// MUTATIONS qui le font rougir : retirer `ctx.addInitScript(gardeDepartDePage…)`
// (② réseau) ; armer la garde sur tout `pagehide` (③) ; résoudre la promesse
// retenue au lieu de la laisser pendante (② rejeu : la file se vide).
// Pendant sans navigateur : tests/unit/isolation-projet-supabase.test.mjs ⑧.
// ═══════════════════════════════════════════════════════════════════════════
const http = require("http");
const net = require("net");
const { test, expect, chromium } = require("@playwright/test");
const { poserGateSansPremiereVisite } = require("./gate-helper");
const { projetSupabaseVide, repondreProjetVide } = require("./app-helper");

// Le motif du projet vide (app-helper.js, MOTIF_PROJET_SUPABASE).
const PROJET = /^https:\/\/[a-z0-9]{20}\.supabase\.co\//;

test.skip(({ browserName }) => browserName !== "chromium", "le proxy de banc est un réglage de lancement Chromium");

/** Proxy local : compte et REFUSE toute connexion vers un projet Supabase. */
async function ouvrirProxy() {
  const projet = [];
  const sockets = new Set();
  const serveur = http.createServer((req, res) => { res.writeHead(403); res.end(); });
  serveur.on("connect", (req, sock, head) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => {});
    const [hote, port] = String(req.url).split(":");
    if (/\.supabase\.co$/i.test(hote)) {
      projet.push(hote);
      sock.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const amont = net.connect(Number(port) || 443, hote, () => {
      sock.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length) amont.write(head);
      amont.pipe(sock);
      sock.pipe(amont);
    });
    sockets.add(amont);
    amont.on("close", () => sockets.delete(amont));
    amont.on("error", () => sock.destroy());
  });
  await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
  return {
    projet,
    serveur: "http://127.0.0.1:" + serveur.address().port,
    fermer: () => new Promise((r) => { for (const s of sockets) s.destroy(); serveur.close(() => r()); }),
  };
}

/** Un navigateur derrière le proxy, avec les réglages de lancement du projet (PASSIO_CHROMIUM). */
async function lancerDerriere(proxy) {
  const lancement = (test.info().project.use && test.info().project.use.launchOptions) || {};
  // ⚠️ Playwright fait passer le LOOPBACK par le proxy (`<-loopback>`) : sans ce
  // contournement explicite, le serveur local de l'application est refusé lui aussi
  // et la page ne démarre jamais (vécu au premier passage de ce verrou).
  return chromium.launch({ ...lancement, proxy: { server: proxy.serveur, bypass: "127.0.0.1,localhost" } });
}

/** Les envois de télémétrie, capturés et acquittés (201) par une route de page. */
async function capturerTelemetrie(page) {
  const lignes = [];
  await page.route("**/rest/v1/telemetry_events*", async (route) => {
    try { lignes.push(...JSON.parse(route.request().postData() || "[]")); } catch (e) {}
    await route.fulfill({ status: 201, body: "" });
  });
  return lignes;
}

/** Démarre l'application (télémétrie forcée) et vide sa file : la page est VIVANTE, ses routes voient tout. */
async function demarrer(page) {
  await poserGateSansPremiereVisite(page);
  await page.goto("/index.html?telemetry=1");
  await page.waitForSelector("#landing.active", { timeout: 30000 });
  await page.evaluate(() => window.tel && window.tel.flush && window.tel.flush());
  await page.waitForTimeout(1500);
  return page.evaluate(() => window.tel.sessionId);
}

/** QUITTE la page par une navigation : `pagehide` RÉEL du document quitté. */
async function partir(page) {
  await page.goto("/index.html?telemetry=1");
  await page.waitForSelector("#landing.active", { timeout: 30000 });
}

test("① témoin : les routes SEULES laissent le départ d'une page atteindre le réseau", async ({ baseURL }) => {
  test.setTimeout(90000);
  const proxy = await ouvrirProxy();
  const navigateur = await lancerDerriere(proxy);
  try {
    const ctx = await navigateur.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: "fr-FR" });
    // EXACTEMENT le projet vide — ses réponses et son canal temps réel avalé —
    // posé à la main, SANS sa garde de départ.
    await ctx.route(PROJET, (route) => repondreProjetVide(route));
    await ctx.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
    const page = await ctx.newPage();
    await capturerTelemetrie(page);
    await demarrer(page);
    expect(proxy.projet, "page vivante : toute requête vers le projet est servie par les routes").toEqual([]);
    await partir(page);
    await expect.poll(() => proxy.projet.length, {
      message: "le départ de la page n'a pas atteint le proxy : le banc ne sait plus voir la fuite (ou Playwright route enfin ces envois — voir l'en-tête)",
      timeout: 5000,
    }).toBeGreaterThan(0);
  } finally {
    await navigateur.close();
    await proxy.fermer();
  }
});

test("② le projet vide retient le départ d'une page : rien n'atteint le réseau, et la page suivante le rejoue", async ({ baseURL }) => {
  test.setTimeout(90000);
  const proxy = await ouvrirProxy();
  const navigateur = await lancerDerriere(proxy);
  try {
    const ctx = await navigateur.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: "fr-FR" });
    const page = await ctx.newPage();
    expect(await projetSupabaseVide(page), "le projet vide est posé (projet local)").toBe(true);
    const lignes = await capturerTelemetrie(page);
    const quittee = await demarrer(page);
    expect(proxy.projet, "page vivante : toute requête vers le projet est servie par les routes").toEqual([]);
    await partir(page);
    // Prémisse : le départ a bien ÉMIS — sa fin de session, gardée par la file,
    // revient par la page suivante, routée. Sans elle, « zéro au réseau » ne prouverait rien.
    await page.evaluate(() => window.tel.flush());
    await expect.poll(() => lignes.some((l) => l.session_id === quittee && l.type === "session" && l.action === "end"), {
      message: "la fin de la session quittée n'a pas été rejouée par la page suivante (perdue, ou jamais émise)",
      timeout: 10000,
    }).toBe(true);
    await page.waitForTimeout(500);
    expect(proxy.projet, "connexions au projet Supabase parties du navigateur").toEqual([]);
  } finally {
    await navigateur.close();
    await proxy.fermer();
  }
});

test("③ un `pagehide` synthétique n'arme pas la garde : la page vivante garde ses envois de départ, routés", async ({ page }) => {
  expect(await projetSupabaseVide(page)).toBe(true);
  const lignes = await capturerTelemetrie(page);
  await poserGateSansPremiereVisite(page);
  await page.goto("/index.html?telemetry=1");
  await page.waitForSelector("#landing.active", { timeout: 30000 });
  const session = await page.evaluate(() => window.tel.sessionId);
  await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); });
  await expect.poll(() => lignes.some((l) => l.session_id === session && l.type === "session" && l.action === "end"), {
    message: "l'envoi keepalive d'un départ SIMULÉ n'a pas rejoint la route : la garde s'arme sur un pagehide synthétique",
    timeout: 10000,
  }).toBe(true);
});
