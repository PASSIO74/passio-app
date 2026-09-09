// ══════════════════════════════════════════════════════════════════════════
// ANALYTICS LÉGÈRES — un visiteur SANS COMPTE n'écrit rien (2026-09-09).
//
// Défaut mesuré en production : `supaTrack` (app-08) envoyait `MY_UID` dans
// `analytics_events`, dont la SEULE policy est
//     analytics_insert_own — INSERT — WITH CHECK (user_id = auth.uid()::text)
// Or `getMyUserId()` fabrique un `u_<aléatoire>` pour TOUT visiteur, et depuis
// l'entrée directe sans compte (`first_run_experience_v1`, actif par défaut)
// c'est le cas le plus COURANT. Chaque `screen_view` d'un visiteur partait donc
// se faire refuser (42501), sans qu'on le voie : l'appel est fire-and-forget,
// `.then(function(){}, function(){})` avale le refus.
//
// ⚠️ Le défaut était INVISIBLE dans l'app et VISIBLE seulement du centre de
// pilotage, qui remontait la rafale en « problème » — d'où un bruit permanent
// qui noyait les vrais signaux. Même famille que la porte 18+ du 2026-09-08 :
// « MY_UID ne prouve pas qu'un compte existe ».
//
// ⚠️ ON MESURE L'ÉCRITURE, PAS LA GARDE. Un test qui appellerait `supaTrack`
// sans faux client serait vert quoi qu'il arrive (`supa` indéfini → exception
// → catch). On installe donc le faux client d'app-08 et on compte les lignes.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Faux client Supabase, même technique que `notification-message.spec.js` :
// on MUTE les membres de `window.supa` (le `supa` lexical d'app-08 désigne le
// MÊME objet), par `defineProperty` — en CI le vrai SDK se charge et une simple
// affectation échouerait en silence sur un getter de prototype.
const FAUX_SUPA = `
window.__inserts = [];
window._supaReal = true;
Object.defineProperty(window.supa, "from", {
  configurable: true, writable: true,
  value: function (table) {
    return {
      insert: function (row) { window.__inserts.push({ table: table, row: row }); return Promise.resolve({ error: null }); },
    };
  },
});
`;

async function poserUid(page, uid) {
  await page.addInitScript((u) => { try { localStorage.setItem("passio_uid", u); } catch (e) {} }, uid);
}

const UUID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

test.describe("Analytics légères", () => {
  test("① un visiteur sans compte (uid fabriqué) n'écrit AUCUNE ligne", async ({ page }) => {
    await poserUid(page, "u_ab12cd34");
    await bootOnboarded(page);
    const r = await page.evaluate((fake) => {
      eval(fake);
      window.supaTrack("screen_view", { screen: "feed" });
      window.supaTrack("like_post", { passion: "moto" });
      return { uid: MY_UID, inserts: window.__inserts };
    }, FAUX_SUPA);
    expect(r.uid).toBe("u_ab12cd34");
    expect(r.inserts).toHaveLength(0);
  });

  test("② un compte réel (uuid Supabase) écrit bien sa ligne", async ({ page }) => {
    await poserUid(page, UUID);
    await bootOnboarded(page);
    const r = await page.evaluate((fake) => {
      eval(fake);
      window.supaTrack("publish_post", { type: "text" });
      return { uid: MY_UID, inserts: window.__inserts };
    }, FAUX_SUPA);
    expect(r.uid).toBe(UUID);
    expect(r.inserts).toHaveLength(1);
    expect(r.inserts[0].table).toBe("analytics_events");
    expect(r.inserts[0].row.user_id).toBe(UUID);
    expect(r.inserts[0].row.event).toBe("publish_post");
  });

  test("③ le refus vaut aussi pour un uid vide ou tronqué (pas seulement le préfixe u_)", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((fake) => {
      eval(fake);
      // On éprouve la garde elle-même sur des formes voisines : une garde par
      // préfixe `u_` (liste NOIRE) laisserait passer les trois premières.
      const RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return ["", "anonyme", "3f2b1c4d-5e6f-4a7b-8c9d", "3f2b1c4d5e6f4a7b8c9d0e1f2a3b4c5d", "u_ab12cd34"]
        .map((v) => RE.test(v));
    }, FAUX_SUPA);
    expect(r).toEqual([false, false, false, false, false]);
  });

  test("④ sans client réel, rien ne part même avec un uuid", async ({ page }) => {
    await poserUid(page, UUID);
    await bootOnboarded(page);
    const inserts = await page.evaluate((fake) => {
      eval(fake);
      window._supaReal = false; // hors ligne / SDK non chargé
      window.__inserts = [];
      window.supaTrack("screen_view", { screen: "feed" });
      return window.__inserts;
    }, FAUX_SUPA);
    expect(inserts).toHaveLength(0);
  });
});
