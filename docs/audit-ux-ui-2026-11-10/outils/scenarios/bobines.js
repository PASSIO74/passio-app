// ═══════════════════════════════════════════════════════════════════════════
// SCÉNARIOS DE CAPTURE — DOMAINE « BOBINES, STORIES ET LIVE » (BOB-…)
//
// Contournements du banc, déclarés ici une fois :
//  ① VIDÉO. Les vidéos du jeu portent le suffixe `#videos/` (voir jeu/bobines.js) :
//     sans lui le client les prend pour des photos. Le Chromium du banc lit
//     `boucle.webm` (un soleil sur un dégradé) ; le H.264 n'est pas éprouvé.
//     Les bobines d'EXEMPLE du socle (vidéos distantes) sont remplacées par la
//     même boucle locale.
//  ② LIVE. Aucun flux WebRTC n'existe dans le banc : la visionneuse spectateur
//     reste sur « Connexion au direct… ». La bulle est réelle (table
//     `video_lives` du faux serveur).
//  ③ TOAST figé au besoin (`.toast{animation:none}`), comme dans `partage`.
//  ④ Les maquettes `js` rejouent le scénario jusqu'à leur `prendre` : chaque
//     maquette scriptée est donc placée en tête de son scénario quand c'est possible.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/bobines");

const peupler = (opts) => (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx, opts || {}); };
const compte = (opts, extra) => Object.assign({ mode: "compte", peupler: peupler(opts) }, extra || {});
const MEDIA = "/docs/audit-ux-ui-2026-11-10/outils/medias/";

