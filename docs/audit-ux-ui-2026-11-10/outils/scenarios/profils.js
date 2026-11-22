// ═══════════════════════════════════════════════════════════════════════════
// SCÉNARIOS DE CAPTURE — DOMAINE « PROFILS ET PASSIONS » (PRO-…)
//
// Contournements du banc, déclarés ici une fois :
//  ① MES PUBLICATIONS vivent dans `state.userPosts` (synchronisé par
//     `user_state`, que le faux serveur ne rejoue pas) : l'état local de
//     Camille Audit est donc posé par `jeu.etat`, et ses médias rendus absolus
//     après le boot par `jeu.absolutiser` (le port du banc n'est connu qu'alors).
//  ② LE TOAST : capture « animations coupées » → `figer` pose
//     `.toast{animation:none}` pour qu'un toast reste lisible (comme partage.js).
//  ③ LES PANNES SERVEUR sont des refus programmés du faux serveur
//     (`serveur.pannes`) : « simulé ».
//  ④ LE SÉLECTEUR DE FICHIER est un vrai `filechooser` Playwright alimenté par
//     les médias fictifs du banc (aucune photo réelle).
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const path = require("path");
const jeu = require("../jeu/profils");

const M = (n) => "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
const MED = path.join(__dirname, "..", "medias");
const compte = (etatOpts, jeuOpts, extra) => Object.assign({ mode: "compte", etat: jeu.etat(M, etatOpts || { passions: 3, rs: true }), peupler: (srv, ctx) => jeu.peupler(srv, ctx, jeuOpts || {}) }, extra || {});
const figer = (page) => page.addStyleTag({ content: ".toast{animation:none!important;opacity:1!important}" });
const pause = (page, ms) => page.waitForTimeout(ms);
async function profil(page) {
  await page.evaluate(() => goTo("profiles"));
  await jeu.absolutiser(page);
  await pause(page, 2200);
  await page.evaluate(() => { document.getElementById("appMain").scrollTop = 0; });
}
async function crayon(page, entree) {
  await page.locator("#v6bModifier").click(); await pause(page, 350);
  if (entree) { await page.locator("#profileDotsMenu >> text=" + entree).click(); await pause(page, 900); }
}
const stat = (page, i) => page.locator(".main-profile-stat:visible").nth(i);   // 0 abonnés · 1 passions · 2 abonnements
const defiler = (page, sel, marge) => page.evaluate(([s, m]) => { const e = document.querySelector(s); const z = document.getElementById("appMain"); if (e && z) z.scrollTop += e.getBoundingClientRect().top - (m || 70); }, [sel, marge]);
const defilerModale = (page, y) => page.evaluate((v) => { const m = document.querySelector("#modalContent"); if (m) m.scrollTop = v; }, y);

// ── Maquettes partagées ─────────────────────────────────────────────────────
const CSS_MQ = `
  .mq-note{display:flex;gap:10px;align-items:flex-start;background:var(--accent-tile,#f3effe);border:1px solid var(--accent-tile-line,#e2d9fb);border-radius:14px;padding:10px 12px;font-size:13.5px;line-height:1.45;color:var(--text);margin:10px 0;}
  .mq-note b{font-weight:800}
  .mq-erreur{display:flex;gap:10px;align-items:flex-start;background:#fff4f2;border:1px solid #f3c9c2;border-radius:14px;padding:10px 12px;font-size:13.5px;line-height:1.45;color:#7a1d10;margin:10px 0;}
  .mq-champ-erreur{font-size:13px;color:#b42318;margin-top:6px;font-weight:600;}
  .mq-lien{color:var(--accent);font-weight:700;text-decoration:underline;}
`;
const ajouterCss = (page, css) => page.addStyleTag({ content: CSS_MQ + (css || "") });

