// ═══════════════════════════════════════════════════════════════════════════
// ENTRÉE ET NAVIGATION — scénarios de capture
//
// Première visite (mode visiteur, parcours actif par défaut), porte de compte,
// formulaire d'inscription / connexion et ses erreurs, états d'authentification
// simulés, parcours historique (drapeau coupé), navigation d'un compte connecté
// (barres, feuille Créer, Paramètres, retour système, rechargement, clavier,
// paysage), rideau d'accès armé.
// ⚠️ Rien ne part : en mode visiteur, le banc répond 422 « projet vide » à toute
// inscription ou connexion ; les messages de refus montrés sont ceux du code.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("../jeu/base");

const attendre = (page, ms) => page.waitForTimeout(ms);
const fermerModale = (page) => page.evaluate(() => { try { closeModal(); } catch (e) {} });
const toucherRepere = (page) => page.evaluate(() => { const t = document.querySelector(".fr-tip .fr-tip-ok"); if (t) t.click(); });

// Repère de première visite : posé en carte au-dessus de la barre basse au lieu
// d'être posé SUR la cible (il ne cache plus ce qu'il présente).
const CSS_REPERE_BAS = `.fr-tip{top:auto !important;bottom:calc(84px + env(safe-area-inset-bottom,0px)) !important;left:12px !important;right:12px !important;width:auto !important;box-shadow:0 10px 30px rgba(23,21,43,.18) !important}`;

// Panneau Paramètres : un fond qui le détache, une croix visible (la maquette
// ne câble pas le geste : elle montre l'état proposé).
const CSS_PARAMETRES = `#devPanel.active{box-shadow:0 0 0 100vmax rgba(23,21,43,.32),0 12px 30px rgba(23,21,43,.18) !important}
#devPanel.active::before{content:"×";position:absolute;top:8px;right:10px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--text);border-radius:12px}
#devPanel.active{position:fixed}`;

// Formulaire d'inscription en deux étapes : l'étape 1 ne garde que l'accès.
const CSS_INSCRIPTION_ETAPE1 = `.onb-step[data-onb-step=splash] > div:first-child{padding:56px 24px 14px !important;margin-bottom:14px !important;border-radius:0 0 24px 24px !important}
.onb-step[data-onb-step=splash] > div:first-child .onb-logo-big{display:none !important}
#authNameWrap,#authBirthYearWrap,#authPasswordConfirmWrap,#authResponsable{display:none !important}
.onb-auth-tab{min-height:44px !important}
#authGoogleBloc::before{content:"Étape 1 sur 2 · ton accès";display:block;font:800 12px/1.4 var(--v2-titre,inherit);letter-spacing:.04em;text-transform:uppercase;color:var(--accent);margin:0 0 4px}
#authSubmitBtn{font-size:0 !important}#authSubmitBtn::after{content:"Continuer";font-size:15px}
.fr-back-explore{position:fixed !important;top:0 !important;left:0 !important;right:0 !important;border-radius:0 !important;background:#fff !important;box-shadow:0 1px 0 var(--border) !important;justify-content:flex-start;text-align:left}`;

// Erreur d'inscription : la sortie « Continuer à explorer » devient une barre
// qui ne recouvre plus rien, et le champ fautif est désigné.
const CSS_ERREUR = `.fr-back-explore{position:fixed !important;top:0 !important;left:0 !important;right:0 !important;border-radius:0 !important;background:#fff !important;box-shadow:0 1px 0 var(--border) !important;text-align:left}
.onb-step.active{padding-top:54px !important}
#authName{border-color:#b91c1c !important;box-shadow:0 0 0 3px rgba(185,28,28,.14) !important}
#authNameWrap::after{content:"Choisis un nom d’utilisateur (2 à 40 caractères).";display:block;font-size:12px;line-height:1.45;color:#b91c1c;margin-top:4px}`;

