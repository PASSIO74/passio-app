// Audit 2026-11-02 — B-01 : l'emoji d'une activité d'AUTRUI arrivait dans le
// marqueur de carte sans échappement (app-07, `updateIrlMapMarkers` →
// `L.divIcon({ html })` → `MarkerShim` : `el.innerHTML = icon.html`).
// `events.emoji` est une colonne texte sans contrainte serveur, écrite par
// l'auteur de l'activité et lue par tout le monde : un `<img onerror>` posé en
// emoji s'exécutait chez quiconque ouvrait la carte de « Rencontrer ».
//
// Le verrou mesure le CHEMIN RÉEL : vrai shim `map-loader`, vraie bibliothèque
// MapLibre vendorée (WebGL logiciel du navigateur de test), vraie fonction
// `updateIrlMapMarkers` sur un jeu d'activités maîtrisé — aucune écriture Supabase
// (fonctions de sync neutralisées après le boot, comme dans irl.spec.js).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const HOSTILE = '<img src=x onerror="window.__xss_marqueur=1">';

async function bootCarte(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    ["supaPublishEvent", "supaUpdateEvent", "supaCancelEvent", "supaDeleteEvent",
      "supaJoinEvent", "supaLeaveEvent", "supaSetEventRsvp", "supaCheckInEvent",
      "supaLoadEvents", "supaLoadEventPosts", "supaLoadEventReactions",
      "supaLoadEventComments", "supaLoadEventCommentCounts", "supaCreateEventConversation",
      "supaJoinEventConversation", "supaLeaveEventConversation", "supaReport",
    ].forEach((fn) => { window[fn] = async () => null; });
    window._supaReal = false;
    window.passioGeoSuggest = async () => [];
    window.passioGeocode = async () => null;
    window.passioReverseGeocode = async () => null;
    window._geocodeAddress = async () => null;
    window.irlUserLocation = { lat: 48.8566, lng: 2.3522 };
  });
}

test.describe("Audit 2026-11 — marqueurs de carte et emoji d'autrui (B-01)", () => {
  test("un emoji hostile reste du TEXTE dans le marqueur : aucun nœud injecté, aucun script exécuté", async ({ page }) => {
    await bootCarte(page);
    const supporte = await page.evaluate(() => !!(window.passioMapSupported && window.passioMapSupported()));
    test.skip(!supporte, "WebGL indisponible dans ce navigateur : la carte ne se construit pas, le marqueur non plus");

    const verdict = await page.evaluate(async (hostile) => {
      const now = Date.now();
      // Deux activités : l'une avec un emoji hostile posé par son auteur, l'autre
      // sans emoji (le marqueur retombe sur celui de la passion).
      state.seed.events = [
        { id: "ev_hostile", title: "Activité piégée", passion: "musique", emoji: hostile,
          city: "Paris", lat: 48.8566, lng: 2.3522, date: now + 86400000, time: "18:00",
          desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [], organizerId: "someone_else", status: "active" },
        { id: "ev_sans_emoji", title: "Activité sans emoji", passion: "musique", emoji: "",
          city: "Paris", lat: 48.86, lng: 2.36, date: now + 2 * 86400000, time: "19:00",
          desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [], organizerId: "someone_else", status: "active" },
      ];
      state.userEvents = [];
      window._irlMapSig = null;
      goTo("irl");
      renderIRL();
      // La carte est repliée par défaut (« peek ») : on la construit explicitement,
      // comme le fait le dépliage, et on attend le shim + la bibliothèque.
      await window.ensureLeaflet();
      initIrlMap();
      await new Promise((r) => setTimeout(r, 200));
      updateIrlMapMarkers();
      await new Promise((r) => setTimeout(r, 400));
      const marqueurs = Array.from(document.querySelectorAll(".passio-marker"));
      return {
        nbMarqueurs: marqueurs.length,
        imgs: document.querySelectorAll(".passio-marker img").length,
        xss: window.__xss_marqueur === 1,
        textes: marqueurs.map((m) => m.textContent),
        htmls: marqueurs.map((m) => m.innerHTML.slice(0, 80)),
      };
    }, HOSTILE);

    console.log(JSON.stringify(verdict));
    // Les deux marqueurs existent (la carte a bien été construite : sinon le test
    // serait vert par absence, ce qui ne prouverait rien).
    expect(verdict.nbMarqueurs, "la carte porte les deux marqueurs").toBe(2);
    // Aucun nœud d'image n'est né de l'emoji, et le gestionnaire ne s'est pas exécuté.
    expect(verdict.imgs, "aucun <img> injecté dans un marqueur").toBe(0);
    expect(verdict.xss, "aucun script exécuté depuis un emoji").toBe(false);
    // L'emoji hostile est BORNÉ puis ÉCHAPPÉ : il subsiste au plus 4 caractères de
    // texte inerte (« <img » rendu comme texte), jamais une balise.
    const texteHostile = verdict.textes.find((t) => t.includes("<"));
    expect(texteHostile, "le début de la charge est rendu comme texte, tronqué à 4 caractères").toBe(hostileTronque(HOSTILE));
    expect(verdict.htmls.every((h) => !/<img/i.test(h)), "le HTML des marqueurs ne contient aucune balise img").toBe(true);
    // L'activité sans emoji garde l'emoji de sa passion (le repli n'a pas changé).
    expect(verdict.textes.some((t) => t.trim() === "🎸" || (t.trim().length > 0 && !t.includes("<"))), "le repli sur l'emoji de la passion tient").toBe(true);
  });
});

function hostileTronque(s) { return Array.from(s).slice(0, 4).join(""); }
