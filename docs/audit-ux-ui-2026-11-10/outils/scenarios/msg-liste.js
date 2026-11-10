// Scénarios de capture — MESSAGERIE : liste, nouvelle conversation, groupes, paramètres, appels.
// Données : outils/jeu/msg-liste.js (tout est fictif). Les APRÈS sont des maquettes appliquées par le
// banc (css/js) ; aucune ne décrit une fonction existante : ce sont des propositions.
"use strict";
const path = require("path");
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");

const peuplerQuelques = (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerQuelques(srv, ctx); };
const peuplerVolume = (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerVolume(srv, ctx); };
const carte = (nom) => '#messageList .msg-card:has(.msg-name:has-text("' + nom + '"))';
const allerMessages = async (page, n) => { await page.evaluate(() => goTo("messages")); await jeu.attendreListe(page, n == null ? 3 : n); await page.waitForTimeout(500); };
const ouvrir = async (page, nom) => { await page.locator(carte(nom)).tap(); await page.waitForTimeout(900); };
const parametres = async (page) => { await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap(); await page.waitForTimeout(500); };
const item = (page, texte) => page.locator("#convSettingsContent .csetting-item", { hasText: texte }).first();
const retour = async (page) => { await page.locator("#convFpHead .conv-fp-back").tap(); await page.waitForTimeout(700); };
const plus = async (page, n) => { await page.locator(".v6a-plus").tap(); await page.waitForTimeout(250); await page.locator("#v6aMenu .v6a-menu-item").nth(n).tap(); await page.waitForTimeout(650); };
const dialogues = (page, accepter, texte) => page.on("dialog", (d) => (accepter ? d.accept(texte) : d.dismiss()).catch(() => {}));

