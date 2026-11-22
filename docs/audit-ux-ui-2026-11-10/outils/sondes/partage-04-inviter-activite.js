// Sonde — INVITER à une activité : feuille « Inviter des amis » (abonnements),
// retour d'envoi (toast sous la feuille ?), ligne côté serveur, état vide,
// recherche ; puis outils d'organisation (QR d'accueil, lien de pointage,
// affiche) et activité passée (« Partager mon expérience »).
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/partage");

module.exports = async ({ page, serveur, photo, context }) => {
  const out = {};
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(1500);
  await page.evaluate((id) => openEventDetails(id), jeu.IDS.evAutrui);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const b = document.querySelector("#eventDetailContent button[onclick*='openEventInvite']"); if (b) b.scrollIntoView({ block: "center" }); });
  await page.locator("#eventDetailContent button[onclick*='openEventInvite']").first().click();
  await page.waitForTimeout(600);
  out.feuille = await page.evaluate(() => {
    const c = document.getElementById("modalContent");
    const inp = document.getElementById("eventInviteSearch");
    return {
      texte: c.innerText, fermetures: c.querySelectorAll(".modal-close").length,
      champ: inp ? { fs: getComputedStyle(inp).fontSize, h: Math.round(inp.getBoundingClientRect().height), label: inp.getAttribute("aria-label"), type: inp.type, inputmode: inp.getAttribute("inputmode"), enterkeyhint: inp.getAttribute("enterkeyhint") } : null,
      lignes: Array.from(c.querySelectorAll(".event-invite-row")).map((r) => { const b = r.querySelector("button"); const br = b.getBoundingClientRect(); return { nom: r.innerText.replace(/\n/g, " | "), bouton: [Math.round(br.width), Math.round(br.height)], hLigne: Math.round(r.getBoundingClientRect().height) }; }),
      tout: !!c.querySelector("[onclick*='inviteAllFollowingToEvent']"),
    };
  });
  await photo("a-feuille-inviter");
  // Inviter Léa ? Elle y va déjà → absente de la liste. Inviter la première ligne.
  const avantN = serveur.t.notifications.length;
  await page.locator("#eventInviteList .event-invite-row button").first().click();
  await page.waitForTimeout(600);
  out.apresInvite = await page.evaluate(() => {
    const t = document.querySelector("#toastStack .toast");
    let vis = null;
    if (t) { const r = t.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); vis = { txt: t.innerText, visible: top === t || t.contains(top), auDessus: top && (top.id || top.className) }; }
    return { toast: vis, bouton: document.querySelector("#eventInviteList .event-invite-row button").outerHTML.slice(0, 160), toasts: (window.__toasts || []).map((x) => x.msg) };
  });
  out.notifs = serveur.t.notifications.slice(avantN).map((n) => ({ user_id: n.user_id.slice(-4), kind: n.kind, content: n.content, ref: n.ref_id }));
  await photo("b-apres-invite");
  // Recherche sans résultat.
  await page.locator("#eventInviteSearch").fill("zzz");
  await page.waitForTimeout(300);
  out.sansResultat = await page.evaluate(() => document.getElementById("eventInviteList").innerText);
  await photo("c-recherche-vide");
  await page.locator("#eventInviteSearch").fill("");
  // Tout inviter (fonction sans porte ?) puis état « tout le monde ».
  out.porteToutInviter = await page.evaluate(() => document.documentElement.innerHTML.indexOf("inviteAllFollowingToEvent(") > -1);
  await page.locator("#eventInviteList .event-invite-row button").first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => _renderEventInviteList());
  await page.waitForTimeout(200);
  out.etatApres = await page.evaluate(() => document.getElementById("eventInviteList").innerText);
  await photo("d-liste-apres");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // Rouvrir : les personnes invitées ont-elles disparu sans trace ?
  await page.locator("#eventDetailContent button[onclick*='openEventInvite']").first().click();
  await page.waitForTimeout(400);
  out.reouverture = await page.evaluate(() => document.getElementById("modalContent").innerText);
  await photo("e-reouverture");
  await page.keyboard.press("Escape");
  await page.evaluate(() => closeEventDetail());
  await page.waitForTimeout(300);

  // ── Mon activité : outils d'organisation ─────────────────────────────────
  await page.evaluate((id) => openEventDetails(id), jeu.IDS.evMoi);
  await page.waitForTimeout(1300);
  out.orga = await page.evaluate(() => {
    const p = document.getElementById("eventDetailPage");
    return Array.from(p.querySelectorAll("button")).filter((b) => b.getBoundingClientRect().width > 0).map((b) => ({ t: b.innerText.trim().slice(0, 50), h: Math.round(b.getBoundingClientRect().height), top: Math.round(b.getBoundingClientRect().top + p.scrollTop) }));
  });
  await page.evaluate(() => { const b = document.querySelector("#eventDetailContent [data-orga-qr]"); if (b) b.scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(300);
  await photo("f-orga-outils");
  await page.locator("#eventDetailContent [data-orga-qr]").first().click();
  await page.waitForTimeout(900);
  out.qr = await page.evaluate(() => document.getElementById("modalContent").innerText);
  await photo("g-qr-accueil");
  await page.locator("#modalContent button[onclick*='_copyCheckinLink']").click();
  await page.waitForTimeout(500);
  out.copiePointage = await page.evaluate(() => { const t = document.querySelector("#toastStack .toast"); let vis = null; if (t) { const r = t.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); vis = { txt: t.innerText, visible: top === t || t.contains(top) }; } return { toast: vis, toasts: (window.__toasts || []).map((x) => x.msg).slice(-2) }; });
  await photo("h-copie-pointage");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3300);
  // Affiche
  const aff = page.locator("#eventDetailContent [data-affiche-rencontre]").first();
  out.afficheBouton = await aff.count();
  if (out.afficheBouton) {
    await aff.click();
    await page.waitForTimeout(1500);
    out.affiche = await page.evaluate(() => { const c = document.getElementById("modalContent"); return { texte: c.innerText, boutons: Array.from(c.querySelectorAll("button, a.btn")).map((b) => ({ t: b.innerText.trim(), h: Math.round(b.getBoundingClientRect().height) })), img: (() => { const i = c.querySelector("img"); if (!i) return null; const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), i.naturalWidth, i.naturalHeight]; })() }; });
    await photo("i-affiche");
    await page.keyboard.press("Escape");
  }
  await page.evaluate(() => closeEventDetail());
  await page.waitForTimeout(300);

  // ── Activité passée : « Partager mon expérience » ────────────────────────
  await page.evaluate((id) => openEventDetails(id), jeu.IDS.evPasse);
  await page.waitForTimeout(1300);
  await photo("j-passee-haut");
  out.passee = await page.evaluate(() => { const p = document.getElementById("eventDetailPage"); return { cta: (document.getElementById("eventDetailCta") || {}).innerText, boutons: Array.from(p.querySelectorAll("button")).filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.trim().slice(0, 40)) }; });
  await page.locator("#eventDetailCta button").first().click();
  await page.waitForTimeout(1200);
  out.experience = await page.evaluate(() => ({ ecran: (document.querySelector(".screen.active") || {}).id, texte: (document.getElementById("postText") || document.querySelector("#screen-studio textarea") || {}).value, passion: (document.getElementById("postPassion") || {}).value, toasts: (window.__toasts || []).map((x) => x.msg).slice(-1), pending: window._pendingEventPost }));
  await photo("k-experience-studio");
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
