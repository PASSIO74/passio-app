// ═══════════════════════════════════════════════════════════════════════════
// SCÉNARIOS DE CAPTURE — DOMAINE « CRÉATION ET MÉDIAS » (CRE-…)
//
// Contournements du banc, déclarés une fois :
//  ① LE TOAST. Le banc capture « animations coupées » : Playwright avance alors
//     `toastOut … forwards` à sa fin et tout toast sort transparent.
//     `figerToasts` pose `.toast{animation:none}` (même parade que `partage`).
//  ② LE RÉFÉRENTIEL DES PASSIONS. `jeu/creation.js` sème la table `passions`
//     du faux serveur avec les 5 001 identifiants de `data/passions-v1.json`,
//     comme en production ; sans elle, le sélecteur refuserait toute passion fine.
//  ③ CAMÉRA ET MICRO. Le Chromium du banc n'a ni caméra ni micro : l'éditeur
//     média tombe sur son repli « pas de caméra » et le micro est refusé. Les
//     AVANT montrent donc ces branches-là ; la capture réelle est inaccessible.
//  ④ LE PROMPT. `meAddText` ouvre un `prompt()` natif : le banc le remplit
//     (« Session du jeudi ») ; une boîte native ne se photographie pas.
//  ⑤ GIF. Klipy et Giphy sont refusés par le banc : le panneau GIF montre des
//     vignettes vides (artefact du banc, pas du produit).
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const path = require("path");
const jeu = require("../jeu/creation");
const MEDIAS = path.join(__dirname, "..", "medias");

const compte = (extra) => Object.assign({ mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) }, extra || {});
const figerToasts = (page) => page.addStyleTag({ content: ".toast{animation:none!important;opacity:1!important}" });
const viderToasts = (page) => page.evaluate(() => { document.querySelectorAll(".toast").forEach((t) => t.remove()); window.__toasts = []; });
const ouvrirCreer = async (page) => { await page.locator('#appNavV2 [data-v2-action="create"]').click(); await page.waitForTimeout(500); };
const studio = async (page) => { await ouvrirCreer(page); await page.locator('[data-v2-create="post"]').click(); await page.waitForTimeout(700); };
const haut = (page) => page.evaluate(() => { const m = document.getElementById("appMain"); if (m) m.scrollTop = 0; });

// ── MAQUETTES (feuilles de style appliquées par le banc, jamais dans l'app) ──
const CSS_ENVIE = `
  #fieldMood > span{font-size:0!important;letter-spacing:0!important;}
  #fieldMood > span::after{content:"Envie";font-size:13px;font-weight:600;color:var(--text-dim);text-transform:none;letter-spacing:0;}
  #fieldMood .pill-row{display:flex!important;flex-wrap:wrap;}
  #fieldMood .pill-row .pill{min-height:44px!important;font-size:13px!important;padding:0 14px!important;}
  #fieldMood .pill-row .pill[data-postmood="learn"]{order:1} #fieldMood .pill-row .pill[data-postmood="creation"]{order:2}
  #fieldMood .pill-row .pill[data-postmood="irl"]{order:3} #fieldMood .pill-row .pill[data-postmood="all"]{order:4}
`;
const CSS_MEDIA = `
  #studioPhoto .upload-zone, #studioVideo .upload-zone{display:none!important;}
  #studioVideo .section-subtitle{display:none!important;}
  .photo-clear{width:44px!important;height:44px!important;top:8px!important;right:8px!important;font-size:18px!important;display:flex!important;align-items:center;justify-content:center;}
`;
const CSS_SYNC = `#screen-feed .post span[style*="font-size:10px"]{font-size:12px!important;font-weight:700;color:var(--text-dim)!important;}`;

