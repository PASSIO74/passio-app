// ═══════════════════════════════════════════════════════════════════════════
// RENCONTRES IRL — DÉCOUVRIR (liste, carte, filtre) — scénarios de capture
// Surfaces IRL-001… · constats IRL-C01… (donnees/domaines/irl-decouvrir.json)
//
// Modes : `demo` (socle d'exemples), `compte` (faux serveur, jeu
// outils/jeu/irl-decouvrir.js), `visiteur`. En mode compte, le banc pose
// `passio_first_run_experience_v1 = "0"` (lot « première visite » coupé) : on le
// REPOSE à "1" par `stockage` pour retrouver l'état de production (les activités
// d'exemple y sont étiquetées pour tout le monde — first-run.js:2470-2511).
// Les maquettes « après » sont des feuilles de style ou de petits scripts
// appliqués par le banc : rien n'est modifié dans l'application.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const jeu = require("../jeu/irl-decouvrir");

const PROD_LIKE = { passio_first_run_experience_v1: "1" };
const compte = (volume, extra) => Object.assign({ mode: "compte", stockage: PROD_LIKE, peupler: (srv, ctx) => jeu.peupler(srv, ctx, { volume }) }, extra || {});
const carte = (id) => '#eventList .event-card[data-evid="' + id + '"]';

async function ouvrirRencontrer(page, ms) {
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(ms || 4500);
  await page.waitForSelector("#eventList .event-card[data-v4a2], #eventList .empty", { timeout: 20000 });
}
// Amène une carte d'activité sous l'en-tête (la zone qui défile est #appMain).
async function montrer(page, sel, decalage) {
  await page.waitForSelector(sel, { state: "attached", timeout: 15000 });
  await page.evaluate(([s, d]) => {
    const c = document.querySelector(s); const m = document.getElementById("appMain");
    m.scrollTo(0, m.scrollTop + c.getBoundingClientRect().top - (d == null ? 90 : d));
  }, [sel, decalage]);
  await page.waitForTimeout(500);
}
async function ongletFiltre(page) {
  await page.locator("#v4a3Vue button", { hasText: "Filtre" }).first().click();
  await page.waitForTimeout(1200);
}
async function choisirFiltre(page, texte) {
  await page.locator("#v4a5Panneau button", { hasText: texte }).first().click();
  await page.waitForTimeout(600);
}

// ⚠️ Artefact du banc : `page.screenshot({ animations: "disabled" })` amène les
// animations finies à leur ÉTAT FINAL — pour un toast, la fin de `toastOut`
// (opacité 0) : il serait présent dans le DOM et invisible sur la capture. On
// fige donc l'animation du toast à son état visible, comme l'œil le voit pendant
// ses 2,6 s d'affichage. Le contenu, la place et le style ne sont pas touchés.
const NOTE_TOAST = "Animation du toast neutralisée par le scénario (le banc fige les animations à leur état final, opacité 0) : le toast est montré tel qu'il s'affiche pendant 2,6 s.";
async function figerToasts(page) { await page.addStyleTag({ content: ".toast{animation:none !important;opacity:1 !important;}" }); }

// Maquette : un exemple n'offre plus de bouton d'inscription, il DIT son état
// avec le composant d'état existant (`.v4a2-etat`, celui de « Annulé » et de
// « Tu organises »), et « Détails » devient la seule action.
const MAQUETTE_EXEMPLE = async (page) => page.evaluate(() => {
  document.querySelectorAll("#eventList .event-card[data-v4a2]").forEach((c) => {
    const m = c.querySelector(".v4a2-monde");
    if (!m || !/participation désactivée/.test(m.textContent)) return;
    const go = c.querySelector(".v4a2-go");
    if (go) { const s = document.createElement("span"); s.className = "v4a2-etat"; s.textContent = "Exemple"; go.replaceWith(s); }
    m.textContent = "Activité d'exemple · pas d'inscription";
  });
});
// Maquette : sans position connue ni ville choisie, aucune distance n'est
// affichée (la ville suffit) — la distance revient dès qu'une référence existe.
const MAQUETTE_SANS_DISTANCE = async (page) => page.evaluate(() => {
  document.querySelectorAll("#eventList .v4a2-ou").forEach((o) => { o.textContent = o.textContent.replace(/ · environ [0-9,]+ (km|m)$/, ""); });
});

