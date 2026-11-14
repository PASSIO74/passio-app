// Sonde 05 — appels. EN PRODUCTION LES APPELS SONT DÉSACTIVÉS (`PASSIO_APPELS_ACTIFS = false`,
// app-05:648) : aucun bouton d'appel n'est rendu. Ici le drapeau d'essai `passio_appels_actifs`
// est armé pour atteindre les écrans ; le WebRTC n'est pas établi (un seul navigateur, pas de
// micro) : les écrans sont rendus par leurs fonctions de rendu — « simulé ».
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
module.exports = async ({ page, photo, GENS, banc }) => {
  const out = {};
  const toasts = async () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  try {
    out.drapeau = await page.evaluate(() => ({ dispo: appelsDisponibles(), constante: typeof PASSIO_APPELS_ACTIFS !== "undefined" ? PASSIO_APPELS_ACTIFS : "?" }));
    await page.evaluate(() => goTo("messages"));
    await jeu.attendreListe(page, 3);
    await page.locator('#messageList .msg-card:has(.msg-name:has-text("Marie-Charlotte"))').tap();
    await page.waitForTimeout(900);
    await photo("entete-avec-appels-nom-long");
    out.entete = await page.evaluate(() => {
      const h = document.getElementById("convFpHead");
      const zone = (b) => { const r = b.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2; let g = 0, d = 0, ht = 0, bas = 0; const sur = (x, y) => { const e = document.elementFromPoint(x, y); return e && (e === b || b.contains(e)); }; while (g < 60 && sur(cx - g - 1, cy)) g++; while (d < 60 && sur(cx + d + 1, cy)) d++; while (ht < 60 && sur(cx, cy - ht - 1)) ht++; while (bas < 60 && sur(cx, cy + bas + 1)) bas++; return { w: g + d + 1, h: ht + bas + 1 }; };
      return {
        actions: [...h.querySelectorAll(".conv-action-btn")].map((b) => ({ title: b.getAttribute("title"), aria: b.getAttribute("aria-label"), boite: Math.round(b.getBoundingClientRect().width) + "×" + Math.round(b.getBoundingClientRect().height), zone: zone(b), x: Math.round(b.getBoundingClientRect().x) })),
        nomLargeur: Math.round(h.querySelector(".conv-fp-name").getBoundingClientRect().width), nomTronque: h.querySelector(".conv-fp-name").scrollWidth > h.querySelector(".conv-fp-name").clientWidth, nom: h.querySelector(".conv-fp-name").textContent,
      };
    });
    // Toucher « Appel audio » : pas de micro dans ce navigateur → message de refus
    await page.locator('#convFpHead .conv-action-btn[title="Appel audio"]').tap();
    await page.waitForTimeout(3500);
    out.appelSansMicro = { toasts: await toasts(), overlay: await page.evaluate(() => { const o = document.getElementById("callOverlay"); return o ? o.classList.contains("active") : false; }) };
    await photo("appel-sans-micro");
    // Écran d'appel ENTRANT (audio) — rendu par sa fonction
    await page.evaluate((lea) => { window._callIncoming = { callId: "audit-1", from: lea.id, kind: "voice", identite: { name: lea.nom, emoji: "🎸", color: "#7c3aed", photo: null } }; _callRenderIncomingUI(window._callIncoming); }, GENS.lea);
    await page.waitForTimeout(500);
    await photo("entrant-audio");
    out.entrant = await page.evaluate(() => {
      const o = document.getElementById("callOverlay");
      return {
        role: o.getAttribute("role"), ariaModal: o.getAttribute("aria-modal"), ariaLive: o.getAttribute("aria-live"),
        texte: o.innerText, boutons: [...o.querySelectorAll("button")].map((b) => ({ texte: b.textContent, title: b.title, aria: b.getAttribute("aria-label"), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), x: Math.round(b.getBoundingClientRect().x), y: Math.round(b.getBoundingClientRect().y) })),
        avatar: (function () { const a = o.querySelector(".call-avatar"); return { fond: a.style.background, contenu: a.textContent, img: !!a.querySelector("img") }; })(),
        statut: (function () { const s = o.querySelector(".call-status"); const cs = getComputedStyle(s); return { couleur: cs.color, fs: cs.fontSize }; })(),
        focusDans: o.contains(document.activeElement), hash: location.hash, zIndex: getComputedStyle(o).zIndex, animation: getComputedStyle(o.querySelector(".call-avatar")).animationName,
      };
    });
    // Entrant vidéo, nom très long
    await page.evaluate((p) => { window._callIncoming = { callId: "audit-2", from: p.id, kind: "video", identite: { name: p.nom, emoji: "🎻", color: "#7c3aed", photo: null } }; _callRenderIncomingUI(window._callIncoming); }, GENS.long);
    await page.waitForTimeout(400);
    await photo("entrant-video-nom-long");
    out.entrantLong = await page.evaluate(() => { const n = document.querySelector("#callOverlay .call-name"); const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), lignes: Math.round(r.height / parseFloat(getComputedStyle(n).lineHeight || 26)), deborde: r.right > innerWidth || r.left < 0 }; });
    // Refuser (vrai toucher)
    await page.locator('#callOverlay .call-control-btn.hangup').tap();
    await page.waitForTimeout(500);
    out.apresRefus = await page.evaluate(() => ({ overlay: document.getElementById("callOverlay").classList.contains("active"), hash: location.hash }));
    // Appel SORTANT audio (« Appel en cours… ») — rendu par sa fonction
    await page.evaluate((lea) => { window._call = { id: "audit-3", peer: { id: lea.id, name: lea.nom, emoji: "🎸", color: "#7c3aed", photo: null }, kind: "voice", role: "caller", status: "calling", localStream: null, remoteStream: null, pc: null, chan: null, startedAt: 0, _facing: "user" }; _callRenderActiveUI(); }, GENS.lea);
    await page.waitForTimeout(400);
    await photo("sortant-audio");
    out.sortant = await page.evaluate(() => { const o = document.getElementById("callOverlay"); return { texte: o.innerText, boutons: [...o.querySelectorAll("button")].map((b) => ({ texte: b.textContent, title: b.title, aria: b.getAttribute("aria-label"), cls: b.className })), minuteur: (function () { const t = o.querySelector("#callTimer"); const cs = getComputedStyle(t); return { texte: t.textContent, couleur: cs.color, fs: cs.fontSize }; })() }; });
    // Connecté : minuteur + statistiques techniques
    await page.evaluate(() => { _callMarkConnected(); window._call.startedAt = Date.now() - 83000; const s = document.getElementById("callStats"); if (s) s.textContent = "audio · 32 kb/s · relais"; });
    await page.waitForTimeout(1300);
    await photo("en-cours-audio");
    out.enCours = await page.evaluate(() => document.getElementById("callOverlay").innerText);
    // Micro coupé (la bascule exige un flux local : on reproduit ce qu'elle écrit)
    await page.evaluate(() => { const b = document.querySelector("#callOverlay .call-control-btn.mute"); b.classList.add("active"); b.textContent = "🔇"; });
    await page.waitForTimeout(200);
    await photo("en-cours-audio-muet");
    out.muet = await page.evaluate(() => { const b = document.querySelector("#callOverlay .call-control-btn.mute"); const cs = getComputedStyle(b); return { fond: cs.backgroundColor, texte: b.textContent, ariaPressed: b.getAttribute("aria-pressed"), title: b.title }; });
    // Raccrocher (vrai toucher)
    await page.locator('#callOverlay .call-control-btn.hangup').tap();
    await page.waitForTimeout(500);
    out.apresRaccrocher = await page.evaluate(() => ({ overlay: document.getElementById("callOverlay").classList.contains("active"), toasts: (window.__toasts || []).map((t) => t.msg).slice(-2), conv: document.getElementById("conv-fullpage").classList.contains("active"), traceDansFil: [...document.querySelectorAll("#convFpThread *")].some((e) => /appel/i.test(e.textContent || "")) }));
    // Appel vidéo en cours — rendu par sa fonction (aucun flux : vidéos noires)
    await page.evaluate((lea) => { window._call = { id: "audit-4", peer: { id: lea.id, name: lea.nom, emoji: "🎸", color: "#7c3aed", photo: null }, kind: "video", role: "callee", status: "connecting", localStream: null, remoteStream: null, pc: null, chan: null, startedAt: 0, _facing: "user" }; _callRenderActiveUI(); _callMarkConnected(); const s = document.getElementById("callStats"); if (s) s.textContent = "1280×720 · 30 fps · 1.4 Mb/s"; }, GENS.lea);
    await page.waitForTimeout(1300);
    await photo("en-cours-video");
    out.video = await page.evaluate(() => { const o = document.getElementById("callOverlay"); return { texte: o.innerText, boutons: [...o.querySelectorAll("button")].map((b) => ({ texte: b.textContent, title: b.title, aria: b.getAttribute("aria-label"), w: Math.round(b.getBoundingClientRect().width), y: Math.round(b.getBoundingClientRect().y), bas: Math.round(b.getBoundingClientRect().bottom) })), vh: innerHeight, locale: (function () { const v = document.getElementById("callLocalVideo"); const r = v.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() }; });
    // Retour arrière du système pendant un appel en cours
    await page.evaluate(() => history.back());
    await page.waitForTimeout(600);
    out.retourPendantAppel = await page.evaluate(() => ({ overlay: document.getElementById("callOverlay").classList.contains("active"), appel: !!window._call, hash: location.hash, conv: document.getElementById("conv-fullpage").classList.contains("active") }));
    await page.evaluate(() => { try { _callTeardown(); } catch (e) {} });
    out.toasts = await toasts();
  } catch (e) { out.erreur = String((e && e.stack) || e).split(/\n/).slice(0, 5).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", stockage: { passio_appels_actifs: "1" }, peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerQuelques(srv, ctx); } };
