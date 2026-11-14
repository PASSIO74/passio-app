// ═══════════════════════════════════════════════════════════════════════════
// MESSAGERIE — LA CONVERSATION : scénarios de capture (avant / après / gros plans)
//
// Compte fictif « Camille Audit » sur le faux serveur ; données : outils/jeu/msg-conversation.js.
// Chaque scénario entre dans la conversation par un VRAI toucher sur sa carte.
// Les APRÈS sont des maquettes appliquées par le banc (feuille de style et/ou retouche
// du DOM) : rien n'est modifié dans l'application.
//
// États « simulés » (dits dans chaque fiche) : micro (flux de synthèse), clavier
// (fenêtre réduite), messages entrants (point d'entrée du canal temps réel), GIF
// (images locales), pannes (faux serveur), verdict IRL (RPC répondue par une route).
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const path = require("path");
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
const MEDIAS = path.join(__dirname, "..", "medias");
const IDS = jeu.IDS;

const compte = (extra) => Object.assign({ mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } }, extra || {});
const attendre = (page, ms) => page.waitForTimeout(ms);
// Amène une bulle à `haut` px sous le haut du fil.
const caler = async (page, id, haut) => {
  await page.evaluate(([i, h]) => { const t = document.getElementById("convFpThread"); const w = t.querySelector('.conv-bubble-wrap[data-mid="' + i + '"]'); if (w) t.scrollTop += w.getBoundingClientRect().top - t.getBoundingClientRect().top - h; }, [id, haut == null ? 60 : haut]);
  await attendre(page, 350);
};
const fermerModale = async (page) => { await page.evaluate(() => { try { closeModal(); } catch (e) {} }); await attendre(page, 450); };
const klipyLocal = async (page) => {
  const img = (n) => new URL(page.url()).origin + "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
  await page.route(/api\.klipy\.com/, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ results: ["photo-carre.jpg", "photo-paysage.jpg", "photo-portrait.jpg", "photo-atelier.jpg", "couverture.jpg", "photo-haute.jpg", "photo-panorama.jpg", "couverture-evenement.jpg"].map((n) => ({ media_formats: { tinygif: { url: img(n) } } })) }) }));
};
// Micro de synthèse (voir sonde 05) : flux Web Audio enregistré par le vrai MediaRecorder.
const fauxMicro = (page, mode, delai) => page.evaluate(([m, d]) => {
  window._passioBestAudioMime = function () { return "audio/webm;codecs=opus"; };   // le Chromium du banc n'encode pas l'AAC
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
  navigator.mediaDevices.getUserMedia = function () {
    if (m === "refus") return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    const faire = () => { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const dst = ctx.createMediaStreamDestination(); osc.connect(dst); osc.start(); return dst.stream; };
    return new Promise((res) => setTimeout(() => res(faire()), d || 0));
  };
}, [mode, delai || 0]);
const entrant = (page, conv, de, id, contenu) => page.evaluate(async ([c, d, i, k]) => { await _handleIncomingConvMessage({ id: i, conv_id: c, from_id: d, content: JSON.stringify(k), created_at: new Date().toISOString() }); }, [conv, de, id, contenu]);

