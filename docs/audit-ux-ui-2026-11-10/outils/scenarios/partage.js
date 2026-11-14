// ═══════════════════════════════════════════════════════════════════════════
// SCÉNARIOS DE CAPTURE — DOMAINE « PARTAGE, LIENS ET INVITATION » (PAR-…)
//
// Trois contournements du banc, déclarés ici une fois :
//  ① LE TOAST. Le banc capture « animations coupées » : Playwright avance alors
//     l'animation `toastOut … forwards` à sa fin et tout toast sort transparent.
//     `figerToasts` pose `.toast{animation:none}` : le toast reste tel qu'il est
//     pendant ses 2,6 s d'affichage. Rien d'autre n'est touché ; sa position et
//     son plan (z-index 200) sont ceux de l'application.
//  ② LE VISITEUR. Le mode `visiteur` sert un projet vide : `avantBoot` y branche
//     le faux serveur en mémoire (rôle `anon`, policies recopiées) pour qu'un
//     lien mène à un vrai contenu fictif (sondes/partage-09-liens-visiteur.js).
//  ③ LE LIEN EN MODE COMPTE passe par `query` (le banc n'y transmet pas `hash`).
// La feuille de partage du système (`navigator.share`) n'existe pas dans le
// Chromium du banc : les AVANT montrent donc la branche de repli (copie).
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const path = require("path");
const base = require("../jeu/base");
const jeu = require("../jeu/partage");
const A = require("../sondes/partage-aide");
const V = require("../sondes/partage-09-liens-visiteur");

const peupler = (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); };
const compte = (extra) => Object.assign({ mode: "compte", peupler }, extra || {});
const visiteur = (lien) => ({ mode: "visiteur", query: lien.split("#")[0], hash: lien.indexOf("#") > -1 ? lien.slice(lien.indexOf("#")) : "", avantBoot: async (page) => { await V.brancherVisiteur(page); } });
const figerToasts = (page) => page.addStyleTag({ content: ".toast{animation:none!important;opacity:1!important}" });
const INV = "?inv=a0d17000-0000-4000-8000-00000000a001";

// ── MAQUETTES ───────────────────────────────────────────────────────────────
const ICO = {
  lien: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  dehors: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.7" x2="15.4" y2="6.3"/><line x1="8.6" y1="13.3" x2="15.4" y2="17.7"/></svg>',
  fil: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/><path d="M18 7v4"/><path d="M6 17v-4"/></svg>',
  amis: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.200-5.500 6.500-5.500s5.900 1.900 6.500 5.500"/><path d="M18 8v6M15 11h6"/></svg>',
};
const CSS_FEUILLE = `
  .mq-apercu{display:flex;gap:12px;align-items:center;background:var(--accent-tile,#f3effe);border:1px solid var(--accent-tile-line,#e2d9fb);border-radius:18px;padding:10px 12px;margin:4px 0 6px;}
  .mq-apercu img,.mq-apercu .mq-vig{width:56px;height:56px;border-radius:12px;object-fit:cover;flex:0 0 56px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;}
  .mq-apercu b{display:block;font-family:var(--v2-titre,Manrope,sans-serif);font-weight:800;font-size:14px;color:var(--text);line-height:1.25;}
  .mq-apercu span{display:block;font-size:13px;color:var(--text-dim,#4b4763);line-height:1.35;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  .mq-qui{font-size:13px;line-height:1.4;color:var(--text-dim,#4b4763);margin:0 2px 10px;}
  .mq-ligne{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:8px 12px;background:#fff;border:1px solid var(--border);border-radius:16px;margin-top:8px;text-align:left;color:var(--text);font:inherit;cursor:pointer;}
  .mq-ligne i{flex:0 0 40px;width:40px;height:40px;border-radius:12px;background:var(--accent-tile,#f3effe);color:var(--accent);display:flex;align-items:center;justify-content:center;font-style:normal;}
  .mq-ligne b{display:block;font-weight:700;font-size:15px;} .mq-ligne small{display:block;font-size:13px;color:var(--text-dim,#4b4763);margin-top:1px;}
  .mq-ligne.principal{background:var(--accent);border-color:var(--accent);color:#fff;} .mq-ligne.principal i{background:rgba(255,255,255,.18);color:#fff;} .mq-ligne.principal small{color:rgba(255,255,255,.9);}
  .mq-ok{display:flex;gap:10px;align-items:center;background:#e8f6ee;border:1px solid #b9e2c9;color:#0f5c3d;border-radius:14px;padding:10px 12px;font-size:14px;font-weight:700;margin-top:10px;}
  .mq-lien{display:flex;gap:8px;align-items:center;margin-top:10px;} .mq-lien input{flex:1;min-width:0;font-size:16px;padding:11px 12px;border:1px solid var(--border);border-radius:12px;background:#fff;color:var(--text);}
  .mq-lien button{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--accent);background:#fff;color:var(--accent);font-weight:700;font-size:14px;}
  .modal .modal-close{width:44px!important;height:44px!important;top:8px!important;right:8px!important;}
  .modal .modal-title{font-family:var(--v2-titre,Manrope,sans-serif);}
`;
// La feuille UNIFIÉE : même squelette pour une publication, une bobine, une activité, un profil.
function feuilleUnifiee(o) {
  return async (page) => {
    await page.addStyleTag({ content: CSS_FEUILLE });
    await page.evaluate(([o, ICO]) => {
      const c = document.getElementById("modalContent");
      const vig = o.image ? '<img alt="" src="' + o.image + '">' : '<div class="mq-vig">' + (o.emoji || "🎵") + "</div>";
      c.innerHTML = '<button type="button" class="modal-close" aria-label="Fermer">×</button>'
        + '<div class="modal-handle"></div>'
        + '<div class="modal-title" id="mqTitre">Partager</div>'
        + '<div class="mq-apercu" data-mq="apercu">' + vig + "<div><b>" + o.titre + "</b><span>" + o.extrait + "</span></div></div>"
        + '<div class="mq-qui" data-mq="qui">' + o.qui + "</div>"
        + '<button type="button" class="mq-ligne principal" data-mq="dehors"><i>' + ICO.dehors + "</i><div><b>Envoyer à quelqu'un</b><small>WhatsApp, SMS, e-mail… par ton téléphone</small></div></button>"
        + '<button type="button" class="mq-ligne" data-mq="copier"><i>' + ICO.lien + "</i><div><b>Copier le lien</b><small>" + o.lien + "</small></div></button>"
        + (o.inviter ? '<button type="button" class="mq-ligne" data-mq="inviter"><i>' + ICO.amis + "</i><div><b>Inviter mes abonnements</b><small>Une notification PASSIO, personne par personne</small></div></button>" : "")
        + (!o.fil ? "" : '<button type="button" class="mq-ligne" data-mq="fil"><i>' + ICO.fil + "</i><div><b>Republier dans mon fil</b><small>" + o.fil + "</small></div></button>")
        + (o.confirmation ? '<div class="mq-ok" role="status" data-mq="ok">✓ ' + o.confirmation + "</div>" : "")
        + (o.repli ? '<div class="mq-lien" data-mq="repli"><input readonly aria-label="Lien à copier" value="' + o.repli + '"><button type="button">Copier</button></div><div class="mq-qui" style="margin-top:6px;">La copie automatique est bloquée sur ce navigateur : sélectionne le lien, ou réessaie.</div>' : "");
      const m = document.querySelector(".modal"); if (m) { m.setAttribute("role", "dialog"); m.setAttribute("aria-labelledby", "mqTitre"); }
    }, [o, ICO]);
  };
}
const ANNOT_FEUILLE = [
  { n: 1, sel: "[data-mq='apercu']", texte: "Aperçu de CE qui part : auteur, passion, extrait, vignette" },
  { n: 2, sel: "[data-mq='qui']", texte: "Ce que verra la personne, et que le lien porte ton nom" },
  { n: 3, sel: "[data-mq='dehors']", texte: "Action principale unique ; mêmes mots et même ordre sur toutes les portes" },
  { n: 4, sel: "[data-mq='copier']", texte: "« Copier le lien » toujours présent, lien lisible" },
  { n: 5, sel: "[data-mq='fil']", texte: "« Republier dans mon fil » : un seul mot (fil), plus « feed »" },
];
const F_POST = { image: null, titre: "Léa Fontaine · Musique", extrait: "Chevalet recollé, cordes neuves. Elle sonne mieux qu'à l'achat.", qui: "La personne verra cette publication, même sans compte. Le lien porte ton nom : si elle s'inscrit, elle te suivra.", lien: "passio-app.netlify.app/p/pa_lea_1", fil: "Tes abonnés la verront, avec un lien vers l'originale" };
const F_BOBINE = { emoji: "🎬", titre: "Bobine de Léa Fontaine · Musique", extrait: "Trente secondes d'arpèges.", qui: "La personne verra cette bobine, même sans compte. Le lien porte ton nom : si elle s'inscrit, elle te suivra.", lien: "passio-app.netlify.app/p/pa_lea_2", fil: "Tes abonnés la verront, avec un lien vers l'originale" };
const F_ACTIVITE = { emoji: "🎸", titre: "Atelier lutherie : régler son chevalet", extrait: "Vendredi 13 novembre · 18:00 · Atelier des Cordes, Lyon", qui: "La personne verra l'activité et pourra s'y inscrire en créant son compte. Le lien porte ton nom.", lien: "passio-app.netlify.app/e/ev_par_lea", fil: "Tes abonnés verront la carte de l'activité", inviter: true };
const F_PROFIL = { emoji: "🎸", titre: "Léa Fontaine", extrait: "Luthière amatrice. Je répare, j'accorde, je joue.", qui: "La personne verra ce profil public. Le lien porte ton nom : si elle s'inscrit, elle te suivra.", lien: "passio-app.netlify.app/u/…b002" };

