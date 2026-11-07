// ═════════════════════════════════════════════════
// AUDIT DE SÉCURITÉ 2026-11-06 — CE QUE L'APPAREIL GARDE D'UN COMPTE QUI S'EN VA
//
// ① Une suppression de compte confirmée ne laisse rien se réécrire au déchargement :
//    `purgeAccountScopedData` n'était appelée que par `doLogout`, et le verrou de purge
//    restait baissé ici — `beforeunload` remettait les conversations sur l'appareil.
// ② La déconnexion retire l'abonnement push de CET appareil : sinon les notifications
//    du compte quitté continuent d'arriver, y compris sous le compte suivant.
// ③ Une déconnexion hors ligne désabonne quand même le navigateur.
// ④ Les clés locales qui portent des données de la personne partent avec le compte.
// Aucune requête ne part : tout Supabase est mué (voir suppression-compte-verdict).
// ═════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

const FAUX_SUPA = `
window.__toasts = []; window.__signOut = 0; window.__invocations = []; window.__supprimes = [];
window._supaReal = true;
window.toast = function (t) { window.__toasts.push(String(t)); };
Object.defineProperty(window.supa, "functions", { configurable: true, writable: true,
  value: { invoke: function (nom) { window.__invocations.push(nom); return window.__verdict(); } } });
Object.defineProperty(window.supa, "auth", { configurable: true, writable: true,
  value: { signOut: function () { window.__signOut++; window.__ordre.push("signOut"); return Promise.resolve({ error: null }); },
           getSession: function () { return Promise.resolve({ data: { session: null } }); },
           onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; } } });
Object.defineProperty(window.supa, "from", { configurable: true, writable: true,
  value: function (table) {
    var b = {
      delete: function () { window.__ordre.push("delete:" + table); return b; },
      eq: function (col, val) { window.__supprimes.push(table + ":" + col + "=" + val); return b; },
      upsert: function () { return b; }, select: function () { return b; }, update: function () { return b; },
      then: function (a, c) {
        if (table === "push_subscriptions" && window.__pushHorsLigne) return Promise.reject(new Error("réseau")).then(a, c);
        return Promise.resolve({ error: null }).then(a, c);
      },
    };
    return b;
  } });
window.__ordre = [];
window.__sub = { endpoint: "https://fcm.googleapis.com/fcm/send/banc", desabonne: 0,
  unsubscribe: function () { this.desabonne++; window.__ordre.push("unsubscribe"); return Promise.resolve(true); } };
Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {
  getRegistration: function () { return Promise.resolve({ pushManager: { getSubscription: function () { return Promise.resolve(window.__sub); } } }); },
  addEventListener: function () {}, removeEventListener: function () {}, ready: new Promise(function () {}),
} });
document.body.insertAdjacentHTML("beforeend", '<input id="deleteConfirmInput" value="SUPPRIMER">');
`;

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, FAUX_SUPA);
}

