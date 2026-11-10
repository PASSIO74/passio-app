// Sonde 03 — menu d'un message (appui long), répondre, réagir, copier, transférer,
// signaler, supprimer pour moi / pour tous.
// (Le corps est sous try/catch : la sonde du banc n'imprime pas toujours l'échec.)
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
module.exports = async ({ page, context, serveur, photo, banc, GENS }) => {
  const out = {};
  try {
    await jeu.routes(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await jeu.entrer(page, GENS.lea.nom);
    const sel = jeu.bulle;
    const menu = () => page.evaluate(() => {
      const bd = document.getElementById("modalBackdrop"); const mc = document.getElementById("modalContent");
      const ouvert = !!bd && bd.classList.contains("active");
      if (!ouvert) return { ouvert: false };
      const items = [...mc.querySelectorAll(".csetting-item")].map((e) => { const b = e.getBoundingClientRect(); return { texte: e.innerText.replace(/\s+/g, " ").trim(), h: Math.round(b.height), couleur: getComputedStyle(e.querySelector(".csetting-label")).color, role: e.getAttribute("role"), tabindex: e.getAttribute("tabindex") }; });
      const reacts = [...mc.querySelectorAll("span[onclick^='_reactAndClose']")].map((e) => { const b = e.getBoundingClientRect(); return { e: e.textContent, w: Math.round(b.width), h: Math.round(b.height), role: e.getAttribute("role"), nom: e.getAttribute("aria-label") }; });
      return { ouvert, items, reacts, titre: (mc.querySelector(".modal-title") || {}).innerText || null };
    });
    const appui = async (id) => { await page.locator(sel(id)).scrollIntoViewIfNeeded(); await page.waitForTimeout(250); await banc.appuiLong(page, sel(id), 700); await page.waitForTimeout(500); return menu(); };

    // ① Appui long RÉEL sur un message reçu (texte)
    out.menuRecu = await appui("m_lea_21");
    await photo("menu-recu");
    // ② Répondre
    await page.locator("#modalContent .csetting-item", { hasText: "Répondre" }).click({ timeout: 4000 });
    await page.waitForTimeout(500);
    out.reponse = await page.evaluate(() => {
      const bar = document.getElementById("convReplyBar"); if (!bar) return null;
      const x = bar.querySelector("span[onclick]"); const b = x.getBoundingClientRect();
      return { texte: bar.innerText.replace(/\s+/g, " "), fermer: { w: Math.round(b.width), h: Math.round(b.height), nom: x.getAttribute("aria-label"), role: x.getAttribute("role") }, focus: document.activeElement.id, hauteur: Math.round(bar.getBoundingClientRect().height) };
    });
    await photo("barre-reponse");
    await page.locator("#convFpInput").fill("Oui, et je prends aussi le capodastre.");
    await page.locator("#convFpSendBtn").click();
    await page.waitForTimeout(900);
    out.reponseEnvoyee = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; return { rt: m.replyTo, statut: m.status, barre: !!document.getElementById("convReplyBar") }; }, jeu.IDS.lea);
    out.reponseEnBase = (() => { const l = serveur.t.conv_messages[serveur.t.conv_messages.length - 1]; try { return JSON.parse(l.content); } catch (e) { return l.content; } })();
    await jeu.filPret(page); await jeu.enBas(page);
    await photo("reponse-envoyee");
    // Toucher la citation → saut au message d'origine
    await page.locator(".conv-bubble-wrap.me .conv-reply-quote").last().tap();
    await page.waitForTimeout(1000);
    await photo("saut-citation");

    // ③ Appui long sur MON message (texte) : items
    await jeu.enBas(page);
    out.menuMien = await appui("m_lea_22");
    await photo("menu-mien");
    // ④ Réagir depuis le menu
    if (out.menuMien.ouvert) {
      await page.locator("#modalContent span[onclick^='_reactAndClose']").nth(2).click();   // 👍
      await page.waitForTimeout(700);
      out.reaction = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages.find((x) => x.id === "m_lea_22"); const t = document.getElementById("convFpThread"); return { reactions: m.reactions, myReact: m.myReact, resteSousLeBas: Math.round(t.scrollHeight - t.scrollTop - t.clientHeight) }; }, jeu.IDS.lea);
      out.reactionEnBase = serveur.t.conv_messages.filter((m) => /"type":"react"/.test(m.content) && /m_lea_22/.test(m.content)).map((m) => m.content);
      await jeu.filPret(page);
      await photo("reaction-posee");
      out.pastilles = await page.evaluate(() => { const b = document.querySelector('.conv-bubble-wrap[data-mid="m_lea_22"] .conv-react-badge'); if (!b) return null; const r = b.getBoundingClientRect(); return { onclick: !!b.getAttribute("onclick"), w: Math.round(r.width), h: Math.round(r.height), curseur: getComputedStyle(b).cursor }; });
    }

    // ⑤ Copier le texte
    await jeu.enBas(page);
    const m5 = await appui("m_lea_21");
    if (m5.ouvert) {
      await page.locator("#modalContent .csetting-item", { hasText: "Copier" }).click();
      await page.waitForTimeout(400);
      out.copie = { presse: await page.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR " + e.message)), toasts: await page.evaluate(() => (window.__toasts || []).map((t) => t.msg).slice(-1)) };
    }

    // ⑥ Menu d'une PHOTO reçue
    out.menuPhoto = await appui("m_lea_05");
    out.visionneuseOuverteParAppuiLong = await page.evaluate(() => !!document.getElementById("fullImgViewer"));
    await photo("menu-photo");
    // ⑦ Transférer → liste des conversations
    if (out.menuPhoto.ouvert) {
      await page.locator("#modalContent .csetting-item", { hasText: "Transférer" }).click();
      await page.waitForTimeout(500);
      out.transfert = await page.evaluate(() => { const mc = document.getElementById("modalContent"); return { titre: (mc.querySelector(".modal-title") || {}).innerText, cibles: [...mc.querySelectorAll(".csetting-item")].map((e) => e.innerText.replace(/\s+/g, " ").trim()) }; });
      await photo("transferer");
      await page.evaluate(() => closeModal());
      await page.waitForTimeout(300);
    }

    // ⑧ Signaler un message reçu
    await jeu.enBas(page);
    const m8 = await appui("m_lea_21");
    if (m8.ouvert) {
      await page.locator("#modalContent .csetting-item", { hasText: "Signaler" }).click();
      await page.waitForTimeout(700);
      out.signalement = await page.evaluate(() => { const mc = document.getElementById("modalContent"); return { texte: mc.innerText.replace(/\s+/g, " ").slice(0, 500), champs: [...mc.querySelectorAll("input,textarea,select")].map((e) => ({ id: e.id, type: e.type, ph: e.placeholder, fs: getComputedStyle(e).fontSize })), boutons: [...mc.querySelectorAll("button")].map((b) => b.innerText.trim()) }; });
      await photo("signaler");
      await page.evaluate(() => closeModal());
      await page.waitForTimeout(500);
    }

    // ⑨ Supprimer pour moi (message reçu) — confirmation ? annulation ?
    const nAvant = await page.evaluate((id) => getConversations().find((x) => x.id === id).messages.length, jeu.IDS.lea);
    const m9 = await appui("m_lea_15");
    if (m9.ouvert) { await page.locator("#modalContent .csetting-item", { hasText: "Supprimer pour moi" }).click(); await page.waitForTimeout(600); }
    out.supprPourMoi = await page.evaluate(([id, n]) => { const c = getConversations().find((x) => x.id === id); const t = document.getElementById("convFpThread"); return { retires: n - c.messages.length, modaleConfirmation: document.getElementById("modalBackdrop").classList.contains("active"), toasts: (window.__toasts || []).map((t) => t.msg).slice(-1), annulable: !!document.querySelector(".toast.clickable"), resteSousLeBas: Math.round(t.scrollHeight - t.scrollTop - t.clientHeight) }; }, [jeu.IDS.lea, nAvant]);
    await photo("suppr-pour-moi");

    // ⑩ Supprimer pour tous (mon message)
    await jeu.filPret(page);
    const m10 = await appui("m_lea_18");
    out.menuMaPhoto = m10;
    if (m10.ouvert) { await page.locator("#modalContent .csetting-item", { hasText: "Supprimer pour tous" }).click(); await page.waitForTimeout(900); }
    out.supprPourTous = { ...(await page.evaluate(() => ({ modaleConfirmation: document.getElementById("modalBackdrop").classList.contains("active"), toasts: (window.__toasts || []).map((t) => t.msg).slice(-1), trace: !!document.querySelector('.conv-bubble-wrap[data-mid="m_lea_18"]') }))), ligneSupprimee: !serveur.t.conv_messages.some((m) => m.id === "m_lea_18"), controle: serveur.t.conv_messages.filter((m) => /"type":"del"/.test(m.content)).map((m) => m.content) };
    await photo("suppr-pour-tous");

    // ⑪ Clic droit (pointeur) : même menu ?
    await jeu.filPret(page); await jeu.enBas(page);
    await page.locator(sel("m_lea_21")).click({ button: "right" });
    await page.waitForTimeout(400);
    out.clicDroit = (await menu()).ouvert;
    await page.evaluate(() => closeModal());
    // ⑫ Accessibilité clavier : une bulle est-elle atteignable ?
    out.bulleFocusable = await page.evaluate(() => { const w = document.querySelector(".conv-bubble-wrap"); return { tabindex: w.getAttribute("tabindex"), role: w.getAttribute("role"), boutonMenu: !!w.querySelector("button") }; });
  } catch (e) { out.ERREUR = String(e && e.message).split("\n").slice(0, 3).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
