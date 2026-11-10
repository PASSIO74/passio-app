// Sonde — OUVERTURE DES LIENS, compte connecté. Deux façons :
//  · LIEN=<query+hash> : le lien est l'adresse de DÉMARRAGE (cas réel d'un lien
//    reçu) — la sonde mesure le délai jusqu'à l'écran d'arrivée ou au message ;
//  · sans LIEN : une série de liens « collés en cours de session » (hashchange),
//    chacun chronométré.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/partage");
const LIEN = process.env.LIEN || "";

const etat = () => {
  const vis = (id) => { const e = document.getElementById(id); return !!(e && e.style.display && e.style.display !== "none"); };
  const pd = document.querySelector("#postDetailContent .post[data-postid]");
  const md = document.getElementById("modalBackdrop").classList.contains("active");
  const rv = document.getElementById("reelsViewer");
  const reelCourant = (() => { if (!rv.classList.contains("open")) return null; try { const items = document.querySelectorAll(".reel-item"); const i = (typeof reelsState !== "undefined" && reelsState) ? reelsState.current : 0; const it = items[i || 0]; return it ? (it.getAttribute("data-reelid") || it.getAttribute("data-id") || (it.querySelector(".reel-author-name") || {}).innerText) : "?"; } catch (e) { return "?"; } })();
  return {
    hash: location.hash, recherche: location.search,
    ecran: (document.querySelector(".screen.active") || {}).id,
    publication: vis("postDetailPage") ? (pd && pd.getAttribute("data-postid")) : null,
    fiche: vis("eventDetailPage") ? (document.querySelector("#eventDetailPage .event-detail-title, #eventDetailPage h1, #eventDetailPage h2") || {}).innerText : null,
    modale: md ? document.getElementById("modalContent").innerText.replace(/\s+/g, " ").slice(0, 90) : null,
    bobines: reelCourant,
    toasts: (window.__toasts || []).map((t) => ({ msg: t.msg, t: t.t })),
  };
};

async function attendreArrivee(page, depuis, maxMs) {
  // Rend { ms, quoi } : le premier signe d'arrivée (écran ouvert) ou de verdict (toast).
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const e = await page.evaluate(etat);
    const nouveaux = e.toasts.filter((t) => t.t >= depuis);
    if (e.publication || e.fiche || e.modale || e.bobines) return { ms: Date.now() - t0, quoi: e, verdict: "ouvert" };
    if (nouveaux.length) return { ms: Date.now() - t0, quoi: e, verdict: "toast : " + nouveaux[0].msg };
    await page.waitForTimeout(250);
  }
  return { ms: maxMs, quoi: await page.evaluate(etat), verdict: "RIEN (délai dépassé)" };
}

async function toutFermer(page) {
  await page.evaluate(() => {
    try { closeModal(); } catch (e) {}
    try { if (typeof closeReels === "function") closeReels(); } catch (e) {}
    try { closePost(); } catch (e) {}
    try { closeEventDetail(); } catch (e) {}
    try { goTo("feed"); } catch (e) {}
  });
  await page.waitForTimeout(700);
}

module.exports = async ({ page, photo, GENS }) => {
  const out = {};
  if (LIEN) {
    // Le lien était l'adresse de démarrage : le banc a déjà attendu ~2,5 s après le fil.
    out.lien = LIEN;
    out.apresBoot = await page.evaluate(etat);
    out.arrivee = await attendreArrivee(page, 0, 20000);
    await page.waitForTimeout(600);
    await photo("arrivee");
    // Retour arrière : où retombe-t-on ?
    await page.goBack().catch(() => {});
    await page.waitForTimeout(900);
    out.apresRetour = await page.evaluate(etat);
    await photo("apres-retour");
    return out;
  }
  const cas = [
    ["post-valide", "#post-" + jeu.IDS.postPublic],
    ["post-compte-prive", "#post-" + jeu.IDS.postPrive],
    ["post-supprime", "#post-" + jeu.IDS.postSupprime],
    ["profil-valide", "#user-" + GENS.lea.id],
    ["profil-prive", "#user-" + GENS.prive.id],
    ["profil-inconnu", "#user-a0d17000-0000-4000-8000-0000000fffff"],
    ["profil-pseudo", "#user-lea"],
    ["bobine-valide", "#reel=" + jeu.IDS.bobine],
    ["bobine-inconnue", "#reel=pa_inconnue_9"],
    ["activite-valide", "#irl-event-" + jeu.IDS.evAutrui],
    ["activite-annulee", "#irl-event-" + jeu.IDS.evAnnule],
    ["activite-inconnue", "#irl-event-" + jeu.IDS.evInconnu],
    ["pointage-code-faux", "#irl-checkin-" + jeu.IDS.evAutrui + "-ZZZZZZ"],
  ];
  for (const [nom, hash] of cas) {
    await toutFermer(page);
    const depuis = await page.evaluate(() => Date.now());
    await page.evaluate((h) => { location.hash = h; }, hash);
    const r = await attendreArrivee(page, depuis, 22000);
    await page.waitForTimeout(500);
    await photo(nom);
    const e = r.quoi;
    out[nom] = { hash, ms: r.ms, verdict: r.verdict, hashApres: e.hash, ecran: e.ecran, publication: e.publication, fiche: e.fiche, modale: e.modale, bobines: e.bobines, toasts: e.toasts.filter((t) => t.t >= depuis).map((t) => t.msg) };
    // Fermeture par le retour arrière : où retombe-t-on ?
    if (r.verdict === "ouvert") {
      await page.goBack().catch(() => {});
      await page.waitForTimeout(800);
      const a = await page.evaluate(etat);
      out[nom].apresRetour = { hash: a.hash, ecran: a.ecran, publication: a.publication, fiche: a.fiche, modale: a.modale, bobines: a.bobines };
    }
    await page.waitForTimeout(2500);
  }
  return out;
};
module.exports.demarrage = { mode: "compte", query: LIEN, peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