test.describe("Audit 2026-11-06 — ce que l'appareil garde d'un compte qui s'en va", () => {
  test("① après une suppression confirmée, les conversations ne reviennent pas au déchargement", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      conversationsState = [{ id: "c_banc", userId: "autre", messages: [{ id: "m1", text: "texte privé", at: Date.now() }] }];
      saveConversationsNow();
      const avant = localStorage.getItem("passio_conversations_v1");
      // Ce que `supaInit` branche pour tout compte connecté (app-08) ; ce banc ne passe pas par lui.
      window.addEventListener("beforeunload", saveConversationsNow, { once: false });
      window.__verdict = () => Promise.resolve({ data: { ok: true, garantie: "barriere" }, error: null });
      const ok = await doDeleteAccount();
      // Ce que le navigateur fait juste avant le rechargement annoncé.
      window.dispatchEvent(new Event("beforeunload"));
      window.dispatchEvent(new Event("pagehide"));
      const idb = typeof idbConvLoad === "function" ? await idbConvLoad() : [];
      return {
        ok, avant: !!avant,
        apres: localStorage.getItem("passio_conversations_v1"),
        idb: (idb || []).length,
        etat: localStorage.getItem("passio_mvp_state_v1"),
      };
    });
    expect(r.ok).toBe(true);
    expect(r.avant).toBe(true);
    expect(r.apres).toBeNull();
    expect(r.idb).toBe(0);
    expect(r.etat).toBeNull();
  });

  test("② la déconnexion retire l'abonnement push, avant de fermer la session", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      await doLogout();
      return { desabonne: window.__sub.desabonne, supprimes: window.__supprimes, ordre: window.__ordre };
    });
    expect(r.desabonne).toBe(1);
    expect(r.supprimes).toContain("push_subscriptions:endpoint=https://fcm.googleapis.com/fcm/send/banc");
    // Le DELETE a besoin du jeton : il part avant `signOut`.
    expect(r.ordre.indexOf("delete:push_subscriptions")).toBeLessThan(r.ordre.indexOf("signOut"));
  });

  test("③ hors ligne, le navigateur se désabonne quand même et la déconnexion aboutit", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__pushHorsLigne = true;
      await doLogout();
      return { desabonne: window.__sub.desabonne, signOut: window.__signOut };
    });
    expect(r.desabonne).toBe(1);
    expect(r.signOut).toBe(1);
  });

  test("⑤ le serveur demande une connexion récente : rien n'est purgé, la personne est renvoyée se connecter", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      conversationsState = [{ id: "c_banc", userId: "autre", messages: [{ id: "m1", text: "à garder", at: Date.now() }] }];
      saveConversationsNow();
      window.doLogout = function () { window.__logout = true; };
      const refus = () => ({ data: null, error: { message: "non-2xx", context: new Response(JSON.stringify({ ok: false, code: "reauth_requise", message: "Par sécurité, reconnecte-toi, puis recommence." }), { status: 403 }) } });
      window.__verdict = () => Promise.resolve(refus());
      const ok = await doDeleteAccount();
      const sur_le_moment = { ok, garde: !!localStorage.getItem("passio_conversations_v1"), verrou: window._suppressionEnCours, signOut: window.__signOut, toasts: window.__toasts };
      await new Promise((f) => setTimeout(f, 2000));
      return { ...sur_le_moment, logout: window.__logout === true };
    });
    expect(r.ok).toBe(false);
    expect(r.logout, "renvoyée vers la connexion").toBe(true);
    expect(r.garde).toBe(true);
    expect(r.verrou).toBe(false);
    expect(r.signOut).toBe(0);
    expect(r.toasts.join(" ")).toContain("reconnecte-toi");
  });

  test("⑥ une déconnexion dans un autre onglet coupe l'écriture ici, puis recharge", async ({ context }) => {
    const p1 = await context.newPage();
    const p2 = await context.newPage();
    for (const p of [p1, p2]) { await p.route(/supabase\.co/, (route) => route.abort()); await bootOnboarded(p, null, 1, { sansIsolationDesDonnees: true }); }
    // Un écouteur posé après celui de l'application, donc servi après lui : il note le verrou avant le rechargement.
    await p2.evaluate(() => {
      window.__marque = 1;
      window.addEventListener("storage", () => { sessionStorage.setItem("banc_verrou", String(_accountPurged)); });
    });
    // Une autre clé ne dit rien d'une sortie : ni verrou, ni rechargement.
    await p1.evaluate(() => { localStorage.setItem("passio_cle_banale", "x"); });
    await p2.waitForTimeout(300);
    expect(await p2.evaluate(() => ({ marque: window.__marque, verrou: _accountPurged }))).toEqual({ marque: 1, verrou: false });
    const recharge = p2.waitForEvent("load");
    await p1.evaluate(() => { localStorage.removeItem(STATE_KEY); });
    await recharge;
    expect(await p2.evaluate(() => window.__marque)).toBeUndefined();
    expect(await p2.evaluate(() => sessionStorage.getItem("banc_verrou")), "le verrou est posé avant le rechargement").toBe("true");
  });

  test("⑦ un délai borne une requête qui ne répond jamais, et c'est une panne réseau", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const avant = window.fetch;
      window.fetch = (u, o) => new Promise((_, ko) => o.signal.addEventListener("abort", () => ko(o.signal.reason)));
      let e = null;
      try { await _fetchBorne("https://x.supabase.co/rest/v1/posts", {}, 30); } catch (err) { e = err; }
      // Le signal de l'appelant reste entendu.
      const appelant = new AbortController();
      let annule = null;
      const enCours = _fetchBorne("https://x.supabase.co/rest/v1/posts", { signal: appelant.signal }, 60000).catch((err) => { annule = err; });
      appelant.abort();
      await enCours;
      window.fetch = avant;
      const source = await (await fetch("/js/app-08-ui-modals-tour.js")).text();
      return { leve: !!e, nom: e && e.name, reseau: estEchecReseau(e), annule: !!annule,
        branche: source.includes("createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: _fetchBorne } })"),
        court: _delaiFetch("https://x.supabase.co/rest/v1/posts", {}), fonction: _delaiFetch("https://x.supabase.co/functions/v1/delete-account", { body: "{}" }),
        depot: _delaiFetch("https://x.supabase.co/storage/v1/object/x", { body: new Blob(["x"]) }) };
    });
    expect(r.leve).toBe(true);
    expect(r.nom, "le SDK ne rejoue pas une AbortError").toBe("AbortError");
    expect(r.reseau).toBe(true);
    expect(r.annule).toBe(true);
    expect(r.branche, "le client réel passe par cette fonction").toBe(true);
    expect(r.court).toBe(30000);
    expect(r.fonction).toBe(120000);
    expect(r.depot, "un dépôt garde ses 15 minutes").toBe(900000);
  });

  test("⑧ un nom réservé par le serveur est refusé à l'écran, sans fausse alerte sur les autres", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(() => ({
      refuses: ["Admin", "Support Passio", "modérateur", "SÉCURITÉ"].map((n) => nomCompteValide(n)),
      acceptes: ["Adminou", "admin_test", "Passionné", "Benjamin"].map((n) => nomCompteValide(n)),
    }));
    expect(r.refuses).toEqual(["", "", "", ""]);
    expect(r.acceptes).toEqual(["Adminou", "admin_test", "Passionné", "Benjamin"]);
  });

  test("④ les clés locales qui portent des lieux ou des choix de la personne sont purgées", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const cles = ["passio_geo_cache_v1", "passio_passions_demandes", "passio_passions_recentes", "passio_rappels_proposes_v1"];
      cles.forEach((k) => localStorage.setItem(k, "banc"));
      localStorage.setItem("passio_device_id", "appareil");
      await purgeAccountScopedData();
      return { restent: cles.filter((k) => localStorage.getItem(k) !== null), appareil: localStorage.getItem("passio_device_id") };
    });
    expect(r.restent).toEqual([]);
    // Une clé d'appareil n'appartient à aucun compte : elle reste.
    expect(r.appareil).toBe("appareil");
  });
});
