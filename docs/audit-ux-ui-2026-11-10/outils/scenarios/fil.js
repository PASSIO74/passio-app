// ═══════════════════════════════════════════════════════════════════════════
// FIL ET INTERACTIONS — scénarios de capture (surfaces FIL-001…)
//
// Compte connecté fictif (Camille Audit : Musique · Sport · Cuisine, abonnée à
// Léa, Malik et Marie-Charlotte) sur le faux serveur en mémoire, puis visiteur
// et états limites. Chaque `prendre` = une ligne du registre (donnees/domaines/fil.json).
// Les maquettes « après » sont des feuilles de style ou de petits scripts
// appliqués par le banc : rien n'est modifié dans l'application.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/fil");

const COMPTE = { mode: "compte", nbPassions: 3, peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
function etatAvecAbonnements() {
  const banc = require("../banc");
  const e = banc.onboardedState(3);
  e.user.name = banc.MOI.nom; e.user.general.username = banc.MOI.nom;
  e.user.profiles.forEach((p) => { p.name = banc.MOI.nom; });
  e.user.following = [banc.GENS.lea.id, banc.GENS.malik.id, banc.GENS.long.id, banc.GENS.prive.id];
  return e;
}
const carte = (id) =>'#feedList .post[data-postid="' + id + '"]';

// Amène une carte du fil sous la barre du haut (la zone qui défile est #appMain).
async function montrer(page, id, decalage) {
  await page.waitForSelector(carte(id), { state: "attached", timeout: 15000 });
  await page.evaluate(([sel, d]) => {
    const c = document.querySelector(sel), m = document.getElementById("appMain");
    m.scrollTop += c.getBoundingClientRect().top - d;
  }, [carte(id), decalage == null ? 76 : decalage]);
  await page.waitForTimeout(650);
}
async function haut(page) { await page.evaluate(() => { document.getElementById("appMain").scrollTop = 0; }); await page.waitForTimeout(400); }
async function fermerModale(page) { await page.evaluate(() => { try { closeModal(); } catch (e) {} const s = document.getElementById("cmtSheet"); if (s) s.remove(); ["emoji-react-panel", "cmt-emoji-composer", "cmt-react-detail"].forEach((i) => { const e = document.getElementById(i); if (e) e.remove(); }); }); await page.waitForTimeout(350); }

// ── Maquette : barre d'actions en icônes SVG nommées (au lieu d'emojis) ─────
function maquetteActions() {
  const svg = (d, plein) => '<svg viewBox="0 0 24 24" fill="' + (plein ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const COEUR = '<path d="M12 20.2s-7.2-4.5-7.2-10.1A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.2 2.7c0 5.6-7.2 10.1-7.2 10.1z"/>';
  const BULLE = '<path d="M4.5 5.5h15v10.2h-8.3l-4.2 3.6v-3.6H4.5z"/>';
  const SOURIRE = '<circle cx="12" cy="12" r="8.2"/><path d="M8.7 13.6a3.9 3.9 0 0 0 6.6 0"/><path d="M9.3 9.9h.01M14.7 9.9h.01"/>';
  document.querySelectorAll(".post-actions").forEach((barre) => {
    const hote = barre.closest("[data-postid]");
    const a = barre.querySelectorAll(".post-action");
    if (!hote || a.length < 3) return;
    const p = (typeof findPostAnywhere === "function" && findPostAnywhere(hote.getAttribute("data-postid"))) || {};
    const aime = a[0].classList.contains("liked") || p.liked === true;
    const nbC = (typeof nbCommentairesPost === "function") ? nbCommentairesPost(p) : 0;
    a[0].innerHTML = svg(COEUR, aime) + "<span>" + (p.likes || 0) + "</span>";
    a[0].classList.toggle("liked", aime);
    a[0].setAttribute("aria-pressed", aime ? "true" : "false");
    a[0].setAttribute("aria-label", "J'aime — " + (p.likes || 0));
    a[1].innerHTML = svg(BULLE) + "<span>" + nbC + "</span>";
    a[1].setAttribute("aria-label", "Commenter — " + nbC + " commentaire" + (nbC > 1 ? "s" : ""));
    a[2].innerHTML = svg(SOURIRE);
    a[2].setAttribute("aria-label", "Réagir avec un emoji");
  });
}
const CSS_ACTIONS = `
  .post-actions .post-action{ gap:6px; font-size:13.5px; font-weight:700; color:var(--text); min-height:44px; }
  .post-actions .post-action svg{ width:20px; height:20px; }
  .post-actions .post-action.liked{ color:var(--accent); }
  .post-menu-btn{ width:44px; height:44px; margin:-7px; }
`;

module.exports = {
  domaine: "fil",
  scenarios: [
    // ───────────────────────────────────────────────────────────────────────
    {
      nom: "fil-tete",
      demarrage: COMPTE,
      vues: ["m390", "m360", "m320", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(1500);
        await prendre({
          id: "FIL-001",
          titre: "Fil — haut de page (rail des passions, envies, stories, première carte)",
          zooms: [
            { nom: "entete", titre: "Rail des passions, envies et stories", sel: "#feedPassionsBlock", marge: 6 },
            { nom: "envies", titre: "Rangée des envies", sel: "#feedIntentSelector", marge: 6 },
          ],
          annotationsAvant: [
            { n: 1, sel: "#profileStrip", texte: "Rail : « Suivis » + les passions du compte, toutes cochées (lavis violet)" },
            { n: 2, sel: "#feedIntentSelector", texte: "Envies en 11 px, sans état « tout » visible : rien ne dit que ce sont des filtres" },
            { n: 3, sel: "#storiesRowFeed", texte: "Stories : libellés en 9,5 px" },
            { n: 4, sel: "#feedList .post", texte: "Le premier contenu commence à 273 px (390×844) — presque la moitié d'un écran 320×568" },
          ],
          apres: {
            css: `
              #feedIntentSelector .feed-intent-btn{ font-size:13px; font-weight:700; color:var(--text); }
              #feedIntentSelector::before{ content:"Filtrer :"; align-self:center; font-size:12px; font-weight:700; color:var(--muted); padding:0 2px 0 4px; white-space:nowrap; }
              #feedIntentSelector .feed-intent-btn{ border:1.5px solid var(--border); border-radius:999px; background:var(--bg-card); min-height:36px; height:36px; padding:0 10px; }
              #feedIntentSelector{ gap:6px; border-bottom:0; align-items:center; }
              #storiesRowFeed .story-label{ font-size:11px; }
              @media (max-height:660px){ #storiesRowFeed .story-label{ display:none; } #storiesRowFeed{ padding-bottom:2px; } }
            `,
          },
          annotations: [
            { n: 1, sel: "#feedIntentSelector", texte: "Les envies se lisent comme des filtres : libellé « Filtrer », pastilles bordées, 13 px" },
            { n: 2, sel: "#storiesRowFeed", texte: "Libellés des stories à 11 px ; masqués sous 660 px de haut pour remonter le contenu" },
          ],
        });
      },
    },
    // ───────────────────────────────────────────────────────────────────────
    {
      nom: "fil-cartes",
      demarrage: COMPTE,
      vues: ["m390", "m360"],
      async derouler({ page, prendre, vue }) {
        await page.waitForTimeout(1800);
        await montrer(page, "pa_lea_1");
        await prendre({
          id: "FIL-002",
          titre: "Carte de publication — photo, barre d'actions, pastille de réactions",
          zooms: [
            { nom: "actions", titre: "Barre d'actions", sel: carte("pa_lea_1") + " .post-actions", marge: 8 },
            { nom: "entete", titre: "En-tête de carte", sel: carte("pa_lea_1") + " .post-header", marge: 6 },
          ],
          annotationsAvant: [
            { n: 1, sel: carte("pa_lea_1") + ' [data-action="like"]', texte: "« 🤍 5 » : cœur gris alors que le serveur dit que j'ai déjà aimé ; nom accessible = l'emoji" },
            { n: 2, sel: carte("pa_lea_1") + " [data-cmtcount]", texte: "« 💬 34 » en 12,5 px ; la discussion titrera « (37) »" },
            { n: 3, sel: carte("pa_lea_1") + " .post-menu-btn", texte: "« ⋯ » de 30 px, intitulé « Signaler ou bloquer »" },
          ],
          apres: { css: CSS_ACTIONS, js: async (page) => { await page.evaluate(maquetteActions); } },
          annotations: [
            { n: 1, sel: carte("pa_lea_1") + ' [data-action="like"]', texte: "Icône SVG pleine et violette : mon j'aime lu du serveur est affiché ; nom « J'aime — 5 »" },
            { n: 2, sel: carte("pa_lea_1") + " [data-cmtcount]", texte: "Compteurs en 13,5 px, encre pleine, cibles de 44 px" },
            { n: 3, sel: carte("pa_lea_1") + " .post-menu-btn", texte: "« ⋯ » porté à 44 px" },
          ],
        });
        await montrer(page, "pa_lea_1", -330);
        await prendre({
          id: "FIL-003", seulement: ["m390"],
          titre: "Carte — aperçu de deux commentaires et porte « Trouver une activité »",
          zooms: [{ nom: "apercu", titre: "Aperçu des commentaires", sel: carte("pa_lea_1") + " .comment", marge: 8 }],
          annotationsAvant: [
            { n: 1, sel: carte("pa_lea_1") + " .comment .comment-actions", texte: "« 🤍 0 » alors que ce commentaire a 2 j'aime (l'aperçu ne lit pas les interactions) ; icônes 💬 😊 sans libellé" },
            { n: 2, sel: carte("pa_lea_1") + " .v3-tempt", texte: "Porte vers l'IRL, discrète, 44 px" },
          ],
          apres: { css: carte("pa_lea_1") + ` .comment .comment-actions{ display:none; } ` + carte("pa_lea_1") + ` .comment .comment-meta{ margin-bottom:2px; }` },
          annotations: [{ n: 1, sel: carte("pa_lea_1") + " .comment", texte: "Aperçu en lecture seule : les actions (et leurs compteurs justes) vivent dans la discussion, ouverte d'un toucher" }],
        });
        await montrer(page, "pf_moi_texte");
        await prendre({ id: "FIL-004", seulement: ["m390"], titre: "Carte — ma publication (texte court, « ⋯ » du propriétaire)", zooms: [{ nom: "carte", titre: "Carte", sel: carte("pf_moi_texte"), marge: 4 }] });
        await montrer(page, "pf_relie_activite");
        await prendre({
          id: "FIL-005",
          titre: "Carte — publication reliée à une activité (pastille « Rencontrer »)",
          note: "Capture prise ~6 s après l'ouverture : l'activité est déjà en mémoire, la carte n'a pas été repeinte.",
          zooms: [{ nom: "pied", titre: "Bas de carte", sel: carte("pf_relie_activite") + " .post-actions", marge: 30 }],
          annotationsAvant: [
            { n: 1, sel: carte("pf_relie_activite") + " .post-mood-tag", texte: "La pastille corail annonce une rencontre" },
            { n: 2, sel: carte("pf_relie_activite") + " .post-actions", texte: "Aucune porte « Voir l'activité » : l'activité est arrivée après la peinture, la carte n'est pas redécorée" },
          ],
          apres: { js: async (page) => { await page.evaluate(() => { window._feedDomSig = null; renderFeed(); }); await page.waitForTimeout(900); await page.evaluate((sel) => { const c = document.querySelector(sel), m = document.getElementById("appMain"); m.scrollTop += c.getBoundingClientRect().top - 76; }, carte("pf_relie_activite")); await page.waitForTimeout(500); } },
          annotations: [{ n: 1, sel: carte("pf_relie_activite") + " [data-v3-bridge]", texte: "« Voir l'activité » présent dès que l'activité est connue (ici : le rendu que l'application produit après un repeint)" }],
        });
        await montrer(page, "pf_texte_long");
        await prendre({
          id: "FIL-006", seulement: ["m390"],
          titre: "Carte — texte long tronqué (« Lire la suite »)",
          zooms: [{ nom: "texte", titre: "Texte tronqué", sel: carte("pf_texte_long") + " .post-body", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: carte("pf_texte_long") + " .post-body", texte: "Coupure à 220 caractères, au milieu d'une liste ; « Lire la suite » ouvre la page de la publication" }],
        });
        await montrer(page, "pf_photo_portrait");
        await prendre({ id: "FIL-007", seulement: ["m390"], titre: "Carte — photo portrait", note: "Photo fictive du banc." });
        await montrer(page, "pf_photo_haute");
        await prendre({
          id: "FIL-008", seulement: ["m390"],
          titre: "Carte — photo très haute",
          annotationsAvant: [{ n: 1, sel: carte("pf_photo_haute") + " .post-media", texte: "La photo occupe plus d'un écran : auteur et actions ne sont jamais visibles ensemble" }],
          apres: { css: carte("pf_photo_haute") + ` .post-media img{ max-height:480px; object-fit:cover; }` },
          annotations: [{ n: 1, sel: carte("pf_photo_haute") + " .post-media", texte: "Hauteur plafonnée (480 px, recadrage centré) : la photo entière reste sur la page de la publication" }],
        });
        await montrer(page, "pf_photo_carre");
        await prendre({ id: "FIL-009", seulement: ["m390"], titre: "Carte — photo sans texte" });
        await montrer(page, "pf_video");
        await prendre({
          id: "FIL-010", seulement: ["m390"],
          titre: "Carte — vidéo",
          note: "Fichier vidéo local de substitution (boucle.webm), préchargement désactivé par l'application.",
          zooms: [{ nom: "video", titre: "Lecteur", sel: carte("pf_video") + " .post-media", marge: 4 }],
        });
        await montrer(page, "pf_audio");
        await prendre({
          id: "FIL-011", seulement: ["m390"],
          titre: "Carte — audio",
          note: "Fichier local de substitution.",
          zooms: [{ nom: "audio", titre: "Lecteur audio", sel: carte("pf_audio") + " .post-audio", marge: 6 }],
        });
        await montrer(page, "pf_photo_absente");
        await prendre({
          id: "FIL-012", seulement: ["m390"],
          titre: "Carte — photo en échec de chargement",
          note: "État provoqué par une adresse d'image qui répond 404 (jeu de données).",
          annotationsAvant: [{ n: 1, sel: carte("pf_photo_absente") + " .post-media", texte: "Rectangle gris de 200 px, sans mot ni moyen de réessayer" }],
          apres: { css: carte("pf_photo_absente") + ` .post-media{ position:relative; } ` + carte("pf_photo_absente") + ` .post-media::after{ content:"Image indisponible"; position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:var(--muted); background:var(--accent-tile); border-radius:var(--radius-sm); } ` + carte("pf_photo_absente") + ` .post-media img{ min-height:120px !important; }` },
          annotations: [{ n: 1, sel: carte("pf_photo_absente") + " .post-media", texte: "L'échec est dit, sur un lavis de la charte, dans une boîte plus basse" }],
        });
        await montrer(page, "pf_repartage");
        await prendre({
          id: "FIL-013", seulement: ["m390"],
          titre: "Carte — repartage d'une publication",
          annotationsAvant: [{ n: 1, sel: carte("pf_repartage") + " .post-body", texte: "Le repartage est un texte : citation sans photo d'origine ni lien vers la publication partagée" }],
        });
        await montrer(page, "pf_partage_activite");
        await prendre({ id: "FIL-014", seulement: ["m390"], titre: "Carte — partage d'une activité", note: "Même défaut de porte que FIL-005 tant que la carte n'est pas repeinte." });
        await montrer(page, "pa_long_1");
        await prendre({
          id: "FIL-015",
          titre: "Carte — nom d'auteur très long, photo panoramique",
          zooms: [{ nom: "entete", titre: "En-tête", sel: carte("pa_long_1") + " .post-header", marge: 6 }],
        });
      },
    },
    // ───────────────────────────────────────────────────────────────────────
    {
      nom: "discussion",
      demarrage: COMPTE,
      vues: ["m390", "m360"],
      async derouler({ page, prendre, banc, serveur }) {
        await page.waitForTimeout(1800);
        await montrer(page, "pa_lea_1");
        await page.locator(carte("pa_lea_1") + " [data-cmtcount]").click();
        await page.waitForTimeout(2200);
        await prendre({
          id: "FIL-030",
          titre: "Discussion d'une publication — 34 commentaires (feuille basse)",
          zooms: [
            { nom: "liste", titre: "Zone des commentaires (260 px)", sel: "#commentsBox", marge: 4 },
            { nom: "saisie", titre: "Saisie", sel: "#newComment", marge: 50 },
          ],
          annotationsAvant: [
            { n: 1, sel: "#modalContent .modal-title", texte: "« Discussion (37) » alors que la carte annonce 34 : le titre ajoute les réponses" },
            { n: 2, sel: "#commentsBox", texte: "Liste bornée à 260 px : deux commentaires et demi visibles sur 34, la moitié haute de l'écran reste vide" },
            { n: 3, sel: "#commentsBox .comment .comment-actions", texte: "Actions en emojis de 12 px (🤍 💬 😊), cibles de 28 × 40 px" },
            { n: 4, sel: "#newComment", texte: "Champ sans étiquette (texte d'appel seul) ; « Publier » de 42 px" },
          ],
          apres: {
            css: `
              #commentsBox{ max-height:min(54vh, 470px) !important; }
              #modalContent .modal-subtitle{ display:none; }
              #modalContent .modal-title{ margin-bottom:10px; }
              #newComment{ min-height:48px !important; height:48px; }
              #modalContent .btn.primary{ min-height:46px; }
              #modalContent .cmt-tool-btn{ width:46px; height:46px; }
              #commentsBox .comment-action{ font-size:14px; min-width:44px; }
              #commentsBox .comment-menu-btn{ width:36px; height:36px; }
            `,
            js: async (page) => { await page.evaluate(() => { const t = document.querySelector("#modalContent .modal-title"); const p = findPostAnywhere("pa_lea_1"); if (t && p) t.textContent = "Discussion · " + (p.commentsTotal || 34) + " commentaires"; const ta = document.getElementById("newComment"); if (ta) ta.setAttribute("aria-label", "Ton commentaire"); }); },
          },
          annotations: [
            { n: 1, sel: "#modalContent .modal-title", texte: "Même nombre que sur la carte (34 commentaires), une seule écriture du titre" },
            { n: 2, sel: "#commentsBox", texte: "La liste prend la hauteur disponible (54 % de l'écran) : cinq à six commentaires lisibles" },
            { n: 3, sel: "#newComment", texte: "Saisie compacte nommée, bouton d'envoi et outil emoji à 46 px" },
          ],
        });
        // Clavier virtuel simulé
        await page.locator("#newComment").click();
        const rendre = await banc.simulerClavier(page, 300);
        await prendre({
          id: "FIL-031",
          titre: "Discussion — saisie avec clavier ouvert (simulé)",
          note: "Clavier SIMULÉ : la fenêtre est réduite de 300 px (aucun véritable clavier).",
          annotationsAvant: [{ n: 1, sel: "#commentsBox", texte: "Clavier ouvert : la liste garde ses 260 px, le titre et la poignée sortent de l'écran" }],
        });
        await rendre();
        // Texte long dans le champ
        await page.locator("#newComment").fill("Merci pour le partage ! J'ai exactement le même problème sur ma folk : le chevalet se décolle côté aigus depuis cet hiver. Tu as utilisé de la colle vinylique ou de la colle à chaud ? Et combien de temps as-tu laissé sous presse avant de remonter les cordes ?");
        await page.waitForTimeout(400);
        await prendre({
          id: "FIL-032", seulement: ["m390"],
          titre: "Discussion — commentaire long en cours de saisie",
          zooms: [{ nom: "saisie", titre: "Champ rempli", sel: "#newComment", marge: 40 }],
          annotationsAvant: [{ n: 1, sel: "#newComment", texte: "Limite de 400 caractères sans compteur : la saisie s'arrête sans explication" }],
        });
        // Envoi en échec : le serveur refuse l'écriture (panne programmée)
        serveur.pannes.push({ table: "post_comments", methode: "POST", status: 500, body: { message: "panne programmée par le banc" } });
        await page.locator("#modalContent .btn.primary").click();
        await page.waitForTimeout(2500);
        await prendre({
          id: "FIL-033", seulement: ["m390"],
          titre: "Discussion — commentaire non envoyé (« Non envoyé · Réessayer »)",
          note: "État SIMULÉ : le faux serveur répond 500 à l'écriture de post_comments.",
          zooms: [{ nom: "statut", titre: "Statut d'envoi", sel: "#commentsBox .comment", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#commentsBox .cmt-status", texte: "Le statut est dit sur le commentaire, et le toucher relance l'envoi" }],
        });
        serveur.pannes.length = 0;
        // Options d'un commentaire d'AUTRUI
        await page.locator("#commentsBox .comment[data-commentid='c_fil_recent'] .comment-menu-btn").click();
        await page.waitForTimeout(500);
        await prendre({
          id: "FIL-034",
          titre: "Options d'un commentaire d'autrui",
          annotationsAvant: [
            { n: 1, sel: "#cmtSheet .cmt-sheet-row:nth-of-type(2)", texte: "Icônes fonctionnelles en emojis (💬 😊 🎬 📋 🔕 🚫 ⚠️), là où le menu d'une publication emploie un pictogramme SVG" },
            { n: 2, sel: "#cmtSheet .cmt-sheet-row.danger", texte: "« Bloquer ce compte » agit sans confirmation, collé à « Masquer » et « Signaler »" },
          ],
          apres: { css: `#cmtSheet .cmt-sheet-row.danger{ margin-top:0; } #cmtSheet .cmt-sheet-row:nth-of-type(5){ border-top:1px solid var(--border); margin-top:6px; padding-top:6px; } #cmtSheet .cmt-sheet-row:nth-of-type(3){ display:none; } #cmtSheet .cmt-sheet-row:nth-of-type(2){ font-size:15px; }` ,
            js: async (page) => { await page.evaluate(() => { const r = document.querySelectorAll("#cmtSheet .cmt-sheet-row"); if (r[1]) r[1].lastChild.textContent = "Réagir (emoji ou GIF)"; if (r[5]) r[5].lastChild.textContent = "Bloquer Inès Moreau…"; }); } },
          annotations: [
            { n: 1, sel: "#cmtSheet .cmt-sheet-row:nth-of-type(2)", texte: "Une seule entrée « Réagir » (le panneau porte déjà les deux onglets)" },
            { n: 2, sel: "#cmtSheet .cmt-sheet-row:nth-of-type(5)", texte: "Les actions de modération sont séparées ; « Bloquer » nomme la personne et annonce une confirmation (…)" },
          ],
        });
        await fermerModale(page);
        await page.locator(carte("pa_lea_1") + " [data-cmtcount]").click();
        await page.waitForTimeout(1200);
        // Options de MON commentaire
        await page.locator("#commentsBox .comment[data-commentid='c_fil_moi'] .comment-menu-btn").click();
        await page.waitForTimeout(500);
        await prendre({
          id: "FIL-035", seulement: ["m390"],
          titre: "Options de mon commentaire (Modifier, Supprimer)",
          annotationsAvant: [{ n: 1, sel: "#cmtSheet .cmt-sheet-row.danger", texte: "« Supprimer » efface aussitôt, sans confirmation ni annulation (la publication, elle, demande confirmation)" }],
        });
        // Modifier
        await page.locator("#cmtSheet .cmt-sheet-row", { hasText: "Modifier" }).click();
        await page.waitForTimeout(500);
        await prendre({
          id: "FIL-036", seulement: ["m390"],
          titre: "Modification d'un commentaire (éditeur en ligne)",
          zooms: [{ nom: "editeur", titre: "Éditeur", sel: "#commentsBox .cmt-edit-input", marge: 46 }],
        });
        await page.locator("#commentsBox .cmt-edit-bar .btn.ghost").click();
        await page.waitForTimeout(300);
        // Répondre
        await page.locator("#commentsBox .comment[data-commentid='c_fil_recent'] .comment-action[title='Répondre']").click();
        await page.waitForTimeout(700);
        await prendre({
          id: "FIL-037",
          titre: "Réponse à un commentaire (champ en ligne)",
          zooms: [{ nom: "reponse", titre: "Champ de réponse", sel: ".comment-reply-input", marge: 8 }],
          annotationsAvant: [
            { n: 1, sel: ".comment-reply-input button[aria-label='Envoyer la réponse']", texte: "Bouton d'envoi « ✓ » de 34 × 34 px" },
            { n: 2, sel: "#newComment", texte: "Deux champs de saisie à l'écran en même temps (réponse et commentaire)" },
          ],
          apres: { css: `.comment-reply-input button[aria-label='Envoyer la réponse']{ width:44px !important; height:44px !important; border-radius:12px !important; } .comment-reply-input .reply-field{ min-height:44px; } #newComment, #newComment + div{ display:none !important; } #commentsBox{ max-height:min(60vh, 520px) !important; }` },
          annotations: [
            { n: 1, sel: ".comment-reply-input button[aria-label='Envoyer la réponse']", texte: "Envoi à 44 px" },
            { n: 2, sel: "#commentsBox", texte: "Pendant une réponse, la saisie de commentaire s'efface : un seul champ, plus de place pour la liste" },
          ],
        });
        await page.evaluate(() => document.querySelectorAll(".comment-reply-input").forEach((n) => n.remove()));
        // Réponses dépliées + réacteurs
        await page.locator("#commentsBox .comment[data-commentid='c_fil_malik'] .comment-reply-count").click();
        await page.waitForTimeout(400);
        await page.evaluate(() => { const c = document.querySelector("#commentsBox .comment[data-commentid='c_fil_malik']"), b = document.getElementById("commentsBox"); b.scrollTop += c.getBoundingClientRect().top - b.getBoundingClientRect().top - 4; });
        await page.locator("#commentsBox .comment[data-commentid='c_fil_malik'] .cmt-react-chip").first().click();
        await page.waitForTimeout(500);
        await prendre({
          id: "FIL-038", seulement: ["m390"],
          titre: "Réponses dépliées et liste « Réactions » d'un commentaire",
          zooms: [{ nom: "reacteurs", titre: "Qui a réagi", sel: "#cmt-react-detail", marge: 6 }],
        });
        await page.evaluate(() => { const e = document.getElementById("cmt-react-detail"); if (e) e.remove(); });
        // Panneau emoji / GIF du composeur
        await page.locator("#modalContent .cmt-tool-btn").last().click();
        await page.waitForTimeout(600);
        await prendre({
          id: "FIL-039",
          titre: "Panneau emoji du composeur de commentaire",
          zooms: [{ nom: "panneau", titre: "Panneau", sel: "#cmt-emoji-composer", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#cmt-emoji-composer", texte: "Emojis de 18 px dans des cases de 28 px ; onglets « Emoji | GIF » de 31 px de haut" }],
          apres: { css: `#cmt-emoji-composer span{ font-size:24px !important; width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center; padding:0 !important; } #cmt-emoji-composer{ width:min(344px, calc(100vw - 16px)) !important; left:8px !important; } #cmt-emoji-composer button{ min-height:40px; font-size:14px !important; }` },
          annotations: [{ n: 1, sel: "#cmt-emoji-composer", texte: "Cases de 40 px, emojis de 24 px, onglets de 40 px" }],
        });
        await page.locator("#cmt-emoji-composer button", { hasText: "GIF" }).click();
        await page.waitForTimeout(2500);
        await prendre({
          id: "FIL-040", seulement: ["m390"],
          titre: "Panneau GIF du composeur (réseau GIF refusé par le banc)",
          note: "Le banc refuse KLIPY et Giphy : la grille montre la liste de secours, dont les images ne chargent pas ici. Ce n'est pas un défaut du produit.",
          zooms: [{ nom: "panneau", titre: "Panneau GIF", sel: "#cmt-emoji-composer", marge: 6 }],
        });
      },
    },
    // ───────────────────────────────────────────────────────────────────────
    {
      nom: "detail-et-options",
      demarrage: COMPTE,
      vues: ["m390", "m360"],
      async derouler({ page, prendre, serveur, vue }) {
        await page.waitForTimeout(1800);
        await montrer(page, "pf_texte_long");
        await page.locator(carte("pf_texte_long") + " .post-body").click();
        await page.waitForTimeout(1200);
        await prendre({
          id: "FIL-050",
          titre: "Page d'une publication — texte long, sans commentaire",
          zooms: [{ nom: "entete", titre: "Barre de titre", sel: "#postDetailPage > div", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: "#postDetailPage > div:first-child > span", texte: "Titre « Post » (ailleurs : « publication ») ; fond #ede9fe écrit en dur" },
            { n: 2, sel: "#postDetailComments", texte: "« Commentaires (0) » ici, « Discussion » dans la feuille : deux mots pour un même fil ; aucun champ pour écrire sur cette page" },
          ],
          apres: {
            css: `#postDetailPage, #postDetailPage > div{ background:var(--bg-deep) !important; } #postDetailPage > div:first-child > span{ font-size:0 !important; } #postDetailPage > div:first-child > span::after{ content:"Publication"; font-size:16px; font-weight:800; font-family:var(--v2-titre, inherit); }`,
            js: async (page) => { await page.evaluate(() => { const c = document.getElementById("postDetailComments"); const t = c && c.previousElementSibling; if (t) t.textContent = "Discussion · 0 commentaire"; if (c) c.innerHTML = '<button class="btn primary block" style="min-height:46px;">Écrire le premier commentaire</button>'; }); } },
          annotations: [
            { n: 1, sel: "#postDetailPage > div:first-child > span", texte: "« Publication », sur le fond de l'application" },
            { n: 2, sel: "#postDetailComments", texte: "Même mot que la feuille (« Discussion ») et une porte visible pour écrire (elle ouvre la feuille existante)" },
          ],
        });
        await page.evaluate(() => closePost());
        await page.waitForTimeout(400);
        await montrer(page, "pa_lea_1");
        await page.locator(carte("pa_lea_1") + " .post-body").click();
        await page.waitForTimeout(2200);
        await page.evaluate(() => { document.getElementById("postDetailPage").scrollTop = 420; });
        await page.waitForTimeout(400);
        await prendre({
          id: "FIL-051", seulement: ["m390"],
          titre: "Page d'une publication — photo, réactions et commentaires en ligne",
          annotationsAvant: [{ n: 1, sel: "#postDetailComments", texte: "Les commentaires sont lisibles ici ; pour en écrire un, il faut toucher 💬, qui rouvre la même liste dans une feuille" }],
        });
        // Réaction emoji sur la publication
        await page.evaluate(() => { document.getElementById("postDetailPage").scrollTop = 250; });
        await page.waitForTimeout(300);
        await page.locator("#postDetailContent .post-actions .post-action").nth(2).click();
        await page.waitForTimeout(600);
        await prendre({
          id: "FIL-052",
          titre: "Panneau de réaction à une publication (emoji | GIF)",
          zooms: [{ nom: "panneau", titre: "Panneau de réaction", sel: "#emoji-react-panel", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#emoji-react-panel", texte: "Le panneau sort par le haut de l'écran (premières rangées coupées) ; emojis de 18 px dans des cases de 28 px ; un toucher ne réagit pas : il faut ensuite « Envoyer ✓ »" }],
          apres: { css: `#emoji-react-panel span{ font-size:24px !important; width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center; padding:0 !important; } #emoji-react-panel{ width:min(344px, calc(100vw - 16px)) !important; left:8px !important; top:76px !important; bottom:auto !important; } #emoji-react-panel button{ min-height:40px; font-size:14px !important; }` },
          annotations: [{ n: 1, sel: "#emoji-react-panel", texte: "Panneau ramené dans l'écran, cases de 40 px ; recommandation associée : un toucher sur un emoji réagit tout de suite (re-toucher le retire)" }],
        });
        // À 360×640 le panneau sort de l'écran par le haut : ses premiers emojis ne sont
        // pas touchables (le geste ci-dessous échoue). La suite n'est déroulée qu'à 390.
        if (vue !== "m390") return;
        await page.locator("#emoji-react-panel span").nth(2).click();
        await page.waitForTimeout(400);
        await prendre({ id: "FIL-053", seulement: ["m390"], titre: "Réaction choisie — ligne de validation « Envoyer ✓ »", zooms: [{ nom: "panneau", titre: "Validation", sel: "#emoji-react-panel", marge: 6 }] });
        await page.locator("#emoji-react-panel button", { hasText: "Envoyer" }).click();
        await page.waitForTimeout(600);
        await page.locator("#postDetailContent .post-react-chip-holder .cmt-react-chip").click();
        await page.waitForTimeout(500);
        await prendre({ id: "FIL-054", seulement: ["m390"], titre: "Liste « Réactions » d'une publication", zooms: [{ nom: "liste", titre: "Qui a réagi", sel: "#cmt-react-detail", marge: 6 }] });
        await page.evaluate(() => { const e = document.getElementById("cmt-react-detail"); if (e) e.remove(); closePost(); });
        await page.waitForTimeout(400);
        // Options d'une publication d'AUTRUI
        await page.locator(carte("pa_lea_1") + " .post-menu-btn").click();
        await page.waitForTimeout(500);
        await prendre({
          id: "FIL-060",
          titre: "Options d'une publication d'autrui (« ⋯ »)",
          annotationsAvant: [
            { n: 1, sel: ".post-options-sheet .post-option", texte: "Emojis 🚩 🚫 en guise d'icônes" },
            { n: 2, sel: ".post-options-sheet .post-option.danger", texte: "« Bloquer Léa Fontaine » : effet immédiat, sans confirmation — et l'abonnement est rompu" },
          ],
          apres: { js: async (page) => { await page.evaluate(() => { const o = document.querySelectorAll(".post-options-sheet .post-option"); const ic = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>"; if (o[0]) o[0].innerHTML = ic('<path d="M6 21V4"/><path d="M6 5h11l-2 4 2 4H6"/>') + "Signaler cette publication"; if (o[1]) o[1].innerHTML = ic('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>') + "Bloquer Léa Fontaine…"; }); } },
          annotations: [
            { n: 1, sel: ".post-options-sheet .post-option", texte: "Pictogrammes SVG, comme « Supprimer » dans le menu de mes publications" },
            { n: 2, sel: ".post-options-sheet .post-option.danger", texte: "Les points de suspension annoncent la confirmation qui dit les conséquences (ne plus se voir, ne plus se suivre)" },
          ],
        });
        await page.locator(".post-options-sheet .post-option").first().click();
        await page.waitForTimeout(700);
        await prendre({ id: "FIL-061", titre: "Signaler une publication — saisie du motif", zooms: [{ nom: "motif", titre: "Motif", sel: "#signalementMotif", marge: 40 }] });
        await page.evaluate(() => _signalementAnnuler());
        await page.waitForTimeout(400);
        // Options de MA publication
        await montrer(page, "pf_moi_texte");
        await page.locator(carte("pf_moi_texte") + " .post-menu-btn").click();
        await page.waitForTimeout(500);
        await prendre({
          id: "FIL-062",
          titre: "Options de ma publication (« ⋯ »)",
          annotationsAvant: [{ n: 1, sel: ".post-options-sheet .post-option.danger", texte: "Une seule action : « Supprimer le post » (une coquille dans le texte ne se corrige pas)" }],
        });
        await page.locator(".post-options-sheet .post-option.danger").click();
        await page.waitForTimeout(600);
        await prendre({
          id: "FIL-063",
          titre: "Confirmation de suppression d'une publication",
          annotationsAvant: [{ n: 1, sel: "#modalContent .pay-modal-title", texte: "« Supprimer ce post ? » — confirmation claire, aperçu du texte, bouton rouge séparé d'« Annuler »" }],
        });
        await page.locator("#modalContent .btn.ghost").click();
        await page.waitForTimeout(400);
        // Feuille « Trouver une expérience »
        await page.locator(carte("pf_moi_texte") + " .v3-tempt").click();
        await page.waitForTimeout(700);
        await prendre({ id: "FIL-064", titre: "Feuille « Trouver une expérience » ouverte depuis une carte", note: "Porte d'entrée vers l'IRL ; l'intérieur des parcours relève des domaines IRL." });
      },
    },
    // ───────────────────────────────────────────────────────────────────────
    {
      nom: "fil-modules",
      demarrage: COMPTE,
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(2500);
        await prendre({
          id: "FIL-016",
          titre: "Rangée de stories (porte d'entrée)",
          mesurer: false,
          zooms: [{ nom: "stories", titre: "Rangée de stories", sel: "#storiesRowFeed", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#storiesRowFeed .story-item:nth-child(2)", texte: "Bulles de 48 × 59 px, prénom seul en 9,5 px ; stories réelles et d'exemple mêlées sans distinction" }],
        });
        await page.evaluate(() => { const c = document.querySelector("#feedList .v2-reels"), m = document.getElementById("appMain"); if (c) m.scrollTop += c.getBoundingClientRect().top - 76; });
        await page.waitForTimeout(700);
        await prendre({
          id: "FIL-017",
          titre: "Module « Bobines à découvrir » inséré dans le fil (porte d'entrée)",
          zooms: [{ nom: "bobines", titre: "Rail de bobines", sel: "#feedList .v2-reels", marge: 4 }],
        });
        await page.evaluate(() => { const c = document.querySelector("#feedList .v2-people"), m = document.getElementById("appMain"); if (c) m.scrollTop += c.getBoundingClientRect().top - 76; });
        await page.waitForTimeout(700);
        await prendre({
          id: "FIL-018",
          titre: "Module « Passionnés à découvrir » inséré dans le fil",
          zooms: [{ nom: "personnes", titre: "Passionnés à découvrir", sel: "#feedList .v2-people", marge: 4 }],
        });
        await page.evaluate(() => { const m = document.getElementById("appMain"); m.scrollTop = m.scrollHeight; });
        await page.waitForTimeout(1200);
        await page.evaluate(() => { const c = document.querySelector("#feedList .feed-exemples-sep"), m = document.getElementById("appMain"); if (c) m.scrollTop += c.getBoundingClientRect().top - 300; });
        await page.waitForTimeout(700);
        await prendre({
          id: "FIL-019",
          titre: "Séparateur « Exemples PASSIO » après les publications réelles (« Tu es à jour »)",
          zooms: [{ nom: "separateur", titre: "Séparateur", sel: "#feedList .feed-exemples-sep", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#feedList .feed-exemples-sep", texte: "« Tu es à jour » : la frontière entre le réel et les exemples est dite" }],
        });
      },
    },
    // ───────────────────────────────────────────────────────────────────────
    {
      nom: "etats-du-fil",
      demarrage: { mode: "compte", nbPassions: 1, peupler: (srv, ctx) => { jeu.peuplerVide(srv, ctx); } },
      vues: ["m390"],
      async derouler({ page, prendre, context }) {
        await page.waitForTimeout(1500);
        await prendre({
          id: "FIL-070",
          titre: "Fil d'un compte sans publication réelle — séparateur « Exemples PASSIO » en tête",
          zooms: [{ nom: "separateur", titre: "Séparateur", sel: ".feed-exemples-sep", marge: 6 }],
          annotationsAvant: [
            { n: 1, sel: ".feed-exemples-sep-texte", texte: "Quatre lignes centrées en 12 px avant le premier contenu" },
            { n: 2, sel: ".feed-exemples-sep-actions", texte: "Deux boutons (« Publier la première », « Inviter quelqu'un ») avant d'avoir rien lu" },
          ],
          apres: { css: `.feed-exemples-sep-texte{ font-size:0 !important; } .feed-exemples-sep-texte::after{ content:"Personne de ta communauté n'a encore publié ici : voici des exemples."; font-size:13px; line-height:1.45; color:var(--text); } .feed-exemples-sep{ padding-top:10px; padding-bottom:10px; } .feed-exemples-sep-actions{ margin-top:8px; } .feed-exemples-sep-cta, .feed-exemples-sep-invite{ min-height:40px; }` },
          annotations: [{ n: 1, sel: ".feed-exemples-sep", texte: "Une phrase en 13 px, encre pleine ; mêmes deux gestes, séparateur plus bas d'un tiers" }],
        });
        await page.evaluate(() => { const c = document.querySelector("#feedList .post"), m = document.getElementById("appMain"); m.scrollTop += c.getBoundingClientRect().top - 76; });
        await page.waitForTimeout(500);
        await prendre({
          id: "FIL-071",
          titre: "Carte d'exemple (« Exemple PASSIO »)",
          zooms: [{ nom: "entete", titre: "En-tête d'une carte d'exemple", sel: "#feedList .post .post-header", marge: 6 }],
        });
        await haut(page);
        // Envie qui vide le fil ? « Rencontrer » sur les exemples de musique
        await page.locator('#profileStrip .profile-tile[data-passion-tile]').filter({ hasText: "Musique" }).click();
        await page.waitForTimeout(900);
        await prendre({
          id: "FIL-072",
          titre: "État vide — « Suivis » seul coché, aucun abonnement",
          zooms: [{ nom: "vide", titre: "Message", sel: "#feedEmpty", marge: 6 }],
        });
        await page.locator('#feedIntentSelector .feed-intent-btn[data-intent="learn"]').click();
        await page.waitForTimeout(700);
        await prendre({ id: "FIL-073", titre: "Envie cochée sans source — l'écran reste « Tu ne suis encore personne »", zooms: [{ nom: "envies", titre: "Envie active", sel: "#feedIntentSelector", marge: 6 }] });
        await page.locator('#feedIntentSelector .feed-intent-btn[data-intent="learn"]').click();
        await page.locator('#profileStrip .profile-tile').first().click();
        await page.waitForTimeout(900);
        await prendre({
          id: "FIL-074",
          titre: "État vide — rien de sélectionné (« Choisis tes passions »)",
          zooms: [{ nom: "vide", titre: "Message et action", sel: "#feedEmpty", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#profileStrip", texte: "Toutes les bulles sont décochées : elles perdent leur lavis, sans autre indice" }],
        });
        // Retour : musique cochée + envie « Rencontrer » puis « Apprendre »
        await page.locator('#profileStrip .profile-tile[data-passion-tile]').filter({ hasText: "Musique" }).click();
        await page.waitForTimeout(600);
        await page.locator('#feedIntentSelector .feed-intent-btn[data-intent="meet"]').click();
        await page.waitForTimeout(900);
        await prendre({
          id: "FIL-075",
          titre: "Fil filtré par l'envie « Rencontrer »",
          zooms: [{ nom: "envies", titre: "Envie cochée", sel: "#feedIntentSelector", marge: 6 }],
        });
        await page.locator('#feedIntentSelector .feed-intent-btn[data-intent="meet"]').click();
        await page.waitForTimeout(500);
        // Hors ligne
        await context.setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event("offline")));
        await page.waitForTimeout(1200);
        await prendre({ id: "FIL-076", titre: "Fil hors ligne (bandeau)", note: "État SIMULÉ : contexte Playwright hors ligne + événement « offline »." });
        await context.setOffline(false);
      },
    },
    // ───────────────────────────────────────────────────────────────────────
    {
      nom: "visiteur",
      demarrage: { mode: "visiteur" },
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(1200);
        await prendre({
          id: "FIL-080",
          titre: "Fil d'un visiteur — carte de bienvenue puis « Exemples PASSIO »",
          annotationsAvant: [
            { n: 1, sel: ".fr-welcome", texte: "Carte de bienvenue : une action principale claire" },
            { n: 2, sel: ".feed-exemples-sep", texte: "« Pas encore de publication de ta communauté » + « Publier la première » : un visiteur n'a ni communauté ni compte" },
            { n: 3, sel: "#feedList .post", texte: "Le premier contenu n'apparaît qu'à 670 px sur 844" },
          ],
          apres: { css: `.feed-exemples-sep-actions{ display:none !important; } .feed-exemples-sep-texte{ font-size:0 !important; } .feed-exemples-sep-texte::after{ content:"Voici des exemples de ce qui se partage sur PASSIO."; font-size:13px; color:var(--text); } .feed-exemples-sep{ padding-top:8px; padding-bottom:8px; }` },
          annotations: [
            { n: 1, sel: ".feed-exemples-sep", texte: "Pour un visiteur : une ligne, aucun second bouton violet en concurrence avec « Choisir mes passions »" },
            { n: 2, sel: "#feedList .post", texte: "Le premier contenu remonte d'environ 110 px" },
          ],
        });
        const like = page.locator('#feedList .post [data-action="like"]').first();
        await like.scrollIntoViewIfNeeded();
        await like.click({ force: true });
        await page.waitForTimeout(900);
        await prendre({ id: "FIL-081", titre: "Visiteur — « Crée ton compte pour aimer cette publication »", annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title", texte: "Le motif est nommé, « Continuer à explorer » laisse sortir sans compte" }] });
      },
    },
    // ───────────────────────────────────────────────────────────────────────
    {
      nom: "volume",
      // L'état local porte déjà les abonnements (comme sur un appareil qui a déjà servi) :
      // sans cela, la première lecture du fil précède celle des abonnements et écarte
      // la publication du compte privé jusqu'au rafraîchissement suivant.
      demarrage: { mode: "compte", etat: etatAvecAbonnements(), peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx, { volume: true, priveSuivi: true }); } },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(2500);
        await montrer(page, "pf_prive");
        await prendre({ id: "FIL-090", titre: "Carte — publication d'un compte privé que je suis", zooms: [{ nom: "entete", titre: "En-tête", sel: carte("pf_prive") + " .post-header", marge: 6 }], annotationsAvant: [{ n: 1, sel: carte("pf_prive") + " .post-header", texte: "Rien n'indique que cette publication n'est visible que des abonnés" }] });
        await page.evaluate(() => { const m = document.getElementById("appMain"); m.scrollTop = m.scrollHeight; });
        await page.waitForTimeout(1500);
        await page.evaluate(() => { const m = document.getElementById("appMain"); m.scrollTop = m.scrollHeight; });
        await page.waitForTimeout(800);
        await prendre({
          id: "FIL-091",
          titre: "Bas de fil — « Charger plus de posts » (fil de 80 publications)",
          zooms: [{ nom: "bouton", titre: "Bouton de pagination", sel: "#feedLoadMoreBtn", marge: 10 }],
          annotationsAvant: [{ n: 1, sel: "#feedLoadMoreBtn", texte: "« ⤵ Charger plus de posts » : geste manuel, mot « posts »" }],
        });
        await page.locator("#feedLoadMoreBtn").click();
        await page.waitForTimeout(2200);
        await prendre({ id: "FIL-092", titre: "Après « Charger plus » — la suite s'ajoute sous la position de lecture" });
      },
    },
  ],
};
