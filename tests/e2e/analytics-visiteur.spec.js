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
// Le coupe-circuit de supaTrack a pu se poser AVANT nous : en CI le vrai SDK
// se charge, un screen_view du boot part sans session et se fait refuser.
window._analyticsMuetJusqua = 0;
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

// Session persistée par le SDK Supabase — MÊME clé et MÊME format que celle
// que `supaTrack` relit (`sb-<ref>-auth-token`, v2 à plat). `decalageSec`
// négatif = jeton DÉJÀ expiré.
//
// ⚠️ ELLE SE POSE DANS LE `evaluate`, JAMAIS PAR `addInitScript` — divergence
// d'environnement mesurée en CI le 2026-09-09 (vert en local, rouge en CI, la
// famille de défauts la plus courante du dépôt) : en CI le VRAI SDK se charge,
// et au boot il relit cette clé, échoue à rafraîchir un jeton fabriqué… et la
// PURGE. La session avait donc disparu avant le premier `supaTrack`. En local
// le SDK vient d'un CDN, rien ne la touchait — le test tenait par accident.
function poserSessionJS(uid, decalageSec) {
  return `try { localStorage.setItem("sb-njkiyoklssvefstljemx-auth-token", JSON.stringify({
    access_token: "jeton-de-test",
    expires_at: Math.floor(Date.now() / 1000) + (${decalageSec}),
    user: { id: ${JSON.stringify(uid)} },
  })); } catch (e) {}`;
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
    const r = await page.evaluate(([fake, session]) => {
      eval(fake);
      eval(session);                       // session posée APRÈS le boot (cf. poserSessionJS)
      window.supaTrack("publish_post", { type: "text" });
      return { uid: MY_UID, inserts: window.__inserts };
    }, [FAUX_SUPA, poserSessionJS(UUID, 3600)]);
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

  // ── Le 401 de production (2026-09-09) ────────────────────────────────────
  // 271 refus HTTP 401, 6 appareils, tous les écrans. Un 401 (et non un 403)
  // dit que le jeton était ABSENT ou INVALIDE : l'uuid survivait dans
  // `passio_uid` alors que la session, elle, était finie ou périmée.
  test("⑤ un uuid SANS session vivante n'écrit rien (401 de prod)", async ({ page }) => {
    await poserUid(page, UUID);            // l'uuid reste… mais aucune session
    await bootOnboarded(page);
    const inserts = await page.evaluate((fake) => {
      eval(fake);
      try { localStorage.removeItem("sb-njkiyoklssvefstljemx-auth-token"); } catch (e) {}
      window.__inserts = [];
      window.supaTrack("screen_view", { screen: "messages" });
      return window.__inserts;
    }, FAUX_SUPA);
    expect(inserts).toHaveLength(0);
  });

  test("⑥ un jeton EXPIRÉ n'écrit rien et demande un rafraîchissement", async ({ page }) => {
    await poserUid(page, UUID);
    await bootOnboarded(page);
    const r = await page.evaluate(([fake, session]) => {
      eval(fake);
      eval(session);                       // jeton expiré depuis une minute
      window.__nudges = 0;
      Object.defineProperty(window.supa.auth, "getSession", {
        configurable: true, writable: true,
        value: function () { window.__nudges++; return Promise.resolve({ data: { session: null } }); },
      });
      window.__inserts = [];
      window.supaTrack("screen_view", { screen: "feed" });
      return { inserts: window.__inserts, nudges: window.__nudges };
    }, [FAUX_SUPA, poserSessionJS(UUID, -60)]);
    expect(r.inserts).toHaveLength(0);
    expect(r.nudges).toBe(1);              // le SDK est sollicité, une seule fois
  });

  test("⑦ une session d'un AUTRE compte n'écrit rien (identité divergente)", async ({ page }) => {
    await poserUid(page, UUID);
    await bootOnboarded(page);
    const inserts = await page.evaluate(([fake, session]) => {
      eval(fake);
      eval(session);
      window.__inserts = [];
      window.supaTrack("like_post", { passion: "moto" });
      return window.__inserts;
    }, [FAUX_SUPA, poserSessionJS("11111111-2222-4333-8444-555555555555", 3600)]);
    expect(inserts).toHaveLength(0);
  });

  // ⚠️ LE SDK NE LÈVE PAS SUR UN REFUS : l'erreur arrive dans `{ error }` du
  // `then` de SUCCÈS. Sans coupe-circuit, la rafale se reproduit à l'identique.
  test("⑧ un refus serveur fait TAIRE les analytics (coupe-circuit)", async ({ page }) => {
    await poserUid(page, UUID);
    await bootOnboarded(page);
    const r = await page.evaluate((session) => {
      eval(session);
      window.__inserts = [];
      window._supaReal = true;
      window._analyticsMuetJusqua = 0;
      Object.defineProperty(window.supa, "from", {
        configurable: true, writable: true,
        value: function (table) {
          return {
            insert: function (row) {
              window.__inserts.push({ table: table, row: row });
              return Promise.resolve({ error: { code: "42501", message: "refus RLS" } });
            },
          };
        },
      });
      window.supaTrack("screen_view", { screen: "feed" });
      return new Promise((r2) => setTimeout(() => {
        for (var i = 0; i < 20; i++) window.supaTrack("screen_view", { screen: "feed" });
        r2({ envois: window.__inserts.length, muet: window._analyticsMuetJusqua > Date.now() });
      }, 50));
    }, poserSessionJS(UUID, 3600));
    expect(r.envois).toBe(1);   // 1 envoi, pas 21
    expect(r.muet).toBe(true);
  });
});