// ───────────────────────────── MAQUETTES (APRÈS) ─────────────────────────────
const SVG = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
const ICO = {
  repondre: SVG('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>'),
  copier: SVG('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
  transferer: SVG('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0-6 6v3"/>'),
  signaler: SVG('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  supprimer: SVG('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>'),
  bas: SVG('<path d="M6 9l6 6 6-6"/>'),
  croix: SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
  doc: SVG('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  note: SVG('<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.6" cy="17.5" r="2.6"/><circle cx="16.6" cy="15.5" r="2.6"/>'),
  lieu: SVG('<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>'),
};

const CSS = {
  // MSG-C50 / C83 / C75 — vocal, document, position : une vraie bulle ; cibles du lecteur ; nom de fichier lisible
  bulles: `
    #convFpThread .conv-bubble.me:has(button[id^="pb_"]), #convFpThread .conv-bubble.me:has(> a[target="_blank"] > div), #convFpThread .conv-bubble.me:has(> div[onclick^="_docDownload"]), #convFpThread .conv-bubble.me:has(> .maq-carte)
      { background: var(--grad-hero) !important; padding: 8px 12px !important; box-shadow: 0 1px 3px rgba(124,58,237,.20) !important; color:#fff; }
    #convFpThread .conv-bubble.them:has(button[id^="pb_"]), #convFpThread .conv-bubble.them:has(> a[target="_blank"] > div)
      { background: var(--bg-card) !important; padding: 8px 12px !important; border:1px solid var(--border); box-shadow: 0 1px 2px rgba(24,18,48,.06) !important; }
    #convFpThread .conv-bubble > div:has(> button[id^="pb_"]) { max-width: 268px !important; min-width: 232px !important; gap: 8px !important; }
    #convFpThread .conv-bubble button[id^="pb_"] { width:44px !important; height:44px !important; font-size:17px !important; }
    #convFpThread .conv-bubble .voice-speed-btn { min-width:44px; min-height:36px; font-size:12px !important; border-radius:12px !important; padding: 0 8px !important; }
    #convFpThread .conv-bubble a[target="_blank"] > div > div:last-child > div:first-child, #convFpThread .conv-bubble > div[onclick^="_docDownload"] > div:last-child > div:first-child
      { max-width: 210px !important; white-space: normal !important; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.25; }
    #convFpThread .conv-bubble a[target="_blank"] > div > div:last-child > div:last-child, #convFpThread .conv-bubble > div[onclick^="_docDownload"] > div:last-child > div:last-child { font-size:12px !important; opacity:.86 !important; }
    .maq-carte { display:flex; align-items:center; gap:10px; }
    .maq-carte .maq-ico { width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.24); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .maq-carte .maq-ico svg { width:20px; height:20px; }
    .maq-carte b { display:block; font-size:13px; font-weight:700; max-width:210px; line-height:1.25; }
    .maq-carte small { display:block; font-size:12px; opacity:.85; }`,
  // MSG-C68 / C75 — en-tête
  entete: `
    #convFpHead { gap: 8px; padding: 8px 10px; }
    #convFpHead .conv-fp-back, #convFpHead .conv-action-btn { width:44px; height:44px; border-radius:12px; }
    #convFpHead .conv-fp-passion { color: var(--muted); font-size:12px; margin-top:2px; }
    #convFpHead .conv-fp-passion.maq-lien-activite { color: var(--v2-coral, #ff6b57); font-weight:700; }`,
  // MSG-C69 — la proposition IRL porte le corail
  irl: `
    #convFpHead .conv-action-btn.irl-proposal-action { color: #c2412f; background: color-mix(in srgb, var(--v2-coral, #ff6b57) 14%, #fff); }
    #v6cProposerIrl .attach-icon { color: #c2412f !important; background: color-mix(in srgb, var(--v2-coral, #ff6b57) 14%, #fff) !important; }`,
  // MSG-C60 — barre de saisie à trois zones
  barre: `
    #conv-fullpage .conv-toolbar { gap:8px; }
    #conv-fullpage .conv-toolbar > .conv-tool-btn { width:44px; height:44px; }
    #conv-fullpage .conv-toolbar > button[aria-label="Ajouter un GIF"] { display:none; }
    #conv-fullpage .conv-input-wrap { position:relative; }
    #conv-fullpage .conv-input-wrap textarea { min-height:44px; padding:10px 46px 10px 16px; }
    #conv-fullpage .conv-input-wrap > #btnEmoji { position:absolute; right:4px; bottom:4px; width:36px; height:36px; }
    #conv-fullpage #convFpSendBtn { width:44px; height:44px; }
    #conv-fullpage .conv-toolbar.maq-vide #convFpSendBtn { display:none; }
    #conv-fullpage .conv-toolbar.maq-plein #btnVoice { display:none; }
    #conv-fullpage .conv-toolbar.maq-vide #btnVoice { background: var(--accent-wash); color: var(--accent); }`,
  // MSG-C62 — un état d'envoi en toutes lettres
  etats: `
    .maq-etat { font-size:12px; color:var(--muted); font-weight:600; }
    .maq-echec { display:inline-flex; align-items:center; gap:6px; min-height:44px; padding:0 14px; margin-left:4px; border-radius:999px; border:1px solid color-mix(in srgb, var(--danger, #dc2626) 35%, transparent); background: color-mix(in srgb, var(--danger, #dc2626) 7%, #fff); color: var(--danger, #dc2626); font:inherit; font-size:13px; font-weight:700; }
    .maq-hl { margin:0; padding:7px 14px; font-size:12px; font-weight:600; color:var(--text); background:var(--accent-tile, #f3eeff); border-bottom:1px solid var(--accent-tile-line, #d2c2fb); flex-shrink:0; }
    #offlineBanner.maq-cache { display:none !important; }`,
  // MSG-C77 — heure en fin de groupe
  groupes: `
    #convFpThread .conv-bubble-wrap.maq-suite { margin-bottom:3px; }
    #convFpThread .conv-bubble-wrap.maq-suite > .conv-bubble-time { display:none; }`,
  liens: `.maq-lien { color:inherit; text-decoration:underline; text-underline-offset:3px; font-weight:600; }`,
  // MSG-C55 — retour aux derniers messages
  bas: `
    .maq-bas { position:absolute; right:14px; width:44px; height:44px; border-radius:50%; border:1px solid var(--border); background:var(--bg-card); color:var(--accent); box-shadow:0 4px 14px rgba(24,18,48,.16); display:flex; align-items:center; justify-content:center; z-index:5; }
    .maq-bas svg { width:22px; height:22px; }
    .maq-bas-n { position:absolute; top:-6px; right:-4px; min-width:20px; height:20px; border-radius:10px; background:var(--accent); color:#fff; font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center; padding:0 5px; }
    .maq-nouveau { position:absolute; left:50%; transform:translateX(-50%); min-height:44px; padding:0 16px; border-radius:999px; border:none; background:var(--accent); color:#fff; font:inherit; font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px; box-shadow:0 6px 18px rgba(109,50,244,.30); z-index:5; white-space:nowrap; }
    .maq-nouveau svg { width:18px; height:18px; }`,
  // MSG-C54 — barre d'enregistrement
  vocal: `
    .maq-rec { flex:1; min-width:0; display:flex; align-items:center; gap:10px; min-height:44px; }
    .maq-rec-x { min-height:44px; padding:0 12px; border-radius:12px; border:1px solid var(--border); background:var(--bg-card); color:var(--text); font:inherit; font-weight:700; font-size:13px; flex-shrink:0; }
    .maq-rec-pt { width:10px; height:10px; border-radius:50%; background:#ef4444; flex-shrink:0; }
    .maq-rec-t { font-weight:800; color:#ef4444; font-size:15px; min-width:34px; flex-shrink:0; }
    .maq-rec-c { flex:1; min-width:0; font-size:12px; line-height:1.3; color:var(--muted); }
    .maq-rec-c b { display:block; color:var(--text); font-weight:700; }
    #conv-fullpage #btnVoice.record-active { width:44px; height:44px; }`,
  // MSG-C58 / C64 / C75 / C82 — feuille d'actions
  feuille: `
    .maq-apercu { margin: 2px 2px 12px; padding:10px 12px; border-radius:12px; background:var(--bg-soft); border-left:3px solid var(--accent); display:flex; flex-direction:column; gap:2px; }
    .maq-apercu-n { font-size:11px; font-weight:800; color:var(--accent); }
    .maq-apercu-t { font-size:13px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .maq-react { width:44px; height:44px; display:inline-flex !important; align-items:center; justify-content:center; border-radius:50%; background:var(--bg-soft); }
    #modalContent .csetting-icon svg { width:22px; height:22px; color: var(--muted); display:inline-block; vertical-align:middle; }
    #modalContent .csetting-item.maq-sep { margin-top:10px; border-top:8px solid var(--bg-soft); }
    #modalContent .csetting-item.maq-sep .csetting-icon svg { color:#dc2626; }
    .maq-choix { display:block; width:100%; text-align:left; min-height:56px; margin:8px 0 0; padding:10px 14px; border-radius:14px; border:1px solid var(--border); background:var(--bg-card); color:var(--text); font:inherit; font-size:15px; font-weight:700; }
    .maq-choix small { display:block; font-size:12px; font-weight:500; color:var(--muted); margin-top:2px; }
    .maq-choix.maq-danger { color:#dc2626; border-color: color-mix(in srgb, #dc2626 30%, transparent); }`,
  // MSG-C72 / C56 — aperçu avant envoi
  apercu: `
    .maq-pj { display:flex; align-items:center; gap:12px; margin:0 10px 6px; padding:8px; border-radius:16px; background:var(--bg-card); border:1px solid var(--border); flex-shrink:0; }
    .maq-pj img { width:64px; height:64px; border-radius:12px; object-fit:cover; flex-shrink:0; }
    .maq-pj-t { flex:1; min-width:0; display:flex; flex-direction:column; font-size:13px; color:var(--text); }
    .maq-pj-t span { font-size:12px; color:var(--muted); }
    .maq-pj button { width:44px; height:44px; border:none; background:transparent; color:var(--muted); display:flex; align-items:center; justify-content:center; }
    .maq-pj button svg { width:20px; height:20px; }`,
  // MSG-C70 — panneau emoji
  emoji: `
    #emojiGrid { grid-template-columns: repeat(8, 1fr) !important; gap:0 !important; padding:6px 8px !important; }
    #emojiGrid > div { font-size:26px !important; min-height:44px; padding:0 !important; display:flex; align-items:center; justify-content:center; line-height:1 !important; }
    #emojiCategoriesBar { display:none !important; }
    #emojiTopBar button { min-height:44px; font-size:14px !important; border-radius:12px !important; }
    #emojiTopBar button:first-child { background: var(--accent) !important; }`,
  // MSG-C73 / C75 — visionneuse
  visionneuse: `#fullImgViewer button { width:44px !important; height:44px !important; }`,
  // MSG-C79 — fond sombre
  sombre: `#convFpThread .conv-bubble-time, #convFpThread > div:not(.conv-bubble-wrap) span { color: rgba(255,255,255,.78) !important; }
    #convFpThread > div:not(.conv-bubble-wrap) > div { background: rgba(255,255,255,.22) !important; }`,
  // MSG-C89 — les toasts passent AU-DESSUS du panneau de conversation (et restent affichés pour la capture)
  toasts: `.toast-stack { z-index: 100000 !important; top: 76px !important; bottom: auto !important; } .toast-stack .toast { animation: none !important; opacity: 1 !important; max-width: 92%; text-align:center; border-radius:18px; }`,
  // MSG-C78 / C87 — bandeau à la place de la barre de saisie
  bandeau: `
    .maq-bandeau { flex:1; display:flex; align-items:center; gap:12px; min-height:44px; font-size:13px; color:var(--text); }
    .maq-bandeau span { flex:1; }
    .maq-bandeau button { min-height:44px; padding:0 16px; border-radius:999px; border:1px solid var(--accent); background:transparent; color:var(--accent); font:inherit; font-weight:700; font-size:13px; flex-shrink:0; }`,
};

const JS = {
  // Sous-titre de l'en-tête = passions de l'interlocuteur (formule de la liste), noms accessibles.
  entete: (page, o) => page.evaluate((o) => {
    const h = document.getElementById("convFpHead"); if (!h) return;
    const c = getConversations().find((x) => x.id === window._openedConvId) || {};
    const s = h.querySelector(".conv-fp-passion");
    let sous = o && o.sous;
    if (!sous && !c.isGroup) { try { sous = identitePassionsTexte(userById(c.userId)) || ""; } catch (e) { sous = ""; } }
    if (!sous && c.isGroup) sous = (c.userIds || []).length + " membres";
    if (s && sous) s.textContent = sous;
    if (s && o && o.activite) s.classList.add("maq-lien-activite");
    h.querySelectorAll(".conv-action-btn").forEach((b) => { if (!b.getAttribute("aria-label")) b.setAttribute("aria-label", b.title === "Paramètres" ? "Paramètres de la conversation" : b.title === "Membres" ? "Membres du groupe" : b.title); });
  }, o || {}),
  // Barre : emoji dans le champ, micro si vide / envoi si rempli, destinataire nommé.
  barre: (page, o) => page.evaluate((o) => {
    const fp = document.getElementById("conv-fullpage"); const tb = fp.querySelector(".conv-toolbar"); const w = tb.querySelector(".conv-input-wrap"); const inp = document.getElementById("convFpInput");
    const em = document.getElementById("btnEmoji"); if (em && em.parentNode !== w) w.appendChild(em);
    const c = getConversations().find((x) => x.id === window._openedConvId) || {};
    const prenom = c.isGroup ? "au groupe" : "à " + String(c.userName || "").split(" ")[0];
    inp.placeholder = "Écrire " + prenom + "…"; inp.setAttribute("aria-label", "Message " + (c.isGroup ? "au groupe " + (c.groupName || "") : "à " + (c.userName || ""))); inp.setAttribute("enterkeyhint", "enter");
    const plein = (o && o.plein != null) ? o.plein : !!inp.value.trim();
    tb.classList.remove("maq-vide", "maq-plein"); tb.classList.add(plein ? "maq-plein" : "maq-vide");
    // Hauteur : jusqu'à 7 lignes visibles (au lieu de 5), début du message en vue.
    inp.style.maxHeight = "178px"; inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, 178) + "px"; inp.scrollTop = 0;
  }, o || {}),
  // États d'envoi : « Envoi… », « En attente du réseau », « Non envoyé · Réessayer », « Non distribué ».
  etats: (page, o) => page.evaluate((o) => {
    document.querySelectorAll("#convFpThread [data-msgst]").forEach((h) => {
      const ligne = h.parentNode; const txt = h.textContent || "";
      const sansCoche = () => [...ligne.querySelectorAll("span")].forEach((s) => { if (s !== h && /^\s*✓+\s*$/.test(s.textContent)) s.remove(); });
      if (/réessayer/.test(txt)) { sansCoche(); h.innerHTML = o.definitif ? '<span class="maq-etat">Non distribué</span>' : (o.horsLigne ? '<span class="maq-etat">En attente du réseau</span>' : '<button class="maq-echec" aria-label="Réessayer l\'envoi">Non envoyé · Réessayer</button>'); }
      else if (/🕓/.test(txt)) { sansCoche(); h.innerHTML = '<span class="maq-etat">Envoi…</span>'; }
    });
    (o.forcerEchec || []).forEach((mid) => { const w = document.querySelector('#convFpThread .conv-bubble-wrap[data-mid="' + CSS.escape(mid) + '"]'); if (!w) return; const l = w.querySelector(".conv-bubble-time"); if (!l) return; [...l.querySelectorAll("span")].forEach((s) => { if (/^\s*✓+\s*$/.test(s.textContent)) s.remove(); }); const b = document.createElement("span"); b.innerHTML = '<button class="maq-echec" aria-label="Réessayer l\'envoi">Non envoyé · Réessayer</button>'; l.appendChild(b); });
    if (o.horsLigne) { const ban = document.getElementById("offlineBanner"); if (ban) ban.classList.add("maq-cache"); const head = document.getElementById("convFpHead"); if (head && !document.querySelector(".maq-hl")) { const l = document.createElement("p"); l.className = "maq-hl"; l.setAttribute("role", "status"); l.textContent = "Hors ligne — tes messages partiront au retour du réseau."; head.after(l); } }
    const t = document.getElementById("convFpThread"); t.scrollTop = t.scrollHeight;
  }, o || {}),
  // Séparateurs calculés par jour calendaire.
  separateurs: (page) => page.evaluate(() => {
    const c = getConversations().find((x) => x.id === window._openedConvId); const at = {}; (c.messages || []).forEach((m) => { at[m.id] = m.at; });
    const t = document.getElementById("convFpThread");
    [...t.children].forEach((el) => {
      if (el.classList.contains("conv-bubble-wrap")) return; const span = el.querySelector("span"); if (!span) return;
      let n = el.nextElementSibling; while (n && !n.classList.contains("conv-bubble-wrap")) n = n.nextElementSibling; if (!n) return;
      const d = new Date(at[n.getAttribute("data-mid")]); const j0 = new Date(); j0.setHours(0, 0, 0, 0); const jd = new Date(d); jd.setHours(0, 0, 0, 0);
      const diff = Math.round((j0 - jd) / 86400000);
      const txt = diff === 0 ? "Aujourd'hui" : diff === 1 ? "Hier" : d.toLocaleDateString("fr-FR", diff < 7 ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "long" });
      span.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
    });
  }),
  // Heure seulement sous le dernier message d'une suite (même expéditeur, moins de 10 min d'écart).
  groupes: (page) => page.evaluate(() => {
    const c = getConversations().find((x) => x.id === window._openedConvId); const at = {}; (c.messages || []).forEach((m) => { at[m.id] = m.at; });
    const t = document.getElementById("convFpThread"); const bas = t.scrollHeight - t.scrollTop - t.clientHeight < 4;
    [...t.querySelectorAll(".conv-bubble-wrap")].forEach((el) => {
      const nx = el.nextElementSibling; if (!nx || !nx.classList.contains("conv-bubble-wrap")) return;
      if (nx.getAttribute("data-me") !== el.getAttribute("data-me") || nx.querySelector(".conv-sender-name")) return;
      if (el.querySelector("[data-msgst] .maq-echec, [data-msgst] span[onclick]")) return;
      const a = at[el.getAttribute("data-mid")], b = at[nx.getAttribute("data-mid")]; if (!a || !b || b - a > 10 * 60000) return;
      el.classList.add("maq-suite");
    });
    if (bas) t.scrollTop = t.scrollHeight;
  }),
  liens: (page) => page.evaluate(() => {
    document.querySelectorAll("#convFpThread .conv-bubble").forEach((b) => {
      [...b.childNodes].forEach((n) => {
        if (n.nodeType !== 3) return; const m = /https?:\/\/[^\s]+/.exec(n.nodeValue); if (!m) return;
        const a = document.createElement("a"); a.href = m[0]; a.target = "_blank"; a.rel = "noopener"; a.textContent = m[0]; a.className = "maq-lien";
        const apres = n.splitText(m.index); apres.nodeValue = apres.nodeValue.slice(m[0].length); b.insertBefore(a, apres);
      });
    });
  }),
  enBas: (page) => page.evaluate(() => { const t = document.getElementById("convFpThread"); t.querySelectorAll("img").forEach((i) => { if (!i.getAttribute("alt")) i.setAttribute("alt", "Photo"); }); t.scrollTop = t.scrollHeight; }),
  // Bouton « revenir en bas » (n = nombre de nouveaux messages) ou pastille « 1 nouveau message ».
  bas: (page, o) => page.evaluate(([o, ico]) => {
    const fp = document.getElementById("conv-fullpage"); const tb = fp.querySelector(".conv-toolbar"); const dessus = (fp.getBoundingClientRect().bottom - tb.getBoundingClientRect().top + 12) + "px";
    if (o.pastille) { const p = document.createElement("button"); p.className = "maq-nouveau"; p.innerHTML = "<span>1 nouveau message</span>" + ico; p.style.bottom = dessus; fp.appendChild(p); return; }
    const b = document.createElement("button"); b.className = "maq-bas"; b.setAttribute("aria-label", "Revenir aux derniers messages"); b.innerHTML = (o.n ? '<span class="maq-bas-n">' + o.n + "</span>" : "") + ico; b.style.bottom = dessus; fp.appendChild(b);
  }, [o || {}, ICO.bas]),
  // Barre d'enregistrement à la place de la barre de saisie.
  vocal: (page, o) => page.evaluate((o) => {
    const fp = document.getElementById("conv-fullpage"); const tb = fp.querySelector(".conv-toolbar");
    const bar = document.getElementById("voiceRecordBar"); const t = (document.getElementById("voiceRecordTimer") || {}).textContent || "0:02"; bar.style.display = "none";
    [...tb.children].forEach((c) => { if (c.id !== "btnVoice" && c.id !== "convAttachMenu") c.style.display = "none"; });
    const z = document.createElement("div"); z.className = "maq-rec";
    z.innerHTML = '<button class="maq-rec-x" aria-label="Annuler l\'enregistrement">Annuler</button><span class="maq-rec-pt"></span><span class="maq-rec-t"></span><span class="maq-rec-c"><b>Relâche pour envoyer</b>‹ glisse à gauche pour annuler</span>';
    z.querySelector(".maq-rec-t").textContent = t === "0:00" ? "0:02" : t;
    tb.insertBefore(z, tb.firstChild);
    const mic = document.getElementById("btnVoice"); mic.style.display = "flex"; mic.classList.add("record-active");
    const fil = document.getElementById("convFpThread"); fil.scrollTop = fil.scrollHeight;
  }, o || {}),
  // Feuille d'actions : rappel du message, réactions de 44 px, pictogrammes, une seule suppression séparée.
  feuille: (page, o) => page.evaluate(([o, ico]) => {
    const mc = document.getElementById("modalContent"); const handle = mc.querySelector(".modal-handle"); if (!handle) return;
    const ap = document.createElement("div"); ap.className = "maq-apercu"; ap.style.marginRight = "54px"; ap.innerHTML = '<span class="maq-apercu-n"></span><span class="maq-apercu-t"></span>'; ap.children[0].textContent = o.nom; ap.children[1].textContent = o.texte; handle.after(ap);
    mc.querySelectorAll("span[onclick^='_reactAndClose']").forEach((s) => { s.classList.add("maq-react"); s.setAttribute("role", "button"); });
    const cles = [["Répondre", "repondre"], ["Copier", "copier"], ["Transférer", "transferer"], ["Signaler", "signaler"], ["Supprimer", "supprimer"]];
    const items = [...mc.querySelectorAll(".csetting-item")];
    items.forEach((it) => { const lab = it.querySelector(".csetting-label").textContent; const k = cles.find((x) => lab.indexOf(x[0]) === 0); if (k) it.querySelector(".csetting-icon").innerHTML = ico[k[1]]; });
    if (o.sansCopier) items.filter((it) => /Copier/.test(it.textContent)).forEach((x) => x.remove());
    const supp = items.filter((it) => /Supprimer/.test(it.textContent)); supp.slice(1).forEach((x) => x.remove());
    if (supp[0]) { supp[0].querySelector(".csetting-label").textContent = "Supprimer…"; supp[0].classList.add("maq-sep"); }
  }, [o, ICO]),
  // Confirmation de suppression à deux portées.
  confirmerSuppression: (page, o) => page.evaluate((o) => {
    openModal('<div class="modal-handle"></div><div class="modal-title" style="margin-bottom:10px;">Supprimer ce message ?</div>'
      + '<div class="maq-apercu"><span class="maq-apercu-n">Toi</span><span class="maq-apercu-t"></span></div>'
      + '<button class="maq-choix">Supprimer pour moi<small>Il reste visible chez ' + o.prenom + '.</small></button>'
      + '<button class="maq-choix maq-danger">Supprimer pour tout le monde<small>Il disparaît aussi chez ' + o.prenom + '. Action définitive.</small></button>'
      + '<button class="btn ghost block" style="margin-top:12px;min-height:44px;">Annuler</button>');
    document.querySelector("#modalContent .maq-apercu-t").textContent = o.texte;
  }, o),
  // Aperçu d'une photo AVANT envoi (la bulle déjà partie est retirée de la maquette).
  apercuPhoto: (page) => page.evaluate((ico) => {
    const fp = document.getElementById("conv-fullpage"); const tb = fp.querySelector(".conv-toolbar");
    const w = [...document.querySelectorAll("#convFpThread .conv-bubble-wrap")].pop(); const im = w && w.querySelector("img"); if (!im) return; const src = im.src; w.remove();
    const bar = document.createElement("div"); bar.className = "maq-pj"; bar.innerHTML = '<img alt="Photo à envoyer"><div class="maq-pj-t"><b>1 photo prête</b><span>Elle part quand tu touches Envoyer.</span></div><button aria-label="Retirer la photo">' + ico + "</button>"; bar.querySelector("img").src = src; tb.parentNode.insertBefore(bar, tb);
    const t = document.getElementById("convFpThread"); t.scrollTop = t.scrollHeight;
  }, ICO.croix),
  // Confirmation avant d'envoyer la position (la bulle déjà partie est retirée de la maquette).
  confirmerPosition: (page, o) => page.evaluate((o) => {
    const w = [...document.querySelectorAll("#convFpThread .conv-bubble-wrap")].pop(); if (w && /Ma position/.test(w.textContent)) w.remove();
    openModal('<div class="modal-handle"></div><div class="modal-title" style="margin-bottom:6px;">Envoyer ta position à ' + o.prenom + ' ?</div>'
      + '<p style="font-size:14px;color:var(--muted);margin:0 0 12px;line-height:1.45;">Ta position actuelle, précise à quelques mètres, sera visible dans cette conversation. Rien n\'est envoyé tant que tu n\'as pas confirmé.</p>'
      + '<div class="maq-apercu"><span class="maq-apercu-n">Position actuelle</span><span class="maq-apercu-t">45,7485 · 4,8467 — Lyon 7e</span></div>'
      + '<button class="btn primary block" style="min-height:48px;">Envoyer ma position</button>'
      + '<button class="btn ghost block" style="margin-top:8px;min-height:44px;">Annuler</button>');
  }, o),
  // Fichier audio local : une carte de fichier au lieu d'une bulle vide ; document : carte lisible.
  carteAudio: (page) => page.evaluate((ico) => {
    document.querySelectorAll("#convFpThread .conv-bubble-wrap.me .conv-bubble").forEach((b) => { if (b.children.length || b.textContent.trim()) return; b.innerHTML = '<div class="maq-carte"><span class="maq-ico">' + ico + '</span><span><b>repetition-jeudi.wav</b><small>Fichier audio · 32 Ko</small></span></div>'; });
    const t = document.getElementById("convFpThread"); t.scrollTop = t.scrollHeight;
  }, ICO.note),
  bandeau: (page, o) => page.evaluate((o) => {
    const fp = document.getElementById("conv-fullpage"); const tb = fp.querySelector(".conv-toolbar");
    [...tb.children].forEach((c) => { c.style.display = "none"; });
    const z = document.createElement("div"); z.className = "maq-bandeau"; z.innerHTML = "<span></span><button></button>"; z.children[0].textContent = o.texte; z.children[1].textContent = o.bouton; tb.appendChild(z);
    if (o.sous) { const s = document.querySelector("#convFpHead .conv-fp-passion"); if (s) s.textContent = o.sous; }
  }, o),
};
const CSS_ECRAN = CSS.bulles + CSS.entete + CSS.barre + CSS.etats + CSS.irl;

// ───────────────────────────────── SCÉNARIOS ─────────────────────────────────
module.exports = {
  domaine: "msg-conversation",
  scenarios: [
    // ══ 1. Le fil 1:1 « Léa » ══════════════════════════════════════════════════
    {
      nom: "fil-1a1",
      demarrage: compte(),
      vues: ["m390", "m360", "m320", "t768", "d1440"],
      async derouler({ page, prendre, GENS, vue }) {
        await jeu.routes(page);
        await page.evaluate(() => goTo("messages"));
        await page.waitForSelector("#messageList .msg-card", { timeout: 15000 });
        await attendre(page, 600);
        await page.locator("#messageList .msg-card", { hasText: GENS.lea.nom }).first().click();
        await page.waitForFunction(() => document.getElementById("conv-fullpage").classList.contains("active"), null, { timeout: 8000 });
        await attendre(page, 1800);
        await prendre({
          id: "MSG-103", seulement: ["m390"],
          titre: "À l'ouverture : le fil s'arrête 360 px au-dessus du dernier message",
          note: "Capture prise 1,8 s après le toucher sur la carte, sans autre geste. Le fil a été calé en bas AVANT que la photo, le GIF et la vidéo des derniers écrans aient leur hauteur ; rien ne le recale ensuite (sonde 02 : 360 px sous le bas de 200 ms à 3 s).",
          annotationsAvant: [
            { n: 1, sel: "#convFpThread", texte: "On arrive au milieu des médias : les deux derniers messages (« Super. Prends ta guitare… », « Ça marche, à samedi ! ») sont sous le pli." },
            { n: 2, sel: "#conv-fullpage .conv-toolbar", texte: "Aucun indice qu'il reste des messages plus bas." },
          ],
          apres: { js: JS.enBas },
          annotations: [{ n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_22"]', texte: "Place des médias réservée + bas recalé à chaque média chargé : le dernier message est visible dès l'ouverture." }],
        });
        await jeu.filPret(page); await jeu.enBas(page);

        await prendre({
          id: "MSG-100", seulement: ["m390", "m360", "t768", "d1440"],
          titre: "Conversation 1:1 — bas du fil (état normal)",
          note: "Fil remis sur son dernier message par le scénario. Bulle « Position » de Camille : blanc sur fond lavande (1,08:1).",
          zooms: [
            { nom: "position-envoyee", titre: "Ma position, rechargée depuis le serveur", sel: '.conv-bubble-wrap[data-mid="m_lea_20"]', marge: 10 },
            { nom: "dernier-message", titre: "Dernier message : réactions, heure, accusé ✓✓", sel: '.conv-bubble-wrap[data-mid="m_lea_22"]', marge: 10 },
          ],
          annotationsAvant: [
            { n: 1, sel: "#convFpHead .conv-fp-passion", texte: "« Voir le profil » : aucun rappel de ce qui nous relie (la liste affichait les passions)." },
            { n: 2, sel: '.conv-bubble-wrap[data-mid="m_lea_20"] .conv-bubble', texte: "Ma position envoyée : texte blanc sur fond clair, 1,08:1." },
            { n: 3, sel: "#convFpInput", texte: "Champ de 156 px sur 390 (126 px utiles, ≈ 17 caractères par ligne)." },
            { n: 4, sel: '.conv-toolbar button[aria-label="Ajouter un GIF"]', texte: "Seconde entrée GIF (l'onglet GIF du panneau emoji existe déjà) ; micro et envoi toujours affichés." },
          ],
          apres: { css: CSS_ECRAN, js: async (p) => { await JS.entete(p, { sous: "Musique · Cuisine" }); await JS.barre(p); await JS.enBas(p); } },
          annotations: [
            { n: 1, sel: "#convFpHead .conv-fp-passion", texte: "Sous le nom : les passions de l'interlocutrice (même formule que la liste). La zone ouvre toujours le profil." },
            { n: 2, sel: '.conv-bubble-wrap[data-mid="m_lea_20"] .conv-bubble', texte: "Position, vocal et document gardent une vraie bulle : lisibles." },
            { n: 3, sel: "#convFpInput", texte: "Champ élargi (≈ 270 px), destinataire nommé, emoji/GIF à l'intérieur." },
            { n: 4, sel: "#btnVoice", texte: "Un seul bouton de 44 px : micro quand le champ est vide, envoi dès qu'il y a du texte." },
          ],
        });

        await prendre({
          id: "MSG-101", seulement: ["m390", "m360"],
          titre: "En-tête d'une conversation 1:1",
          zooms: [{ nom: "entete", titre: "En-tête", sel: "#convFpHead", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: "#convFpHead .conv-fp-passion", texte: "Sous-titre figé « Voir le profil », 11 px violet." },
            { n: 2, sel: '#convFpHead button[title="Paramètres"]', texte: "34 × 34 px (zone 38 × 46), sans nom accessible (title seul)." },
            { n: 3, sel: "#convFpHead .conv-fp-back", texte: "36 × 36 px (zone 40 × 48)." },
          ],
          apres: { css: CSS.entete, js: (p) => JS.entete(p, { sous: "Musique · Cuisine" }) },
          annotations: [
            { n: 1, sel: "#convFpHead .conv-fp-passion", texte: "Passions de l'interlocutrice, en gris : le contexte de l'échange." },
            { n: 2, sel: '#convFpHead button[title="Paramètres"]', texte: "44 × 44 px, nommé « Paramètres de la conversation »." },
            { n: 3, sel: "#convFpHead .conv-fp-back", texte: "44 × 44 px." },
          ],
        });

        await prendre({
          id: "MSG-102", seulement: ["m390", "m360", "m320"],
          titre: "Barre de saisie au repos",
          zooms: [{ nom: "barre", titre: "Barre de saisie", sel: "#conv-fullpage .conv-toolbar", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: "#convFpInput", texte: "Champ : 156 px à 390, 126 px à 360, 86 px à 320 ; placeholder « Message… », aucune étiquette." },
            { n: 2, sel: '.conv-toolbar button[aria-label="Ajouter un GIF"]', texte: "Doublon de l'onglet GIF du panneau emoji." },
            { n: 3, sel: "#convFpSendBtn", texte: "Envoi (40 px) et micro (36 px) affichés en permanence : pas d'action principale." },
          ],
          apres: { css: CSS.barre, js: (p) => JS.barre(p) },
          annotations: [
            { n: 1, sel: "#convFpInput", texte: "Champ ≈ 270 px à 390 ; placeholder et étiquette nomment le destinataire." },
            { n: 2, sel: "#btnEmoji", texte: "Emoji et GIF réunis dans le champ (un seul sélecteur)." },
            { n: 3, sel: "#btnVoice", texte: "Bouton unique de 44 px : micro si le champ est vide, flèche d'envoi sinon." },
          ],
        });
        if (!["m390", "m360"].includes(vue)) return;

        // Bloc « hier » : séparateurs + vocal / document reçus et envoyés
        await caler(page, "m_lea_10", 52);
        const seps = await page.evaluate(() => { const t = document.getElementById("convFpThread"); const f = t.getBoundingClientRect(); return [...t.children].filter((e) => !e.classList.contains("conv-bubble-wrap")).map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText.trim(), x: 0.5, y: (r.top + r.height / 2) / innerHeight, vu: r.top >= f.top - 2 && r.bottom <= f.bottom + 2 }; }).filter((s) => s.vu); });
        await prendre({
          id: "MSG-104", seulement: ["m390"],
          titre: "Séparateurs de jour : « Aujourd'hui » deux fois",
          note: "Les messages du haut datent d'hier (−23 h), ceux du bas d'aujourd'hui : même libellé. Plus haut, le bloc d'avant-hier (−47 h) est intitulé « Hier ».",
          annotationsAvant: seps.slice(0, 2).map((s, i) => ({ n: i + 1, x: s.x, y: s.y, texte: i === 0 ? "Messages d'HIER libellés « " + s.t + " » (moins de 24 h écoulées)." : "Messages du jour : même libellé « " + s.t + " »." })),
          apres: { js: JS.separateurs },
          annotations: seps.slice(0, 2).map((s, i) => ({ n: i + 1, x: s.x, y: s.y, texte: i === 0 ? "« Hier » : libellé calculé par jour calendaire." : "« Aujourd'hui » n'apparaît qu'une fois." })),
        });
        await prendre({
          id: "MSG-107", seulement: ["m390", "m360"],
          titre: "Vocal, document et fichier audio — reçus (lisibles) et envoyés (fantômes)",
          zooms: [
            { nom: "vocal-recu", titre: "Vocal reçu : lecteur", sel: '.conv-bubble-wrap[data-mid="m_lea_10"]', marge: 8 },
            { nom: "vocal-envoye", titre: "Mon vocal envoyé", sel: '.conv-bubble-wrap[data-mid="m_lea_11"]', marge: 8 },
            { nom: "doc-recu", titre: "Document reçu : nom coupé", sel: '.conv-bubble-wrap[data-mid="m_lea_12"]', marge: 8 },
            { nom: "doc-envoye", titre: "Mon document envoyé", sel: '.conv-bubble-wrap[data-mid="m_lea_13b"]', marge: 8 },
          ],
          annotationsAvant: [
            { n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_11"] .conv-bubble', texte: "Mon vocal : bouton, barre, durée et vitesse en blanc sur fond lavande." },
            { n: 2, sel: '.conv-bubble-wrap[data-mid="m_lea_13b"] .conv-bubble', texte: "Mon document : nom et « Télécharger » en blanc sur fond lavande." },
            { n: 3, sel: '.conv-bubble-wrap[data-mid="m_lea_10"] button', texte: "Lecture : 34 × 34 px, nommée « ▶ » ; vitesse : 24 × 18 px." },
            { n: 4, sel: '.conv-bubble-wrap[data-mid="m_lea_12"] .conv-bubble', texte: "Nom coupé à 140 px : « Programme-stage-lu… »." },
          ],
          apres: { css: CSS.bulles },
          annotations: [
            { n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_11"] .conv-bubble', texte: "Le vocal garde la bulle violette : tout redevient lisible sans changer ses couleurs." },
            { n: 2, sel: '.conv-bubble-wrap[data-mid="m_lea_13b"] .conv-bubble', texte: "Idem pour le document." },
            { n: 3, sel: '.conv-bubble-wrap[data-mid="m_lea_10"] button', texte: "Lecture 44 px, vitesse 44 × 36 px." },
            { n: 4, sel: '.conv-bubble-wrap[data-mid="m_lea_12"] .conv-bubble', texte: "Nom du fichier sur deux lignes." },
          ],
        });
        if (vue !== "m390") return;

        await caler(page, "m_lea_01", 60);
        await prendre({
          id: "MSG-105",
          titre: "Bulles de texte : alignement, groupement, heure sous chaque bulle",
          annotationsAvant: [
            { n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_02"] .conv-bubble-time', texte: "Heure sous chaque bulle, même à une minute d'écart." },
            { n: 2, sel: '.conv-bubble-wrap[data-mid="m_lea_03"]', texte: "Suite du même expéditeur : coins resserrés, mais 12 px de marge + une ligne d'heure." },
          ],
          apres: { css: CSS.groupes, js: JS.groupes },
          annotations: [{ n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_03"] .conv-bubble-time', texte: "Une seule heure pour la suite de deux messages ; marge interne réduite à 3 px." }],
        });
        await caler(page, "m_lea_07", 70);
        await prendre({
          id: "MSG-106",
          titre: "Citation d'une réponse, emoji seul, lien long",
          zooms: [
            { nom: "citation", titre: "Citation dans une bulle", sel: '.conv-bubble-wrap[data-mid="m_lea_07"]', marge: 8 },
            { nom: "lien", titre: "Lien dans un message", sel: '.conv-bubble-wrap[data-mid="m_lea_09"]', marge: 8 },
          ],
          annotationsAvant: [{ n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_09"] .conv-bubble', texte: "L'adresse est du texte brut : rien à toucher pour l'ouvrir." }],
          apres: { css: CSS.liens, js: JS.liens },
          annotations: [{ n: 1, sel: ".maq-lien", texte: "Lien actif, souligné, dans la couleur du texte (http/https seulement, nouvel onglet)." }],
        });
        await caler(page, "m_lea_17", 60);
        await prendre({
          id: "MSG-111",
          titre: "GIF, photo et vidéo dans le fil",
          note: "GIF servi par le banc (image fixe locale) : KLIPY est refusé. Vidéo : boucle locale.",
          annotationsAvant: [
            { n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_18"] img', texte: "Aucune dimension réservée ni texte alternatif : la bulle prend sa hauteur au chargement." },
            { n: 2, sel: '.conv-bubble-wrap[data-mid="m_lea_19"] video', texte: "Lecteur natif : l'appui long n'ouvre pas le menu d'actions." },
          ],
        });
      },
    },

    // ══ 2. Saisie et statuts d'envoi « Inès » ═════════════════════════════════
    {
      nom: "saisie",
      demarrage: compte(),
      vues: ["m390", "m360"],
      async derouler({ page, context, prendre, serveur, banc, GENS, vue }) {
        await jeu.routes(page);
        await jeu.entrer(page, GENS.ines.nom);
        await page.locator("#convFpInput").tap();
        await attendre(page, 250);
        await page.keyboard.type("Bonjour Inès, est-ce que tu serais disponible samedi matin pour me montrer le développement ? Je peux apporter deux pellicules déjà exposées.");
        await attendre(page, 250);
        await prendre({
          id: "MSG-121",
          titre: "Message de 141 caractères en cours de frappe",
          zooms: [{ nom: "barre", titre: "Barre de saisie", sel: "#conv-fullpage .conv-toolbar", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: "#convFpInput", texte: "11 lignes de texte pour 5 visibles : le début du message a défilé hors du champ." },
            { n: 2, sel: "#convFpSendBtn", texte: "Sur ce clavier, la touche Entrée envoie aussi : pas de saut de ligne possible." },
          ],
          apres: { css: CSS.barre, js: (p) => JS.barre(p) },
          annotations: [
            { n: 1, sel: "#convFpInput", texte: "Même message dans le champ élargi : tout le texte est relisible." },
            { n: 2, sel: "#convFpSendBtn", texte: "Seul ce bouton envoie ; Entrée ajoute une ligne (sur tactile)." },
          ],
        });
        const restituer = await banc.simulerClavier(page, 300);
        await page.keyboard.type(" ");
        await attendre(page, 300);
        await prendre({
          id: "MSG-120",
          titre: "Clavier virtuel ouvert (simulé : fenêtre réduite de 300 px)",
          note: "ÉMULATION : la fenêtre est réduite, la coque de l'application garde ses 844 px (--app-vh n'est pas recalculé pendant la frappe) ; le navigateur fait glisser la page pour garder le champ visible, l'en-tête sort par le haut. À vérifier sur un vrai téléphone.",
          annotationsAvant: [{ n: 1, x: 0.5, y: 0.04, texte: "L'en-tête (retour, nom de l'interlocutrice) n'est plus à l'écran pendant la frappe." }],
        });
        await restituer();
        await page.locator("#convFpInput").fill("");
        await page.evaluate(() => { try { autoResizeTextarea(document.getElementById("convFpInput")); } catch (e) {} });

        if (vue === "m390") {
          await page.locator("#convFpInput").fill("a".repeat(5200));
          await page.locator("#convFpSendBtn").click();
          await attendre(page, 350);
          await prendre({
            id: "MSG-126",
            titre: "Message de 5 200 caractères : refusé… sans que rien ne s'affiche",
            note: "L'application émet le toast « ✋ Message trop long : 5 000 caractères au plus (il en fait 5 200) », mais il est caché derrière la conversation (pile des toasts en z-index 200, conversation en 1200 — sonde 10). Vu de la personne : l'appui sur Envoyer ne fait rien.",
            annotationsAvant: [{ n: 1, sel: "#convFpSendBtn", texte: "Appui sur Envoyer : aucun retour visible, le texte reste dans le champ." }],
            apres: { css: CSS.toasts },
            annotations: [{ n: 1, sel: "#toastStack .toast", texte: "Les toasts passent au-dessus de la conversation : la limite et la longueur actuelle se lisent." }],
            attendre: 100,
          });
          await page.locator("#convFpInput").fill("");
          await page.evaluate(() => { try { autoResizeTextarea(document.getElementById("convFpInput")); } catch (e) {} });
          await attendre(page, 3000);

          // Envoi en cours : la réponse du serveur est retenue 7 s
          const lent = async (route) => { if (route.request().method() !== "POST") return route.fallback(); await new Promise((r) => setTimeout(r, 7000)); return route.fallback(); };
          await page.route(/\/rest\/v1\/conv_messages/, lent);
          await page.locator("#convFpInput").fill("Je passe demain vers 18 h.");
          await page.locator("#convFpSendBtn").click();
          await attendre(page, 500);
          await prendre({
            id: "MSG-122",
            titre: "Envoi en cours (réponse du serveur retardée)",
            zooms: [{ nom: "statut", titre: "Statut d'envoi", sel: "#convFpThread .conv-bubble-wrap:last-child", marge: 10 }],
            annotationsAvant: [{ n: 1, sel: "#convFpThread .conv-bubble-wrap:last-child .conv-bubble-time", texte: "« ✓ » puis l'emoji 🕓 : la coche dit déjà « envoyé » alors que rien n'est confirmé." }],
            apres: { css: CSS.etats, js: (p) => JS.etats(p, {}) },
            annotations: [{ n: 1, sel: ".maq-etat", texte: "« Envoi… » en toutes lettres ; la coche n'apparaît qu'à la confirmation du serveur." }],
            attendre: 150,
          });
          await page.waitForFunction((id) => { const c = getConversations().find((x) => x.id === id); return c.messages[c.messages.length - 1].status === "sent"; }, IDS.ines, { timeout: 15000 }).catch(() => {});
          await page.unroute(/\/rest\/v1\/conv_messages/, lent);
        }

        // Échec (500) puis hors ligne
        serveur.pannes.push({ table: "conv_messages", methode: "POST", status: 500, body: { message: "panne programmée du banc" }, fois: 1 });
        await page.locator("#convFpInput").fill("Tu peux me prêter ta cuve ?");
        await page.locator("#convFpSendBtn").click();
        await attendre(page, 1300);
        await jeu.enBas(page);
        await prendre({
          id: "MSG-123",
          titre: "Envoi refusé par le serveur : « ✓ réessayer »",
          note: "Panne programmée dans le faux serveur (HTTP 500, une fois). La relance fonctionne : un toucher sur « réessayer » renvoie le message (sonde 02).",
          zooms: [{ nom: "statut", titre: "Statut d'échec", sel: "#convFpThread .conv-bubble-wrap:last-child", marge: 10 }],
          annotationsAvant: [
            { n: 1, sel: "#convFpThread [data-msgst] span[onclick]", texte: "« réessayer » : 47 × 15 px, 11 px, seule prise pour relancer." },
            { n: 2, sel: "#convFpThread .conv-bubble-wrap:last-child .conv-bubble-time", texte: "La coche « ✓ » reste affichée sur un message qui n'est pas parti." },
          ],
          apres: { css: CSS.etats, js: (p) => JS.etats(p, {}) },
          annotations: [{ n: 1, sel: ".maq-echec", texte: "Un seul état : « Non envoyé · Réessayer », bouton de 44 px nommé, sans coche." }],
        });
        if (vue !== "m390") return;
        await page.locator("#convFpThread [data-msgst] span[onclick]").last().tap();
        await attendre(page, 1300);
        await context.setOffline(true);
        await attendre(page, 500);
        await page.locator("#convFpInput").fill("Envoyé dans le métro");
        await page.locator("#convFpSendBtn").click();
        await attendre(page, 900);
        await jeu.enBas(page);
        await prendre({
          id: "MSG-124",
          titre: "Hors ligne : message en file, bandeau par-dessus l'en-tête",
          note: "Réseau coupé par le contexte du navigateur. Le message est en file et partira seul au retour du réseau.",
          zooms: [{ nom: "haut", titre: "Bandeau sur l'en-tête", sel: "#convFpHead", marge: 0 }, { nom: "statut", titre: "Statut du message en attente", sel: "#convFpThread .conv-bubble-wrap:last-child", marge: 10 }],
          annotationsAvant: [
            { n: 1, sel: "#offlineBanner", texte: "Le bandeau (z-index 9999) couvre le bouton Retour, le nom et le menu « ⋯ »." },
            { n: 2, sel: "#convFpThread [data-msgst] span[onclick]", texte: "« ✓ réessayer » alors que le message est en file et partira tout seul." },
          ],
          apres: { css: CSS.etats, js: (p) => JS.etats(p, { horsLigne: true }) },
          annotations: [
            { n: 1, sel: ".maq-hl", texte: "L'état hors ligne passe SOUS l'en-tête : on voit toujours à qui l'on écrit." },
            { n: 2, sel: ".maq-etat", texte: "« En attente du réseau » : ni coche, ni faux échec." },
          ],
        });
        await context.setOffline(false);
      },
    },

    // ══ 3. Menu d'un message « Léa » ══════════════════════════════════════════
    {
      nom: "menu-message",
      demarrage: compte(),
      vues: ["m390", "m360"],
      async derouler({ page, context, prendre, banc, GENS, vue }) {
        await jeu.routes(page);
        await jeu.entrer(page, GENS.lea.nom);
        // Appui maintenu sur l'avant-dernier message : la feuille s'ouvre sous le doigt
        const main = await banc.appuiMaintenu(page, jeu.bulle("m_lea_21"));
        await attendre(page, 800);
        const doigt = await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: (b.left + b.width / 2) / innerWidth, y: (b.top + b.height / 2) / innerHeight }; }, jeu.bulle("m_lea_21"));
        await prendre({
          id: "MSG-148", seulement: ["m390"],
          titre: "Appui long : la feuille s'ouvre sous le doigt encore posé",
          note: "Doigt maintenu depuis 0,8 s (appui tactile CDP), pas encore relâché. Dans le banc, relâcher ici déclenche « Répondre » (sonde 03c). À confirmer sur appareil réel.",
          annotationsAvant: [{ n: 1, x: doigt.x, y: doigt.y, texte: "Position du doigt : il se trouve sur la ligne « Répondre » de la feuille qui vient d'apparaître." }],
          attendre: 100,
        });
        await main.glisser(0, -160); await attendre(page, 60); await main.relacher(); await attendre(page, 550);
        await prendre({
          id: "MSG-140",
          titre: "Feuille d'actions d'un message reçu",
          note: "Feuille ouverte par appui maintenu puis glissé (voir MSG-148).",
          zooms: [{ nom: "feuille", titre: "Feuille d'actions", sel: "#modalContent", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: "#modalContent span[onclick^='_reactAndClose']", texte: "Réactions : 36 × 35 px." },
            { n: 2, sel: "#modalContent .modal-handle", texte: "Rien ne rappelle le message concerné (le fil est flouté)." },
            { n: 3, sel: "#modalContent .csetting-item:last-child", texte: "Suppression immédiate, sans confirmation." },
          ],
          apres: { css: CSS.feuille, js: (p) => JS.feuille(p, { nom: "Léa Fontaine", texte: "Super. Prends ta guitare, on regardera le chevalet ensemble." }) },
          annotations: [
            { n: 1, sel: "#modalContent .maq-react", texte: "Réactions de 44 px." },
            { n: 2, sel: "#modalContent .maq-apercu", texte: "Rappel du message visé." },
            { n: 3, sel: "#modalContent .maq-sep", texte: "Une seule entrée « Supprimer… », séparée ; elle ouvre une confirmation." },
          ],
        });
        await page.locator("#modalContent .csetting-item", { hasText: "Répondre" }).click();
        await attendre(page, 500);
        await prendre({
          id: "MSG-130", seulement: ["m390"],
          titre: "Barre de réponse",
          zooms: [{ nom: "reponse", titre: "Barre de réponse", sel: "#convReplyBar", marge: 4 }],
          annotationsAvant: [
            { n: 1, sel: "#convReplyBar", texte: "La barre (53 px) recouvre les réactions et l'heure du dernier message : le fil n'est pas recalé." },
            { n: 2, sel: "#convReplyBar span[onclick]", texte: "✕ : 23 × 24 px, sans nom accessible." },
          ],
          apres: { css: "#convReplyBar span[onclick]{ width:44px; height:44px; display:inline-flex; align-items:center; justify-content:center; padding:0 !important; }", js: JS.enBas },
          annotations: [
            { n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_22"]', texte: "Fil recalé : le dernier message reste entièrement visible au-dessus de la barre." },
            { n: 2, sel: "#convReplyBar span[onclick]", texte: "✕ de 44 px (à nommer « Annuler la réponse »)." },
          ],
        });
        await page.evaluate(() => _cancelReply());
        if (vue !== "m390") return;

        // Photo reçue : « Copier le texte », puis citation technique
        await jeu.ouvrirMenu(page, banc, "m_lea_05");
        await prendre({
          id: "MSG-142",
          titre: "Feuille d'actions d'une photo reçue",
          annotationsAvant: [{ n: 1, sel: '#modalContent .csetting-item:has-text("Copier")', texte: "« Copier le texte » sur une photo : copie « [MEDIA] atelier.jpg »." }],
          apres: { css: CSS.feuille, js: (p) => JS.feuille(p, { nom: "Léa Fontaine", texte: "Photo", sansCopier: true }) },
          annotations: [{ n: 1, sel: "#modalContent .maq-apercu", texte: "Le message visé est décrit par son type (« Photo ») ; « Copier le texte » n'est proposé que pour du texte." }],
        });
        await page.locator("#modalContent .csetting-item", { hasText: "Répondre" }).click();
        await attendre(page, 500);
        await prendre({
          id: "MSG-143",
          titre: "Répondre à une photo : la citation affiche une étiquette technique",
          zooms: [{ nom: "reponse", titre: "Barre de réponse", sel: "#convReplyBar", marge: 4 }],
          annotationsAvant: [{ n: 1, sel: "#convReplyBar", texte: "« [MEDIA] atelier.jpg » : libellé interne et nom de fichier." }],
          apres: { js: (p) => p.evaluate(() => { const d = document.querySelectorAll("#convReplyBar div div")[1]; if (d) d.textContent = "Photo"; }) },
          annotations: [{ n: 1, sel: "#convReplyBar", texte: "« Photo » (et « Message vocal · 0:14 », « Document · nom » selon le type)." }],
        });
        await page.evaluate(() => _cancelReply());

        await jeu.ouvrirMenu(page, banc, "m_lea_21");
        await page.locator("#modalContent .csetting-item", { hasText: "Transférer" }).click();
        await attendre(page, 500);
        await prendre({
          id: "MSG-144",
          titre: "« Transférer vers… »",
          annotationsAvant: [{ n: 1, sel: "#modalContent .csetting-item", texte: "La conversation d'origine est proposée en premier ; un toucher envoie sans confirmation." }],
        });
        await fermerModale(page);

        await jeu.ouvrirMenu(page, banc, "m_lea_21");
        await page.locator("#modalContent .csetting-item", { hasText: "Signaler" }).click();
        await attendre(page, 700);
        await prendre({ id: "MSG-145", titre: "« Signaler ce message »", note: "Motif obligatoire, confidentialité rappelée ; absent de mes propres messages." });
        await fermerModale(page);

        await jeu.ouvrirMenu(page, banc, "m_lea_21");
        await page.locator("#modalContent span[onclick^='_reactAndClose']").nth(0).click();
        await attendre(page, 700);
        await jeu.filPret(page); await jeu.enBas(page);
        await prendre({
          id: "MSG-147",
          titre: "Réaction posée depuis la feuille",
          zooms: [{ nom: "pastilles", titre: "Pastilles de réaction", sel: '.conv-bubble-wrap[data-mid="m_lea_21"]', marge: 10 }],
          annotationsAvant: [{ n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_21"] .conv-reactions', texte: "Pastilles de 20 px de haut, inertes : pour retirer ma réaction il faut rouvrir la feuille." }],
        });

        // Mon message : deux suppressions
        await jeu.ouvrirMenu(page, banc, "m_lea_22");
        await prendre({
          id: "MSG-141",
          titre: "Feuille d'actions d'un de mes messages",
          zooms: [{ nom: "feuille", titre: "Feuille d'actions", sel: "#modalContent", marge: 0 }],
          annotationsAvant: [{ n: 1, sel: "#modalContent .csetting-item:last-child", texte: "Deux suppressions rouges jumelles (56 px l'une sous l'autre), toutes deux immédiates." }],
          apres: { css: CSS.feuille, js: (p) => JS.feuille(p, { nom: "Toi", texte: "Ça marche, à samedi !" }) },
          annotations: [{ n: 1, sel: "#modalContent .maq-sep", texte: "Une entrée « Supprimer… » ; le choix de la portée se fait dans la confirmation." }],
        });
        await page.locator("#modalContent .csetting-item", { hasText: "Supprimer pour tous" }).click();
        await attendre(page, 500);
        await prendre({
          id: "MSG-146",
          titre: "« Supprimer pour tous » : le message a disparu au premier toucher",
          note: "Aucune confirmation ; la ligne est supprimée en base, un contrôle `del` est envoyé ; le fil ne garde aucune trace.",
          annotationsAvant: [{ n: 1, sel: "#convFpThread", texte: "Le message a disparu sans un mot : le toast « Message supprimé pour tous » est caché derrière la conversation (pile des toasts en z-index 200, conversation en 1200 — sonde 10)." }],
          apres: { css: CSS.feuille, js: (p) => JS.confirmerSuppression(p, { prenom: "Léa", texte: "Ça marche, à samedi !" }) },
          annotations: [{ n: 1, sel: "#modalContent .maq-danger", texte: "La confirmation explique les deux portées avant d'agir ; « Annuler », le fond et Retour ne suppriment rien." }],
          attendre: 100,
        });
        await attendre(page, 3200);

        // Vidéo : l'appui long ne donne rien
        await caler(page, "m_lea_19", 120);
        const main2 = await banc.appuiMaintenu(page, jeu.bulle("m_lea_19") + " video");
        await attendre(page, 900);
        await prendre({
          id: "MSG-149",
          titre: "Appui long sur une vidéo : aucune feuille",
          note: "Doigt maintenu 0,9 s au centre de la vidéo (appui tactile CDP). Sur une photo ou un texte, la feuille est ouverte à ce moment.",
          annotationsAvant: [{ n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_19"] video', texte: "Le lecteur natif capte l'appui : ni réponse, ni réaction, ni signalement, ni suppression." }],
          attendre: 100,
        });
        await main2.relacher();
      },
    },

    // ══ 4. Pièces jointes, emoji, GIF « Inès » ════════════════════════════════
    {
      nom: "pieces-jointes",
      demarrage: compte(),
      vues: ["m390", "m360"],
      async derouler({ page, context, prendre, GENS, vue }) {
        await jeu.routes(page, { irl: true });
        await klipyLocal(page);
        await jeu.entrer(page, GENS.ines.nom);
        await attendre(page, 500);
        await page.locator("#btnAttach").tap();
        await attendre(page, 400);
        await prendre({
          id: "MSG-150",
          titre: "Menu « + »",
          zooms: [{ nom: "menu", titre: "Menu « + »", sel: "#convAttachMenu", marge: 6 }],
          annotationsAvant: [
            { n: 1, sel: "#v6cProposerIrl", texte: "« Proposer un IRL » : violet, poignée de main ; l'en-tête dit « Proposer un moment IRL » avec une épingle." },
            { n: 2, sel: '#convAttachMenu .attach-item:has-text("Localisation")', texte: "« Localisation » : un toucher envoie la position exacte, sans confirmation." },
          ],
          apres: { css: CSS.irl + CSS.entete, js: (p) => p.evaluate(() => { const l = document.querySelector("#v6cProposerIrl .attach-label"); if (l) l.textContent = "Proposer un moment IRL"; }) },
          annotations: [
            { n: 1, sel: "#v6cProposerIrl", texte: "Même libellé qu'en en-tête, teinte corail réservée au passage au réel." },
            { n: 2, sel: '#convAttachMenu .attach-item:has-text("Localisation")', texte: "« Localisation » ouvre d'abord une confirmation (voir MSG-157)." },
          ],
        });
        await page.touchscreen.tap(300, 200); await attendre(page, 300);

        // Panneau emoji : état de la page construite (remplissage d'app-09 rejoué)
        await page.evaluate(() => _populateEmojiGrid());
        await page.locator("#btnEmoji").tap(); await attendre(page, 500);
        await prendre({
          id: "MSG-151",
          titre: "Panneau emoji (grille telle que la page construite la laisse)",
          note: "SIMULÉ : `_populateEmojiGrid()` est rappelé par le scénario pour reproduire l'ordre d'exécution de la page de production ; dans le banc le résultat dépend de la vitesse de chargement (voir MSG-152).",
          zooms: [{ nom: "panneau", titre: "Panneau emoji", sel: "#convEmojiPanel", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: "#emojiGrid", texte: "12 colonnes : cellules de 31 × 32 px." },
            { n: 2, sel: "#emojiCategoriesBar", texte: "Bande de catégories vide (17 px)." },
            { n: 3, sel: "#emojiTopBar button", texte: "Onglet en #7c3aed (ancien violet), 36 px de haut." },
          ],
          apres: { css: CSS.emoji },
          annotations: [
            { n: 1, sel: "#emojiGrid", texte: "8 colonnes : cellules de 44 px." },
            { n: 2, sel: "#emojiSearchInput", texte: "Bande vide retirée : la grille gagne une rangée." },
            { n: 3, sel: "#emojiTopBar button", texte: "Onglets de 44 px à la couleur d'accent." },
          ],
        });
        if (vue === "m390") {
          await page.locator("#emojiTopBar button", { hasText: "GIF" }).tap();
          await attendre(page, 1200);
          await prendre({ id: "MSG-153", titre: "Panneau emoji — onglet GIF", note: "SIMULÉ : 8 images locales à la place des GIF de KLIPY (hôte refusé par le banc).", annotationsAvant: [{ n: 1, sel: "#gifGrid", texte: "Un toucher sur une vignette envoie aussitôt le GIF." }] });
        }
        await page.touchscreen.tap(200, 200); await attendre(page, 300);
        await page.evaluate(() => { document.getElementById("convEmojiPanel").classList.remove("open"); try { switchEmojiTab("emoji", document.querySelector("#emojiTopBar button")); } catch (e) {} });
        if (vue !== "m390") {
          // À 360 px : seule la visionneuse reste à capturer (photo du jeu absente ici → on en envoie une)
          await page.locator("#btnAttach").tap(); await attendre(page, 300);
          const [fc0] = await Promise.all([page.waitForEvent("filechooser", { timeout: 6000 }), page.locator("#convAttachMenu .attach-item", { hasText: "Photo" }).tap()]);
          await fc0.setFiles(path.join(MEDIAS, "photo-paysage.jpg"));
          await attendre(page, 1500); await jeu.filPret(page); await jeu.enBas(page);
          await page.locator("#convFpThread img[onclick]").last().tap(); await attendre(page, 500);
          await prendre({ id: "MSG-159", titre: "Visionneuse d'image", apres: { css: CSS.visionneuse }, annotationsAvant: [{ n: 1, sel: "#_fiv_close", texte: "Boutons de 38 × 38 px." }], annotations: [{ n: 1, sel: "#_fiv_close", texte: "Boutons de 44 px ; la visionneuse se ferme aussi par le Retour du système." }] });
          return;
        }

        await page.locator('.conv-toolbar button[aria-label="Ajouter un GIF"]').tap();
        await attendre(page, 1200);
        await prendre({
          id: "MSG-154",
          titre: "Sélecteur de GIF flottant (bouton pellicule)",
          note: "SIMULÉ : images locales. Second sélecteur de GIF, différent de l'onglet du panneau emoji.",
          annotationsAvant: [{ n: 1, sel: "#gif-panel-msg", texte: "Carte flottante posée sur le dernier message ; un toucher envoie." }],
        });
        await page.touchscreen.tap(60, 120); await attendre(page, 400);
        await page.evaluate(() => { const p = document.getElementById("gif-panel-msg"); if (p) p.remove(); });

        // Photo par le vrai sélecteur de fichier
        await page.locator("#btnAttach").tap(); await attendre(page, 300);
        const [fc] = await Promise.all([page.waitForEvent("filechooser", { timeout: 6000 }), page.locator("#convAttachMenu .attach-item", { hasText: "Photo" }).tap()]);
        await fc.setFiles(path.join(MEDIAS, "photo-paysage.jpg"));
        await attendre(page, 1500); await jeu.filPret(page); await jeu.enBas(page);
        await prendre({
          id: "MSG-155",
          titre: "Photo choisie dans le sélecteur du système : déjà envoyée",
          note: "Vrai <input type=file>. 1,5 s après le choix, la photo est dans le fil et sur le serveur ; aucun aperçu ni confirmation.",
          annotationsAvant: [{ n: 1, sel: "#convFpThread .conv-bubble-wrap:last-child", texte: "La photo est partie dès le choix du fichier." }],
          apres: { css: CSS.apercu + CSS.barre, js: async (p) => { await JS.apercuPhoto(p); await JS.barre(p, { plein: true }); } },
          annotations: [
            { n: 1, sel: ".maq-pj", texte: "La photo attend dans une bande d'aperçu ; « ✕ » la retire." },
            { n: 2, sel: "#convFpSendBtn", texte: "C'est le bouton d'envoi qui la fait partir." },
          ],
        });
        // Document puis fichier audio
        await page.locator("#btnAttach").tap(); await attendre(page, 300);
        const [fd] = await Promise.all([page.waitForEvent("filechooser", { timeout: 6000 }), page.locator("#convAttachMenu .attach-item", { hasText: "Document" }).tap()]);
        await fd.setFiles({ name: "Feuille-de-route-developpement-argentique.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(48 * 1024, 32) });
        await attendre(page, 1500);
        await page.locator("#btnAttach").tap(); await attendre(page, 300);
        const [fa] = await Promise.all([page.waitForEvent("filechooser", { timeout: 6000 }), page.locator("#convAttachMenu .attach-item", { hasText: "Fichier audio" }).tap()]);
        await fa.setFiles({ name: "repetition-jeudi.wav", mimeType: "audio/wav", buffer: jeu.wav(2) });
        await attendre(page, 1500); await jeu.filPret(page); await jeu.enBas(page);
        await prendre({
          id: "MSG-156",
          titre: "Document et fichier audio que je viens d'envoyer",
          zooms: [{ nom: "bulles", titre: "Les deux dernières bulles", sel: "#convFpThread .conv-bubble-wrap:nth-last-child(2)", marge: 10 }, { nom: "audio", titre: "Fichier audio : bulle vide", sel: "#convFpThread .conv-bubble-wrap:last-child", marge: 10 }],
          annotationsAvant: [
            { n: 1, sel: "#convFpThread .conv-bubble-wrap:nth-last-child(2) .conv-bubble", texte: "Document : nom, type et taille en blanc sur fond lavande." },
            { n: 2, sel: "#convFpThread .conv-bubble-wrap:last-child .conv-bubble", texte: "Fichier audio : capsule violette vide (aucun rendu pour la copie locale)." },
          ],
          apres: { css: CSS.bulles, js: JS.carteAudio },
          annotations: [
            { n: 1, sel: "#convFpThread .conv-bubble-wrap:nth-last-child(2) .conv-bubble", texte: "Document lisible dans sa bulle." },
            { n: 2, sel: "#convFpThread .conv-bubble-wrap:last-child .conv-bubble", texte: "Fichier audio : carte avec nom et type, comme après relecture serveur." },
          ],
        });
        // Position accordée
        await context.grantPermissions(["geolocation"]); await context.setGeolocation({ latitude: 45.7485, longitude: 4.8467 });
        await page.locator("#btnAttach").tap(); await attendre(page, 300);
        await page.locator("#convAttachMenu .attach-item", { hasText: "Localisation" }).tap();
        await attendre(page, 3600); await jeu.enBas(page);
        await prendre({
          id: "MSG-157",
          titre: "Position envoyée en un toucher",
          note: "Géolocalisation fictive accordée au contexte (45,7485 ; 4,8467). Aucune étape entre le toucher sur « Localisation » et l'envoi.",
          zooms: [{ nom: "bulle", titre: "Bulle de position (copie locale)", sel: "#convFpThread .conv-bubble-wrap:last-child", marge: 10 }],
          annotationsAvant: [{ n: 1, sel: "#convFpThread .conv-bubble-wrap:last-child .conv-bubble", texte: "Coordonnées exactes déjà envoyées ; adresse brute ; aucun statut d'envoi." }],
          apres: { css: CSS.feuille, js: (p) => JS.confirmerPosition(p, { prenom: "Inès" }) },
          annotations: [{ n: 1, sel: "#modalContent .btn.primary", texte: "Rien ne part avant « Envoyer ma position » ; la feuille nomme la destinataire et dit la précision." }],
        });
        // Position refusée
        await page.evaluate(() => { navigator.geolocation.getCurrentPosition = function (ok, ko) { setTimeout(() => ko && ko({ code: 1, message: "User denied Geolocation" }), 50); }; });
        await page.locator("#btnAttach").tap(); await attendre(page, 300);
        await page.locator("#convAttachMenu .attach-item", { hasText: "Localisation" }).tap();
        await attendre(page, 500);
        await prendre({
          id: "MSG-158",
          titre: "Position refusée : rien n'est envoyé, rien n'est dit",
          note: "SIMULÉ : getCurrentPosition répond « permission refusée ». Rien n'est envoyé (correct) ; les toasts « 📍 Localisation en cours… » puis « ❌ Impossible d'obtenir la position » sont caché derrière la conversation (pile des toasts en z-index 200, conversation en 1200 — sonde 10).",
          annotationsAvant: [{ n: 1, sel: "#convAttachMenu", texte: "Le menu reste ouvert, aucune explication visible." }],
          apres: { css: CSS.toasts, js: (p) => p.evaluate(() => { const ts = [...document.querySelectorAll("#toastStack .toast")]; const t = ts.pop(); ts.forEach((x) => x.remove()); if (t) t.textContent = "Position bloquée — autorise-la dans les réglages du site pour la partager"; }) },
          annotations: [{ n: 1, sel: "#toastStack .toast", texte: "Message visible au-dessus de la conversation, qui dit quoi faire." }],
          attendre: 100,
        });
        await page.touchscreen.tap(300, 150); await attendre(page, 3200);

        // Galerie des pièces jointes
        await page.locator("#btnAttach").tap(); await attendre(page, 300);
        await page.locator("#convAttachMenu .attach-item", { hasText: "Pièces jointes" }).tap();
        await attendre(page, 800);
        await prendre({ id: "MSG-161", titre: "Galerie « Pièces jointes » de la conversation", racine: "#convFilesPanel", annotationsAvant: [{ n: 1, sel: "#convFilesPanel .conv-fp-head", texte: "Ouverte par l'entrée « Pièces jointes » du menu « + » (lui-même nommé « Pièce jointe »)." }] });
        await page.evaluate(() => closeConvFiles()); await attendre(page, 500);

        // Visionneuse puis Retour système
        await page.locator("#convFpThread img[onclick]").first().scrollIntoViewIfNeeded();
        await page.locator("#convFpThread img[onclick]").first().tap(); await attendre(page, 500);
        await prendre({
          id: "MSG-159",
          titre: "Visionneuse d'image",
          annotationsAvant: [{ n: 1, sel: "#_fiv_close", texte: "Boutons de 38 × 38 px ; aucune entrée d'historique." }],
          apres: { css: CSS.visionneuse },
          annotations: [{ n: 1, sel: "#_fiv_close", texte: "Boutons de 44 px ; la visionneuse se ferme aussi par le Retour du système." }],
        });
        await page.goBack().catch(() => {}); await attendre(page, 700);
        await prendre({
          id: "MSG-160",
          titre: "Retour système, visionneuse ouverte : la conversation s'est fermée derrière l'image",
          annotationsAvant: [{ n: 1, x: 0.5, y: 0.5, texte: "L'image reste au premier plan ; derrière, on est revenu à la liste des conversations." }],
        });
      },
    },

    // ══ 5. Envois en échec : GIF, position, dépôt de photo ════════════════════
    {
      nom: "echecs-pieces",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, context, prendre, serveur, GENS }) {
        await jeu.routes(page);
        await klipyLocal(page);
        await jeu.entrer(page, GENS.ines.nom);
        serveur.pannes.push({ table: "conv_messages", methode: "POST", status: 500, body: { message: "panne du banc" }, fois: 2 });
        await page.locator('.conv-toolbar button[aria-label="Ajouter un GIF"]').tap(); await attendre(page, 1200);
        await page.locator("#gif-panel-msg img").first().tap(); await attendre(page, 1500);
        await context.grantPermissions(["geolocation"]); await context.setGeolocation({ latitude: 45.7485, longitude: 4.8467 });
        serveur.pannes.length = 0;
        serveur.pannes.push({ table: "conv_messages", methode: "POST", status: 500, body: { message: "panne du banc" }, fois: 2 });
        await page.locator("#btnAttach").tap(); await attendre(page, 300);
        await page.locator("#convAttachMenu .attach-item", { hasText: "Localisation" }).tap();
        await attendre(page, 3600);
        serveur.pannes.length = 0;
        await jeu.filPret(page); await jeu.enBas(page);
        const ids = await page.evaluate((id) => getConversations().find((x) => x.id === id).messages.slice(-2).map((m) => m.id), IDS.ines);
        await prendre({
          id: "MSG-163",
          titre: "GIF et position en échec d'envoi : affichés comme envoyés",
          note: "SIMULÉ : le faux serveur répond 500 aux insertions. Aucune des deux lignes n'existe en base, aucune n'est en file ; les bulles portent « ✓ ».",
          annotationsAvant: [
            { n: 1, sel: "#convFpThread .conv-bubble-wrap:nth-last-child(2) .conv-bubble-time", texte: "GIF refusé par le serveur : « ✓ », aucun signe d'échec." },
            { n: 2, sel: "#convFpThread .conv-bubble-wrap:last-child .conv-bubble-time", texte: "Position refusée : idem. Les deux disparaîtront à la prochaine relecture du fil." },
          ],
          apres: { css: CSS.etats, js: (p) => JS.etats(p, { forcerEchec: ids }) },
          annotations: [{ n: 1, sel: ".maq-echec", texte: "Même verdict que le texte : échec visible, relance, file hors ligne." }],
        });
        // Dépôt de photo refusé par le stockage
        const stock = (r) => r.request().method() === "POST" ? r.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ statusCode: "500", error: "Internal", message: "panne du banc" }) }) : r.fallback();
        await page.route(/\/storage\/v1\/object\/attachments\//, stock);
        await page.locator("#btnAttach").tap(); await attendre(page, 300);
        const [fc] = await Promise.all([page.waitForEvent("filechooser", { timeout: 6000 }), page.locator("#convAttachMenu .attach-item", { hasText: "Photo" }).tap()]);
        await fc.setFiles(path.join(MEDIAS, "photo-carre.jpg"));
        await attendre(page, 1200); await jeu.filPret(page); await jeu.enBas(page);
        await prendre({
          id: "MSG-164",
          titre: "Dépôt d'une photo refusé par le stockage : échec dit, relance possible",
          note: "SIMULÉ : le dépôt Storage répond 500. Le toast « ⚠️ Pièce jointe non envoyée — touche « réessayer » » est émis mais caché derrière la conversation (pile des toasts en z-index 200, conversation en 1200 — sonde 10) ; la relance repart de la copie locale.",
          annotationsAvant: [{ n: 1, sel: "#convFpThread [data-msgst] span[onclick]", texte: "Le verdict existe (à conserver) ; son affichage a le défaut de MSG-C62 : « ✓ réessayer », 47 × 15 px." }],
          attendre: 100,
        });
        await page.unroute(/\/storage\/v1\/object\/attachments\//, stock);
      },
    },

    // ══ 6. Enregistrement vocal « Inès » (micro simulé) ═══════════════════════
    {
      nom: "vocal",
      demarrage: compte(),
      vues: ["m390", "m360"],
      async derouler({ page, prendre, banc, GENS, vue }) {
        await jeu.routes(page);
        await jeu.entrer(page, GENS.ines.nom);
        await page.locator("#convFpInput").tap(); await attendre(page, 200);
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        await fauxMicro(page, "ok", 0);
        const main = await banc.appuiMaintenu(page, "#btnVoice");
        await attendre(page, 2600);
        await prendre({
          id: "MSG-170",
          titre: "Enregistrement vocal en cours (doigt maintenu)",
          note: "SIMULÉ : le micro est remplacé par un flux audio de synthèse (le banc n'a pas de micro) ; le conteneur est forcé en webm, le Chromium du banc n'encodant pas l'AAC.",
          zooms: [{ nom: "bas", titre: "Barre d'enregistrement et barre de saisie", sel: "#voiceRecordBar", marge: 70 }],
          annotationsAvant: [
            { n: 1, sel: "#voiceRecordBar", texte: "« Enregistrement en cours… » : rien ne dit que relâcher envoie." },
            { n: 2, sel: "#voiceRecordBar button", texte: "✕ : 18 × 30 px, sans nom ; à toucher d'un second doigt pendant que le premier tient le micro." },
            { n: 3, sel: "#btnVoice", texte: "Micro sans état visuel (la classe .record-active n'est jamais posée) ; glisser hors du bouton puis relâcher envoie." },
          ],
          apres: { css: CSS.vocal, js: (p) => JS.vocal(p), zooms: [{ nom: "bas", titre: "Barre d'enregistrement", sel: "#conv-fullpage .conv-toolbar", marge: 50 }] },
          annotations: [
            { n: 1, sel: ".maq-rec-c", texte: "La barre de saisie devient la barre d'enregistrement et annonce les deux issues." },
            { n: 2, sel: ".maq-rec-x", texte: "« Annuler » : 44 px, nommé." },
            { n: 3, sel: "#btnVoice", texte: "Micro en état actif ; glisser à gauche de plus de 80 px puis relâcher annule." },
          ],
          attendre: 100,
        });
        await main.relacher();
        await attendre(page, 1800); await jeu.enBas(page);
        if (vue === "m390") {
          await prendre({
            id: "MSG-171",
            titre: "Vocal que je viens d'envoyer",
            zooms: [{ nom: "vocal", titre: "Mon vocal", sel: "#convFpThread .conv-bubble-wrap:last-child", marge: 10 }],
            annotationsAvant: [{ n: 1, sel: "#convFpThread .conv-bubble-wrap:last-child .conv-bubble", texte: "Le vocal est parti, mais sa bulle est blanche sur fond clair : on ne voit que l'heure." }],
            apres: { css: CSS.bulles },
            annotations: [{ n: 1, sel: "#convFpThread .conv-bubble-wrap:last-child .conv-bubble", texte: "Bulle violette conservée : lecture, durée et vitesse lisibles." }],
          });
          // Toucher bref : l'enregistrement démarre après le relâchement et continue
          await page.locator("#btnVoice").tap();
          await attendre(page, 2400);
          await prendre({
            id: "MSG-172",
            titre: "Après un simple toucher : l'enregistrement tourne, personne ne tient le bouton",
            note: "SIMULÉ (micro de synthèse). 2,4 s après un toucher de quelques millisecondes : `_isRecording` est vrai, le minuteur avance. Le prochain toucher sur le micro ENVOIE l'enregistrement (sonde 05).",
            annotationsAvant: [
              { n: 1, sel: "#voiceRecordBar", texte: "Enregistrement actif sans doigt posé : le micro s'est ouvert après le relâchement." },
              { n: 2, sel: "#btnVoice", texte: "Retoucher le micro « pour l'éteindre » envoie le son capté." },
            ],
            apres: {
              css: CSS.toasts,
              js: (p) => p.evaluate(() => { document.getElementById("voiceRecordBar").style.display = "none"; const t = document.createElement("div"); t.className = "toast"; t.textContent = "Maintiens le micro pour enregistrer"; document.getElementById("toastStack").appendChild(t); }),
            },
            annotations: [{ n: 1, sel: "#toastStack .toast", texte: "Doigt levé avant l'ouverture du micro : le flux est refermé, rien n'est enregistré, une consigne s'affiche." }],
            attendre: 100,
          });
          await page.evaluate(() => cancelVoiceRecord()); await attendre(page, 400);
          // Micro refusé
          await fauxMicro(page, "refus", 0);
          const m2 = await banc.appuiMaintenu(page, "#btnVoice"); await attendre(page, 600); await m2.relacher(); await attendre(page, 300);
          await prendre({
            id: "MSG-175",
            titre: "Micro refusé",
            note: "SIMULÉ : getUserMedia rejette « NotAllowedError ».",
            annotationsAvant: [{ n: 1, sel: "#btnVoice", texte: "Le refus est annoncé par le toast « 🎙️ Micro non disponible (autorisation refusée ?) », caché derrière la conversation (pile des toasts en z-index 200, conversation en 1200 — sonde 10) : le micro semble ne rien faire." }],
            apres: { css: CSS.toasts, js: (p) => p.evaluate(() => { const t = document.querySelector("#toastStack .toast"); if (t) t.textContent = "Micro bloqué — autorise-le dans les réglages du site pour envoyer un vocal"; }) },
            annotations: [{ n: 1, sel: "#toastStack .toast", texte: "La cause est affirmée et le geste à faire est dit." }],
            attendre: 100,
          });
        }
      },
    },

    // ══ 7. Lecture d'un vocal « Léa » ═════════════════════════════════════════
    {
      nom: "vocal-lecture",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre, GENS }) {
        await jeu.routes(page, { dureeVocal: 20 });
        await jeu.entrer(page, GENS.lea.nom);
        await caler(page, "m_lea_10", 120);
        await page.locator('.conv-bubble-wrap[data-mid="m_lea_10"] button').first().tap();
        await attendre(page, 1500);
        await page.locator('.conv-bubble-wrap[data-mid="m_lea_10"] .voice-speed-btn').tap();
        await attendre(page, 500);
        await prendre({
          id: "MSG-176",
          titre: "Vocal reçu en lecture, vitesse 1,5×",
          note: "Fichier WAV généré (20 s) servi par une route du scénario. La vitesse choisie s'applique à tous les vocaux.",
          zooms: [{ nom: "lecteur", titre: "Lecteur en lecture", sel: '.conv-bubble-wrap[data-mid="m_lea_10"]', marge: 10 }],
          annotationsAvant: [
            { n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_10"] button', texte: "Pause : 34 × 34 px, nommée « ⏸ »." },
            { n: 2, sel: '.conv-bubble-wrap[data-mid="m_lea_10"] .voice-speed-btn', texte: "Vitesse : 24 × 18 px." },
          ],
          apres: { css: CSS.bulles },
          annotations: [
            { n: 1, sel: '.conv-bubble-wrap[data-mid="m_lea_10"] button', texte: "44 px (nom : « Mettre en pause le message vocal »)." },
            { n: 2, sel: '.conv-bubble-wrap[data-mid="m_lea_10"] .voice-speed-btn', texte: "44 × 36 px (nom : « Vitesse de lecture : 1,5× »)." },
          ],
          attendre: 100,
        });
      },
    },

    // ══ 8. Longue conversation « Malik » (230 messages) ═══════════════════════
    {
      nom: "longue",
      demarrage: compte(),
      vues: ["m390", "m360"],
      async derouler({ page, prendre, GENS, vue }) {
        await jeu.routes(page);
        await jeu.entrer(page, GENS.malik.nom);
        await prendre({
          id: "MSG-180",
          titre: "Longue conversation (230 messages) — à l'ouverture",
          note: "40 bulles rendues, fil calé sur le dernier message (0 px d'écart).",
          annotationsAvant: [{ n: 1, sel: "#convFpThread", texte: "Sept messages courts par écran à 390 × 844 (cinq à 360 × 640) : une heure et 12 à 20 px de marge par bulle." }],
          apres: { css: CSS.groupes, js: JS.groupes },
          annotations: [{ n: 1, sel: "#convFpThread", texte: "Heure en fin de suite seulement : deux à trois messages de plus par écran." }],
        });
        if (vue !== "m390") return;
        // Galerie vide
        await page.locator("#btnAttach").tap(); await attendre(page, 300);
        await page.locator("#convAttachMenu .attach-item", { hasText: "Pièces jointes" }).tap();
        await attendre(page, 700);
        await prendre({ id: "MSG-162", titre: "Galerie « Pièces jointes » vide", racine: "#convFilesPanel" });
        await page.evaluate(() => closeConvFiles()); await attendre(page, 500);

        // Remonter : chargement de la page précédente
        await page.evaluate(() => { const t = document.getElementById("convFpThread"); t.scrollTop = 40; });
        await attendre(page, 500);
        await prendre({
          id: "MSG-181",
          titre: "Remontée : 40 messages plus anciens chargés, position conservée",
          note: "Après le chargement, le premier message visible est le même qu'avant (n° 190-191) ; la ligne « ⏳ Remonte pour charger… » se trouve tout en haut du fil.",
        });
        // Tout charger, puis lire au milieu
        for (let i = 0; i < 8; i++) { await page.evaluate(() => { const t = document.getElementById("convFpThread"); t.scrollTop = 30; }); await attendre(page, 220); }
        await page.evaluate(() => { document.querySelector('.conv-bubble-wrap[data-mid="m_mal_200"]').scrollIntoView({ block: "center" }); });
        await attendre(page, 400);
        await prendre({
          id: "MSG-183",
          titre: "Remonté de 30 messages : aucun retour rapide en bas",
          annotationsAvant: [{ n: 1, sel: "#conv-fullpage .conv-toolbar", texte: "Rien pour revenir aux derniers messages : il faut tout redescendre au doigt (jusqu'à 19 000 px pour 230 messages)." }],
          apres: { css: CSS.bas, js: (p) => JS.bas(p, {}) },
          annotations: [{ n: 1, sel: ".maq-bas", texte: "Bouton « ↓ » de 44 px dès que le fil est remonté de plus d'un écran." }],
        });
        await page.evaluate(() => { document.querySelector('.conv-bubble-wrap[data-mid="m_mal_120"]').scrollIntoView({ block: "center" }); });
        await attendre(page, 400);
        await entrant(page, IDS.longue, GENS.malik.id, "m_in_001", { type: "text", text: "Finalement je peux venir plus tôt." });
        await attendre(page, 600);
        await prendre({
          id: "MSG-184",
          titre: "Je lisais le message n° 120 ; un message arrive : l'écran a sauté tout en bas",
          note: "SIMULÉ : le message entrant est injecté par `_handleIncomingConvMessage` (canal temps réel coupé dans le banc). Avant l'arrivée, le fil montrait les messages n° 116 à 123.",
          annotationsAvant: [{ n: 1, sel: "#convFpThread .conv-bubble-wrap:last-child", texte: "Saut de plus de 10 000 px : le point de lecture est perdu." }],
          apres: { css: CSS.bas, js: async (p) => { await p.evaluate(() => { document.querySelector('.conv-bubble-wrap[data-mid="m_mal_120"]').scrollIntoView({ block: "center" }); }); await p.waitForTimeout(300); await JS.bas(p, { pastille: true }); } },
          annotations: [{ n: 1, sel: ".maq-nouveau", texte: "La lecture reste où elle est ; une pastille annonce le message et y mène d'un toucher." }],
        });
        // « En train d'écrire » (forcé)
        await jeu.enBas(page);
        await page.evaluate(() => { const bar = document.getElementById("convTypingBar"); bar.textContent = "Malik Benali est en train d'écrire…"; bar.style.display = "block"; });
        await attendre(page, 200);
        await prendre({ id: "MSG-132", titre: "« En train d'écrire »", note: "SIMULÉ : la barre est affichée par le scénario (son canal temps réel est coupé dans le banc).", zooms: [{ nom: "barre", titre: "Indicateur", sel: "#convTypingBar", marge: 6 }] });
        await page.evaluate(() => { document.getElementById("convTypingBar").style.display = "none"; });
        // Citation d'un message hors de la page affichée
        await page.evaluate(() => closeConversation()); await attendre(page, 400);
        await entrant(page, IDS.longue, GENS.malik.id, "m_in_003", { type: "text", text: "Tu te souviens ?", rt: { id: "m_mal_010", t: "n° 010 — Tu grimpes ce soir ?", n: "Malik Benali" } });
        await jeu.entrer(page, GENS.malik.nom);
        await page.locator(".conv-reply-quote").last().tap();
        await attendre(page, 500);
        await prendre({
          id: "MSG-185",
          titre: "Toucher la citation d'un message ancien : « Message introuvable »",
          note: "SIMULÉ (message entrant injecté). Le message cité (n° 010) existe, mais seuls les 40 derniers sont rendus.",
          annotationsAvant: [{ n: 1, sel: ".conv-reply-quote", texte: "Le toucher ne fait rien de visible : le toast « Message introuvable (peut-être plus ancien) » est caché derrière la conversation." }],
          attendre: 100,
        });
      },
    },

    // ══ 9. Groupe ═════════════════════════════════════════════════════════════
    {
      nom: "groupe",
      demarrage: compte(),
      vues: ["m390", "m360", "m320"],
      async derouler({ page, prendre, vue }) {
        await jeu.routes(page);
        await jeu.entrer(page, "Atelier cordes du jeudi");
        await prendre({
          id: "MSG-190",
          titre: "Conversation de groupe",
          zooms: [{ nom: "entete", titre: "En-tête du groupe", sel: "#convFpHead", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: '#convFpHead button[title="Membres"]', texte: "« Membres » et « Paramètres » : 34 × 34 px, sans nom accessible." },
            { n: 2, sel: "#convFpHead .conv-fp-head-avatar", texte: "Avatar et titre annoncés « bouton » alors qu'ils ne font rien (onclick vide)." },
          ],
          apres: { css: CSS.entete, js: (p) => JS.entete(p, { sous: "5 membres · Musique" }) },
          annotations: [{ n: 1, sel: '#convFpHead button[title="Membres"]', texte: "44 × 44 px, nommés « Membres du groupe » et « Paramètres de la conversation »." }],
        });
        if (vue !== "m390") return;
        await page.locator("#convFpInput").tap();
        await page.keyboard.type("Merci @Ma");
        await attendre(page, 500);
        await prendre({ id: "MSG-191", titre: "Mention @ dans un groupe", zooms: [{ nom: "liste", titre: "Liste des membres proposés", sel: "#convMentionBox", marge: 6 }] });
      },
    },

    // ══ 10. Nom très long, conversation vide, discussion d'activité ═══════════
    {
      nom: "variantes",
      demarrage: compte(),
      vues: ["m390", "m360", "m320"],
      async derouler({ page, prendre, GENS, vue }) {
        await jeu.routes(page);
        await jeu.entrer(page, "Marie-Charlotte");
        await prendre({ id: "MSG-192", titre: "Interlocutrice au nom très long", zooms: [{ nom: "entete", titre: "En-tête", sel: "#convFpHead", marge: 0 }] });
        await page.evaluate(() => closeConversation()); await attendre(page, 450);
        if (vue === "m320") return;
        await jeu.entrer(page, GENS.tom.nom);
        await prendre({ id: "MSG-193", titre: "Conversation sans message" });
        await page.evaluate(() => closeConversation()); await attendre(page, 450);
        if (vue !== "m390") return;
        await jeu.entrer(page, "Bœuf acoustique");
        await prendre({
          id: "MSG-194",
          titre: "Discussion d'une activité",
          zooms: [{ nom: "entete", titre: "En-tête", sel: "#convFpHead", marge: 0 }],
          annotationsAvant: [{ n: 1, sel: "#convFpHead .conv-fp-head-info", texte: "Rien n'ouvre la fiche de l'activité (date, lieu) ; le titre est coupé." }],
          apres: { css: CSS.entete, js: (p) => JS.entete(p, { sous: "Activité · 3 participants — voir la fiche ›", activite: true }) },
          annotations: [{ n: 1, sel: "#convFpHead .conv-fp-passion", texte: "Le sous-titre ouvre la fiche de l'activité (corail : passage au réel)." }],
        });
      },
    },

    // ══ 11. Proposer un moment IRL ════════════════════════════════════════════
    {
      nom: "irl",
      demarrage: compte({ sansAides: false }),
      vues: ["m390", "m360"],
      async derouler({ page, prendre, GENS, vue }) {
        await jeu.routes(page, { irl: true });
        await jeu.entrer(page, GENS.ines.nom);
        await attendre(page, 900);
        await prendre({
          id: "MSG-195",
          titre: "En-tête avec « Proposer un moment IRL » et son aide contextuelle",
          note: "SIMULÉ : la RPC `irl_interaction_allowed` (absente du faux serveur) est répondue « true » par une route. Aide `conversation_irl` affichée (première ouverture).",
          zooms: [{ nom: "entete", titre: "En-tête", sel: "#convFpHead", marge: 0 }],
          annotationsAvant: [{ n: 1, sel: "#convFpHead [data-irl-proposal-action]", texte: "44 × 44 px, nommé — mais violet, et différent de l'entrée « Proposer un IRL » du menu « + »." }],
          apres: { css: CSS.irl + CSS.entete, js: (p) => JS.entete(p, { sous: "Photographie" }) },
          annotations: [{ n: 1, sel: "#convFpHead [data-irl-proposal-action]", texte: "Teinte corail (passage au réel), même nom et même chemin que l'entrée du menu « + »." }],
        });
        if (vue !== "m390") return;
        await page.evaluate(() => { try { fermerHint(); } catch (e) {} });
        await page.locator("#btnAttach").tap(); await attendre(page, 300);
        await page.locator("#v6cProposerIrl").tap();
        await attendre(page, 1500);
        await prendre({ id: "MSG-196", titre: "« + » → Proposer un IRL : le formulaire d'activité s'ouvre, la conversation est fermée", note: "Rien n'est envoyé à l'interlocutrice ; le bouton d'en-tête ouvre le même formulaire sans préremplissage." });
      },
    },
    {
      nom: "irl-refuse",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre, GENS }) {
        await jeu.routes(page);
        await page.route(/\/rest\/v1\/rpc\/irl_interaction_allowed/, (r) => r.request().method() === "OPTIONS" ? r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } }) : r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "false" }));
        await jeu.entrer(page, GENS.ines.nom);
        await attendre(page, 900);
        await page.locator("#btnAttach").tap(); await attendre(page, 400);
        await prendre({
          id: "MSG-197",
          titre: "Verdict serveur « non » : le bouton d'en-tête est absent, l'entrée du menu reste",
          note: "SIMULÉ : la RPC `irl_interaction_allowed` répond « false ».",
          annotationsAvant: [
            { n: 1, sel: "#convFpHead .conv-actions", texte: "Pas de bouton IRL : le garde-fou serveur (âge déclaré, blocage) a joué." },
            { n: 2, sel: "#v6cProposerIrl", texte: "La même action reste offerte ici, sans ce verdict." },
          ],
        });
      },
    },

    // ══ 12. Fond, recherche, retour système ═══════════════════════════════════
    {
      nom: "fond-retour",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre, GENS }) {
        await jeu.routes(page);
        await jeu.entrer(page, GENS.ines.nom);
        await page.locator('#convFpHead button[title="Paramètres"]').tap(); await attendre(page, 500);
        await page.locator("#convSettingsContent .csetting-item", { hasText: "Fond de conversation" }).tap(); await attendre(page, 500);
        await page.locator("#modalContent div[onclick^='_setConvBg']", { hasText: "Nuit" }).tap(); await attendre(page, 3400);
        await jeu.enBas(page);
        await prendre({
          id: "MSG-198",
          titre: "Fil sur le fond « Nuit »",
          annotationsAvant: [{ n: 1, sel: "#convFpThread .conv-bubble-wrap:last-child .conv-bubble-time", texte: "Heures et séparateurs en gris moyen sur fond presque noir." }],
          apres: { css: CSS.sombre },
          annotations: [{ n: 1, sel: "#convFpThread .conv-bubble-wrap:last-child .conv-bubble-time", texte: "À défaut de remplacer les fonds sombres par des lavis clairs : heures et séparateurs éclaircis." }],
        });
        await page.evaluate((id) => { _setConvBg(id, 0); }, IDS.ines); await attendre(page, 3200);
        // Recherche dans la conversation (invite native remplacée)
        await page.evaluate(() => { window.prompt = () => "labo"; });
        await page.locator('#convFpHead button[title="Paramètres"]').tap(); await attendre(page, 500);
        await page.locator("#convSettingsContent .csetting-item", { hasText: "Rechercher dans la conversation" }).tap(); await attendre(page, 600);
        await prendre({ id: "MSG-209", titre: "Résultats d'une recherche dans la conversation", note: "SIMULÉ : l'invite native `prompt()` est remplacée par le scénario (réponse « labo »). Le fil ne montre plus que les messages trouvés, sans leurs voisins." });
        await page.locator("#convFpThread > div").first().tap(); await attendre(page, 300);
        // Panneau emoji ouvert + Retour système
        await page.locator("#btnEmoji").tap(); await attendre(page, 400);
        await page.goBack().catch(() => {}); await attendre(page, 700);
        await prendre({
          id: "MSG-202",
          titre: "Retour système, panneau emoji ouvert : le panneau reste sur la liste",
          annotationsAvant: [{ n: 1, sel: "#convEmojiPanel", texte: "La conversation est fermée ; son panneau emoji (position fixe, hors du panneau de conversation) flotte sur la liste." }],
        });
      },
    },

    // ══ 13. Blocage ═══════════════════════════════════════════════════════════
    {
      nom: "blocage",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre, serveur, GENS, MOI }) {
        await jeu.routes(page);
        await jeu.entrer(page, GENS.ines.nom);
        serveur.t.blocks.push({ blocker_id: GENS.ines.id, blocked_id: MOI.id, created_at: new Date().toISOString() });
        await page.locator("#convFpInput").fill("Tu es là ?");
        await page.locator("#convFpSendBtn").click();
        await attendre(page, 1500); await jeu.enBas(page);
        await prendre({
          id: "MSG-203",
          titre: "L'autre m'a bloqué : « ✓ réessayer », sans explication",
          note: "SIMULÉ : une ligne `blocks` (Inès → Camille) est posée dans le faux serveur ; l'insertion est refusée (403). Toucher « réessayer » redonne le même état.",
          zooms: [{ nom: "statut", titre: "Statut du message refusé", sel: "#convFpThread .conv-bubble-wrap:last-child", marge: 10 }],
          annotationsAvant: [{ n: 1, sel: "#convFpThread [data-msgst] span[onclick]", texte: "Refus définitif présenté comme un échec passager : la relance échouera toujours." }],
          apres: { css: CSS.etats, js: (p) => JS.etats(p, { definitif: true }) },
          annotations: [{ n: 1, sel: ".maq-etat", texte: "« Non distribué », sans relance et sans révéler le blocage." }],
        });
        serveur.t.blocks.length = 0;
        page.once("dialog", (d) => d.accept());
        await page.locator('#convFpHead button[title="Paramètres"]').tap(); await attendre(page, 500);
        await page.locator("#convSettingsContent .csetting-item", { hasText: "Bloquer" }).tap(); await attendre(page, 1500);
        await fermerModale(page);
        await page.evaluate((id) => openConversation(id), IDS.ines);
        await attendre(page, 1300);
        await prendre({
          id: "MSG-204",
          titre: "Conversation avec un compte que j'ai bloqué",
          note: "Blocage fait par les vrais gestes (Paramètres → Bloquer, fenêtre native acceptée) ; la conversation, retirée de la liste, est rouverte par `openConversation` comme le ferait une notification ou le transfert.",
          annotationsAvant: [
            { n: 1, sel: "#convFpThread", texte: "Seuls mes messages restent : le fil paraît amputé, sans explication." },
            { n: 2, sel: "#convFpInput", texte: "Champ actif : ce que j'écrirai sera refusé." },
          ],
          apres: { css: CSS.bandeau, js: (p) => JS.bandeau(p, { texte: "Tu as bloqué Inès Moreau. Ses messages sont masqués.", bouton: "Débloquer" }) },
          annotations: [{ n: 1, sel: ".maq-bandeau", texte: "L'état est dit, avec la sortie (« Débloquer ») à la place du champ." }],
        });
      },
    },

    // ══ 14. Conversation d'exemple (mode démonstration) ═══════════════════════
    {
      nom: "exemple",
      demarrage: { mode: "demo" },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => goTo("messages"));
        await page.waitForSelector("#messageList .msg-card", { timeout: 15000 });
        await attendre(page, 600);
        await page.locator("#messageList .msg-card").first().click();
        await page.waitForFunction(() => document.getElementById("conv-fullpage").classList.contains("active"), null, { timeout: 8000 });
        await attendre(page, 1200);
        await page.locator("#convFpInput").fill("Bonjour !");
        await page.locator("#convFpSendBtn").click();
        await attendre(page, 400);
        await prendre({
          id: "MSG-206",
          titre: "Conversation d'exemple : rien ne le dit, et l'envoi ne fait rien de visible",
          note: "Mode démonstration du banc (aucune session). L'appui sur Envoyer émet le toast « Conversation de démonstration — écris à un vrai membre depuis son profil », caché derrière la conversation (pile des toasts en z-index 200, conversation en 1200 — sonde 10) ; le texte reste dans le champ, le micro fait de même (sonde 09).",
          annotationsAvant: [
            { n: 1, sel: "#convFpHead .conv-fp-passion", texte: "« Voir le profil » : l'étiquette « Exemple PASSIO » de la liste a disparu." },
            { n: 2, sel: "#convFpInput", texte: "Barre de saisie complète et active." },
            { n: 3, sel: "#convFpSendBtn", texte: "Envoyer : refus émis mais invisible — rien ne se passe." },
          ],
          apres: { css: CSS.bandeau, js: async (p) => { await p.evaluate(() => { document.querySelectorAll("#toastStack .toast").forEach((t) => t.remove()); }); await JS.bandeau(p, { texte: "Conversation d'exemple — pour écrire à quelqu'un, ouvre son profil.", bouton: "Découvrir", sous: "Exemple PASSIO · réponse désactivée" }); } },
          annotations: [
            { n: 1, sel: "#convFpHead .conv-fp-passion", texte: "L'en-tête reprend l'étiquette de la liste." },
            { n: 2, sel: ".maq-bandeau", texte: "La barre de saisie laisse place à l'explication et à la sortie." },
          ],
          attendre: 100,
        });
      },
    },

    // ══ 15. Panneau emoji quand emoji-misc.js arrive après le minuteur ════════
    {
      nom: "emoji-lent",
      // `pwa-landing.js` est le dernier script AVANT le balisage du panneau : le retarder
      // garantit que le minuteur de 100 ms d'app-09 passe avant que la grille existe.
      demarrage: compte({ avantBoot: async (page) => { await page.route("**/js/pwa-landing.js", async (route) => { await new Promise((r) => setTimeout(r, 700)); return route.fallback(); }); } }),
      vues: ["m390"],
      async derouler({ page, prendre, GENS }) {
        await jeu.routes(page);
        await jeu.entrer(page, GENS.ines.nom);
        await page.locator("#btnEmoji").tap(); await attendre(page, 500);
        await prendre({
          id: "MSG-152",
          titre: "Panneau emoji quand le minuteur d'app-09 passe avant le balisage du panneau : caractères cassés",
          note: "SIMULÉ, PAGE DE DÉVELOPPEMENT : un script placé avant le panneau (js/pwa-landing.js) est retardé de 0,7 s. Le remplissage correct, programmé 100 ms après app-09, ne trouve pas encore la grille ; seule s'exécute ensuite la boucle de js/emoji-misc.js, qui découpe chaque emoji en deux moitiés. Dans la page de PRODUCTION (scripts injectés après l'analyse du document, emoji-misc.js inclus dans le 9ᵉ script), le minuteur repasse après la boucle et la grille est saine (MSG-151).",
          zooms: [{ nom: "grille", titre: "Grille", sel: "#emojiGrid", marge: 0 }],
          annotationsAvant: [{ n: 1, sel: "#emojiGrid", texte: "327 cellules de 31 × 12 px : chaque emoji est coupé en deux demi-caractères (« � »)." }],
        });
      },
    },
  ],
};
