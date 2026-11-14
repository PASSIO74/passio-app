// Sonde bobines 04 : états du lecteur — bobine reliée à une activité, photo + texte superposé, vidéo introuvable,
// ma bobine, pause/lecture au toucher, son, fin de liste, sortie vers l'auteur, sortie « Voir l'activité », pause à 15.
const base = require("../jeu/base");
const jeu = require("../jeu/bobines");
const fs = require("fs"), path = require("path"), os = require("os");
module.exports = async ({ page, photo }) => {
  await page.waitForTimeout(2500);
  const out = {};
  const q = () => page.evaluate(() => {
    const it = document.querySelectorAll("#reelsList .reel-item")[reelsState.current];
    const v = it && it.querySelector("video");
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    return { cur: reelsState.current, id: it && it.getAttribute("data-post-id"), kind: it && it.getAttribute("data-v5-kind"), video: v ? { paused: v.paused, muted: v.muted, err: v.dataset.errShown } : null, ph: it && it.querySelector(".reel-media") && it.querySelector(".reel-media").textContent.trim().slice(0, 60), chips: it ? Array.from(it.querySelectorAll(".v5-chip")).map((c) => c.textContent + "@" + r(c)) : [], playBtn: it && r(it.querySelector("[data-video-public-play]")), caption: it && r(it.querySelector(".reel-caption")), info: it && r(it.querySelector(".reel-info")) };
  });
  const aller = async (id) => { await page.evaluate((id) => { const items = Array.from(document.querySelectorAll("#reelsList .reel-item")); const i = items.findIndex((e) => e.getAttribute("data-post-id") === id); items[i].scrollIntoView(); }, id); await page.waitForTimeout(1300); };
  try {
  await page.locator('[data-v2-module="reel"] .v2-reel-tile').first().click();
  await page.waitForTimeout(1500);
  // toucher sur la vidéo = pause ?
  const avant = await q();
  await page.mouse.click(195, 400);
  await page.waitForTimeout(600);
  out.toucherVideo = { avant: avant.video, apres: (await q()).video, playBtn: (await q()).playBtn };
  await photo("apres-toucher");
  await page.mouse.click(195, 400);
  await page.waitForTimeout(400);
  // son
  await page.locator(".reel-item").first().locator(".reel-sound-btn").click({ timeout: 4000 });
  await page.waitForTimeout(300);
  out.son = await q();
  await aller(jeu.IDS.malik); out.malik = await q(); await photo("malik");
  await aller(jeu.IDS.ines); out.ines = await q(); await photo("ines");
  await aller(jeu.IDS.erreur); await page.waitForTimeout(1500); out.introuvable = await q(); await photo("erreur");
  await aller(jeu.IDS.moi); out.moi = await q(); await photo("moi");
  // fin de liste
  await page.evaluate(() => { const items = document.querySelectorAll("#reelsList .reel-item"); items[items.length - 1].scrollIntoView(); });
  await page.waitForTimeout(1500);
  out.fin = Object.assign(await q(), { pauseCarte: await page.evaluate(() => document.getElementById("reelsPause").classList.contains("show")), compteur: await page.evaluate(() => document.getElementById("reelsCounter").textContent), nextDisabled: await page.evaluate(() => document.getElementById("reelsNextBtn").className) });
  await photo("fin");
  // ArrowDown at end
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(600);
  out.finFleche = await q();
  } catch (e) { out.erreur = String(e.message).slice(0, 500); }
  fs.writeFileSync(path.join(os.tmpdir(), "passio-audit-sondes", "bobines-04.json"), JSON.stringify(out, null, 1));
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.peupler(s, c, {}); } };
