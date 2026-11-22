// Sonde bobines 03 : visionneuse de stories — ouverture par la bulle, en-tête, progression, zones de toucher, maintien, clavier, enchaînement.
const base = require("../jeu/base");
const jeu = require("../jeu/bobines");
const fs = require("fs"), path = require("path"), os = require("os");
module.exports = async ({ page, photo, banc }) => {
  await page.waitForTimeout(2500);
  const out = {};
  const etat = () => page.evaluate(() => {
    const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    const sv = document.getElementById("storyViewer");
    return { ouvert: sv.classList.contains("active"), g: storyGroupIdx, i: storyItemIdx, auteur: document.getElementById("storyAuthor").textContent, temps: document.getElementById("storyTime").textContent,
      barres: document.querySelectorAll("#storyProgressRow .story-progress").length, barre: (document.getElementById("sp-" + storyItemIdx) || {}).style ? document.getElementById("sp-" + storyItemIdx).style.width : null,
      close: q(".story-viewer-close"), report: q("#storyReportBtn"), card: q("#storyCard"), viewer: q("#storyViewer"), nav: q("#appNav"), son: q("#storySoundBtn"),
      surNav: (() => { const n = document.getElementById("appNav").getBoundingClientRect(); const el = document.elementFromPoint(n.x + n.width / 2, n.y + n.height / 2); return el && (el.id || el.className); })(),
      fondPiste: getComputedStyle(document.querySelector(".story-progress") || document.body).backgroundColor, closeRole: document.querySelector(".story-viewer-close").getAttribute("role"), closeLabel: document.querySelector(".story-viewer-close").getAttribute("aria-label"),
      groupes: storyGroups.map((g) => g.name + ":" + g.stories.length), hash: location.hash };
  });
  await page.locator("#storiesRowFeed .story-item", { hasText: "Léa" }).first().click();
  await page.waitForTimeout(700);
  out.ouverture = await etat();
  await photo("lea-1");
  // Maintien sur la carte : la story se met-elle en pause ?
  const m = await banc.appuiMaintenu(page, "#storyCard");
  const avantMaintien = await page.evaluate(() => document.getElementById("sp-" + storyItemIdx).style.width);
  await page.waitForTimeout(1500);
  const pendantMaintien = await page.evaluate(() => document.getElementById("sp-" + storyItemIdx).style.width);
  await m.relacher();
  out.maintien = { avantMaintien, pendantMaintien, apres: await etat() };
  await page.waitForTimeout(300);
  // Toucher à droite = suivante
  out.avantTap = await etat();
  await page.locator(".story-tap-next").click();
  await page.waitForTimeout(500);
  out.apresTapSuivant = await etat();
  await photo("apres-tap");
  // Clavier
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  out.apresFlecheDroite = await etat();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  out.apresEchap = await etat();
  // Inès (overlays)
  if (out.apresEchap.ouvert) { await page.evaluate(() => closeStoryViewer()); await page.waitForTimeout(300); }
  await page.locator("#storiesRowFeed .story-item", { hasText: "Inès" }).first().click();
  await page.waitForTimeout(900);
  out.ines = await etat();
  await photo("ines");
  await page.evaluate(() => closeStoryViewer());
  await page.waitForTimeout(300);
  await page.locator("#storiesRowFeed .story-item", { hasText: "Malik" }).first().click();
  await page.waitForTimeout(1200);
  out.malik = await etat();
  await photo("malik");
  await page.evaluate(() => closeStoryViewer());
  await page.waitForTimeout(300);
  await page.locator("#storiesRowFeed .story-item", { hasText: "Ta story" }).first().click();
  await page.waitForTimeout(900);
  out.moi = await etat();
  await photo("moi");
  fs.writeFileSync(path.join(os.tmpdir(), "passio-audit-sondes", "bobines-03.json"), JSON.stringify(out, null, 1));
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.peupler(s, c, {}); } };
