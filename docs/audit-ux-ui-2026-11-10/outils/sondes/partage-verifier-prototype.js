#!/usr/bin/env node
// Vérifie prototypes/partage.html dans le Chromium du banc (file://, aucun réseau) :
// déroule TOUTES les étapes, note les erreurs de console, mesure les cibles sous
// 44 px et les champs sous 16 px du téléphone, enregistre une image par étape,
// puis exerce les gestes libres (partager → copier → republier ; visiteur → inscription → retour).
"use strict";
const path = require("path");
const os = require("os");
const fs = require("fs");
const url = require("url");
const { chromium } = require("@playwright/test");

(async () => {
  const fichier = path.resolve(__dirname, "..", "..", "prototypes", "partage.html");
  const dossier = path.join(os.tmpdir(), "passio-audit-sondes", "proto-partage");
  fs.mkdirSync(dossier, { recursive: true });
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 920 }, deviceScaleFactor: 1 });
  await ctx.route("**/*", (r) => (r.request().url().startsWith("file:") ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") erreurs.push("console: " + m.text()); });
  page.on("requestfailed", (r) => erreurs.push("échec de chargement: " + r.url().slice(-60)));
  await page.goto(url.pathToFileURL(fichier).href);
  const n = await page.evaluate(() => JSON.parse(document.getElementById("proto-parcours").textContent).length);
  const bilan = [];
  for (let i = 0; i < n; i++) {
    await page.locator("[data-proto='suivant']").click();
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const tel = document.querySelector(".proto-telephone");
      const tr = tel.getBoundingClientRect();
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > tr.top && r.top < tr.bottom && getComputedStyle(el).visibility !== "hidden"; };
      const petites = Array.from(tel.querySelectorAll("button, a[href], [role='button']")).filter(vis).map((b) => { const r = b.getBoundingClientRect(); return { t: (b.getAttribute("aria-label") || b.innerText || "").trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((b) => b.w < 44 || b.h < 44);
      const champs = Array.from(tel.querySelectorAll("input, textarea")).filter(vis).map((c) => parseFloat(getComputedStyle(c).fontSize)).filter((f) => f < 16);
      const cible = tel.querySelector(".proto-cible-active");
      return { etape: (document.querySelector(".proto-etapes li[aria-current='step'] strong") || {}).innerText, ecran: (tel.querySelector("[data-ecran].proto-actif") || {}).getAttribute("data-ecran"), couches: Array.from(tel.querySelectorAll("[data-couche].proto-ouverte")).map((c) => c.getAttribute("data-couche")), cibleVisible: !!cible && vis(cible), petites, champs };
    });
    bilan.push(m);
    await page.locator(".proto-telephone").screenshot({ path: path.join(dossier, "etape-" + String(i + 1).padStart(2, "0") + ".png") });
  }
  // Gestes libres.
  const libre = {};
  await page.locator("[data-proto='recommencer']").click();
  await page.waitForTimeout(400);
  await page.locator("#ppPartagerPost").click();
  libre.feuille = await page.locator("[data-couche='partage'].proto-ouverte").count();
  await page.locator("#ppCopier").click();
  libre.confirmation = await page.locator("#ppOk").isVisible() && await page.locator("#ppOkTexte").innerText();
  libre.feuilleEncoreOuverte = await page.locator("[data-couche='partage'].proto-ouverte").count();
  await page.locator("#ppRepublier").click();
  await page.waitForTimeout(200);
  libre.repartageVisible = await page.locator("#ppRepartage").isVisible();
  await page.locator("#ppCite").click();
  libre.ecranApresCite = await page.evaluate(() => document.querySelector("[data-ecran].proto-actif").getAttribute("data-ecran"));
  await page.evaluate(() => PROTO.ecran("visiteur"));
  await page.locator("#ppCoeurVisiteur").click();
  libre.gate = await page.locator("[data-couche='gate'].proto-ouverte").count();
  await page.locator("#ppGateCreer").click();
  libre.ecranInscription = await page.evaluate(() => document.querySelector("[data-ecran].proto-actif").getAttribute("data-ecran"));
  await page.locator("#ppCreer").click();
  libre.ecranRetour = await page.evaluate(() => document.querySelector("[data-ecran].proto-actif").getAttribute("data-ecran"));
  await page.locator("#ppCoeur").click();
  libre.coeur = await page.locator("#ppCoeur").innerText();
  await page.evaluate(() => PROTO.ecran("fil"));
  await page.locator("#ppPartagerPost").click();
  await page.locator("[data-couche='partage'] .modal-close").click();
  libre.fermeParCroix = (await page.locator("[data-couche='partage'].proto-ouverte").count()) === 0;
  console.log(JSON.stringify({ etapes: n, bilan, libre, erreurs }, null, 1));
  console.log("images : " + dossier);
  await nav.close();
  process.exit(erreurs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
