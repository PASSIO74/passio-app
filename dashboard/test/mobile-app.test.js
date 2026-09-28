// ═══════════════════════════════════════════════════════════════════════════
// PILOT MOBILE (2026-09-28) — la version téléphone du centre de pilotage.
//
// Deux familles de verrous :
//   · SANS navigateur : durée de session « rester connecté », adresses montrées
//     au téléphone, icônes réellement présentes, écritures bornées ;
//   · AVEC Chromium, au gabarit d'un iPhone : écran de connexion, connexion,
//     cinq onglets, un titre d'alerte HOSTILE rendu en texte, aucune barre de
//     défilement horizontale.
// ═══════════════════════════════════════════════════════════════════════════
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dureeSessionHeures, adressesTelephone } from "../server/auth.js";
import { config } from "../server/config.js";
import { demarrerServeur, MDP } from "./aide-serveur.js";

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const lire = (p) => fs.readFileSync(path.join(PUB, p), "utf8");

// ─── Sans navigateur ────────────────────────────────────────────────────────
test("rester connecté : seul `true` explicite allonge la session, et jamais au-delà de rememberDays", () => {
  assert.equal(dureeSessionHeures(undefined), config.sessionHours);
  assert.equal(dureeSessionHeures(false), config.sessionHours);
  assert.equal(dureeSessionHeures("true"), config.sessionHours, "une chaîne n'est pas une demande");
  assert.equal(dureeSessionHeures(1), config.sessionHours, "un nombre n'est pas une demande");
  assert.equal(dureeSessionHeures(true), config.rememberDays > 0 ? config.rememberDays * 24 : config.sessionHours);
  assert.ok(config.rememberDays <= 90, "plafond de 90 jours");
});

test("adresses pour le téléphone : IPv4 privées et Tailscale seulement", () => {
  const faux = {
    lo: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
    wifi: [{ family: "IPv4", address: "192.168.1.20", internal: false }, { family: "IPv6", address: "fe80::1", internal: false }],
    eth: [{ family: 4, address: "10.0.0.5", internal: false }],
    tail: [{ family: "IPv4", address: "100.101.102.103", internal: false }],
    pub: [{ family: "IPv4", address: "82.64.1.2", internal: false }, { family: "IPv4", address: "169.254.3.4", internal: false }],
    docker: [{ family: "IPv4", address: "172.17.0.1", internal: false }],
  };
  assert.deepEqual(adressesTelephone(faux, 4610), [
    "http://192.168.1.20:4610/mobile.html",
    "http://10.0.0.5:4610/mobile.html",
    "http://100.101.102.103:4610/mobile.html",
    "http://172.17.0.1:4610/mobile.html",
  ]);
});

test("les icônes déclarées existent, et le service worker les connaît", () => {
  const m = JSON.parse(lire("mobile-manifest.webmanifest"));
  assert.ok(m.icons.length >= 2);
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(PUB, i.src)), "icône absente : " + i.src);
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"), "icône masquable 512");
  const html = lire("mobile.html");
  const apple = /rel="apple-touch-icon" href="([^"]+)"/.exec(html);
  assert.ok(apple && fs.existsSync(path.join(PUB, apple[1])), "icône iPhone");
  const sw = lire("mobile-sw.js");
  for (const i of m.icons) assert.ok(sw.includes(`"${i.src}"`), "SW sans " + i.src);
});