module.exports = {
  domaine: "profils",
  scenarios: [
    // ═════════════════════════════════════════════════════════════════════
    // MON PROFIL — compte rempli (3 passions, 7 publications de tous types)
    // ═════════════════════════════════════════════════════════════════════
    {
      nom: "mon-profil",
      demarrage: compte(),
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await profil(page);
        await prendre({
          id: "PRO-001", titre: "Mon profil — en-tête, compteurs et rail des passions",
          zooms: [{ nom: "compteurs", titre: "Compteurs (40 px de haut — SOC-C01)", sel: "#mainProfileCard .main-profile-stats", marge: 6 }, { nom: "rail", titre: "Rail des passions", sel: "#v9ProfilePassions", marge: 4 }],
          annotationsAvant: [{ n: 1, sel: "#v6bModifier", texte: "Crayon : ouvre un menu de six entrées" }, { n: 2, sel: "#mainProfileCard .main-profile-stats", texte: "Compteurs de 40 px (SOC-C01)" }, { n: 3, sel: "#v9ProfilePassions .profile-tile-count", texte: "Nombre de publications rogné" }],
          apres: { css: `#v9ProfilePassions .profile-tile-avatar .profile-tile-count{top:1px!important;right:1px!important;border-width:1.5px!important;font-size:10px!important}` },
          annotations: [{ n: 3, sel: "#v9ProfilePassions .profile-tile-count", texte: "Pastille entière, dans la vignette" }],
        });
        await defiler(page, "#v7ProfileTabs");
        await prendre({ id: "PRO-002", titre: "Mon profil — Publications, filtre « Tout » (liste de cartes)", seulement: ["m390", "m360", "d1440"],
          annotationsAvant: [{ n: 1, sel: "#screen-profiles .profile-tab[data-tab='posts']", texte: "« Tout » coché par défaut" }] });
        // Vrai geste : toucher « Photos » alors que « Tout » est coché.
        await page.locator("#screen-profiles .profile-tab[data-tab='photos']").click();
        await pause(page, 600);
        await defiler(page, "#v7ProfileTabs");
        await prendre({
          id: "PRO-003", titre: "Mon profil — toucher « Photos » : « Tout » reste coché, rien n'est filtré", seulement: ["m390"],
          zooms: [{ nom: "filtres", titre: "Deux filtres cochés", sel: "#screen-profiles .profile-tabs", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#screen-profiles .profile-tab[data-tab='posts']", texte: "« Tout » toujours coché" }, { n: 2, sel: "#screen-profiles .profile-tab[data-tab='photos']", texte: "« Photos » coché" }, { n: 3, sel: "#myPosts > *:first-child", texte: "La liste mélange encore textes et vidéos" }],
          apres: {
            js: async (page) => {
              await page.evaluate(() => { window.profileTabSelection = new Set(["photos"]); _syncProfileTabButtons(); renderProfileContent(); });
              await page.waitForTimeout(500);
              await page.evaluate(() => { const e = document.querySelector("#v7ProfileTabs"); const z = document.getElementById("appMain"); z.scrollTop += e.getBoundingClientRect().top - 70; });
            },
            attendre: 600,
          },
          annotations: [{ n: 1, sel: "#screen-profiles .profile-tab[data-tab='photos']", texte: "Choix unique : « Photos » remplace « Tout »" }, { n: 2, sel: "#myPosts > div", texte: "Grille des seules photos" }],
        });
      },
    },
    {
      nom: "mon-profil-filtre-vide",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await profil(page);
        // Vrais gestes : bulle « Cuisine » du rail, puis « Vidéos » à la place de « Tout ».
        await page.locator("#v9ProfilePassions [data-passion-tile='pp_2']").first().click();
        await pause(page, 500);
        await page.locator("#screen-profiles .profile-tab[data-tab='videos']").click();
        await page.locator("#screen-profiles .profile-tab[data-tab='posts']").click();
        await pause(page, 600);
        await defiler(page, "#v9ProfilePassions", 80);
        await prendre({
          id: "PRO-004", titre: "Mon profil — état vide filtré : « Touche « Toutes » » vise un bouton absent",
          zooms: [{ nom: "texte", titre: "Le texte de sortie", sel: "#myPosts .empty", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#myPosts .empty-text", texte: "« Toutes » n'existe plus sur cet écran" }, { n: 2, sel: "#v9ProfilePassions", texte: "Le rail n'a que des bulles de passion" }],
          apres: {
            js: async (page) => {
              await page.evaluate(() => {
                const t = document.querySelector("#myPosts .empty-text");
                if (t) t.textContent = "Touche de nouveau la bulle Cuisine (ou « Tout ») pour revoir toutes tes publications.";
                const b = document.querySelector("#myPosts .empty .btn.primary"); if (b) b.textContent = "Créer dans Cuisine";
              });
            },
          },
          annotations: [{ n: 1, sel: "#myPosts .empty-text", texte: "Le geste de sortie réel est nommé" }, { n: 2, sel: "#myPosts .empty .btn.primary", texte: "Bouton qui reprend le filtre" }],
        });
      },
    },
    {
      nom: "mon-profil-activite",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await profil(page);
        await page.locator("#v7ProfileTabs button:has-text('Activité')").click();
        await pause(page, 900);
        await defiler(page, "#v7ProfileTabs");
        await prendre({ id: "PRO-006", titre: "Mon profil — onglet Activité (une activité rejointe)",
          annotationsAvant: [{ n: 1, sel: "#profileEvents > div", texte: "Titre 12,5 px, date 10,5 px" }] });
      },
    },
    {
      nom: "compte-neuf",
      demarrage: compte({ passions: 1, posts: false, photos: false, bio: "aucune" }, { abonnes: 0, demande: false }, { sansAides: false }),
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => goTo("profiles"));
        await pause(page, 2400);
        await prendre({ id: "PRO-048", titre: "Compte neuf — aide contextuelle « second profil » (une seule passion)", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: ".hint-bubble, .passio-hint, [class*='hint']", texte: "Aide montrée une fois" }] });
        await page.evaluate(() => { document.querySelectorAll(".hint-bubble button, .passio-hint button, [class*='hint'] button").forEach((b) => { if (/compris/i.test(b.innerText)) b.click(); }); });
        await pause(page, 500);
        await prendre({ id: "PRO-005", titre: "Compte neuf — initiales, compteurs à zéro, « Publie ta première création »",
          annotationsAvant: [{ n: 1, sel: "#mainProfileAvatar", texte: "Initiales sur fond violet" }, { n: 2, sel: "#myPosts .empty", texte: "État vide guidé vers le Studio" }] });
      },
    },
    // ═════════════════════════════════════════════════════════════════════
    // MENU DU CRAYON, LISTES ABONNÉS / ABONNEMENTS, RETOUR
    // ═════════════════════════════════════════════════════════════════════
    {
      nom: "menu-et-listes",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await profil(page);
        await crayon(page);
        await prendre({
          id: "PRO-007", titre: "Crayon « Modifier le profil » → menu de six entrées",
          annotationsAvant: [{ n: 1, sel: "#v6bModifier", texte: "Icône crayon, nom « Modifier le profil »" }, { n: 2, sel: "#profileDotsMenu", texte: "… ouvre un menu (passions, thème, invitation)" }],
          apres: { css: `#v6bModifier svg{opacity:0!important}#v6bModifier::after{content:"⋯";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;line-height:1}#v6bModifier{position:absolute}` },
          annotations: [{ n: 1, sel: "#v6bModifier", texte: "« ⋯ » : la même icône que partout pour « options »" }],
        });
        await page.keyboard.press("Escape"); await pause(page, 300);
        await stat(page, 0).click(); await pause(page, 1500);
        await prendre({
          id: "PRO-008", titre: "Liste « Abonnés » (22 lignes) — emoji au lieu des photos",
          zooms: [{ nom: "ligne", titre: "Une ligne", sel: "#peopleListBody > div:first-child", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#peopleListBody > div:first-child > div:first-child", texte: "Emoji de passion, pas la photo de la personne" }, { n: 2, sel: "#peopleListBody > div:first-child", texte: "Ni passions ni état de suivi" }],
          apres: {
            js: async (page) => {
              await page.evaluate(async () => {
                const body = document.getElementById("peopleListBody");
                const { data: rels } = await supa.from("follows").select("follower_id,status").eq("following_id", MY_UID);
                const ids = (rels || []).filter((r) => r.status === "accepted").map((r) => r.follower_id);
                const { data: profs } = await supa.from("profiles").select("id,username,emoji,color,passions,avatar_url").in("id", ids);
                const map = {}; (profs || []).forEach((p) => { map[p.id] = p; });
                body.innerHTML = ids.map((id) => { const p = map[id] || {}; return _personRowHTML(id, { name: p.username, profileEmoji: p.emoji, avatar: p.color, photoUrl: p.avatar_url, passions: p.passions }); }).join("");
                document.querySelectorAll("#peopleListBody > div").forEach((r) => { r.setAttribute("role", "button"); r.style.minHeight = "56px"; });
                const t = document.querySelector("#modalContent .modal-title"); if (t) t.textContent = "Abonnés · " + ids.length;
              });
            },
            attendre: 900,
          },
          annotations: [{ n: 1, sel: "#peopleListBody > div:first-child > div:first-child", texte: "Photo de la personne quand elle en a une" }, { n: 2, sel: "#peopleListBody > div:first-child > div:last-child", texte: "Ses passions, comme dans « Abonnements »" }],
        });
        await page.evaluate(() => closeModal()); await pause(page, 400);
        await stat(page, 2).click(); await pause(page, 1200);
        await prendre({ id: "PRO-010", titre: "Liste « Abonnements » (3 lignes)",
          annotationsAvant: [{ n: 1, sel: "#peopleListBody > div:first-child", texte: "Passions affichées ici, pas dans « Abonnés »" }] });
        // Retour : ouvrir Léa depuis la liste puis fermer son profil.
        await page.evaluate(() => closeModal()); await pause(page, 300);
        await stat(page, 0).click(); await pause(page, 1500);
        await page.locator("#peopleListBody >> text=Léa Fontaine").click(); await pause(page, 2400);
        // Appui à l'endroit du « × » visible (deux « × » superposés : bouton + span).
        { const b = await page.locator("#modalContent .modal-close").first().boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
        await pause(page, 700);
        await prendre({ id: "PRO-033", titre: "Fermer le profil ouvert depuis « Abonnés » ramène au profil, pas à la liste",
          annotationsAvant: [{ n: 1, sel: "#mainProfileCard .main-profile-stats", texte: "La liste « Abonnés » a disparu : il faut la rouvrir" }] });
      },
    },
    {
      nom: "abonnes-compte-prive",
      demarrage: compte({ passions: 2 }, { moiPrive: true, abonnes: 4 }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await profil(page);
        await stat(page, 0).click(); await pause(page, 1600);
        await prendre({
          id: "PRO-009", titre: "Compte privé — la demande de Nora (en attente) est comptée et listée comme abonnée",
          annotationsAvant: [{ n: 1, sel: "#peopleListBody > div:last-child", texte: "Nora Petit : demande NON acceptée" }],
          apres: {
            js: async (page) => {
              await page.evaluate(() => {
                const body = document.getElementById("peopleListBody");
                const der = body.lastElementChild; if (der) der.remove();
                const n = document.createElement("div");
                n.className = "mq-note"; n.id = "mqDemandes";
                n.innerHTML = "<span>🔒</span><span><b>1 demande en attente</b> — elle ne compte pas tant que tu ne l'as pas acceptée. <span class='mq-lien'>Voir dans les notifications</span></span>";
                body.parentNode.insertBefore(n, body);
                const t = document.querySelector("#modalContent .modal-title"); if (t) t.textContent = "Abonnés · 7";
              });
            },
            css: CSS_MQ,
          },
          annotations: [{ n: 1, sel: "#mqDemandes", texte: "Les demandes à part, non comptées" }],
        });
        await page.evaluate(() => closeModal()); await pause(page, 400);
        await prendre({ id: "PRO-049", titre: "Compte privé — compteur « 8 abonnés » qui inclut une demande en attente",
          zooms: [{ nom: "compteurs", titre: "8 abonnés (7 acceptés + 1 demande)", sel: "#mainProfileCard .main-profile-stats", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#mainStatFollowers", texte: "8 = 7 acceptés + 1 demande" }],
          apres: { js: async (page) => { await page.evaluate(() => { document.getElementById("mainStatFollowers").textContent = "7"; }); } },
          annotations: [{ n: 1, sel: "#mainStatFollowers", texte: "Seuls les abonnés acceptés" }] });
        await page.locator(".topbar-bell").last().click(); await pause(page, 1600);
        await prendre({ id: "PRO-034", titre: "Notification de demande d'abonnement — Accepter / Refuser",
          zooms: [{ nom: "demande", titre: "La demande", sel: ".notif-demande-actions", marge: 60 }],
          annotationsAvant: [{ n: 1, sel: ".notif-demande-actions", texte: "Seul endroit où la demande se traite" }] });
        await figer(page);
        await page.locator(".notif-demande-actions button:has-text('Accepter')").first().click(); await pause(page, 1300);
        await prendre({ id: "PRO-035", titre: "Après « Accepter » — verdict « Demande acceptée »",
          annotationsAvant: [{ n: 1, sel: ".notif-demande-verdict", texte: "Le verdict remplace les boutons" }] });
      },
    },
    // ═════════════════════════════════════════════════════════════════════
    // MODIFIER LE PROFIL
    // ═════════════════════════════════════════════════════════════════════
    {
      nom: "modifier",
      demarrage: compte(),
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await profil(page);
        await crayon(page, "Modifier le profil");
        await prendre({
          id: "PRO-011", titre: "« Mon profil principal » — haut de la modale",
          zooms: [{ nom: "libelles", titre: "Deux styles de libellés", sel: "#modalContent .field", marge: 4 }],
          annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title", texte: "Titre hérité du multi-profil" }, { n: 2, sel: "#modalContent .field > span", texte: "Libellé 16 px casse normale…" }, { n: 3, sel: "#modalContent label.field > span", texte: "… puis 11 px capitales" }],
          apres: {
            css: `#modalContent .field > span:first-child{font-size:11px!important;font-weight:800!important;letter-spacing:.08em!important;text-transform:uppercase!important;color:var(--muted)!important;font-family:inherit!important}`,
            js: async (page) => { await page.evaluate(() => { const t = document.querySelector("#modalContent .modal-title"); if (t) t.textContent = "Modifier mon profil"; }); },
          },
          annotations: [{ n: 1, sel: "#modalContent .modal-title", texte: "« Modifier mon profil »" }, { n: 2, sel: "#modalContent .field > span", texte: "Un seul style de libellé" }],
        });
        await defilerModale(page, 5000); await pause(page, 400);
        await prendre({
          id: "PRO-012", titre: "« Mon profil principal » — bas : huit champs de réseaux, puis Sauvegarder",
          zooms: [{ nom: "reseaux", titre: "Huit champs toujours affichés", sel: "#modalContent .rs-link-input", marge: 40 }],
          annotationsAvant: [{ n: 1, sel: "#modalContent .rs-link-input[data-platform='tiktok']", texte: "« Tiktok URL », « Youtube », « Linkedin », « Twitter »" }, { n: 2, sel: "#modalContent .btn.primary", texte: "Sauvegarder à 1 100 px du haut" }],
          apres: {
            css: `#modalContent > div:has(> .btn.primary){position:sticky;bottom:0;background:var(--bg-card,#fff);padding:10px 0 4px;margin-bottom:-4px;z-index:3;box-shadow:0 -8px 16px -12px rgba(23,21,43,.35)}`,
            js: async (page) => {
              await page.evaluate(() => {
                const noms = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube", twitter: "X (Twitter)", linkedin: "LinkedIn", snapchat: "Snapchat", autre: "Autre site" };
                const vides = [];
                document.querySelectorAll("#modalContent .rs-link-input").forEach((i) => { i.placeholder = "Lien " + noms[i.dataset.platform]; if (!i.value) vides.push(i.parentNode); });
                vides.forEach((v) => { v.style.display = "none"; });
                const liste = vides.length ? vides[0].parentNode : null;
                if (liste) { const a = document.createElement("button"); a.className = "btn ghost"; a.id = "mqAjoutReseau"; a.style.cssText = "width:100%;min-height:44px;font-size:14px;margin-top:4px"; a.textContent = "+ Ajouter un réseau"; liste.appendChild(a); }
                const m = document.querySelector("#modalContent"); m.scrollTop = 99999;
              });
            },
          },
          annotations: [{ n: 1, sel: "#mqAjoutReseau", texte: "Réseaux vides repliés, noms de marque justes" }, { n: 2, sel: "#modalContent .btn.primary", texte: "Barre d'enregistrement toujours visible" }],
        });
        await defilerModale(page, 0); await pause(page, 300);
        await figer(page);
        await page.locator("#editUsername").fill("");
        await page.locator("#modalContent .btn.primary").click();
        await pause(page, 1600);
        await prendre({
          id: "PRO-013", titre: "Pseudo vidé puis « Sauvegarder » : « Profil mis à jour »", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: ".toast", texte: "Accepté sans contrôle (2 à 40 caractères attendus)" }, { n: 2, sel: "#mainProfileUsername", texte: "L'écran garde l'ancien nom ; le serveur a reçu « »" }],
          apres: {
            css: CSS_MQ + `.toast{display:none!important}`,
            js: async (page) => {
              await page.evaluate(() => {
                openEditMainProfile();
                const u = document.getElementById("editUsername"); u.value = ""; u.style.borderColor = "#d92d20"; u.setAttribute("aria-invalid", "true");
                const e = document.createElement("div"); e.className = "mq-champ-erreur"; e.id = "mqErrPseudo"; e.textContent = "Choisis un pseudo de 2 à 40 caractères.";
                u.parentNode.appendChild(e);
              });
            },
            attendre: 700,
          },
          annotations: [{ n: 1, sel: "#mqErrPseudo", texte: "Erreur sous le champ, modale ouverte, rien n'est envoyé" }],
        });
      },
    },
    {
      nom: "modifier-refus",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre, serveur }) {
        await profil(page);
        await figer(page);
        await crayon(page, "Modifier le profil");
        await page.locator("#editUsername").fill("Léa Fontaine");
        await page.locator("#modalContent .btn.primary").click();
        await pause(page, 1500);
        await prendre({ id: "PRO-014", titre: "Pseudo déjà pris — toast, la modale reste ouverte",
          annotationsAvant: [{ n: 1, sel: ".toast", texte: "Refus annoncé, saisie conservée" }, { n: 2, sel: "#editUsername", texte: "Le champ n'est pas marqué" }] });
        await page.evaluate(() => closeModal()); await pause(page, 2800);
        await crayon(page, "Modifier le profil");
        await page.locator("#editIsPrivate").check();
        serveur.pannes.push({ table: "profiles", methode: "PATCH", status: 500, body: { message: "panne simulée" } });
        await page.locator("#modalContent .btn.primary").click();
        await pause(page, 1800);
        await prendre({
          id: "PRO-015", titre: "« Compte privé » coché, le serveur refuse : « Profil mis à jour » quand même",
          annotationsAvant: [{ n: 1, sel: ".toast", texte: "Succès annoncé ; en base le compte reste PUBLIC" }],
          apres: {
            css: CSS_MQ + `.toast{display:none!important}`,
            js: async (page) => {
              await page.evaluate(() => {
                openEditMainProfile();
                document.getElementById("editIsPrivate").checked = true;
                const pied = document.querySelector("#modalContent .btn.primary").parentNode;
                const e = document.createElement("div"); e.className = "mq-erreur"; e.id = "mqErrSauver";
                e.innerHTML = "<span>⚠️</span><span><b>Rien n'a été enregistré.</b> Ton compte est toujours <b>public</b>. Vérifie ta connexion puis réessaie.</span>";
                pied.parentNode.insertBefore(e, pied);
                document.querySelector("#modalContent .btn.primary").textContent = "Réessayer";
                document.querySelector("#modalContent").scrollTop = 99999;
              });
            },
            attendre: 700,
          },
          annotations: [{ n: 1, sel: "#mqErrSauver", texte: "Le refus est dit, avec l'état réel" }, { n: 2, sel: "#modalContent .btn.primary", texte: "La saisie est gardée : « Réessayer »" }],
        });
      },
    },
    // ═════════════════════════════════════════════════════════════════════
    // RECADREUR
    // ═════════════════════════════════════════════════════════════════════
    {
      nom: "recadreur",
      demarrage: compte({ passions: 2 }),
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await profil(page);
        await crayon(page);
        let fc = page.waitForEvent("filechooser");
        await page.locator("#profileDotsMenu >> text=Photo de profil").click();
        (await fc).setFiles(path.join(MED, "photo-portrait.jpg"));
        await pause(page, 1500);
        await prendre({ id: "PRO-016", titre: "Recadreur de la photo de profil (cercle, zoom, Annuler / Valider)",
          zooms: [{ nom: "curseur", titre: "Curseur de zoom", sel: "#pcropZoom", marge: 14 }],
          annotationsAvant: [{ n: 1, sel: "#pcropZoom", texte: "Curseur de 16 px de haut" }, { n: 2, sel: "#pcropOk", texte: "Valider 42 px" }] });
        await page.locator("#pcropCancel").click(); await pause(page, 500);
        await crayon(page, "Modifier le profil");
        await page.locator("#editBio").fill("Bio en cours de saisie, pas encore enregistrée.");
        fc = page.waitForEvent("filechooser");
        await page.locator("#modalContent button:has-text('Changer')").click();
        (await fc).setFiles(path.join(MED, "photo-paysage.jpg"));
        await pause(page, 1500);
        await prendre({
          id: "PRO-017", titre: "Couverture changée DEPUIS « Modifier » : le recadreur s'ouvre sous la modale",
          annotationsAvant: [{ n: 1, sel: "#editCoverPreview", texte: "Photo choisie… rien ne bouge" }, { n: 2, sel: ".modal-handle", texte: "Recadreur caché derrière (z-index 6000 < 10001)" }],
          apres: { css: `.passio-cropper-ov{z-index:10050!important}` },
          annotations: [{ n: 1, sel: "#pcropView", texte: "Le recadreur passe devant la modale" }, { n: 2, sel: "#pcropOk", texte: "Valider rouvre « Modifier » avec la saisie" }],
        });
        await page.evaluate(() => closeModal()); await pause(page, 700);
        await prendre({ id: "PRO-018", titre: "Modale fermée : le recadreur oublié réapparaît", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#pcropView", texte: "Le recadreur attendait derrière" }] });
        await page.locator("#pcropCancel").click(); await pause(page, 900);
        await page.evaluate(() => closeModal()); await pause(page, 500);
        await crayon(page);
        fc = page.waitForEvent("filechooser");
        await page.locator("#profileDotsMenu >> text=Photo de couverture").click();
        (await fc).setFiles(path.join(MED, "boucle.webm"));
        await pause(page, 1600);
        await prendre({ id: "PRO-019", titre: "Fichier qui n'est pas une image (vidéo) : rien ne se passe, aucun message", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#mainProfileCover", texte: "Couverture inchangée, aucun retour" }] });
      },
    },
    // ═════════════════════════════════════════════════════════════════════
    // PROFIL VISITÉ
    // ═════════════════════════════════════════════════════════════════════
    {
      nom: "profil-visite",
      demarrage: compte(),
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await profil(page);
        await stat(page, 0).click(); await pause(page, 1500);
        await page.locator("#peopleListBody >> text=Léa Fontaine").click(); await pause(page, 2600);
        await prendre({
          id: "PRO-021", titre: "Profil visité — Léa (publique, suivie, me suit)",
          zooms: [{ nom: "actions", titre: "Message / ✓ Suivi", sel: "#visitedProfileActions", marge: 6 }, { nom: "filtres", titre: "« Posts » … « Audio / podcast »", sel: "#visitedTabs", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#visitedProfileActions", texte: "Deux boutons « pleins », 39 px, texte 12 px" }, { n: 2, sel: "#modalContent .main-profile-stats", texte: "« posts » ici, « passions » chez moi" }, { n: 3, sel: "#visitedTabs", texte: "« Posts », « Audio / podcast » ≠ « Tout », « Audio »" }],
          apres: {
            css: `#visitedProfileActions .btn{min-height:44px!important;font-size:14px!important}
                  #visitedProfileActions [id^=followBtn_]{background:var(--bg-card,#fff)!important;color:var(--accent)!important;border:1.5px solid var(--accent)!important}
                  #modalContent > .profile-dots-btn.on-cover, #modalContent > .modal-close{width:44px!important;height:44px!important}`,
            js: async (page) => {
              await page.evaluate(() => {
                document.querySelectorAll("#modalContent .main-profile-stat span:last-child").forEach((s) => { if (/^posts$/i.test(s.textContent.trim())) s.textContent = "publications"; });
                const t = document.querySelector("#visitedTabs [data-vtab='posts'] .profile-tab-lbl"); if (t) t.textContent = "Tout";
                const a = document.querySelector("#visitedTabs [data-vtab='audio'] .profile-tab-lbl"); if (a) a.textContent = "Audio";
                const b = document.querySelector("#visitedTabs [data-vtab='posts']"); if (b) { b.classList.add("active"); b.setAttribute("aria-pressed", "true"); }
              });
            },
          },
          annotations: [{ n: 1, sel: "#visitedProfileActions [id^=followBtn_]", texte: "« ✓ Suivi » en contour : un état, pas l'action principale" }, { n: 2, sel: "#modalContent .main-profile-stats", texte: "« publications »" }, { n: 3, sel: "#visitedTabs", texte: "Mêmes mots que mon profil, « Tout » coché" }],
        });
        await page.locator("#modalContent .profile-dots-btn").click(); await pause(page, 500);
        await prendre({ id: "PRO-022", titre: "Profil visité — menu « ⋯ » (Partager · Signaler · Bloquer)", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#profileDotsMenu .danger", texte: "Bloquer : agit au premier appui" }] });
        await page.keyboard.press("Escape"); await pause(page, 300);
        await page.locator("#visitedSections [data-v9-vtab='activite']").click(); await pause(page, 1200);
        await page.evaluate(() => { const e = document.getElementById("visitedSections"); if (e) e.scrollIntoView({ block: "start" }); });
        await pause(page, 400);
        await prendre({ id: "PRO-023", titre: "Profil visité — onglet Activité (Léa organise un atelier)", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#visitedEvents > div", texte: "Ligne d'activité, ouvre la fiche" }] });
      },
    },
    {
      nom: "visite-etats",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre, GENS }) {
        await profil(page);
        await figer(page);
        // Tom : me suit, je ne le suis pas — vrai geste depuis « Abonnés ».
        await stat(page, 0).click(); await pause(page, 1500);
        await page.locator("#peopleListBody >> text=Tom Girard").click(); await pause(page, 2400);
        await prendre({ id: "PRO-024", titre: "Profil visité — Tom me suit, je ne le suis pas ; aucune publication",
          annotationsAvant: [{ n: 1, sel: "#visitedProfileActions [id^=followBtn_]", texte: "« Suivre » sans dire qu'il me suit" }, { n: 2, sel: "#visitedContent .empty", texte: "« Rien à afficher pour cette sélection » sans filtre posé" }] });
        await page.evaluate(() => closeModal()); await pause(page, 400);
        // Nora : sa demande vers moi est en attente — elle figure dans « Abonnés » (vrai geste).
        await stat(page, 0).click(); await pause(page, 1500);
        await page.locator("#peopleListBody >> text=Nora Petit").click(); await pause(page, 2400);
        await prendre({ id: "PRO-028", titre: "Profil visité — Nora, sans publication (ouverte depuis « Abonnés » alors que sa demande attente)",
          annotationsAvant: [{ n: 1, sel: "#modalContent .main-profile-stats", texte: "« 1 abonnement » = sa demande en attente" }] });
        await page.evaluate(() => closeModal()); await pause(page, 400);
        // Marie-Charlotte (nom très long) — vrai geste depuis « Abonnements ».
        await stat(page, 2).click(); await pause(page, 1300);
        await page.locator("#peopleListBody >> text=Marie-Charlotte").click(); await pause(page, 2400);
        await prendre({ id: "PRO-027", titre: "Profil visité — nom très long et biographie de trois paragraphes",
          annotationsAvant: [{ n: 1, sel: "#modalContent .main-profile-username", texte: "Nom sur deux lignes, sans coupure" }] });
        await page.evaluate(() => closeModal()); await pause(page, 400);
        // Sacha : compte privé, ma demande est en attente (ouvert par openUserProfile : simulé).
        await page.evaluate((u) => openUserProfile(u), GENS.prive.id); await pause(page, 2400);
        await prendre({
          id: "PRO-025", titre: "Profil visité — compte privé, « Demande envoyée » ; « 1 abonné » = ma propre demande",
          zooms: [{ nom: "compteur", titre: "1 abonné", sel: "#modalContent .main-profile-stats", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#modalContent .main-profile-stat:nth-child(2)", texte: "Ma demande non acceptée compte « 1 abonné »" }, { n: 2, sel: "#visitedProfileActions [id^=followBtn_]", texte: "Contour : demande en vol" }],
          apres: { js: async (page) => { await page.evaluate(() => { const s = document.querySelectorAll("#modalContent .main-profile-stat")[1]; if (s) s.firstElementChild.textContent = "0"; }); } },
          annotations: [{ n: 1, sel: "#modalContent .main-profile-stat:nth-child(2)", texte: "Seuls les abonnés acceptés" }],
        });
        // Vrai geste : annuler la demande.
        await page.locator("#visitedProfileActions [id^=followBtn_]").click(); await pause(page, 1200);
        await prendre({ id: "PRO-026", titre: "Compte privé — demande annulée : « Ce compte est privé » + toast de retour",
          annotationsAvant: [{ n: 1, sel: "[data-prive-titre]", texte: "Le bloc suit l'état du bouton" }, { n: 2, sel: ".toast", texte: "Le toast dit comment renvoyer" }] });
      },
    },
    {
      nom: "blocage",
      demarrage: compte({ passions: 2 }, { bloque: true, bloquePar: true, abonnes: 2 }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await profil(page);
        await figer(page);
        await stat(page, 0).click(); await pause(page, 1500);
        await page.locator("#peopleListBody >> text=Tom Girard").click(); await pause(page, 2400);
        await prendre({
          id: "PRO-029", titre: "Profil d'un compte que J'AI bloqué (Tom) : rien ne le dit",
          annotationsAvant: [{ n: 1, sel: "#visitedProfileActions", texte: "Message et Suivre proposés comme si de rien n'était" }],
          apres: {
            css: CSS_MQ,
            js: async (page) => {
              await page.evaluate(() => {
                const a = document.getElementById("visitedProfileActions");
                a.innerHTML = "<div class='mq-note' id='mqBloque' style='width:100%;margin:0'><span>🚫</span><span><b>Tu as bloqué ce compte.</b> Il ne peut ni te suivre, ni t'écrire, ni voir tes publications.</span></div>";
                const b = document.createElement("button"); b.className = "btn ghost"; b.id = "mqDebloquer"; b.style.cssText = "width:100%;min-height:44px;margin-top:8px"; b.textContent = "Débloquer";
                a.style.flexDirection = "column"; a.appendChild(b);
              });
            },
          },
          annotations: [{ n: 1, sel: "#mqBloque", texte: "L'état de blocage est dit" }, { n: 2, sel: "#mqDebloquer", texte: "La seule action utile" }],
        });
        await page.evaluate(() => closeModal()); await pause(page, 400);
        await stat(page, 0).click(); await pause(page, 1500);
        await page.locator("#peopleListBody >> text=Inès Moreau").click(); await pause(page, 2400);
        await prendre({ id: "PRO-030", titre: "Profil d'un compte qui M'A bloquée (Inès) : profil et publication visibles, Suivre proposé",
          annotationsAvant: [{ n: 1, sel: "#visitedProfileActions [id^=followBtn_]", texte: "Suivre : refusé par le serveur au tap" }] });
        await page.evaluate(() => closeModal()); await pause(page, 400);
        await stat(page, 2).click(); await pause(page, 1300);
        await page.locator("#peopleListBody >> text=Malik Benali").click(); await pause(page, 2400);
        await page.locator("#modalContent .profile-dots-btn").click(); await pause(page, 400);
        await page.locator("#profileDotsMenu >> text=Signaler").click(); await pause(page, 900);
        await prendre({ id: "PRO-032", titre: "Signaler ce compte — motif (la modale hérite du plein écran du profil)",
          annotationsAvant: [{ n: 1, sel: "#modalContent .onb-footer", texte: "« Envoyer le signalement » sur deux lignes" }, { n: 2, sel: "#modalContent .modal-handle", texte: "Plein écran hérité, profil remplacé" }] });
        await page.locator("#modalContent button:has-text('Annuler')").click(); await pause(page, 600);
        await page.evaluate(() => closeModal()); await pause(page, 300);
        await stat(page, 2).click(); await pause(page, 1300);
        await page.locator("#peopleListBody >> text=Malik Benali").click(); await pause(page, 2400);
        await page.locator("#modalContent .profile-dots-btn").click(); await pause(page, 400);
        await page.locator("#profileDotsMenu >> text=Bloquer").click(); await pause(page, 1300);
        await prendre({
          id: "PRO-031", titre: "« Bloquer » : effet immédiat, sans confirmation (abonnement retiré en silence)",
          annotationsAvant: [{ n: 1, sel: ".toast", texte: "Le blocage est déjà écrit" }],
          apres: {
            css: CSS_MQ + `.toast{display:none!important}`,
            js: async (page) => {
              await page.evaluate(() => {
                openModal('<div class="modal-handle"></div><div class="modal-title">Bloquer Malik Benali ?</div>'
                  + '<div class="modal-subtitle" style="font-size:14px;line-height:1.5">Malik ne pourra plus te suivre, t\'écrire ni voir tes publications. Tu ne le suis plus non plus. Il n\'est pas prévenu.</div>'
                  + '<div style="display:flex;gap:8px;margin-top:16px"><button class="btn ghost" style="flex:1;min-height:44px">Annuler</button><button class="btn" id="mqConfBloquer" style="flex:1;min-height:44px;background:#b42318;color:#fff;border-color:#b42318">Bloquer</button></div>');
              });
            },
            attendre: 600,
          },
          annotations: [{ n: 1, sel: "#mqConfBloquer", texte: "Confirmation qui dit les conséquences" }],
        });
      },
    },
    // ═════════════════════════════════════════════════════════════════════
    // « MES PASSIONS »
    // ═════════════════════════════════════════════════════════════════════
    {
      nom: "mes-passions",
      demarrage: compte(),
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await profil(page);
        await stat(page, 1).click(); await pause(page, 1000);
        await prendre({
          id: "PRO-036", titre: "« Mes passions » — en-tête, cartes, ajouter",
          zooms: [{ nom: "carte", titre: "Une carte : trois emojis, badge 20 px", sel: "#passionManager .v8-passion-card", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#passionsResume", texte: "« 3 passions actives » (icône de personnes)…" }, { n: 2, sel: "#passionManager h3, #passionManager .section-title", texte: "… puis « Passions actives » en 26 px" }, { n: 3, sel: "#passionManager .passion-photo-badge", texte: "Badge photo 20 × 20 px" }],
          apres: {
            css: `#passionsResume{display:none!important}
                  #passionManager .passion-photo-badge{width:28px!important;height:28px!important;font-size:14px!important;right:-6px!important;bottom:-6px!important}
                  #passionManager .passion-photo-badge::before{content:"";position:absolute;inset:-8px}
                  #passionManager .profile-card-name{font-size:15px!important}`,
            js: async (page) => {
              await page.evaluate(() => {
                document.querySelectorAll("#passionManager .v8-passion-card .profile-card-name").forEach((n) => { n.textContent = n.textContent.replace(/^\S+\s+/, ""); });
                const h = Array.from(document.querySelectorAll("#passionManager *")).find((e) => e.children.length === 0 && /^Passions actives$/.test(e.textContent.trim()));
                if (h) { h.textContent = "Actives · 3"; h.style.fontSize = "17px"; }
              });
            },
          },
          annotations: [{ n: 1, sel: "#passionManagerTitre", texte: "Un seul titre, le compte dans la rubrique" }, { n: 2, sel: "#passionManager .profile-card-name", texte: "Un emoji (celui de l'avatar), pas trois" }, { n: 3, sel: "#passionManager .passion-photo-badge", texte: "Badge 28 px, zone de 44 px" }],
        });
        await page.locator("#aidePassionManager").click(); await pause(page, 800);
        await prendre({
          id: "PRO-037", titre: "Aide « Comment marchent tes passions » — parle de « place » et de « changement »", seulement: ["m390", "m360"],
          annotationsAvant: [{ n: 1, sel: "#modalContent .passions-aide p:last-child", texte: "« quand une place et un changement sont disponibles »" }],
          apres: { js: async (page) => { await page.evaluate(() => { const p = document.querySelector("#modalContent .passions-aide p:last-child"); if (p) p.innerHTML = "<b>Archiver ne supprime rien.</b> Publications, activités, bobines et médias d'une passion archivée restent enregistrés ; tu peux la réactiver quand tu veux."; }); } },
          annotations: [{ n: 1, sel: "#modalContent .passions-aide p:last-child", texte: "Règle en vigueur : réactiver quand on veut" }],
        });
      },
    },
    {
      nom: "mes-passions-gestes",
      demarrage: compte(),
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await profil(page);
        await stat(page, 1).click(); await pause(page, 1000);
        await page.locator("#passionManager .profile-dots-btn").first().click(); await pause(page, 400);
        await prendre({ id: "PRO-038", titre: "Menu « ⋯ » d'une carte de passion", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#profileDotsMenu", texte: "Modifier · Photo · Photo de fond · Archiver" }] });
        await page.locator("#profileDotsMenu >> text=Modifier cette passion").click(); await pause(page, 800);
        await prendre({
          id: "PRO-039", titre: "Modifier une passion — « Bio de ce profil », titre ✏️ 🎸, libellés de deux styles",
          annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title", texte: "Deux emojis de titre" }, { n: 2, sel: "#modalContent label.field > span", texte: "« Bio de ce PROFIL »" }, { n: 3, sel: "#modalContent .field > span", texte: "Libellés 16 px vs 11 px capitales" }],
          apres: {
            css: `#modalContent .field > span:first-child{font-size:11px!important;font-weight:800!important;letter-spacing:.08em!important;text-transform:uppercase!important;color:var(--muted)!important}`,
            js: async (page) => {
              await page.evaluate(() => {
                const t = document.querySelector("#modalContent .modal-title"); if (t) t.textContent = "Modifier « Musique »";
                const s = document.querySelector("#modalContent label.field > span"); if (s) s.firstChild.textContent = "Ce que tu partages ici ";
              });
            },
          },
          annotations: [{ n: 1, sel: "#modalContent .modal-title", texte: "Titre en mots" }, { n: 2, sel: "#modalContent label.field > span", texte: "Plus de « profil » pour une passion" }],
        });
        await page.evaluate(() => closeModal()); await pause(page, 400);
        await page.locator("#passionManager .profile-dots-btn").nth(2).click(); await pause(page, 300);
        await page.locator("#profileDotsMenu >> text=Archiver cette passion").click(); await pause(page, 800);
        await prendre({
          id: "PRO-040", titre: "Confirmation d'archivage — « restent visibles dans « Toutes » »", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#modalContent b", texte: "« Toutes » : aucun bouton ne porte ce nom" }],
          apres: { js: async (page) => { await page.evaluate(() => { const d = document.querySelector("#modalContent b"); if (d && d.parentNode) d.parentNode.innerHTML = "🍳 Cuisine quitte tes passions actives.<br/><b>Rien n'est supprimé</b> : tes publications, activités, bobines et médias restent sur ton profil, et tu peux la réactiver quand tu veux."; }); } },
          annotations: [{ n: 1, sel: "#modalContent b", texte: "« restent sur ton profil »" }],
        });
        await page.locator("#modalContent button:has-text('Archiver')").last().click(); await pause(page, 1300);
        await defiler(page, "#passionArchiveToggle", 200);
        await prendre({ id: "PRO-041", titre: "Passions archivées (repliables) — « Réactiver »", seulement: ["m390"],
          zooms: [{ nom: "reactiver", titre: "Réactiver 83 × 34 px", sel: "#passionArchiveBox button:has-text('Réactiver')", marge: 10 }],
          annotationsAvant: [{ n: 1, sel: "#passionArchiveBox button:has-text('Réactiver')", texte: "34 px de haut" }],
          apres: { css: `#passionArchiveBox button{min-height:44px!important}` },
          annotations: [{ n: 1, sel: "#passionArchiveBox button:has-text('Réactiver')", texte: "44 px" }] });
      },
    },
    {
      nom: "derniere-passion",
      demarrage: compte({ passions: 1 }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await profil(page);
        await figer(page);
        await stat(page, 1).click(); await pause(page, 900);
        await page.locator("#passionManager .profile-dots-btn").first().click(); await pause(page, 300);
        await page.locator("#profileDotsMenu >> text=Archiver cette passion").click(); await pause(page, 900);
        await prendre({ id: "PRO-042", titre: "Archiver la dernière passion : refus par toast",
          annotationsAvant: [{ n: 1, sel: ".toast", texte: "« Tu dois garder au moins une passion active »" }] });
      },
    },
    {
      nom: "ajouter-passion",
      demarrage: compte(),
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await profil(page);
        await stat(page, 1).click(); await pause(page, 900);
        await page.locator("#nouveauProfilLien").click(); await pause(page, 1300);
        await prendre({
          id: "PRO-043", titre: "Ajouter une passion — idées (dont Musique et Photo, déjà miennes)",
          annotationsAvant: [{ n: 1, sel: "#modalContent button:has-text('Musique')", texte: "Déjà dans mes passions, rien ne le dit" }, { n: 2, sel: "#modalContent input", texte: "Exemple de saisie tronqué" }],
          apres: {
            js: async (page) => {
              await page.evaluate(() => {
                const i = document.querySelector("#modalContent input"); if (i) i.placeholder = "Rechercher une passion";
                ["Musique", "Photo"].forEach((nom) => {
                  const b = Array.from(document.querySelectorAll("#modalContent button")).find((x) => x.innerText.replace(/\s+/g, " ").trim().replace(/\+$/, "").trim().endsWith(nom) && x.innerText.indexOf(nom) > -1 && x.innerText.trim().split(/\s+/).length <= 3);
                  if (b) { b.style.opacity = ".55"; const plus = Array.from(b.querySelectorAll("*")).find((e) => e.children.length === 0 && e.textContent.trim() === "+"); if (plus) { plus.textContent = "Déjà ajoutée"; plus.style.fontSize = "12px"; plus.style.fontWeight = "700"; } b.id = b.id || ("mqDeja" + nom); }
                });
              });
            },
          },
          annotations: [{ n: 1, sel: "#mqDejaMusique", texte: "« Déjà ajoutée », non actionnable" }],
        });
        await page.locator("#modalContent input").first().fill("céramique raku"); await pause(page, 1300);
        await prendre({ id: "PRO-044", titre: "Recherche dans le référentiel — « céramique raku » → Raku", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#modalContent button:has-text('Raku')", texte: "Un résultat, ajout en un appui" }] });
        await page.locator("#modalContent input").first().fill("zzqxw"); await pause(page, 1300);
        await prendre({ id: "PRO-045", titre: "Recherche sans résultat — « Demander l'ajout de « zzqxw » »", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#modalContent button:has-text('Demander')", texte: "La demande remplace la création (suspendue)" }] });
      },
    },
    {
      nom: "passion-perso-suspendue",
      demarrage: compte(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await profil(page);
        await page.evaluate(() => openCreateCustomPassion()); await pause(page, 800);
        await prendre({ id: "PRO-046", titre: "Créer sa passion — « momentanément indisponible » (appel direct : simulé)",
          annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title", texte: "Porte fermée, expliquée" }] });
      },
    },
    {
      nom: "plafond-arme",
      demarrage: compte({ passions: 3 }, {}, { avantBoot: async (page) => { await page.addInitScript(() => { window.PASSIO_PLAFOND_PASSIONS = true; }); } }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await profil(page);
        await stat(page, 1).click(); await pause(page, 900);
        await page.locator("#nouveauProfilLien").click(); await pause(page, 1300);
        await prendre({ id: "PRO-047", titre: "Fenêtre de limite des passions — plafond ARMÉ (état conditionnel, pas la règle en vigueur)",
          annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title, #modalContent h2, #modalContent h3", texte: "N'apparaît qu'avec PASSIO_PLAFOND_PASSIONS" }] });
      },
    },
  ],
};
