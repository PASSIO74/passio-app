// Sonde — LE TOAST EST-IL VU ? Mesure de l'ordre de peinture réel du toast
// (#toastStack, z-index 200) face aux surfaces d'où part un partage :
// écran normal, page d'une publication, fiche d'activité, feuille basse
// (.modal-backdrop, 10001), lecteur de bobines (.reels-viewer, 9999),
// conversation plein écran.
//
// ⚠️ Deux pièges de mesure, tous deux rencontrés :
//  · `.toast-stack` est en `pointer-events:none` : `elementFromPoint` ne rend
//    JAMAIS un toast. La sonde lève donc cette propriété le temps de la mesure.
//  · une capture prise « animations coupées » (celle du banc) avance l'animation
//    `toastOut … forwards` à sa fin : le toast y est TOUJOURS transparent. Les
//    images de cette sonde sont prises animations ACTIVES, 500 ms après le toast.
"use strict";
const path = require("path");
const os = require("os");
const base = require("../jeu/base");
const jeu = require("../jeu/partage");

const mesurer = () => {
  const pile = document.getElementById("toastStack");
  const t = pile.querySelector(".toast:last-child");
  if (!t) return null;
  const avantPile = pile.style.pointerEvents, avantT = t.style.pointerEvents;
  pile.style.pointerEvents = "auto"; t.style.pointerEvents = "auto";
  const r = t.getBoundingClientRect();
  const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 6, r.top + r.height / 2], [r.right - 6, r.top + r.height / 2]];
  const vus = pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e === t || t.contains(e) ? "toast" : (e ? (e.id || String(e.className).slice(0, 30) || e.tagName) : "rien"); });
  pile.style.pointerEvents = avantPile; t.style.pointerEvents = avantT;
  return { txt: t.innerText.slice(0, 50), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], auDessus: vus, vu: vus.every((v) => v === "toast"), opacite: getComputedStyle(t).opacity };
};

module.exports = async ({ page, vue }) => {
  const out = {};
  const dossier = path.join(os.tmpdir(), "passio-audit-sondes");
  const vraiePhoto = async (nom) => { const f = path.join(dossier, "partage-07-toast-plans--" + vue + "-" + nom + ".png"); await page.screenshot({ path: f }); console.log("image (animations actives) : " + f); };
  const cas = async (nom, preparer) => {
    try {
      if (preparer) await preparer();
      await page.waitForTimeout(500);
      await page.evaluate(() => toast("Lien copié"));
      await page.waitForTimeout(500);
      out[nom] = await page.evaluate(mesurer);
      await vraiePhoto(nom);
      await page.waitForTimeout(3000);
    } catch (e) { out[nom] = { ECHEC: String(e.message).split("\n")[0] }; }
  };
  out.z = await page.evaluate(() => { const z = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).zIndex + " / " + getComputedStyle(e).position : null; }; return { toast: z("#toastStack"), modale: z("#modalBackdrop"), bobines: z("#reelsViewer"), post: z("#postDetailPage"), fiche: z("#eventDetailPage"), conversation: z("#conv-fullpage"), menu: z(".profile-dots-menu") }; });
  await page.waitForTimeout(1200);
  await cas("1-ecran-fil");
  await cas("2-page-publication", async () => { await page.evaluate(() => openPost("pa_lea_1")); });
  await cas("3-feuille-partage-publication", async () => { await page.evaluate(() => sharePost("pa_lea_1")); });
  await page.evaluate(() => { closeModal(); closePost(); });
  await cas("4-fiche-activite", async () => { await page.evaluate((id) => { goTo("irl"); openEventDetails(id); }, jeu.IDS.evAutrui); await page.waitForTimeout(900); });
  await cas("5-feuille-inviter", async () => { await page.evaluate((id) => openEventInvite(id), jeu.IDS.evAutrui); });
  await page.evaluate(() => { closeModal(); closeEventDetail(); goTo("feed"); });
  await cas("6-lecteur-bobines", async () => { await page.evaluate(() => openReelById("pa_lea_2")); await page.waitForTimeout(900); });
  await cas("7-feuille-partage-bobine", async () => { await page.evaluate(() => shareReel("pa_lea_2")); });
  await page.evaluate(() => { closeModal(); if (typeof closeReels === "function") closeReels(); });
  await cas("8-profil-visite", async () => { await page.evaluate((id) => openUserProfile(id), "a0d17000-0000-4000-8000-00000000b002"); await page.waitForTimeout(2200); });
  await page.evaluate(() => closeModal());
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
