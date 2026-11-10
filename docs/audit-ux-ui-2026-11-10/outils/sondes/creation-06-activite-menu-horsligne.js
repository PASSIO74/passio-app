// Sonde CRÉATION ⑥ — « Partager mon expérience » (activité passée) → Studio ;
// le rattachement survit-il à un abandon ? Menu ⋯ de ma publication ; hors ligne.
"use strict";
const path = require("path");
const fs = require("fs"); const os = require("os");
const jeu = require("../jeu/creation");

module.exports = async ({ page, context, photo }) => {
  const r = {};
  const sauver = () => fs.writeFileSync(path.join(os.tmpdir(), "cre06.json"), JSON.stringify(r, null, 1));
  const toasts = () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  await page.evaluate(() => openEventDetails("ev_cre_passee")); await page.waitForTimeout(1800);
  r.fiche = await page.evaluate(() => Array.from(document.querySelectorAll("button")).filter((b) => /Partager mon expérience/.test(b.textContent) && b.getBoundingClientRect().height > 0).map((b) => { const x = b.getBoundingClientRect(); return { h: x.height, y: x.y }; }));
  sauver(); await photo("fiche");
  const btn = page.locator("button", { hasText: "Partager mon expérience" }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click(); await page.waitForTimeout(900);
    r.studio = await page.evaluate(() => ({ ecran: document.querySelector(".screen.active").id, texte: document.getElementById("postText").value, rattache: window._pendingEventPost || null, mention: /activit|Atelier/i.test(document.getElementById("v6Composer").innerText.replace(document.getElementById("postText").value, "")) }));
    r.toastsStudio = await toasts();
    sauver(); await photo("studio-experience");
    // abandon : on quitte le Studio sans publier
    await page.evaluate(() => goTo("feed")); await page.waitForTimeout(500);
    await page.evaluate(() => goTo("studio")); await page.waitForTimeout(500);
    await page.locator("#postText").fill("Un tout autre sujet, une semaine plus tard.");
    await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(2800);
    r.apresAbandon = await page.evaluate(() => (state.userPosts || []).slice(0, 1).map((p) => ({ text: p.text, eventId: p.eventId || null })));
    sauver();
  }
  // menu ⋯ de ma publication (pa_moi_1 dans le fil) + celle qu'on vient de publier
  await page.evaluate(() => goTo("feed")); await page.waitForTimeout(800);
  const mien = page.locator('#screen-feed .post').first().locator('[aria-label*="ptions"], .post-dots, .post-more, button:has-text("⋯")').first();
  r.menuSel = await mien.count();
  if (r.menuSel) { await mien.click(); await page.waitForTimeout(600); r.menu = await page.evaluate(() => document.getElementById("modalContent").innerText); await photo("menu-mien"); await page.evaluate(() => closeModal()); }
  sauver();
  // hors ligne
  await page.evaluate(() => goTo("studio")); await page.waitForTimeout(400);
  await context.setOffline(true);
  await page.evaluate(() => { window.__toasts = []; });
  await page.locator("#postText").fill("Publié sans réseau.");
  await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(6500);
  r.horsLigne = { toasts: await toasts(), post: await page.evaluate(() => (state.userPosts || []).slice(0, 1).map((p) => ({ text: p.text, sync: p.syncStatus }))) };
  sauver(); await photo("hors-ligne");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(4000);
  r.retour = { toasts: await toasts(), post: await page.evaluate(() => (state.userPosts || []).slice(0, 1).map((p) => ({ text: p.text, sync: p.syncStatus }))), carte: await page.evaluate(() => { const c = document.querySelector("#screen-feed .post"); return c ? c.innerText.slice(0, 120) : null; }) };
  sauver(); await photo("retour-reseau");
  return r;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