const CSS_TOAST_DESSUS = "#toastStack{z-index:10050!important;position:fixed!important;}";

module.exports = {
  domaine: "partage",
  scenarios: [
    // ───────────────────────────── PUBLICATION ─────────────────────────────
    {
      nom: "publication",
      demarrage: compte({ contexte: { permissions: ["clipboard-read", "clipboard-write"] } }),
      vues: ["m390", "m360"],
      async derouler({ page, prendre, media }) {
        await figerToasts(page);
        const carte = await A.centrerCarte(page, "pa_lea_1");
        await prendre({
          id: "PAR-001", titre: "Fil — bouton « Partager » de la carte d'une publication", seulement: ["m390"],
          zooms: [{ nom: "actions", titre: "Rangée d'actions de la carte", sel: '#screen-feed .post[data-postid="pa_lea_1"] .post-actions', marge: 8 }],
          annotationsAvant: [{ n: 1, sel: '#screen-feed .post[data-postid="pa_lea_1"] .post-action[aria-label="Partager"]', texte: "Icône seule, 44 × 31 px" }],
          apres: { css: `#screen-feed .post-actions .post-action{min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;}` },
          annotations: [{ n: 1, sel: '#screen-feed .post[data-postid="pa_lea_1"] .post-action[aria-label="Partager"]', texte: "Cible portée à 44 × 44 px, icône inchangée" }],
        });
        await carte.locator('.post-action[aria-label="Partager"]').first().click();
        await page.waitForTimeout(500);
        await prendre({
          id: "PAR-002", titre: "Feuille « Partager ce post » (publication)",
          zooms: [{ nom: "feuille", titre: "La feuille", sel: ".modal", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: ".modal .modal-title", texte: "« post » ; ailleurs « publication »" },
            { n: 2, sel: "#_shareInFeedBtn", texte: "« feed » ; action principale = republier, pas envoyer" },
            { n: 3, sel: "#_shareOutBtn", texte: "« en dehors » : ne dit ni à qui ni comment ; 42 px" },
          ],
          apres: { js: feuilleUnifiee(Object.assign({}, F_POST, { image: media("photo-atelier.jpg") })), zooms: [{ nom: "feuille", titre: "La feuille unifiée", sel: ".modal", marge: 0 }] },
          annotations: ANNOT_FEUILLE,
        });
        await page.locator("#_shareOutBtn").click();
        await page.waitForTimeout(600);
        await prendre({
          id: "PAR-003", titre: "Après « Partager en dehors » (copie réussie) — le toast « Lien copié » est sous la feuille", seulement: ["m390"],
          note: "Toast figé (contournement ①). Il est émis (journal) mais peint sous .modal-backdrop (z-index 200 < 10001).",
          annotationsAvant: [{ n: 1, sel: "#_shareOutBtn", texte: "Aucun retour visible ; la feuille reste ouverte" }],
          apres: { js: feuilleUnifiee(Object.assign({}, F_POST, { image: media("photo-atelier.jpg"), confirmation: "Lien copié — colle-le dans ta conversation" })) },
          annotations: [{ n: 1, sel: "[data-mq='ok']", texte: "Confirmation DANS la feuille (et toast repassé au-dessus des feuilles)" }],
        });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(3300);
        // Repartage : geste réel, puis la carte produite dans le fil.
        await carte.locator('.post-action[aria-label="Partager"]').first().click();
        await page.waitForTimeout(400);
        await page.locator("#_shareInFeedBtn").click();
        await page.waitForTimeout(2600);
        await page.evaluate(() => { const m = document.getElementById("appMain"); if (m) m.scrollTop = 0; const c = Array.from(document.querySelectorAll("#screen-feed .post")).find((p) => /A partagé un post/.test(p.innerText)); if (c) { c.setAttribute("data-mq-repartage", "1"); c.scrollIntoView({ block: "center" }); } });
        await page.waitForTimeout(3200);
        await prendre({
          id: "PAR-005", titre: "Fil — carte produite par « Partager dans mon feed »", seulement: ["m390"],
          zooms: [{ nom: "carte", titre: "La carte du repartage", sel: "[data-mq-repartage]", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "[data-mq-repartage] .post-body", texte: "Texte seul : ni la photo, ni lien vers l'originale ; emoji 📤 et « post »" }],
          apres: {
            js: async (page) => {
              await page.addStyleTag({ content: `.mq-cite{display:flex;gap:12px;align-items:center;border:1px solid var(--border);border-radius:16px;padding:10px;margin-top:10px;background:var(--accent-tile,#f3effe);min-height:64px;cursor:pointer;} .mq-cite img{width:72px;height:72px;border-radius:12px;object-fit:cover;} .mq-cite b{display:block;font-size:14px;font-weight:800;} .mq-cite span{display:block;font-size:14px;color:var(--text-dim);line-height:1.35;margin-top:2px;} .mq-cite em{display:block;font-style:normal;font-weight:700;font-size:13px;color:var(--accent);margin-top:4px;}` });
              await page.evaluate((img) => { const c = document.querySelector("[data-mq-repartage] .post-body"); c.innerHTML = '<div style="font-size:13px;color:var(--text-dim);">a republié une publication</div><div class="mq-cite" data-mq="cite"><img alt="" src="' + img + '"><div><b>Léa Fontaine · Musique</b><span>Chevalet recollé, cordes neuves. Elle sonne mieux qu\'à l\'achat.</span><em>Voir la publication ›</em></div></div>'; }, media("photo-atelier.jpg"));
            },
            zooms: [{ nom: "carte", titre: "La carte du repartage", sel: "[data-mq-repartage]", marge: 6 }],
          },
          annotations: [{ n: 1, sel: "[data-mq='cite']", texte: "L'originale citée : vignette, auteur, extrait, et un lien qui l'ouvre" }],
        });
      },
    },
    {
      nom: "publication-copie-refusee",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre, media }) {
        await figerToasts(page);
        const carte = await A.centrerCarte(page, "pa_lea_1");
        await carte.locator('.post-action[aria-label="Partager"]').first().click();
        await page.waitForTimeout(400);
        await page.locator("#_shareOutBtn").click();
        await page.waitForTimeout(600);
        await page.keyboard.press("Escape");   // le visiteur ferme : c'est alors seulement que le toast se voit
        await page.waitForTimeout(250);
        await prendre({
          id: "PAR-004", titre: "Presse-papiers refusé — repli « Lien : <adresse> » (vu ici feuille refermée)",
          note: "Presse-papiers non autorisé dans le contexte (état réel d'un navigateur intégré). Tant que la feuille est ouverte ce toast est invisible ; il est capturé ici juste après sa fermeture. Toast figé (contournement ①) : en réalité il disparaît après 3 s.",
          zooms: [{ nom: "toast", titre: "Le toast de repli", sel: "#toastStack .toast", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#toastStack .toast", texte: "Adresse brute de 120+ caractères, non sélectionnable, 3 s" }],
          apres: {
            js: async (page) => { await page.evaluate(() => { document.getElementById("toastStack").innerHTML = ""; sharePost("pa_lea_1"); }); await page.waitForTimeout(300); await feuilleUnifiee(Object.assign({}, F_POST, { image: media("photo-atelier.jpg"), repli: "https://passio-app.netlify.app/p/pa_lea_1" }))(page); },
            zooms: [{ nom: "repli", titre: "Le repli dans la feuille", sel: "[data-mq='repli']", marge: 10 }],
          },
          annotations: [{ n: 1, sel: "[data-mq='repli']", texte: "Le lien reste à l'écran, sélectionnable, avec un bouton « Copier »" }],
        });
      },
    },
    // ─────────────────────────────── BOBINE ────────────────────────────────
    {
      nom: "bobine",
      demarrage: compte({ contexte: { permissions: ["clipboard-read", "clipboard-write"] } }),
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        await page.waitForTimeout(1200);
        await page.evaluate(() => openReelById("pa_lea_2"));   // simulé : le rail « Bobines à découvrir » ne porte pas cette bobine
        await page.waitForTimeout(1500);
        await prendre({
          id: "PAR-010", titre: "Lecteur de bobines — bouton « Partager » du rail", seulement: ["m390"], note: "Ouverture par appel de fonction (simulé). Vidéo remplacée par le banc.",
          zooms: [{ nom: "rail", titre: "Rail d'actions", sel: ".reel-item .reel-actions", marge: 8 }],
        });
        await page.locator(".reel-item .reel-action-btn[aria-label='Partager']").first().click();
        await page.waitForTimeout(600);
        await prendre({
          id: "PAR-011", titre: "Feuille « Partager cette bobine » — huit options",
          zooms: [{ nom: "feuille", titre: "La feuille", sel: ".modal", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: ".modal .modal-title", texte: "Aucun aperçu de la bobine" },
            { n: 2, sel: ".modal button:nth-of-type(2)", texte: "Six réseaux en dur, pas la feuille du téléphone ; 42 px" },
            { n: 3, sel: ".modal .btn.primary", texte: "« dans le Feed » (ailleurs « dans mon feed »)" },
          ],
          apres: { js: feuilleUnifiee(F_BOBINE), zooms: [{ nom: "feuille", titre: "La feuille unifiée", sel: ".modal", marge: 0 }] },
          annotations: ANNOT_FEUILLE,
        });
        await page.locator("#modalContent button", { hasText: "Copier le lien" }).click();
        await page.waitForTimeout(600);
        await prendre({
          id: "PAR-012", titre: "Après « Copier le lien » d'une bobine — toast sous le lecteur", seulement: ["m390"],
          note: "Toast « Lien copié » émis et figé (contournement ①), peint sous .reels-viewer (z-index 200 < 9999).",
          apres: { css: CSS_TOAST_DESSUS },
          annotations: [{ n: 1, sel: "#toastStack .toast", texte: "Le toast passe au-dessus du lecteur et des feuilles" }],
        });
      },
    },
    // ────────────────────────────── ACTIVITÉ ───────────────────────────────
    {
      nom: "activite",
      demarrage: compte({ contexte: { permissions: ["clipboard-read", "clipboard-write"] } }),
      vues: ["m390", "m360"],
      async derouler({ page, prendre, media }) {
        await figerToasts(page);
        await page.evaluate(() => goTo("irl"));
        await page.waitForTimeout(1500);
        await page.evaluate((id) => openEventDetails(id), jeu.IDS.evAutrui);   // simulé : la carte n'est pas dans la première page de la liste
        await page.waitForTimeout(1400);
        await prendre({
          id: "PAR-020", titre: "Fiche d'activité — porte « Partager » du haut", seulement: ["m390"],
          zooms: [{ nom: "haut", titre: "Bouton du coin haut droit", sel: "#eventDetailShareBtn", marge: 14 }],
          annotationsAvant: [{ n: 1, sel: "#eventDetailShareBtn", texte: "Flèche courbe : pas l'icône de partage du reste de l'app" }],
          apres: { css: "#eventDetailShareBtn::before,#eventDetailShareBtn::after{content:none!important;display:none!important;background:none!important;}", js: async (page) => { await page.evaluate((svg) => { const b = document.getElementById("eventDetailShareBtn"); b.style.backgroundImage = "none"; b.style.fontSize = "0"; b.innerHTML = svg; b.style.display = "flex"; b.style.alignItems = "center"; b.style.justifyContent = "center"; b.style.color = "#fff"; }, ICO.dehors); }, zooms: [{ nom: "haut", titre: "Bouton du coin haut droit", sel: "#eventDetailShareBtn", marge: 14 }] },
          annotations: [{ n: 1, sel: "#eventDetailShareBtn", texte: "Même icône à nœuds que partout (shareIconSvg)" }],
        });
        await page.evaluate(() => { const b = document.querySelector("#eventDetailContent button[onclick*='openEventInvite']"); if (b) b.scrollIntoView({ block: "center" }); });
        await page.waitForTimeout(400);
        await prendre({
          id: "PAR-021", titre: "Fiche d'activité — bas de page : « Partager » (3e porte) et « Inviter »", seulement: ["m390"],
          annotationsAvant: [
            { n: 1, sel: "#eventDetailContent .post-actions [aria-label='Partager']", texte: "2e porte « Partager » (icône, 44 × 31)" },
            { n: 2, sel: "#eventDetailContent button[onclick*='shareEvent(']", texte: "3e porte « Partager »" },
            { n: 3, sel: "#eventDetailContent button[onclick*='openEventInvite']", texte: "« Inviter » à ~1 850 px du haut, sous les commentaires" },
          ],
          apres: { js: async (page) => { await page.evaluate(() => { const p = document.querySelector("#eventDetailContent button[onclick*='shareEvent(']"); const i = document.querySelector("#eventDetailContent button[onclick*='openEventInvite']"); if (i) i.remove(); if (p) { p.lastChild.textContent = " Partager ou inviter"; p.setAttribute("data-mq", "une"); p.style.minHeight = "48px"; p.style.fontSize = "15px"; } const ic = document.querySelector("#eventDetailContent .post-actions [aria-label='Partager']"); if (ic) ic.remove(); }); } },
          annotations: [{ n: 1, sel: "[data-mq='une']", texte: "Une seule porte en bas (plus celle du haut) : elle ouvre la feuille unifiée, qui porte « Inviter mes abonnements »" }],
        });
        await page.locator("#eventDetailContent button[onclick*='shareEvent(']").first().click();
        await page.waitForTimeout(500);
        await prendre({
          id: "PAR-022", titre: "Feuille « Partager cet événement »",
          zooms: [{ nom: "feuille", titre: "La feuille", sel: ".modal", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: ".modal .modal-title", texte: "« événement » ; ailleurs « activité », « rencontre »" },
            { n: 2, sel: ".modal .modal-title + div", texte: "Ni l'heure ni le lieu" },
          ],
          apres: { js: feuilleUnifiee(F_ACTIVITE), zooms: [{ nom: "feuille", titre: "La feuille unifiée", sel: ".modal", marge: 0 }] },
          annotations: ANNOT_FEUILLE.concat([{ n: 6, sel: "[data-mq='inviter']", texte: "L'invitation interne rejoint la même feuille" }]),
        });
        await page.keyboard.press("Escape");
        await page.locator("#eventDetailContent button[onclick*='openEventInvite']").first().click();
        await page.waitForTimeout(600);
        await prendre({
          id: "PAR-023", titre: "Feuille « Inviter des amis » (abonnements) d'une activité",
          zooms: [{ nom: "ligne", titre: "Une ligne", sel: ".event-invite-row", marge: 8 }],
          annotationsAvant: [
            { n: 1, sel: ".modal .modal-title", texte: "Même titre que l'invitation à l'application (lien externe)" },
            { n: 2, sel: "#eventInviteSearch", texte: "Champ sans libellé" },
            { n: 3, sel: ".event-invite-row button", texte: "56 × 29 px ; nom coupé" },
          ],
          apres: {
            css: `.event-invite-row{min-height:60px;gap:12px;} .event-invite-row button{min-height:44px;min-width:88px;font-size:14px;} .event-invite-row > div:nth-child(2){white-space:normal!important;font-size:15px!important;line-height:1.25;}`,
            js: async (page) => { await page.evaluate(() => { document.querySelector(".modal .modal-title").textContent = "Inviter mes abonnements"; const s = document.querySelectorAll(".modal .modal-close"); if (s.length > 1) s[1].remove(); const i = document.getElementById("eventInviteSearch"); i.setAttribute("aria-label", "Rechercher parmi mes abonnements"); const d = document.createElement("div"); d.setAttribute("data-mq", "note"); d.style.cssText = "font-size:13px;color:var(--text-dim);margin:0 2px 10px;line-height:1.4;"; d.textContent = "Chaque personne reçoit une notification PASSIO. Pour quelqu'un qui n'a pas de compte, envoie plutôt le lien."; i.parentNode.insertBefore(d, i); }); },
            zooms: [{ nom: "ligne", titre: "Une ligne", sel: ".event-invite-row", marge: 8 }],
          },
          annotations: [
            { n: 1, sel: ".modal .modal-title", texte: "Titre qui dit QUI on invite" },
            { n: 2, sel: "[data-mq='note']", texte: "Ce que la personne recevra, et l'autre voie" },
            { n: 3, sel: ".event-invite-row button", texte: "Bouton 44 px ; nom sur deux lignes" },
          ],
        });
        await page.locator("#eventInviteList .event-invite-row button").first().click();
        await page.waitForTimeout(500);
        await page.evaluate(() => _renderEventInviteList());
        await page.waitForTimeout(300);
        await prendre({
          id: "PAR-024", titre: "« Inviter des amis » — après avoir invité tout le monde", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#eventInviteList", texte: "Impasse : ni la liste des invités, ni l'envoi du lien" }],
          apres: { js: async (page) => { await page.evaluate(() => { document.querySelector(".modal .modal-title").textContent = "Inviter mes abonnements"; const s = document.querySelectorAll(".modal .modal-close"); if (s.length > 1) s[1].remove(); document.getElementById("eventInviteSearch").style.display = "none"; document.getElementById("eventInviteList").innerHTML = '<div data-mq="fait" style="font-size:14px;color:var(--text);padding:6px 2px 12px;line-height:1.45;"><b>1 invitation envoyée</b><br><span style="color:var(--text-dim)">Marie-Charlotte de La Rochefoucauld-Montmorency · en attente de réponse</span></div><button type="button" class="btn primary block" data-mq="lien" style="min-height:48px;">Envoyer le lien à quelqu\'un d\'autre</button>'; }); } },
          annotations: [{ n: 1, sel: "[data-mq='fait']", texte: "Trace de ce qui est parti" }, { n: 2, sel: "[data-mq='lien']", texte: "Sortie vers le partage du lien" }],
        });
        await page.keyboard.press("Escape");
        await page.evaluate(() => closeEventDetail());
        await page.waitForTimeout(300);
        // Mon activité : outils d'organisation.
        await page.evaluate((id) => openEventDetails(id), jeu.IDS.evMoi);
        await page.waitForTimeout(1300);
        await page.locator("#eventDetailContent [data-orga-qr]").first().evaluate((b) => b.scrollIntoView({ block: "center" }));
        await page.locator("#eventDetailContent [data-orga-qr]").first().click();
        await page.waitForTimeout(900);
        await page.locator("#modalContent button[onclick*='_copyCheckinLink']").click();
        await page.waitForTimeout(500);
        await prendre({
          id: "PAR-025", titre: "QR d'accueil — après « Copier le lien de pointage »", seulement: ["m390"],
          note: "Toast « Lien copié » émis et figé (contournement ①) ; il est sous la feuille.",
          annotationsAvant: [{ n: 1, sel: "#modalContent button[onclick*='_copyCheckinLink']", texte: "Aucun retour visible ; rien ne dit à quoi sert ce lien" }],
          apres: { js: async (page) => { await page.evaluate(() => { const b = document.querySelector("#modalContent button[onclick*='_copyCheckinLink']"); b.textContent = "✓ Lien de pointage copié"; b.setAttribute("data-mq", "ok"); b.style.minHeight = "48px"; const d = document.createElement("div"); d.style.cssText = "font-size:13px;color:var(--text-dim);text-align:center;margin-top:8px;line-height:1.4;"; d.setAttribute("data-mq", "aide"); d.textContent = "À n'envoyer qu'aux personnes présentes : l'ouvrir pointe leur arrivée."; b.parentNode.appendChild(d); const s = document.querySelectorAll(".modal .modal-close"); if (s.length > 1) s[1].remove(); }); } },
          annotations: [{ n: 1, sel: "[data-mq='ok']", texte: "Le bouton confirme lui-même" }, { n: 2, sel: "[data-mq='aide']", texte: "Conséquence dite avant l'envoi" }],
        });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        await page.locator("#eventDetailContent [data-affiche-rencontre]").first().click();
        await page.waitForTimeout(1600);
        await prendre({ id: "PAR-026", titre: "Affiche de la rencontre (QR d'inscription)", seulement: ["m390"], note: "Sans `navigator.canShare` de fichiers dans ce Chromium : seul « Enregistrer l'image » paraît." });
        await page.keyboard.press("Escape");
        await page.evaluate(() => closeEventDetail());
        await page.evaluate((id) => proposerInvitationActivite(allEvents().find((e) => e.id === id)), jeu.IDS.evMoi);   // simulé
        await page.waitForTimeout(500);
        await prendre({
          id: "PAR-027", titre: "« Ton activité est en ligne » — invitation juste après la création", seulement: ["m390"], note: "État forcé : `proposerInvitationActivite(ev)` appelée directement (la création d'activité est auditée ailleurs).",
          annotationsAvant: [{ n: 1, sel: "#_inviteEvBtn", texte: "« Inviter mes amis » = envoyer le LIEN ; sur la fiche, « Inviter » = notifier ses abonnements" }],
        });
        await page.keyboard.press("Escape");
        await page.evaluate((id) => openEventDetails(id), jeu.IDS.evPasse);
        await page.waitForTimeout(1200);
        await page.locator("#eventDetailCta button").first().click();
        await page.waitForTimeout(1300);
        await prendre({
          id: "PAR-028", titre: "« Partager mon expérience » → Studio prérempli", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#postText", texte: "Rien ne dit que la publication sera rangée dans l'album de l'activité" }],
          apres: { js: async (page) => { await page.evaluate(() => { const t = document.getElementById("postText"); const d = document.createElement("div"); d.setAttribute("data-mq", "rattache"); d.style.cssText = "display:flex;align-items:center;gap:8px;background:#fff1ee;border:1px solid #ffd2ca;color:#8a2a1c;border-radius:14px;padding:8px 12px;font-size:14px;margin:0 0 10px;min-height:44px;"; d.innerHTML = '<span style="flex:1">📍 Souvenir de <b>Initiation grimpe en salle</b> — ira dans l\'album de l\'activité</span><button type="button" aria-label="Ne pas rattacher à l\'activité" style="min-width:44px;min-height:44px;border:none;background:none;font-size:20px;color:#8a2a1c;">×</button>'; t.parentNode.insertBefore(d, t); }); } },
          annotations: [{ n: 1, sel: "[data-mq='rattache']", texte: "Le rattachement est visible et se retire (corail : passage au réel)" }],
        });
      },
    },
    // ───────────────────────── PROFIL ET INVITATION ────────────────────────
    {
      nom: "profil-invitation",
      demarrage: compte({ contexte: { permissions: ["clipboard-read", "clipboard-write"] } }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        const carte = await A.centrerCarte(page, "pa_lea_1");
        await carte.locator(".post-author").first().click();
        await page.waitForTimeout(2500);
        await page.locator("#modalContent [onclick*='openVisitedProfileMenu']").first().click();
        await page.waitForTimeout(400);
        await prendre({
          id: "PAR-030", titre: "Profil visité — menu ⋯ « Partager le profil »",
          zooms: [{ nom: "menu", titre: "Le menu", sel: ".profile-dots-menu", marge: 10 }],
          annotationsAvant: [{ n: 1, sel: ".profile-dots-menu button", texte: "Entrée de 38 px ; part sans aperçu ni feuille" }],
        });
        await page.locator(".profile-dots-menu button", { hasText: "Partager le profil" }).click();
        await page.waitForTimeout(600);
        await prendre({
          id: "PAR-031", titre: "Profil visité — après « Partager le profil » (copie) : aucun retour visible",
          note: "Toast « Lien du profil copié » émis et figé (contournement ①), peint sous la modale plein écran du profil.",
          apres: { js: async (page) => { await page.evaluate(() => { sharePost("pa_lea_1"); const m = document.querySelector(".modal"); if (m) m.classList.remove("modal-fullscreen"); }); await page.waitForTimeout(300); await feuilleUnifiee(Object.assign({}, F_PROFIL, { confirmation: "Lien du profil copié" }))(page); } },
          annotations: [{ n: 1, sel: "[data-mq='apercu']", texte: "Même feuille que pour une publication" }, { n: 2, sel: "[data-mq='ok']", texte: "Confirmation visible" }],
        });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(3300);
        await page.evaluate(() => goTo("profiles"));
        await page.waitForTimeout(1500);
        await page.locator("#screen-profiles .v6b-modifier").first().click();
        await page.waitForTimeout(400);
        await prendre({
          id: "PAR-032", titre: "Mon profil — « Inviter des amis » au fond du menu du crayon",
          zooms: [{ nom: "menu", titre: "Le menu", sel: ".profile-dots-menu", marge: 10 }],
          annotationsAvant: [{ n: 1, sel: "#screen-profiles .v6b-modifier", texte: "Bouton nommé « Modifier le profil »" }, { n: 2, sel: ".profile-dots-menu button:last-of-type", texte: "6e entrée : inviter n'est pas « modifier »" }],
          apres: {
            js: async (page) => { await page.evaluate((svg) => { const m = document.querySelector(".profile-dots-menu"); if (m) m.remove(); const cov = document.getElementById("mainProfileCover"); const st = cov.closest(".profile-card") || cov.parentElement; const b = document.createElement("button"); b.type = "button"; b.setAttribute("data-mq", "inviter"); b.style.cssText = "display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:12px 0 4px;min-height:48px;border-radius:16px;border:1px solid var(--accent-tile-line,#e2d9fb);background:var(--accent-tile,#f3effe);color:var(--accent);font-weight:800;font-size:15px;"; b.innerHTML = svg + " Partager mon profil"; st.insertAdjacentElement("afterend", b); }, ICO.dehors); },
          },
          annotations: [{ n: 1, sel: "[data-mq='inviter']", texte: "Porte visible sur le profil, nommée pour ce qu'elle envoie (le lien de MON profil)" }],
        });
        await page.keyboard.press("Escape");
        await page.locator(".hamburger[aria-label='Paramètres']").first().click();
        await page.waitForTimeout(500);
        await page.locator("#devPanel .settings-section-header", { hasText: "Support" }).click();
        await page.waitForTimeout(500);
        await prendre({
          id: "PAR-033", titre: "Paramètres → Support → « Inviter des amis »",
          annotationsAvant: [{ n: 1, sel: "#devPanel [onclick*='shareBeta()']", texte: "7e de 7, après les textes légaux ; 33 px de haut" }],
        });
        await page.evaluate(() => toggleDevPanel());
        await page.evaluate(() => goTo("feed"));
        await page.waitForTimeout(1200);
        await page.evaluate(() => { const s = document.querySelector(".feed-exemples-sep"); if (s) s.scrollIntoView({ block: "center" }); });
        await page.waitForTimeout(400);
        await page.locator(".feed-exemples-sep-invite").first().click();
        await page.waitForTimeout(600);
        await prendre({
          id: "PAR-034", titre: "Fil — séparateur « Exemples PASSIO », « Inviter quelqu'un », lien copié",
          note: "Toast figé (contournement ①). Sur un écran sans feuille, le toast est bien visible.",
          zooms: [{ nom: "sep", titre: "Le séparateur", sel: ".feed-exemples-sep", marge: 6 }],
        });
      },
    },
    // ──────────────────── LIENS OUVERTS PAR UN VISITEUR ────────────────────
    {
      nom: "visiteur-publication",
      demarrage: visiteur(INV + "#post-pa_lea_1"),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        await page.waitForTimeout(1500);
        await prendre({
          id: "PAR-040", titre: "Visiteur — arrivée par le lien d'une publication, « Camille t'invite »",
          note: "Faux serveur branché sur le visiteur (contournement ②). Toast d'invitation figé (①) : en réalité 6 s.",
          annotationsAvant: [{ n: 1, sel: "#toastStack .toast", texte: "Seule mention de l'invitation : un toast de 6 s" }, { n: 2, sel: "#postDetailPage", texte: "Titre « Post » ; rien ne dit ce qu'est PASSIO" }],
          apres: {
            js: async (page) => { await page.evaluate(() => { document.getElementById("toastStack").innerHTML = ""; const p = document.getElementById("postDetailPage"); const t = Array.from(p.querySelectorAll("*")).find((e) => e.children.length === 0 && e.textContent.trim() === "Post"); if (t) t.textContent = "Publication"; const b = document.createElement("div"); b.setAttribute("data-mq", "bandeau"); b.style.cssText = "position:sticky;bottom:0;margin-top:auto;background:#fff;border-top:1px solid var(--border);padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));display:flex;gap:12px;align-items:center;box-shadow:0 -8px 24px rgba(24,18,48,.08);"; b.innerHTML = '<div style="flex:1;min-width:0;"><b style="display:block;font-family:var(--v2-titre,Manrope);font-size:15px;">Camille Audit t\'invite sur PASSIO</b><span style="font-size:13px;color:var(--text-dim);">Le réseau des passions : publier, découvrir, se retrouver en vrai.</span></div><button type="button" class="btn primary" style="min-height:44px;white-space:nowrap;">Créer mon compte</button>'; p.appendChild(b); }); },
          },
          annotations: [{ n: 1, sel: "[data-mq='bandeau']", texte: "L'invitation et ce qu'est PASSIO restent à l'écran, avec l'action" }],
        });
        await page.locator("#postDetailContent .post-actions .post-action").first().click();
        await page.waitForTimeout(800);
        await prendre({ id: "PAR-041", titre: "Visiteur — « Crée ton compte pour aimer cette publication »" });
        await page.locator("#modalContent button", { hasText: "Créer mon compte" }).click();
        await page.waitForTimeout(1200);
        await prendre({
          id: "PAR-042", titre: "Visiteur — après « Créer mon compte » : le formulaire est ouvert DERRIÈRE la publication",
          note: "`#onboarding.active` (z-index 50) est sous `#postDetailPage` (z-index 200) : `ecran.onboarding` vaut vrai dans la fiche, et l'écran n'a pas changé.",
          annotationsAvant: [{ n: 1, x: 0.5, y: 0.45, texte: "Écran inchangé : le formulaire d'inscription est dessous" }],
          apres: { css: "#postDetailPage{display:none!important;}" },
          annotations: [{ n: 1, sel: "#authInvite", texte: "Le formulaire paraît (la page du contenu se referme, sa cible est mémorisée) ; l'annonce d'abonnement est lisible" }],
        });
        await page.goBack().catch(() => {});
        await page.waitForTimeout(900);
        await prendre({
          id: "PAR-043", titre: "Visiteur — formulaire de création avec l'annonce « tu suivras automatiquement Camille »",
          note: "Atteint ici par le retour arrière (seule façon de découvrir le formulaire).",
          zooms: [{ nom: "annonce", titre: "L'annonce d'invitation", sel: "#authInvite", marge: 8 }],
        });
        // Fin d'inscription SIMULÉE : le crochet qu'appelle `onbFinish`. Aucun compte n'est créé.
        await page.evaluate(() => { const b = document.getElementById("frBackToExplore"); if (b) b.remove(); document.getElementById("onboarding").classList.remove("active"); PassioFirstRun.apresAuthentification(); });
        await page.waitForTimeout(1500);
        await prendre({
          id: "PAR-044", titre: "Après l'inscription (simulée) — retour sur le fil, « Tu peux aimer cette publication. »",
          note: "Simulé : `PassioFirstRun.apresAuthentification()` appelée après retrait de l'écran d'inscription ; aucun compte créé, l'état reste celui d'un visiteur (d'où la carte de bienvenue). Ce qui est observé : `retour.hash` était vide, la publication n'est pas rouverte.",
          annotationsAvant: [{ n: 1, sel: "#toastStack .toast", texte: "« cette publication » n'est plus à l'écran" }],
          apres: { js: async (page) => { await page.evaluate(() => { document.getElementById("toastStack").innerHTML = ""; openPost("pa_lea_1"); }); await page.waitForTimeout(500); await page.evaluate(() => { const p = document.getElementById("postDetailPage"); const tt = Array.from(p.querySelectorAll("*")).find((e) => e.children.length === 0 && e.textContent.trim() === "Post"); if (tt) tt.textContent = "Publication"; const d = document.createElement("div"); d.setAttribute("data-mq", "rappel"); d.setAttribute("role", "status"); d.style.cssText = "margin:12px 16px 0;background:#e8f6ee;border:1px solid #b9e2c9;color:#0f5c3d;border-radius:14px;padding:10px 12px;font-size:14px;font-weight:700;"; d.textContent = "✓ Compte créé. Tu peux maintenant aimer cette publication."; p.insertBefore(d, p.children[1] || null); }); } },
          annotations: [{ n: 1, sel: "[data-mq='rappel']", texte: "La publication visée est rouverte, le rappel parle de ce qui est à l'écran" }],
        });
      },
    },
    {
      nom: "visiteur-activite",
      demarrage: visiteur(INV + "#irl-event-ev_par_lea"),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        await page.waitForTimeout(2500);
        await prendre({ id: "PAR-045", titre: "Visiteur — arrivée par le lien d'une activité", note: "Faux serveur branché sur le visiteur (②). Toast figé (①)." });
        await page.locator("#eventDetailPage button").filter({ hasText: /participe|Rejoindre|Je viens/ }).first().click();
        await page.waitForTimeout(800);
        await page.locator("#modalContent button", { hasText: "Créer mon compte" }).click();
        await page.waitForTimeout(1200);
        await prendre({
          id: "PAR-046", titre: "Visiteur — activité : après « Je participe » puis « Créer mon compte », la fiche reste devant",
          note: "`ecran.onboarding` vrai, fiche (z-index 200) au premier plan.",
          annotationsAvant: [{ n: 1, x: 0.5, y: 0.5, texte: "Écran inchangé : formulaire dessous" }],
          apres: { css: "#eventDetailPage{display:none!important;}" },
          annotations: [{ n: 1, x: 0.5, y: 0.3, texte: "Le formulaire paraît ; l'activité est rouverte après l'inscription" }],
        });
      },
    },
    {
      nom: "visiteur-bobine",
      demarrage: visiteur("#reel=pa_lea_2"),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        await page.waitForTimeout(2500);
        await prendre({ id: "PAR-047", titre: "Visiteur — arrivée par le lien d'une bobine", note: "Faux serveur (②). Un lien de bobine ne porte pas `?inv=` : aucun accueil nominatif. Vidéo remplacée par le banc." });
        await page.locator(".reel-item .reel-action-btn[aria-label='Aimer']").first().click();
        await page.waitForTimeout(800);
        await page.locator("#modalContent button", { hasText: "Créer mon compte" }).click();
        await page.waitForTimeout(1200);
        await prendre({
          id: "PAR-048", titre: "Visiteur — bobine : après « Aimer » puis « Créer mon compte », le lecteur reste devant",
          note: "`ecran.onboarding` vrai, lecteur (z-index 9999) au premier plan.",
          annotationsAvant: [{ n: 1, x: 0.5, y: 0.5, texte: "Écran inchangé : formulaire dessous" }],
          apres: { css: "#reelsViewer{display:none!important;}" },
          annotations: [{ n: 1, x: 0.5, y: 0.3, texte: "Le formulaire paraît" }],
        });
      },
    },
    {
      nom: "visiteur-lien-mort",
      demarrage: visiteur("#post-pa_prive_1"),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        await page.waitForTimeout(1500);
        await prendre({
          id: "PAR-049", titre: "Visiteur — lien d'une publication privée ou supprimée : ~5 s après l'ouverture, rien",
          note: "Capture à ~4,7 s du chargement : le fil d'exemples, aucun signe que le lien est en cours de recherche.",
          annotationsAvant: [{ n: 1, x: 0.5, y: 0.35, texte: "Aucun état d'attente : on croit le lien cassé ou ignoré" }],
        });
        await page.waitForFunction(() => /introuvable/.test((document.getElementById("toastStack") || {}).innerText || ""), null, { timeout: 20000 });
        await page.waitForTimeout(300);
        await prendre({
          id: "PAR-050", titre: "Visiteur — verdict du lien mort : un toast « Publication introuvable ou supprimée »",
          note: "Toast figé (①) : en réalité 3 s, après ~8 s de silence (mesuré : 7,9 à 8,7 s en session).",
          zooms: [{ nom: "toast", titre: "Le verdict", sel: "#toastStack .toast", marge: 8 }],
          annotationsAvant: [{ n: 1, sel: "#toastStack .toast", texte: "3 s, sans suite proposée" }],
          apres: {
            js: async (page) => { await page.evaluate(() => { document.getElementById("toastStack").innerHTML = ""; const m = document.getElementById("appMain"); const d = document.createElement("div"); d.setAttribute("data-mq", "arrivee"); d.style.cssText = "margin:12px 16px;background:#fff;border:1px solid var(--border);border-radius:20px;padding:18px 16px;box-shadow:0 6px 20px rgba(24,18,48,.06);"; d.innerHTML = '<div style="font-family:var(--v2-titre,Manrope);font-weight:800;font-size:18px;color:var(--text);">Cette publication n\'est pas visible</div><div style="font-size:15px;color:var(--text-dim);line-height:1.45;margin:6px 0 14px;">Elle a été supprimée, ou son auteur réserve ses publications à ses abonnés.</div><button type="button" class="btn primary block" style="min-height:48px;">Découvrir ce qui se partage sur PASSIO</button><button type="button" class="btn ghost block" style="min-height:44px;margin-top:8px;">J\'ai déjà un compte</button>'; const s = document.querySelector("#screen-feed"); s.insertBefore(d, s.firstChild); if (m) m.scrollTop = 0; }); },
          },
          annotations: [{ n: 1, sel: "[data-mq='arrivee']", texte: "Un état d'arrivée qui reste, explique sans rien révéler, et propose une suite" }],
        });
      },
    },
    {
      nom: "visiteur-profil-prive",
      demarrage: visiteur("#user-a0d17000-0000-4000-8000-00000000f006"),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(3500);
        await prendre({ id: "PAR-051", titre: "Visiteur — lien vers le profil d'un compte privé", note: "Faux serveur (②)." });
      },
    },
    // ─────────────────── LIENS OUVERTS PAR UN COMPTE CONNECTÉ ──────────────
    {
      nom: "compte-liens",
      demarrage: compte({ query: "#post-pa_lea_1" }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        await page.waitForTimeout(800);
        await prendre({ id: "PAR-052", titre: "Connecté — le lien d'une publication l'ouvre", annotationsAvant: [{ n: 1, x: 0.17, y: 0.03, texte: "Titre « Post »" }] });
        await page.goBack().catch(() => {});
        await page.waitForTimeout(700);
        await page.evaluate((id) => { location.hash = "#irl-event-" + id; }, jeu.IDS.evAnnule);
        await page.waitForTimeout(1500);
        await prendre({ id: "PAR-053", titre: "Connecté — lien vers une activité annulée" });
        await page.evaluate(() => { closeEventDetail(); goTo("feed"); });
        await page.evaluate(() => { location.hash = "#user-a0d17000-0000-4000-8000-00000000f006"; });
        await page.waitForTimeout(2500);
        await prendre({ id: "PAR-054", titre: "Connecté — lien vers un profil privé (demande en attente)" });
        await page.evaluate(() => { closeModal(); });
        await page.evaluate(() => { location.hash = "#user-a0d17000-0000-4000-8000-0000000fffff"; });
        await page.waitForTimeout(1500);
        await prendre({ id: "PAR-055", titre: "Connecté — lien vers un profil inconnu : toast « Profil non trouvé »", note: "Toast figé (①).", zooms: [{ nom: "toast", titre: "Le verdict", sel: "#toastStack .toast", marge: 8 }] });
      },
    },
    // ───────────────────────── APERÇU DE LIEN (robots) ─────────────────────
    {
      nom: "apercu",
      demarrage: { mode: "demo" },
      vues: ["m390"],
      async derouler({ page, prendre, banc }) {
        // La VRAIE Edge Function, exécutée dans Node avec un `fetch` REMPLACÉ par un faux PostgREST (aucun réseau).
        const url = require("url");
        const fn = (await import(url.pathToFileURL(path.join(banc.RACINE, "netlify", "edge-functions", "apercu.js")).href)).default;
        const tables = {
          posts: [{ id: "pa_lea_1", author_id: "b002", content: "Chevalet recollé, cordes neuves. Elle sonne mieux qu'à l'achat.", media_url: "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/audit/photo-atelier.jpg", passion_id: "musique", vlog: null }],
          profiles: [{ id: "b002", username: "Léa Fontaine", is_private: false, bio: "Luthière amatrice.", avatar_url: null }],
          passions: [{ id: "musique", label: "Musique", status: "active" }],
          events: [{ id: "ev_par_lea", title: "Atelier lutherie : régler son chevalet", date_at: jeu.dansJours(3, 17), city: "Lyon", emoji: "🎸", cover_url: null, status: "active" }],
        };
        const vraiFetch = globalThis.fetch;
        globalThis.fetch = async (u) => { const U = new URL(String(u)); const t = U.pathname.split("/").pop(); let rows = (tables[t] || []).slice(); for (const [k, v] of U.searchParams) { if (k === "select" || k === "limit") continue; rows = rows.filter((r) => "eq." + r[k] === v); } return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } }); };
        let pages = {};
        try {
          for (const [cle, chemin] of [["post", "/p/pa_lea_1"], ["activite", "/e/ev_par_lea"], ["mort", "/p/pa_inconnue"]]) {
            const r = await fn(new Request("https://passio-app.netlify.app" + chemin + "?plk=lk_fictif", { headers: { "user-agent": "WhatsApp/2.24" } }));
            pages[cle] = await r.text();
          }
          const h = await fn(new Request("https://passio-app.netlify.app/p/pa_lea_1?plk=lk_fictif&inv=a0d17000-0000-4000-8000-00000000a001", { headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/158 Mobile" } }));
          pages.humain = h.status + " → " + h.headers.get("location");
        } finally { globalThis.fetch = vraiFetch; }
        console.log("    aperçu · humain : " + pages.humain);
        await page.setContent(pages.post);
        await prendre({
          id: "PAR-060", titre: "Page d'aperçu servie aux robots (/p/<id>) — telle qu'un humain pris pour un robot la voit", mesurer: false,
          note: "HTML rendu par la vraie fonction netlify/edge-functions/apercu.js exécutée dans Node, `fetch` remplacé par un faux PostgREST (aucun réseau). Un navigateur reçoit normalement un 302.",
          annotationsAvant: [{ n: 1, sel: "a", texte: "Page nue : trois lignes et un lien de taille de texte" }],
          apres: { css: `body{font-family:system-ui,sans-serif;background:#F7F5FC;color:#17152B;margin:0;padding:24px 16px;} p{margin:0 0 8px;font-size:16px;line-height:1.45;} p:first-of-type{font-weight:800;font-size:20px;} a{display:block;text-align:center;background:#6D32F4;color:#fff;text-decoration:none;font-weight:800;border-radius:16px;padding:14px;margin-top:16px;min-height:20px;}` },
          annotations: [{ n: 1, sel: "a", texte: "Même page, sans script : un style en ligne suffit à rendre le lien évident (CSP à élargir à `style-src 'unsafe-inline'`)" }],
        });
        const og = (html, p) => { const m = new RegExp('property="og:' + p + '" content="([^"]*)"').exec(html); return m ? m[1] : ""; };
        const carteHtml = (html) => '<div style="border:1px solid #d9d6e6;border-radius:14px;overflow:hidden;background:#fff;margin:0 0 18px;font-family:system-ui,sans-serif;"><div style="height:150px;background:#ece8f8 center/cover;display:flex;align-items:center;justify-content:center;color:#6b6780;font-size:13px;">' + (/icon-512/.test(og(html, "image")) ? "logo PASSIO (image générique)" : "image de la publication") + '</div><div style="padding:10px 12px;"><div style="font-weight:700;font-size:15px;color:#17152B;">' + og(html, "title") + '</div><div style="font-size:13px;color:#4b4763;margin-top:3px;line-height:1.35;">' + og(html, "description") + '</div><div style="font-size:12px;color:#6b6780;margin-top:6px;">passio-app.netlify.app</div></div></div>';
        await page.setContent('<body style="margin:0;padding:16px;background:#F7F5FC;font-family:system-ui,sans-serif;"><div style="font-size:13px;color:#4b4763;margin-bottom:10px;">Rendu GÉNÉRIQUE des balises og: (chaque messagerie a sa propre présentation)</div><div data-c="post"><div style="font-size:12px;font-weight:700;margin-bottom:4px;">Publication publique</div>' + carteHtml(pages.post) + '</div><div data-c="act"><div style="font-size:12px;font-weight:700;margin-bottom:4px;">Activité</div>' + carteHtml(pages.activite) + '</div><div data-c="mort"><div style="font-size:12px;font-weight:700;margin-bottom:4px;">Contenu privé, supprimé ou inconnu</div>' + carteHtml(pages.mort) + "</div></body>");
        await prendre({
          id: "PAR-061", titre: "Aperçus de lien — titres et descriptions produits pour trois cas (rendu générique simulé)", mesurer: false,
          note: "Simulé : les textes sont ceux des balises og: produites par la vraie fonction ; la carte est un rendu générique, pas celui d'une messagerie. Les images ne sont pas chargées (banc isolé).",
        });
      },
    },
  ],
};