test("le mobile n'écrit que par des portes bornées", () => {
  const js = lire("js/mobile.js");
  const ecritures = [...js.matchAll(/api\((`[^`]*`|"[^"]*")\s*,\s*\{\s*method:\s*"(POST|PATCH|DELETE)"/g)].map((m) => m[2] + " " + m[1].slice(1, -1).replace(/\$\{[^}]*\}/g, ":p"));
  assert.deepEqual([...new Set(ecritures)].sort(), [
    "PATCH /bugs/:p", "POST /alerts/:p/ack", "POST /login", "POST /logout", "POST /tests/run",
  ]);
  const code = js.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /innerHTML|insertAdjacentHTML|outerHTML/);
});

// ─── Avec Chromium ──────────────────────────────────────────────────────────
const CHEMINS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  process.env.CHROMIUM_PATH,
].filter(Boolean);
const BINAIRE = CHEMINS.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
let serveur = null, navigateur = null, indisponible = null;

before(async () => {
  if (!BINAIRE) { indisponible = "aucun binaire Chromium (voir CHROMIUM_PATH)"; return; }
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch { indisponible = "paquet playwright absent"; return; }
  try {
    serveur = await demarrerServeur();
    navigateur = await chromium.launch({ executablePath: BINAIRE, args: ["--no-sandbox"] });
  } catch (e) { indisponible = "Chromium n'a pas démarré : " + String(e.message).slice(0, 120); }
}, { timeout: 120_000 });
after(async () => { try { await navigateur?.close(); } catch {} serveur?.arreter(); });
const sauter = (t) => { if (!indisponible) return false; t.skip("navigateur indisponible — " + indisponible); return true; };

async function pageTelephone() {
  const ctx = await navigateur.newContext({ baseURL: serveur.base, viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const soucis = [];
  page.on("pageerror", (e) => soucis.push("exception: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) soucis.push("console: " + m.text()); });
  return { ctx, page, soucis };
}

test("téléphone : écran de connexion, connexion « rester connecté », cinq onglets", async (t) => {
  if (sauter(t)) return;
  const { ctx, page, soucis } = await pageTelephone();
  await page.goto("/mobile.html");
  await page.waitForSelector("#ecranConnexion:not([hidden])", { timeout: 20_000 });
  assert.equal(await page.isHidden("#app"), true, "l'app ne s'affiche pas sans session");

  await page.fill("#cxUser", "admin_test");
  await page.fill("#cxPass", "pas-le-bon");
  await page.click("#cxBouton");
  await page.waitForSelector("#cxErreur:not([hidden])");
  assert.match(await page.textContent("#cxErreur"), /incorrect/);

  await page.fill("#cxPass", MDP);
  const [rep] = await Promise.all([page.waitForResponse("**/api/login"), page.click("#cxBouton")]);
  const cookie = (await rep.headerValue("set-cookie")) || "";
  assert.match(cookie, new RegExp(`Max-Age=${config.rememberDays * 24 * 3600}`), "« rester connecté » coché par défaut : " + cookie);

  await page.waitForSelector("#app:not([hidden])", { timeout: 20_000 });
  await page.waitForFunction(() => document.getElementById("verdictTitre").textContent !== "Chargement…", null, { timeout: 20_000 });

  for (const [onglet, titre] of [["alertes", "Alertes"], ["utilisateurs", "Utilisateurs"], ["machines", "Machines"], ["reglages", "Réglages"], ["accueil", "Accueil"]]) {
    await page.click(`.barre button[data-tab="${onglet}"]`);
    assert.equal(await page.textContent("#titreOnglet"), titre);
    assert.equal(await page.isVisible("#" + onglet), true, onglet + " visible");
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(deborde <= 0, `${onglet} déborde de ${deborde}px à 390px`);
  }
  assert.match(await page.textContent("#compte"), /admin_test/);
  assert.deepEqual(soucis, []);
  await ctx.close();
});

test("téléphone : un titre d'alerte hostile reste du texte, et l'alerte se marque vue", async (t) => {
  if (sauter(t)) return;
  const { ctx, page, soucis } = await pageTelephone();
  await ctx.addCookies([{ name: "dash_session", value: decodeURIComponent((await serveur.cookieDe("admin_test")).split("=")[1]), url: serveur.base }]);
  let ack = 0;
  const charge = '<img src=x onerror="window.__pwn=1">';
  await page.route("**/api/alerts", (r) => r.fulfill({ json: [{ id: "al_1", ts: Date.now(), level: "critical", title: charge, message: charge, acknowledged: false }] }));
  await page.route("**/api/alerts/al_1/ack", (r) => { ack++; r.fulfill({ json: { ok: true } }); });
  page.on("dialog", (d) => d.accept());
  await page.goto("/mobile.html");
  await page.waitForSelector("#app:not([hidden])", { timeout: 20_000 });
  await page.waitForFunction(() => document.getElementById("verdictTitre").textContent === "Problème en cours", null, { timeout: 20_000 });
  assert.equal(await page.textContent("#badgeAlertes"), "1");
  await page.click('.barre button[data-tab="alertes"]');
  assert.ok((await page.textContent("#listeAlertes")).includes(charge), "rendu en texte");
  assert.equal(await page.evaluate(() => window.__pwn), undefined, "la charge ne s'est pas exécutée");
  await page.click('#listeAlertes button:has-text("Marquer vu")');
  await page.waitForFunction(() => true);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(ack, 1);
  assert.deepEqual(soucis, []);
  await ctx.close();
});