// Ouvre le lecteur par la PREMIÈRE vignette du rail « Bobines à découvrir » (vrai geste).
async function ouvrirParLeRail(page) {
  await page.waitForTimeout(1800);
  await page.evaluate(() => { const b = document.querySelector('[data-v2-module="reel"]'); if (b) b.scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(500);
  await page.locator('[data-v2-module="reel"] .v2-reel-tile').first().click();
  await page.waitForTimeout(1600);
}
// Amène une bobine précise à l'écran (défilement du lecteur, comme un glisser).
async function allerA(page, id) {
  await page.evaluate((id) => { const it = Array.from(document.querySelectorAll("#reelsList .reel-item")).find((e) => e.getAttribute("data-post-id") === id); if (it) it.scrollIntoView(); }, id);
  await page.waitForTimeout(1500);
}
const item = (id) => `#reelsList .reel-item[data-post-id="${id}"]`;

// ── Maquettes ──────────────────────────────────────────────────────────────
const SVG_PLUS = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>';
const CSS_LECTEUR = `
  .reels-close{width:44px!important;height:44px!important;}
  .reel-tag-mood{display:none!important;}
  :root.passio-ui-5 .reel-item[data-v5] .v5-actions{display:grid!important;grid-template-columns:1fr 1fr;gap:6px!important;overflow:visible!important;}
  :root.passio-ui-5 .reel-item[data-v5] .v5-chip{white-space:normal!important;text-align:center;padding:8px 8px!important;font-size:13px!important;line-height:1.15!important;}
  :root.passio-ui-5 .reel-item[data-v5] .v5-chip.mq-irl{border-color:var(--v2-coral,#FF6B57)!important;box-shadow:inset 0 0 0 1px var(--v2-coral,#FF6B57);}
  .mq-plus .reel-action-icon{display:flex;align-items:center;justify-content:center;color:#fff;}
`;
// Retouches communes à toutes les bobines rendues : envie sur la ligne de la passion,
// compte de commentaires, « ⋯ » dans le rail, sorties IRL marquées.
async function maquetteLecteur(page) {
  await page.addStyleTag({ content: CSS_LECTEUR });
  await page.evaluate((svg) => {
    document.querySelectorAll("#reelsList .reel-item").forEach((it) => {
      const p = findPostAnywhere(it.getAttribute("data-post-id")) || {};
      const pass = it.querySelector(".reel-passion");
      if (pass && !pass.dataset.mq) { pass.dataset.mq = "1"; pass.textContent = pass.textContent.trim() + " · " + moodShortLabel(p.mood); pass.setAttribute("data-mq", "passion"); }
      const lab = it.querySelectorAll(".reel-action-btn .reel-action-label")[1];
      if (lab) lab.textContent = String(typeof nbCommentairesPost === "function" ? nbCommentairesPost(p) : (p.comments || []).length);
      const rail = it.querySelector(".reel-actions");
      if (rail && !rail.querySelector(".mq-plus")) {
        const b = document.createElement("button"); b.className = "reel-action-btn mq-plus"; b.setAttribute("aria-label", "Plus d'options"); b.setAttribute("data-mq", "plus");
        b.innerHTML = '<span class="reel-action-icon">' + svg + '</span><span class="reel-action-label">Plus</span>';
        rail.appendChild(b);
      }
      it.querySelectorAll(".v5-chip").forEach((c) => { if (/près de moi|sortie/.test(c.textContent)) c.classList.add("mq-irl"); });
    });
  }, SVG_PLUS);
}

const CSS_COMMENTAIRES = `
  .reel-comments-close{width:44px!important;height:44px!important;font-size:0!important;opacity:1!important;border-radius:12px;}
  .reel-comments-close::before{content:"Fermer";font-size:15px;font-weight:700;color:var(--accent);}
  .reel-comments-close{width:auto!important;padding:0 6px;}
  .reel-comments-send{width:44px!important;height:44px!important;min-width:44px;border-radius:50%!important;background:var(--accent)!important;color:#fff!important;font-size:20px!important;}
  .reel-comment-footer{gap:4px!important;}
  .reel-comment-footer > span{display:inline-flex!important;align-items:center;justify-content:center;min-width:44px;min-height:44px;margin:-12px 0;}
`;

const CSS_STORY = `
  .story-progress{background:rgba(255,255,255,0.35)!important;height:3px;}
  .story-viewer-close{width:44px!important;height:44px!important;margin-left:0!important;font-size:20px!important;}
  #storyReportBtn{margin-left:auto!important;width:44px;height:44px;}
  .mq-repondre{position:absolute;left:22px;right:22px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:4;display:flex;gap:10px;align-items:center;}
  .mq-repondre button{flex:1;min-height:48px;border-radius:999px;border:1px solid rgba(255,255,255,0.55);background:rgba(255,255,255,0.08);color:#fff;font:inherit;font-size:15px;text-align:left;padding:0 18px;}
`;
async function maquetteStory(page, opts) {
  await page.addStyleTag({ content: CSS_STORY });
  await page.evaluate((o) => {
    const t = document.getElementById("storyTime"); if (t) { t.textContent = o.temps; t.setAttribute("data-mq", "temps"); t.style.opacity = "0.85"; }
    if (o.repondre) {
      const d = document.createElement("div"); d.className = "mq-repondre"; d.setAttribute("data-mq", "repondre");
      d.innerHTML = '<button type="button">' + o.repondre + "</button>";
      document.getElementById("storyViewer").appendChild(d);
    }
  }, opts);
}

const CSS_LIVE = `
  .vlive-topbar{flex-wrap:wrap!important;row-gap:6px!important;}
  .vlive-badge,.vlive-chip{white-space:nowrap!important;}
  .vlive-name{order:9;flex:1 1 calc(100% - 120px)!important;min-width:0;font-size:16px!important;font-weight:800!important;}
  .vlive-follow{order:10;min-height:44px!important;padding:0 16px!important;}
  .vlive-icon-btn{width:44px!important;height:44px!important;}
  .vlive-icon-btn{margin-left:auto;}
  .vlive-title-pill{top:calc(118px + env(safe-area-inset-top))!important;}
`;

module.exports = {
  domaine: "bobines",
  scenarios: [
    // ───────────────────────────── PORTES D'ENTRÉE ─────────────────────────────
    {
      nom: "portes",
      demarrage: compte({ live: true }),
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(2000);
        await prendre({
          id: "BOB-001", titre: "Fil — rangée de stories : ma story, un live, des stories non vues et vues",
          note: "Live réel du faux serveur (table video_lives). Libellés à 9 px : déjà relevé (FIL-C14).",
          zooms: [{ nom: "stories", titre: "Rangée de stories", sel: "#storiesRowFeed", marge: 6 }],
          annotationsAvant: [
            { n: 1, sel: "#storiesRowFeed .story-item:nth-child(2) .story-ring", texte: "Live : anneau rouge et « 🔴 Tom » — même gabarit qu'une story" },
            { n: 2, sel: "#storiesRowFeed .story-item:last-child .story-ring", texte: "Story vue : anneau gris, rejetée en fin de rangée" },
          ],
        });
        await page.evaluate(() => { const b = document.querySelector('[data-v2-module="reel"]'); if (b) b.scrollIntoView({ block: "center" }); });
        await page.waitForTimeout(900);
        await prendre({
          id: "BOB-002", titre: "Fil — rail « Bobines à découvrir » : les bobines vidéo n'ont aucune vignette",
          note: "Les vidéos des comptes n'ont ni `poster` ni image : la tuile retombe sur un aplat violet (`v2-reel-thumb-empty`). La 3ᵉ tuile (bobine PHOTO) montre sa photo.",
          zooms: [{ nom: "rail", titre: "Le rail", sel: '[data-v2-module="reel"]', marge: 4 }],
          annotationsAvant: [
            { n: 1, sel: '[data-v2-module="reel"] .v2-reel-tile:nth-child(1) .v2-reel-thumb', texte: "Aucune image : rien ne dit ce que montre la bobine" },
            { n: 2, sel: '[data-v2-module="reel"] .v2-reel-tile:nth-child(3) .v2-reel-thumb', texte: "Seule une bobine photo a une vignette" },
          ],
          apres: {
            js: async (page) => {
              await page.evaluate(() => {
                document.querySelectorAll('[data-v2-module="reel"] .v2-reel-tile').forEach((t) => {
                  const p = findPostAnywhere(t.getAttribute("data-reel-id"));
                  if (p && p.authorId === MY_UID) { t.remove(); return; }
                  const th = t.querySelector(".v2-reel-thumb");
                  if (th && th.classList.contains("v2-reel-thumb-empty") && p && p.video) {
                    const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.playsInline = true; v.src = p.video.split("#")[0] + "#t=0.8";
                    v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;";
                    th.style.position = "relative"; th.insertBefore(v, th.firstChild); th.classList.remove("v2-reel-thumb-empty"); th.setAttribute("data-mq", "vignette");
                  }
                });
              });
              await page.waitForTimeout(1500);
            },
            zooms: [{ nom: "rail", titre: "Le rail", sel: '[data-v2-module="reel"]', marge: 4 }],
          },
          annotations: [{ n: 1, sel: '[data-mq="vignette"]', texte: "Une image de la vidéo sert de vignette (poster calculé à la publication)" }],
        });
      },
    },
    // ───────────────────────────── LECTEUR ─────────────────────────────────────
    {
      nom: "lecteur",
      demarrage: compte(),
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre, vue }) {
        await ouvrirParLeRail(page);
        await prendre({
          id: "BOB-010", titre: "Lecteur de bobines — bobine vidéo d'un compte suivi (ouverte par le rail)",
          note: "Vidéo remplacée par le banc (①). Ouverture par un vrai toucher sur la vignette.",
          zooms: [
            { nom: "bas", titre: "Bas de la bobine : auteur, légende, sorties vers le réel", sel: `${item(jeu.IDS.lea)} .reel-info`, marge: 8 },
            { nom: "haut", titre: "Haut : fermeture, compteur, étiquette", sel: ".reels-header", marge: 40 },
          ],
          annotationsAvant: [
            { n: 1, sel: ".reels-close", texte: "Fermer : 38 × 38 px" },
            { n: 2, sel: `${item(jeu.IDS.lea)} .v5-actions`, texte: "4 sorties, 2 visibles : « À vivre près de moi » et « Proposer une sortie » coupées" },
            { n: 3, sel: `${item(jeu.IDS.lea)} .reel-tag-mood`, texte: "Étiquette qui redit la passion et touche la flèche ↑" },
            { n: 4, sel: `${item(jeu.IDS.lea)} .reel-actions`, texte: "Pas de « ⋯ » : ni signaler, ni supprimer" },
          ],
          apres: { js: maquetteLecteur, zooms: [
            { nom: "bas", titre: "Bas de la bobine : auteur, légende, sorties vers le réel", sel: `${item(jeu.IDS.lea)} .reel-info`, marge: 8 },
            { nom: "haut", titre: "Haut : fermeture, compteur", sel: ".reels-header", marge: 40 },
          ] },
          annotations: [
            { n: 1, sel: ".reels-close", texte: "Fermer à 44 px" },
            { n: 2, sel: `${item(jeu.IDS.lea)} .v5-actions`, texte: "Les 4 sorties visibles ; les 2 vers le réel bordées de corail" },
            { n: 3, sel: `${item(jeu.IDS.lea)} [data-mq="passion"]`, texte: "Passion et envie sur une ligne ; étiquette du haut retirée" },
            { n: 4, sel: `${item(jeu.IDS.lea)} [data-mq="plus"]`, texte: "« Plus » : signaler (ou supprimer sa bobine)" },
            { n: 5, sel: `${item(jeu.IDS.lea)} .reel-action-btn[aria-label="Commenter"]`, texte: "Le nombre de commentaires (3), comme le j'aime" },
          ],
        });
        if (vue !== "m390") return;
        // Toucher la vidéo : aucune pause.
        await page.mouse.click(195, 380);
        await page.waitForTimeout(700);
        await prendre({
          id: "BOB-011", titre: "Lecteur — après un toucher sur la vidéo : elle continue, rien ne change",
          note: "Sonde bobines-04 : `paused` reste false après le toucher ; aucun bouton pause, aucun indicateur.",
          mesurer: false,
          annotationsAvant: [{ n: 1, x: 0.5, y: 0.45, texte: "Toucher ici : la vidéo ne s'arrête pas" }],
          apres: { js: async (page) => { await page.addStyleTag({ content: ".mq-pause{position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);z-index:6;width:72px;height:72px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;pointer-events:none;}" }); await page.evaluate(() => { const it = document.querySelectorAll("#reelsList .reel-item")[reelsState.current]; const v = it.querySelector("video"); if (v) v.pause(); const d = document.createElement("div"); d.className = "mq-pause"; d.setAttribute("data-mq", "pause"); d.setAttribute("aria-label", "En pause"); d.textContent = "❚❚"; it.appendChild(d); }); } },
          annotations: [{ n: 1, sel: '[data-mq="pause"]', texte: "Toucher = pause, avec un repère visible ; retoucher = lecture" }],
        });
        await page.mouse.click(195, 380);
        await allerA(page, jeu.IDS.malik);
        await prendre({
          id: "BOB-012", titre: "Lecteur — bobine reliée à une activité : « Voir l'activité » en corail",
          zooms: [{ nom: "bas", titre: "La sortie vers l'activité", sel: `${item(jeu.IDS.malik)} .reel-info`, marge: 8 }],
          annotationsAvant: [
            { n: 1, sel: `${item(jeu.IDS.malik)} .v5-chip-fort`, texte: "Une seule sortie, en corail (IRL) : clair" },
            { n: 2, sel: `${item(jeu.IDS.malik)} .reel-tag-mood`, texte: "« SPORT · RENCONTRER » passe sous la flèche ↑" },
          ],
        });
        await allerA(page, jeu.IDS.ines);
        await prendre({
          id: "BOB-013", titre: "Lecteur — bobine PHOTO : la photo publiée n'apparaît pas, seul le texte superposé reste",
          note: "Photo de la bobine : media_url = photo-haute.jpg (servie par le banc ; la vignette du rail l'affiche). `reelMediaHTML` (app-05:3003) lit photo / coverPhotoUrl / cover, jamais `image`.",
          zooms: [{ nom: "legende", titre: "Légende longue (220 caractères puis « … »)", sel: `${item(jeu.IDS.ines)} .reel-caption`, marge: 8 }],
          annotationsAvant: [
            { n: 1, x: 0.5, y: 0.4, texte: "Dégradé violet à la place de la photo" },
            { n: 2, sel: `${item(jeu.IDS.ines)} .reel-caption`, texte: "Légende coupée à 4 lignes, sans « voir plus »" },
          ],
          apres: { js: async (page) => { await page.evaluate((src) => { const it = document.querySelector('#reelsList .reel-item[data-post-id="pb_bob_ines"]'); const m = it.querySelector(".reel-media"); const img = document.createElement("img"); img.className = "reel-media"; img.alt = ""; img.src = src; img.setAttribute("data-mq", "photo"); m.replaceWith(img); }, MEDIA + "photo-haute.jpg"); await page.waitForTimeout(800); } },
          annotations: [{ n: 1, sel: '[data-mq="photo"]', texte: "La photo publiée, sous son texte superposé" }],
        });
        await allerA(page, jeu.IDS.erreur);
        await page.waitForTimeout(800);
        await prendre({
          id: "BOB-014", titre: "Lecteur — vidéo introuvable : « ▶ Lire » posé sur « Vidéo non lisible »",
          note: "media_url répond 404 : `_reelVideoError` remplace la vidéo ; le bouton de lecture publique reste.",
          zooms: [{ nom: "centre", titre: "Centre de la bobine", sel: `${item(jeu.IDS.erreur)} [data-video-public-play]`, marge: 60 }],
          annotationsAvant: [{ n: 1, sel: `${item(jeu.IDS.erreur)} [data-video-public-play]`, texte: "« Lire » sur une vidéo qui ne se lira pas ; recouvre l'icône" }],
          apres: { css: `.reel-item:has(div.reel-media) [data-video-public-play]{display:none!important;}`, zooms: [{ nom: "centre", titre: "Centre de la bobine", sel: `${item(jeu.IDS.erreur)} .reel-media-container`, marge: 0 }] },
          annotations: [{ n: 1, sel: `${item(jeu.IDS.erreur)} .reel-media-container`, texte: "Seul le message reste ; « suivante » par le geste habituel" }],
        });
        await allerA(page, jeu.IDS.moi);
        await prendre({
          id: "BOB-015", titre: "Lecteur — ma propre bobine : mêmes sorties que chez autrui, aucun moyen de la supprimer ici",
          annotationsAvant: [
            { n: 1, sel: `${item(jeu.IDS.moi)} .v5-actions`, texte: "« Ça m'intéresse » sur MA bobine" },
            { n: 2, sel: `${item(jeu.IDS.moi)} .reel-actions`, texte: "Ni « ⋯ », ni supprimer, ni vues" },
          ],
        });
        // Fin de liste
        await page.evaluate(() => { const items = document.querySelectorAll("#reelsList .reel-item"); items[items.length - 1].scrollIntoView(); });
        await page.waitForTimeout(1600);
        await prendre({
          id: "BOB-016", titre: "Lecteur — dernière bobine (27 / 27) : flèche ↓ éteinte, rien d'autre",
          note: "Les 20 bobines d'EXEMPLE du socle suivent celles des comptes, sans marque « Exemple » dans le lecteur.",
          annotationsAvant: [
            { n: 1, sel: "#reelsCounter", texte: "27 / 27 : 7 bobines de comptes, 20 d'exemple" },
            { n: 2, sel: "#reelsNextBtn", texte: "Seul signe de fin : une flèche grisée" },
          ],
        });
        // Pause « respiration » après 15 bobines (seuil approché : simulé)
        await page.evaluate(() => { reelsState.viewedSinceOpen = 14; reelsState.pausePrompted = false; });
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(1600);
        await prendre({
          id: "BOB-017", titre: "Lecteur — carte « Tu as vu 15 bobines » (respiration)",
          note: "Simulé : compteur de bobines vues posé à 14, puis une vraie flèche ↑ (15ᵉ bobine).",
          zooms: [{ nom: "carte", titre: "La carte", sel: ".reels-pause-card", marge: 8 }],
        });
        await page.locator(".reels-pause-btn.ghost").click();
        await page.waitForTimeout(500);
        // Paysage (mobile tourné)
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForTimeout(1200);
        await allerA(page, jeu.IDS.lea);
        await prendre({
          id: "BOB-018", titre: "Lecteur — mobile en paysage (844 × 390, simulé)",
          note: "Simulé : fenêtre du gabarit m390 tournée par setViewportSize.",
          annotationsAvant: [{ n: 1, sel: `${item(jeu.IDS.lea)} .reel-info`, texte: "Légende et sorties recouvrent la moitié de la vidéo" }],
        });
      },
    },
    // ───────────────────────────── COMMENTAIRES ────────────────────────────────
    {
      nom: "commentaires",
      demarrage: compte(),
      vues: ["m390", "m360"],
      async derouler({ page, prendre, banc, vue }) {
        await ouvrirParLeRail(page);
        await page.locator(`${item(jeu.IDS.lea)} .reel-action-btn[aria-label="Commenter"]`).click();
        await page.waitForTimeout(1200);
        await prendre({
          id: "BOB-020", titre: "Panneau « Commentaires » d'une bobine",
          zooms: [
            { nom: "entete", titre: "Fermeture du panneau", sel: ".reel-comments-header", marge: 4 },
            { nom: "saisie", titre: "Champ et envoi", sel: ".reel-comments-input-wrapper", marge: 8 },
            { nom: "actions", titre: "Actions d'un commentaire", sel: ".reel-comment-item:first-child .reel-comment-footer", marge: 10 },
          ],
          annotationsAvant: [
            { n: 1, sel: ".reel-comments-close", texte: "« − » de 28 px pour fermer" },
            { n: 2, sel: ".reel-comments-send", texte: "Envoi « ↑ » 36 px, sans fond" },
            { n: 3, sel: ".reel-comment-item:first-child .reel-comment-footer", texte: "J'aime / répondre / réagir : 16 px, sans libellé" },
            { n: 4, sel: "#reelCommentInput", texte: "« Lancez » : vouvoiement, seul écran" },
          ],
          apres: { css: CSS_COMMENTAIRES, zooms: [
            { nom: "entete", titre: "Fermeture du panneau", sel: ".reel-comments-header", marge: 4 },
            { nom: "saisie", titre: "Champ et envoi", sel: ".reel-comments-input-wrapper", marge: 8 },
            { nom: "actions", titre: "Actions d'un commentaire", sel: ".reel-comment-item:first-child .reel-comment-footer", marge: 10 },
          ] },
          annotations: [
            { n: 1, sel: ".reel-comments-close", texte: "« Fermer » en toutes lettres, 44 px" },
            { n: 2, sel: ".reel-comments-send", texte: "Envoi 44 px, plein violet" },
            { n: 3, sel: ".reel-comment-item:first-child .reel-comment-footer", texte: "Cibles de 44 px autour des icônes" },
          ],
        });
        if (vue === "m390") {
          const restituer = await banc.simulerClavier(page, 300);
          await page.locator("#reelCommentInput").click();
          await page.waitForTimeout(400);
          await prendre({
            id: "BOB-021", titre: "Panneau « Commentaires » — clavier ouvert (simulé, 300 px)", mesurer: false,
            note: "Clavier virtuel simulé : fenêtre réduite de 300 px. Le panneau garde 70 % de la nouvelle hauteur.",
            annotationsAvant: [{ n: 1, sel: "#reelCommentInput", texte: "Le champ reste visible au-dessus du clavier" }],
          });
          await restituer();
        }
        // Saisie au clavier physique
        await page.locator("#reelCommentInput").click();
        await page.keyboard.type("Bonjour à tous");
        await page.waitForTimeout(1500);
        await prendre({
          id: "BOB-022", titre: "Panneau « Commentaires » — « Bonjour à tous » tapé au clavier : les espaces disparaissent et la bobine change",
          note: "Frappe réelle (clavier physique). Chaque Espace est pris par le raccourci « bobine suivante » du lecteur (app-06:1016) : le champ reçoit « Bonjouràtous », la bobine derrière passe à 2 / 27 (Malik), le panneau montre toujours les commentaires de Léa.",
          zooms: [{ nom: "saisie", titre: "Le champ après la frappe", sel: ".reel-comments-input-wrapper", marge: 8 }],
          annotationsAvant: [
            { n: 1, sel: "#reelCommentInput", texte: "« Bonjouràtous » : espaces avalés" },
            { n: 2, sel: "#reelsCounter", texte: "2 / 27 : la bobine a changé sous le panneau" },
          ],
          apres: {
            js: async (page) => { await page.evaluate(() => { const i = document.getElementById("reelCommentInput"); i.value = "Bonjour à tous"; document.querySelector('#reelsList .reel-item[data-post-id="pb_bob_lea"]').scrollIntoView(); }); await page.waitForTimeout(1300); },
            zooms: [{ nom: "saisie", titre: "Le champ après la frappe", sel: ".reel-comments-input-wrapper", marge: 8 }],
          },
          annotations: [
            { n: 1, sel: "#reelCommentInput", texte: "Le texte tapé, espaces compris" },
            { n: 2, sel: "#reelsCounter", texte: "La bobine reste celle qu'on commente (1 / 27)" },
          ],
        });
      },
    },
    // ───────────────────────────── STORIES ─────────────────────────────────────
    {
      nom: "stories",
      demarrage: compte(),
      vues: ["m390", "m360", "d1440"],
      async derouler({ page, prendre, vue }) {
        await page.waitForTimeout(2200);
        await page.locator("#storiesRowFeed .story-item", { hasText: "Léa" }).first().click();
        await page.waitForTimeout(900);
        await prendre({
          id: "BOB-030", titre: "Story d'un compte suivi (texte) — en-tête, progression, fermeture",
          note: "Story réelle du faux serveur. La plus RÉCENTE des deux stories de Léa passe en premier (aucun `createdAt` repris de Supabase).",
          zooms: [{ nom: "entete", titre: "En-tête et barres de progression", sel: ".story-viewer-header", marge: 26 }],
          annotationsAvant: [
            { n: 1, sel: "#storyAuthor", texte: "Ni heure ni passion : `#storyTime` vide" },
            { n: 2, sel: "#storyProgressRow", texte: "Piste des barres presque invisible (violet 18 % sur noir)" },
            { n: 3, sel: "#storyReportBtn", texte: "« ⋯ » flotte au milieu de l'en-tête" },
            { n: 4, sel: ".story-viewer-close", texte: "✕ de 32 px (zone 44 px par pseudo-élément), sans nom accessible" },
            { n: 5, sel: "#storyCard", texte: "Une question posée… et aucun moyen d'y répondre" },
          ],
          apres: { js: (page) => maquetteStory(page, { temps: "il y a 30 min · 🎸 Musique", repondre: "Répondre à Léa…" }), zooms: [{ nom: "entete", titre: "En-tête et barres de progression", sel: ".story-viewer-header", marge: 26 }] },
          annotations: [
            { n: 1, sel: '[data-mq="temps"]', texte: "Quand, et dans quelle passion" },
            { n: 2, sel: "#storyProgressRow", texte: "Piste blanche à 35 % : on voit combien il en reste" },
            { n: 3, sel: "#storyReportBtn", texte: "« ⋯ » rangé à côté de ✕, 44 px" },
            { n: 4, sel: '[data-mq="repondre"]', texte: "Répondre ouvre la conversation existante avec Léa" },
          ],
        });
        if (vue !== "m390") return;
        await page.locator(".story-tap-prev").click({ position: { x: 20, y: 300 } });
        await page.waitForTimeout(200);
        await page.locator(".story-tap-prev").click({ position: { x: 20, y: 300 } }).catch(() => {});
        await page.waitForTimeout(600);
        const ouverte = await page.evaluate(() => document.getElementById("storyViewer").classList.contains("active"));
        if (!ouverte) { await page.locator("#storiesRowFeed .story-item", { hasText: "Léa" }).first().click(); await page.waitForTimeout(700); await page.evaluate(() => { storyItemIdx = 1; playCurrentStory(); }); await page.waitForTimeout(500); }
        await prendre({
          id: "BOB-031", titre: "Story photo de Léa (la plus ancienne, jouée en second)",
          note: "Si le toucher « précédent » a fermé la visionneuse (première story du premier groupe), la story est rouverte et placée par appel de fonction (simulé).",
          annotationsAvant: [{ n: 1, sel: "#storyContent", texte: "Texte posé sur la photo, ombre légère : lisible ici" }],
        });
        await page.evaluate(() => closeStoryViewer());
        await page.waitForTimeout(500);
        await page.locator("#storiesRowFeed .story-item", { hasText: "Inès" }).first().click();
        await page.waitForTimeout(900);
        await prendre({ id: "BOB-032", titre: "Story photo avec texte superposé (Inès)", annotationsAvant: [{ n: 1, sel: "#storyOverlays .story-ov", texte: "Texte superposé lisible, ombré" }] });
        await page.evaluate(() => closeStoryViewer());
        await page.waitForTimeout(500);
        await page.locator("#storiesRowFeed .story-item", { hasText: "Malik" }).first().click();
        await page.waitForTimeout(1300);
        await prendre({ id: "BOB-033", titre: "Story vidéo déjà vue (Malik) — bouton son", annotationsAvant: [{ n: 1, sel: "#storySoundBtn", texte: "Son coupé par défaut, 42 px, emoji" }] });
        await page.evaluate(() => closeStoryViewer());
        await page.waitForTimeout(500);
        await page.locator("#storiesRowFeed .story-item", { hasText: "Ta story" }).first().click();
        await page.waitForTimeout(900);
        await prendre({
          id: "BOB-034", titre: "Ma story — aucune option : ni vues, ni suppression",
          annotationsAvant: [{ n: 1, sel: ".story-viewer-header", texte: "Pas de « ⋯ » sur ma story : ni « vue par », ni supprimer" }],
        });
        await page.evaluate(() => closeStoryViewer());
        await page.waitForTimeout(500);
        await page.locator("#storiesRowFeed .story-item", { hasText: "Marie" }).first().click();
        await page.waitForTimeout(900);
        await prendre({
          id: "BOB-035", titre: "Story texte longue (nom très long) — 4,5 s pour lire",
          annotationsAvant: [{ n: 1, sel: "#storyContent", texte: "Deux phrases, 4,5 s, pas de pause au maintien" }, { n: 2, sel: "#storyAuthor", texte: "Nom long sur une ligne : tient" }],
        });
      },
    },
    // ───────────────────────────── LIVE ────────────────────────────────────────
    {
      nom: "live",
      demarrage: compte({ live: true }),
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(2200);
        await page.locator("#storiesRowFeed .story-item", { hasText: "Tom" }).first().click();
        await page.waitForTimeout(2600);
        await prendre({
          id: "BOB-040", titre: "Live — visionneuse spectateur (aucun flux dans le banc)",
          note: "② : pas de WebRTC ici, « Connexion au direct… » reste affiché. La barre du haut, le chat et les réactions sont ceux de l'application.",
          zooms: [{ nom: "haut", titre: "Barre du haut", sel: ".vlive-topbar", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: ".vlive-name", texte: "Le nom de Tom n'apparaît pas : écrasé à 0 px" },
            { n: 2, sel: ".vlive-badge", texte: "« EN DIRECT » coupé sur deux lignes" },
            { n: 3, sel: "#vliveFollowBtn", texte: "Suivre : 34 px de haut" },
            { n: 4, sel: ".vlive-icon-btn", texte: "« ↗ » 40 px : partager, sans mot" },
          ],
          apres: { css: CSS_LIVE, zooms: [{ nom: "haut", titre: "Barre du haut", sel: ".vlive-topbar", marge: 0 }] },
          annotations: [
            { n: 1, sel: ".vlive-name", texte: "Qui est en direct, en clair" },
            { n: 2, sel: ".vlive-badge", texte: "« EN DIRECT » sur une ligne" },
            { n: 3, sel: "#vliveFollowBtn", texte: "Suivre à 44 px" },
          ],
        });
      },
    },
    // ───────────────────────────── PROFILS ─────────────────────────────────────
    {
      nom: "profils",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre, GENS }) {
        await page.waitForTimeout(2000);
        // Ma bobine dans l'état local, comme sur l'appareil qui l'a publiée (simulé).
        await page.evaluate(() => { const p = findPostAnywhere("pb_bob_moi"); state.userPosts.unshift(Object.assign({}, p, { _source: "me", profileId: state.user.currentProfileId })); saveState(); goTo("profiles"); });
        await page.waitForTimeout(1200);
        await page.locator('.profile-tab[data-tab="bobines"]').first().click();
        await page.waitForTimeout(400);
        await page.locator('.profile-tab[data-tab="posts"]').first().click();
        await page.waitForTimeout(800);
        await page.evaluate(() => { const t = document.querySelector('.profile-tab[data-tab="bobines"]'); if (t) t.scrollIntoView({ block: "start" }); document.getElementById("appMain").scrollTop -= 80; });
        await page.waitForTimeout(500);
        await prendre({
          id: "BOB-050", titre: "Mon profil — onglet Bobines : une vignette violette, sans image",
          note: "Simulé : ma bobine posée dans `state.userPosts` (la liste de mon profil ne lit que l'état local). « Tout » décoché à la main pour n'afficher que les bobines (multi-sélection : domaine profils).",
          annotationsAvant: [{ n: 1, sel: '#myPosts [onclick^="openReelById"]', texte: "Aplat violet et ▶ : la bobine n'a pas de vignette" }],
        });
        await page.evaluate((id) => openUserProfile(id), GENS.lea.id);
        await page.waitForTimeout(1500);
        await page.locator('#visitedTabs .profile-tab[data-vtab="bobines"]').first().click();
        await page.waitForTimeout(500);
        const tt = page.locator('#visitedTabs .profile-tab[data-vtab="posts"]');
        if ((await tt.count()) && (await tt.first().getAttribute("aria-pressed")) === "true") await tt.first().click();
        await page.waitForTimeout(800);
        await page.evaluate(() => { const t = document.querySelector("#visitedTabs"); if (t) t.scrollIntoView({ block: "start" }); });
        await page.waitForTimeout(500);
        await prendre({
          id: "BOB-051", titre: "Profil de Léa — onglet Bobines",
          note: "La 2ᵉ vignette est la bobine du socle (`pa_lea_2`, un .webm lu comme une photo) : image cassée due au JEU de données, pas au produit.",
          annotationsAvant: [{ n: 1, sel: '.modal [onclick*="openReelById"]', texte: "Vignette sans image" }],
        });
        await page.locator('.modal [onclick*="openReelById"]').first().click();
        await page.waitForTimeout(1300);
        await page.locator(".reels-close").click();
        await page.waitForTimeout(900);
        await prendre({
          id: "BOB-052", titre: "Après « Fermer » une bobine ouverte depuis le profil de Léa : retour sur MON profil",
          annotationsAvant: [{ n: 1, x: 0.5, y: 0.3, texte: "Le profil de Léa a été fermé à l'ouverture de la bobine" }],
        });
      },
    },
    // ───────────────────────────── ÉTATS LIMITES ───────────────────────────────
    {
      nom: "vide",
      demarrage: compte({ sansBobines: true, sansStories: true }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(2000);
        await page.evaluate(() => { state.seed.posts = (state.seed.posts || []).filter((p) => !p.isReel); state.supabasePosts = (state.supabasePosts || []).filter((p) => !p.isReel); openReels(); });
        await page.waitForTimeout(900);
        await prendre({
          id: "BOB-060", titre: "Lecteur — aucune bobine (état vide)",
          note: "Simulé : les bobines d'exemple et de comptes sont retirées de l'état, puis `openReels()` est appelé (en compte connecté, les 20 bobines d'exemple rendent cet état inatteignable).",
          annotationsAvant: [{ n: 1, sel: ".reels-empty-text", texte: "« ➕ → Studio → onglet Bobine » : chemin d'avant la barre actuelle" }],
        });
      },
    },
    {
      nom: "mouvement-reduit",
      demarrage: compte({}, { contexte: { reducedMotion: "reduce" } }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await ouvrirParLeRail(page);
        await prendre({
          id: "BOB-070", titre: "Lecteur — « réduire les animations » activé : la vidéo démarre et boucle quand même", mesurer: false,
          note: "Contexte Playwright reducedMotion: reduce. `videoPubliqueAutoplay` (app-02:4163) ne lit que les réglages de lecture et l'économie de données.",
          annotationsAvant: [{ n: 1, x: 0.5, y: 0.45, texte: "Lecture automatique en boucle, sans pause possible" }],
        });
      },
    },
  ],
};