module.exports = {
  domaine: "entree",
  scenarios: [
    // ── 1. Première visite : le fil de découverte ──────────────────────────
    {
      nom: "premiere-visite",
      demarrage: { mode: "visiteur" },
      vues: ["m390", "m360", "m320", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await prendre({
          id: "ENT-001",
          titre: "Première visite — entrée directe dans Découvrir, carte de bienvenue",
          note: "Appareil vierge, aucune session. Les publications sont les exemples du socle (« Exemple PASSIO »).",
          zooms: [{ nom: "carte", titre: "Carte de bienvenue", sel: "#frWelcome", marge: 8 }, { nom: "barre", titre: "Barre supérieure d'un visiteur", sel: ".app-topbar", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: "#frWelcome", texte: "Une action principale (« Choisir mes passions »), deux liens secondaires : la carte est claire." },
            { n: 2, sel: ".app-topbar .topbar-left", texte: "Le logo s'annonce « Mon profil » à quelqu'un qui n'a pas de compte." },
            { n: 3, sel: "#feedIntentSelector", texte: "Envies : « Explorer » et « Rencontrer » sont aussi les noms de la loupe et d'un onglet." },
          ],
        });
        // Fermer la carte : le premier repère arrive.
        await page.locator("#frWelcome .fr-welcome-close").click();
        await attendre(page, 1400);
        await prendre({
          id: "ENT-002",
          seulement: ["m390", "m360"],
          titre: "Première visite — premier repère après la fermeture de la carte",
          zooms: [{ nom: "repere", titre: "Repère", sel: ".fr-tip", marge: 8 }],
          annotationsAvant: [{ n: 1, sel: ".fr-tip", texte: "Le repère est posé sur le fil, par-dessus le contenu qu'il présente." }],
          apres: { css: CSS_REPERE_BAS },
          annotations: [{ n: 1, sel: ".fr-tip", texte: "Repère posé au-dessus de la barre basse : la cible reste visible." }],
        });
      },
    },
    // ── 2. Choisir ses passions sans compte ────────────────────────────────
    {
      nom: "choix-passions",
      demarrage: { mode: "visiteur" },
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await page.locator("#frWelcome .fr-welcome-cta").click();
        await attendre(page, 1500);
        await prendre({
          id: "ENT-003",
          titre: "Panneau « Qu'est-ce qui te passionne ? » — ouvert depuis la carte",
          annotationsAvant: [
            { n: 1, sel: "#frSearch", texte: "Recherche dans les 5 001 passions, champ en 16 px." },
            { n: 2, sel: "#frValider", texte: "Le bouton dit ce qui manque (« Choisis au moins une passion »)." },
          ],
        });
        await page.locator("#frGrid .fr-tile").first().click();
        await attendre(page, 500);
        await page.locator("#frGrid .fr-tile").nth(2).click();
        await attendre(page, 500);
        await page.locator("#frSpecs .fr-chip").first().click().catch(() => {});
        await attendre(page, 600);
        await prendre({
          id: "ENT-004",
          seulement: ["m390"],
          titre: "Panneau de passions — deux passions et une spécialité choisies",
          annotationsAvant: [
            { n: 1, sel: "#frSpecs", texte: "Les spécialités apparaissent sous la grille, « facultatif » est dit." },
            { n: 2, sel: "#frValider", texte: "Le compteur suit la sélection : « Voir mon fil (3) »." },
          ],
        });
        await page.locator("#frValider").click();
        await attendre(page, 1800);
        await page.locator("#appMain").evaluate((m) => m.scrollTo(0, 0));
        await attendre(page, 500);
        await prendre({
          id: "ENT-005",
          seulement: ["m390"],
          titre: "Retour au fil après le choix — passions en tête du fil, la carte a disparu",
          note: "La carte « Tes passions sont sur cet appareil — Crée ton compte pour les garder » n'est posée qu'à une session suivante (carte fermée pour la session par la validation).",
          annotationsAvant: [
            { n: 1, sel: "#profileStrip", texte: "Le choix se voit tout de suite : Musique, Guitare, Cuisine en tête du fil." },
            { n: 2, sel: ".fr-tip", texte: "Le repère remplace la carte ; rien ne dit que ce choix ne vit que sur cet appareil." },
          ],
        });
      },
    },
    // ── 3. Les destinations, vues par un visiteur ──────────────────────────
    {
      nom: "visiteur-destinations",
      demarrage: { mode: "visiteur" },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.locator('#appNavV2 [data-v2-key="meet"]').click();
        await attendre(page, 1600);
        await prendre({
          id: "ENT-006",
          titre: "Visiteur — Rencontrer, avec son repère",
          annotationsAvant: [{ n: 1, sel: ".fr-tip", texte: "Le repère recouvre le choix Liste / Carte / Filtre et la première activité." }],
          apres: { css: CSS_REPERE_BAS },
          annotations: [{ n: 1, sel: ".fr-tip", texte: "Même repère, posé en bas : la vue reste lisible." }],
        });
        await toucherRepere(page);
        await page.locator('#appNavV2 [data-v2-key="messages"]').click();
        await attendre(page, 1600);
        await prendre({
          id: "ENT-007",
          titre: "Visiteur — Messages : conversations d'exemple et repère",
          annotationsAvant: [{ n: 1, sel: ".fr-tip", texte: "Quatrième repère en quatre écrans." }],
        });
        await toucherRepere(page);
        await page.locator('#appNavV2 [data-v2-key="profile"]').click();
        await attendre(page, 1600);
        await toucherRepere(page);
        await attendre(page, 400);
        await prendre({
          id: "ENT-008",
          titre: "Visiteur — onglet Profil : un « Mon profil » vide, sans compte",
          zooms: [{ nom: "entete", titre: "En-tête du profil d'un visiteur", sel: "#screen-profiles", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: "#mainProfileCover", texte: "« Mon profil », 0 abonné, crayon d'édition : un profil qui n'existe pas." },
            { n: 2, sel: "#screen-profiles .btn, #screen-profiles button", texte: "Les actions mènent à publier, jamais à créer le compte qui manque." },
          ],
          apres: {
            js: async (page) => {
              await page.evaluate(() => {
                const ecran = document.getElementById("screen-profiles");
                [...ecran.children].forEach((c) => { c.style.display = "none"; });
                const carte = document.createElement("section");
                carte.id = "maquetteProfilVisiteur";
                carte.style.cssText = "margin:16px;padding:22px 20px;border-radius:24px;background:var(--bg-card);box-shadow:0 6px 24px rgba(23,21,43,.08);text-align:center";
                carte.innerHTML = '<div style="width:84px;height:84px;margin:4px auto 14px;border-radius:50%;background:var(--accent-tile,#efe9ff);display:flex;align-items:center;justify-content:center;font-size:38px">✨</div>'
                  + '<div style="font:800 21px/1.25 var(--v2-titre,inherit);color:var(--text);margin-bottom:8px">Ton profil t\'attend</div>'
                  + '<div style="font-size:14px;line-height:1.5;color:var(--muted);margin-bottom:18px">Un compte te donne un profil public, la possibilité de suivre des passionnés, de publier et de rejoindre des activités. Les passions déjà choisies sur cet appareil seront gardées.</div>'
                  + '<button class="btn primary block" id="maqProfilCreer" style="min-height:48px;font-weight:800;margin-bottom:10px">Créer mon compte</button>'
                  + '<button class="btn ghost block" id="maqProfilConnexion" style="min-height:44px">J\'ai déjà un compte</button>'
                  + '<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);font-size:13px;color:var(--muted)">En attendant, tout se regarde sans compte : <b style="color:var(--accent)">Découvrir</b>, <b style="color:var(--accent)">Rencontrer</b>.</div>';
                ecran.prepend(carte);
              });
            },
          },
          annotations: [
            { n: 1, sel: "#maquetteProfilVisiteur", texte: "L'onglet dit ce qu'un compte apporte au lieu de simuler un profil vide." },
            { n: 2, sel: "#maqProfilCreer", texte: "Une seule action principale : la même porte que la fenêtre « Crée ton compte pour… »." },
          ],
        });
        await page.locator('#appNavV2 [data-v2-key="create"]').click();
        await attendre(page, 800);
        await page.locator("#v2CreateSheet [data-v2-create=post]").click();
        await attendre(page, 1500);
        await prendre({
          id: "ENT-009",
          titre: "Visiteur — Créer › Publication : le Studio s'ouvre, avec son repère",
          annotationsAvant: [
            { n: 1, sel: ".fr-tip", texte: "Le Studio est ouvert au visiteur ; la demande de compte n'arrive qu'au toucher « Publier »." },
            { n: 2, sel: "#fieldMood > span", texte: "Ici l'envie s'appelle « Mood »." },
          ],
        });
        await toucherRepere(page);
        await page.locator(".app-topbar .hamburger").click();
        await attendre(page, 900);
        await prendre({
          id: "ENT-010",
          titre: "Visiteur — « ⋯ » ouvre le panneau Paramètres",
          annotationsAvant: [
            { n: 1, sel: "#devPanel", texte: "Ni croix, ni fond : seul un second toucher sur « ⋯ » le ferme (Échap et retour système sont sans effet)." },
            { n: 2, x: 0.62, y: 0.41, texte: "Une entrée « Démo » est montrée au public." },
          ],
        });
        await page.locator(".app-topbar .hamburger").click();
        await attendre(page, 500);
        await page.locator('.app-topbar [aria-label="Explorer"]').click();
        await attendre(page, 1500);
        await prendre({
          id: "ENT-011",
          titre: "La loupe : écran « Explorer par passion »",
          annotationsAvant: [
            { n: 1, sel: ".app-topbar .topbar-right .topbar-bell", texte: "La loupe s'appelle « Explorer » (nom accessible et infobulle)." },
            { n: 2, sel: "#exPanel_search .explorer-hero h3", texte: "Titre « Explorer par passion » ; le Fil a aussi une envie « Explorer »." },
          ],
          apres: {
            js: async (page) => {
              await page.evaluate(() => {
                const h = document.querySelector("#exPanel_search .explorer-hero h3");
                if (h) h.textContent = "Rechercher";
                const p = document.querySelector("#exPanel_search .explorer-hero p");
                if (p) p.textContent = "Une passion, une spécialité ou un membre du réseau.";
                const l = document.querySelector('.app-topbar [aria-label="Explorer"]');
                if (l) { l.setAttribute("aria-label", "Rechercher"); l.title = "Rechercher"; }
              });
            },
          },
          annotations: [
            { n: 1, sel: '.app-topbar [aria-label="Rechercher"]', texte: "La loupe s'appelle « Rechercher », partout." },
            { n: 2, sel: "#exPanel_search .explorer-hero h3", texte: "L'écran porte le nom de son geste : un seul « Explorer » reste dans l'application, ou aucun." },
          ],
        });
      },
    },
    // ── 4. La porte de compte et le formulaire ─────────────────────────────
    {
      nom: "porte-compte",
      demarrage: { mode: "visiteur" },
      vues: ["m390", "m360"],
      async derouler({ page, prendre, vue }) {
        await page.evaluate(() => goTo("studio"));
        await attendre(page, 1300);
        await toucherRepere(page);
        await page.locator("#screen-studio textarea").first().fill("Mon premier essai");
        await page.locator("#screen-studio button", { hasText: /^Publier$/ }).first().click();
        await attendre(page, 1000);
        await prendre({
          id: "ENT-012",
          titre: "Porte de compte — « Crée ton compte pour publier ta création »",
          annotationsAvant: [
            { n: 1, sel: "#modalContent .fr-gate-title", texte: "Le titre nomme le geste qui a été interrompu." },
            { n: 2, sel: "#modalContent .fr-gate-stay", texte: "Trois sorties nettes, dont « Continuer à explorer »." },
          ],
        });
        await page.locator("#modalContent button", { hasText: "Créer mon compte" }).click();
        await attendre(page, 1300);
        await prendre({
          id: "ENT-013",
          titre: "Formulaire « Créer un compte » — haut de l'écran",
          zooms: [{ nom: "onglets", titre: "Onglets et case de consentement", sel: ".onb-auth-toggle", marge: 6 }, { nom: "consentement", titre: "Case de consentement", sel: "#authConsentWrap", marge: 4 }],
          annotationsAvant: [
            { n: 1, sel: ".onb-auth-toggle", texte: "Onglets de 35 px de haut." },
            { n: 2, sel: "#authCguLink", texte: "Liens des conditions : 16 px de haut, au milieu d'une phrase." },
            { n: 3, sel: "#authNameWrap", texte: "Sept champs et aides avant le bouton : « Créer mon compte » est à 1 117 px (écran : 844)." },
          ],
          apres: { css: CSS_INSCRIPTION_ETAPE1, zooms: [{ nom: "onglets", titre: "Onglets", sel: ".onb-auth-toggle", marge: 6 }] },
          annotations: [
            { n: 1, sel: ".onb-auth-toggle", texte: "Onglets portés à 44 px." },
            { n: 2, sel: "#authGoogleBloc", texte: "Étape 1 sur 2 : l'accès seulement (Google, ou e-mail + mot de passe)." },
            { n: 3, sel: "#authEmail", texte: "Nom public et année de naissance passent à l'étape 2, sans rien retirer du contrôle 18+." },
            { n: 4, sel: "#authSubmitBtn", texte: "Le bouton d'action est visible sans défiler." },
          ],
        });
        await page.locator("#authSubmitBtn").scrollIntoViewIfNeeded();
        await attendre(page, 500);
        await prendre({
          id: "ENT-014",
          seulement: ["m390"],
          titre: "Formulaire « Créer un compte » — bas de l'écran, bouton d'envoi",
          annotationsAvant: [
            { n: 1, sel: "#authSubmitBtn", texte: "Le bouton n'apparaît qu'après défilement." },
            { n: 2, sel: "#authPwdSuggest", texte: "Les trois règles du mot de passe sont dites avant l'envoi." },
          ],
        });
        await page.locator("#authSubmitBtn").click();
        await attendre(page, 1100);
        await prendre({
          id: "ENT-015",
          titre: "Envoi à vide — le refus s'écrit en haut, sous le bouton « Continuer à explorer »",
          zooms: [{ nom: "message", titre: "Message d'erreur et sortie flottante", sel: "#authMsg", marge: 30 }],
          annotationsAvant: [
            { n: 1, sel: "#frBackToExplore", texte: "La sortie flottante recouvre le message d'erreur." },
            { n: 2, sel: "#authName", texte: "Le champ fautif n'est pas désigné ; un seul défaut est dit à la fois." },
          ],
          apres: { css: CSS_ERREUR, zooms: [{ nom: "message", titre: "Message d'erreur", sel: "#authMsg", marge: 30 }] },
          annotations: [
            { n: 1, sel: "#frBackToExplore", texte: "La sortie devient une barre qui ne recouvre plus rien." },
            { n: 2, sel: "#authName", texte: "Le champ fautif est entouré et son défaut écrit dessous." },
          ],
        });
        await page.locator("#authName").fill("Camille");
        await page.locator("#authBirthYear").fill("1994");
        await page.locator("#authEmail").fill("camille.audit@exemple.fr");
        await page.locator("#authPassword").fill("Velo-Lyon-2026!x");
        await page.locator("#authPasswordConfirm").fill("Velo-Lyon-2026!x");
        await page.locator("#authSubmitBtn").click();
        await attendre(page, 1100);
        await prendre({
          id: "ENT-016",
          seulement: ["m390"],
          titre: "Consentement non coché — refus dit à deux endroits, case désignée",
          annotationsAvant: [{ n: 1, sel: "#authConsentRefus", texte: "Le refus s'écrit sous la case, là où l'on agit." }],
        });
        await page.locator("#authConsent").check();
        await page.locator("#authBirthYear").fill("2012");
        await page.locator("#authSubmitBtn").click();
        await attendre(page, 1100);
        await prendre({
          id: "ENT-017",
          seulement: ["m390"],
          titre: "Année de naissance de moins de 18 ans — refus",
          annotationsAvant: [{ n: 1, sel: "#authMsg", texte: "« PASSIO est réservé aux 18 ans et plus. Si tu t'es trompé d'année, corrige-la. »" }],
        });
        await page.locator("#authTabSignin").click();
        await attendre(page, 600);
        await page.locator("#authEmail").fill("camille.audit@exemple.fr");
        await page.locator("#authPassword").fill("faux-mot-de-passe");
        await page.locator("#authSubmitBtn").click();
        await attendre(page, 2500);
        await prendre({
          id: "ENT-018",
          titre: "Onglet « Se connecter » — refus de connexion",
          note: "Le refus vient du banc (projet vide) ; le texte affiché est la traduction du code (« Invalid login » → « E-mail ou mot de passe incorrect. »).",
          annotationsAvant: [
            { n: 1, sel: "#authMsg", texte: "Message clair, en français." },
            { n: 2, sel: "#authForgotLink", texte: "« Mot de passe oublié ? » est un texte cliquable : ni bouton, ni lien, inatteignable au clavier." },
          ],
        });
        await page.locator("#authEmail").fill("");
        await page.locator("#authForgotLink").click();
        await attendre(page, 1100);
        await prendre({
          id: "ENT-019",
          seulement: ["m390"],
          titre: "« Mot de passe oublié ? » sans adresse — consigne",
          annotationsAvant: [{ n: 1, sel: "#authMsg", texte: "La consigne renvoie au champ « ci-dessus »." }],
        });
        await page.goBack();
        await attendre(page, 1100);
        await prendre({
          id: "ENT-020",
          seulement: ["m390"],
          titre: "Retour système depuis le formulaire : le formulaire reste, l'écran dessous a changé",
          note: "Avant le retour : Studio (#studio). Après : le formulaire est toujours affiché ; dessous, le Fil (adresse sans ancre).",
          annotationsAvant: [{ n: 1, sel: "#frBackToExplore", texte: "Le geste de retour n'a pas fermé le formulaire : il a navigué derrière lui." }],
        });
      },
    },
    // ── 5. États d'authentification forcés ────────────────────────────────
    {
      nom: "etats-auth",
      demarrage: { mode: "visiteur" },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => { PassioFirstRun.allerConnexion("deja_compte"); });
        await attendre(page, 900);
        await page.evaluate(() => { const m = document.getElementById("authMsg"); m.className = "onb-auth-msg error"; m.textContent = "Confirme ton e-mail avant de te connecter : ouvre le lien qu'on t'a envoyé, ou fais-le renvoyer juste en dessous."; _showResendConfirmation("camille.audit@exemple.fr"); });
        await attendre(page, 1200);
        await prendre({
          id: "ENT-021",
          titre: "« Ton compte attend… » — e-mail non confirmé (simulé)",
          note: "Simulé : message et sortie posés par `_showResendConfirmation` (app-02:5685), comme après un refus « Email not confirmed ».",
          annotationsAvant: [
            { n: 1, sel: "#authResendTopBtn", texte: "La sortie (renvoyer l'e-mail) est sous les yeux, en 44 px." },
            { n: 2, sel: "#authMsg", texte: "Le refus et sa sortie se lisent ensemble." },
          ],
        });
        await page.evaluate(() => { PassioFirstRun.allerInscription("aimer"); });
        await attendre(page, 900);
        await page.evaluate(() => { const m = document.getElementById("authMsg"); m.className = "onb-auth-msg error"; m.textContent = "Beaucoup de monde s'inscrit en ce moment. Réessaie dans quelques minutes — ton adresse n'est pas perdue."; });
        await prendre({
          id: "ENT-022",
          titre: "Inscription refusée par le quota d'e-mails (texte du code, simulé)",
          note: "Simulé : texte recopié de `onbDoAuth` (app-02, branche « rate limit »).",
          annotationsAvant: [{ n: 1, sel: "#authMsg", texte: "Un refus qui rassure (« ton adresse n'est pas perdue »)." }],
        });
      },
    },
    {
      nom: "consentement-requis",
      demarrage: { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx), stockage: { passio_consentement_requis_v1: "1" } },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => { try { ouvrirConsentementRequis(); } catch (e) {} });
        await attendre(page, 1000);
        await prendre({
          id: "ENT-023",
          titre: "« Avant de continuer » — consentement demandé après une inscription Google (simulé)",
          note: "Simulé : clé `passio_consentement_requis_v1` posée, `ouvrirConsentementRequis()` appelée.",
          annotationsAvant: [
            { n: 1, sel: "#consentRequisCase", texte: "Case native sans taille fixée (≈ 13 px)." },
            { n: 2, sel: "#modalContent .btn.ghost", texte: "« Refuser et me déconnecter » a le même poids visuel que l'acceptation." },
          ],
          apres: { css: `#consentRequisCase{width:22px;height:22px;min-width:22px;accent-color:var(--accent)}#modalContent label.field{padding:10px 0;min-height:44px}#modalContent .btn.ghost{border:none !important;background:transparent !important;color:var(--muted) !important}` },
          annotations: [
            { n: 1, sel: "#consentRequisCase", texte: "Case agrandie, cible de la ligne entière ≥ 44 px." },
            { n: 2, sel: "#modalContent .btn.ghost", texte: "Le refus reste disponible, en action secondaire." },
          ],
        });
      },
    },
    {
      nom: "session-expiree",
      demarrage: { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx) },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => { window._sessionExpiree = true; requireAuthentication("aimer"); });
        await attendre(page, 900);
        await prendre({
          id: "ENT-024",
          titre: "Session expirée — « Reconnecte-toi pour aimer cette publication » (simulé)",
          note: "Simulé : `window._sessionExpiree = true`, puis `requireAuthentication('aimer')`.",
          annotationsAvant: [{ n: 1, sel: "#modalContent .modal-subtitle", texte: "Dit ce qui est gardé et ce qui ne partira pas." }],
        });
      },
    },
    // ── 6. Parcours historique (drapeau coupé) ─────────────────────────────
    {
      nom: "historique",
      demarrage: { mode: "visiteur", stockage: { passio_first_run_experience_v1: "0" } },
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await prendre({
          id: "ENT-025",
          titre: "Parcours historique — landing (drapeau `passio_first_run_experience_v1=\"0\"`)",
          note: "État conditionnel : la landing n'est plus vue par défaut depuis le 2026-09-01 ; elle revient si le parcours de première visite est coupé.",
          zooms: [{ nom: "pied", titre: "Pied collant", sel: ".landing-cta", marge: 6 }],
          annotationsAvant: [
            { n: 1, sel: ".landing-cta", texte: "Trois boutons pleins du même poids : « Se connecter », « Créer un compte », « Installer l'application »." },
            { n: 2, sel: ".landing-pillars", texte: "Six piliers ; le pied collant cache le dernier et ne laisse voir que leurs titres." },
          ],
          apres: {
            css: `.landing-cta > div .btn:first-child{background:#fff !important;color:var(--accent) !important;border:1.5px solid var(--accent-tile-line,#d9c8ff) !important;box-shadow:none !important}#btn-install-app{background:transparent !important;color:var(--accent) !important;box-shadow:none !important;padding:10px !important;font-size:14px !important}`,
            zooms: [{ nom: "pied", titre: "Pied collant", sel: ".landing-cta", marge: 6 }],
          },
          annotations: [{ n: 1, sel: ".landing-cta", texte: "Une action principale (« Créer un compte »), la connexion en secondaire, l'installation en lien." }],
        });
        await page.locator("#landing").evaluate((l) => l.scrollTo(0, 99999));
        await attendre(page, 600);
        await prendre({ id: "ENT-026", seulement: ["m390"], titre: "Landing historique — bas de page", annotationsAvant: [{ n: 1, sel: ".landing-cta", texte: "Le pied collant reste posé sur le dernier pilier." }] });
        await page.locator(".landing-cta button", { hasText: "Créer un compte" }).click();
        await attendre(page, 1200);
        await prendre({
          id: "ENT-027",
          seulement: ["m390"],
          titre: "Landing historique → « Créer un compte » : le formulaire, sans retour vers la landing",
          note: "Mesuré : le retour système depuis ce formulaire QUITTE le site (page vide, l'historique ne contient qu'une entrée).",
          annotationsAvant: [{ n: 1, sel: ".onb-step.active > div:first-child", texte: "Aucun bouton de retour vers la landing ; le retour système quitte PASSIO." }],
        });
      },
    },
    {
      nom: "etapes-apres-compte",
      demarrage: { mode: "visiteur", stockage: { passio_first_run_experience_v1: "0" } },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        const etape = async (nom) => { await page.evaluate((e) => { document.getElementById("landing").classList.remove("active"); document.getElementById("onboarding").classList.add("active"); showOnbStep(e); if (e === "passions") { try { renderPassionGrid(); } catch (x) {} } }, nom); await attendre(page, 1000); };
        await etape("age");
        await prendre({
          id: "ENT-028",
          titre: "Étape « Vérification d'âge » (chemin Google — simulé)",
          note: "Simulé : `showOnbStep('age')`. Après une inscription Google, le formulaire e-mail n'a pas recueilli l'année : cette étape la demande.",
          annotationsAvant: [
            { n: 1, sel: "#birthYear", texte: "Champ sans `inputmode` ni `autocomplete` (le formulaire e-mail les a)." },
            { n: 2, sel: ".onb-step.active .onb-footer", texte: "« ← Retour » ramène au formulaire de compte, déjà ouvert." },
          ],
        });
        await etape("name");
        await prendre({ id: "ENT-029", titre: "Étape « Comment t'appelles-tu ? » (chemin Google — simulé)", note: "Simulé : `showOnbStep('name')`.", annotationsAvant: [{ n: 1, sel: "#userName", texte: "Libellé « Ton prénom », alors que le formulaire e-mail dit « Nom d'utilisateur » pour la même donnée." }] });
        await etape("passions");
        await prendre({ id: "ENT-030", titre: "Étape « passions » — « Entrer sur PASSIO » (simulé)", note: "Simulé : `showOnbStep('passions')` + `renderPassionGrid()`.", annotationsAvant: [{ n: 1, sel: "#onbPassionsTitle", texte: "Dernière étape, après le compte." }, { n: 2, sel: ".onb-step.active .onb-footer .btn.primary", texte: "« Entrer sur PASSIO »." }] });
      },
    },
    // ── 7. Navigation d'un compte connecté ─────────────────────────────────
    {
      nom: "compte-navigation",
      demarrage: { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx) },
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await prendre({
          id: "ENT-031",
          titre: "Compte connecté — Fil (Découvrir) : barres supérieure et inférieure",
          zooms: [{ nom: "barre-basse", titre: "Barre de navigation", sel: "#appNavV2", marge: 0 }, { nom: "envies", titre: "Envies du Fil", sel: "#feedIntentSelector", marge: 4 }],
          annotationsAvant: [
            { n: 1, sel: '#appNavV2 [data-v2-key="discover"]', texte: "Onglet « Découvrir » ; l'écran n'a pas de titre et l'ancienne barre l'appelait « Fil »." },
            { n: 2, sel: "#feedIntentSelector .feed-intent-btn[data-intent=discover]", texte: "Envie « Explorer » = le nom de la loupe." },
            { n: 3, sel: "#feedIntentSelector .feed-intent-btn[data-intent=meet]", texte: "Envie « Rencontrer » = le nom de l'onglet voisin." },
          ],
          apres: {
            js: async (page) => {
              await page.evaluate(() => {
                const d = document.querySelector("#feedIntentSelector .feed-intent-btn[data-intent=discover]"); if (d) d.textContent = "Nouveau pour toi";
                const m = document.querySelector("#feedIntentSelector .feed-intent-btn[data-intent=meet]"); if (m) m.textContent = "Rendez-vous";
                const l = document.querySelector('.app-topbar [aria-label="Explorer"]'); if (l) { l.setAttribute("aria-label", "Rechercher"); l.title = "Rechercher"; }
              });
            },
            zooms: [{ nom: "envies", titre: "Envies du Fil", sel: "#feedIntentSelector", marge: 4 }],
          },
          annotations: [
            { n: 2, sel: "#feedIntentSelector .feed-intent-btn[data-intent=discover]", texte: "« Nouveau pour toi » dit ce que l'envie calcule (auteurs et passions hors de tes choix)." },
            { n: 3, sel: "#feedIntentSelector .feed-intent-btn[data-intent=meet]", texte: "« Rendez-vous » : l'envie ne double plus l'onglet « Rencontrer »." },
          ],
        });
        await page.locator('#appNavV2 [data-v2-key="create"]').click();
        await attendre(page, 800);
        await prendre({
          id: "ENT-032",
          seulement: ["m390", "m360"],
          titre: "Feuille « Créer » — six choix",
          annotationsAvant: [
            { n: 1, sel: "#v2CreateSheet .v2-sheet-close", texte: "Croix, fond et Échap la ferment ; le retour système, non (il navigue dessous)." },
            { n: 2, sel: '#v2CreateSheet [data-v2-create="post"]', texte: "« Publication » ici, « Créer un post » sur le profil, « Publier une Passio » dans le fil." },
          ],
        });
        await page.keyboard.press("Escape");
        await attendre(page, 400);
        await page.locator(".app-topbar .hamburger").click();
        await attendre(page, 800);
        await prendre({
          id: "ENT-033",
          seulement: ["m390", "m360"],
          titre: "Panneau « Paramètres » (« ⋯ ») — compte connecté",
          annotationsAvant: [
            { n: 1, sel: "#devPanel", texte: "Panneau flottant sans croix ni fond ; Échap, retour système et toucher dehors ne le ferment pas." },
            { n: 2, sel: ".app-topbar .hamburger", texte: "« ⋯ » nommé « Paramètres », sans `aria-expanded`." },
          ],
          apres: { css: CSS_PARAMETRES },
          annotations: [
            { n: 1, sel: "#devPanel", texte: "Un fond assombri et une croix : on voit que c'est une superposition, et comment en sortir." },
          ],
        });
      },
    },
    {
      nom: "aides-contextuelles",
      demarrage: { mode: "compte", sansAides: false, peupler: (srv, ctx) => base.peupler(srv, ctx) },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await attendre(page, 1200);
        await prendre({
          id: "ENT-034",
          titre: "Aide contextuelle « Compris » sur le fil (compte neuf)",
          annotationsAvant: [{ n: 1, sel: ".passio-hint", texte: "« Appuie sur l'auteur pour découvrir sa Passio » : posée sur la photo, et « Passio » y nomme un profil." }],
        });
        await page.evaluate(() => openAccountSwitch());
        await attendre(page, 800);
        await prendre({
          id: "ENT-035",
          titre: "Paramètres › Compte › « Se connecter avec un autre compte »",
          annotationsAvant: [{ n: 1, sel: "#modalContent p", texte: "Conséquence dite avant d'agir ; « Annuler » à gauche, « Continuer » à droite." }],
        });
      },
    },
    {
      nom: "retours-et-rechargement",
      demarrage: { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx) },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => goTo("messages"));
        await attendre(page, 1000);
        await page.reload();
        await page.waitForFunction(() => document.querySelector(".screen.active"), null, { timeout: 25000 });
        await attendre(page, 5000);
        await prendre({
          id: "ENT-036",
          titre: "Rechargement sur Messages (#messages) : retour au Fil, l'adresse garde #messages",
          note: "Geste : Messages, puis rechargement de la page. Écran actif après : screen-feed ; adresse : #messages.",
          annotationsAvant: [{ n: 1, sel: '#appNavV2 [data-v2-key="discover"]', texte: "Découvrir est actif alors que l'adresse dit Messages." }],
        });
        await page.locator("#appMain").evaluate((m) => m.scrollTo(0, 900));
        await attendre(page, 800);
        await page.locator('#appNavV2 [data-v2-key="meet"]').click();
        await attendre(page, 1200);
        await page.locator('#appNavV2 [data-v2-key="discover"]').click();
        await attendre(page, 1800);
        await prendre({
          id: "ENT-037",
          titre: "Fil défilé → Rencontrer → Découvrir : la position revient-elle ?",
          note: "Geste : fil défilé de 900 px, onglet Rencontrer, onglet Découvrir. La fiche donne la position de #appMain (voir ecran / mesures).",
        });
        await page.evaluate(() => { document.getElementById("appMain").scrollTo(0, 0); document.activeElement && document.activeElement.blur(); });
        for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
        await attendre(page, 300);
        await prendre({
          id: "ENT-038",
          titre: "Clavier — troisième arrêt de tabulation (focus visible, pas de lien d'évitement)",
          note: "Parcours mesuré par la sonde 04 : barre supérieure (4 arrêts), filtres, envies, stories… la barre de navigation n'arrive qu'après tout le fil.",
          annotationsAvant: [{ n: 1, x: 0.815, y: 0.038, texte: "Contour de focus net ; aucun « Aller au contenu » avant." }],
        });
        await page.setViewportSize({ width: 844, height: 390 });
        await attendre(page, 1200);
        await prendre({
          id: "ENT-039",
          titre: "Paysage 844 × 390 (téléphone tourné) — Fil",
          note: "Émulation Chromium : fenêtre 844 × 390 sur le gabarit m390.",
          annotationsAvant: [{ n: 1, sel: "#appNavV2", texte: "Barres haute et basse gardées : il reste peu de hauteur au contenu." }],
        });
      },
    },
    {
      nom: "tour-historique",
      demarrage: { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx) },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => { tourIdx = 0; showTour(); });
        await attendre(page, 1200);
        await prendre({
          id: "ENT-040",
          titre: "Tour guidé historique (#tourOverlay) — étape 1 (simulé)",
          note: "Simulé : `tourIdx = 0; showTour()`. Le tour n'est lancé que par le parcours historique (`initApp`, `!state.tourSeen`).",
          annotationsAvant: [{ n: 1, sel: "#tourStepLabel", texte: "Cinq étapes en plein écran avant le premier geste." }],
        });
      },
    },
    {
      nom: "rideau",
      demarrage: {
        mode: "visiteur",
        stockage: { passio_gate_actif: "1" },
        avantBoot: async (page) => { await page.addInitScript(() => { try { sessionStorage.removeItem("passio_gate_v1"); } catch (e) {} }); },
      },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await attendre(page, 800);
        await prendre({
          id: "ENT-041",
          titre: "Rideau d'accès armé (`passio_gate_actif=\"1\"`) — état conditionnel",
          note: "État conditionnel : le rideau est levé par défaut depuis le 2026-09-11 ; il ne s'arme que par `localStorage.passio_gate_actif=\"1\"`.",
        });
      },
    },
    {
      nom: "hors-ligne",
      demarrage: { mode: "visiteur" },
      vues: ["m390"],
      async derouler({ page, context, prendre }) {
        await page.evaluate(() => PassioFirstRun.allerConnexion("deja_compte"));
        await attendre(page, 900);
        await context.setOffline(true);
        await attendre(page, 800);
        await page.locator("#authEmail").fill("camille.audit@exemple.fr");
        await page.locator("#authPassword").fill("Velo-Lyon-2026!x");
        await page.locator("#authSubmitBtn").click();
        await attendre(page, 4000);
        await prendre({
          id: "ENT-042",
          titre: "Connexion hors ligne — ce que dit l'écran",
          note: "Émulé : `context.setOffline(true)` avant l'envoi.",
          annotationsAvant: [{ n: 1, sel: "#authMsg", texte: "Message après l'envoi hors ligne." }],
        });
        await context.setOffline(false);
      },
    },
  ],
};
