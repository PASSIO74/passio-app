#!/usr/bin/env node
// Vérifie prototypes/messagerie.html dans le Chromium du banc (file://, aucun réseau) :
// déroule TOUTES les étapes, note les erreurs de console, mesure les cibles sous 44 px et
// les champs sous 16 px visibles dans le téléphone, enregistre une image par étape, puis
// exerce les gestes libres : écrire → envoyer, toucher bref sur le micro, appui maintenu
// (relâcher = envoi, glisser = annulation), appui long sur une bulle → réaction → retrait,
// suppression confirmée, aperçu photo → envoi, position confirmée.
"use strict";
const path = require("path");
const os = require("os");
const fs = require("fs");
const url = require("url");
const { chromium } = require("@playwright/test");

(async () => {
  const fichier = path.resolve(__dirname, "..", "..", "prototypes", "messagerie.html");
  const dossier = path.join(os.tmpdir(), "passio-audit-sondes", "proto-messagerie");
  fs.mkdirSync(dossier, { recursive: true });
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 940 }, deviceScaleFactor: 1 });
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
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const tel = document.querySelector(".proto-telephone");
      const tr = tel.getBoundingClientRect();
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > tr.top && r.top < tr.bottom && r.left < tr.right && r.right > tr.left && cs.visibility !== "hidden" && !el.closest("[hidden]"); };
      const petites = Array.from(tel.querySelectorAll("button, a[href], [role='button']")).filter(vis).map((b) => { const r = b.getBoundingClientRect(); return { t: (b.getAttribute("aria-label") || b.innerText || "").trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((b) => b.w < 44 || b.h < 44);
      const sansNom = Array.from(tel.querySelectorAll("button")).filter(vis).filter((b) => !(b.getAttribute("aria-label") || b.innerText || "").trim()).length;
      const champs = Array.from(tel.querySelectorAll("input, textarea")).filter(vis).map((c) => parseFloat(getComputedStyle(c).fontSize)).filter((f) => f < 16);
      const cible = tel.querySelector(".proto-cible-active");
      const cr = cible && cible.getBoundingClientRect();
      return { etape: (document.querySelector(".proto-etapes li[aria-current='step'] strong") || {}).innerText, ecran: (tel.querySelector("[data-ecran].proto-actif") || {}).getAttribute && tel.querySelector("[data-ecran].proto-actif").getAttribute("data-ecran"), couches: Array.from(tel.querySelectorAll("[data-couche].proto-ouverte")).map((c) => c.getAttribute("data-couche")), cible: cible ? (cible.id || cible.className) : null, cibleDansLeCadre: !!cr && cr.top >= tr.top - 2 && cr.bottom <= tr.bottom + 2, petites, sansNom, champs };
    });
    bilan.push(m);
    await page.locator(".proto-telephone").screenshot({ path: path.join(dossier, "etape-" + String(i + 1).padStart(2, "0") + ".png") });
  }

  // ── Gestes libres
  const libre = {};
  const etat = () => page.evaluate(() => ({ ...document.body.dataset }));
  await page.locator("[data-proto='recommencer']").click(); await page.waitForTimeout(300);
  await page.evaluate(() => PROTO.ecran("conv"));
  await page.locator("#convFpInput").fill("Bonjour Léa");
  libre.boutonApresFrappe = await page.locator("#mcPrincipal").getAttribute("aria-label");
  await page.locator("#mcPrincipal").click(); await page.waitForTimeout(200);
  libre.etatJusteApresEnvoi = await page.locator("#mcMonMessage .mc-etat-zone").innerText();
  await page.waitForTimeout(1500);
  libre.etatApresConfirmation = await page.locator("#mcMonMessage .mc-etat-zone").innerText();
  libre.champVide = (await page.locator("#convFpInput").inputValue()) === "";
  // Toucher bref sur le micro
  const b = await page.locator("#mcPrincipal").boundingBox();
  await page.mouse.move(b.x + 22, b.y + 22); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(200);
  libre.toucherBref = { vocal: (await etat()).vocal, toast: await page.locator("#mcToast").isVisible() && await page.locator("#mcToast").innerText() };
  // Appui maintenu puis relâché
  await page.mouse.down(); await page.waitForTimeout(1400);
  libre.pendantAppui = { vocal: (await etat()).vocal, consigne: await page.locator("#mcRecB").innerText() };
  await page.locator("#conv-fullpage").screenshot({ path: path.join(dossier, "libre-appui.png") });
  await page.mouse.up(); await page.waitForTimeout(250);
  libre.apresRelache = { vocal: (await etat()).vocal, vocalEnvoye: await page.locator("#mcVocalEnvoye").count() };
  // Appui maintenu, glissé à gauche, relâché → annulé
  await page.waitForTimeout(1400);
  const nVoc = await page.locator(".mc-vocal").count();
  await page.mouse.move(b.x + 22, b.y + 22); await page.mouse.down(); await page.waitForTimeout(700);
  await page.mouse.move(b.x - 120, b.y + 22, { steps: 6 }); await page.waitForTimeout(100);
  libre.glisse = await page.locator("#mcRecB").innerText();
  await page.mouse.up(); await page.waitForTimeout(250);
  libre.apresGlisse = { vocal: (await etat()).vocal, vocauxAjoutes: (await page.locator(".mc-vocal").count()) - nVoc, toast: await page.locator("#mcToast").innerText() };
  // Appui long sur la bulle de Léa → feuille au relâchement → réaction → retrait
  await page.waitForTimeout(3000);
  await page.locator("#mcBulleLea").scrollIntoViewIfNeeded();
  const bl = await page.locator("#mcBulleLea").boundingBox();
  await page.mouse.move(bl.x + 40, bl.y + 15); await page.mouse.down(); await page.waitForTimeout(650);
  libre.feuilleAvantRelache = await page.locator("[data-couche='feuille'].proto-ouverte").count();
  await page.mouse.up(); await page.waitForTimeout(250);
  libre.feuilleApresRelache = await page.locator("[data-couche='feuille'].proto-ouverte").count();
  libre.rappel = await page.locator("#mcRappelTexte").innerText();
  libre.signalerVisible = await page.locator("#mcSignaler").isVisible();
  await page.locator("#mcReac button[data-emoji='🔥']").click(); await page.waitForTimeout(200);
  libre.maReaction = await page.locator("#mcMaReaction").count();
  await page.locator("#mcMaReaction").click(); await page.waitForTimeout(150);
  libre.reactionRetiree = (await page.locator("#mcMaReaction").count()) === 0;
  // Clic droit sur mon message → Supprimer… → pour tout le monde
  await page.locator("#mcBulleSamedi").click({ button: "right" }); await page.waitForTimeout(200);
  libre.signalerSurMonMessage = await page.locator("#mcSignaler").isVisible();
  await page.locator("#mcSupprimer").click(); await page.waitForTimeout(150);
  libre.confirmation = await page.locator("[data-couche='supprimer'].proto-ouverte").count();
  await page.locator("[data-couche='supprimer'] .mc-annuler").click(); await page.waitForTimeout(150);
  libre.annulerGarde = await page.locator("#mcMsgSamedi").isVisible();
  // Photo : aperçu puis envoi
  await page.locator("#btnAttach").click(); await page.locator("#mcPlusPhoto").click(); await page.waitForTimeout(150);
  libre.apercu = await page.locator("#mcApercu").isVisible();
  libre.boutonAvecApercu = await page.locator("#mcPrincipal").getAttribute("aria-label");
  await page.locator("#mcPrincipal").click(); await page.waitForTimeout(200);
  libre.photoEnvoyee = await page.locator("#mcPhotoEnvoyee").count();
  // Position confirmée
  await page.locator("#btnAttach").click(); await page.locator("#mcPlusPosition").click(); await page.waitForTimeout(150);
  libre.feuillePosition = await page.locator("[data-couche='position'].proto-ouverte").count();
  await page.locator("#mcPosOk").click(); await page.waitForTimeout(200);
  libre.positionEnvoyee = await page.locator("#mcPositionEnvoyee").count();
  await page.locator("#conv-fullpage").screenshot({ path: path.join(dossier, "libre-fin.png") });
  // Entrée sur ordinateur (pointeur fin) envoie, Maj+Entrée va à la ligne
  await page.locator("#convFpInput").fill("ligne 1"); await page.locator("#convFpInput").press("Shift+Enter");
  libre.majEntree = (await page.locator("#convFpInput").inputValue()).includes("\n");
  console.log(JSON.stringify({ etapes: n, bilan, libre, erreurs }, null, 1));
  console.log("images : " + dossier);
  await nav.close();
  process.exit(erreurs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
