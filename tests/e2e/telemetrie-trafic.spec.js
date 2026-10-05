// TRAFIC HORS PUBLIC (2026-10-05) — robots, émulations, équipe.
//
// Mesuré en production du 28/09 au 04/10 : sur 19 appareils sans compte, 15
// n'étaient personne (dix « iPhone » 390 × 844 qui déclaraient une connexion
// « 4g », arrivés juste après chaque fusion sur `main`). L'entonnoir du pilotage
// les comptait comme des visiteurs. telemetry.js pose désormais `meta.trafic`
// sur CHAQUE événement d'un tel appareil, et sur aucun autre ; le pilotage, la
// veille et le digest l'écartent de leurs chiffres d'audience.
//
// Ce banc observe ce qui PART sur le réseau (pas un stub de tel.track) : c'est
// ce que la base reçoit qui décide d'un chiffre. Les envois sont interceptés et
// répondus ici — rien n'est écrit dans une base.
//
// MUTATIONS qui le font rougir : retirer la ligne `ev.meta.trafic = TRAFIC`
// (①③④) ; retirer le `delete` sur un visiteur (⑤) ; inverser l'ordre robot /
// équipe (⑥) ; retirer le `replaceState` de `?equipe=` (④).
const { test, expect } = require("@playwright/test");
const { poserGateSansPremiereVisite } = require("./gate-helper");

const UA_BUREAU = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1";

// Playwright pose `navigator.webdriver = true` : sans ce masque, TOUT serait
// « robot » et les autres classes ne seraient jamais exercées.
async function masquerWebdriver(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
  });
}

// Capture les lignes envoyées à telemetry_events et répond 201 sans rien écrire.
async function capturerEnvois(page) {
  const lignes = [];
  await page.route("**/rest/v1/telemetry_events*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      try { lignes.push(...JSON.parse(req.postData() || "[]")); } catch (e) {}
    }
    await route.fulfill({ status: 201, body: "" });
  });
  return lignes;
}

async function ouvrir(page, requete) {
  await poserGateSansPremiereVisite(page);
  await page.goto("/index.html?telemetry=1" + (requete || ""));
  await page.waitForSelector("#landing.active", { timeout: 30000 });
}

async function viderFile(page) {
  await page.evaluate(() => window.tel && window.tel.flush && window.tel.flush());
  await page.waitForTimeout(1500);
}

test("① Playwright est un robot : chaque événement envoyé porte meta.trafic = robot", async ({ page }) => {
  const lignes = await capturerEnvois(page);
  await ouvrir(page);
  await viderFile(page);
  expect(await page.evaluate(() => window.tel.trafic)).toBe("robot");
  expect(lignes.length, "au moins un événement est parti").toBeGreaterThan(0);
  for (const l of lignes) expect(l.meta && l.meta.trafic, l.type + "/" + l.action).toBe("robot");
});

test("② un visiteur ordinaire ne reçoit AUCUNE clé de plus", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: UA_BUREAU });
  const page = await ctx.newPage();
  await masquerWebdriver(page);
  const lignes = await capturerEnvois(page);
  await ouvrir(page);
  await viderFile(page);
  expect(await page.evaluate(() => window.tel.trafic)).toBeNull();
  expect(lignes.length).toBeGreaterThan(0);
  for (const l of lignes) expect(Object.prototype.hasOwnProperty.call(l.meta || {}, "trafic"), l.type + "/" + l.action).toBe(false);
  await ctx.close();
});

test("③ un « iPhone » servi par Chromium est une émulation", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: UA_IPHONE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await masquerWebdriver(page);
  const lignes = await capturerEnvois(page);
  await ouvrir(page);
  await viderFile(page);
  // La preuve que le moteur n'est pas WebKit : une API qu'aucun navigateur iOS n'expose.
  expect(await page.evaluate(() => !!(navigator.connection || navigator.userAgentData))).toBe(true);
  expect(await page.evaluate(() => window.tel.trafic)).toBe("emulation");
  expect(lignes.length).toBeGreaterThan(0);
  for (const l of lignes) {
    expect(l.platform).toBe("ios");
    expect(l.meta && l.meta.trafic).toBe("emulation");
  }
  await ctx.close();
});

