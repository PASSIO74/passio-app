#!/usr/bin/env node
// Vérifie prototypes/premiere-visite.html dans le Chromium du banc (file://, aucun réseau) :
// déroule TOUTES les étapes, relève les erreurs de console, les cibles < 44 px et les champs
// < 16 px du téléphone, enregistre une image par étape, puis exerce le parcours libre
// (passions → ♡ → porte → inscription avec erreur → étape 2 → e-mail → retour → ♡ réussi).
"use strict";
const path = require("path");
const os = require("os");
const fs = require("fs");
const url = require("url");
const { chromium } = require("@playwright/test");

(async () => {
  const fichier = path.resolve(__dirname, "..", "..", "prototypes", "premiere-visite.html");
  const dossier = path.join(os.tmpdir(), "passio-audit-sondes", "proto-premiere-visite");
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
  const mesurer = () => page.evaluate(() => {
    const tel = document.querySelector(".proto-telephone");
    const tr = tel.getBoundingClientRect();
    const vis = (el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > tr.top && r.top < tr.bottom && c.visibility !== "hidden" && c.display !== "none"; };
    const petites = Array.from(tel.querySelectorAll("button, a[href], [role='button']")).filter(vis).filter((b) => !b.closest(".pv-case")).map((b) => { const r = b.getBoundingClientRect(); return { t: (b.getAttribute("aria-label") || b.innerText || "").trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((b) => b.w < 44 || b.h < 44);
    const champs = Array.from(tel.querySelectorAll("input:not([type=checkbox]), textarea")).filter(vis).map((c) => parseFloat(getComputedStyle(c).fontSize)).filter((f) => f < 16);
    const cible = tel.querySelector(".proto-cible-active");
    return { etape: (document.querySelector(".proto-etapes li[aria-current='step'] strong") || {}).innerText, ecran: (tel.querySelector("[data-ecran].proto-actif") || {}).getAttribute("data-ecran"), couches: Array.from(tel.querySelectorAll("[data-couche].proto-ouverte")).map((c) => c.getAttribute("data-couche")), cibleVisible: !!cible && vis(cible), petites, champs };
  });
  const bilan = [];
  for (let i = 0; i < n; i++) {
    await page.locator("[data-proto='suivant']").click();
    await page.waitForTimeout(250);
    bilan.push(await mesurer());
    await page.locator(".proto-telephone").screenshot({ path: path.join(dossier, "etape-" + String(i + 1).padStart(2, "0") + ".png") });
  }
  // Parcours libre, par de vrais clics dans le téléphone.
  const libre = {};
  await page.locator("[data-proto='recommencer']").click();
  await page.waitForTimeout(500);
  await page.locator("#pvChoisir").click();
  await page.locator("#pvGrille .pv-tuile").nth(0).click();
  libre.libelle = await page.locator("#pvValider").innerText();
  await page.locator("#pvValider").click();
  libre.local = await page.locator("#pvLocal").isVisible();
  await page.locator("#pvCoeur").click();
  libre.porte = await page.locator("[data-couche='porte'].proto-ouverte").count();
  await page.locator("#pvPorteCreer").click();
  libre.ecranAcces = await page.evaluate(() => PROTO.ecranCourant);
  await page.locator("#pvContinuer").click();
  libre.erreurVisible = await page.locator("#pvResume").isVisible();
  await page.locator("#pvAccord").check();
  await page.locator("#pvMail").fill("camille.audit@exemple.fr");
  await page.locator("#pvContinuer").click();
  libre.ecranEtape2 = await page.evaluate(() => PROTO.ecranCourant);
  await page.locator("#pvCreer").click();
  await page.locator("#pvLienOuvert").click();
  libre.rappel = await page.locator("#pvRappel").isVisible();
  await page.locator("#pvCoeur").click();
  libre.coeur = await page.locator("#pvCoeur").innerText();
  libre.reussi = await page.locator("#pvReussi").isVisible();
  await page.locator(".proto-telephone").screenshot({ path: path.join(dossier, "libre-fin.png") });
  // « ← Continuer à explorer » ramène au fil.
  await page.locator("#pvCoeur").click(); await page.locator("#pvCoeur").click();
  await nav.close();
  console.log(JSON.stringify({ etapes: n, bilan, libre, erreurs, images: dossier }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
