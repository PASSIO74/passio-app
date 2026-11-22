// Sonde 05 — enregistrement vocal. Le banc n'a pas de micro : `getUserMedia` est
// REMPLACÉ dans la page par un flux audio de synthèse (oscillateur Web Audio →
// MediaStream), que le VRAI MediaRecorder enregistre. État « simulé » (faux flux).
// Cas : maintien / relâchement, appui court, glissement hors du bouton, ✕, permission
// refusée, autorisation qui tarde (invite du navigateur), lecture, vitesse.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
const FAUX_MICRO = ([mode, delai]) => {
  // Le Chromium de Playwright annonce audio/mp4 mais n'encode pas l'AAC (0 octet, sonde 05b) :
  // le conteneur est forcé en webm/opus pour que l'enregistrement produise des données.
  window._passioBestAudioMime = function () { return "audio/webm;codecs=opus"; };
  const reel = navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) : null;
  window.__microAppels = 0;
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
  navigator.mediaDevices.getUserMedia = function () {
    window.__microAppels++;
    if (mode === "refus") return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    const faire = () => { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const dst = ctx.createMediaStreamDestination(); osc.connect(dst); osc.start(); return dst.stream; };
    return new Promise((res) => setTimeout(() => res(faire()), delai || 0));
  };
  window.__microReel = !!reel;
};
module.exports = async ({ page, context, serveur, photo, banc, GENS }) => {
  const out = {};
  try {
    await jeu.routes(page);
    await jeu.entrer(page, GENS.ines.nom);
    const etat = () => page.evaluate((id) => { const bar = document.getElementById("voiceRecordBar"); const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; return { enregistre: window._isRecording, barre: bar.classList.contains("active"), minuteur: document.getElementById("voiceRecordTimer").textContent, btnClasse: document.getElementById("btnVoice").className, nbMessages: c.messages.length, dernier: { vocal: !!m.voiceData && !m.isFile, duree: m.voiceDuration, statut: m.status || null }, toasts: (window.__toasts || []).map((t) => t.msg).slice(-1) }; }, jeu.IDS.ines);
    out.bouton = await page.evaluate(() => { const b = document.getElementById("btnVoice"); return { title: b.title, aria: b.getAttribute("aria-label"), supporte: !!(navigator.mediaDevices && window.MediaRecorder), mime: (typeof _passioBestAudioMime === "function") ? _passioBestAudioMime() : null }; });

    // ① Maintien 2,2 s puis relâchement → envoi
    await page.evaluate(FAUX_MICRO, ["ok", 0]);
    const n0 = (await etat()).nbMessages;
    let main = await banc.appuiMaintenu(page, "#btnVoice");
    await page.waitForTimeout(1300);
    out.pendant = await etat();
    out.barre = await page.evaluate(() => { const bar = document.getElementById("voiceRecordBar"); const b = bar.getBoundingClientRect(); const x = bar.querySelector("button"); const xb = x.getBoundingClientRect(); const tb = document.querySelector("#conv-fullpage .conv-toolbar").getBoundingClientRect(); return { boite: { y: Math.round(b.y), h: Math.round(b.height) }, texte: bar.innerText.replace(/\s+/g, " "), annuler: { w: Math.round(xb.width), h: Math.round(xb.height), nom: x.getAttribute("aria-label"), texte: x.textContent }, barreSaisieToujoursLa: tb.height > 0, role: bar.getAttribute("role"), live: bar.getAttribute("aria-live") }; });
    await photo("enregistrement");
    await page.waitForTimeout(900);
    await main.relacher();
    await page.waitForTimeout(1500);
    out.apresRelachement = { ...(await etat()), ajoutes: (await etat()).nbMessages - n0 };
    await jeu.enBas(page);
    await photo("vocal-envoye");

    // ② Appui court (tap) : que voit-on ?
    const n1 = (await etat()).nbMessages;
    await page.locator("#btnVoice").tap();
    await page.waitForTimeout(900);
    out.appuiCourt = { ...(await etat()), ajoutes: (await etat()).nbMessages - n1 };

    // ③ Glisser le doigt hors du bouton puis relâcher (geste « annuler » des messageries)
    const n2 = (await etat()).nbMessages;
    main = await banc.appuiMaintenu(page, "#btnVoice");
    await page.waitForTimeout(1200);
    await main.glisser(-180, -40);
    await page.waitForTimeout(300);
    out.glissePendant = await etat();
    await main.relacher();
    await page.waitForTimeout(1500);
    out.glisseRelache = { ...(await etat()), ajoutes: (await etat()).nbMessages - n2 };

    // ④ Annuler par ✕ : possible seulement avec un SECOND doigt (le premier tient le bouton)
    const n3 = (await etat()).nbMessages;
    main = await banc.appuiMaintenu(page, "#btnVoice");
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.querySelector("#voiceRecordBar button").click());   // second « doigt » (simulé par un clic)
    await page.waitForTimeout(300);
    out.annulePendant = await etat();
    await main.relacher();
    await page.waitForTimeout(1200);
    out.annule = { ...(await etat()), ajoutes: (await etat()).nbMessages - n3 };

    // ⑤ Autorisation qui tarde (invite du navigateur) : doigt levé AVANT la réponse
    await page.evaluate(FAUX_MICRO, ["ok", 1800]);
    const n4 = (await etat()).nbMessages;
    main = await banc.appuiMaintenu(page, "#btnVoice");
    await page.waitForTimeout(500);
    await main.relacher();                     // la personne lève le doigt pour toucher « Autoriser »
    await page.waitForTimeout(2200);           // l'autorisation arrive après
    out.autorisationTardive = await etat();
    await photo("enregistrement-mains-libres");
    await page.waitForTimeout(2500);
    out.autorisationTardivePlusTard = await etat();
    // un toucher sur le micro : envoie ?
    await page.locator("#btnVoice").tap();
    await page.waitForTimeout(1500);
    out.autorisationTardiveApresTap = { ...(await etat()), ajoutes: (await etat()).nbMessages - n4 };

    // ⑥ Permission refusée
    await page.evaluate(FAUX_MICRO, ["refus", 0]);
    main = await banc.appuiMaintenu(page, "#btnVoice");
    await page.waitForTimeout(700);
    await main.relacher();
    await page.waitForTimeout(500);
    out.refus = await etat();
    await photo("micro-refuse");

    // ⑦ Lecture d'un vocal reçu + vitesse (conversation Léa)
    await page.evaluate(() => closeConversation());
    await page.waitForTimeout(500);
    await jeu.entrer(page, GENS.lea.nom, { bas: false });
    await page.locator('.conv-bubble-wrap[data-mid="m_lea_10"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    out.lecteur = await page.evaluate(() => { const w = document.querySelector('.conv-bubble-wrap[data-mid="m_lea_10"]'); const bs = [...w.querySelectorAll("button")].map((b) => { const r = b.getBoundingClientRect(); return { texte: b.textContent, nom: b.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height) }; }); const barre = w.querySelector("[id^='wf_']").parentElement.getBoundingClientRect(); return { boutons: bs, barre: { w: Math.round(barre.width), h: Math.round(barre.height) }, duree: w.querySelector("[id^='dur_']").textContent }; });
    await page.locator('.conv-bubble-wrap[data-mid="m_lea_10"] button').first().tap();
    await page.waitForTimeout(1200);
    out.lecture = await page.evaluate(() => { const w = document.querySelector('.conv-bubble-wrap[data-mid="m_lea_10"]'); const a = window["_aud_" + w.querySelector("button").id.replace("pb_", "")]; return { bouton: w.querySelector("button").textContent, progression: w.querySelector("[id^='wf_']").style.width, duree: w.querySelector("[id^='dur_']").textContent, enLecture: a ? !a.paused : null, erreur: a && a.error ? a.error.code : null, toasts: (window.__toasts || []).map((t) => t.msg).slice(-1) }; });
    await photo("lecture");
    await page.locator('.conv-bubble-wrap[data-mid="m_lea_10"] .voice-speed-btn').tap();
    await page.waitForTimeout(200);
    out.vitesse = await page.evaluate(() => ({ libelles: [...document.querySelectorAll(".voice-speed-btn")].map((b) => b.textContent), global: window._voiceSpeed }));
    // Lancer un second vocal pendant que le premier joue : deux sons superposés ?
    await page.locator('.conv-bubble-wrap[data-mid="m_lea_11"] button').first().tap().catch(() => {});
    await page.waitForTimeout(600);
    out.deuxLectures = await page.evaluate(() => Object.keys(window).filter((k) => k.indexOf("_aud_") === 0 && window[k] && typeof window[k].paused === "boolean").map((k) => ({ k: k.slice(0, 18), joue: !window[k].paused })));
    // Quitter la conversation pendant la lecture : le son continue ?
    await page.evaluate(() => closeConversation());
    await page.waitForTimeout(500);
    out.apresFermeture = await page.evaluate(() => Object.keys(window).filter((k) => k.indexOf("_aud_") === 0 && window[k] && typeof window[k].paused === "boolean").map((k) => ({ joue: !window[k].paused })));
  } catch (e) { out.ERREUR = String(e && e.message).split("\n").slice(0, 3).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
