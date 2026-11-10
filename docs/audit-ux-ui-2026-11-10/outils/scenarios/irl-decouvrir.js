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
  // Au-delà des 12 premières, la carte est derrière « Afficher plus » : un vrai toucher par page.
  for (let i = 0; i < 6 && !(await page.$(sel)); i++) {
    const plus = page.locator("#eventList > button.btn", { hasText: "Afficher plus" });
    if (!(await plus.count())) break;
    await plus.first().click();
    await page.waitForTimeout(700);
  }
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
          apres: { js: async (page) => { await MAQUETTE_SANS_DISTANCE(page); await page.evaluate(() => {
            const l = document.getElementById("eventList"); const b = document.createElement("button"); b.type = "button"; b.id = "maqLieu";
            b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg><span>Choisis ta ville pour voir les distances</span>';
            b.style.cssText = "display:flex;align-items:center;gap:8px;width:100%;min-height:44px;margin:0 0 10px;padding:0 14px;border-radius:14px;border:1px solid var(--accent-tile-line,#e2d8ff);background:var(--accent-tile,#f1ecff);color:var(--accent);font-weight:700;font-size:13.5px;";
            l.parentNode.insertBefore(b, l); }); } },
          annotations: [{ n: 1, sel: carte("ev_ird_09") + " .v4a2-ou", texte: "Ville seule tant qu'aucune référence n'existe" }, { n: 2, sel: "#maqLieu", texte: "Une porte visible vers « Où ? » (sélecteur existant)" }],
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
          annotationsAvant: [{ n: 1, sel: carte("ev_ird_03") + " .event-card-banner", texte: "#ef4444 sur rose : 3,23:1" }, { n: 2, sel: carte("ev_ird_03") + " .v4a2-etat-annule", texte: "« Annulé » : 3,76:1" }],
          apres: { css: ".event-card-banner.cancelled{color:#B42318 !important;} :root.passio-ui-4a2 .v4a2-etat-annule{color:#B42318 !important;border-color:rgba(180,35,24,.45) !important;}" },
          annotations: [{ n: 1, sel: carte("ev_ird_03") + " .event-card-banner", texte: "Rouge foncé #B42318 : AA" }, { n: 2, sel: carte("ev_ird_03") + " .v4a2-etat-annule", texte: "AA" }],
        });
        await montrer(page, carte("ev_ird_10"));
        await prendre({
          id: "IRL-017", titre: "Carte sans coordonnées ni couverture (Annecy, dans 20 jours)",
          seulement: ["m390"],
          zooms: [{ nom: "carte", titre: "Carte sans coordonnées", sel: carte("ev_ird_10"), marge: 6 }],
          annotationsAvant: [{ n: 1, sel: carte("ev_ird_10") + " .v4a2-visuel", texte: "Pastille 📍 générique" }],
          apres: { js: async (page) => { await montrer(page, carte("ev_ird_10")); await page.evaluate((s) => { const e = document.querySelector(s + " .v4a2-emoji"); if (e) e.textContent = "🎨"; }, carte("ev_ird_10")); } },
          annotations: [{ n: 1, sel: carte("ev_ird_10") + " .v4a2-visuel", texte: "Emoji de la passion (Art)" }],
        });
      },
    },
    // ── 3. Vue Carte (démo) ────────────────────────────────────────────────
    {
      nom: "demo-carte",
      demarrage: { mode: "demo" },
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre, vue }) {
        await ouvrirRencontrer(page, 2500);
        await page.locator("[data-v4a3-onglet=carte]").click();
        await page.waitForTimeout(6500);
        await prendre({
          id: "IRL-030", titre: "Vue Carte — carte dépliée sous le commutateur, liste dessous",
          attendre: 800,
          zooms: [{ nom: "commandes", titre: "Commandes de la carte", sel: "#irlMapWrap", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: ".maplibregl-ctrl-zoom-in", texte: "Zoom + / − : 29 × 29 px" },
            { n: 2, sel: ".irl-map-collapse", texte: "Replier : 38 × 38 px, sans nom accessible visible" },
            { n: 3, sel: ".irl-map-expand", texte: "Plein écran : 38 × 38 px" },
          ],
          apres: { css: ".maplibregl-ctrl-group button{width:44px !important;height:44px !important;} .irl-map-collapse,.irl-map-expand{width:44px !important;height:44px !important;}" },
          annotations: [{ n: 1, sel: ".maplibregl-ctrl-zoom-in", texte: "Commandes portées à 44 px" }, { n: 2, sel: ".irl-map-collapse", texte: "44 px" }],
        });
        if (vue !== "m390") return;
        // Premier marqueur réellement visible dans le cadre de la carte, touché à ses coordonnées.
        const pt = await page.evaluate(() => {
          const w = document.getElementById("irlMap").getBoundingClientRect();
          const m = [...document.querySelectorAll("#irlMap .passio-marker")].map((e) => e.getBoundingClientRect())
            .find((r) => r.left > w.left + 50 && r.right < w.right - 50 && r.top > w.top + 60 && r.bottom < w.bottom - 20);
          return m ? { x: m.left + m.width / 2, y: m.top + m.height / 2 } : null;
        });
        if (pt) await page.touchscreen.tap(pt.x, pt.y);
        await page.waitForTimeout(900);
        await prendre({
          id: "IRL-031", titre: "Vue Carte — marqueur touché : bulle « Voir l'événement »",
          zooms: [{ nom: "bulle", titre: "Bulle du marqueur", sel: ".maplibregl-popup, .leaflet-popup, .irl-popup-btn", marge: 30 }],
        });
        await page.locator(".irl-map-expand").click();
        await page.waitForTimeout(1500);
        await prendre({ id: "IRL-032", titre: "Vue Carte — plein écran",
          annotationsAvant: [{ n: 1, sel: ".irl-map-expand", texte: "Seule sortie : la même icône, sans libellé" }, { n: 2, sel: ".maplibregl-popup-close-button, .leaflet-popup-close-button", texte: "Fermeture de bulle minuscule" }],
          apres: { css: ".irl-map-wrap.fullscreen .irl-map-expand{display:none !important} .maplibregl-popup-close-button,.leaflet-popup-close-button{width:44px !important;height:44px !important;font-size:22px !important;}", js: async (page) => page.evaluate(() => {
            const w = document.getElementById("irlMapWrap"); const b = document.createElement("button"); b.id = "maqFermerCarte"; b.type = "button"; b.textContent = "✕  Fermer la carte";
            b.style.cssText = "position:absolute;top:12px;right:12px;z-index:9999;min-height:44px;padding:0 16px;border-radius:999px;border:none;background:#fff;color:var(--text);font-weight:800;font-size:14px;box-shadow:0 6px 18px rgba(23,21,43,.18);"; w.appendChild(b); }) },
          annotations: [{ n: 1, sel: "#maqFermerCarte", texte: "Sortie nommée, 44 px" }, { n: 2, sel: ".maplibregl-popup-close-button, .leaflet-popup-close-button", texte: "Croix de bulle 44 px" }] });
      },
    },
    // ── 4. Vue Filtre (compte) ─────────────────────────────────────────────
    {
      nom: "compte-filtre",
      demarrage: compte("normal"),
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre, vue }) {
        await ouvrirRencontrer(page, 6000);
        await ongletFiltre(page);
        await prendre({
          id: "IRL-040", titre: "Vue Filtre — haut (Quand ? · Où ? · Distance)",
          annotationsAvant: [{ n: 1, sel: "#v4a5Panneau button:has-text('Modifier')", texte: "« Aucune position » … alors que les distances partent de Paris" }],
        });
        if (vue === "t768" || vue === "d1440") return;
        await page.evaluate(() => document.getElementById("appMain").scrollTo(0, 99999));
        await page.waitForTimeout(500);
        await prendre({
          id: "IRL-041", titre: "Vue Filtre — bas (Passions · Horaire · Mes événements | Mes rencontres · pied fixe)",
          zooms: [{ nom: "raccourcis", titre: "Mes événements | Mes rencontres", sel: "[data-irlfilter='joined']", marge: 70 }],
        });
        await page.evaluate(() => document.getElementById("appMain").scrollTo(0, 0));
        await choisirFiltre(page, "5 km");
        await prendre({
          id: "IRL-042", titre: "Distance 5 km sans position : 6 résultats autour de Paris, « Aucune position » affiché",
          seulement: ["m390"],
          annotationsAvant: [
            { n: 1, sel: "#v4a5Panneau button:has-text('Modifier')", texte: "« Aucune position »" },
            { n: 2, sel: "#v4a5Panneau button:has-text('5 km')", texte: "5 km… autour de Paris" },
            { n: 3, sel: "#v4a5Done", texte: "« Afficher 6 résultats »" },
          ],
          apres: { js: async (page) => page.evaluate(() => {
            const b = [...document.querySelectorAll("#v4a5Panneau button")].find((x) => /5 km/.test(x.textContent));
            const rang = b && b.parentElement; if (!rang) return;
            rang.querySelectorAll("button").forEach((x) => { x.disabled = true; x.style.opacity = ".5"; x.style.background = "#fff"; x.style.color = "var(--muted)"; x.classList.remove("is-on", "on", "active"); x.textContent = x.textContent.replace("✓", "").trim(); });
            const p = document.createElement("div"); p.id = "maqDistance"; p.textContent = "Choisis une ville ou autorise ta position pour filtrer par distance.";
            p.style.cssText = "font-size:13px;color:var(--text-dim);margin:6px 2px 0;line-height:1.4;"; rang.after(p);
          }) },
          annotations: [{ n: 1, sel: "#maqDistance", texte: "La distance attend une référence réelle" }],
        });
        await choisirFiltre(page, "Aujourd'hui");
        await choisirFiltre(page, "Soir");
        await page.evaluate(() => document.getElementById("appMain").scrollTo(0, 99999));
        await page.waitForTimeout(400);
        await prendre({
          id: "IRL-043", titre: "Filtres combinés sans résultat — pied « Aucun résultat » grisé",
          seulement: ["m390", "m360"],
          zooms: [{ nom: "pied", titre: "Pied fixe", sel: "#v4a5Pied", marge: 4 }],
          annotationsAvant: [{ n: 1, sel: "#v4a5Done", texte: "Désactivé, sans issue ; « Tout effacer » est hors écran, en haut" }],
          apres: { js: async (page) => page.evaluate(() => {
            const pied = document.getElementById("v4a5Pied"), done = document.getElementById("v4a5Done");
            const z = document.createElement("div"); z.id = "maqPied"; z.style.cssText = "display:flex;gap:8px;align-items:stretch;";
            const raz = document.createElement("button"); raz.type = "button"; raz.className = "v4a5-done"; raz.id = "maqRaz";
            raz.textContent = "Tout effacer"; raz.style.cssText = "flex:0 0 auto;width:auto !important;min-width:0;background:#fff;color:var(--accent);border:1.5px solid var(--accent-tile-line,#d9ccff);padding:0 18px;";
            done.parentNode.insertBefore(z, done); z.appendChild(raz); z.appendChild(done); done.style.flex = "1 1 0"; done.style.width = "auto"; done.style.minWidth = "0"; done.textContent = "Aucun résultat";
            const m = document.createElement("div"); m.id = "maqAide"; m.textContent = "Aucune activité ne coche « 5 km » + « Aujourd'hui » + « Soir ». Retire un choix.";
            m.style.cssText = "font-size:12.5px;color:var(--text-dim);text-align:center;margin:0 0 8px;line-height:1.35;"; pied.insertBefore(m, z);
          }) },
          annotations: [{ n: 1, sel: "#maqAide", texte: "Le pied dit ce qui bloque" }, { n: 2, sel: "#maqRaz", texte: "Issue à portée de pouce" }],
        });
        await page.locator("[data-v4a3-onglet=liste]").click();
        await page.waitForTimeout(1200);
        await prendre({
          id: "IRL-044", titre: "Retour à la Liste avec filtres sans résultat — état « Rien avec ces filtres »",
          seulement: ["m390"],
          annotationsAvant: [{ n: 1, sel: "#v4a3Vue", texte: "Aucun repère sur l'onglet Filtre : 3 filtres actifs invisibles" }, { n: 2, sel: "#eventList .empty .btn", texte: "« ✕ Tout afficher »" }],
          apres: { js: async (page) => page.evaluate(() => {
            const b = [...document.querySelectorAll("#v4a3Vue button")].find((x) => /Filtre/.test(x.textContent)); if (!b) return;
            const s = document.createElement("span"); s.id = "maqBadge"; s.textContent = "3";
            s.style.cssText = "display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;margin-left:6px;border-radius:999px;background:var(--accent);color:#fff;font-size:11.5px;font-weight:800;padding:0 6px;";
            b.appendChild(s);
          }) },
          annotations: [{ n: 1, sel: "#maqBadge", texte: "Nombre de filtres actifs visible sur l'onglet" }],
        });
        // Retour sur l'écran après un détour : les filtres sont-ils conservés ?
        await page.evaluate(() => goTo("feed")); await page.waitForTimeout(800);
        await page.evaluate(() => goTo("irl")); await page.waitForTimeout(2000);
        await prendre({ id: "IRL-045", titre: "Retour sur Rencontrer depuis le Fil : filtres conservés, vue Liste", seulement: ["m390"] });
      },
    },
    // ── 5. Sélecteurs de la vue Filtre ─────────────────────────────────────
    {
      nom: "compte-selecteurs",
      demarrage: compte("normal"),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await ouvrirRencontrer(page, 6000);
        await ongletFiltre(page);
        await page.locator("#v4a5Panneau", { hasText: "Choisir une date" }).locator("text=Choisir une date").first().click();
        await page.waitForTimeout(900);
        await prendre({ id: "IRL-046", titre: "Vue Filtre — « Choisir une date » : calendrier déplié",
          zooms: [{ nom: "mois", titre: "En-tête du mois", sel: "#irlCalPrev", marge: 30 }],
          annotationsAvant: [{ n: 1, sel: "#irlCalPrev", texte: "‹ › : 28 × 28 px" }],
          apres: { css: ".irl-cal-nav{min-width:44px !important;min-height:44px !important;font-size:20px !important;}" },
          annotations: [{ n: 1, sel: "#irlCalPrev", texte: "44 × 44 px" }] });
        await page.evaluate(() => document.getElementById("appMain").scrollTo(0, 0));
        await page.locator("#v4a5Panneau button", { hasText: "Modifier" }).first().click();
        await page.waitForTimeout(1200);
        await prendre({ id: "IRL-047", titre: "Sélecteur de ville (« Modifier ») — ouverture" });
        const champ = page.locator("#modalContent input[type=text], #modalContent input[type=search], #modalContent input").first();
        if (await champ.count()) {
          await champ.fill("Grenoble");
          await page.waitForTimeout(2500);
          await prendre({ id: "IRL-048", titre: "Sélecteur de ville — saisie « Grenoble » et suggestions (BAN / Photon)" });
        }
        await page.locator("button", { hasText: "Fermer" }).last().click();
        await page.waitForTimeout(900);
        await page.evaluate(() => document.getElementById("appMain").scrollTo(0, 400));
        await page.waitForTimeout(400);
        await page.locator("#v4a5Panneau button", { hasText: "Chercher" }).first().click();
        await page.waitForTimeout(1200);
        await prendre({ id: "IRL-049", titre: "« Quelles passions ? » → Chercher : recherche de passion" });
      },
    },
    // ── 6. Position accordée (Lyon 7e, émulée) ─────────────────────────────
    {
      nom: "geoloc-accordee",
      demarrage: compte("normal", { contexte: { permissions: ["geolocation"], geolocation: { latitude: 45.7485, longitude: 4.8467 } } }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await ouvrirRencontrer(page, 6000);
        await ongletFiltre(page);
        await page.locator("#v4a5Panneau button", { hasText: "Modifier" }).first().click();
        await page.waitForTimeout(1000);
        await page.locator("button, [role=button], div[onclick]", { hasText: "Utiliser ma position" }).first().click();
        await page.waitForTimeout(3000);
        await prendre({ id: "IRL-051", titre: "Position accordée par le geste « Utiliser ma position » — « Où ? » de la vue Filtre", note: "Position émulée (Lyon 7e) ; permission accordée au contexte. L'écran ne demande JAMAIS la position seul (first-run.js:2392, ui-v4a0-tete.js:377) : il faut ce geste." });
        await page.locator("[data-v4a3-onglet=liste]").click();
        await page.waitForTimeout(1500);
        await prendre({ id: "IRL-050", titre: "Position accordée — distances réelles sur les cartes" });
        await page.locator("[data-v4a3-onglet=carte]").click();
        await page.waitForTimeout(6500);
        await prendre({ id: "IRL-052", titre: "Position accordée — vue Carte recentrée", attendre: 800 });
      },
    },
    // ── 7. Position refusée (simulée) ──────────────────────────────────────
    {
      nom: "geoloc-refusee",
      demarrage: compte("normal", { avantBoot: async (page) => page.addInitScript(() => {
        const refus = { code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1 };
        Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok, ko) => setTimeout(() => ko && ko(refus), 300), watchPosition: () => 0, clearWatch: () => {} } });
      }) }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await ouvrirRencontrer(page, 6000);
        await figerToasts(page);
        await ongletFiltre(page);
        await page.locator("#v4a5Panneau button", { hasText: "Modifier" }).first().click();
        await page.waitForTimeout(1000);
        await page.locator("button, [role=button], div[onclick]", { hasText: "Utiliser ma position" }).first().click();
        await page.waitForTimeout(900);
        await prendre({
          id: "IRL-053", titre: "Position refusée (simulée) — toast de repli « autour de Paris »",
          note: "Refus simulé : navigator.geolocation remplacé avant le boot (erreur PERMISSION_DENIED). " + NOTE_TOAST,
          zooms: [{ nom: "toast", titre: "Toast", sel: "#toastStack .toast", marge: 8 }],
          annotationsAvant: [{ n: 1, sel: "#toastStack .toast", texte: "Renvoie vers « Filtre → Autour de moi » : section inexistante" }],
        });
      },
    },
    // ── 8. Aucune activité réelle ──────────────────────────────────────────
    {
      nom: "compte-vide",
      demarrage: compte("aucun"),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await ouvrirRencontrer(page, 5000);
        await prendre({ id: "IRL-055", titre: "Compte connecté, aucune activité réelle en base : seuls les exemples remplissent l'écran" });
      },
    },
    // ── 9. Volume (51 activités réelles) ───────────────────────────────────
    {
      nom: "compte-volume",
      demarrage: compte("gros"),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await ouvrirRencontrer(page, 7000);
        await page.evaluate(() => document.getElementById("appMain").scrollTo(0, 999999));
        await page.waitForTimeout(600);
        await prendre({ id: "IRL-056", titre: "Volume : bas de la première page (12 cartes) et « Afficher plus »",
          zooms: [{ nom: "plus", titre: "Afficher plus", sel: "#eventList > button.btn", marge: 8 }] });
        await page.locator("[data-v4a3-onglet=carte]").click();
        await page.waitForTimeout(6500);
        await prendre({ id: "IRL-057", titre: "Volume : vue Carte, marqueurs superposés (pas de regroupement)", attendre: 800,
          zooms: [{ nom: "carte", titre: "Carte", sel: "#irlMapWrap", marge: 0 }] });
      },
    },
    // ── 10. Tuiles de carte en échec ───────────────────────────────────────
    {
      nom: "tuiles-echec",
      demarrage: { mode: "demo", avantBoot: async (page) => page.route(/tiles\.openfreemap\.org/, (r) => r.abort()) },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await ouvrirRencontrer(page, 2500);
        await page.locator("[data-v4a3-onglet=carte]").click();
        await page.waitForTimeout(6500);
        await prendre({ id: "IRL-058", titre: "Vue Carte — tuiles et style refusés (réseau simulé)", note: "Requêtes vers tiles.openfreemap.org interrompues par une route du scénario." });
      },
    },
    // ── 11. Recherche ──────────────────────────────────────────────────────
    {
      nom: "recherche",
      demarrage: compte("normal"),
      vues: ["m390", "m360"],
      async derouler({ page, prendre, vue }) {
        await ouvrirRencontrer(page, 6000);
        const champ = page.locator("#v4a0Head input").first();
        await champ.click();
        await champ.fill("salsa");
        await page.waitForTimeout(1200);
        await prendre({ id: "IRL-005", titre: "Recherche « salsa » — un résultat" });
        if (vue !== "m390") return;
        await champ.fill("Lyon");
        await page.waitForTimeout(1200);
        await prendre({ id: "IRL-007", titre: "Recherche « Lyon » — par ville" });
        await champ.fill("kitesurf");
        await page.waitForTimeout(1200);
        await prendre({ id: "IRL-006", titre: "Recherche sans résultat « kitesurf »",
          annotationsAvant: [{ n: 1, sel: "#eventList .empty-title", texte: "« Rien avec ces filtres » : aucun filtre n'est posé" }],
          apres: { js: async (page) => page.evaluate(() => { const t = document.querySelector("#eventList .empty-title"), x = document.querySelector("#eventList .empty-text"), b = document.querySelector("#eventList .empty .btn");
            if (t) t.textContent = "Aucune activité pour « kitesurf »"; if (x) x.textContent = "Essaie un autre mot, une ville ou une passion."; if (b) b.textContent = "Effacer la recherche"; }) },
          annotations: [{ n: 1, sel: "#eventList .empty-title", texte: "Le message nomme la recherche" }] });
      },
    },
    // ── 12. Portes d'entrée ────────────────────────────────────────────────
    {
      nom: "entrees",
      demarrage: compte("normal"),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => goTo("feed"));
        await page.waitForTimeout(2500);
        const cta = page.locator("#feedList button", { hasText: /Trouver une (activité|expérience)/ }).first();
        if (await cta.count()) {
          await cta.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
          await prendre({ id: "IRL-060", titre: "Fil — CTA « Trouver une… » sur une publication", zooms: [{ nom: "cta", titre: "CTA", sel: "#feedList button:has-text('Trouver une')", marge: 40 }] });
          await cta.click(); await page.waitForTimeout(2500);
          await prendre({ id: "IRL-061", titre: "Après le CTA du Fil — feuille / écran d'arrivée" });
        }
      },
    },
    {
      nom: "lien-profond",
      demarrage: compte("normal", { hash: "#irl-event-ev_ird_01" }),
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.evaluate(() => { location.hash = "#irl-event-ev_ird_01"; });
        await page.waitForTimeout(3500);
        await prendre({ id: "IRL-062", titre: "Lien profond #irl-event-… — la fiche s'ouvre (porte du domaine irl-fiche, non auditée ici)" });
      },
    },
    // ── 13. Visiteur (première visite, sans compte) ────────────────────────
    {
      nom: "visiteur",
      demarrage: { mode: "visiteur" },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        const ok = await page.evaluate(() => typeof goTo === "function");
        if (ok) { await page.evaluate(() => goTo("irl")); await page.waitForTimeout(3000); }
        await prendre({ id: "IRL-063", titre: "Visiteur sans compte — Rencontrer (si l'écran est joignable)" });
      },
    },
  ],
};
