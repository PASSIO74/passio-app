// Sonde bobines 01 : portes d'entrée (rangée de stories, rail « Bobines à découvrir »), puis ouverture du lecteur par la vignette.
const base = require("../jeu/base");
const jeu = require("../jeu/bobines");
module.exports = async ({ page, photo }) => {
  await page.waitForTimeout(3000);
  const out = {};
  out.stories = await page.evaluate(() => Array.from(document.querySelectorAll("#storiesRowFeed .story-item")).map((e) => {
    const r = e.getBoundingClientRect(); const l = e.querySelector(".story-label"); const ring = e.querySelector(".story-ring");
    return { label: l && l.textContent, ring: ring && ring.className, w: Math.round(r.width), h: Math.round(r.height), role: e.getAttribute("role"), tab: e.getAttribute("tabindex"), fs: l && getComputedStyle(l).fontSize };
  }));
  await photo("haut");
  // rail
  const rail = await page.evaluate(() => { const b = document.querySelector('[data-v2-module="reel"]'); if (!b) return null; b.scrollIntoView({ block: "center" }); return Array.from(b.querySelectorAll(".v2-reel-tile")).map((t) => ({ id: t.getAttribute("data-reel-id"), nom: t.querySelector(".v2-reel-name").textContent, img: !!t.querySelector("img"), src: (t.querySelector("img") || {}).src, vide: t.querySelector(".v2-reel-thumb").classList.contains("v2-reel-thumb-empty") })); });
  out.rail = rail;
  await page.waitForTimeout(800);
  await photo("rail");
  out.seedReels = await page.evaluate(() => buildReels().map((p) => ({ id: p.id, src: p._source, type: p.type, video: !!p.video, poster: !!p.poster, auteur: (authorOfReel(p) || {}).name })));
  // Ouvre la première tuile par un vrai toucher
  await page.locator('[data-v2-module="reel"] .v2-reel-tile').first().click();
  await page.waitForTimeout(1500);
  await photo("lecteur");
  out.lecteur = await page.evaluate(() => {
    const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    const v = document.querySelector("#reelsList .reel-item video");
    return { compteur: document.getElementById("reelsCounter").textContent, close: q(".reels-close"), prev: q("#reelsPrevBtn"), next: q("#reelsNextBtn"), son: q(".reel-sound-btn"), tag: q(".reel-tag-mood"), hint: q("#reelsHint"), actions: q(".reel-item .reel-actions"), v5: q(".reel-item .v5-actions"), video: v ? { paused: v.paused, muted: v.muted, src: v.currentSrc || v.getAttribute("src"), ready: v.readyState } : null, nItems: document.querySelectorAll("#reelsList .reel-item").length, hash: location.hash, focus: document.activeElement && (document.activeElement.id || document.activeElement.className) };
  });
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.peupler(s, c, { live: true }); } };
