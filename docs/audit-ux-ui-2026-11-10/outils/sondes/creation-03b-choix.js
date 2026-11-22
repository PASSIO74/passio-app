// Sonde CRÉATION ③b — choisir une passion non possédée au Studio (isolé).
"use strict";
const jeu = require("../jeu/creation");
module.exports = async ({ page, photo }) => {
  const r = { t: [] };
  const lap = (n) => r.t.push(n + "@" + Date.now());
  await page.evaluate(() => goTo("studio")); await page.waitForTimeout(500);
  await page.locator(".v6-passio .v6-lien").click(); await page.waitForTimeout(1200);
  await page.locator(".modal input").first().fill("Escalade"); await page.waitForTimeout(1200);
  lap("avant-clic");
  await page.evaluate(() => { const e = Array.from(document.querySelectorAll(".modal .psel-item")).find((x) => /Escalade de bloc/.test(x.textContent)); e.click(); });
  lap("apres-clic");
  await page.waitForTimeout(600);
  r.pied = await page.evaluate(() => Array.from(document.querySelectorAll(".modal button")).slice(-3).map((b) => b.innerText.trim() + (b.disabled ? " [désactivé]" : "")));
  r.selection = await page.evaluate(() => Array.from(document.querySelectorAll(".modal .psel-item[aria-selected=true], .modal .psel-chip, .modal [class*=choisi]")).map((e) => e.className + ":" + e.innerText.slice(0, 40)));
  await photo("selection");
  r.profilsAvant = await page.evaluate(() => state.user.profiles.filter((p) => !p.archived).map((p) => p.passion));
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll(".modal button")).find((x) => /Publier dans cette passion/.test(x.textContent)); if (b) b.click(); });
  await page.waitForTimeout(900);
  r.profilsApres = await page.evaluate(() => state.user.profiles.filter((p) => !p.archived).map((p) => p.passion));
  r.resume = await page.evaluate(() => ({ txt: document.querySelector("[data-v6-passio]").textContent, sel: document.getElementById("postPassion").value, toasts: (window.__toasts || []).map((t) => t.msg), modale: !!document.querySelector("#modalBackdrop.active, #modalBackdrop.open") }));
  return r;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