module.exports = {
  domaine: "irl-decouvrir",
  scenarios: [
    // ── 1. Liste d'exemples (démo) ─────────────────────────────────────────
    {
      nom: "demo-liste",
      demarrage: { mode: "demo" },
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre, vue }) {
        await ouvrirRencontrer(page, 2500);
        await prendre({
          id: "IRL-001", titre: "Rencontrer — vue Liste, haut d'écran (activités d'exemple)",
          annotationsAvant: [
            { n: 1, sel: "#v4a0Head", texte: "Titre et recherche" },
            { n: 2, sel: "#v4a3Vue", texte: "Commutateur Liste · Carte · Filtre" },
            { n: 3, sel: "#eventList .event-card:first-child .v4a2-go", texte: "« Je viens » plein, sur un exemple" },
          ],
        });
        await prendre({
          id: "IRL-002", titre: "Carte d'activité d'exemple — « participation désactivée » mais « Je viens » actif",
          seulement: ["m390", "m360"],
          zooms: [{ nom: "carte", titre: "Carte d'exemple", sel: "#eventList .event-card:nth-child(2)", marge: 6 }],
          annotationsAvant: [
            { n: 1, sel: "#eventList .event-card:nth-child(2) .v4a2-monde", texte: "« participation désactivée »" },
            { n: 2, sel: "#eventList .event-card:nth-child(2) .v4a2-go", texte: "… et pourtant un bouton corail plein, actif" },
          ],
          apres: { js: MAQUETTE_EXEMPLE },
          annotations: [
            { n: 1, sel: "#eventList .event-card:nth-child(2) .v4a2-monde", texte: "L'état est dit en clair" },
            { n: 2, sel: "#eventList .event-card:nth-child(2) .v4a2-etat", texte: "Pastille d'état (composant « Annulé » / « Tu organises »)" },
          ],
        });
        // Le geste : toucher « Je viens » sur un exemple.
        if (vue === "m390") {
          await figerToasts(page);
          await page.locator("#eventList .event-card:nth-child(2) .v4a2-go").click();
          await page.waitForTimeout(450);
          await prendre({
            id: "IRL-003", titre: "Après « Je viens » sur un exemple : refus annoncé par un toast",
            note: NOTE_TOAST,
            seulement: ["m390"], attendre: 50,
            zooms: [{ nom: "toast", titre: "Toast de refus", sel: "#toastStack .toast", marge: 8 }],
            annotationsAvant: [{ n: 1, sel: "#toastStack .toast", texte: "Le refus n'arrive qu'APRÈS le geste" }],
          });
          await page.waitForTimeout(3200);
        }
        await page.evaluate(() => document.getElementById("appMain").scrollTo(0, 999999));
        await page.waitForTimeout(600);
        await prendre({
          id: "IRL-004", titre: "Fin de la première page — « Afficher plus (N restants) »",
          seulement: ["m390"],
          zooms: [{ nom: "plus", titre: "Bouton Afficher plus", sel: "#eventList > button.btn", marge: 8 }],
        });
      },
    },
    // ── 2. Liste d'un compte connecté, position non donnée ─────────────────
    {
      nom: "compte-liste",
      demarrage: compte("normal"),
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await ouvrirRencontrer(page, 6000);
        await prendre({
          id: "IRL-010", titre: "Rencontrer — compte connecté : vraies activités et exemples mêlés, distance sans position",
          note: "Aucune position accordée (la demande reste sans réponse dans le banc, comme une invite ignorée).",
          annotationsAvant: [
            { n: 1, sel: carte("ev_ird_09") + " .v4a2-ou", texte: "« environ 391 km » : distance depuis Paris, position inconnue" },
            { n: 2, sel: carte("ev_ird_09") + " .v4a2-visuel", texte: "Pastille 📍 au lieu de l'emoji de la passion" },
            { n: 3, sel: carte("ev_ird_09") + " .event-social-proof", texte: "Preuve sociale (personnes suivies)" },
          ],
          apres: { js: MAQUETTE_SANS_DISTANCE },
          annotations: [{ n: 1, sel: carte("ev_ird_09") + " .v4a2-ou", texte: "Ville seule tant qu'aucune référence n'existe" }],
        });
        await montrer(page, carte("ev_ird_07"));
        await prendre({
          id: "IRL-011", titre: "Activité au centre de Paris — « environ 0 m » sans aucune position",
          seulement: ["m390"],
          zooms: [{ nom: "carte", titre: "Carte « Paris · environ 0 m »", sel: carte("ev_ird_07"), marge: 6 }],
          annotationsAvant: [{ n: 1, sel: carte("ev_ird_07") + " .v4a2-ou", texte: "« environ 0 m » : le repli Paris pris pour la position" }],
          apres: { js: async (page) => { await montrer(page, carte("ev_ird_07")); await MAQUETTE_SANS_DISTANCE(page); } },
          annotations: [{ n: 1, sel: carte("ev_ird_07") + " .v4a2-ou", texte: "Ville seule" }],
        });
        await montrer(page, carte("ev_ird_06"));
        await prendre({
          id: "IRL-012", titre: "Carte « Inscrit ✓ » (je participe)",
          seulement: ["m390"],
          zooms: [{ nom: "carte", titre: "Carte inscrite", sel: carte("ev_ird_06"), marge: 6 }],
        });
        await montrer(page, carte("ev_ird_02"));
        await prendre({
          id: "IRL-013", titre: "Carte complète avec file d'attente et titre très long",
          seulement: ["m390", "m360"],
          zooms: [{ nom: "carte", titre: "Carte complète", sel: carte("ev_ird_02"), marge: 6 }],
        });
        await montrer(page, carte("ev_ird_04"));
        await prendre({
          id: "IRL-014", titre: "Carte d'une activité payante (15 €) — le prix n'apparaît pas",
          seulement: ["m390"],
          zooms: [{ nom: "carte", titre: "Carte payante", sel: carte("ev_ird_04"), marge: 6 }],
          annotationsAvant: [{ n: 1, sel: carte("ev_ird_04") + " .v4a2-monde", texte: "Aucun prix sur la carte" }],
          apres: { js: async (page) => { await montrer(page, carte("ev_ird_04")); await page.evaluate((s) => { const m = document.querySelector(s + " .v4a2-monde"); m.textContent = m.textContent + " · 15 €"; }, carte("ev_ird_04")); } },
          annotations: [{ n: 1, sel: carte("ev_ird_04") + " .v4a2-monde", texte: "Le prix rejoint la ligne des places" }],
        });
        await montrer(page, carte("ev_ird_05"));
        await prendre({
          id: "IRL-015", titre: "Carte d'une activité que j'organise — « Tu organises »",
          seulement: ["m390"],
          zooms: [{ nom: "carte", titre: "Ma carte", sel: carte("ev_ird_05"), marge: 6 }],
        });
        await montrer(page, carte("ev_ird_03"));
        await prendre({
          id: "IRL-016", titre: "Carte d'une activité annulée",
          seulement: ["m390"],
          zooms: [{ nom: "carte", titre: "Carte annulée", sel: carte("ev_ird_03"), marge: 6 }],
        });
        await montrer(page, carte("ev_ird_10"));
        await prendre({
          id: "IRL-017", titre: "Carte sans coordonnées ni couverture (Annecy, dans 20 jours)",
          seulement: ["m390"],
          zooms: [{ nom: "carte", titre: "Carte sans coordonnées", sel: carte("ev_ird_10"), marge: 6 }],
        });
      },
    },
  ],
};
