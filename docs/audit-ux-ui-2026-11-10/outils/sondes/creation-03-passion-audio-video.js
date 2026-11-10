// Sonde CRÉATION ③ — « Changer » de passion (recherche), puis Créer → Audio /
// podcast (micro refusé), puis vidéo au Studio.
"use strict";
const path = require("path");
const jeu = require("../jeu/creation");
const MEDIAS = path.join(__dirname, "..", "medias");

module.exports = async ({ page, photo }) => {
  const r = {};
  const fs = require("fs"); const os = require("os"); const sauver = () => fs.writeFileSync(path.join(os.tmpdir(), "cre03.json"), JSON.stringify(r, null, 1));
  const _ph = photo; photo = async (n) => { sauver(); return _ph(n); };
  const toasts = () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  await page.evaluate(() => goTo("studio")); await page.waitForTimeout(500);
  await page.locator(".v6-passio .v6-lien").click(); await page.waitForTimeout(1500);
  await photo("choix-passion");
  r.selecteur = await page.evaluate(() => { const m = document.querySelector(".pss-backdrop, .passion-search, [class*='pss'], #modalContent"); const t = document.querySelector("[role=dialog]"); return { dialog: t ? t.innerText.slice(0, 600) : null, cls: t ? t.className : null }; });
  // chercher une passion non possédée
  const champ = page.locator("[role=dialog] input[type=search], [role=dialog] input").first();
  if (await champ.count()) { await champ.fill("Escalade"); await page.waitForTimeout(1500); }
  await photo("recherche");
  r.resultats = await page.evaluate(() => { const t = document.querySelector("[role=dialog]"); return t ? t.innerText.slice(0, 500) : null; });
  r.item = await page.evaluate(() => { const e = Array.from(document.querySelectorAll(".modal *")).find((x) => x.children.length === 0 && x.textContent.trim() === "Escalade de bloc"); let p = e; while (p && !/BUTTON|LI/.test(p.tagName) && !p.getAttribute("role")) p = p.parentElement; return p ? { tag: p.tagName, cls: p.className, role: p.getAttribute("role"), aria: p.getAttribute("aria-label") || p.getAttribute("aria-pressed") || p.getAttribute("aria-selected"), h: p.getBoundingClientRect().height } : null; });
  const premier = page.locator(".modal").getByText("Escalade de bloc", { exact: true }).first();
  if (await premier.count()) { await premier.click(); await page.waitForTimeout(600); }
  await photo("selection");
  r.pied = await page.evaluate(() => { const t = document.querySelector("[role=dialog]"); return t ? Array.from(t.querySelectorAll("button")).map((b) => b.innerText.trim() + (b.disabled ? " [désactivé]" : "")).filter(Boolean).slice(-6) : null; });
  const valider = page.locator("[role=dialog] button", { hasText: "Publier dans cette passion" });
  r.profilsAvant = await page.evaluate(() => state.user.profiles.filter((p) => !p.archived).map((p) => p.passion));
  if (await valider.count()) { await valider.click(); await page.waitForTimeout(800); }
  r.profilsApres = await page.evaluate(() => state.user.profiles.filter((p) => !p.archived).map((p) => p.passion));
  r.resume = await page.evaluate(() => ({ txt: document.querySelector("[data-v6-passio]").textContent, sel: document.getElementById("postPassion").value, courant: state.user.currentProfileId, toasts: (window.__toasts || []).map((t) => t.msg) }));
  await photo("apres-choix");
  // Créer → Audio / podcast
  await page.locator('#appNavV2 [data-v2-action="create"]').click(); await page.waitForTimeout(400);
  await page.locator('[data-v2-create="audio"]').click(); await page.waitForTimeout(900);
  await photo("audio");
  r.audio = await page.evaluate(() => ({ studioType, bloc: getComputedStyle(document.getElementById("studioAudio")).display, rec: (() => { const b = document.getElementById("recBtn").getBoundingClientRect(); return { w: b.width, h: b.height, role: document.getElementById("recBtn").getAttribute("role"), aria: document.getElementById("recBtn").getAttribute("aria-label") }; })(), fichier: (() => { const b = document.getElementById("audioFileBtn").getBoundingClientRect(); return { w: b.width, h: b.height }; })() }));
  await page.locator("#recBtn").click(); await page.waitForTimeout(900);
  r.micro = { statut: await page.locator("#recStatus").innerText(), toasts: await toasts() };
  await photo("micro-refuse");
  // retour « Publication » depuis Créer : le bloc audio reste-t-il ?
  await page.locator('#appNavV2 [data-v2-action="create"]').click(); await page.waitForTimeout(400);
  await page.locator('[data-v2-create="post"]').click(); await page.waitForTimeout(700);
  r.publicationApresAudio = await page.evaluate(() => ({ studioType, audio: getComputedStyle(document.getElementById("studioAudio")).display }));
  await photo("publication-apres-audio");
  // vidéo
  await page.evaluate(() => { window.__toasts = []; });
  await page.setInputFiles("#videoInput", path.join(MEDIAS, "boucle.webm"));
  await page.waitForTimeout(800);
  await photo("video-pendant");
  for (let i = 0; i < 40; i++) { const t = await toasts(); if (t.some((x) => /chargée|Erreur|trop|impossible/i.test(x))) break; await page.waitForTimeout(1000); }
  r.video = await page.evaluate(() => ({ studioType, aVideo: !!videoDataUrl, taille: videoDataUrl ? videoDataUrl.length : 0, debut: videoDataUrl ? videoDataUrl.slice(0, 30) : null, mp4: (typeof _passioBestVideoMime === "function") ? _passioBestVideoMime() : null }));
  r.videoToasts = await toasts();
  await photo("video");
  return r;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