module.exports = {
  domaine: "creation",
  scenarios: [
    // ─────────────────────────── FEUILLE « CRÉER » ───────────────────────────
    {
      nom: "feuille-creer",
      demarrage: compte(),
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await ouvrirCreer(page);
        await prendre({
          id: "CRE-001", titre: "Barre basse « Créer » → feuille Créer (six entrées)",
          zooms: [{ nom: "feuille", titre: "La feuille", sel: ".v2-sheet", marge: 0 }, { nom: "fermer", titre: "Fermer", sel: ".v2-sheet-close", marge: 10 }],
          annotationsAvant: [
            { n: 1, sel: '[data-v2-create="post"] .v2-sheet-item-hint', texte: "« Photo / vidéo » : le texte seul n'est pas annoncé" },
            { n: 2, sel: ".v2-sheet-close", texte: "Fermer : 34 × 34 px" },
          ],
          apres: { css: `.v2-sheet-close{width:44px!important;height:44px!important;}
            [data-v2-create="post"] .v2-sheet-item-hint{font-size:0!important;}
            [data-v2-create="post"] .v2-sheet-item-hint::after{content:"Texte, photo ou vidéo";font-size:12px;}` },
          annotations: [
            { n: 1, sel: '[data-v2-create="post"] .v2-sheet-item-hint', texte: "Dit tout ce que la publication accepte" },
            { n: 2, sel: ".v2-sheet-close", texte: "Fermer porté à 44 × 44 px" },
          ],
        });
      },
    },
    // ─────────────────────────────── STUDIO ──────────────────────────────────
    {
      nom: "studio",
      demarrage: compte(),
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre, banc, vue }) {
        await studio(page);
        await prendre({
          id: "CRE-002", titre: "Studio — composer vide (UI-6)",
          zooms: [{ nom: "envie", titre: "Bloc « MOOD » et pastilles", sel: "#fieldMood", marge: 6 }, { nom: "destination", titre: "Publier dans", sel: ".v6-passio", marge: 6 }],
          annotationsAvant: [
            { n: 1, sel: "#fieldMood > span", texte: "« MOOD » (anglais) ; le Fil dit « Envie du moment »" },
            { n: 2, sel: '#postMoodRow .pill[data-postmood="learn"]', texte: "Pastilles 40 px, texte 11 px ; ordre différent du Fil" },
            { n: 3, sel: ".v6-media", texte: "Deux portes média, aucune trace d'un brouillon" },
          ],
          apres: { css: CSS_ENVIE },
          annotations: [
            { n: 1, sel: "#fieldMood > span", texte: "« Envie » : le mot du Fil" },
            { n: 2, sel: '#postMoodRow .pill[data-postmood="learn"]', texte: "44 px, 13 px, même ordre que le rail du Fil" },
          ],
        });
        if (vue === "m390" || vue === "m360") {
          await page.locator("#postText").click();
          await page.locator("#postText").fill("Ce soir j'ai enfin réglé la hauteur des cordes : trois tours de clé, une heure d'essais, et la guitare ne frise plus sur la 7e case.");
          const rendre = await banc.simulerClavier(page, 300);
          await prendre({
            id: "CRE-003", titre: "Studio — texte saisi, clavier ouvert (simulé)",
            note: "Clavier SIMULÉ : la fenêtre est réduite de 300 px (banc.simulerClavier).",
            annotationsAvant: [{ n: 1, sel: "#postText", texte: "Aucun compteur (limite 1 200 caractères silencieuse)" }],
          });
          await rendre();
        }
        if (vue !== "m390") return;
        await haut(page);
        await page.locator(".v6-passio .v6-lien").click(); await page.waitForTimeout(1500);
        await prendre({
          id: "CRE-004", titre: "Choix de la passion — « Associer cette publication à une passion »",
          zooms: [{ nom: "entete", titre: "Titre et consigne", sel: ".modal .modal-title", marge: 40 }],
          annotationsAvant: [{ n: 1, sel: ".modal .psel-item", texte: "« + » sur chaque ligne : ajouter… à quoi ?" }],
        });
        await page.locator(".modal input").first().fill("Escalade"); await page.waitForTimeout(1200);
        await page.locator(".modal .psel-item", { hasText: "Escalade de bloc" }).first().click(); await page.waitForTimeout(700);
        await prendre({
          id: "CRE-005", titre: "Choix de la passion — passion fine sélectionnée, avant validation",
          annotationsAvant: [
            { n: 1, sel: ".modal .psel-choisies", texte: "« TES PASSIONS » : la passion va rejoindre le compte" },
            { n: 2, sel: ".modal button.btn.primary, .modal .psel-valider, .modal button:has-text('Publier dans cette passion')", texte: "Rien ne le dit au moment de valider" },
          ],
          apres: {
            js: async (page) => {
              await page.addStyleTag({ content: ".mq-note{margin:8px 0 0;padding:10px 12px;border-radius:12px;background:var(--accent-tile,#f3effe);border:1px solid var(--accent-tile-line,#e2d9fb);color:var(--text);font-size:13px;line-height:1.4;}" });
              await page.evaluate(() => {
                const z = document.querySelector(".modal .psel-choisies"); if (!z) return;
                const t = z.firstElementChild; if (t) t.textContent = "POUR CETTE PUBLICATION";
                const n = document.createElement("div"); n.className = "mq-note"; n.setAttribute("data-mq", "note");
                n.textContent = "« Escalade de bloc » rejoindra aussi tes passions (profil, fil). Tu pourras la retirer dans Mes passions.";
                z.parentNode.insertBefore(n, z.nextSibling);
              });
            },
          },
          annotations: [
            { n: 1, sel: ".modal .psel-choisies", texte: "Le choix porte sur la publication" },
            { n: 2, sel: "[data-mq='note']", texte: "La conséquence sur le compte est dite avant de valider" },
          ],
        });
      },
    },
    // ─────────────────────────────── PHOTO ───────────────────────────────────
    {
      nom: "photo",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        await studio(page);
        await page.setInputFiles("#photoInput", path.join(MEDIAS, "photo-paysage.jpg")); await page.waitForTimeout(1000);
        await prendre({
          id: "CRE-006", titre: "Studio — photo ajoutée (aperçu)",
          zooms: [{ nom: "retirer", titre: "Retirer la photo", sel: ".photo-clear", marge: 10 }],
          annotationsAvant: [
            { n: 1, sel: ".photo-clear", texte: "Retirer : 28 × 28 px, sans nom accessible" },
            { n: 2, sel: "#studioPhoto .upload-zone", texte: "Seconde zone « Ajouter une photo », sombre et illisible" },
          ],
          apres: { css: CSS_MEDIA },
          annotations: [
            { n: 1, sel: ".photo-clear", texte: "Retirer : 44 × 44 px" },
            { n: 2, sel: ".v6-passio", texte: "Plus de zone en double : la destination remonte" },
          ],
        });
        await page.locator(".photo-clear").click(); await page.waitForTimeout(300);
        await page.locator("#postText").fill("Petit essai de texte sans photo.");
        await viderToasts(page);
        await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(500);
        await prendre({
          id: "CRE-007", titre: "Studio — photo retirée, texte seul refusé « Ajoute une photo. »",
          annotationsAvant: [
            { n: 1, sel: "#studioPhoto .upload-zone", texte: "La photo est retirée mais le Studio reste en mode photo" },
            { n: 2, sel: ".toast", texte: "« Ajoute une photo. » : le texte seul ne part plus" },
          ],
          apres: { css: CSS_MEDIA + ".toast{display:none!important}" },
          annotations: [{ n: 1, sel: "#postText", texte: "Après ✕ : retour au texte seul, Publier envoie le texte" }],
        });
        await viderToasts(page);
        await page.setInputFiles("#photoInput", path.join(MEDIAS, "boucle.webm")); await page.waitForTimeout(500);
        await prendre({
          id: "CRE-008", titre: "Studio — fichier qui n'est pas une image",
          annotationsAvant: [{ n: 1, sel: ".toast", texte: "« Choisis une image. » : clair" }],
        });
      },
    },
    // ─────────────────────────── VIDÉO ET AUDIO ──────────────────────────────
    {
      nom: "video-audio",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        await studio(page);
        await page.setInputFiles("#videoInput", path.join(MEDIAS, "boucle.webm"));
        for (let i = 0; i < 60; i++) { if (await page.evaluate(() => !!videoDataUrl)) break; await page.waitForTimeout(1000); }
        await page.waitForTimeout(800);
        await prendre({
          id: "CRE-009", titre: "Studio — vidéo ajoutée (aperçu, transcodée en MP4)",
          note: "boucle.webm (606 Ko) est transcodée en MP4 par passioVideoPourEnvoi (Chromium sait encoder le MP4).",
          annotationsAvant: [{ n: 1, sel: "#studioVideo .upload-zone", texte: "Seconde zone « Ajouter une vidéo », sombre" }],
          apres: { css: CSS_MEDIA },
          annotations: [{ n: 1, sel: ".v6-passio", texte: "Zone en double retirée ; Publier reste en vue plus tôt" }],
        });
        await viderToasts(page);
        await ouvrirCreer(page);
        await page.locator('[data-v2-create="audio"]').click(); await page.waitForTimeout(900);
        await page.locator("#recBtn").click(); await page.waitForTimeout(900);
        await prendre({
          id: "CRE-010", titre: "Créer → Audio / podcast — micro refusé",
          note: "Micro absent dans le banc : branche « refusé ».",
          annotationsAvant: [
            { n: 1, sel: "#recBtn", texte: "Bouton micro sans nom accessible" },
            { n: 2, sel: "#audioFileBtn", texte: "« Choisir fichier » : aussi fort que Publier" },
          ],
          apres: { css: "#audioFileBtn{background:#fff!important;color:var(--accent)!important;border:1px solid var(--accent-tile-line,#e2d9fb)!important;box-shadow:none!important;font-weight:700!important;font-size:14px!important;}" },
          annotations: [{ n: 2, sel: "#audioFileBtn", texte: "Action secondaire en contour ; Publier reste la seule action pleine" }],
        });
        await viderToasts(page);
        await studio(page);
        await page.locator("#postText").fill("Un texte simple, sans audio.");
        await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(500);
        await prendre({
          id: "CRE-011", titre: "Créer → Publication après Audio : le bloc audio reste, le texte est refusé",
          annotationsAvant: [
            { n: 1, sel: "#studioAudio .recorder", texte: "Bloc audio toujours là" },
            { n: 2, sel: ".toast", texte: "« Enregistre un audio. » pour un texte seul" },
          ],
        });
      },
    },
    // ─────────────────────────────── PUBLIER ─────────────────────────────────
    {
      nom: "publier",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        await studio(page);
        await viderToasts(page);
        await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(400);
        await prendre({ id: "CRE-012", titre: "Studio — Publier sans rien écrire", annotationsAvant: [{ n: 1, sel: ".toast", texte: "« Écris quelque chose. »" }] });
        await viderToasts(page);
        await page.locator("#postText").fill("Premier essai de publication au Studio.");
        await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(900);
        await prendre({
          id: "CRE-013", titre: "Après Publier — retour au Fil, carte optimiste et confirmation",
          zooms: [{ nom: "carte", titre: "En-tête de la carte publiée", sel: "#screen-feed .post .post-header, #screen-feed .post", marge: 4 }],
          annotationsAvant: [
            { n: 1, sel: '#screen-feed .post span[style*="font-size:10px"]', texte: "« Sync… » 10 px, figé même une fois publié" },
            { n: 2, sel: ".toast", texte: "« Post publié » ; ailleurs « publication »" },
          ],
          apres: { css: CSS_SYNC },
          annotations: [{ n: 1, sel: '#screen-feed .post span[style*="font-size:10px"]', texte: "État lisible (12 px) — et tenu à jour au verdict" }],
        });
        // Refus serveur : l'insert `posts` répond 403 (RLS), à partir d'ici.
        await page.route(/\/rest\/v1\/posts/, (route) => route.request().method() === "POST"
          ? route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy" }) })
          : route.fallback());
        await viderToasts(page);
        await studio(page);
        await page.locator("#postText").fill("Publication que le serveur refuse.");
        await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(5600);
        await prendre({
          id: "CRE-014", titre: "Publication refusée par le serveur (403 simulé)",
          note: "Refus SIMULÉ : page.route répond 403 à l'insert `posts`.",
          annotationsAvant: [
            { n: 1, sel: ".toast", texte: "« connexion lente » pour un refus" },
            { n: 2, sel: '#screen-feed .post span[style*="font-size:10px"]', texte: "La carte dit encore « Sync… »" },
          ],
        });
        await page.reload(); await page.waitForTimeout(3500);
        await page.evaluate(() => goTo("studio")); await page.waitForTimeout(600);
        await prendre({ id: "CRE-015", titre: "Studio après rechargement en cours de saisie : texte perdu", note: "Texte saisi puis page rechargée (sonde creation-02) : le champ revient vide.", annotationsAvant: [{ n: 1, sel: "#postText", texte: "Le texte saisi avant le rechargement a disparu" }] });
      },
    },
    // ─────────────────────── LIEN AVEC UNE ACTIVITÉ ──────────────────────────
    {
      nom: "experience",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => openEventDetails("ev_cre_passee")); await page.waitForTimeout(1600);
        await page.locator("button", { hasText: "Partager mon expérience" }).first().click(); await page.waitForTimeout(1200);
        await viderToasts(page);
        await prendre({
          id: "CRE-016", titre: "Studio ouvert depuis « Partager mon expérience » (activité passée)",
          annotationsAvant: [{ n: 1, sel: "#postText", texte: "Seule trace de l'activité : le texte pré-rempli ; le rattachement est invisible" }],
          apres: {
            js: async (page) => {
              await page.addStyleTag({ content: ".mq-act{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 12px;border-radius:12px;background:var(--accent-tile,#f3effe);border:1px solid var(--accent-tile-line,#e2d9fb);font-size:13px;color:var(--text);} .mq-act b{font-weight:700} .mq-act span{flex:1;min-width:0} .mq-act button{min-height:44px;padding:0 12px;border:0;background:none;color:var(--accent);font-weight:700;font-size:13px;}" });
              await page.evaluate(() => {
                const c = document.getElementById("v6Composer"); const ref = c && c.querySelector(".v6-passio"); if (!ref) return;
                const d = document.createElement("div"); d.className = "mq-act"; d.setAttribute("data-mq", "act");
                d.innerHTML = '<span>Liée à l\'activité <b>Atelier cordes et chevalets</b> · rejoindra son album</span><button type="button">Retirer</button>';
                c.insertBefore(d, ref);
              });
            },
          },
          annotations: [{ n: 1, sel: "[data-mq='act']", texte: "Le lien est visible et se retire ; il ne survit pas à l'abandon du Studio" }],
        });
      },
    },
    // ───────────────────────── MENU DE MA PUBLICATION ────────────────────────
    {
      nom: "menu",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => { if (typeof openPostOptions === "function") openPostOptions("pa_moi_1"); }); await page.waitForTimeout(600);
        await prendre({
          id: "CRE-017", titre: "Menu ⋯ de ma publication",
          note: "Ouvert par openPostOptions (même fonction que le ⋯ de mes cartes, vu par un vrai geste dans la sonde creation-06).",
          annotationsAvant: [{ n: 1, sel: ".post-option.danger", texte: "Seule action : supprimer (« le post ») — pas de modification" }],
        });
      },
    },
    // ─────────────────────────────── BOBINE ──────────────────────────────────
    {
      nom: "bobine",
      demarrage: compte(),
      vues: ["m390", "m360"],
      async derouler({ page, prendre, vue }) {
        await figerToasts(page);
        await ouvrirCreer(page);
        await page.locator('[data-v2-create="bobine"]').click(); await page.waitForTimeout(2500);
        await prendre({
          id: "CRE-018", titre: "Bobine — capture, caméra indisponible (repli galerie)", seulement: ["m390"],
          note: "Pas de caméra dans le banc : branche `me-no-cam`.",
          annotationsAvant: [{ n: 1, sel: "#mePlaceholder", texte: "Ne dit pas pourquoi la caméra ne s'ouvre pas" }],
        });
        await page.setInputFiles("#meMediaInput", path.join(MEDIAS, "boucle.webm"));
        for (let i = 0; i < 60; i++) { if (await page.evaluate(() => document.getElementById("mediaEditor").classList.contains("phase-edit"))) break; await page.waitForTimeout(1000); }
        await page.waitForTimeout(1200);
        await page.evaluate(() => { const v = document.querySelector("#meMedia video"); if (v) { v.pause(); v.currentTime = 1; } });
        await page.waitForTimeout(400);
        await prendre({
          id: "CRE-019", titre: "Bobine — aperçu : Recommencer / Continuer", seulement: ["m390"],
          zooms: [{ nom: "bas", titre: "Outils et issues", sel: "#mediaEditor .me-bottom", marge: 70 }],
          annotationsAvant: [
            { n: 1, sel: '[data-v7-bobine-act="recommencer"]', texte: "« Recommencer » presque invisible (gris sur sombre)" },
            { n: 2, sel: "#mediaEditor .me-tool-group", texte: "Outils 40 px, nommés par une bulle seulement" },
          ],
          apres: { css: `[data-v7-bobine-act="recommencer"]{background:rgba(255,255,255,.14)!important;color:#fff!important;border:1px solid rgba(255,255,255,.55)!important;}
            #mediaEditor .me-tool{min-width:44px!important;min-height:44px!important;}
            #mediaEditor .me-bottom .btn{min-height:48px!important;}` },
          annotations: [
            { n: 1, sel: '[data-v7-bobine-act="recommencer"]', texte: "Lisible, secondaire, 48 px" },
            { n: 2, sel: "#mediaEditor .me-tool-group", texte: "Outils 44 px" },
          ],
        });
        await page.locator('[data-v7-bobine-act="continuer"]').click(); await page.waitForTimeout(700);
        await prendre({
          id: "CRE-020", titre: "Bobine — feuille « Ta bobine » (description, passion, couverture, activité)",
          zooms: [{ nom: "couverture", titre: "Couverture", sel: "#v7BobineSheet .v7-cover-row", marge: 8 }],
          annotationsAvant: [
            { n: 1, sel: "#v7BobinePassion", texte: "« Passion » : liste du compte, pas la recherche du Studio" },
            { n: 2, sel: "#v7BobineCoverBtn", texte: "« Choisir une image » : 29 px de haut" },
          ],
          apres: { css: `#v7BobineCoverBtn,#v7BobineCoverClear{min-height:44px!important;font-size:14px!important;}
            #v7BobineSheet .v7-champ:nth-of-type(2) > span{font-size:0!important;}
            #v7BobineSheet .v7-champ:nth-of-type(2) > span::after{content:"Publier dans";font-size:13px;}` },
          annotations: [
            { n: 1, sel: "#v7BobinePassion", texte: "Même mot que le Studio (« Publier dans ») — et même sélecteur" },
            { n: 2, sel: "#v7BobineCoverBtn", texte: "44 px" },
          ],
        });
        if (vue !== "m390") return;
        await page.locator("#v7BobineDesc").fill("Trente secondes au kiosque.");
        await viderToasts(page);
        await page.locator("#v7BobinePublier").click(); await page.waitForTimeout(1500);
        await prendre({ id: "CRE-021", titre: "Bobine publiée — retour et confirmation", annotationsAvant: [{ n: 1, sel: ".toast", texte: "« Bobine en cours de publication… » puis « Bobine publiée »" }] });
        await page.evaluate(() => { _meShowProgress("Optimisation de la vidéo…"); _meUpdateProgress(0.42); });
        await page.waitForTimeout(300);
        await prendre({
          id: "CRE-022", titre: "Préparation d'une vidéo lourde — progression (simulée)",
          note: "SIMULÉ : _meShowProgress + _meUpdateProgress(0.42) ; la vraie compression ne part qu'au-delà de 2 Mo.",
          annotationsAvant: [{ n: 1, sel: "#meProgressOv", texte: "Ni annulation, ni durée restante (borne : 90 s)" }],
        });
      },
    },
    // ──────────────────────────────── STORY ──────────────────────────────────
    {
      nom: "story",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        page.on("dialog", async (d) => { await d.accept("Session du jeudi"); });
        await figerToasts(page);
        await ouvrirCreer(page);
        await page.locator('[data-v2-create="story"]').click(); await page.waitForTimeout(2500);
        await prendre({ id: "CRE-023", titre: "Story — capture, caméra indisponible (galerie ou fond coloré)", annotationsAvant: [{ n: 1, sel: "#meGradientBtn", texte: "« …ou un fond coloré » : le chemin texte seul" }] });
        await page.locator("#meGradientBtn").click(); await page.waitForTimeout(700);
        await prendre({
          id: "CRE-024", titre: "Story — fond coloré, outils et Publier",
          annotationsAvant: [{ n: 1, sel: "#mePublishBtn", texte: "Ni durée (24 h), ni public, ni passion annoncés" }],
          apres: { css: `#mediaEditor .me-bottom::before{content:"Visible 24 h par ta communauté · 🎸 Musique";display:block;text-align:center;color:#fff;font-size:13px;font-weight:600;margin:0 0 8px;text-shadow:0 1px 2px rgba(0,0,0,.35);}
            #mediaEditor .me-tool{min-width:44px!important;min-height:44px!important;}` },
          annotations: [{ n: 1, sel: "#mediaEditor .me-bottom", texte: "Durée, public et passion dits au moment de publier" }],
        });
        await page.locator(".me-tool", { hasText: "Aa" }).click(); await page.waitForTimeout(700);
        await prendre({
          id: "CRE-025", titre: "Story — texte superposé (saisi dans une boîte native prompt())",
          note: "Le texte est saisi dans un prompt() natif (« Ton texte : »), rempli par le banc.",
          zooms: [{ nom: "texte", titre: "Le texte et ses poignées", sel: "#meOverlays .me-overlay", marge: 18 }],
          annotationsAvant: [{ n: 1, sel: "#meOverlays .me-ov-del", texte: "Supprimer 22 px, sans nom ; Redimensionner 24 px" }],
          apres: {
            js: async (page) => {
              await page.addStyleTag({ content: `#meOverlays .me-ov-ctrl{width:32px!important;height:32px!important;font-size:15px!important;}
                .mq-txt{position:fixed;left:0;right:0;bottom:0;z-index:4200;background:#fff;border-radius:20px 20px 0 0;padding:14px 16px 18px;box-shadow:0 -8px 24px rgba(0,0,0,.25);}
                .mq-txt input{width:100%;box-sizing:border-box;font-size:16px;padding:12px;border:1px solid var(--border);border-radius:12px;color:var(--text);}
                .mq-txt .l{display:flex;gap:10px;align-items:center;margin-top:10px;} .mq-txt .l i{width:28px;height:28px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px var(--border);}
                .mq-txt .l button{margin-left:auto;min-height:44px;padding:0 20px;border-radius:12px;border:0;background:var(--accent);color:#fff;font-weight:700;font-size:15px;}
                .mq-txt b{display:block;font-family:var(--v2-titre,Manrope,sans-serif);font-size:15px;margin-bottom:8px;color:var(--text);}` });
              await page.evaluate(() => {
                const d = document.createElement("div"); d.className = "mq-txt"; d.setAttribute("data-mq", "txt");
                d.innerHTML = '<b>Texte de la story</b><input aria-label="Texte de la story" value="Session du jeudi"><div class="l"><i style="background:#fff"></i><i style="background:#17152B"></i><i style="background:#6D32F4"></i><i style="background:#FFD34E"></i><button type="button">OK</button></div>';
                document.body.appendChild(d);
              });
            },
          },
          annotations: [
            { n: 1, sel: "[data-mq='txt'] input", texte: "Saisie dans l'éditeur (16 px), texte visible en direct" },
            { n: 2, sel: "[data-mq='txt'] .l", texte: "Couleur au même endroit ; poignées portées à 32 px" },
          ],
        });
        await page.locator(".me-tool", { hasText: "😀" }).click(); await page.waitForTimeout(500);
        await prendre({
          id: "CRE-026", titre: "Story — barre d'emojis",
          annotationsAvant: [{ n: 1, sel: "#meEmojiBar", texte: "Recouvre la barre d'outils : on ne la referme qu'en choisissant" }],
          apres: { css: "#meEmojiBar{bottom:140px!important;max-width:358px!important;width:358px!important;justify-content:center;} #meEmojiBar button{width:44px;height:44px;}" },
          annotations: [{ n: 1, sel: "#meEmojiBar", texte: "Au-dessus des outils : 😀 la referme ; 44 px par emoji" }],
        });
        await page.locator("#meEmojiBar button").first().click(); await page.waitForTimeout(400);
        await page.locator(".me-tool", { hasText: "GIF" }).click(); await page.waitForTimeout(2000);
        await prendre({ id: "CRE-027", titre: "Story — panneau GIF (Klipy refusé par le banc)", note: "Vignettes vides : Klipy et Giphy refusés par le banc (artefact).", annotationsAvant: [{ n: 1, sel: "#meGifPanel", texte: "Recouvre aussi la barre d'outils" }] });
        await page.evaluate(() => { const p = document.getElementById("meGifPanel"); if (p) p.remove(); });
        await viderToasts(page); await page.waitForTimeout(800);
        await page.locator("#mePublishBtn").click(); await page.waitForTimeout(1500);
        await prendre({ id: "CRE-028", titre: "Story publiée — retour au Fil", annotationsAvant: [{ n: 1, sel: ".toast", texte: "« Story publiée » après verdict du serveur" }] });
      },
    },
    // ─────────────────────────────── VISITEUR ────────────────────────────────
    {
      nom: "visiteur",
      demarrage: { mode: "visiteur" },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await figerToasts(page);
        await studio(page);
        await page.locator("#postText").fill("Mon premier texte de visiteur.");
        await page.locator("[data-v6-publier]").click(); await page.waitForTimeout(900);
        await prendre({ id: "CRE-029", titre: "Visiteur — Créer → Publication → Publier : porte d'inscription", annotationsAvant: [{ n: 1, sel: ".fr-gate-title", texte: "Explique le geste ; le texte reste au Studio si on ferme" }] });
        await page.evaluate(() => closeModal()); await page.waitForTimeout(300);
        await ouvrirCreer(page);
        await page.locator('[data-v2-create="live"]').click(); await page.waitForTimeout(500);
        await prendre({ id: "CRE-030", titre: "Visiteur — Créer → Live vidéo : simple message", annotationsAvant: [{ n: 1, sel: ".toast", texte: "« Connecte-toi… » : un toast, pas la porte des cinq autres entrées" }] });
        await viderToasts(page);
        await ouvrirCreer(page);
        await page.locator('[data-v2-create="audio"]').click(); await page.waitForTimeout(800);
        await page.locator("#recBtn").click(); await page.waitForTimeout(900);
        await prendre({ id: "CRE-031", titre: "Visiteur — Créer → Audio / podcast → micro demandé avant tout compte", note: "Le toast « Micro refusé » prouve que getUserMedia a été appelé (banc sans micro).", annotationsAvant: [{ n: 1, sel: "#recBtn", texte: "Demande le micro à un visiteur ; la porte n'arrive qu'à Publier" }] });
      },
    },
  ],
};
