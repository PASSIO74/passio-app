// Sonde 02 — champ de saisie : géométrie, position à l'ouverture, clavier simulé,
// multi-ligne, Entrée, double envoi, hors ligne, « réessayer ».
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
module.exports = async ({ page, context, serveur, photo, banc, GENS }) => {
  const out = {};
  await page.route("**/audit-vocal.wav*", (r) => r.fulfill({ status: 200, contentType: "audio/wav", body: jeu.wav(3) }));
  await page.evaluate(() => goTo("messages"));
  await page.waitForTimeout(1000);

  // ① Position du fil dans le temps après l'ouverture (conversation riche en médias)
  await page.locator("#messageList .msg-card", { hasText: GENS.lea.nom }).first().click();
  out.ouverture = [];
  for (const ms of [60, 200, 400, 800, 1500, 3000]) {
    await page.waitForTimeout(ms - (out.ouverture.length ? [60, 200, 400, 800, 1500, 3000][out.ouverture.length - 1] : 0));
    out.ouverture.push(await page.evaluate((t0) => { const t = document.getElementById("convFpThread"); return { ms: t0, resteSousLeBas: Math.round(t.scrollHeight - t.scrollTop - t.clientHeight), h: t.scrollHeight, auBas: t._auBas }; }, ms));
  }
  out.dernierVisible = await page.evaluate(() => { const t = document.getElementById("convFpThread"); const w = t.querySelectorAll(".conv-bubble-wrap"); const d = w[w.length - 1].getBoundingClientRect(); const f = t.getBoundingClientRect(); return { haut: Math.round(d.top), bas: Math.round(d.bottom), filBas: Math.round(f.bottom), visible: d.bottom <= f.bottom + 1 }; });
  await page.evaluate(() => closeConversation());
  await page.waitForTimeout(500);

  // ② Géométrie de la barre de saisie (conversation Inès)
  await page.locator("#messageList .msg-card", { hasText: GENS.ines.nom }).first().click();
  await page.waitForTimeout(1200);
  out.barre = await page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }; };
    const tb = document.querySelector("#conv-fullpage .conv-toolbar");
    const inp = document.getElementById("convFpInput");
    const cs = getComputedStyle(inp);
    // largeur utile du texte et nombre de caractères « moyens » par ligne
    const c = document.createElement("canvas").getContext("2d"); c.font = cs.fontSize + " " + cs.fontFamily;
    const utile = inp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return {
      fenetre: innerWidth,
      enfants: [...tb.children].filter((e) => getComputedStyle(e).display !== "none" && e.id !== "convAttachMenu").map((e) => ({ el: e.id || e.className || e.tagName, nom: e.getAttribute("aria-label") || "", ...r(e) })),
      champ: { ...r(inp), utile: Math.round(utile), caracteresParLigne: Math.floor(utile / (c.measureText("Bonjour, tu viens samedi matin ou plutôt en fin de journée ?").width / 60)), enterkeyhint: inp.getAttribute("enterkeyhint"), inputmode: inp.getAttribute("inputmode"), autocapitalize: inp.getAttribute("autocapitalize"), maxlength: inp.getAttribute("maxlength"), aria: inp.getAttribute("aria-label"), rows: inp.rows },
      envoi: { desactive: document.getElementById("convFpSendBtn").disabled, opacite: getComputedStyle(document.getElementById("convFpSendBtn")).opacity },
    };
  });
  await photo("barre-vide");

  // ③ Toucher le champ puis clavier simulé (fenêtre réduite de 300 px)
  await page.locator("#convFpInput").tap();
  await page.waitForTimeout(250);
  const restituer = await banc.simulerClavier(page, 300);
  out.clavier = await page.evaluate(() => {
    const inp = document.getElementById("convFpInput").getBoundingClientRect();
    const t = document.getElementById("convFpThread");
    const w = t.querySelectorAll(".conv-bubble-wrap"); const d = w[w.length - 1].getBoundingClientRect();
    const tete = document.getElementById("convFpHead").getBoundingClientRect();
    return { innerHeight, vv: window.visualViewport ? Math.round(visualViewport.height) : null, appVh: document.documentElement.style.getPropertyValue("--app-vh"), champ: { haut: Math.round(inp.top), bas: Math.round(inp.bottom), visible: inp.bottom <= innerHeight }, dernierMessage: { haut: Math.round(d.top), bas: Math.round(d.bottom), visible: d.bottom <= innerHeight && d.top >= 0 }, tete: { haut: Math.round(tete.top), bas: Math.round(tete.bottom) }, focus: document.activeElement.id, scrollY: window.scrollY, docScroll: document.documentElement.scrollTop };
  });
  await photo("clavier-ouvert");

  // ④ Frappe multi-ligne réelle (Maj+Entrée n'existe pas sur un clavier virtuel)
  await page.keyboard.type("Bonjour Inès, est-ce que tu serais disponible samedi matin pour me montrer le développement ? Je peux apporter deux pellicules déjà exposées.");
  await page.waitForTimeout(200);
  out.multiligne = await page.evaluate(() => { const i = document.getElementById("convFpInput"); return { hauteur: i.offsetHeight, scrollHeight: i.scrollHeight, lignes: Math.round(i.scrollHeight / (parseFloat(getComputedStyle(i).lineHeight) || 22.4)), valeur: i.value.length }; });
  await photo("clavier-multiligne");
  await page.keyboard.type(" Et si tu as un thermomètre de labo, je veux bien te l'emprunter, le mien est resté chez mes parents. On peut aussi faire ça dimanche si c'est plus simple pour toi, je suis libre toute la journée.");
  await page.waitForTimeout(200);
  out.multiligneMax = await page.evaluate(() => { const i = document.getElementById("convFpInput"); return { hauteur: i.offsetHeight, scrollHeight: i.scrollHeight, defileInterne: i.scrollHeight > i.clientHeight + 1 }; });
  await photo("clavier-max");

  // ⑤ Entrée sur clavier (émulation mobile) : saut de ligne ou envoi ?
  const avant = await page.evaluate((id) => getConversations().find((c) => c.id === id).messages.length, jeu.IDS.ines);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  out.entree = await page.evaluate(([id, n]) => { const c = getConversations().find((x) => x.id === id); const i = document.getElementById("convFpInput"); return { messagesAjoutes: c.messages.length - n, champVide: i.value === "", hauteurChamp: i.offsetHeight, dernier: c.messages[c.messages.length - 1].text.slice(0, 40), statut: c.messages[c.messages.length - 1].status, focus: document.activeElement.id }; }, [jeu.IDS.ines, avant]);
  await photo("apres-entree");
  await restituer();

  // ⑥ Double appui sur Envoyer et Entrée répétée
  const n0 = serveur.t.conv_messages.filter((m) => m.conv_id === jeu.IDS.ines).length;
  await page.locator("#convFpInput").fill("Un seul message attendu");
  await page.locator("#convFpSendBtn").dblclick({ delay: 30 });
  await page.waitForTimeout(700);
  await page.locator("#convFpInput").fill("Entrée trois fois");
  await page.locator("#convFpInput").focus();
  await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  out.doublons = { lignesAjouteesEnBase: serveur.t.conv_messages.filter((m) => m.conv_id === jeu.IDS.ines).length - n0, attendu: 2 };

  // ⑦ Message vide / espaces
  await page.locator("#convFpInput").fill("    ");
  await page.locator("#convFpSendBtn").click();
  await page.waitForTimeout(300);
  out.vide = { lignes: serveur.t.conv_messages.filter((m) => m.conv_id === jeu.IDS.ines).length - n0, champ: await page.locator("#convFpInput").inputValue() };

  // ⑧ Hors ligne : envoi, état, puis reconnexion
  await context.setOffline(true);
  await page.locator("#convFpInput").fill("Envoyé sans réseau");
  await page.locator("#convFpSendBtn").click();
  await page.waitForTimeout(900);
  out.horsLigne = await page.evaluate((id) => {
    const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1];
    const h = document.querySelector('#convFpThread [data-msgst="' + CSS.escape(m.id) + '"]');
    const lien = h && h.querySelector("span[onclick]"); const b = lien ? lien.getBoundingClientRect() : null;
    return { statut: m.status, file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length, indicateur: h ? h.innerText.trim() : null, cible: b ? { w: Math.round(b.width), h: Math.round(b.height) } : null, couleur: lien ? getComputedStyle(lien).color : null, taille: lien ? getComputedStyle(lien).fontSize : null, toasts: (window.__toasts || []).map((t) => t.msg).slice(-3), bandeau: !!document.querySelector(".offline-banner, #offlineBanner, .net-banner") };
  }, jeu.IDS.ines);
  await photo("hors-ligne");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(1500);
  out.reconnexion = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; return { statut: m.status, file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length, toasts: (window.__toasts || []).map((t) => t.msg).slice(-2) }; }, jeu.IDS.ines);
  await photo("reconnexion");

  // ⑨ Refus serveur (500 programmé) → « réessayer » ; puis nouvel appui
  serveur.pannes.push({ table: "conv_messages", methode: "POST", status: 500, body: { message: "panne programmée du banc" }, fois: 1 });
  await page.locator("#convFpInput").fill("Refusé une fois par le serveur");
  await page.locator("#convFpSendBtn").click();
  await page.waitForTimeout(1200);
  out.echec = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; const h = document.querySelector('#convFpThread [data-msgst="' + CSS.escape(m.id) + '"]'); return { statut: m.status, indicateur: h ? h.innerText.trim() : null, toasts: (window.__toasts || []).map((t) => t.msg).slice(-2), file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length }; }, jeu.IDS.ines);
  await photo("echec");
  const lien = page.locator('#convFpThread [data-msgst] span[onclick]').last();
  if (await lien.count()) { await lien.tap(); await page.waitForTimeout(1200); }
  out.apresReessai = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; return { statut: m.status }; }, jeu.IDS.ines);
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
