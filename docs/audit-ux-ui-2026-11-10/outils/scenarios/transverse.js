// ═══════════════════════════════════════════════════════════════════════════
// TRANSVERSE — réglages, notifications, toasts, signalement, hors ligne, PWA,
// composants partagés.
//
// Conventions de ce fichier :
//  · `figer(page)` : le banc SUSPEND l'animation de sortie et le retrait des
//    toasts (Element.remove neutralisé pour `.toast`) afin qu'un toast reste à
//    l'image le temps de la capture. Rien d'autre n'est touché : un toast peint
//    SOUS une superposition reste invisible à l'image — c'est ce qu'on mesure.
//  · Les maquettes `css` sont appliquées puis retirées sur place ; les maquettes
//    `js` sont capturées sur un état rejoué à l'identique.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/transverse");

async function figer(page) {
  await page.addStyleTag({ content: ".toast{animation:none!important;opacity:1!important}" });
  await page.evaluate(() => {
    if (window.__toastsFiges) return;
    window.__toastsFiges = true;
    const r = Element.prototype.remove;
    Element.prototype.remove = function () { if (this.classList && this.classList.contains("toast")) return; return r.call(this); };
  });
}
async function viderToasts(page) { await page.evaluate(() => { const p = document.getElementById("toastStack"); if (p) p.innerHTML = ""; }); }

// Pile de toasts proposée : AU-DESSUS de toute superposition, au-dessus de la
// barre basse ET du clavier (position fixe, z-index maximal), largeur bornée,
// coins de carte quand le texte passe sur deux lignes.
const CSS_PILE = ".toast-stack{position:fixed!important;left:0!important;right:0!important;bottom:calc(96px + env(safe-area-inset-bottom,0px))!important;z-index:2147483000!important;padding:0 16px}"
  + ".toast{max-width:min(440px,100%);border-radius:16px!important;line-height:1.35;text-align:left}"
  + "body:has(#modalBackdrop.active) .toast-stack,body:has(#conv-fullpage.active) .toast-stack,body:has(.reels-viewer.open) .toast-stack{bottom:auto!important;top:calc(12px + env(safe-area-inset-top,0px))!important}";

const CSS_PANNEAU = "#devPanel .btn{min-height:44px!important;font-size:14px!important;padding:10px 12px!important}"
  + "#devPanel .settings-section:has([onclick*='startTour']),#devPanel .settings-section:has([onclick*='openScreenTime']),#devPanel [onclick*='resetOnboarding']{display:none!important}"
  + "#settingsLogout,#settingsDeleteAccount{font-size:13px!important}";

