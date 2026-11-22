// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE ET DÉCOUVERTE — écran « Rechercher » (loupe), résultats, fiche d'une
// passion, créateurs à suivre, états visiteur / hors ligne, porte depuis le fil.
// Données : outils/jeu/recherche.js (référentiel serveur semé, Tom bloqué, une
// activité « Musique » à venir, option : publication sur une passion inconnue).
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const jeu = require("../jeu/recherche");
const banc = require("../banc");

const COMPTE = (opts) => ({ mode: "compte", etat: jeu.etat(banc.onboardedState), peupler: (srv, ctx) => jeu.peupler(srv, ctx, opts) });
const OK = "#exPanel_search .explorer-hero button";
const RES = "#exploreSearchResults";

async function ouvrirRecherche(page) {
  await page.locator(".topbar-right > *").first().click();          // la loupe, un vrai geste
  await page.waitForTimeout(1800);
}
async function chercher(page, texte, att) {
  const i = page.locator("#explorerSearch");
  await i.click();
  await i.fill(texte);
  await i.dispatchEvent("input");
  await page.waitForTimeout(att == null ? 1500 : att);
}
// Toasts figés : les captures coupent les animations, et celle du toast finit sur opacity 0.
async function figerToasts(page) { await page.addStyleTag({ content: "#toastStack .toast{animation:none !important;opacity:1 !important;transform:none !important;}" }); }
async function defilerVers(page, sel, decalage) {
  await page.evaluate(([s, d]) => { const m = document.getElementById("appMain"); const e = document.querySelector(s); m.scrollTop = e.getBoundingClientRect().top + m.scrollTop - m.getBoundingClientRect().top - (d || 12); }, [sel, decalage]);
  await page.waitForTimeout(400);
}

// ── Maquettes partagées ────────────────────────────────────────────────────
// Champ : bouton « OK » à 44 px, croix d'effacement, accroche sans jargon.
const CSS_CHAMP = `${OK}{min-height:44px !important;min-width:52px !important;font-size:14px !important;border-radius:12px !important;}
#exPanel_search .explorer-hero > div > div:first-child{padding:4px 4px 4px 14px !important;}`;
async function jsChamp(page) {
  await page.evaluate(() => {
    const p = document.querySelector("#exPanel_search .explorer-hero p");
    if (p) p.textContent = "Cherche une passion ou une personne.";
    const i = document.getElementById("explorerSearch");
    i.setAttribute("aria-label", "Chercher une passion ou une personne");
    if (i.value && !document.getElementById("maqEffacer")) {
      const b = document.createElement("button");
      b.id = "maqEffacer"; b.type = "button"; b.setAttribute("aria-label", "Effacer la recherche"); b.textContent = "×";
      b.style.cssText = "width:44px;height:44px;border:none;background:transparent;color:var(--muted);font-size:22px;line-height:1;flex-shrink:0;cursor:pointer;";
      i.after(b);
    }
  });
}
// Résultats : 3 passions puis « Voir plus », en-tête « Personnes », panneau jusqu'au bas de l'écran.
async function jsResultats(page) {
  await jsChamp(page);
  await page.evaluate(() => {
    const r = document.getElementById("exploreSearchResults");
    const enfants = Array.from(r.children);
    let n = 0, dernier = null, cache = 0;
    let section = "";
    enfants.forEach((c) => {
      if (!c.getAttribute("onclick")) { section = c.textContent.trim().toLowerCase(); if (/utilisateurs/i.test(c.textContent)) c.textContent = "Personnes"; return; }
      if (section === "passions") { n++; if (n > 3) { c.style.display = "none"; cache++; } else dernier = c; }
    });
    if (cache && dernier) {
      const plus = document.createElement("div");
      plus.id = "maqPlus";
      plus.textContent = "Voir " + cache + " autres passions";
      plus.style.cssText = "padding:12px 14px;min-height:44px;box-sizing:border-box;font-size:13px;font-weight:700;color:var(--accent);border-bottom:1px solid var(--border);";
      dernier.after(plus);
    }
    const b = r.getBoundingClientRect();
    r.style.maxHeight = Math.max(240, window.innerHeight - b.top - 96) + "px";
  });
}

