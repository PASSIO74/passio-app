// ═══════════════════════════════════════════════════════════════════════════
// MONITORING — les erreurs de BOOT doivent survivre au stub Supabase.
//
// `js/platform.js` met les erreurs en file tant que le client Supabase n'est pas
// là, puis vide la file. Jusqu'au 2026-08-22 la condition était `window.supa` —
// or `window.supa` existe dès le PARSE d'app-08 : c'est le stub noop, dont
// l'insert ne part nulle part. La file était donc vidée dans le vide, et les
// erreurs les plus utiles — celles du démarrage, avant l'arrivée du SDK depuis
// le CDN — étaient perdues sans laisser de trace. La condition est maintenant
// `window._supaReal`.
//
// `monitoring-bruit.spec.js` vérifie le FILTRE (quel bruit ne doit pas partir)
// et a besoin du vrai SDK. Ce test-ci vérifie la MÉCANIQUE de la file, et il est
// hermétique : le SDK est remplacé par un client minimal posé par le test, donc
// il tourne partout, CDN joignable ou non. Sans lui, la correction n'aurait
// aucune preuve dans un environnement au réseau fermé.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

/** Compte les POST vers client_errors, et les empêche d'aboutir. */
async function compteurRemontees(page) {
  const envois = [];
  await page.route("**/rest/v1/client_errors*", async (route) => {
    if (route.request().method() === "POST") {
      try { envois.push(JSON.parse(route.request().postData() || "{}")); } catch (e) { envois.push({}); }
    }
    await route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  return envois;
}

/**
 * Client Supabase minimal, réduit à ce que le boot et la remontée touchent.
 * `insert` fait un VRAI fetch : la remontée reste observable au niveau réseau,
 * donc le test prouve un envoi effectif, pas un appel de fonction.
 */
const FAUX_SDK = `window.supabase = { createClient: (url) => ({
  from: (tbl) => ({ insert: (p) => fetch(url + "/rest/v1/" + tbl, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p),
  }).then(() => ({ error: null }), () => ({ error: { message: "ko" } })) }),
  auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  channel: () => ({ on: function () { return this; }, subscribe: () => null }),
  removeChannel: () => {},
}) };`;

/**
 * ⚠️ LÈVE L'ERREUR DANS LA FENÊTRE VISÉE, SANS COURSE — et c'est la
 * correction d'une instabilité mesurée à 3 à 4 échecs sur 10, EN LOCAL comme
 * en CI, et présente AVANT le lot qui l'a fait remarquer (rejoué sur le
 * commit précédent : 4 rouges sur 10).
 *
 * La version d'origine faisait `setTimeout(() => { throw … }, 50)` depuis
 * `addInitScript`, donc AVANT le chargement de la page. Or c'est
 * `js/platform.js` qui installe `window.addEventListener("error", …)` : si le
 * runner met plus de 50 ms à l'exécuter — ce qui arrive dès qu'il est chargé —
 * l'erreur part **sans handler**, n'est jamais mise en file, et le test échoue
 * en accusant la file d'un défaut qui n'existe pas.
 *
 * ⚠️ LE REMÈDE N'EST PAS UN DÉLAI PLUS LONG : un délai plus long reste une
 * course, il la rend seulement moins probable. On attend la CONDITION que le
 * test dit lui-même vouloir exercer — « `window.supa` (le stub d'app-08)
 * existe déjà, `_supaReal` non ». Et comme `platform.js` est chargé en tête,
 * AVANT app-08, l'existence de `window.supa` PROUVE que le handler est posé :
 * ce n'est plus une temporisation, c'est une garantie d'ordre.
 */
const LEVER_DANS_LA_FENETRE = (message) => {
  let tours = 0;
  const essai = () => {
    if (++tours > 600) return;                       // borne : ~6 s, puis on abandonne
    if (window._supaReal) return;                    // fenêtre manquée : ne rien lever
    if (!window.supa) return void setTimeout(essai, 10);
    setTimeout(() => { throw new Error(message); }, 0);
  };
  essai();
};

test.describe("Monitoring — file d'erreurs de boot", () => {
  test("une erreur levée AVANT le vrai client est mise en file, puis remontée", async ({ page }) => {
    test.setTimeout(60000);
    const envois = await compteurRemontees(page);
    // Le vrai SDK ne doit pas s'en mêler : c'est le faux qui pilote le timing.
    await page.route("**/js/vendor/supabase-js*", (route) => route.abort()); // le SDK est auto-hébergé depuis le 2026-09-11

    await page.addInitScript(([k, t, sdk, lever]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
      // Erreur très tôt : `window.supa` (le stub) existe déjà, `_supaReal` non.
      // C'est exactement la fenêtre où les erreurs se perdaient.
      (0, eval)(lever)("erreur de boot precoce");
      // Le client réel n'arrive qu'à 4 s : la file doit tenir l'intervalle.
      setTimeout(() => {
        // eslint-disable-next-line no-eval
        (0, eval)(sdk);
        if (typeof window._initRealSupa === "function") window._initRealSupa();
      }, 4000);
    }, [GATE_KEY, GATE_TOKEN, FAUX_SDK, "(" + LEVER_DANS_LA_FENETRE.toString() + ")"]);

    await page.goto("/index.html?monitoring=1");
    await page.waitForFunction(() => window._supaReal === true, null, { timeout: 25000 });
    await page.waitForTimeout(2000); // l'intervalle de flush tourne toutes les 500 ms

    const messages = envois.map((e) => e.message || "").join(" | ");
    expect(messages, "l'erreur de boot doit avoir survécu à l'attente du vrai client")
      .toContain("erreur de boot precoce");
  });

  test("le stub noop n'avale pas la file : rien ne part tant que _supaReal est faux", async ({ page }) => {
    test.setTimeout(60000);
    const envois = await compteurRemontees(page);
    await page.route("**/js/vendor/supabase-js*", (route) => route.abort()); // le SDK est auto-hébergé depuis le 2026-09-11

    // ⚠️ MÊME ATTENTE ICI, ET C'EST ENCORE PLUS IMPORTANT : l'assertion de ce
    // cas est « aucune remontée ». Une erreur PERDUE avant l'installation du
    // handler le rendait donc VERT — pour la mauvaise raison, en mesurant un
    // silence qu'il n'avait pas produit. Il vérifie désormais que l'erreur a
    // bien été levée, puis qu'elle n'est PAS remontée faute de client réel.
    await page.addInitScript(([k, t, lever]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
      window.__erreurLevee = false;
      window.addEventListener("error", function (e) {
        if (e && e.message && e.message.indexOf("erreur sans client reel") >= 0) window.__erreurLevee = true;
      });
      (0, eval)(lever)("erreur sans client reel");
    }, [GATE_KEY, GATE_TOKEN, "(" + LEVER_DANS_LA_FENETRE.toString() + ")"]);

    await page.goto("/index.html?monitoring=1");
    await page.waitForTimeout(6000);

    // Le SDK n'arrive jamais : l'erreur reste en file. Elle n'est pas remontée,
    // mais elle n'est pas non plus jetée dans un insert qui ne part nulle part —
    // et le stub, sollicité par `.insert(...).then(...)`, ne lève pas.
    expect(await page.evaluate(() => window.__erreurLevee === true),
      "la prémisse : l'erreur doit avoir été levée, sinon ce cas mesure un silence qu'il n'a pas produit").toBe(true);
    expect(await page.evaluate(() => window._supaReal === true), "pas de vrai client attendu").toBe(false);
    expect(envois.length, "aucune remontée sans client réel").toBe(0);
    const erreursJS = [];
    page.on("pageerror", (e) => erreursJS.push(e.message));
    await page.waitForTimeout(500);
    expect(erreursJS.filter((e) => /is not a function|Cannot read propert/.test(e)),
      "la remontée ne doit pas lever sur le stub").toEqual([]);
  });
});
