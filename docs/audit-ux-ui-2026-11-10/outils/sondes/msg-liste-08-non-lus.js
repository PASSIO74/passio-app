// Sonde 08 — non-lus, badge de l'onglet, sourdine, archive : ce qui se passe à l'arrivée d'un message.
// Le temps réel est coupé dans le banc : l'arrivée est SIMULÉE en appelant le gestionnaire que le
// canal appelle (`_handleIncomingConvMessage`) avec une ligne de la forme du serveur.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
module.exports = async ({ page, photo, GENS }) => {
  const out = {};
  const item = (texte) => page.locator("#convSettingsContent .csetting-item", { hasText: texte }).first();
  const ouvrir = async (nom) => { await page.locator('#messageList .msg-card:has(.msg-name:has-text("' + nom + '"))').tap(); await page.waitForTimeout(800); };
  const parametres = async () => { await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap(); await page.waitForTimeout(450); };
  const retour = async () => { await page.locator("#convFpHead .conv-fp-back").tap(); await page.waitForTimeout(700); };
  const lecture = () => page.evaluate(() => ({ nav: (document.querySelector(".nav-msg-badge") || {}).textContent || null, ariaNav: (document.querySelector('#appNavV2 [data-v2-key="messages"]') || { getAttribute: () => null }).getAttribute("aria-label"), titre: document.title, cloche: (document.querySelector("#bellDot, .topbar-bell .dot, .bell-badge") || {}).textContent || null, notifs: (state.notifications || []).filter((n) => !n.seen && !n.read).length, nonLusListe: [...document.querySelectorAll("#messageList .msg-card.unread .msg-name")].map((n) => n.textContent) }));
  const arrive = (convId, de, texte) => page.evaluate(async (a) => { window.__sons = window.__sons || 0; if (!window.__sonBranche) { window.__sonBranche = true; const s = window._playMsgSound; window._playMsgSound = function () { window.__sons++; }; try { _playMsgSound = window._playMsgSound; } catch (e) {} } await _handleIncomingConvMessage({ id: "ma_in_" + Math.random().toString(36).slice(2), conv_id: a.convId, from_id: a.de, content: a.texte, created_at: new Date().toISOString().replace("Z", "") }); return window.__sons; }, { convId, de, texte });
  try {
    await page.evaluate(() => goTo("messages"));
    await jeu.attendreListe(page, 5);
    out.depart = await lecture();
    // 1. Sourdine posée par un vrai geste sur Tom, puis un message de Tom arrive
    await ouvrir("Tom Girard"); await parametres(); await item("Couper les notifications").tap(); await page.waitForTimeout(400);
    await page.locator("#convSettingsPanel .conv-fp-back").tap(); await page.waitForTimeout(300); await retour();
    out.listeSourdine = await page.evaluate(() => { const k = [...document.querySelectorAll("#messageList .msg-card")].find((c) => /Tom Girard/.test(c.textContent)); return { html: k.querySelector(".msg-head").innerHTML.replace(/\s+/g, " ").slice(0, 200) }; });
    const notifsAvant = await page.evaluate(() => (state.notifications || []).length);
    out.sonsApresSourdine = await arrive(jeu.ID.tom, GENS.tom.id, "Tu as écouté mon vocal ?");
    await page.waitForTimeout(500);
    out.apresMessageSourdine = Object.assign(await lecture(), { notifsAjoutees: (await page.evaluate(() => (state.notifications || []).length)) - notifsAvant, derniereNotif: await page.evaluate(() => { const n = (state.notifications || [])[0]; return n ? String(n.text || "").replace(/<[^>]+>/g, "") : null; }) });
    await photo("message-recu-en-sourdine");
    // 2. Archive : Léa (2 non-lus) archivée SANS être lue (archivage simulé : le geste réel ouvre la conversation, donc la lit)
    await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); c.archived = true; saveConversationsNow(); renderMessages(); }, jeu.ID.lea);
    await page.waitForTimeout(300);
    out.archiveNonLue = Object.assign(await lecture(), { rangee: await page.evaluate(() => document.getElementById("archivedToggleRow").innerText) });
    await photo("archivee-non-lue");
    // 3. Un message arrive dans une conversation ARCHIVÉE
    await arrive(jeu.ID.lea, GENS.lea.id, "Alors, samedi ?");
    await page.waitForTimeout(500);
    out.messageDansArchivee = Object.assign(await lecture(), { rangee: await page.evaluate(() => document.getElementById("archivedToggleRow").innerText), archivee: await page.evaluate((id) => !!getConversations().find((x) => x.id === id).archived, jeu.ID.lea), dansListe: await page.evaluate(() => [...document.querySelectorAll("#messageList .msg-name")].some((n) => /Léa Fontaine/.test(n.textContent))) });
    await photo("message-dans-archivee");
    // 4. Rafale : dix messages d'un groupe → le plafond du badge
    for (let i = 0; i < 4; i++) await arrive(jeu.ID.groupe, GENS.lea.id, "Message " + (i + 1));
    await page.waitForTimeout(400);
    out.rafale = await lecture();
    await photo("badge-plafond");
    out.badgeGeometrie = await page.evaluate(() => { const b = document.querySelector(".nav-msg-badge"); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { w: Math.round(r.width), h: Math.round(r.height), fs: cs.fontSize, texte: b.textContent, couleur: cs.color, fond: cs.backgroundColor }; });
    // 5. La ligne de liste : combien de non-lus ? (point seul, sans nombre)
    out.ligneGroupe = await page.evaluate(() => { const k = [...document.querySelectorAll("#messageList .msg-card")].find((c) => /Grimpe du jeudi/.test(c.textContent)); const b = k.querySelector(".msg-badge"); return { texteBadge: b ? b.textContent : null, largeur: b ? b.getBoundingClientRect().width : null, apercu: k.querySelector(".msg-preview").textContent, aria: k.getAttribute("aria-label") }; });
    // 6. Lire depuis la cloche : toucher la notification ouvre-t-il la conversation ?
    out.sons = await page.evaluate(() => window.__sons);
  } catch (e) { out.erreur = String((e && e.stack) || e).split(/\n/).slice(0, 5).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerQuelques(srv, ctx); } };
