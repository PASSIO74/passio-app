// Sonde 06 — longue conversation (230 messages) : pagination par 40, conservation de la
// position, arrivée d'un message pendant la relecture, retour aux derniers messages,
// message reçu fil en bas, « en train d'écrire », saut vers une citation hors page.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
module.exports = async ({ page, serveur, photo, banc, GENS, MOI }) => {
  const out = {};
  try {
    await jeu.routes(page);
    await jeu.entrer(page, GENS.malik.nom);
    const fil = () => page.evaluate(() => { const t = document.getElementById("convFpThread"); const w = [...t.querySelectorAll(".conv-bubble-wrap")]; const f = t.getBoundingClientRect(); const vis = w.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > f.top && r.top < f.bottom; }); const txt = (e) => (e.querySelector(".conv-bubble").innerText || "").slice(0, 7); return { bulles: w.length, premier: txt(w[0]), dernier: txt(w[w.length - 1]), visibles: vis.length, premierVisible: vis[0] ? txt(vis[0]) : null, dernierVisible: vis.length ? txt(vis[vis.length - 1]) : null, scrollTop: Math.round(t.scrollTop), reste: Math.round(t.scrollHeight - t.scrollTop - t.clientHeight), entete: t.firstElementChild && !t.firstElementChild.classList.contains("conv-bubble-wrap") ? t.firstElementChild.innerText.trim().slice(0, 60) : null, auBas: t._auBas }; });
    out.ouverture = await fil();
    out.total = await page.evaluate((id) => getConversations().find((c) => c.id === id).messages.length, jeu.IDS.longue);
    await photo("longue-bas");

    // ① Remonter par gestes de défilement (molette tactile) jusqu'au chargement de la page 2
    const t0 = Date.now();
    await page.evaluate(() => { const t = document.getElementById("convFpThread"); t.scrollTop = 30; t.dispatchEvent(new Event("scroll")); });
    await page.waitForTimeout(400);
    out.page2 = { ...(await fil()), ms: Date.now() - t0 };
    await photo("longue-page2");
    // Combien de remontées pour atteindre le tout premier message ?
    let tours = 1;
    for (; tours < 12; tours++) {
      const f = await fil(); if (f.bulles >= out.total) break;
      await page.evaluate(() => { const t = document.getElementById("convFpThread"); t.scrollTop = 30; t.dispatchEvent(new Event("scroll")); });
      await page.waitForTimeout(250);
    }
    out.toutCharge = { ...(await fil()), remontees: tours };
    await page.evaluate(() => { const t = document.getElementById("convFpThread"); t.scrollTop = 0; });
    await page.waitForTimeout(300);
    await photo("longue-debut");

    // ② Lecture au milieu, puis un message de Malik ARRIVE (canal temps réel coupé dans le banc :
    //    on appelle le MÊME point d'entrée que le canal, `_handleIncomingConvMessage`) — simulé.
    await page.evaluate(() => { const w = document.querySelector('.conv-bubble-wrap[data-mid="m_mal_120"]'); w.scrollIntoView({ block: "center" }); });
    await page.waitForTimeout(400);
    const avant = await fil();
    await page.evaluate(async ([conv, de]) => { await _handleIncomingConvMessage({ id: "m_in_001", conv_id: conv, from_id: de, content: JSON.stringify({ type: "text", text: "Message reçu pendant la relecture" }), created_at: new Date().toISOString() }); }, [jeu.IDS.longue, GENS.malik.id]);
    await page.waitForTimeout(600);
    const apres = await fil();
    out.arriveePendantRelecture = { avant: { premierVisible: avant.premierVisible, reste: avant.reste }, apres: { premierVisible: apres.premierVisible, reste: apres.reste, bulles: apres.bulles }, arrache: apres.premierVisible !== avant.premierVisible, indicateurNouveau: await page.evaluate(() => !!document.querySelector("#convNewMsgPill, .conv-new-msg, [data-nouveaux]")) };
    await photo("arrivee-pendant-relecture");

    // ③ Existe-t-il un bouton « revenir en bas » quand on est remonté ?
    await page.evaluate(() => { const w = document.querySelector('.conv-bubble-wrap[data-mid="m_mal_200"]'); if (w) w.scrollIntoView({ block: "center" }); });
    await page.waitForTimeout(400);
    out.retourEnBas = await page.evaluate(() => { const fp = document.getElementById("conv-fullpage"); const cand = [...fp.querySelectorAll("button, [role=button]")].filter((b) => /bas|dernier|↓|récents/i.test((b.getAttribute("aria-label") || "") + b.textContent)); return { bouton: cand.length > 0, reste: (() => { const t = document.getElementById("convFpThread"); return Math.round(t.scrollHeight - t.scrollTop - t.clientHeight); })() }; });

    // ④ Envoyer un message alors qu'on est remonté : retour en bas ?
    await page.locator("#convFpInput").fill("Envoyé depuis le milieu du fil");
    await page.locator("#convFpSendBtn").click();
    await page.waitForTimeout(800);
    out.envoiDepuisMilieu = await fil();

    // ⑤ Message reçu alors qu'on est en bas : visible sans geste ?
    await jeu.enBas(page);
    await page.evaluate(async ([conv, de]) => { await _handleIncomingConvMessage({ id: "m_in_002", conv_id: conv, from_id: de, content: JSON.stringify({ type: "text", text: "Reçu fil en bas" }), created_at: new Date().toISOString() }); }, [jeu.IDS.longue, GENS.malik.id]);
    await page.waitForTimeout(500);
    out.recuEnBas = await fil();

    // ⑥ « En train d'écrire » : la barre existe, alimentée par un canal coupé dans le banc → forcée (simulé)
    await page.evaluate(() => { const bar = document.getElementById("convTypingBar"); bar.textContent = "Malik Benali est en train d'écrire…"; bar.style.display = "block"; });
    await page.waitForTimeout(200);
    out.ecrit = await page.evaluate(() => { const b = document.getElementById("convTypingBar"); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { h: Math.round(r.height), y: Math.round(r.y), fs: cs.fontSize, couleur: cs.color, live: b.getAttribute("aria-live") }; });
    await photo("en-train-d-ecrire");
    await page.evaluate(() => { document.getElementById("convTypingBar").style.display = "none"; });

    // ⑦ Citation dont l'original n'est pas dans la page affichée
    await page.evaluate(() => closeConversation()); await page.waitForTimeout(400);
    await page.evaluate(async ([conv, de]) => { await _handleIncomingConvMessage({ id: "m_in_003", conv_id: conv, from_id: de, content: JSON.stringify({ type: "text", text: "Tu te souviens ?", rt: { id: "m_mal_010", t: "n° 010 — Tu grimpes ce soir ?", n: "Camille Audit" } }), created_at: new Date().toISOString() }); }, [jeu.IDS.longue, GENS.malik.id]);
    await jeu.entrer(page, GENS.malik.nom);
    await page.locator(".conv-reply-quote").last().tap();
    await page.waitForTimeout(500);
    out.citationHorsPage = { toasts: await page.evaluate(() => (window.__toasts || []).map((t) => t.msg).slice(-1)), ...(await fil()) };
    await photo("citation-hors-page");

    // ⑧ Poids du rendu : durée d'un rendu complet à 230 bulles
    out.perf = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); c._convPage = 6; const fp = document.getElementById("conv-fullpage"); const t0 = performance.now(); renderConvFpThread(c, fp.getAttribute("data-display-name")); const d = performance.now() - t0; return { msRendu230: Math.round(d), noeuds: document.getElementById("convFpThread").querySelectorAll("*").length }; }, jeu.IDS.longue);
  } catch (e) { out.ERREUR = String(e && e.message).split("\n").slice(0, 3).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