module.exports = {
  domaine: "recherche",
  scenarios: [
    // ── 1. L'écran, au repos ───────────────────────────────────────────────
    {
      nom: "ecran",
      demarrage: COMPTE(),
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre, vue }) {
        await ouvrirRecherche(page);
        await prendre({
          id: "REC-001",
          titre: "Rechercher — haut de l'écran (champ, « Passions tendance »)",
          zooms: [{ nom: "champ", titre: "Champ et bouton « OK »", sel: "#exPanel_search .explorer-hero", marge: 4 }],
          annotationsAvant: [
            { n: 1, sel: OK, texte: "« OK » : 40,9 × 28 px ; le champ est un type=text sans étiquette ni croix d'effacement." },
            { n: 2, sel: "#exPanel_search .explorer-hero p", texte: "« tout le référentiel des passions » : un mot d'équipe, pas d'utilisateur." },
            { n: 3, sel: "#trendingGrid .trending-tile:last-child", texte: "Tuile sans publication, posée là par ordre alphabétique sous l'étiquette « Hot »." },
          ],
          apres: {
            css: CSS_CHAMP + `#trendingGrid .trending-tile:not(:has(.trending-stat)){display:none !important;}
.section-title .tag-hot{display:none !important;}`,
            js: async (p) => { await jsChamp(p); await p.evaluate(() => { const t = Array.from(document.querySelectorAll("#exploreNormalContent .section-title")).find((e) => /tendance/i.test(e.textContent)); if (t) t.firstChild.textContent = "En ce moment "; }); },
            zooms: [{ nom: "champ", titre: "Champ et bouton « OK »", sel: "#exPanel_search .explorer-hero", marge: 4 }],
          },
          annotations: [
            { n: 1, sel: OK, texte: "« OK » porté à 44 px de haut ; le champ reçoit un nom accessible." },
            { n: 2, sel: "#exPanel_search .explorer-hero p", texte: "Accroche en mots simples : une passion ou une personne." },
            { n: 3, sel: "#exploreNormalContent .section-title", texte: "Seules les passions qui ont des publications ; le titre dit ce qu'on mesure, sans « Hot »." },
          ],
        });
        await defilerVers(page, "#allPassions", 70);
        await prendre({
          id: "REC-002",
          titre: "Rechercher — « Toutes les passions » (aperçu et compteur)",
          seulement: ["m390", "m360", "t768"],
          annotationsAvant: [
            { n: 1, sel: "#explorePassionsCount", texte: "Le nombre vient du référentiel (5 001) et n'apparaît qu'une fois celui-ci chargé." },
          ],
        });
        // Repeint après chargement des suivis (voir REC-027 pour l'écran ouvert trop tôt).
        await page.evaluate(() => goTo("feed")); await page.waitForTimeout(500);
        await page.evaluate(() => goTo("explore")); await page.waitForTimeout(1500);
        await defilerVers(page, "#suggestedCreators", 60);
        await prendre({
          id: "REC-003",
          titre: "Rechercher — « Créateurs à suivre »",
          seulement: ["m390", "m360", "d1440"],
          zooms: [{ nom: "ligne", titre: "Une ligne et son bouton", sel: "#suggestedCreators .list-row:nth-child(3)", marge: 4 }],
          annotationsAvant: [
            { n: 1, sel: "#suggestedCreators .list-row:nth-child(1) button", texte: "Des personnes déjà suivies (« ✓ Suivi ») occupent la liste des suggestions." },
            { n: 2, sel: "#suggestedCreators .list-row:nth-child(4)", texte: "Tom Girard, que ce compte a BLOQUÉ, est proposé." },
            { n: 3, sel: "#suggestedCreators .list-row:nth-child(7)", texte: "Personnages d'exemple, sans marque, avec un « Suivre » qui écrit un vrai suivi." },
          ],
          apres: {
            css: `#suggestedCreators .list-row .btn.small{min-height:44px !important;min-width:88px !important;}`,
            js: async (p) => {
              await p.evaluate(() => {
                const exclus = new Set([].concat(state.user.following || [], state.user.followingPending || [], state.user.blocked || []));
                document.querySelectorAll("#suggestedCreators .list-row").forEach((r) => {
                  const b = r.querySelector("[data-follow-uid]"); const uid = b && b.getAttribute("data-follow-uid");
                  if (exclus.has(uid)) r.style.display = "none";
                  else if (/^u_/.test(uid)) {
                    const t = r.querySelector(".list-row-title");
                    if (t && !t.querySelector(".maq-ex")) { const s = document.createElement("span"); s.className = "maq-ex"; s.textContent = "Exemple"; s.style.cssText = "margin-left:6px;font-size:11px;font-weight:700;color:var(--muted);background:var(--accent-tile);border-radius:8px;padding:1px 6px;vertical-align:1px;"; t.appendChild(s); }
                    b.style.display = "none";
                  }
                });
                const m = document.getElementById("appMain"); const e = document.getElementById("suggestedCreators");
                m.scrollTop = e.getBoundingClientRect().top + m.scrollTop - m.getBoundingClientRect().top - 60;
              });
            },
            zooms: [{ nom: "ligne", titre: "Une ligne d'exemple", sel: "#suggestedCreators .list-row:has(.maq-ex)", marge: 4 }],
          },
          annotations: [
            { n: 1, sel: "#suggestedCreators .list-row:not([style*='none'])", texte: "Ni personnes déjà suivies, ni demandes en attente, ni comptes bloqués : seulement des suggestions." },
            { n: 3, sel: "#suggestedCreators .maq-ex", texte: "Un exemple se dit « Exemple » et ne se suit pas ; boutons à 44 px." },
          ],
        });
      },
    },

    // ── 2. La saisie et les résultats ──────────────────────────────────────
    {
      nom: "saisie",
      demarrage: COMPTE(),
      vues: ["m390", "m360"],
      async derouler({ page, prendre, banc: b }) {
        await ouvrirRecherche(page);
        await page.locator("#explorerSearch").click();
        const rendre = await b.simulerClavier(page, 300);
        await prendre({
          id: "REC-004",
          titre: "Champ focalisé, clavier ouvert (simulé), rien de tapé",
          annotationsAvant: [
            { n: 1, sel: "#explorerSearch", texte: "Aucune suggestion au focus : ni recherches récentes, ni passions à toucher." },
          ],
        });
        await rendre();
        await page.locator("#explorerSearch").pressSequentially("gui", { delay: 30 });
        await page.waitForTimeout(40);
        await prendre({ id: "REC-005", titre: "Pendant la recherche : « Recherche… »", attendre: 0, seulement: ["m390"], mesurer: false });
        await page.waitForTimeout(1500);
        await prendre({
          id: "REC-006",
          titre: "Résultats « gui » : passions puis personnes",
          zooms: [{ nom: "panneau", titre: "Panneau des résultats", sel: RES, marge: 2 }],
          annotationsAvant: [
            { n: 1, sel: RES + " > div:nth-child(2)", texte: "Six passions d'abord : les personnes sont sous le pli d'un panneau de 360 px qui défile à part." },
            { n: 2, sel: RES + " > div:nth-child(1)", texte: "« Utilisateurs » ici, « personnes » ou « membres » ailleurs." },
          ],
          apres: {
            js: jsResultats,
            zooms: [{ nom: "panneau", titre: "Panneau des résultats", sel: RES, marge: 2 }],
          },
          annotations: [
            { n: 1, sel: "#maqPlus", texte: "Trois passions, puis « Voir 3 autres passions » : les personnes remontent sous le doigt." },
            { n: 2, sel: "#maqEffacer", texte: "Une croix efface la recherche et ferme le panneau." },
          ],
        });
        await chercher(page, "tom");
        await prendre({
          id: "REC-007",
          titre: "Résultats « tom » : une personne bloquée, une bio qui contient « tom »",
          annotationsAvant: [
            { n: 1, sel: RES + " > div:nth-child(4)", texte: "Tom Girard est bloqué par ce compte : il est proposé comme n'importe qui." },
            { n: 2, sel: RES + " > div:nth-child(6)", texte: "Victor Aubry sort parce que sa bio contient « au-TOM-obile »." },
          ],
          apres: {
            js: async (p) => {
              await jsChamp(p);
              await p.evaluate(() => {
                const r = document.getElementById("exploreSearchResults");
                Array.from(r.children).forEach((c) => { if (/Tom Girard|Victor Aubry/.test(c.textContent)) c.style.display = "none"; if (/^Utilisateurs$/i.test(c.textContent.trim())) c.textContent = "Personnes"; });
              });
            },
          },
          annotations: [
            { n: 1, sel: RES + " > div:nth-child(5)", texte: "Les comptes bloqués sont retirés ; la bio ne compte qu'en début de mot." },
          ],
        });
        await chercher(page, "zzqxw");
        await prendre({
          id: "REC-008",
          titre: "Aucun résultat",
          annotationsAvant: [{ n: 1, sel: RES, texte: "« Aucun résultat » et rien d'autre : ni conseil, ni passion à toucher, ni moyen d'effacer." }],
          apres: {
            js: async (p) => {
              await jsChamp(p);
              await p.evaluate(() => {
                const r = document.getElementById("exploreSearchResults");
                r.innerHTML = "<div style='padding:14px 16px 6px;color:var(--text);font-size:14px;font-weight:700;'>Rien pour « zzqxw »</div>"
                  + "<div style='padding:0 16px 10px;color:var(--muted);font-size:13px;line-height:1.5;'>Vérifie l'orthographe ou essaie un mot plus court. Ou pars d'une passion :</div>"
                  + "<div id='maqPistes' style='display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 14px;'>"
                  + ["🎸 Musique", "🏋️ Escalade", "📷 Photo"].map((x) => "<span class='pill' style='min-height:44px;display:inline-flex;align-items:center;'>" + x + "</span>").join("") + "</div>";
              });
            },
          },
          annotations: [{ n: 1, sel: "#maqPistes", texte: "Un conseil, et des passions qui ont des publications (les mêmes que « Ce qui se publie »)." }],
        });
        await chercher(page, "je cherche des gens pour faire de la guitare électrique le dimanche après-midi à Lyon");
        await prendre({ id: "REC-009", titre: "Requête longue, en phrase", seulement: ["m390"], annotationsAvant: [{ n: 1, sel: RES, texte: "Une phrase naturelle ne trouve rien, alors que « guitare électrique » existe." }] });
        await chercher(page, "escalde");
        await prendre({ id: "REC-010", titre: "Faute de frappe « escalde »", seulement: ["m390"], annotationsAvant: [{ n: 1, sel: RES, texte: "Aucune tolérance locale aux fautes ; le repli serveur (flou) n'existe pas sur le banc." }] });
        await chercher(page, "theatre");
        await prendre({ id: "REC-011", titre: "Sans accent : « theatre »", seulement: ["m390"], annotationsAvant: [{ n: 1, sel: RES + " > div:nth-child(2)", texte: "Accents repliés : « theatre » trouve « Théâtre »." }] });
        // Le panneau survit à la navigation : on part au fil, on revient.
        await chercher(page, "escalade");
        await page.evaluate(() => goTo("feed")); await page.waitForTimeout(700);
        await ouvrirRecherche(page);
        await prendre({
          id: "REC-012",
          titre: "Retour sur l'écran : la recherche précédente est restée ouverte",
          seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: RES, texte: "Ni Échap, ni un toucher à côté, ni la navigation ne ferment le panneau : seul vider le champ le fait." }],
          apres: { js: jsChamp },
          annotations: [{ n: 1, sel: "#maqEffacer", texte: "Une croix d'effacement de 44 px, à l'endroit où le pouce l'attend." }],
        });
      },
    },

    // ── 3. La fiche d'une passion ─────────────────────────────────────────
    {
      nom: "fiche",
      demarrage: COMPTE(),
      vues: ["m390", "m360"],
      async derouler({ page, prendre }) {
        await ouvrirRecherche(page);
        await page.locator("#trendingGrid .trending-tile").first().click();
        await page.waitForTimeout(1800);
        await prendre({
          id: "REC-013",
          titre: "Fiche « Musique » (une de mes passions), haut",
          annotationsAvant: [
            { n: 1, sel: "#modalContent .modal-title", texte: "« 42 posts » ici, « 4 posts » sur la tuile qu'on vient de toucher : la fiche compte les exemples." },
            { n: 2, sel: "#pexCreators .list-row:nth-child(3)", texte: "Personnages d'exemple mêlés aux vrais comptes, sans marque." },
            { n: 3, sel: "#pexCreators", texte: "Aucune activité « Musique » alors qu'une jam a lieu dans trois jours : rien ne mène à Rencontrer." },
          ],
          apres: {
            css: `#pexCreators .btn.small{min-height:44px !important;min-width:88px !important;}`,
            js: async (p) => {
              await p.evaluate(() => {
                const m = document.querySelector("#modalContent");
                const cpt = m.querySelector(".modal-title").nextElementSibling; if (cpt) cpt.textContent = "4 publications";
                m.querySelectorAll("#pexCreators [data-follow-uid]").forEach((b) => {
                  if (!/^u_/.test(b.getAttribute("data-follow-uid"))) return;
                  const t = b.closest(".list-row").querySelector(".list-row-title");
                  const s = document.createElement("span"); s.textContent = "Exemple"; s.style.cssText = "margin-left:6px;font-size:11px;font-weight:700;color:var(--muted);background:var(--accent-tile);border-radius:8px;padding:1px 6px;"; t.appendChild(s);
                  b.style.display = "none";
                });
                const titre = Array.from(m.querySelectorAll(".section-title")).find((e) => e.textContent.trim() === "Créateurs");
                const bloc = document.createElement("div"); bloc.id = "maqActivites";
                bloc.style.cssText = "margin:0 0 14px;";
                bloc.innerHTML = "<button class='btn' style='width:100%;min-height:48px;background:var(--v2-coral);border-color:var(--v2-coral);color:#fff;font-weight:800;border-radius:14px;'>Voir les activités Musique · 1 à venir</button>";
                titre.before(bloc);
              });
            },
          },
          annotations: [
            { n: 1, sel: "#modalContent .modal-title", texte: "Un seul compte, le même que la tuile : les vraies publications." },
            { n: 3, sel: "#maqActivites", texte: "La porte vers Rencontrer, déjà filtrée sur la passion (moteur existant « Voir les activités »), en corail : c'est l'IRL." },
            { n: 2, sel: "#pexCreators .list-row:nth-child(3)", texte: "Un exemple est marqué et ne se suit pas." },
          ],
        });
        await page.evaluate(() => { const m = document.querySelector("#modalContent"); m.scrollTop = m.scrollHeight; });
        await page.waitForTimeout(500);
        await prendre({
          id: "REC-014",
          titre: "Fiche « Musique », bas : six publications, puis « Signaler cette passion »",
          seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: ".passion-explorer-signaler", texte: "Signaler est en bas et discret : juste. Mais la liste s'arrête à 6 publications sur « 42 », sans suite." }],
        });
        await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
        await chercher(page, "escalade");
        await page.locator(RES + " >> text=Escalade").first().click();
        await page.waitForTimeout(1800);
        await prendre({
          id: "REC-015",
          titre: "Fiche « Escalade » (pas encore à moi) : « + Créer profil », passions proches",
          zooms: [{ nom: "entete", titre: "En-tête et bouton d'ajout", sel: "#modalContent > div:nth-of-type(2)", marge: 2 }],
          annotationsAvant: [
            { n: 1, sel: "#modalContent .btn.primary", texte: "« + Créer profil » (90 × 29 px) ajoute en fait une PASSION au profil unique." },
            { n: 2, sel: "#pexLiees .pill", texte: "Passions proches : 29 px de haut." },
          ],
          apres: {
            css: `#modalContent .btn.small{min-height:44px !important;} #pexLiees .pill{min-height:44px !important;display:inline-flex !important;align-items:center !important;}`,
            js: async (p) => { await p.evaluate(() => { const b = document.querySelector("#modalContent .btn.primary"); if (b) b.textContent = "＋ Ajouter à mes passions"; }); },
            zooms: [{ nom: "entete", titre: "En-tête et bouton d'ajout", sel: "#modalContent > div:nth-of-type(2)", marge: 2 }],
          },
          annotations: [
            { n: 1, sel: "#modalContent .btn.primary", texte: "Le mot de « Mes passions » : « Ajouter à mes passions », 44 px." },
            { n: 2, sel: "#pexLiees .pill", texte: "Pastilles à 44 px." },
          ],
        });
        await figerToasts(page);
        await page.locator("#modalContent .btn.primary").first().click();
        await page.waitForTimeout(700);
        await prendre({ id: "REC-016", titre: "Après « + Créer profil » : bascule sur l'écran Profil", seulement: ["m390"], attendre: 0, annotationsAvant: [{ n: 1, sel: ".screen.active", texte: "On quitte la recherche pour le Profil ; le toast « ✨ Escalade ajoutée à tes passions » confirme." }] });
        await page.evaluate(() => goTo("explore")); await page.waitForTimeout(1200);
        await page.evaluate(() => openPassionExplorer("art-ceramique")); await page.waitForTimeout(1500);
        await prendre({
          id: "REC-017",
          titre: "Fiche d'une passion sans aucun contenu (« Céramique »)",
          annotationsAvant: [{ n: 1, sel: "#modalContent .empty", texte: "Deux états vides qui ne proposent rien : ni publier sur cette passion, ni passer à une passion proche." }],
          apres: {
            js: async (p) => {
              await p.evaluate(() => {
                const e = document.querySelectorAll("#modalContent .empty"); const dernier = e[e.length - 1];
                if (dernier) dernier.insertAdjacentHTML("beforeend", "<button id='maqPublier' class='btn primary' style='margin-top:12px;min-height:44px;'>Publier sur Céramique</button>");
              });
            },
          },
          annotations: [{ n: 1, sel: "#maqPublier", texte: "L'état vide propose le geste qui le remplit (Studio, passion pré-choisie)." }],
        });
      },
    },

    // ── 4. Suivre un personnage d'exemple ─────────────────────────────────
    {
      nom: "suivre-exemple",
      demarrage: COMPTE(),
      vues: ["m390"],
      async derouler({ page, prendre, serveur }) {
        await ouvrirRecherche(page);
        await page.evaluate(() => goTo("feed")); await page.waitForTimeout(500);
        await page.evaluate(() => goTo("explore")); await page.waitForTimeout(1500);
        await page.locator("#suggestedCreators .list-row:has-text('Karim Belkacem')").first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await figerToasts(page);
        await page.locator("#suggestedCreators .list-row:has-text('Karim Belkacem') button").first().click();
        await page.waitForTimeout(500);
        const derniere = serveur.t.follows.slice(-1)[0];
        await prendre({
          id: "REC-018",
          titre: "« Suivre » un personnage d'exemple depuis « Créateurs à suivre »",
          attendre: 0,
          note: "Ligne écrite sur le faux serveur : " + JSON.stringify({ follower_id: derniere.follower_id.slice(0, 8) + "…", following_id: derniere.following_id }),
          annotationsAvant: [{ n: 1, sel: "#suggestedCreators .list-row:has-text('Karim Belkacem') button", texte: "« ✓ Suivi » et « Tu suis Karim Belkacem ! » : une ligne follows vers « u_karim », un personnage qui n'existe pas." }],
        });
      },
    },

    // ── 4 bis. Écran ouvert tôt : boutons de suivi périmés ──────────────────
    {
      nom: "suivi-perime",
      demarrage: COMPTE(),
      vues: ["m390"],
      async derouler({ page, prendre, serveur }) {
        await page.locator(".topbar-right > *").first().click();   // aussitôt après l'ouverture de l'app
        await page.waitForTimeout(4000);
        await defilerVers(page, "#suggestedCreators", 60);
        const etat = await page.evaluate(() => ({ suivis: (state.user.following || []).length, attente: (state.user.followingPending || []).length }));
        await prendre({
          id: "REC-027",
          titre: "« Créateurs à suivre » ouvert dès le démarrage : « Suivre » sur des personnes déjà suivies",
          note: "4 s après l'ouverture de l'écran, l'état local connaît " + etat.suivis + " suivis et " + etat.attente + " demande(s) en attente ; les boutons, peints avant leur arrivée, ne sont jamais repeints.",
          annotationsAvant: [
            { n: 1, sel: "#suggestedCreators .list-row:nth-child(1) button", texte: "Léa est suivie : le bouton dit « Suivre »." },
            { n: 2, sel: "#suggestedCreators .list-row:nth-child(5) button", texte: "Demande en attente vers Sacha : le bouton dit aussi « Suivre »." },
          ],
        });
        const avant = serveur.t.follows.filter((f) => f.follower_id === banc.MOI.id && f.following_id === banc.GENS.lea.id).length;
        await figerToasts(page);
        await page.locator("#suggestedCreators .list-row:nth-child(1) button").click();
        await page.waitForTimeout(600);
        const apres = serveur.t.follows.filter((f) => f.follower_id === banc.MOI.id && f.following_id === banc.GENS.lea.id).length;
        const toasts = await page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
        await prendre({
          id: "REC-028",
          titre: "Appui sur ce « Suivre » : désabonnement",
          attendre: 0,
          note: "Ligne follows MOI → Léa : " + avant + " avant, " + apres + " après l'appui. Toasts : " + JSON.stringify(toasts),
          annotationsAvant: [{ n: 1, sel: "#suggestedCreators .list-row:nth-child(1) button", texte: "Le geste « Suivre » a supprimé l'abonnement existant." }],
          apres: {
            js: async (p) => { await p.evaluate(() => { document.querySelectorAll("#suggestedCreators [data-follow-uid]").forEach((b) => { const u = b.getAttribute("data-follow-uid"); b.textContent = libelleBoutonSuivi(u); }); }); },
          },
          annotations: [{ n: 1, sel: "#suggestedCreators .list-row:nth-child(1) button", texte: "Repeints quand les suivis arrivent (même moteur libelleBoutonSuivi) : le libellé dit ce que fera l'appui." }],
        });
      },
    },

    // ── 5. Une passion inconnue dans les tendances (explique SOC-003) ───────
    {
      nom: "passion-inconnue",
      demarrage: COMPTE({ passionInconnue: true }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await ouvrirRecherche(page);
        await prendre({
          id: "REC-019",
          titre: "« Passions tendance » : une tuile « ✨ Passion · 1 post » (identifiant inconnu)",
          note: "Simulé : une publication d'Inès porte « perso_tirage_cyanotype », identifiant absent du référentiel et du socle (cas d'une passion personnelle d'une autre personne). Même mécanisme que la tuile de SOC-003, où le jeu de données de l'époque portait « photographie ».",
          annotationsAvant: [{ n: 1, sel: "#trendingGrid .trending-tile:nth-child(4)", texte: "« Passion » : le libellé générique de passionById() quand l'identifiant n'est connu nulle part." }],
          apres: { css: `#trendingGrid .trending-tile:nth-child(4){display:none !important;}` },
          annotations: [{ n: 1, sel: "#trendingGrid", texte: "Une passion qu'on ne sait pas nommer n'entre pas dans le classement." }],
        });
        await page.locator("#trendingGrid .trending-tile:has-text('Passion')").first().click();
        await page.waitForTimeout(1500);
        await prendre({ id: "REC-020", titre: "Fiche ouverte depuis cette tuile : « ✨ Passion »", annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title", texte: "« Passion », « + Créer profil », « Signaler cette passion » : une fiche qui ne dit pas de quoi elle parle." }] });
      },
    },

    // ── 6. Visiteur sans compte ────────────────────────────────────────────
    {
      nom: "visiteur",
      demarrage: { mode: "visiteur" },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.locator(".topbar-right > *").first().click();
        await page.waitForTimeout(2200);
        await prendre({
          id: "REC-021",
          titre: "Visiteur : l'écran Rechercher",
          annotationsAvant: [
            { n: 1, sel: "#trendingGrid", texte: "« Passions tendance · Hot » = les six premières du socle par ordre alphabétique (Actualité, Animaux, Art…)." },
          ],
          apres: {
            css: CSS_CHAMP,
            js: async (p) => {
              await jsChamp(p);
              await p.evaluate(() => { const t = Array.from(document.querySelectorAll("#exploreNormalContent .section-title")).find((e) => /tendance/i.test(e.textContent)); if (t) { t.textContent = "Pour commencer"; } });
            },
          },
          annotations: [{ n: 1, sel: "#exploreNormalContent .section-title", texte: "Sans publication à compter, la section ne prétend pas mesurer une tendance." }],
        });
        await page.evaluate(() => openPassionExplorer("musique-guitare-electrique"));
        await page.waitForTimeout(1500);
        await page.locator("#pexCreators button").first().click();
        await page.waitForTimeout(1200);
        await prendre({ id: "REC-022", titre: "Visiteur : « Suivre » depuis la fiche d'une passion → demande de compte", annotationsAvant: [{ n: 1, sel: "#modalContent", texte: "La fiche est remplacée par la demande de compte : bien expliqué, mais on perd la fiche." }] });
      },
    },

    // ── 7. Hors ligne avant la première ouverture ──────────────────────────
    {
      nom: "hors-ligne",
      demarrage: COMPTE(),
      vues: ["m390", "m360"],
      async derouler({ page, context, prendre }) {
        await context.setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event("offline")));
        await page.evaluate(() => goTo("explore"));
        await page.waitForTimeout(2600);
        await prendre({
          id: "REC-023",
          titre: "Hors ligne : l'écran (référentiel jamais chargé)",
          note: "Simulé : context.setOffline(true) avant la première ouverture de l'écran.",
          annotationsAvant: [{ n: 1, sel: "#allPassions", texte: "Compteur muet et grille réduite au socle de 19 : le choix de se taire est juste." }],
        });
        await chercher(page, "escalade", 2600);
        await prendre({
          id: "REC-024",
          titre: "Hors ligne : chercher « escalade »",
          note: "Simulé : hors ligne.",
          annotationsAvant: [{ n: 1, sel: RES, texte: "« La recherche n'a pas abouti. Réessaie. » : ne dit pas que c'est le réseau, et pousse à réessayer en vain." }],
          apres: {
            js: async (p) => { await p.evaluate(() => { document.getElementById("exploreSearchResults").innerHTML = "<div id='maqHL' style='padding:14px 16px;font-size:13px;line-height:1.5;color:var(--text);'><b>Tu es hors ligne.</b><br><span style='color:var(--muted)'>La recherche reprendra dès que le réseau revient — ta saisie est gardée.</span></div>"; }); },
          },
          annotations: [{ n: 1, sel: "#maqHL", texte: "Le message nomme la cause et ce qui se passera ensuite." }],
        });
      },
    },

    // ── 8. Porte depuis le fil : « Trouver une expérience » → page de la passion ──
    {
      nom: "porte-fil",
      demarrage: COMPTE(),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(1200);
        const cta = page.locator("[data-v3-tempt]").first();
        await cta.scrollIntoViewIfNeeded(); await cta.click();
        await page.waitForTimeout(900);
        await prendre({ id: "REC-025", titre: "Feuille « Trouver une expérience » (porte vers la page de la passion)", annotationsAvant: [{ n: 1, sel: "[data-v3-choice='people']", texte: "« Voir la page de la passion » : la seule porte vers la fiche depuis le fil." }] });
        await page.locator("[data-v3-choice='people']").click();
        await page.waitForTimeout(1600);
        await prendre({ id: "REC-026", titre: "Fiche de la passion ouverte depuis le fil", annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title", texte: "On vient de « Voir les activités » / « Proposer une sortie » : la fiche, elle, n'en parle plus." }] });
      },
    },
  ],
};
