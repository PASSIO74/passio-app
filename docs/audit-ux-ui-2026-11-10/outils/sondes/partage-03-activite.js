// Sonde — portes de partage d'une ACTIVITÉ : carte de la liste, fiche (trois
// portes « Partager » + « Inviter »), feuille de partage, feuille d'invitation.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/partage");

const boite = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; };

module.exports = async ({ page, serveur, photo }) => {
  const out = {};
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(1800);
  await photo("a-rencontrer");
  out.cartes = await page.evaluate(() => Array.from(document.querySelectorAll("#screen-irl [onclick*='openEventDetails'], #screen-irl [data-eventid], #screen-irl .event-card")).slice(0, 12).map((e) => ({ cls: e.className, id: e.getAttribute("data-eventid"), t: e.innerText.slice(0, 60).replace(/\n/g, " | ") })));
  out.partagesListe = await page.evaluate(() => Array.from(document.querySelectorAll("#screen-irl [onclick*='shareEvent']")).map((e) => { const r = e.getBoundingClientRect(); return { on: e.getAttribute("onclick").slice(0, 60), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 }; }));
  // Ouvre la fiche de l'activité d'autrui (geste réel si la carte existe, sinon appel).
  const carte = page.locator("#screen-irl").locator("text=Atelier lutherie").first();
  out.carteTrouvee = await carte.count();
  if (out.carteTrouvee) { await carte.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await photo("b-carte-liste"); await carte.click(); }
  else await page.evaluate((id) => openEventDetails(id), jeu.IDS.evAutrui);
  await page.waitForTimeout(1500);
  await photo("c-fiche-haut");
  out.fiche = await page.evaluate(() => {
    const p = document.getElementById("eventDetailPage");
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const portes = Array.from(p.querySelectorAll("[onclick*='shareEvent'], #eventDetailShareBtn, [onclick*='openEventInvite'], [onclick*='shareEventExperience'], [data-orga-qr], [data-affiche-rencontre]")).filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, tag: e.tagName, t: (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 40), label: e.getAttribute("aria-label"), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top + p.scrollTop), cls: e.className }; });
    return { ouverte: p.style.display, hash: location.hash, portes, hauteur: p.scrollHeight };
  });
  // Faire défiler pour voir la rangée d'actions et la barre d'engagement.
  await page.evaluate(() => { const b = document.querySelector("#eventDetailPage [onclick*='openEventInvite']"); if (b) b.scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(300);
  await photo("d-fiche-rangee");
  await page.evaluate(() => { const b = document.querySelector("#eventDetailContent .post-actions"); if (b) b.scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(300);
  await photo("e-fiche-barre");

  // Feuille de partage (depuis le bouton de la rangée, geste réel).
  await page.evaluate(() => { const b = document.querySelector("#eventDetailContent button[onclick*='shareEvent(']"); if (b) b.scrollIntoView({ block: "center" }); });
  await page.locator("#eventDetailContent button[onclick*='shareEvent(']").first().click();
  await page.waitForTimeout(500);
  out.feuille = await page.evaluate(() => { const c = document.getElementById("modalContent"); return { texte: c.innerText, boutons: Array.from(c.querySelectorAll("button")).map((x) => { const r = x.getBoundingClientRect(); return { t: x.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height) }; }) }; });
  await photo("f-feuille-activite");
  // Ce que « Partager en dehors » transmet (feuille native simulée).
  await page.evaluate(() => { window.__partages = []; navigator.share = (d) => { window.__partages.push(d); return Promise.resolve(); }; });
  await page.locator("#_shareEvOutBtn").click();
  await page.waitForTimeout(300);
  out.natif = await page.evaluate(() => window.__partages);
  await page.evaluate(() => { delete navigator.share; try { Object.getPrototypeOf(navigator).share = undefined; } catch (e) {} });
  out.shareApresRetrait = await page.evaluate(() => typeof navigator.share);
  // Repartage dans le fil.
  const avant = serveur.t.posts.length;
  await page.locator("#_shareEvInFeedBtn").click();
  await page.waitForTimeout(1800);
  out.repartage = await page.evaluate(() => ({ toasts: (window.__toasts || []).map((t) => t.msg + " [" + t.type + "]"), ecran: (document.querySelector(".screen.active") || {}).id, ficheEncoreOuverte: document.getElementById("eventDetailPage").style.display, hash: location.hash }));
  out.serveur = serveur.t.posts.slice(avant).map((p) => ({ content: p.content, shared_data: p.shared_data, mood: p.mood }));
  await photo("g-apres-repartage-activite");
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
