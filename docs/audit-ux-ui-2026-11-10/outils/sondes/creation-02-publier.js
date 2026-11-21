// Sonde CRÉATION ② — publier : vide, double appui, succès (où l'on atterrit,
// quels messages), photo publiée PUIS texte seul, refus serveur, hors ligne,
// conservation du texte (changer d'onglet, recharger).
"use strict";
const path = require("path");
const jeu = require("../jeu/creation");
const MEDIAS = path.join(__dirname, "..", "medias");

module.exports = async ({ page, context, photo }) => {
  const r = {};
  const toasts = () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  const raz = () => page.evaluate(() => { window.__toasts = []; });
  const etat = () => page.evaluate(() => ({ ecran: document.querySelector(".screen.active").id, studioType, texte: document.getElementById("postText").value, bobines: (document.getElementById("reelsViewer") || { classList: { contains: () => false } }).classList.contains("active") }));
  await page.evaluate(() => goTo("studio"));
  await page.waitForTimeout(500);
  // ① vide
  await raz(); await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(400);
  r.vide = await toasts();
  // ② conservation : texte saisi, aller au fil, revenir
  await page.locator("#postText").fill("Brouillon qui doit survivre ?");
  await page.evaluate(() => goTo("feed")); await page.waitForTimeout(400);
  await page.evaluate(() => goTo("studio")); await page.waitForTimeout(400);
  r.apresOnglet = await etat();
  // ③ double appui + succès texte
  await raz();
  await page.locator("#postText").fill("Premier essai de publication au Studio.");
  const t0 = Date.now();
  await page.locator("[data-v6-publier]").click();
  await page.locator("[data-v6-publier]").click({ force: true }).catch(() => {});
  await page.waitForTimeout(250);
  r.pendant = { ...(await etat()), toasts: await toasts(), ms: Date.now() - t0 };
  await photo("pendant");
  await page.waitForTimeout(2500);
  r.succes = { ...(await etat()), toasts: await toasts(), posts: await page.evaluate(() => (state.userPosts || []).map((p) => ({ id: p.id, type: p.type, sync: p.syncStatus, mood: p.mood, passion: p.passion }))), notifs: await page.evaluate(() => (state.notifications || []).slice(0, 2).map((n) => n.text || n.msg || JSON.stringify(n).slice(0, 80))) };
  await photo("succes");
  // ④ photo publiée, puis texte seul
  await page.evaluate(() => goTo("studio")); await page.waitForTimeout(400);
  await page.setInputFiles("#photoInput", path.join(MEDIAS, "photo-carre.jpg")); await page.waitForTimeout(800);
  await page.locator("#postText").fill("Une photo de l'atelier.");
  await raz(); await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(3000);
  r.photoPubliee = { ...(await etat()), toasts: await toasts() };
  await page.evaluate(() => goTo("studio")); await page.waitForTimeout(400);
  await photo("studio-apres-photo");
  r.studioApresPhoto = await page.evaluate(() => ({ studioType, zone: getComputedStyle(document.getElementById("studioPhoto")).display, mood: studioMood }));
  await page.locator("#postText").fill("Et maintenant un texte seul.");
  await raz(); await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(600);
  r.texteApresPhoto = { ...(await etat()), toasts: await toasts() };
  // ⑤ refus serveur (insert posts → 403)
  await page.route(/\/rest\/v1\/posts/, (route) => route.request().method() === "POST" ? route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy" }) }) : route.fallback());
  await page.reload(); await page.waitForTimeout(3500);
  await page.evaluate(() => { window.__toasts = []; const _t = window.toast; window.toast = function (m, ty) { window.__toasts.push({ msg: String(m), type: ty || "info" }); return _t.apply(this, arguments); }; });
  await page.evaluate(() => goTo("studio")); await page.waitForTimeout(500);
  r.apresRechargement = await etat();
  await page.locator("#postText").fill("Publication que le serveur refuse.");
  await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(7000);
  r.refus = { ...(await etat()), toasts: await toasts(), posts: await page.evaluate(() => (state.userPosts || []).slice(0, 3).map((p) => ({ text: (p.text || "").slice(0, 30), sync: p.syncStatus }))) };
  await photo("refus");
  r.carteRefus = await page.evaluate(() => { const c = document.querySelector("#screen-feed .post"); return c ? c.innerText.slice(0, 200) : null; });
  return r;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
