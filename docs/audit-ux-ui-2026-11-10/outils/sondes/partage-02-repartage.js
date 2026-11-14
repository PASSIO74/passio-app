// Sonde — « Partager dans mon feed » (repartage interne) : double appui, carte
// produite dans le fil, ce que la carte ouvre, et position du toast par rapport
// à la feuille (superposition).
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/partage");

module.exports = async ({ page, serveur, photo }) => {
  const out = {};
  // Superposition : où vit le toast, où vit la feuille.
  out.plans = await page.evaluate(() => {
    const z = (el) => (el ? { z: getComputedStyle(el).zIndex, pos: getComputedStyle(el).position, parent: el.parentElement && (el.parentElement.id || el.parentElement.className) } : null);
    return { toast: z(document.getElementById("toastStack")), modale: z(document.getElementById("modalBackdrop")), shell: z(document.querySelector(".app-shell")) };
  });
  const carte = page.locator('#screen-feed .post[data-postid="pa_lea_1"]').first();
  await carte.scrollIntoViewIfNeeded();
  await carte.locator('.post-action[aria-label="Partager"]').first().click();
  await page.waitForTimeout(400);
  // Un toast pendant que la feuille est ouverte : est-il visible ?
  await page.evaluate(() => toast("Lien copié"));
  await page.waitForTimeout(350);
  out.toastSousFeuille = await page.evaluate(() => {
    const t = document.querySelector("#toastStack .toast");
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], auDessus: top ? (top.id || top.className || top.tagName) : null, visible: top === t || t.contains(top) };
  });
  await photo("a-toast-sous-feuille");
  await page.waitForTimeout(3200);

  // Double appui RÉEL sur « Partager dans mon feed ».
  const avant = serveur.t.posts.length;
  const btn = page.locator("#_shareInFeedBtn");
  await btn.dblclick();
  await page.waitForTimeout(1800);
  out.apresDouble = await page.evaluate(() => ({
    toasts: (window.__toasts || []).map((t) => t.msg + " [" + t.type + "]"),
    ecran: (document.querySelector(".screen.active") || {}).id,
    modale: document.getElementById("modalBackdrop").classList.contains("active"),
    userPosts: state.userPosts.map((p) => ({ id: p.id.slice(0, 12), text: p.text, passion: p.passion, mood: p.mood, sharedReel: p.sharedReel })),
  }));
  out.serveur = { ajoutes: serveur.t.posts.length - avant, lignes: serveur.t.posts.slice(avant).map((p) => ({ content: p.content, shared_from_post_id: p.shared_from_post_id, shared_data: p.shared_data, passion_id: p.passion_id, mood: p.mood })) };
  await page.waitForTimeout(600);
  await page.evaluate(() => { const m = document.getElementById("appMain"); if (m) m.scrollTop = 0; });
  await page.waitForTimeout(500);
  await photo("b-fil-apres-repartage");
  // La carte du repartage : que contient-elle, qu'ouvre-t-elle ?
  out.carteRepartage = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll("#screen-feed .post[data-postid]")).find((p) => /A partagé un post/.test(p.innerText));
    if (!c) return null;
    return { id: c.getAttribute("data-postid"), texte: c.innerText.slice(0, 400), aImage: !!c.querySelector(".post-media img"), liens: Array.from(c.querySelectorAll("[onclick]")).map((e) => e.getAttribute("onclick").slice(0, 70)) };
  });
  if (out.carteRepartage) {
    await page.locator('#screen-feed .post[data-postid="' + out.carteRepartage.id + '"] .post-body').first().click();
    await page.waitForTimeout(700);
    out.ouvertureRepartage = await page.evaluate(() => { const p = document.getElementById("postDetailPage"); const c = document.querySelector("#postDetailContent .post[data-postid]"); return { ouverte: !!(p && p.style.display && p.style.display !== "none"), id: c && c.getAttribute("data-postid"), texte: c && c.innerText.slice(0, 300) }; });
    await photo("c-detail-repartage");
  }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