test("④ ?equipe=1 marque l'APPAREIL, quitte la barre d'adresse, et ?equipe=0 le rend au public", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: UA_BUREAU });
  const page = await ctx.newPage();
  await masquerWebdriver(page);
  const lignes = await capturerEnvois(page);

  await ouvrir(page, "&equipe=1");
  expect(await page.evaluate(() => window.tel.trafic)).toBe("equipe");
  expect(await page.evaluate(() => localStorage.getItem("passio_trafic"))).toBe("equipe");
  // Le marqueur ne doit pas survivre dans l'URL : copiée et partagée, elle
  // sortirait chaque destinataire des chiffres.
  expect(page.url()).not.toContain("equipe");
  expect(page.url()).toContain("telemetry=1");
  await viderFile(page);
  expect(lignes.length).toBeGreaterThan(0);
  for (const l of lignes) expect(l.meta && l.meta.trafic).toBe("equipe");

  // Mémorisé : un retour sans paramètre reste « équipe ».
  await ouvrir(page);
  expect(await page.evaluate(() => window.tel.trafic)).toBe("equipe");

  // Et réversible. Seule la NOUVELLE session est jugée : les événements de la
  // page quittée partent encore (flush au départ, file rejouée au chargement
  // suivant) et portent, à juste titre, l'état d'alors.
  await ouvrir(page, "&equipe=0");
  expect(await page.evaluate(() => window.tel.trafic)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("passio_trafic"))).toBeNull();
  const session = await page.evaluate(() => window.tel.sessionId);
  await viderFile(page);
  const apres = lignes.filter((l) => l.session_id === session);
  expect(apres.length).toBeGreaterThan(0);
  for (const l of apres) expect(Object.prototype.hasOwnProperty.call(l.meta || {}, "trafic")).toBe(false);
  await ctx.close();
});

test("⑤ un appelant ne fabrique pas la clé sur un visiteur, ni ne l'efface sur un robot", async ({ browser, page }) => {
  // Visiteur : `trafic` passé par l'appelant est retiré.
  const ctx = await browser.newContext({ userAgent: UA_BUREAU });
  const visiteur = await ctx.newPage();
  await masquerWebdriver(visiteur);
  const envoisVisiteur = await capturerEnvois(visiteur);
  await ouvrir(visiteur);
  await visiteur.evaluate(() => window.tel.action("banc_trafic", { trafic: "equipe", etape: "visiteur" }));
  await viderFile(visiteur);
  const v = envoisVisiteur.find((l) => l.action === "banc_trafic");
  expect(v, "l'action du banc est partie").toBeTruthy();
  expect(v.meta.etape).toBe("visiteur");
  expect(Object.prototype.hasOwnProperty.call(v.meta, "trafic")).toBe(false);
  await ctx.close();

  // Robot : la valeur de l'appelant ne gagne pas.
  const envoisRobot = await capturerEnvois(page);
  await ouvrir(page);
  await page.evaluate(() => window.tel.action("banc_trafic", { trafic: "equipe", etape: "robot" }));
  await viderFile(page);
  const r = envoisRobot.find((l) => l.action === "banc_trafic");
  expect(r, "l'action du banc est partie").toBeTruthy();
  expect(r.meta.trafic).toBe("robot");
});

test("⑥ un robot marqué équipe reste un robot : le fait mesuré passe avant la déclaration", async ({ page }) => {
  const lignes = await capturerEnvois(page);
  await ouvrir(page, "&equipe=1");
  expect(await page.evaluate(() => localStorage.getItem("passio_trafic"))).toBe("equipe");
  expect(await page.evaluate(() => window.tel.trafic)).toBe("robot");
  await viderFile(page);
  for (const l of lignes) expect(l.meta && l.meta.trafic).toBe("robot");
});

test("⑦ la clé d'équipe est une clé d'APPAREIL : la purge d'un compte ne l'emporte pas", async () => {
  const fs = require("fs");
  const a2 = fs.readFileSync("js/app-02-state-utils.js", "utf8");
  const debut = a2.indexOf("var ACCOUNT_SCOPED_KEYS");
  const cles = a2.slice(debut, a2.indexOf("];", debut));
  expect(debut).toBeGreaterThan(0);
  expect(cles).not.toContain('"passio_trafic"');
});
