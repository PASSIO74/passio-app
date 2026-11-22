#!/usr/bin/env node
// Vérification du prototype « Rejoindre une activité » dans le navigateur du banc (Playwright,
// file:///). Déroule toutes les étapes, puis les gestes libres ; une image par étape dans le
// dossier temporaire des sondes ; imprime les erreurs de console et ce qui est visé à chaque étape.
//   node docs/audit-ux-ui-2026-11-10/outils/sondes/irl-fiche-08-prototype.js
"use strict";
const path = require("path"), fs = require("fs"), os = require("os"), url = require("url");
const { chromium } = require("@playwright/test");
(async () => {
  const fichier = path.resolve(__dirname, "..", "..", "prototypes", "rejoindre-activite.html");
  const dossier = path.join(os.tmpdir(), "passio-audit-sondes", "proto-rejoindre");
  fs.mkdirSync(dossier, { recursive: true });
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1280, height: 920 } });
  const erreurs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erreurs.push(m.type() + ": " + m.text()); });
  page.on("pageerror", (e) => erreurs.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => erreurs.push("requête en échec : " + r.url()));
  await page.goto(url.pathToFileURL(fichier).href);
  await page.waitForTimeout(500);
  const n = await page.evaluate(() => JSON.parse(document.getElementById("proto-parcours").textContent).length);
  const releve = [];
  for (let i = 0; i < n; i++) {
    await page.click("[data-proto='suivant']" + (i === 0 ? "" : ""));
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const c = document.querySelector(".proto-telephone .proto-cible-active");
      const tel = document.querySelector(".proto-telephone").getBoundingClientRect();
      const b = c ? c.getBoundingClientRect() : null;
      return { ecran: window.PROTO.ecranCourant, cible: c ? (c.id || c.className) : null,
        visible: !!b && b.width > 0 && b.height > 0 && b.top >= tel.top - 1 && b.bottom <= tel.bottom + 1,
        etat: Object.assign({}, document.body.dataset) };
    });
    releve.push(Object.assign({ etape: i + 1 }, r));
    await page.locator(".proto-telephone").screenshot({ path: path.join(dossier, "etape-" + String(i + 1).padStart(2, "0") + ".png") });
  }
  // Gestes libres : porte → fiche → Je participe → Écrire → Envoyer ; complet → attente ; retrait → Annuler.
  await page.click("[data-proto='recommencer']"); await page.waitForTimeout(500);
  const t = (s) => page.locator(".proto-telephone " + s).first();
  await t("#raPorte").click(); await t("#raJeParticipe").click();
  const apresParticiper = await page.evaluate(() => document.body.dataset.rsvp);
  await t("#raCalendrier").click(); await page.waitForTimeout(200);
  const bulle = await page.evaluate(() => !document.getElementById("raBulle").hidden);
  await page.locator(".proto-telephone").screenshot({ path: path.join(dossier, "libre-calendrier.png") });
  await t("#raEcrire").click(); await t("[data-action='envoyer']").click();
  const envoye = await page.evaluate(() => !document.getElementById("raMonMsg").hidden);
  await page.locator(".proto-telephone").screenshot({ path: path.join(dossier, "libre-envoye.png") });
  await t(".ra-retour").click(); await t("#raPlusVenir").click();
  const retire = await page.evaluate(() => document.body.dataset.rsvp);
  await t("#raLibere button").click();
  const annule = await page.evaluate(() => document.body.dataset.rsvp);
  // Cibles < 44 px dans le téléphone
  const petites = await page.evaluate(() => Array.from(document.querySelectorAll(".proto-telephone button, .proto-telephone input")).filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.id || e.textContent || "").trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) }; }).filter((x) => x.h < 44 || x.w < 44));
  await nav.close();
  console.log(JSON.stringify({ etapes: n, releve, libre: { apresParticiper, bulle, envoye, retire, annule }, petites, erreurs, images: dossier }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
