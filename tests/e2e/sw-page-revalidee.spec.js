// ═══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER — LA PAGE SE REVALIDE EN 304 AU LIEU DE REPARTIR ENTIÈRE (2026-11-09)
//
// Mesuré en production le 2026-11-09 : `index.html` pèse 106 Ko compressés, et
// il repartait EN ENTIER à chaque ouverture de l'app — `_headers` le sert en
// `no-store` et `sw.js` le redemandait en `no-store`, donc jamais de 304, alors
// que Netlify en rend un sur `If-None-Match`. À 25 000 appareils ouvrant l'app
// trois fois par jour, ~240 Go/mois : plus que tout le forfait Netlify gratuit.
// Fiche : docs/journal/capacite-perf-realtime.md (2026-11-09).
//
// ⚠️ LE VRAI WORKER, UN SERVEUR À NOUS. `sw.js` est servi tel quel par un serveur
// de banc qui pose ses ETag et sa date, et COMPTE ce qu'il reçoit : c'est le
// serveur qui prouve qu'un `If-None-Match` est parti et qu'un 304 est revenu —
// la page seule ne saurait pas distinguer une copie d'un téléchargement.
// La page du banc ne charge PAS l'application : aucune donnée distante à isoler.
//
// ① ouverture sans changement : un conditionnel part, le 304 fait servir la copie ;
// ② la page change : le 200 est servi, gardé, puis revalidé à son tour ;
// ③ hors ligne : la copie la plus récente, pas celle de l'installation ;
// ④ une copie de plus de 24 h repart entière (un 304 n'apporte pas la CSP) ;
// ⑤ un téléphone en retard sur le serveur garde la revalidation (âge négatif).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const http = require("http");
const path = require("path");
const { test, expect } = require("@playwright/test");

test.use({ serviceWorkers: "allow" });
test.describe.configure({ mode: "serial" });

const SOURCE_SW = fs.readFileSync(path.join(__dirname, "..", "..", "sw.js"), "utf8");
const HEURE = 3600 * 1000;

const etat = { version: 1, decalage: 0, journal: [] };
let serveur = null;
let base = "";

function etagCourant() { return `W/"banc-page-${etat.version}"`; }

function pageDuBanc() {
  return "<!doctype html><meta charset=utf-8><title>banc</title>"
    + `<p id="version">version-${etat.version}</p>`
    + "<script>navigator.serviceWorker.register('/sw.js');</script>";
}

test.beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    const u = new URL(req.url, "http://banc");
    if (u.pathname === "/sw.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(SOURCE_SW);
      return;
    }
    if (u.pathname === "/" || u.pathname === "/index.html") {
      const inm = req.headers["if-none-match"] || null;
      const egal = inm === etagCourant();
      const date = new Date(Date.now() - etat.decalage).toUTCString();
      etat.journal.push({ chemin: u.pathname, inm, statut: egal ? 304 : 200, version: etat.version });
      if (egal) {
        res.writeHead(304, { ETag: etagCourant(), Date: date, "Cache-Control": "no-store, no-cache, must-revalidate" });
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8", ETag: etagCourant(), Date: date,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      });
      res.end(pageDuBanc());
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("absent");
  });
  await new Promise((ok) => serveur.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

test.afterAll(async () => {
  if (serveur) await new Promise((ok) => serveur.close(ok));
});

// Les navigations vers la page reçues par le serveur depuis le dernier vidage.
function navigationsRecues() {
  return etat.journal.filter((r) => r.chemin === "/");
}

async function pageControlee(page) {
  await page.goto(base + "/");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
}

test("① ouverture sans changement : If-None-Match part, le 304 fait servir la copie", async ({ page }) => {
  etat.version = 1; etat.decalage = 0;
  await pageControlee(page);
  etat.journal.length = 0;

  await page.reload();
  await expect(page.locator("#version")).toHaveText("version-1");
  const recues = navigationsRecues();
  expect(recues, "une seule navigation doit atteindre le serveur").toHaveLength(1);
  expect(recues[0].inm, "la navigation contrôlée doit être CONDITIONNELLE").toBe('W/"banc-page-1"');
  expect(recues[0].statut).toBe(304);
});

test("② la page change : le 200 est servi, gardé, puis revalidé à son tour", async ({ page }) => {
  etat.version = 1; etat.decalage = 0;
  await pageControlee(page);

  etat.version = 2;
  etat.journal.length = 0;
  await page.reload();
  await expect(page.locator("#version")).toHaveText("version-2");
  expect(navigationsRecues().map((r) => r.statut)).toEqual([200]);

  etat.journal.length = 0;
  await page.reload();
  await expect(page.locator("#version")).toHaveText("version-2");
  const recues = navigationsRecues();
  expect(recues).toHaveLength(1);
  expect(recues[0].inm, "la copie gardée au dernier 200 porte le nouvel ETag").toBe('W/"banc-page-2"');
  expect(recues[0].statut).toBe(304);
});

test("③ hors ligne : la copie la plus récente est servie", async ({ page, context }) => {
  etat.version = 1; etat.decalage = 0;
  await pageControlee(page);
  etat.version = 3;
  await page.reload();
  await expect(page.locator("#version")).toHaveText("version-3");

  await context.setOffline(true);
  try {
    await page.reload();
    // La copie de l'installation est la version 1 : servir celle-là serait revenir en arrière.
    await expect(page.locator("#version")).toHaveText("version-3");
  } finally {
    await context.setOffline(false);
  }
});

test("④ une copie de plus de 24 h repart entière : aucun If-None-Match", async ({ page }) => {
  etat.version = 4; etat.decalage = 0;
  await pageControlee(page);

  // Le serveur date sa réponse d'il y a 25 h : la copie gardée est trop vieille.
  etat.version = 5; etat.decalage = 25 * HEURE;
  await page.reload();
  await expect(page.locator("#version")).toHaveText("version-5");

  etat.journal.length = 0;
  await page.reload();
  await expect(page.locator("#version")).toHaveText("version-5");
  const recues = navigationsRecues();
  expect(recues).toHaveLength(1);
  expect(recues[0].inm, "une copie de plus de 24 h ne doit pas être revalidée").toBeNull();
  expect(recues[0].statut).toBe(200);
});

test("⑤ téléphone en retard sur le serveur : la revalidation tient", async ({ page }) => {
  etat.version = 6; etat.decalage = 0;
  await pageControlee(page);

  // Date du serveur 2 min DANS LE FUTUR vue du téléphone : un âge négatif.
  etat.version = 7; etat.decalage = -2 * 60 * 1000;
  await page.reload();
  await expect(page.locator("#version")).toHaveText("version-7");

  etat.journal.length = 0;
  await page.reload();
  await expect(page.locator("#version")).toHaveText("version-7");
  const recues = navigationsRecues();
  expect(recues).toHaveLength(1);
  expect(recues[0].inm).toBe('W/"banc-page-7"');
  expect(recues[0].statut).toBe(304);
});
