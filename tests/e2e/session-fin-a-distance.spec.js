// ═════════════════════════════════════════════════════════════════════
// UNE SESSION QUI FINIT AILLEURS NE DÉTRUIT RIEN ICI (2026-11-10, audit de stabilisation)
//
// ETAT-02 — `doLogout` appelait `supa.auth.signOut()` sans portée : le SDK embarqué
// (supabase-js 2.116) prend alors `scope: "global"` et révoque TOUTES les sessions du
// compte. Se déconnecter de l'ordinateur tuait celle du téléphone. Là-bas, au premier
// rafraîchissement refusé, le SDK retire la session et émet `SIGNED_OUT` — que
// l'application n'écoutait pas quand le démarrage avait trouvé une session (R19) :
// l'écran restait « connecté », les lectures privées rendaient vide, les écritures
// partaient en 401.
//
// ETAT-06 — Le bouton du bandeau rouge « Session expirée » appelait `doLogout`, qui
// PURGE : messages en file, publications à reprendre, état non synchronisé — tout ce
// que le mode « session expirée » promet de garder jusqu'à la reconnexion.
//
// Ce que la suite garde :
//   ① une déconnexion volontaire ne ferme QUE la session de cet appareil ;
//   ② `SIGNED_OUT` reçu sur un compte connecté pose le mode « session expirée » et son
//      bandeau, sans requête dans le rappel et sans rien purger ;
//   ③ ni pendant une déconnexion annoncée, ni pour un visiteur ;
//   ④ le bouton du bandeau rouge reconnecte SANS purger : la file des messages et
//      l'état restent ;
//   ⑤ le démarrage qui trouve une session écoute bien la fin de session (câblage).
// ═════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID = "5d2c8e1a-7b3f-4c6d-9e0a-1f2b3c4d5e6f";

// Un faux client Supabase dont l'auth enregistre ce qu'on lui demande.
async function fauxClient(page) {
  await page.evaluate(() => {
    window.__auth = { signOut: [], abonnes: [], refresh: 0 };
    window.supabase = { createClient: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        upsert: async () => ({ error: null }),
      }),
      auth: {
        signOut: async (o) => {
          window.__auth.signOut.push(o === undefined ? "(sans argument)" : JSON.stringify(o));
          try { sessionStorage.setItem("__banc_signout", JSON.stringify(window.__auth.signOut)); } catch (e) {}
          return { error: null };
        },
        onAuthStateChange: (cb) => { window.__auth.abonnes.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
        getSession: async () => ({ data: { session: null } }),
        refreshSession: async () => { window.__auth.refresh++; return { data: { session: null }, error: { message: "refresh refusé" } }; },
      },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    }) };
    window._supaReal = false;
    _initRealSupa();
    window._supaReal = true;
  });
}

test.describe("session : une fin de session ailleurs ne détruit rien ici", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((uid) => { try { localStorage.setItem("passio_uid", uid); } catch (e) {} }, UID);
    await bootOnboarded(page);
    await fauxClient(page);
  });

  test("① une déconnexion volontaire ne ferme que la session de cet appareil", async ({ page }) => {
    const nav = page.waitForEvent("framenavigated", { timeout: 15000 }).catch(() => null);
    await page.evaluate(() => { doLogout("signin"); });
    await nav;
    await page.waitForLoadState("domcontentloaded");
    const appels = await page.evaluate(() => JSON.parse(sessionStorage.getItem("__banc_signout") || "[]"));
    expect(appels.length, "signOut a bien été appelé").toBeGreaterThan(0);
    expect(appels, "portée locale, jamais globale").toEqual(appels.map(() => JSON.stringify({ scope: "local" })));
  });

  test("② SIGNED_OUT sur un compte connecté pose le mode « session expirée », sans rien purger", async ({ page }) => {
    const r = await page.evaluate(() => {
      localStorage.setItem("passio_outbox_v1", JSON.stringify([{ id: "m_banc", uid: MY_UID, text: "en attente" }]));
      const etatAvant = localStorage.getItem("passio_mvp_state_v1");
      _ecouterFinDeSession();
      const cb = window.__auth.abonnes[window.__auth.abonnes.length - 1];
      cb("SIGNED_OUT", null);
      return new Promise((ok) => setTimeout(() => ok({
        expire: sessionExpiree(),
        bandeau: !!document.getElementById("sessionExpireeBandeau"),
        outbox: localStorage.getItem("passio_outbox_v1"),
        etatGarde: localStorage.getItem("passio_mvp_state_v1") === etatAvant,
      }), 50));
    });
    expect(r.expire, "mode « session expirée » posé").toBe(true);
    expect(r.bandeau, "bandeau « Se reconnecter » affiché").toBe(true);
    expect(r.outbox, "la file des messages est gardée").toContain("m_banc");
    expect(r.etatGarde, "l'état local n'est pas purgé").toBe(true);
  });

  test("③ ni pendant une déconnexion annoncée, ni pour un visiteur", async ({ page }) => {
    const r = await page.evaluate(() => new Promise((ok) => {
      _ecouterFinDeSession();
      const cb = window.__auth.abonnes[window.__auth.abonnes.length - 1];
      annoncerRechargement();
      cb("SIGNED_OUT", null);
      setTimeout(() => ok({ expire: sessionExpiree() }), 50);
    }));
    expect(r.expire, "une déconnexion volontaire n'est pas une session perdue").toBe(false);
  });

  test("④ le bouton du bandeau rouge reconnecte SANS purger la file ni l'état", async ({ page }) => {
    const r = await page.evaluate(() => {
      localStorage.setItem("passio_outbox_v1", JSON.stringify([{ id: "m_banc", uid: MY_UID, text: "en attente" }]));
      window.__ecranAuth = [];
      window.openAuthScreen = (m) => { window.__ecranAuth.push(m); };
      _sondeServeurBandeau("session");
      document.querySelector('#serveurBanner[data-serveur="session"] button').click();
      return new Promise((ok) => setTimeout(() => ok({
        outbox: localStorage.getItem("passio_outbox_v1"),
        etat: !!localStorage.getItem("passio_mvp_state_v1"),
        uid: localStorage.getItem("passio_uid"),
        expire: sessionExpiree(),
        ecran: window.__ecranAuth.slice(),
        refresh: window.__auth.refresh,
      }), 600));
    });
    expect(r.outbox, "la file des messages est gardée").toContain("m_banc");
    expect(r.etat, "l'état local est gardé").toBe(true);
    expect(r.uid, "le compte de l'appareil est gardé").toBe(UID);
    expect(r.expire, "les écritures sont suspendues jusqu'à la reconnexion").toBe(true);
    expect(r.refresh, "un rafraîchissement est d'abord tenté").toBe(1);
    expect(r.ecran, "puis l'écran de connexion s'ouvre").toEqual(["signin"]);
  });

  test("⑤ le démarrage qui trouve une session écoute la fin de session (câblage, à la source)", async ({ page }) => {
    const src = await page.request.get("/js/app-08-ui-modals-tour.js").then((r) => r.text());
    const debut = src.indexOf("async function boot()");
    const branche = src.indexOf("if (session?.user && (!_authIntent || _recuperationEnCours)) {", debut);
    const retour = src.indexOf("        return;\n      }\n    }\n  } catch(e) { /* pas de session */ }", branche);
    expect(debut > 0 && branche > debut && retour > branche, "repères du démarrage").toBe(true);
    expect(src.slice(branche, retour), "la branche « session trouvée » appelle _ecouterFinDeSession").toContain("_ecouterFinDeSession()");
  });
});
