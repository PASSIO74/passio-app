// ============================================================================
// XSS STOCKÉE : `eventType` (fiche d'activité) et `duration` (carnets en direct)
// ----------------------------------------------------------------------------
// Trois emplacements insérant du contenu d'un AUTRE compte sans échappement :
//
//   1. app-07 `openEventDetails` — badge de la fiche : `${ev.eventType}` brut,
//      alors que la MÊME donnée est échappée sur la carte de la liste (~2432).
//      Mesuré avant correctif :
//        badge = "🍳 Cuisine · <img src=x onerror=…>Atelier"  → script exécuté.
//   2. app-02 `renderFeedCdvLives` — carrousel du Fil : `${l.duration || ""}`.
//   3. app-03 `openCdvLiveViewer` — fiche du carnet : `live.duration`.
//
// ⚠️ Le `<select>` de création ne propose que des valeurs fixes pour `eventType`,
// et `duration` vient d'un champ de formulaire : ce n'est PAS une garantie. Les
// deux colonnes sont librement écrites par toute session authentifiée via REST
// (même famille que `comment_interactions`, CLAUDE.md §Échappement), et la fiche
// d'activité affiche les événements de tout le monde.
//
// Chaque test vérifie DEUX choses distinctes : que le marqueur d'exécution est
// resté absent (aucun handler n'a tourné), et que la charge apparaît en TEXTE.
// Le second point est le vrai verrou : un test qui n'observerait que le marqueur
// passerait aussi si la donnée avait été silencieusement supprimée.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const CHARGE = '<img src=x onerror="window.__XSS=1">SUITE';

test.describe("échappement du type d'activité et de la durée", () => {
  test("le type d'activité de la fiche est du texte, pas du balisage", async ({ page }) => {
    await bootOnboarded(page);

    const r = await page.evaluate((charge) => {
      state.userEvents = [{
        id: "ev_type_xss", passion: "cuisine", title: "Atelier",
        eventType: charge, date: Date.now() + 3 * 86400000,
        city: "Paris", attendees: [], organizerId: "u_autre",
      }];
      state.seed.events = [];
      openEventDetails("ev_type_xss");
      const badge = document.querySelector(".event-detail-passion-badge");
      return {
        html: badge ? badge.innerHTML : null,
        texte: badge ? badge.textContent : null,
        img: !!(badge && badge.querySelector("img")),
        marqueur: !!window.__XSS,
      };
    }, CHARGE);

    expect(r.html, "le badge doit être rendu").not.toBe(null);
    expect(r.marqueur).toBe(false);
    expect(r.img, "aucune balise ne doit avoir été construite").toBe(false);
    // La donnée reste affichée, en toutes lettres.
    expect(r.texte).toContain(CHARGE);
  });

  test("la durée du carnet en direct est du texte dans le carrousel du Fil", async ({ page }) => {
    await bootOnboarded(page);

    const r = await page.evaluate((charge) => {
      localStorage.setItem("passio_cdv_lives", JSON.stringify([{
        id: "live_xss", authorId: "u_autre", status: "live", visibility: "public",
        destination: "Lyon", duration: charge, currentViewers: 2,
        steps: [{ id: "s1", text: "étape" }], createdAt: Date.now(),
      }]));
      const sec = document.getElementById("feedCdvLivesSection");
      if (sec) sec.remove();
      renderFeedCdvLives();
      const item = document.querySelector("#feedCdvLivesSection .cdv-feed-live-item");
      return {
        present: !!item,
        texte: item ? item.textContent : null,
        img: !!(item && item.querySelector("img")),
        marqueur: !!window.__XSS,
      };
    }, CHARGE);

    expect(r.present, "le carrousel doit contenir le live injecté").toBe(true);
    expect(r.marqueur).toBe(false);
    expect(r.img).toBe(false);
    expect(r.texte).toContain(CHARGE);
  });

  test("la durée est du texte dans la fiche du carnet en direct", async ({ page }) => {
    await bootOnboarded(page);

    const r = await page.evaluate((charge) => {
      localStorage.setItem("passio_cdv_lives", JSON.stringify([{
        id: "live_xss2", authorId: "u_autre", status: "live", visibility: "public",
        destination: "Lyon", duration: charge, currentViewers: 2,
        steps: [{ id: "s1", text: "étape" }], createdAt: Date.now(),
      }]));
      openCdvLiveViewer("live_xss2");
      const modal = document.querySelector(".modal-content") || document.body;
      return {
        texte: modal.textContent,
        img: !!modal.querySelector('img[src="x"]'),
        marqueur: !!window.__XSS,
      };
    }, CHARGE);

    expect(r.marqueur).toBe(false);
    expect(r.img).toBe(false);
    expect(r.texte).toContain(CHARGE);
  });
});
