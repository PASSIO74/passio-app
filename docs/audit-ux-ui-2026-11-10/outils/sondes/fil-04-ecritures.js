// Sonde — ce que disent les écritures de la discussion quand elles échouent ou n'écrivent rien :
// suppression refusée par le serveur, « Masquer », « Copier le texte » sans permission, blocage sans
// confirmation, double appui sur « Publier », parcours clavier de la carte.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/fil");
const toasts = () => (window.__toasts || []).map((t) => t.msg);
module.exports = async ({ page, serveur, banc, photo }) => {
  const out = {};
  await page.waitForTimeout(1800);
  // Parcours clavier depuis le haut de la page
  out.clavier = (await banc.parcoursClavier(page, 16)).map((a) => a && [a.balise, a.nom, a.indicateur, a.dansEcran]);
  const ouvrir = async () => { await page.evaluate(() => { openComments("pa_lea_1"); }); await page.waitForTimeout(1800); };
  await ouvrir();
  // 1. Double appui sur « Publier »
  await page.locator("#newComment").fill("Commentaire de la sonde, double appui.");
  const pub = page.locator("#modalContent .btn.primary");
  await pub.dblclick();
  await page.waitForTimeout(1500);
  out.doubleAppui = { ecritures: serveur.requetes((r) => r.table === "post_comments" && r.m === "POST").length, dansLaListe: await page.evaluate(() => Array.from(document.querySelectorAll("#commentsBox .comment-text")).filter((e) => /double appui/.test(e.innerText)).length) };
  // 2. Supprimer MON commentaire alors que le serveur refuse (500)
  serveur.pannes.push({ table: "post_comments", methode: "DELETE", status: 500, body: { message: "panne programmée" } });
  await page.locator("#commentsBox .comment[data-commentid='c_fil_moi'] .comment-menu-btn").click();
  await page.locator("#cmtSheet .cmt-sheet-row", { hasText: "Supprimer" }).click();
  await page.waitForTimeout(1200);
  out.suppressionRefusee = { toasts: await page.evaluate(toasts), encoreEnBase: serveur.t.post_comments.some((c) => c.id === "c_fil_moi"), encoreAffiche: await page.evaluate(() => !!document.querySelector("#commentsBox [data-commentid='c_fil_moi']")) };
  serveur.pannes.length = 0;
  // 3. Masquer un commentaire d'autrui, puis relire la discussion (cache de 20 s vidé = temps simulé)
  await page.locator("#commentsBox .comment[data-commentid='c_fil_recent'] .comment-menu-btn").click();
  await page.locator("#cmtSheet .cmt-sheet-row", { hasText: "Masquer" }).click();
  await page.waitForTimeout(600);
  out.masque = { affiche: await page.evaluate(() => !!document.querySelector("#commentsBox [data-commentid='c_fil_recent']")) };
  await page.evaluate(() => { closeModal(); window._cmtThreadLoadedAt = {}; });
  await ouvrir();
  out.apresRelecture = await page.evaluate(() => ({ masqueRevenu: !!document.querySelector("#commentsBox [data-commentid='c_fil_recent']"), supprimeRevenu: !!document.querySelector("#commentsBox [data-commentid='c_fil_moi']"), titre: document.querySelector(".modal-title").innerText }));
  // 4. Copier le texte sans permission de presse-papiers
  await page.evaluate(() => { window.__toasts.length = 0; window.__rejets = []; window.addEventListener("unhandledrejection", (e) => window.__rejets.push(String(e.reason && e.reason.name))); });
  await page.locator("#commentsBox .comment .comment-menu-btn").nth(1).click();
  await page.locator("#cmtSheet .cmt-sheet-row", { hasText: "Copier" }).click();
  await page.waitForTimeout(700);
  out.copie = await page.evaluate(() => ({ toasts: window.__toasts.map((t) => t.msg), rejets: window.__rejets }));
  // 5. Bloquer depuis le menu d'un commentaire : confirmation ?
  await page.evaluate(() => { window.__toasts.length = 0; });
  await page.locator("#commentsBox .comment[data-commentid='c_fil_malik'] .comment-menu-btn").click();
  await page.locator("#cmtSheet .cmt-sheet-row", { hasText: "Bloquer" }).click();
  await page.waitForTimeout(1200);
  out.blocage = await page.evaluate(() => ({ toasts: window.__toasts.map((t) => t.msg), bloques: (state.user.blocked || []).length, suivis: (state.user.following || []).length, modale: document.getElementById("modalBackdrop").classList.contains("active"), texteModale: document.getElementById("modalContent").innerText.slice(0, 160), toastDom: Array.from(document.querySelectorAll("#toastStack .toast, .toast")).map((t) => t.innerText).slice(0, 3) }));
  out.blocageServeur = serveur.t.blocks.length;
  await photo("a-apres-blocage");
  return out;
};
module.exports.demarrage = { mode: "compte", nbPassions: 3, peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