// Icônes de maquette (SVG currentColor), injectées dans la page par les APRÈS.
const ICONES = {
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  cloche: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  clocheOff: '<path d="M6 16V11a6 6 0 0 1 9-5.2M18 11v5l2 2H8"/><path d="M4 4l16 16"/>',
  epingle: '<path d="M9 3h6l-1 6 3 3H7l3-3z"/><path d="M12 12v9"/>',
  nonlu: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  trombone: '<path d="M20 11l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7"/>',
  loupe: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-2 1-2h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/>',
  export: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M4 14v6h16v-6"/>',
  bloquer: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  drapeau: '<path d="M5 21V4h12l-2 4 2 4H5"/>',
  gomme: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  croix: '<path d="M6 6l12 12M18 6L6 18"/>',
  tel: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.300-1.300a2 2 0 0 1 2.1-.4c.9.3 1.800.6 2.800.7a2 2 0 0 1 1.700 2z"/>',
  micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  groupe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.500 20c0-3.500 3-5.500 6.500-5.500s6.500 2 6.500 5.500"/><circle cx="17" cy="9" r="2.500"/><path d="M17.500 14.500c2.500.300 4 1.800 4 4.500"/>',
};
const posterIcones = (page) => page.evaluate((I) => { window.__ico = (n, t) => '<svg viewBox="0 0 24 24" width="' + (t || 20) + '" height="' + (t || 20) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block">' + I[n] + "</svg>"; }, ICONES);

// ── Maquettes partagées ─────────────────────────────────────────────────────
const CSS_LISTE = `
  #archivedToggleRow:empty{margin:0!important} .v6a-head [data-v6a]{margin-bottom:12px!important}
  #screen-messages #messageList{margin-top:-22px}
  .msg-head{min-width:0} .msg-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
  .msg-name svg{display:inline-block!important;vertical-align:-2px;margin:0 5px 0 0;color:var(--muted)} .msg-name span + svg{margin:0 0 0 6px}
  .msg-badge{min-width:20px!important;max-width:none!important;height:20px!important;font-size:11px!important;color:#fff!important;padding:0 6px!important;border-radius:999px!important}
`;
const jsListe = async (page) => {
  await posterIcones(page);
  await page.evaluate((ID) => {
    document.querySelectorAll("#messageList .msg-card").forEach((k) => {
      const p = k.querySelector(".msg-preview"); const n = k.querySelector(".msg-name");
      const moi = /^Toi : /.test(p.textContent) ? "Toi : " : "";
      let t = p.textContent.replace(/^Toi : /, "");
      t = t.replace(/^\[DOC\] /, "Document · ").replace(/^\[AUDIO\] /, "Fichier audio · ").replace(/^📍 Ma position.*/, "Position partagée");
      p.textContent = moi + t;
      const id = (k.getAttribute("onclick").match(/'([^']+)'/) || [])[1];
      if (/^📌/.test(n.textContent)) n.innerHTML = window.__ico("epingle", 14) + "<span>" + n.textContent.replace(/^📌\s*/, "") + "</span>";
      if (id === ID.malik) n.innerHTML = "<span>" + n.textContent + "</span>" + window.__ico("clocheOff", 14);
    });
  }, jeu.ID);
};

module.exports = {
  domaine: "msg-liste",
  scenarios: [
    // ═════════ LISTE ═════════
    {
      nom: "liste",
      demarrage: { mode: "compte", peupler: peuplerQuelques },
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await allerMessages(page, 5);
        // État simulé : Tom épinglée, Malik en sourdine (drapeaux locaux posés après le démarrage).
        await jeu.drapeauxLocaux(page, { [jeu.ID.tom]: { pinned: true }, [jeu.ID.malik]: { _muted: true } });
        await page.waitForTimeout(400);
        await prendre({
          id: "MSG-001", titre: "Messages — liste, contenu normal (12 conversations, 1 épinglée, 1 en sourdine)",
          note: "Compte connecté, faux serveur. Épingle et sourdine posées par données injectées (simulé).",
          zooms: [{ nom: "ligne-non-lue", titre: "Ligne non lue", sel: carte("Léa Fontaine"), marge: 6 }, { nom: "ligne-epinglee", titre: "Ligne épinglée", sel: carte("Tom Girard"), marge: 6 }, { nom: "ligne-sourdine", titre: "Ligne en sourdine", sel: carte("Malik Benali"), marge: 6 }, { nom: "tete", titre: "Tête de l'écran", sel: "#v6aHead", marge: 8 }, { nom: "onglet", titre: "Onglet Messages", sel: '#appNavV2 [data-v2-key="messages"]', marge: 8 }],
          annotationsAvant: [
            { n: 1, sel: carte("Léa Fontaine") + " .msg-badge", texte: "Non-lu : un point de 12 × 9 px, sans nombre (l'onglet, lui, affiche 8)" },
            { n: 2, sel: carte("Tom Girard") + " .msg-name", texte: "Épingle = emoji 📌 collé au nom" },
            { n: 3, sel: carte("Malik Benali") + " .msg-name", texte: "Sourdine : aucun repère dans la liste" },
            { n: 4, sel: "#messageList", texte: "34 px vides entre la recherche et la première ligne" },
          ],
          apres: { css: CSS_LISTE, js: jsListe },
          annotations: [
            { n: 1, sel: carte("Léa Fontaine") + " .msg-badge", texte: "Le nombre de non-lus est lisible sur la ligne" },
            { n: 2, sel: carte("Tom Girard") + " .msg-name", texte: "Épingle en icône fonctionnelle (SVG)" },
            { n: 3, sel: carte("Malik Benali") + " .msg-name", texte: "Cloche barrée : la sourdine se voit" },
            { n: 4, sel: carte("Marie-Charlotte") + " .msg-name", texte: "Nom long sur une ligne, coupé proprement" },
          ],
        });
        await page.evaluate(() => { document.getElementById("appMain").scrollTop = 99999; });
        await page.waitForTimeout(300);
        await prendre({
          id: "MSG-002", titre: "Messages — bas de liste : aperçus de pièces jointes", seulement: ["m390"],
          zooms: [{ nom: "apercu-doc", titre: "Aperçu d'un document", sel: carte("Grimpe du jeudi"), marge: 6 }, { nom: "apercu-audio", titre: "Aperçu d'un fichier audio", sel: carte("Clémence Vasseur"), marge: 6 }, { nom: "apercu-position", titre: "Aperçu d'une position", sel: carte("Bastien Leroy"), marge: 6 }, { nom: "sans-message", titre: "Conversation sans message", sel: carte("Driss Haddad"), marge: 6 }],
          annotationsAvant: [
            { n: 1, sel: carte("Grimpe du jeudi") + " .msg-preview", texte: "« [DOC] topo-falaise.pdf » : étiquette technique" },
            { n: 2, sel: carte("Bastien Leroy") + " .msg-preview", texte: "Adresse Google Maps brute en aperçu" },
            { n: 3, sel: carte("Clémence Vasseur") + " .msg-preview", texte: "« [AUDIO] … »" },
            { n: 4, sel: carte("Driss Haddad"), texte: "Fil ouvert par l'autre, sans aucun message : il apparaît quand même" },
          ],
          apres: { css: CSS_LISTE, js: jsListe },
          annotations: [
            { n: 1, sel: carte("Grimpe du jeudi") + " .msg-preview", texte: "« Document · topo-falaise.pdf »" },
            { n: 2, sel: carte("Bastien Leroy") + " .msg-preview", texte: "« Toi : Position partagée »" },
            { n: 3, sel: carte("Clémence Vasseur") + " .msg-preview", texte: "« Fichier audio · … »" },
          ],
        });
      },
    },
    // ═════════ MENU « + » ET NOUVEAU MESSAGE ═════════
    {
      nom: "nouveau",
      demarrage: { mode: "compte", peupler: peuplerQuelques },
      vues: ["m390", "m360"],
      async derouler({ page, prendre, banc }) {
        await allerMessages(page, 5);
        await page.locator(".v6a-plus").tap();
        await page.waitForTimeout(300);
        await prendre({ id: "MSG-003", titre: "Menu « + » : Nouveau message / Nouveau groupe", seulement: ["m390"], zooms: [{ nom: "menu", titre: "Menu", sel: "#v6aMenu", marge: 10 }] });
        await page.locator("#v6aMenu .v6a-menu-item").first().tap();
        await page.waitForTimeout(650);
        await prendre({
          id: "MSG-004", titre: "Nouveau message — ouverture (contacts déjà joints)",
          zooms: [{ nom: "ligne", titre: "Ligne de personne", sel: "#_nmResults ._nm-row", marge: 4 }, { nom: "champ", titre: "Champ de recherche", sel: "#_nmSearch", marge: 8 }],
          annotationsAvant: [
            { n: 1, sel: "#_nmSearch", texte: "« Chercher un utilisateur… » : ni étiquette, ni type recherche" },
            { n: 2, sel: "#_nmResults ._nm-row", texte: "Liste sans titre ; avatars carrés (ronds partout ailleurs)" },
          ],
          apres: {
            css: `#_nmResults ._nm-row > div:first-child{border-radius:50%!important} ._nm-titre{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 4px 2px}`,
            js: async (p) => p.evaluate(() => { const i = document.getElementById("_nmSearch"); i.placeholder = "Rechercher une personne…"; i.setAttribute("aria-label", "Rechercher une personne"); const b = document.getElementById("_nmResults"); const t = document.createElement("div"); t.className = "_nm-titre"; t.textContent = "Récents"; b.insertBefore(t, b.firstChild); b.querySelectorAll("._nm-row > div:last-child").forEach((d) => { d.textContent = "›"; d.style.fontSize = "20px"; d.style.color = "var(--muted)"; }); }),
          },
          annotations: [
            { n: 1, sel: "#_nmSearch", texte: "« Rechercher une personne… », champ nommé" },
            { n: 2, sel: "._nm-titre", texte: "La liste dit ce qu'elle est : « Récents »" },
            { n: 3, sel: "#_nmResults ._nm-row", texte: "Avatar rond, comme dans la liste et l'en-tête" },
          ],
        });
        const rendre = await banc.simulerClavier(page, 300);
        await prendre({ id: "MSG-008", titre: "Nouveau message — clavier ouvert (simulé)", seulement: ["m360"], note: "Clavier virtuel simulé par réduction de la fenêtre (300 px)." });
        await rendre();
        await page.locator("#_nmSearch").fill("tom");
        await page.waitForTimeout(1100);
        await prendre({
          id: "MSG-005", titre: "Nouveau message — recherche « tom » : une vraie personne et un personnage d'exemple", seulement: ["m390"],
          zooms: [{ nom: "resultats", titre: "Résultats", sel: "#_nmResults", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: '#_nmResults ._nm-row[data-uid="u_tom"]', texte: "« Tom Larivière » est un personnage d'exemple : rien ne le dit, on ne peut pas lui écrire" }],
          apres: { js: async (p) => p.evaluate(() => { document.querySelectorAll('#_nmResults ._nm-row[data-uid^="u_"]').forEach((r) => r.remove()); document.querySelectorAll("#_nmResults ._nm-row > div:first-child").forEach((d) => { d.style.borderRadius = "50%"; }); }) },
          annotations: [{ n: 1, sel: "#_nmResults ._nm-row", texte: "Un compte connecté ne voit que de vraies personnes" }],
        });
        await page.locator("#_nmSearch").fill("lea f");
        await page.waitForTimeout(1100);
        await prendre({
          id: "MSG-006", titre: "Nouveau message — « lea f » sans accent : « Aucun utilisateur trouvé » alors que Léa Fontaine est un contact", seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#_nmResults", texte: "La recherche distingue « lea » de « Léa »" }],
          apres: { js: async (p) => p.evaluate(() => { const b = document.getElementById("_nmResults"); b.innerHTML = '<div class="_nm-row" style="display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--border)"><div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#ec4899);flex-shrink:0"></div><div style="font-weight:700;font-size:14px;color:var(--text);flex:1"><b style="background:var(--accent-tile,#efe9ff);border-radius:4px">Léa F</b>ontaine</div><div style="font-size:20px;color:var(--muted)">›</div></div>'; }) },
          annotations: [{ n: 1, sel: "#_nmResults ._nm-row", texte: "Accents et casse ignorés : « lea f » trouve « Léa Fontaine »" }],
        });
      },
    },
    {
      nom: "compte-neuf",
      demarrage: { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx) },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => goTo("messages"));
        await page.waitForTimeout(1500);
        await prendre({ id: "MSG-060", titre: "Messages — compte connecté sans conversation : cinq « Exemple PASSIO »", zooms: [{ nom: "ligne-exemple", titre: "Ligne d'exemple", sel: "#messageList .msg-card", marge: 6 }] });
        await plus(page, 0);
        await prendre({
          id: "MSG-007", titre: "Nouveau message — compte sans conversation : cinq lignes « Passionné »",
          zooms: [{ nom: "liste", titre: "Suggestions", sel: "#_nmResults", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: "#_nmResults ._nm-row", texte: "Cinq lignes identiques « Passionné » : les personnages des conversations d'exemple, sans nom ni étiquette" }],
          apres: { js: async (p) => p.evaluate(() => { const i = document.getElementById("_nmSearch"); i.placeholder = "Rechercher une personne…"; document.getElementById("_nmResults").innerHTML = '<div style="padding:28px 12px;text-align:center"><div style="font-weight:800;font-size:15px;color:var(--text);font-family:var(--v2-titre,inherit)">À qui veux-tu écrire ?</div><div style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.45">Tape le nom d\'une personne.<br>Tu peux aussi écrire depuis un profil ou une publication.</div></div>'; }) },
          annotations: [{ n: 1, sel: "#_nmResults", texte: "Pas de faux contacts : une consigne claire tant qu'il n'y a personne à proposer" }],
        });
        await page.locator("#_nmSearch").fill("malik");
        await page.waitForTimeout(1100);
        await page.locator("#_nmResults ._nm-row").first().tap();
        await page.waitForTimeout(1800);
        await retour(page);
        await prendre({ id: "MSG-061", titre: "Messages — après avoir ouvert un fil sans écrire : ligne « Démarrer la conversation… » en tête, exemples mêlés", annotationsAvant: [{ n: 1, sel: "#messageList .msg-card", texte: "Fil créé (aussi côté serveur) sans qu'aucun message soit parti" }, { n: 2, sel: "#messageList .msg-card:nth-child(2)", texte: "Les exemples restent mêlés à la vraie conversation" }] });
      },
    },
    // ═════════ GROUPES ═════════
    {
      nom: "groupes",
      demarrage: { mode: "compte", peupler: peuplerQuelques },
      vues: ["m390", "m360"],
      async derouler({ page, prendre, banc, serveur, vue }) {
        dialogues(page, false);
        await allerMessages(page, 5);
        await plus(page, 1);
        await prendre({
          id: "MSG-010", titre: "Nouveau groupe — formulaire",
          zooms: [{ nom: "membres", titre: "Membres à inviter", sel: ".group-user-list", marge: 6 }, { nom: "passions", titre: "Passions du groupe", sel: ".group-passion-grid", marge: 8 }],
          annotationsAvant: [
            { n: 1, sel: ".group-user-list", texte: "Dix personnages d'exemple, aucune vraie personne, aucune recherche" },
            { n: 2, sel: ".group-passion-grid", texte: "Passion obligatoire, case de 32 px de haut" },
          ],
          apres: {
            css: `.group-passion-option{min-height:44px;padding:0 14px;font-size:14px} .mq-rech{width:100%;box-sizing:border-box;margin-bottom:8px}`,
            js: async (p) => p.evaluate(() => {
              const noms = getConversations().filter((c) => !c.isGroup && c.userName && !/^u_/.test(c.userId)).slice(0, 4);
              const l = document.querySelector(".group-user-list");
              l.innerHTML = noms.map((c) => { const u = userById(c.userId) || {}; return '<div class="group-user-option"><span class="msg-avatar" style="background:' + avatarBg({ avatar: c.userColor, profileEmoji: c.userEmoji, photoUrl: u.photoUrl || c.userPhoto }) + ';width:36px;height:36px;font-size:18px;flex-shrink:0;">' + avatarInner({ avatar: c.userColor, profileEmoji: c.userEmoji, photoUrl: u.photoUrl || c.userPhoto }) + '</span><span style="flex:1;font-size:14px;">' + escapeHtml(c.userName) + '</span><span class="grp-check"></span></div>'; }).join("");
              const r = document.createElement("input"); r.className = "input mq-rech"; r.placeholder = "Rechercher une personne…"; r.setAttribute("aria-label", "Rechercher une personne à inviter"); l.parentNode.insertBefore(r, l);
              const lab = [...document.querySelectorAll("#modalContent label.field span")]; lab.forEach((s) => { if (/Passion/.test(s.textContent)) s.textContent = "Passion du groupe (facultatif)"; if (/Membres/.test(s.textContent)) s.textContent = "Personnes à inviter"; });
            }),
          },
          annotations: [
            { n: 1, sel: ".mq-rech", texte: "On cherche de vraies personnes" },
            { n: 2, sel: ".group-user-list", texte: "Proposées d'abord : celles à qui j'ai déjà écrit" },
            { n: 3, sel: ".group-passion-grid", texte: "Passion facultative (règle métier à trancher), case de 44 px" },
          ],
        });
        await page.locator("#groupName").fill("Cordes du dimanche");
        await page.locator("#modalContent .group-passion-option").first().tap();
        await page.locator("#modalContent .group-user-option").nth(0).tap();
        await page.locator("#modalContent .group-user-option").nth(2).tap();
        await page.waitForTimeout(250);
        const rendre = await banc.simulerClavier(page, 300);
        await prendre({ id: "MSG-011", titre: "Nouveau groupe — rempli, clavier ouvert (simulé)", seulement: ["m360"], note: "Clavier virtuel simulé (300 px)." });
        await rendre();
        await page.evaluate(() => { try { closeModal(); } catch (e) {} });
        await page.waitForTimeout(400);
        await ouvrir(page, "Grimpe du jeudi");
        await prendre({
          id: "MSG-012", titre: "Conversation de groupe — en-tête", racine: "#convFpHead",
          zooms: [{ nom: "entete", titre: "En-tête de groupe", sel: "#convFpHead", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: "#convFpHead .conv-fp-head-avatar", texte: "L'avatar du groupe est la photo d'UN membre (la liste montre 👥)" },
            { n: 2, sel: "#convFpHead .conv-fp-head-info", texte: "Annoncé « bouton », mais toucher le nom ne fait rien" },
            { n: 3, sel: '#convFpHead .conv-action-btn[title="Membres"]', texte: "Seule porte vers les membres : icône de 34 px, sans nom accessible" },
          ],
          apres: {
            css: `#convFpHead .conv-fp-back{width:44px;height:44px} #convFpHead .conv-action-btn{width:44px;height:44px} #convFpHead .conv-actions{gap:0}`,
            js: async (p) => p.evaluate(() => { const a = document.querySelector("#convFpHead .conv-fp-head-avatar"); a.style.background = "var(--accent)"; a.innerHTML = "👥"; const s = document.querySelector("#convFpHead .conv-fp-passion"); s.textContent = "4 membres · voir le groupe"; const m = document.querySelector('#convFpHead .conv-action-btn[title="Membres"]'); if (m) m.remove(); }),
          },
          annotations: [
            { n: 1, sel: "#convFpHead .conv-fp-head-avatar", texte: "Même avatar de groupe que dans la liste" },
            { n: 2, sel: "#convFpHead .conv-fp-head-info", texte: "Le nom ouvre le groupe ; la ligne le dit" },
            { n: 3, sel: '#convFpHead .conv-action-btn[title="Paramètres"]', texte: "Cibles de 44 px" },
          ],
        });
        await page.locator('#convFpHead .conv-action-btn[title="Membres"]').tap();
        await page.waitForTimeout(650);
        await prendre({
          id: "MSG-013", titre: "Groupe — fenêtre « membres » (je suis la créatrice)",
          zooms: [{ nom: "ligne-membre", titre: "Ligne d'un membre", sel: "#grpPanel_members > div > div:nth-child(2)", marge: 4 }, { nom: "tete", titre: "Tête de la fenêtre", sel: "#modalContent .modal-title", marge: 30 }],
          annotationsAvant: [
            { n: 1, sel: "#modalContent .modal-title + div", texte: "« 5 membres » ; l'en-tête et la liste disent 4" },
            { n: 2, sel: "#grpPanel_members > div > div:first-child", texte: "« Admin · En ligne » : écrit en dur, quel que soit mon rôle" },
            { n: 3, sel: "#grpPanel_members button", texte: "« Retirer » : 55 × 26 px, sans confirmation ni annulation" },
            { n: 4, sel: "#grpPanel_members > div > div:nth-child(2)", texte: "« ✨ Passion » : libellé de remplissage" },
          ],
          apres: {
            css: `#grpPanel_members button{min-height:44px;padding:0 14px!important;font-size:13px!important} #grpTab_members,#grpTab_add{min-height:44px}`,
            js: async (p) => p.evaluate(() => {
              const c = document.getElementById("modalContent");
              [...c.querySelectorAll("div")].forEach((d) => { if (d.children.length === 0 && /^\d+ membres?$/.test(d.textContent.trim())) d.textContent = "4 membres · créé par toi"; if (d.children.length === 0 && /^✨ Passion$/.test(d.textContent.trim())) d.remove(); });
              [...c.querySelectorAll("span")].forEach((s) => { if (/^✨ Passion$/.test(s.textContent.trim())) s.remove(); });
              document.getElementById("grpTab_members").textContent = "Membres (4)";
              const moi = c.querySelector("#grpPanel_members > div > div:first-child"); moi.querySelector("div:nth-child(2) > div:nth-child(2)").textContent = "Tu as créé ce groupe"; moi.querySelector("span").textContent = "Créatrice";
              const t = c.querySelector(".modal-title"); t.textContent = "Grimpe du jeudi"; t.style.textAlign = "center"; t.nextElementSibling.style.textAlign = "center";
            }),
          },
          annotations: [
            { n: 1, sel: "#modalContent .modal-title + div", texte: "Un seul nombre, le même que dans l'en-tête" },
            { n: 2, sel: "#grpPanel_members > div > div:first-child", texte: "Rôle réel ; plus de fausse présence « En ligne »" },
            { n: 3, sel: "#grpPanel_members button", texte: "« Retirer » en 44 px ; confirmation avant d'agir" },
          ],
        });
        await page.locator("#grpTab_add").tap();
        await page.waitForTimeout(400);
        await prendre({ id: "MSG-014", titre: "Groupe — onglet « Ajouter » : candidats = personnages d'exemple d'abord", seulement: ["m390"], annotationsAvant: [{ n: 1, sel: "#grpAddList", texte: "78 candidats, les personnages d'exemple en tête ; recherche locale seulement, sensible aux accents" }, { n: 2, sel: "#grpAddList button", texte: "« + Ajouter » : 73 × 27 px" }] });
        if (vue === "m390") {
          const [sel] = await Promise.all([page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null), page.locator('#modalContent [onclick^="pickGroupPhoto"]').tap()]);
          if (sel) { await sel.setFiles(path.join(banc.AUDIT, "outils", "medias", "photo-carre.jpg")); await page.waitForTimeout(900); }
          await prendre({ id: "MSG-016", titre: "Groupe — après le choix d'une photo : « mise à jour » annoncée, avatar inchangé", seulement: ["m390"], note: "Erreur JavaScript relevée : renderConvList is not defined (app-05:2134).", annotationsAvant: [{ n: 1, sel: '#modalContent [onclick^="pickGroupPhoto"]', texte: "Toujours 👥 après « Photo du groupe mise à jour »" }] });
          await page.evaluate(() => { try { closeModal(); } catch (e) {} });
          await page.waitForTimeout(400);
          await retour(page);
          await ouvrir(page, "Répétition ouverte");
          await page.locator('#convFpHead .conv-action-btn[title="Membres"]').tap();
          await page.waitForTimeout(650);
          await prendre({ id: "MSG-015", titre: "Discussion d'activité — fenêtre « membres » vue par une simple participante", seulement: ["m390"], annotationsAvant: [{ n: 1, sel: "#grpPanel_members > div > div:first-child", texte: "Je ne suis pas la créatrice : affichée « Admin »" }, { n: 2, sel: "#grpPanel_members button", texte: "« Retirer » proposé sur l'organisatrice elle-même (le serveur refusera)" }, { n: 3, sel: "#grpTab_members", texte: "« Membres (8) » : 7 en base, 6 lignes affichées" }] });
        }
      },
    },
    // ═════════ EN-TÊTE 1:1 ET PARAMÈTRES ═════════
    {
      nom: "parametres",
      demarrage: { mode: "compte", peupler: peuplerQuelques },
      vues: ["m390", "m360"],
      async derouler({ page, prendre, vue }) {
        dialogues(page, false);
        await allerMessages(page, 5);
        await ouvrir(page, "Malik Benali");
        await prendre({
          id: "MSG-020", titre: "Conversation 1:1 — en-tête (production : appels désactivés)", racine: "#convFpHead",
          zooms: [{ nom: "entete", titre: "En-tête", sel: "#convFpHead", marge: 0 }],
          annotationsAvant: [{ n: 1, sel: "#convFpHead .conv-fp-back", texte: "Retour : 36 × 36 px visibles" }, { n: 2, sel: '#convFpHead .conv-action-btn[title="Paramètres"]', texte: "⋮ : zone touchable 38 × 46 px, nommé par « title » seulement" }, { n: 3, sel: "#convFpHead .conv-fp-passion", texte: "« Voir le profil » en 11 px" }],
          apres: { css: `#convFpHead .conv-fp-back{width:44px;height:44px} #convFpHead .conv-action-btn{width:44px;height:44px} #convFpHead .conv-fp-passion{font-size:12px}`, js: async (p) => p.evaluate(() => { const b = document.querySelector('#convFpHead .conv-action-btn[title="Paramètres"]'); b.setAttribute("aria-label", "Options de la conversation"); }) },
          annotations: [{ n: 1, sel: "#convFpHead .conv-fp-back", texte: "44 × 44 px" }, { n: 2, sel: '#convFpHead .conv-action-btn[title="Paramètres"]', texte: "44 × 44 px, nom accessible « Options de la conversation »" }],
        });
        await parametres(page);
        await prendre({
          id: "MSG-021", titre: "Paramètres d'une conversation 1:1 — haut du panneau",
          zooms: [{ nom: "items", titre: "Entrées", sel: "#convSettingsContent .csetting-item:nth-of-type(2)", marge: 4 }],
          annotationsAvant: [
            { n: 1, sel: "#convSettingsPanel .conv-fp-head", texte: "« Paramètres » : de quelle conversation ?" },
            { n: 2, sel: "#convSettingsContent .csetting-item:nth-of-type(3)", texte: "« Couper les notifications » : sans effet mesuré (son, cloche et badge continuent)" },
            { n: 3, sel: "#convSettingsContent .csetting-item:nth-of-type(8)", texte: "« Accusés de lecture » : réglage de TOUT le compte, rangé ici" },
            { n: 4, sel: "#convSettingsContent .csetting-item:nth-of-type(12)", texte: "« Effacer les messages » en gris : paraît inactif, efface tout" },
          ],
          apres: {
            css: `.mq-ico{width:36px;display:flex;justify-content:center;color:var(--accent);flex-shrink:0} .mq-danger .mq-ico,.mq-danger .csetting-label{color:#B42318!important} .mq-aide{font-size:12px;color:var(--muted);font-weight:500;margin-top:2px}`,
            js: async (p) => { await posterIcones(p); await p.evaluate(() => {
              const c = document.getElementById("convSettingsContent");
              const it = (ico, lib, aide, danger) => '<div class="csetting-item' + (danger ? " mq-danger" : "") + '"><div class="mq-ico">' + window.__ico(ico) + '</div><div class="csetting-label">' + lib + (aide ? '<div class="mq-aide">' + aide + "</div>" : "") + "</div></div>";
              const sec = (t) => '<div class="csetting-section">' + t + "</div>";
              c.innerHTML = sec("Conversation") + it("profil", "Voir le profil") + it("cloche", "Couper les notifications", "Plus de son ni d'alerte pour cette conversation") + it("epingle", "Épingler en haut de la liste") + it("nonlu", "Marquer comme non lu") + it("archive", "Archiver")
                + sec("Contenu") + it("trombone", "Pièces jointes et médias") + it("loupe", "Rechercher dans la conversation") + it("palette", "Fond de conversation") + it("export", "Exporter")
                + sec("Confidentialité") + it("bloquer", "Bloquer Malik Benali", "", true) + it("drapeau", "Signaler", "", true)
                + sec("Supprimer") + it("gomme", "Effacer les messages", "Sur cet appareil seulement", true) + it("croix", "Supprimer la conversation", "Elle reste visible pour Malik Benali", true);
              document.querySelector("#convSettingsPanel .conv-fp-head > div").textContent = "Malik Benali";
            }); },
          },
          annotations: [
            { n: 1, sel: "#convSettingsPanel .conv-fp-head", texte: "Le panneau porte le nom de la conversation" },
            { n: 2, sel: "#convSettingsContent .csetting-item:nth-of-type(3)", texte: "Chaque réglage dit son effet" },
            { n: 3, sel: "#convSettingsContent .csetting-item:nth-of-type(2)", texte: "Icônes fonctionnelles en SVG, plus d'emoji" },
            { n: 4, sel: "#convSettingsContent .csetting-section:nth-of-type(8)", texte: "Quatre groupes ; « Accusés de lecture » rejoint Options › Confidentialité" },
          ],
        });
        await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
        await page.waitForTimeout(300);
        await prendre({
          id: "MSG-022", titre: "Paramètres d'une conversation 1:1 — bas du panneau (actions destructrices)",
          annotationsAvant: [
            { n: 1, sel: "#convSettingsContent .csetting-item:last-child", texte: "« Supprimer la conversation » rangée sous CONFIDENTIALITÉ, hors écran à l'ouverture" },
            { n: 2, sel: "#convSettingsContent .csetting-item:nth-last-child(3) .csetting-label", texte: "Rouge #EF4444 sur #F7F5FC : 3,5:1" },
            { n: 3, sel: "#convSettingsContent .csetting-item:nth-last-child(6)", texte: "Archiver 📥 / Exporter 📤 : deux icônes quasi identiques" },
          ],
        });
        await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 0; });
        await item(page, "Fond de conversation").tap();
        await page.waitForTimeout(550);
        await prendre({
          id: "MSG-023", titre: "Fond de conversation — sélecteur",
          zooms: [{ nom: "pastilles", titre: "Six fonds", sel: "#modalContent > div[style*='grid']", marge: 6 }],
          annotationsAvant: [{ n: 1, sel: '#modalContent [onclick^="_setConvBg"]:nth-child(2)', texte: "Cinq fonds sur six sont sombres, dans une application sans mode sombre" }, { n: 2, sel: "#modalContent .modal-title", texte: "Emoji 🎨 dans le titre" }],
          apres: { js: async (p) => p.evaluate(() => { const T = [["Par défaut", "#F7F5FC"], ["Lavande", "linear-gradient(160deg,#EFE9FF,#E3D9FF)"], ["Brume", "linear-gradient(160deg,#EEF3FA,#DFE8F5)"], ["Sable", "linear-gradient(160deg,#FBF4EA,#F3E7D5)"], ["Menthe", "linear-gradient(160deg,#ECF8F1,#DBEFE4)"], ["Rosée", "linear-gradient(160deg,#FCEFF4,#F6DDE7)"]]; [...document.querySelectorAll('#modalContent [onclick^="_setConvBg"]')].forEach((d, i) => { d.children[0].style.background = T[i][1]; d.children[0].style.borderBottom = "1px solid var(--border)"; d.children[1].textContent = T[i][0]; d.style.border = "2px solid " + (i === 0 ? "var(--accent)" : "var(--border)"); }); document.querySelector("#modalContent .modal-title").textContent = "Fond de conversation"; }) },
          annotations: [{ n: 1, sel: '#modalContent [onclick^="_setConvBg"]:nth-child(2)', texte: "Fonds clairs : dates, heures et accusés restent lisibles" }],
        });
        await page.locator('#modalContent [onclick^="_setConvBg"]').nth(1).tap();
        await page.waitForTimeout(800);
        await prendre({ id: "MSG-024", titre: "Fond « Violet » appliqué : date et heures presque invisibles", seulement: ["m390"], annotationsAvant: [{ n: 1, sel: "#convFpThread .conv-bubble-time", texte: "Heure #6E6987 sur violet nuit : environ 3:1" }] });
        // remet le fond par défaut (geste réel)
        await parametres(page);
        await item(page, "Fond de conversation").tap();
        await page.waitForTimeout(450);
        await page.locator('#modalContent [onclick^="_setConvBg"]').nth(0).tap();
        await page.waitForTimeout(700);
        if (vue !== "m390") return;
        await parametres(page);
        await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
        await item(page, "Signaler").tap();
        await page.waitForTimeout(650);
        await prendre({ id: "MSG-025", titre: "Signaler ce compte — fenêtre de motif", seulement: ["m390"] });
        await page.locator("#modalContent button", { hasText: "Annuler" }).tap();
        await page.waitForTimeout(500);
        await retour(page);
        await ouvrir(page, "Grimpe du jeudi");
        await parametres(page);
        await prendre({ id: "MSG-026", titre: "Paramètres d'un groupe", seulement: ["m390"], annotationsAvant: [{ n: 1, sel: "#convSettingsContent .csetting-item:last-child", texte: "« Supprimer la conversation » ici, « Quitter » dans la fenêtre des membres : deux sorties différentes" }] });
        await item(page, "Pièces jointes").tap();
        await page.waitForTimeout(600);
        await prendre({ id: "MSG-028", titre: "Pièces jointes d'une conversation (groupe : un document)", seulement: ["m390"] });
      },
    },
    // ═════════ ARCHIVES, ÉPINGLE, NON-LUS ═════════
    {
      nom: "archives",
      demarrage: { mode: "compte", peupler: peuplerQuelques },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        dialogues(page, false);
        await allerMessages(page, 5);
        await ouvrir(page, "Tom Girard"); await parametres(page); await item(page, "Épingler").tap(); await page.waitForTimeout(400); await retour(page);
        // Archivée SANS être lue : simulé (le geste réel ouvre la conversation, donc la lit).
        await jeu.drapeauxLocaux(page, { [jeu.ID.lea]: { archived: true } });
        await page.waitForTimeout(400);
        await prendre({
          id: "MSG-030", titre: "Messages — une conversation épinglée (geste réel), une archivée encore non lue (simulé)",
          zooms: [{ nom: "bandeau", titre: "Bandeau « Archivées »", sel: "#archivedToggleRow", marge: 6 }, { nom: "onglet", titre: "Onglet Messages", sel: '#appNavV2 [data-v2-key="messages"]', marge: 8 }],
          annotationsAvant: [{ n: 1, sel: "#archivedToggleRow button", texte: "« Archivées (1) » : rien ne dit qu'elle contient 2 non-lus" }, { n: 2, sel: ".nav-msg-badge", texte: "L'onglet compte 8 ; la liste visible n'en montre que 6" }],
          apres: {
            css: CSS_LISTE + `#archivedToggleRow .mq-arch{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:0 14px;border-radius:var(--radius-md);border:1px solid var(--border);background:transparent;color:var(--text);font-size:14px;font-weight:700} .mq-arch .mq-n{margin-left:auto;background:var(--accent);color:#fff;border-radius:999px;font-size:11px;padding:2px 8px}`,
            js: async (p) => { await jsListe(p); await p.evaluate(() => { document.getElementById("archivedToggleRow").innerHTML = '<button class="mq-arch"><span style="color:var(--muted)">' + window.__ico("archive", 20) + '</span><span>Archivées</span><span style="color:var(--muted);font-weight:500">1 conversation</span><span class="mq-n">2</span></button>'; }); },
          },
          annotations: [{ n: 1, sel: "#archivedToggleRow .mq-arch", texte: "La rangée « Archivées » porte ses non-lus : le compte de l'onglet se retrouve" }],
        });
        await page.locator("#archivedToggleRow button").tap();
        await page.waitForTimeout(500);
        await prendre({
          id: "MSG-031", titre: "Messages — vue des conversations archivées",
          annotationsAvant: [{ n: 1, sel: ".v6a-title", texte: "Le titre reste « Messages » ; « + » et recherche inchangés" }, { n: 2, sel: "#archivedToggleRow button", texte: "Seul repère : un bouton « ← Retour aux conversations »" }],
          apres: { css: CSS_LISTE + `.v6a-plus{visibility:hidden} .mq-ret{width:44px;height:44px;border:none;border-radius:12px;background:var(--accent-wash,#efe9ff);color:var(--accent);font-size:22px;margin-right:10px} #archivedToggleRow{display:none}`, js: async (p) => p.evaluate(() => { const t = document.querySelector(".v6a-title"); t.textContent = "Archivées"; const b = document.createElement("button"); b.className = "mq-ret"; b.setAttribute("aria-label", "Retour aux conversations"); b.textContent = "‹"; t.parentNode.insertBefore(b, t); t.parentNode.style.justifyContent = "flex-start"; document.getElementById("convGlobalSearch").placeholder = "Rechercher dans les archives…"; }) },
          annotations: [{ n: 1, sel: ".v6a-title", texte: "L'écran dit où l'on est ; retour à gauche, comme dans une conversation" }],
        });
      },
    },
    // ═════════ RECHERCHE ET PAGINATION ═════════
    {
      nom: "recherche",
      demarrage: { mode: "compte", peupler: peuplerVolume },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await allerMessages(page, 10);
        await page.evaluate(() => { document.getElementById("appMain").scrollTop = 99999; });
        await page.waitForTimeout(400);
        await prendre({ id: "MSG-035", titre: "Messages — 46 conversations : pagination à 30", zooms: [{ nom: "bouton", titre: "Bouton de pagination", sel: '#messageList button[onclick="_loadMoreConvs()"]', marge: 8 }] });
        await page.evaluate(() => { document.getElementById("appMain").scrollTop = 0; });
        await page.locator("#convGlobalSearch").fill("accueil");
        await page.waitForTimeout(500);
        await prendre({ id: "MSG-033", titre: "Recherche « accueil » : trouvé dans le DERNIER message d'une conversation", annotationsAvant: [{ n: 1, sel: "#messageList .msg-card .msg-preview", texte: "Le mot trouvé n'est pas mis en évidence" }] });
        await page.locator("#convGlobalSearch").fill("capodastre");
        await page.waitForTimeout(500);
        await prendre({
          id: "MSG-034", titre: "Recherche « capodastre » : « Aucun résultat » alors que le mot figure dans un message plus ancien",
          annotationsAvant: [{ n: 1, sel: "#messagesEmpty .empty-title", texte: "Seul le dernier message de chaque conversation est connu de la recherche" }, { n: 2, sel: "#convGlobalSearch", texte: "Pas de bouton pour effacer ; la recherche reste posée quand on quitte l'écran" }],
          apres: {
            css: `.mq-x{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:none;background:transparent;color:var(--muted);font-size:20px} #convGlobalSearch{padding-right:48px}`,
            js: async (p) => p.evaluate(() => { const i = document.getElementById("convGlobalSearch"); i.setAttribute("aria-label", "Rechercher une conversation"); const b = document.createElement("button"); b.className = "mq-x"; b.setAttribute("aria-label", "Effacer la recherche"); b.textContent = "×"; i.parentNode.appendChild(b); document.querySelector("#messagesEmpty .empty-text").textContent = "Aucun nom de conversation ni dernier message ne contient « capodastre ». Pour chercher plus loin, ouvre la conversation puis « Rechercher dans la conversation »."; }),
          },
          annotations: [{ n: 1, sel: ".mq-x", texte: "Effacer en un geste (44 px)" }, { n: 2, sel: "#messagesEmpty .empty-text", texte: "Le message dit ce qui a été cherché, et où chercher plus loin" }],
        });
      },
    },
    // ═════════ EXEMPLES ET ÉTAT VIDE (sans session) ═════════
    {
      nom: "exemples",
      demarrage: { mode: "demo" },
      vues: ["m390", "m360"],
      async derouler({ page, prendre, vue }) {
        dialogues(page, true);
        await page.evaluate(() => goTo("messages"));
        await page.waitForTimeout(1500);
        await prendre({ id: "MSG-036", titre: "Messages — cinq conversations d'exemple (mode démo, sans session)", seulement: ["m390"], zooms: [{ nom: "ligne", titre: "Ligne d'exemple", sel: "#messageList .msg-card", marge: 6 }] });
        await page.locator("#messageList .msg-card").first().tap();
        await page.waitForTimeout(900);
        await parametres(page);
        await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
        await page.waitForTimeout(250);
        if (vue === "m390") await prendre({ id: "MSG-027", titre: "Paramètres d'une conversation d'exemple : 14 actions, dont « Bloquer » sans nom", seulement: ["m390"], annotationsAvant: [{ n: 1, sel: "#convSettingsContent .csetting-item:nth-last-child(3)", texte: "« Bloquer » : le nom manque" }, { n: 2, sel: "#convSettingsContent .csetting-item:nth-last-child(2)", texte: "Signaler, bloquer, archiver… un personnage fictif" }] });
        for (let i = 0; i < 5; i++) {
          if (i > 0) { await page.locator("#messageList .msg-card").first().tap(); await page.waitForTimeout(700); await parametres(page); await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; }); }
          await item(page, "Supprimer la conversation").tap();
          await page.waitForTimeout(800);
        }
        await prendre({
          id: "MSG-037", titre: "Messages — état vide (toutes les conversations supprimées par de vrais gestes)",
          annotationsAvant: [{ n: 1, sel: "#messagesEmpty .empty-text", texte: "« Recherche un utilisateur ci-dessus » : le champ ci-dessus ne cherche pas de personnes" }, { n: 2, sel: ".v6a-plus", texte: "La vraie porte est ce « + », que le texte ne cite pas" }],
          apres: { css: `.mq-cta{margin-top:16px;min-height:48px;padding:0 22px;border:none;border-radius:999px;background:var(--accent);color:#fff;font-weight:800;font-size:15px}`, js: async (p) => p.evaluate(() => { const e = document.getElementById("messagesEmpty"); e.querySelector(".empty-title").textContent = "Aucune conversation pour l'instant"; e.querySelector(".empty-text").textContent = "Écris à une personne dont la passion te parle, ou réponds depuis une publication."; const b = document.createElement("button"); b.className = "mq-cta"; b.textContent = "Nouveau message"; e.appendChild(b); }) },
          annotations: [{ n: 1, sel: ".mq-cta", texte: "Une action principale, celle du « + »" }, { n: 2, sel: "#messagesEmpty .empty-text", texte: "Le texte ne renvoie plus à un champ qui ne fait pas cela" }],
        });
      },
    },
    // ═════════ BLOCAGE ═════════
    {
      nom: "blocage",
      demarrage: { mode: "compte", peupler: peuplerQuelques },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        dialogues(page, true);
        await allerMessages(page, 5);
        await ouvrir(page, "Inès Moreau"); await parametres(page);
        await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
        await item(page, "Bloquer").tap();
        await page.waitForTimeout(700);
        await prendre({ id: "MSG-041", titre: "Messages — juste après « Bloquer Inès Moreau » (confirmation native acceptée)", attendre: 100, annotationsAvant: [{ n: 1, sel: "#messageList", texte: "La conversation a disparu ; aucun lien vers « Comptes bloqués » ni annulation" }] });
        await page.evaluate(() => openBlockedList());
        await page.waitForTimeout(550);
        await prendre({ id: "MSG-040", titre: "Comptes bloqués (Options ··· › Personnalisation › Comptes bloqués)", note: "Fenêtre ouverte par appel de fonction (openBlockedList) : le chemin réel passe par le panneau Options.", zooms: [{ nom: "ligne", titre: "Ligne et bouton", sel: "#blockedListBox > div", marge: 6 }], annotationsAvant: [{ n: 1, sel: "#blockedListBox button", texte: "« Débloquer » : 81 × 29 px, texte de 11 px" }] });
      },
    },
    // ═════════ HORS LIGNE ═════════
    {
      nom: "reseau",
      demarrage: { mode: "compte", peupler: peuplerQuelques },
      vues: ["m390"],
      async derouler({ page, prendre, context }) {
        await allerMessages(page, 5);
        await page.route(/supabase\.co/, (r) => r.abort("internetdisconnected"));
        await context.setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event("offline")));
        await page.waitForTimeout(800);
        await prendre({ id: "MSG-038", titre: "Messages — hors ligne (simulé) : bandeau global, liste en cache", note: "Hors ligne simulé : context.setOffline + refus de toute requête Supabase.", zooms: [{ nom: "bandeau", titre: "Bandeau hors ligne", sel: "#offlineBanner", marge: 0 }], annotationsAvant: [{ n: 1, sel: "#offlineBanner", texte: "Le bandeau recouvre la barre du haut ; × de 23 px sans nom" }] });
        await plus(page, 0);
        await page.locator("#_nmSearch").fill("nino");
        await page.waitForTimeout(1800);
        await prendre({ id: "MSG-039", titre: "Nouveau message hors ligne : « Aucun utilisateur trouvé » (la personne existe)", annotationsAvant: [{ n: 1, sel: "#_nmResults", texte: "Une panne de réseau est présentée comme une absence de résultat" }] });
      },
    },
    // ═════════ APPELS (désactivés en production — écrans SIMULÉS) ═════════
    {
      nom: "appels",
      demarrage: { mode: "compte", stockage: { passio_appels_actifs: "1" }, peupler: peuplerQuelques },
      vues: ["m390", "m360"],
      async derouler({ page, prendre, GENS, vue }) {
        const NOTE = "SIMULÉ. En production les appels sont désactivés (PASSIO_APPELS_ACTIFS = false) : aucun bouton d'appel n'est rendu. Drapeau d'essai armé ; écran rendu par sa fonction, sans WebRTC.";
        await allerMessages(page, 5);
        await ouvrir(page, "Marie-Charlotte");
        await prendre({
          id: "MSG-050", titre: "En-tête 1:1 avec boutons d'appel (drapeau d'essai)", note: NOTE, racine: "#convFpHead",
          zooms: [{ nom: "entete", titre: "En-tête", sel: "#convFpHead", marge: 0 }],
          annotationsAvant: [{ n: 1, sel: "#convFpHead .conv-fp-name", texte: "Nom réduit à 148 px par trois boutons" }, { n: 2, sel: '#convFpHead .conv-action-btn[title="Appel audio"]', texte: "34 px, zone touchable 38 px de large, « title » pour seul nom" }],
          apres: { css: `#convFpHead .conv-fp-back{width:44px;height:44px} #convFpHead .conv-action-btn{width:44px;height:44px} #convFpHead .conv-actions{gap:0} #convFpHead{gap:8px;padding:8px 6px 8px 10px}`, js: async (p) => p.evaluate(() => { const v = document.querySelector('#convFpHead .conv-action-btn[title="Appel vidéo"]'); if (v) v.remove(); document.querySelector('#convFpHead .conv-action-btn[title="Appel audio"]').setAttribute("aria-label", "Appeler"); }) },
          annotations: [{ n: 1, sel: '#convFpHead .conv-action-btn[title="Appel audio"]', texte: "Un seul bouton « Appeler » de 44 px (audio ou vidéo se choisit ensuite)" }, { n: 2, sel: "#convFpHead .conv-fp-name", texte: "Le nom regagne de la place" }],
        });
        await page.evaluate((lea) => { window._callIncoming = { callId: "audit-1", from: lea.id, kind: "voice", identite: { name: lea.nom, emoji: "🎸", color: "#7c3aed", photo: null } }; _callRenderIncomingUI(window._callIncoming); }, GENS.lea);
        await page.waitForTimeout(500);
        await prendre({
          id: "MSG-051", titre: "Appel entrant (audio)", note: NOTE,
          zooms: [{ nom: "commandes", titre: "Refuser / Répondre", sel: "#callOverlay .call-controls", marge: 14 }],
          annotationsAvant: [{ n: 1, sel: "#callOverlay .call-control-btn.hangup", texte: "📵 et ✅ : emojis sans libellé, 12 px d'écart" }, { n: 2, sel: "#callOverlay .call-avatar", texte: "Emoji sur violet fixe : jamais la photo de la personne" }],
          apres: {
            css: `#callOverlay .call-controls{gap:64px;margin-top:36px} #callOverlay .call-control-btn{width:68px;height:68px;animation:none} .mq-lab{display:block;color:#fff;font-size:13px;font-weight:600;margin-top:8px;text-align:center} #callOverlay .call-avatar{animation:none;background-size:cover!important}`,
            js: async (p) => { await posterIcones(p); await p.evaluate(() => { const o = document.getElementById("callOverlay"); const [r, a] = o.querySelectorAll(".call-control-btn"); const env = (b, ico, lab, rot) => { const w = document.createElement("div"); b.parentNode.insertBefore(w, b); w.appendChild(b); b.innerHTML = window.__ico(ico, 28); if (rot) b.firstChild.style.transform = "rotate(135deg)"; b.setAttribute("aria-label", lab); const s = document.createElement("span"); s.className = "mq-lab"; s.textContent = lab; w.appendChild(s); }; env(r, "tel", "Refuser", true); env(a, "tel", "Répondre"); const av = o.querySelector(".call-avatar"); const ph = (state.seed.users.find((u) => u.name === "Léa Fontaine") || {}).photoUrl; if (ph) { av.textContent = ""; av.style.background = "url('" + ph + "') center/cover"; } o.querySelector(".call-status").textContent = "Appel audio entrant"; }); },
          },
          annotations: [{ n: 1, sel: "#callOverlay .call-controls", texte: "Deux commandes nommées, écartées, en icônes" }, { n: 2, sel: "#callOverlay .call-avatar", texte: "La photo de profil : on reconnaît qui appelle" }],
        });
        if (vue === "m360") {
          await page.evaluate((p) => { window._callIncoming = { callId: "audit-2", from: p.id, kind: "video", identite: { name: p.nom, emoji: "🎻", color: "#7c3aed", photo: null } }; _callRenderIncomingUI(window._callIncoming); }, GENS.long);
          await page.waitForTimeout(400);
          await prendre({ id: "MSG-052", titre: "Appel vidéo entrant — nom très long", note: NOTE, seulement: ["m360"] });
        }
        await page.locator("#callOverlay .call-control-btn.hangup").tap();
        await page.waitForTimeout(500);
        await page.evaluate((lea) => { window._call = { id: "audit-3", peer: { id: lea.id, name: lea.nom, emoji: "🎸", color: "#7c3aed", photo: null }, kind: "voice", role: "caller", status: "calling", localStream: null, remoteStream: null, pc: null, chan: null, startedAt: 0, _facing: "user" }; _callRenderActiveUI(); }, GENS.lea);
        await page.waitForTimeout(400);
        await prendre({ id: "MSG-053", titre: "Appel sortant (audio) : « Appel en cours… »", note: NOTE, seulement: ["m390"], annotationsAvant: [{ n: 1, sel: "#callTimer", texte: "« 00:00 » affiché avant toute réponse" }, { n: 2, sel: "#callStatusText", texte: "« Appel en cours… » pendant la sonnerie" }] });
        await page.evaluate(() => { _callMarkConnected(); window._call.startedAt = Date.now() - 83000; clearInterval(callTimerInterval); document.getElementById("callTimer").textContent = "01:23"; document.getElementById("callStats").textContent = "audio · 32 kb/s · relais"; });
        await page.waitForTimeout(300);
        await prendre({
          id: "MSG-054", titre: "Appel audio en cours", note: NOTE,
          zooms: [{ nom: "commandes", titre: "Commandes", sel: "#callOverlay .call-controls", marge: 14 }, { nom: "minuteur", titre: "Minuteur et statistiques", sel: "#callTimer", marge: 26 }],
          annotationsAvant: [{ n: 1, sel: "#callTimer", texte: "Violet #6D32F4 sur fond nuit : environ 2,1:1" }, { n: 2, sel: "#callStats", texte: "« audio · 32 kb/s · relais » : diagnostic technique montré à tous" }, { n: 3, sel: "#callOverlay .call-control-btn.mute", texte: "Micro : emoji sombre sur fond sombre, presque invisible" }],
          apres: {
            css: `#callTimer{color:#fff!important} #callStats{display:none} #callOverlay .call-controls{gap:40px;margin-top:28px} #callOverlay .call-control-btn{width:64px;height:64px} #callOverlay .call-control-btn.mute{background:rgba(255,255,255,.16);color:#fff} .mq-lab{display:block;color:#fff;font-size:13px;font-weight:600;margin-top:8px;text-align:center} #callOverlay .call-avatar{animation:none}`,
            js: async (p) => { await posterIcones(p); await p.evaluate(() => { const o = document.getElementById("callOverlay"); const [m, h] = o.querySelectorAll(".call-control-btn"); const env = (b, ico, lab, rot) => { const w = document.createElement("div"); b.parentNode.insertBefore(w, b); w.appendChild(b); b.innerHTML = window.__ico(ico, 26); if (rot) b.firstChild.style.transform = "rotate(135deg)"; b.setAttribute("aria-label", lab); const s = document.createElement("span"); s.className = "mq-lab"; s.textContent = lab; w.appendChild(s); }; env(m, "micro", "Micro"); env(h, "tel", "Raccrocher", true); }); },
          },
          annotations: [{ n: 1, sel: "#callTimer", texte: "Minuteur blanc, lisible" }, { n: 2, sel: "#callOverlay .call-controls", texte: "Commandes visibles et nommées ; diagnostic retiré de l'écran" }],
        });
        if (vue === "m390") {
          await page.evaluate(() => { try { _callTeardown(); } catch (e) {} });
          await page.evaluate((lea) => { window._call = { id: "audit-4", peer: { id: lea.id, name: lea.nom, emoji: "🎸", color: "#7c3aed", photo: null }, kind: "video", role: "callee", status: "connecting", localStream: null, remoteStream: null, pc: null, chan: null, startedAt: 0, _facing: "user" }; _callRenderActiveUI(); _callMarkConnected(); clearInterval(callTimerInterval); document.getElementById("callTimer").textContent = "00:42"; document.getElementById("callStats").textContent = "1280×720 · 30 fps · 1.4 Mb/s"; }, GENS.lea);
          await page.waitForTimeout(400);
          await prendre({ id: "MSG-055", titre: "Appel vidéo en cours (aucun flux : vidéos noires)", note: NOTE, seulement: ["m390"], zooms: [{ nom: "commandes", titre: "Commandes", sel: "#callOverlay .call-controls", marge: 14 }] });
        }
      },
    },
  ],
};
