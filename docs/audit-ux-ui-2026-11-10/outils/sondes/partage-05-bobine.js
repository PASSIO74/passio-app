// Sonde — partage d'une BOBINE : bouton du rail, feuille à huit options,
// ce que chaque option transmet, visibilité du toast par-dessus le lecteur
// (z-index 9999), sort du lecteur après « Partager dans le Feed », double appui.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/partage");

const toastVisible = () => {
  const ts = Array.from(document.querySelectorAll("#toastStack .toast"));
  return ts.map((t) => { const r = t.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { txt: t.innerText, visible: top === t || t.contains(top), auDessus: top ? (top.id || String(top.className).slice(0, 40) || top.tagName) : null }; });
};

module.exports = async ({ page, serveur, photo, context }) => {
  const out = {};
  // Entrée par un vrai geste : la vignette du rail « Bobines à découvrir ».
  out.rail = await page.evaluate(() => Array.from(document.querySelectorAll("#screen-feed [onclick*='openReelById']")).map((e) => e.getAttribute("onclick").slice(0, 60)).slice(0, 6));
  const vignette = page.locator("#screen-feed [onclick*=\"openReelById('pa_lea_2')\"]").first();
  out.vignette = await vignette.count();
  if (out.vignette) { await vignette.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await photo("a-rail"); await vignette.click(); }
  else await page.evaluate(() => openReelById("pa_lea_2"));
  await page.waitForTimeout(1500);
  out.lecteur = await page.evaluate(() => {
    const v = document.getElementById("reelsViewer");
    const it = document.querySelector(".reel-item");
    const b = document.querySelector(".reel-item .reel-action-btn[aria-label='Partager']");
    const r = b ? b.getBoundingClientRect() : null;
    return { ouvert: v.classList.contains("active"), z: getComputedStyle(v).zIndex, hash: location.hash, premier: it && it.getAttribute("data-reelid"), bouton: r ? [Math.round(r.width), Math.round(r.height)] : null, nb: document.querySelectorAll(".reel-item").length };
  });
  await photo("b-lecteur");
  await page.locator(".reel-item .reel-action-btn[aria-label='Partager']").first().click();
  await page.waitForTimeout(600);
  out.feuille = await page.evaluate(() => {
    const c = document.getElementById("modalContent");
    return { texte: c.innerText, boutons: Array.from(c.querySelectorAll("button")).map((x) => { const r = x.getBoundingClientRect(); return { t: x.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height), fs: getComputedStyle(x).fontSize }; }), apercu: !!c.querySelector("img, video"), hauteur: Math.round(c.getBoundingClientRect().height) };
  });
  await photo("c-feuille-bobine");

  // Ce que chaque option transmet (ouverture de fenêtre interceptée).
  await page.evaluate(() => { window.__ouvertures = []; window.open = function (u) { window.__ouvertures.push(u); return null; }; });
  for (const nom of ["WhatsApp", "Telegram", "Twitter", "Facebook"]) {
    await page.locator("#modalContent button", { hasText: nom }).first().click();
    await page.waitForTimeout(350);
    out["apres_" + nom] = await page.evaluate(toastVisible);
    out["modale_" + nom] = await page.evaluate(() => document.getElementById("modalBackdrop").classList.contains("active"));
    if (nom === "WhatsApp") await photo("d-apres-whatsapp");
    await page.waitForTimeout(3100);
    await page.locator(".reel-item .reel-action-btn[aria-label='Partager']").first().click();
    await page.waitForTimeout(400);
  }
  out.ouvertures = await page.evaluate(() => window.__ouvertures.map((u) => decodeURIComponent(u)));

  // Copier le lien : presse-papiers refusé puis accordé.
  await page.locator("#modalContent button", { hasText: "Copier le lien" }).click();
  await page.waitForTimeout(500);
  out.copieRefusee = await page.evaluate(() => ({ modale: document.getElementById("modalBackdrop").classList.contains("active"), toasts: (window.__toasts || []).map((t) => t.msg).slice(-2) }));
  out.copieRefuseeVisible = await page.evaluate(toastVisible);
  await photo("e-copie-refusee");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  if (!(await page.evaluate(() => document.getElementById("modalBackdrop").classList.contains("active")))) { await page.locator(".reel-item .reel-action-btn[aria-label='Partager']").first().click(); await page.waitForTimeout(400); }
  await page.locator("#modalContent button", { hasText: "Copier le lien" }).click();
  await page.waitForTimeout(500);
  out.copie = await page.evaluate(async () => ({ modale: document.getElementById("modalBackdrop").classList.contains("active"), presse: await navigator.clipboard.readText().catch((e) => "ERR " + e.message), lecteur: document.getElementById("reelsViewer").classList.contains("active") }));
  out.copieVisible = await page.evaluate(toastVisible);
  await photo("f-copie-accordee");
  await page.waitForTimeout(3100);

  // Partager dans le Feed : double appui réel.
  await page.locator(".reel-item .reel-action-btn[aria-label='Partager']").first().click();
  await page.waitForTimeout(400);
  const avant = serveur.t.posts.length;
  await page.locator("#modalContent button", { hasText: "Partager dans le Feed" }).dblclick();
  await page.waitForTimeout(600);
  out.repartageVisible = await page.evaluate(toastVisible);
  await photo("g-apres-repartage");
  await page.waitForTimeout(1500);
  out.repartage = await page.evaluate(() => ({ lecteur: document.getElementById("reelsViewer").classList.contains("active"), ecran: (document.querySelector(".screen.active") || {}).id, hash: location.hash, toasts: (window.__toasts || []).map((t) => t.msg + " [" + t.type + "]").slice(-3), userPosts: state.userPosts.filter((p) => /bobine/.test(p.text || "")).length }));
  out.serveur = serveur.t.posts.slice(avant).map((p) => ({ content: p.content, shared_from_post_id: p.shared_from_post_id, is_reel: p.is_reel }));
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
