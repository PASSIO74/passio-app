// Sonde 01 — entrer dans la conversation 1:1 « Léa » par un vrai geste, mesurer l'écran.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
module.exports = async ({ page, photo, banc, GENS }) => {
  await page.route("**/audit-vocal.wav*", (r) => r.fulfill({ status: 200, contentType: "audio/wav", body: jeu.wav(3) }));
  await page.evaluate(() => goTo("messages"));
  await page.waitForTimeout(1200);
  await photo("liste");
  const cartes = await page.evaluate(() => [...document.querySelectorAll("#messageList .msg-card")].map((c) => c.innerText.replace(/\s+/g, " ").slice(0, 90)));
  await page.locator("#messageList .msg-card", { hasText: GENS.lea.nom }).first().click();
  await page.waitForTimeout(1800);
  await photo("fil-bas");
  const etat = await page.evaluate(() => {
    const t = document.getElementById("convFpThread");
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      ouvert: document.getElementById("conv-fullpage").classList.contains("active"),
      tete: document.getElementById("convFpHead").innerText.replace(/\s+/g, " "),
      bulles: t.querySelectorAll(".conv-bubble-wrap").length,
      scroll: { top: t.scrollTop, h: t.scrollHeight, ch: t.clientHeight },
      separateurs: [...t.children].filter((e) => !e.classList.contains("conv-bubble-wrap")).map((e) => e.innerText.trim()),
      boites: { tete: r(document.getElementById("convFpHead")), fil: r(t), barre: r(document.querySelector("#conv-fullpage .conv-toolbar")), champ: r(document.getElementById("convFpInput")), envoi: r(document.getElementById("convFpSendBtn")) },
      champ: { fs: getComputedStyle(document.getElementById("convFpInput")).fontSize, ph: document.getElementById("convFpInput").placeholder, aria: document.getElementById("convFpInput").getAttribute("aria-label") },
      focus: document.activeElement && document.activeElement.id,
      hash: location.hash,
    };
  });
  // Remonter pour voir le milieu puis le haut du fil
  await page.evaluate(() => { const t = document.getElementById("convFpThread"); t.scrollTop = t.scrollHeight - t.clientHeight - 620; });
  await page.waitForTimeout(400);
  await photo("fil-milieu");
  await page.evaluate(() => { const t = document.getElementById("convFpThread"); t.scrollTop = t.scrollHeight - t.clientHeight - 1300; });
  await page.waitForTimeout(400);
  await photo("fil-haut2");
  await page.evaluate(() => { const t = document.getElementById("convFpThread"); t.scrollTop = 0; });
  await page.waitForTimeout(400);
  await photo("fil-haut");
  await page.evaluate(() => { const t = document.getElementById("convFpThread"); t.scrollTop = t.scrollHeight; });
  await page.waitForTimeout(300);
  return { cartes, etat };
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
