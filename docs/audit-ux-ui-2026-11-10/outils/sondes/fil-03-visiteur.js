// Sonde — le fil d'un VISITEUR (appareil vierge) : comment on y arrive, ce qu'il peut faire.
"use strict";
module.exports = async ({ page, photo }) => {
  const out = {};
  out.depart = await page.evaluate(() => ({ landing: !!(document.getElementById("landing") || {}).classList?.contains("active"), boutons: Array.from(document.querySelectorAll("#landing button, #landing a")).filter((b) => b.offsetParent).map((b) => b.innerText.trim().slice(0, 40)) }));
  await photo("a-depart");
  // Entrer sans compte : premier bouton qui le dit.
  const porte = page.locator("#landing button, #landing a").filter({ hasText: /sans compte|Explorer|Découvrir|visiter|Voir/i }).first();
  if (await porte.count()) { out.porte = (await porte.innerText()).trim(); await porte.click(); await page.waitForTimeout(2500); }
  out.apres = await page.evaluate(() => ({ ecran: (document.querySelector(".screen.active") || {}).id, landing: document.getElementById("landing").classList.contains("active"), visiteur: !!(window.PassioFirstRun && PassioFirstRun.estVisiteur && PassioFirstRun.estVisiteur()), texteHaut: document.getElementById("screen-feed").innerText.slice(0, 600), enfants: Array.from(document.querySelectorAll("#feedList > *")).slice(0, 8).map((e) => (e.getAttribute("data-postid") || e.className).toString().slice(0, 40)), overlays: Array.from(document.querySelectorAll("[class*=fr-]")).filter((e) => e.offsetParent).slice(0, 12).map((e) => e.className.toString().slice(0, 40) + " | " + e.innerText.slice(0, 60).replace(/\s+/g, " ")) }));
  await photo("b-fil");
  // J'aime en visiteur
  const like = page.locator('#feedList .post [data-action="like"]').first();
  if (await like.count()) { await like.scrollIntoViewIfNeeded(); await like.click({ force: true }); await page.waitForTimeout(900); }
  out.gate = await page.evaluate(() => ({ modale: document.getElementById("modalBackdrop").classList.contains("active"), texte: document.getElementById("modalContent").innerText.slice(0, 500), autre: Array.from(document.querySelectorAll("[class*=fr-gate], [id*=frGate], [class*=fr-auth]")).filter((e) => e.offsetParent).map((e) => e.innerText.slice(0, 400)) }));
  await photo("c-gate-aimer");
  return out;
};
module.exports.demarrage = { mode: "visiteur" };
