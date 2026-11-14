// Sonde ENTRÉE 04 — navigation d'un compte connecté : barres, feuille Créer, Paramètres,
// bascule de compte, aides « Compris », retour système, anciens liens, clavier.
"use strict";
const base = require("../jeu/base");
module.exports = async ({ page, photo, banc }) => {
  const lire = () => page.evaluate(() => {
    const vis = (el) => { if (!el) return false; const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return c.display !== "none" && c.visibility !== "hidden" && r.height > 0; };
    const mb = document.getElementById("modalBackdrop");
    const hint = [...document.querySelectorAll(".passio-hint, .hint-bubble, [class*=hint]")].filter(vis).map((h) => ({ cls: h.className, t: h.innerText.replace(/\s+/g, " ").slice(0, 120) })).slice(0, 4);
    return {
      ecran: (document.querySelector(".screen.active") || {}).id, hash: location.hash, hist: history.length,
      modale: mb && mb.classList.contains("active") ? document.getElementById("modalContent").innerText.replace(/\s+/g, " ").slice(0, 300) : null,
      devPanel: document.getElementById("devPanel").classList.contains("active"),
      feuille: (() => { const s = document.getElementById("v2CreateSheet"); return s && !s.hidden; })(),
      hint, scroll: document.getElementById("appMain").scrollTop,
      titres: [...document.querySelectorAll(".screen.active h1, .screen.active h2, .screen.active .section-title")].filter(vis).slice(0, 3).map((e) => e.innerText.trim().slice(0, 50)),
    };
  });
  const out = {};
  out.depart = await lire(); await photo("1-fil");
  // Aides contextuelles : ouvrir un profil depuis le fil (aide feed_auteur ?)
  await page.waitForTimeout(1500); out.aidesFil = await lire(); await photo("2-aides-fil");
  // Défiler le fil, aller sur Rencontrer, revenir : position conservée ?
  await page.locator("#appMain").evaluate((m) => m.scrollTo(0, 1200)); await page.waitForTimeout(700);
  const avant = await page.locator("#appMain").evaluate((m) => m.scrollTop);
  await page.locator('#appNavV2 [data-v2-key="meet"]').click(); await page.waitForTimeout(1300);
  out.rencontrer = await lire(); await photo("3-rencontrer");
  await page.goBack(); await page.waitForTimeout(1300);
  out.retourFil = Object.assign(await lire(), { scrollAvant: avant }); await photo("4-retour-fil");
  await page.locator('#appNavV2 [data-v2-key="meet"]').click(); await page.waitForTimeout(900);
  await page.locator('#appNavV2 [data-v2-key="discover"]').click(); await page.waitForTimeout(1300);
  out.ongletFil = await lire();
  // Feuille Créer
  await page.locator('#appNavV2 [data-v2-key="create"]').click(); await page.waitForTimeout(700);
  out.feuille = await lire(); await photo("5-feuille");
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  out.feuilleEchap = await lire();
  await page.locator('#appNavV2 [data-v2-key="create"]').click(); await page.waitForTimeout(700);
  await page.goBack(); await page.waitForTimeout(800);
  out.feuilleRetour = await lire();
  await page.evaluate(() => { const s = document.getElementById("v2CreateSheet"); if (s && !s.hidden) s.click(); });
  // Paramètres
  await page.locator('.app-topbar [aria-label="Paramètres"]').click(); await page.waitForTimeout(800);
  out.parametres = await lire(); await photo("6-parametres");
  out.parametresTexte = await page.evaluate(() => document.getElementById("devPanel").innerText.replace(/\s+/g, " ").slice(0, 400));
  await page.keyboard.press("Escape"); await page.waitForTimeout(400); out.parametresEchap = await lire();
  await page.goBack(); await page.waitForTimeout(800); out.parametresRetour = await lire();
  await page.evaluate(() => document.getElementById("devPanel").classList.remove("active"));
  // Bascule de compte
  await page.evaluate(() => openAccountSwitch()); await page.waitForTimeout(800);
  out.bascule = await lire(); await photo("7-bascule");
  await page.evaluate(() => closeModal());
  // Anciens liens
  await page.evaluate(() => goTo("wallet")); await page.waitForTimeout(900); out.wallet = await lire();
  await page.evaluate(() => goTo("cdv")); await page.waitForTimeout(900); out.cdv = await lire();
  // Rechargement sur #messages
  await page.evaluate(() => goTo("messages")); await page.waitForTimeout(900);
  await page.reload(); await page.waitForTimeout(6000);
  out.rechargeMessages = await lire(); await photo("8-recharge-messages");
  // Clavier : 14 tabulations depuis le haut
  out.clavier = await banc.parcoursClavier(page, 14);
  await photo("9-clavier");
  return out;
};
module.exports.demarrage = { mode: "compte", sansAides: false, peupler: (srv, ctx) => base.peupler(srv, ctx) };