module.exports = {
  domaine: "transverse",
  scenarios: [
    // ── 1. PANNEAU « PARAMÈTRES » ET SES SOUS-ÉCRANS ─────────────────────────
    {
      nom: "reglages",
      demarrage: { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.peuplerBlocages(s, c); } },
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre, vue }) {
        await page.waitForTimeout(1200);
        await page.locator(".hamburger[onclick*='toggleDevPanel']").first().click();
        await page.waitForTimeout(500);
        await prendre({
          id: "TRA-001",
          titre: "Paramètres — panneau ouvert par « ⋯ », sections repliées",
          zooms: [{ nom: "danger", titre: "Déconnexion et suppression", sel: "#settingsDeleteAccount", marge: 50 }],
          annotationsAvant: [
            { n: 1, sel: ".hamburger[onclick*='toggleDevPanel']", texte: "Porte : « ⋯ » de 34 × 34 px, nommée « Paramètres »" },
            { n: 2, sel: "#devPanel .settings-section:has([onclick*='startTour']) .settings-section-header", texte: "Section « Démo » (pitch investisseurs, tour démo) ouverte à tout le monde" },
            { n: 3, sel: "#settingsDeleteAccount", texte: "« Se déconnecter » et « Supprimer mon compte » : 33 px de haut, texte de 11 px" },
          ],
          apres: { css: CSS_PANNEAU },
          annotations: [
            { n: 1, sel: "#devPanel .settings-section:has([onclick*='openNotifSettings']) .settings-section-header", texte: "Quatre sections utiles ; « Démo » et « Bien-être digital » (inopérant) retirées" },
            { n: 2, sel: "#settingsDeleteAccount", texte: "Cibles de 44 px, texte de 13 px" },
          ],
        });
        // Sections dépliées, une par une (un vrai toucher sur l'en-tête)
        const sections = [["Compte", "TRA-002"], ["Personnalisation", "TRA-003"], ["Bien-être digital", "TRA-004"], ["Support", "TRA-005"], ["Démo", "TRA-006"]];
        for (const [nom, id] of sections) {
          await page.locator("#devPanel .settings-section-header", { hasText: nom }).click();
          await page.waitForTimeout(350);
          const spec = { id, titre: "Paramètres — section « " + nom + " » dépliée", seulement: ["m390", "m360"] };
          if (nom === "Compte") Object.assign(spec, {
            annotationsAvant: [{ n: 1, sel: "#devPanel [onclick*='resetOnboarding']", texte: "« Voir l'onboarding » : un outil de démonstration parmi les réglages du compte" }, { n: 2, sel: "#settingsChangePassword", texte: "Boutons de 33 px, texte de 12 px" }],
            apres: { css: CSS_PANNEAU }, annotations: [{ n: 2, sel: "#settingsChangePassword", texte: "44 px, 14 px ; « Voir l'onboarding » rejoint « Revoir les repères » (Support)" }],
          });
          if (nom === "Personnalisation") Object.assign(spec, {
            annotationsAvant: [
              { n: 1, sel: "#devPanel [onclick*='openConfigurator']", texte: "« Apparence & thème » : six palettes et un thème sombre hors charte" },
              { n: 2, sel: "#devPanel [onclick*='openNotifSettings']", texte: "Cinq interrupteurs sur six ne commandent rien" },
              { n: 3, sel: "#devPanel [onclick*='openContentSettings']", texte: "« Contenu & feed » : anglicisme ; deux réglages sur quatre inertes" },
            ],
          });
          if (nom === "Bien-être digital") Object.assign(spec, {
            annotationsAvant: [
              { n: 1, sel: "#devPanel [onclick*='openScreenTime']", texte: "Temps d'écran : compteur toujours à 0, limite jamais appliquée" },
              { n: 2, sel: "#devPanel [onclick*='openPauseMode']", texte: "Mode pause : affiche un toast, ne met rien en pause" },
            ],
          });
          if (nom === "Démo") Object.assign(spec, {
            annotationsAvant: [{ n: 1, sel: "#devPanel [onclick*='showPitchLanding']", texte: "« Afficher le pitch » et « Tour démo » : outils de présentation, visibles par tout compte" }],
          });
          await prendre(spec);
          // replier
          await page.locator("#devPanel .settings-section-header", { hasText: nom }).click();
          await page.waitForTimeout(250);
        }
        // Sous-écrans : ouverts depuis le panneau par un vrai toucher
        const ouvrir = async (section, libelle) => {
          await page.evaluate(() => { try { closeModal(); } catch (e) {} });
          await page.waitForTimeout(300);
          const ouvert = await page.evaluate(() => document.getElementById("devPanel").classList.contains("active"));
          if (!ouvert) { await page.locator(".hamburger[onclick*='toggleDevPanel']").first().click(); await page.waitForTimeout(350); }
          const sec = page.locator("#devPanel .settings-section", { has: page.locator(".settings-section-header", { hasText: section }) });
          const estOuverte = await sec.evaluate((e) => e.classList.contains("open"));
          if (!estOuverte) { await sec.locator(".settings-section-header").click(); await page.waitForTimeout(300); }
          await sec.locator("button", { hasText: libelle }).first().click();
          await page.waitForTimeout(800);
        };
        if (vue !== "m390" && vue !== "m360") return;

        await ouvrir("Personnalisation", "Notifications");
        await prendre({
          id: "TRA-010", titre: "Réglages des notifications",
          annotationsAvant: [
            { n: 1, sel: "#notifPosts", texte: "« Nouveaux posts », « Messages », « Likes & commentaires », « Événements IRL », « Système » : enregistrés, jamais lus" },
            { n: 2, sel: "#notifRecap", texte: "Seul « Récap de la semaine » agit" },
          ],
          apres: {
            js: async (page) => page.evaluate(() => {
              ["notifPosts", "notifMessages", "notifLikes", "notifEvents", "notifSystem"].forEach((id) => { const l = document.getElementById(id); if (l) l.closest("label").remove(); });
              const p = document.querySelector("#modalContent p");
              p.innerHTML = "<span style='display:block;font-size:13px;color:var(--text);line-height:1.5'>Tu es prévenu·e des j'aime, commentaires, abonnements, messages et activités. Le tri par type n'existe pas encore : il apparaîtra ici quand il sera branché.</span>";
              p.id = "maqNotifTexte";
            }),
          },
          annotations: [
            { n: 1, sel: "#maqNotifTexte", texte: "Les interrupteurs inertes sont retirés ; la phrase dit ce qui arrive réellement" },
            { n: 2, sel: "#notifRecap", texte: "Le seul réglage branché reste" },
          ],
        });
        await ouvrir("Personnalisation", "Confidentialité");
        await prendre({ id: "TRA-011", seulement: ["m390"], titre: "Confidentialité — mesure d'usage et export" });
        await ouvrir("Personnalisation", "Comptes bloqués");
        await prendre({
          id: "TRA-012", seulement: ["m390"], titre: "Comptes bloqués — un compte non résolu s'affiche « Utilisateur »",
          zooms: [{ nom: "liste", titre: "Liste", sel: "#blockedListBox", marge: 6 }],
          annotationsAvant: [
            { n: 1, sel: "#blockedListBox > div:first-child", texte: "« ? Utilisateur » : on ne sait pas qui l'on débloque" },
            { n: 2, sel: "#blockedListBox button", texte: "« Débloquer » : 81 × 29 px, texte de 11 px" },
          ],
          apres: {
            js: async (page) => page.evaluate(() => {
              const l = document.querySelector("#blockedListBox > div:first-child");
              l.querySelector(".avatar").outerHTML = '<div class="avatar sm" style="background:#fde68a;display:flex;align-items:center;justify-content:center">🍳</div>';
              l.querySelector("div[style*='flex:1']").innerHTML = "Tom Girard<div style='font-weight:500;font-size:12px;color:var(--muted)'>Bloqué il y a 1 jour</div>";
              document.querySelectorAll("#blockedListBox button").forEach((b) => { b.style.minHeight = "44px"; b.style.fontSize = "13px"; b.style.padding = "8px 14px"; });
            }),
          },
          annotations: [
            { n: 1, sel: "#blockedListBox > div:first-child", texte: "Nom et visage relus sur le serveur (profil public), date du blocage" },
            { n: 2, sel: "#blockedListBox button", texte: "« Débloquer » à 44 px" },
          ],
        });
        await ouvrir("Personnalisation", "Contenu");
        await prendre({
          id: "TRA-013", seulement: ["m390"], titre: "Contenu & feed",
          annotationsAvant: [
            { n: 1, sel: "#contentSensitive", texte: "« Afficher contenu sensible » : enregistré, lu nulle part" },
            { n: 2, sel: "#contentLang", texte: "« Langue » : Français / English / Español — l'application reste en français" },
          ],
          apres: { css: "#modalContent label:has(#contentSensitive),#modalContent label:has(#contentLang),#modalContent div:has(> #contentLang),#modalContent label:has(> select){display:none!important}#modalContent .modal-title{font-size:0}#modalContent .modal-title::after{content:'Vidéos et données';font-size:20px}" },
          annotations: [{ n: 1, sel: "#contentDataEco", texte: "Restent les deux réglages branchés ; le titre dit ce qu'ils règlent (plus de « feed »)" }],
        });
        await ouvrir("Personnalisation", "Apparence");
        await prendre({
          id: "TRA-014", seulement: ["m390"], titre: "Apparence & thème (configurateur) — haut",
          zooms: [{ nom: "croix", titre: "Coin supérieur droit", sel: "#modalContent .modal-close", marge: 16 }],
          annotationsAvant: [
            { n: 1, sel: "#modalContent span.modal-close", texte: "Deux « × » superposés (bouton injecté par openModal + span du gabarit)" },
            { n: 2, sel: "#modalContent [onclick*=\"'noir'\"]", texte: "« Sombre » : le mode sombre retiré du produit revient par ici" },
            { n: 3, sel: "#modalContent [onclick*=\"'rose'\"]", texte: "Six teintes remplacent le violet de la charte" },
          ],
          apres: {
            js: async (page) => page.evaluate(() => {
              const m = document.getElementById("modalContent");
              const s = m.querySelector("span.modal-close"); if (s) s.remove();
              // Le configurateur réduit à ce qui sert l'accessibilité : la taille du texte.
              const blocs = Array.from(m.children);
              let garder = false;
              blocs.forEach((b) => {
                const t = (b.textContent || "").trim();
                if (/^Taille du texte/.test(t)) garder = true;
                if (/^Style des coins/.test(t)) garder = false;
                if (b.classList.contains("modal-handle") || b.classList.contains("modal-close")) return;
                if (/Configurateur/.test(t) && b.querySelector("div")) { b.querySelector("div").textContent = "Affichage"; b.querySelectorAll("div")[1].textContent = "Taille du texte de l'application"; b.id = "maqCfgTitre"; return; }
                if (!garder && !/^Appliquer$/.test(t)) b.style.display = "none";
                if (/^Appliquer$/.test(t)) { b.textContent = "Fermer"; b.id = "maqCfgFermer"; }
              });
            }),
          },
          annotations: [
            { n: 1, sel: "#maqCfgTitre", texte: "Une seule croix ; l'écran devient « Affichage »" },
            { n: 2, sel: "#modalContent [onclick*='fontSize']", texte: "Reste la taille du texte (utile à la lecture) ; palettes, sombre, polices et coins retirés" },
            { n: 3, sel: "#maqCfgFermer", texte: "« Fermer » : le réglage s'applique déjà au toucher, « Appliquer » mentait" },
          ],
        });
        await page.evaluate(() => { const m = document.getElementById("modalContent"); m.scrollTop = m.scrollHeight; });
        await page.waitForTimeout(400);
        await prendre({
          id: "TRA-015", seulement: ["m390"], titre: "Apparence & thème — bas : ordre des onglets",
          annotationsAvant: [
            { n: 1, sel: "#navOrderList", texte: "« Fil, Bobines, Explorer, Créer, Messages, IRL » : six onglets qui ne sont pas ceux de la barre (Découvrir, Rencontrer, Créer, Messages, Profil)" },
            { n: 2, sel: "#modalContent button.btn.primary", texte: "« Appliquer » annonce « Configuration appliquée ! » — chaque choix s'est déjà appliqué" },
          ],
        });
        await ouvrir("Bien-être digital", "Temps");
        await prendre({
          id: "TRA-016", seulement: ["m390"], titre: "Temps d'écran",
          annotationsAvant: [
            { n: 1, sel: "#modalContent div[style*='font-size:42px']", texte: "« 0h 00min utilisé aujourd'hui » : le compteur n'est jamais alimenté" },
            { n: 2, sel: "#limitS", texte: "Une limite journalière à la seconde près, jamais appliquée" },
            { n: 3, sel: "#modalContent [onclick='setTimeLimitQuick(3600)']", texte: "Raccourcis de 29 px de haut, texte de 11 px" },
          ],
        });
        await ouvrir("Bien-être digital", "Mode pause");
        await prendre({
          id: "TRA-017", seulement: ["m390"], titre: "Mode pause",
          annotationsAvant: [{ n: 1, sel: "#modalContent [onclick='activatePause(60)']", texte: "Chaque choix affiche « Mode pause activé — 1h » et ne suspend rien" }],
        });
        // Le geste lui-même : toast figé
        await figer(page); await viderToasts(page);
        await page.locator("#modalContent [onclick='activatePause(60)']").click();
        await page.waitForTimeout(500);
        await prendre({
          id: "TRA-018", seulement: ["m390"], titre: "Mode pause « activé » — l'application reste entièrement utilisable",
          note: "Toast figé par le banc (animation et retrait suspendus).",
          annotationsAvant: [{ n: 1, sel: "#toastStack .toast", texte: "Confirmation d'une pause qui n'existe pas : notifications, fil et messagerie continuent" }],
        });
        await viderToasts(page);
        await ouvrir("Compte", "Changer mon mot de passe");
        await prendre({ id: "TRA-019", titre: "Changer mon mot de passe" });
        await ouvrir("Support", "Feedback");
        await prendre({ id: "TRA-020", titre: "Feedback & aide — « Ton retour sur la beta »",
          annotationsAvant: [{ n: 1, sel: "#modalContent .modal-subtitle", texte: "Part par e-mail (application de messagerie du téléphone) : aucune aide, aucune question fréquente" }] });
        await ouvrir("Support", "Limites");
        await prendre({ id: "TRA-021", seulement: ["m390"], titre: "Limites de cette version pilote" });
        await ouvrir("Support", "Politique");
        await prendre({ id: "TRA-022", seulement: ["m390"], titre: "Politique de confidentialité — haut",
          annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title", texte: "5 900 caractères dans une feuille, sans sommaire ; « Dernière mise à jour : 2026-11-09 »" }] });
        await ouvrir("Support", "Conditions");
        await prendre({ id: "TRA-023", seulement: ["m390"], titre: "Conditions générales d'utilisation — haut",
          annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title", texte: "7 600 caractères, « Version du 2026-09-10 »" }] });
        await ouvrir("Support", "Mentions");
        await prendre({ id: "TRA-024", seulement: ["m390"], titre: "Mentions légales" });
        await ouvrir("Support", "propos");
        await prendre({
          id: "TRA-025", seulement: ["m390"], titre: "À propos de PASSIO",
          annotationsAvant: [
            { n: 1, sel: "#modalContent div[style*='font-size:48px']", texte: "Un emoji 🟣 à la place du logo" },
            { n: 2, sel: "#modalContent div[style*='margin-top:4px']", texte: "« Version Beta 1.1 · Mai 2026 » : figé, sans rapport avec la version en ligne" },
          ],
          apres: {
            css: "#modalContent div[style*='font-size:48px']{font-size:0!important;width:64px;height:64px;margin:0 auto 8px;border-radius:18px;background:url(icon-192.png) center/cover,var(--accent)}",
            js: async (page) => page.evaluate(() => {
              const v = document.querySelector("#modalContent div[style*='margin-top:4px']");
              const b = (window.PASSIO_RELEASE && (PASSIO_RELEASE.buildId || PASSIO_RELEASE.build)) || "3d8e98bb12ad";
              v.textContent = "Version pilote · build " + String(b).slice(0, 7) + " · 10 novembre 2026"; v.id = "maqVersion";
            }),
          },
          annotations: [{ n: 2, sel: "#maqVersion", texte: "La version affichée est celle qui tourne (release.json), avec sa date" }],
        });
        await ouvrir("Compte", "autre compte");
        await page.evaluate(() => { try { closeModal(); } catch (e) {} });
        await page.waitForTimeout(300);
        await page.evaluate(() => { const p = document.getElementById("devPanel"); if (!p.classList.contains("active")) toggleDevPanel(); });
        await page.waitForTimeout(300);
        await page.locator("#settingsLogout").click();
        await page.waitForTimeout(600);
        await prendre({ id: "TRA-026", seulement: ["m390"], titre: "Se déconnecter ? — confirmation" });
        await page.evaluate(() => { try { closeModal(); } catch (e) {} toggleDevPanel(); });
        await page.waitForTimeout(300);
        await page.locator("#settingsDeleteAccount").click();
        await page.waitForTimeout(600);
        await prendre({
          id: "TRA-027", titre: "Supprimer mon compte — confirmation saisie",
          annotationsAvant: [{ n: 1, sel: "#modalContent ul, #modalContent .modal-title", texte: "Ce qui sera effacé est dit ; l'export de ses données n'est pas proposé ici (il vit dans Confidentialité)" }],
          apres: {
            js: async (page) => page.evaluate(() => {
              const champ = document.getElementById("deleteConfirmInput");
              const lab = champ.closest("label") || champ.parentElement;
              const d = document.createElement("div");
              d.id = "maqExport";
              d.style.cssText = "display:flex;align-items:center;gap:10px;padding:12px 14px;margin:6px 0 12px;border-radius:14px;background:var(--accent-tile,#F1ECFE);font-size:13px;line-height:1.4";
              d.innerHTML = "<span style='flex:1'>Avant de partir, garde une copie de tes publications et messages.</span><button class='btn ghost' style='min-height:44px;font-size:13px;white-space:nowrap'>Télécharger mes données</button>";
              lab.parentNode.insertBefore(d, lab);
              document.querySelectorAll("#modalContent .btn").forEach((b) => { if (/Supprimer définitivement/.test(b.textContent)) b.textContent = "Supprimer"; });
            }),
          },
          annotations: [{ n: 1, sel: "#maqExport", texte: "L'export existant (exporterMesDonnees) proposé au moment où il compte" }],
        });
      },
    },

    // ── 2. NOTIFICATIONS ─────────────────────────────────────────────────────
    {
      nom: "notifications",
      demarrage: { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.peuplerNotifs(s, c); } },
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre, vue }) {
        await page.waitForTimeout(2500);
        await prendre({
          id: "TRA-030", titre: "Cloche et pastille (8 non lues)",
          zooms: [{ nom: "cloche", titre: "Cloche", sel: ".topbar-bell[onclick*='openNotifications']", marge: 14 }],
          annotationsAvant: [{ n: 1, sel: ".topbar-bell[onclick*='openNotifications']", texte: "Pastille « 8 » ; titre de l'onglet « (8) PASSIO »" }],
          seulement: ["m390", "m360"],
        });
        await page.locator(".topbar-bell[onclick*='openNotifications']").first().click();
        await page.waitForTimeout(1500);
        await prendre({
          id: "TRA-031", titre: "Panneau Notifications — haut (non lues)",
          zooms: [{ nom: "demande", titre: "Demande d'abonnement", sel: ".notif-demande-actions", marge: 60 }],
          annotationsAvant: [
            { n: 1, sel: ".notif-row:first-child .notif-text", texte: "« ton post » ; plus bas « ton événement », « ton activité » : trois mots pour deux objets" },
            { n: 2, sel: ".notif-demande-actions", texte: "« Accepter » / « Refuser » : 29 px de haut" },
            { n: 3, sel: ".notif-row:nth-child(8) .notif-meta", texte: "Après une heure, l'heure seule (« 19:25 ») : hier ou aujourd'hui ?" },
          ],
          apres: {
            js: async (page) => page.evaluate(() => {
              const rows = Array.from(document.querySelectorAll(".notif-row"));
              const remplace = (r, a, b) => { const t = r.querySelector(".notif-text"); if (t) t.innerHTML = t.innerHTML.replace(a, b); };
              rows.forEach((r) => { remplace(r, "ton post", "ta publication"); remplace(r, "ton événement", "ton activité"); });
              const l = document.querySelector(".notif-list");
              const h = document.createElement("div"); h.id = "maqNouveau"; h.textContent = "Nouveau"; h.style.cssText = "font:800 12px/1 var(--v2-titre,inherit);color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:4px 2px 8px";
              l.insertBefore(h, l.firstChild);
              document.querySelectorAll(".notif-demande-actions .btn").forEach((b) => { b.style.minHeight = "44px"; b.style.padding = "0 18px"; b.style.fontSize = "14px"; });
              rows.forEach((r) => { const m = r.querySelector(".notif-meta"); if (m && /^\d\d:\d\d$/.test(m.textContent.trim())) m.textContent = "Aujourd'hui, " + m.textContent.trim(); });
            }),
          },
          annotations: [
            { n: 1, sel: ".notif-list > .notif-row .notif-text", texte: "Un seul mot par objet : « publication », « activité »" },
            { n: 2, sel: ".notif-demande-actions", texte: "Accepter / Refuser à 44 px" },
            { n: 3, sel: ".notif-row:nth-child(9) .notif-meta", texte: "« Aujourd'hui, 19:25 » / « Hier, … »" },
          ],
        });
        if (vue !== "m390" && vue !== "m360") return;
        await page.evaluate(() => { const m = document.getElementById("modalContent"); m.scrollTop = m.scrollHeight; });
        await page.waitForTimeout(500);
        await prendre({
          id: "TRA-032", titre: "Panneau Notifications — bas (lues, modération, boutons)",
          annotationsAvant: [
            { n: 1, sel: "#modalContent .btn.ghost.block", texte: "« Tout marquer lu » : l'ouverture du panneau a DÉJÀ tout marqué lu (pastille remise à zéro)" },
            { n: 2, sel: ".notif-row:last-child", texte: "Modération : « Ta publication a été masquée » — laquelle ? Le toucher n'ouvre rien" },
          ],
          apres: {
            js: async (page) => page.evaluate(() => {
              const g = document.querySelector("#modalContent .btn.ghost.block"); if (g) g.remove();
              const ok = document.querySelector("#modalContent .btn.primary.block"); if (ok) { ok.textContent = "Fermer"; ok.id = "maqFermer"; }
              const last = document.querySelector(".notif-row:last-child .notif-text");
              if (last) { last.innerHTML += "<div style='margin-top:6px;font-size:12.5px;color:var(--accent);font-weight:700' id='maqVoir'>Voir la publication et la décision ›</div>"; }
            }),
          },
          annotations: [
            { n: 1, sel: "#maqFermer", texte: "Une seule action : « Fermer » (le panneau marque déjà tout comme lu)" },
            { n: 2, sel: "#maqVoir", texte: "La décision de modération mène à la publication concernée" },
          ],
        });
        if (vue !== "m390") return;
        // Toucher une notification dont le contenu a disparu
        await figer(page); await viderToasts(page);
        await page.locator(".notif-row", { hasText: "a aimé ton commentaire" }).click();
        await page.waitForTimeout(1500);
        await prendre({
          id: "TRA-033", titre: "Toucher « … a aimé ton commentaire » (publication supprimée) : le panneau se ferme, rien ne s'ouvre",
          annotationsAvant: [{ n: 1, sel: ".app-topbar, .topbar", texte: "Retour au fil, sans un mot : ni la publication, ni « contenu supprimé »" }],
          apres: { js: async (page) => page.evaluate(() => toast("Cette publication n'existe plus.", "info")), css: CSS_PILE },
          annotations: [{ n: 1, sel: "#toastStack .toast", texte: "La destination absente se dit (même phrase pour un message ou une activité supprimés)" }],
        });
        // Une notification d'activité : la fiche s'ouvre
        await page.evaluate(() => openNotifications());
        await page.waitForTimeout(900);
        await page.locator(".notif-row", { hasText: "t'invite à" }).click();
        await page.waitForTimeout(1800);
        await prendre({ id: "TRA-034", titre: "Toucher une invitation à une activité : la fiche s'ouvre" });
      },
    },
    {
      nom: "notifications-vide",
      demarrage: { mode: "compte", peupler: (s, c) => base.peupler(s, c) },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(1800);
        await page.evaluate(() => { state.notifications = []; saveState(); renderBell(); });
        await page.locator(".topbar-bell[onclick*='openNotifications']").first().click();
        await page.waitForTimeout(1200);
        await prendre({ id: "TRA-035", titre: "Panneau Notifications — vide", note: "Liste vidée par le banc (state.notifications = []) : un compte neuf reçoit sinon deux notifications d'accueil locales." });
      },
    },
    {
      nom: "notifications-volume",
      demarrage: { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.peuplerVolume(s, c); } },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(2500);
        await page.locator(".topbar-bell[onclick*='openNotifications']").first().click();
        await page.waitForTimeout(1500);
        await prendre({
          id: "TRA-036", titre: "Panneau Notifications — 45 reçues : ni regroupement ni sections",
          annotationsAvant: [{ n: 1, sel: ".notif-list", texte: "Une ligne par j'aime, sans regroupement ; le serveur n'en rend que 30" }],
          apres: {
            js: async (page) => page.evaluate(() => {
              const l = document.querySelector(".notif-list");
              const rows = Array.from(l.querySelectorAll(".notif-row"));
              const likes = rows.filter((r) => /a aimé ton post/.test(r.textContent));
              if (likes.length > 1) {
                const t = likes[0].querySelector(".notif-text");
                t.innerHTML = "<b>Léa Fontaine</b>, <b>Malik Benali</b> et " + (likes.length - 2) + " autres ont aimé ta publication";
                t.id = "maqGroupe";
                likes.slice(1).forEach((r) => r.remove());
              }
              const h = document.createElement("div"); h.textContent = "Nouveau"; h.style.cssText = "font:800 12px/1 inherit;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:4px 2px 8px";
              l.insertBefore(h, l.firstChild);
            }),
          },
          annotations: [{ n: 1, sel: "#maqGroupe", texte: "Les j'aime d'une même publication regroupés en une ligne" }],
        });
      },
    },

    // ── 3. TOASTS : POSITION, SUPERPOSITIONS, TON ───────────────────────────
    {
      nom: "toasts",
      demarrage: { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.activite(s, c); } },
      vues: ["m390", "m360"],
      async derouler({ page, prendre, vue }) {
        await page.waitForTimeout(1500);
        await figer(page);
        // a) sur le fil
        await viderToasts(page);
        await page.evaluate(() => toast("Lien copié"));
        await page.waitForTimeout(300);
        await prendre({ id: "TRA-040", seulement: ["m390"], titre: "Toast sur le fil (au-dessus de la barre d'onglets)", note: "Toast figé par le banc.",
          zooms: [{ nom: "toast", titre: "Toast", sel: "#toastStack .toast", marge: 20 }] });
        await viderToasts(page);
        // b) sous une fenêtre : signaler une activité, motif vide. Le bouton de la fiche
        //    est recouvert par le pied collant (TRA-050) : la fenêtre est ouverte par
        //    reportEvent() (simulé), puis « Envoyer » est un vrai toucher.
        await page.evaluate((id) => { reportEvent(id); }, jeu.EV_ID);
        await page.waitForTimeout(800);
        await page.locator("#modalContent button", { hasText: "Envoyer le signalement" }).click();
        await page.waitForTimeout(500);
        await prendre({
          id: "TRA-041", titre: "Signaler, motif vide : l'avertissement est émis SOUS la fenêtre",
          note: "Toast figé par le banc ; il existe dans la pile (« Dis-nous en deux mots… ») mais il est peint sous la fenêtre (pile z-index 200, fenêtre 10001).",
          annotationsAvant: [{ n: 1, sel: "#modalContent button.btn.primary", texte: "« Envoyer le signalement » ne répond rien de visible" }],
          apres: { css: CSS_PILE },
          annotations: [{ n: 1, sel: "#toastStack .toast", texte: "Pile au-dessus de toute superposition ; fenêtre ouverte en bas → toast en haut, sans masquer les boutons" }],
        });
        await page.evaluate(() => { try { closeModal(); } catch (e) {} try { closeEventDetail(); } catch (e) {} });
        await viderToasts(page);
        // c) dans une conversation (toast émis par la page : simulé)
        await page.evaluate(() => goTo("messages"));
        await page.waitForTimeout(900);
        await page.locator("#messageList [onclick]").first().click();
        await page.waitForTimeout(1500);
        await page.evaluate(() => toast("⚠️ Message non envoyé — réessaie", "warning"));
        await page.waitForTimeout(300);
        await prendre({
          id: "TRA-042", seulement: ["m390"], titre: "Conversation ouverte : un toast d'échec est émis, rien ne paraît",
          note: "Toast émis par appel direct de toast() (simulé), figé par le banc.",
          apres: { css: CSS_PILE },
          annotations: [{ n: 1, sel: "#toastStack .toast", texte: "Au-dessus de la conversation, en haut : le champ de saisie et le clavier restent libres" }],
        });
        await page.evaluate(() => { try { closeConversation(); } catch (e) {} goTo("feed"); });
        await viderToasts(page);
        await page.waitForTimeout(500);
        // d) pile de quatre messages, dont un échec typé « info » et un message long
        await page.evaluate(() => { toast("Lien copié"); toast("⚠️ Blocage non enregistré — réessaie"); toast("Ton compte est fermé et tes données supprimées, mais la confirmation finale n'a pas pu être enregistrée. Écris à passioadmin@gmail.com", "warning"); toast("Publication signalée. Merci, on s'en occupe.", "success"); });
        await page.waitForTimeout(300);
        await prendre({
          id: "TRA-043", titre: "Quatre toasts d'affilée : couleurs, longueurs, durée unique de 3 s",
          note: "Quatre libellés RÉELS de l'application (app-04:5176 sans type, app-02:5278, app-04:5407), émis par appel direct (simulé) et figés.",
          zooms: [{ nom: "pile", titre: "Pile", sel: "#toastStack", marge: 4 }],
          annotationsAvant: [
            { n: 1, sel: "#toastStack .toast:nth-child(2)", texte: "Un échec (« Blocage non enregistré ») peint en violet, comme une réussite" },
            { n: 2, sel: "#toastStack .toast:nth-child(3)", texte: "113 caractères, bord à bord, en pilule ; lu en 3 s comme « Lien copié »" },
          ],
          apres: {
            css: CSS_PILE,
            js: async (page) => page.evaluate(() => { const t = document.querySelector("#toastStack .toast:nth-child(2)"); if (t) { t.className = "toast warning"; t.textContent = "Blocage non enregistré — réessaie"; } }),
          },
          annotations: [
            { n: 1, sel: "#toastStack .toast:nth-child(2)", texte: "Échec = type « warning » ou « error » : fond ambre ou rouge, sans emoji" },
            { n: 2, sel: "#toastStack .toast:nth-child(3)", texte: "Marges de 16 px, coins de carte ; durée proportionnelle à la longueur (~6 s ici)" },
          ],
        });
      },
    },

    // ── 4. SIGNALEMENT ───────────────────────────────────────────────────────
    {
      nom: "signalement",
      demarrage: { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.activite(s, c); } },
      vues: ["m390"],
      async derouler({ page, prendre, serveur }) {
        await page.waitForTimeout(1500);
        await page.evaluate((id) => openEventDetails(id), jeu.EV_ID);
        await page.waitForTimeout(1500);
        // Tout en bas de la fiche (défilement maximal de #eventDetailPage)
        const enBas = () => page.evaluate(() => { const b = document.querySelector("button[onclick*='reportEvent']"); if (b) b.scrollIntoView({ block: "end" }); const m = document.getElementById("eventDetailPage"); m.scrollTop = m.scrollHeight; });
        await enBas(); await page.waitForTimeout(900); await enBas(); await page.waitForTimeout(400);
        await prendre({
          id: "TRA-050", titre: "Fiche d'activité défilée jusqu'en bas : « Signaler cet événement » reste sous le pied collant",
          zooms: [{ nom: "pied", titre: "Bas de la fiche", sel: "#eventDetailCta", marge: 40 }],
          annotationsAvant: [{ n: 1, sel: "#eventDetailCta", texte: "Le pied « Je participe » recouvre « Signaler cet événement » même au bout du défilement (elementFromPoint = #eventDetailCta)" }],
          apres: { css: ".event-detail-body{padding-bottom:calc(150px + env(safe-area-inset-bottom,0px))!important}", js: async (page) => { await page.evaluate(() => { const b = document.querySelector("button[onclick*='reportEvent']"); if (b) { b.textContent = "Signaler cette activité"; b.scrollIntoView({ block: "end" }); } const m = document.getElementById("eventDetailPage"); m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(400); } },
          annotations: [{ n: 1, sel: "button[onclick*='reportEvent']", texte: "Une marge basse égale au pied : le bouton devient atteignable ; un seul mot, « activité »" }],
        });
        // Le toucher est impossible : la fenêtre est ouverte par reportEvent() (simulé)
        await page.evaluate((id) => { reportEvent(id); }, jeu.EV_ID);
        await page.waitForTimeout(800);
        await prendre({
          id: "TRA-051", titre: "Fenêtre « Signaler cette rencontre »",
          annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title", texte: "Titre « Signaler cette rencontre » ouvert par « Signaler cet événement »" }],
          apres: { js: async (page) => page.evaluate(() => { document.querySelector("#modalContent .modal-title").textContent = "Signaler cette activité"; }) },
          annotations: [{ n: 1, sel: "#modalContent .modal-title", texte: "Le même mot que le bouton et que la fiche : « activité »" }],
        });
        // Refus du serveur programmé : la phrase ne dit pas lequel des deux cas
        serveur.pannes.push({ table: "reports", methode: "POST", status: 500, fois: 1 });
        await figer(page); await viderToasts(page);
        await page.locator("#signalementMotif").fill("Le lieu indiqué n'existe pas.");
        await page.locator("#modalContent button", { hasText: "Envoyer le signalement" }).click();
        await page.waitForTimeout(1500);
        await prendre({
          id: "TRA-052", titre: "Signalement refusé par le serveur : « déjà envoyé, ou impossible »",
          note: "Refus 500 programmé sur l'insertion `reports` (faux serveur). Toast figé.",
          annotationsAvant: [{ n: 1, sel: "#toastStack .toast", texte: "Deux causes opposées dans une phrase : faut-il réessayer ?" }],
          apres: { js: async (page) => page.evaluate(() => { const t = document.querySelector("#toastStack .toast"); t.className = "toast error"; t.textContent = "Signalement non envoyé — vérifie ta connexion et réessaie."; }), css: CSS_PILE },
          annotations: [{ n: 1, sel: "#toastStack .toast", texte: "Doublon et échec distingués (code 23505 pour le doublon : « Tu l'as déjà signalé »)" }],
        });
        await viderToasts(page);
        // Passion : le lien discret, sans motif
        await page.evaluate(() => { try { closeEventDetail(); } catch (e) {} closeModal(); });
        await page.evaluate(() => { try { openPassionExplorer("musique"); } catch (e) {} });
        await page.waitForTimeout(1500);
        const lien = page.locator(".passion-explorer-signaler .link");
        if (await lien.count()) {
          await lien.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          await prendre({
            id: "TRA-053", titre: "Fiche d'une passion — « Signaler cette passion »",
            zooms: [{ nom: "lien", titre: "Lien", sel: ".passion-explorer-signaler", marge: 10 }],
            annotationsAvant: [{ n: 1, sel: ".passion-explorer-signaler .link", texte: "Lien de 11,5 px, gris ; envoie sans motif ni confirmation, au premier toucher" }],
          });
        }
      },
    },

    // ── 5. CONFIGURATEUR : LE THÈME « SOMBRE » APPLIQUÉ ─────────────────────
    {
      nom: "theme-sombre",
      demarrage: { mode: "compte", peupler: (s, c) => base.peupler(s, c) },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(1200);
        await page.evaluate(() => openConfigurator());
        await page.waitForTimeout(800);
        await page.locator("#modalContent div[onclick*='setConfig']", { hasText: "Sombre" }).first().click();
        await page.waitForTimeout(900);
        await page.evaluate(() => closeModal());
        await page.waitForTimeout(800);
        await prendre({
          id: "TRA-055", titre: "Fil après « Sombre » dans Apparence & thème : un mode sombre partiel",
          annotationsAvant: [
            { n: 1, sel: ".app-topbar, .topbar", texte: "Barre et fond repeints ; cartes et textes mélangés (mode sombre retiré du produit, ADR)" },
            { n: 2, sel: "#feedList .post", texte: "Contrastes non vérifiés sur ce thème" },
          ],
        });
      },
    },

    // ── 6. HORS LIGNE, RECONNEXION, BANDEAU DISTANT ──────────────────────────
    {
      nom: "hors-ligne",
      demarrage: {
        mode: "compte", peupler: (s, c) => base.peupler(s, c),
        avantBoot: async (page) => {
          // La lecture distante est servie par le banc (même bandeau que le cache) : rendu déterministe.
          await page.route(/reglages_distants/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ cle: "bandeau", valeur: { texte: "Maintenance ce soir de 22 h à 22 h 30 : les messages peuvent arriver en retard.", niveau: "info" }, maj: "audit" }]) }));
          await page.addInitScript(() => {
            window.PASSIO_REGLAGES_DISTANTS = true;
            localStorage.setItem("passio_reglages_distants_v1", JSON.stringify({ recuLe: Date.now(), reglages: { delestage: 0, coupures: [], bandeau: { texte: "Maintenance ce soir de 22 h à 22 h 30 : les messages peuvent arriver en retard.", niveau: "info", id: "audit|1" } } }));
          });
        },
      },
      vues: ["m390", "m360"],
      async derouler({ page, prendre, context }) {
        await page.waitForTimeout(1800);
        await prendre({
          id: "TRA-060", titre: "Bandeau distant (message de l'équipe) au-dessus de la barre",
          note: "Bandeau posé par le cache des réglages distants (simulé : le module est inerte en local, réactivé par window.PASSIO_REGLAGES_DISTANTS).",
          annotationsAvant: [{ n: 1, sel: "#passioBandeauDistant", texte: "Fixé en haut (z-index 10050) : il recouvre la barre (cloche, réglages)" }],
          apres: { css: "#passioBandeauDistant{background:#F1ECFE!important;color:#17152B!important;box-shadow:0 1px 0 #E2D8FD!important;font-size:13.5px!important}body:has(#passioBandeauDistant){padding-top:62px!important;box-sizing:border-box!important}body:has(#passioBandeauDistant) .app-shell{height:auto!important;flex:1 1 auto!important;min-height:0!important}" },
          annotations: [{ n: 1, sel: "#passioBandeauDistant", texte: "Le bandeau POUSSE l'écran au lieu de le recouvrir ; lavis violet, texte encre" }],
        });
        // Hors ligne : le banc coupe le réseau du contexte, refuse Supabase, et prévient la page
        await context.setOffline(true);
        await page.route(/supabase\.co/, (r) => r.abort("internetdisconnected"));
        await page.evaluate(() => window.dispatchEvent(new Event("offline")));
        await page.waitForTimeout(800);
        await prendre({
          id: "TRA-061", titre: "Hors ligne : bandeau « Mode hors-ligne » + bandeau distant, empilés en haut",
          note: "Hors ligne simulé : context.setOffline + refus des requêtes Supabase + événement `offline`.",
          zooms: [{ nom: "haut", titre: "Haut de l'écran", sel: "#offlineBanner", marge: 30 }],
          annotationsAvant: [
            { n: 1, sel: "#offlineBanner", texte: "Deux bandeaux fixés à top:0 (z 9999 et 10050) : l'un cache l'autre et la barre" },
            { n: 2, sel: "#offlineBanner button", texte: "« × » sans nom accessible, 16 px" },
          ],
          apres: {
            css: "#offlineBanner{position:fixed!important;top:auto!important;bottom:calc(86px + env(safe-area-inset-bottom,0px))!important;left:16px!important;right:16px!important;border-radius:14px;z-index:2147482000!important;padding:10px 14px!important;justify-content:space-between;align-items:center;gap:10px}#offlineBanner button{min-width:44px;min-height:44px}"+"#passioBandeauDistant{background:#F1ECFE!important;color:#17152B!important;box-shadow:0 1px 0 #E2D8FD!important;font-size:13.5px!important}body:has(#passioBandeauDistant){padding-top:62px!important;box-sizing:border-box!important}body:has(#passioBandeauDistant) .app-shell{height:auto!important;flex:1 1 auto!important;min-height:0!important}",
            js: async (page) => page.evaluate(() => { const b = document.getElementById("offlineBanner"); b.firstChild.textContent = "Hors ligne — ce que tu fais sera envoyé au retour du réseau"; b.querySelector("button").setAttribute("aria-label", "Masquer"); }),
          },
          annotations: [
            { n: 1, sel: "#offlineBanner", texte: "Hors ligne : une pastille au-dessus de la barre d'onglets, qui dit ce qui se passe pour mes actions" },
            { n: 2, sel: "#passioBandeauDistant", texte: "Le message de l'équipe reste lisible, sans masquer la barre" },
          ],
        });
        // Reconnexion
        await figer(page); await viderToasts(page);
        await context.setOffline(false);
        await page.unroute(/supabase\.co/);
        // context.setOffline(false) émet lui-même l'événement « online » (un second envoi doublerait le toast).
        await page.waitForTimeout(900);
        await prendre({
          id: "TRA-062", seulement: ["m390"], titre: "Reconnexion : « envoi des messages en attente » alors qu'aucun n'attend",
          note: "Toast figé. Aucun message en file d'attente (outbox vide) au moment du retour.",
          annotationsAvant: [{ n: 1, sel: "#toastStack .toast", texte: "Annonce un envoi qui n'a pas lieu" }],
        });
      },
    },

    // ── 7. INSTALLATION (VISITEUR) ───────────────────────────────────────────
    {
      nom: "installation",
      demarrage: { mode: "visiteur", pwa: true },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(800);
        await figer(page);
        await page.evaluate(() => { pwaInstall(); });
        await page.waitForTimeout(5200);
        await prendre({
          id: "TRA-065", titre: "Installer l'application, sans invite du navigateur : « Installe via Chrome »",
          note: "pwaInstall() appelé directement (simulé) : Chromium de Playwright ne déclenche pas `beforeinstallprompt`. Agent Android émulé.",
          annotationsAvant: [{ n: 1, sel: "#pwa-content", texte: "« Regarde en haut à droite dans la barre d'adresse » : sur un téléphone Android, l'installation est dans le menu ⋮" }],
        });
      },
    },
  ],
};
