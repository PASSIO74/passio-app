// Sonde CRÉATION ⑤ — visiteur sans compte : Créer, puis chaque entrée.
"use strict";
const path = require("path");
const fs = require("fs"); const os = require("os");

module.exports = async ({ page, photo }) => {
  const r = {};
  const sauver = () => fs.writeFileSync(path.join(os.tmpdir(), "cre05.json"), JSON.stringify(r, null, 1));
  await page.evaluate(() => { window.__t = []; const _t = window.toast; window.toast = function (m) { window.__t.push(String(m)); return _t.apply(this, arguments); }; });
  r.depart = await page.evaluate(() => ({ ecran: (document.querySelector(".screen.active") || {}).id, nav: !!document.querySelector('#appNavV2 [data-v2-action="create"]'), landing: getComputedStyle(document.getElementById("landing") || document.body).display }));
  sauver(); await photo("depart");
  const cta = page.locator('#appNavV2 [data-v2-action="create"]');
  if (!(await cta.isVisible().catch(() => false))) { r.note = "barre basse absente pour le visiteur"; sauver(); return r; }
  const ouvrir = async () => { await cta.click(); await page.waitForTimeout(500); };
  const modale = () => page.evaluate(() => { const c = document.getElementById("modalContent"); const b = document.getElementById("modalBackdrop"); const ouvert = b && (b.classList.contains("active") || b.classList.contains("open")); return ouvert && c ? c.innerText.slice(0, 300) : null; });
  const fermer = () => page.evaluate(() => { try { closeModal(); } catch (e) {} try { meClose(); } catch (e) {} });
  for (const cle of ["post", "bobine", "irl", "story", "live", "audio"]) {
    await page.evaluate(() => { window.__t = []; });
    await ouvrir();
    if (cle === "post") await photo("feuille");
    await page.locator('[data-v2-create="' + cle + '"]').click(); await page.waitForTimeout(1200);
    r[cle] = { ecran: await page.evaluate(() => (document.querySelector(".screen.active") || {}).id), editeur: await page.evaluate(() => document.getElementById("mediaEditor").classList.contains("open")), modale: await modale(), toasts: await page.evaluate(() => window.__t.slice()) };
    if (cle === "post") {
      await photo("studio");
      await page.locator("#postText").fill("Mon premier texte de visiteur.");
      await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(900);
      r.postPublier = { modale: await modale(), toasts: await page.evaluate(() => window.__t.slice()) };
      await photo("porte-publier");
      await fermer(); await page.waitForTimeout(300);
      r.texteConserve = await page.locator("#postText").inputValue();
    } else if (r[cle].modale) { await photo("porte-" + cle); }
    else if (cle === "live") { await photo("live"); }
    sauver();
    await fermer(); await page.evaluate(() => goTo("feed")); await page.waitForTimeout(400);
  }
  return r;
};
module.exports.demarrage = { mode: "visiteur" };
