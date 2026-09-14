// CONT-02 / ROB-01 — une publication qui n'est pas partie est REJOUÉE, pas oubliée.
//
// LE DÉFAUT. `syncStatus` était posé à "syncing" à la création et jamais mis à
// jour ; après le dernier essai de `supaPublishPostWithRetry`, l'échec restait
// dans la console. La publication vivait sur cet appareil seulement (« Post en
// local »), et rien ne la renvoyait : ni au retour du réseau, ni au prochain
// lancement. Seules les bobines avaient un minuteur, en mémoire, perdu au
// rechargement.
//
// Ce que cette suite exige :
//   ① l'échec transitoire est ÉCRIT sur la publication ("offline") et persisté
//     (RÉINJECTION : rouge sur le code d'avant — syncStatus restait "syncing") ;
//   ② la file la rejoue et la marque "synced" quand le serveur l'accepte
//     (RÉINJECTION : `_rejouerPublicationsEnAttente` n'existait pas) ;
//   ③ elle survit à un RECHARGEMENT : l'envoi repart au lancement suivant ;
//   ④ un refus définitif (passion inconnue) n'est PAS rejoué ("refusee") ;
//   ⑤ un média absent de cet appareil n'est jamais inséré sans média ("perdue") ;
//   ⑥ la publication d'un AUTRE compte n'est jamais publiée sous le mien.
// Aucune requête ne part : `window.supa.from` est muté (jamais remplacé) et
// `window.__posts` dicte la réponse de l'INSERT sur `posts`.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_AUTRE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const FAUX_SUPA = `
// bootOnboarded neutralise supaPublishPostWithRetry : on remet la vraie
// fonction, c'est elle qui est sous test (le client, lui, reste factice).
if (window.__vraiSupaPublishPost) window.supaPublishPostWithRetry = window.__vraiSupaPublishPost;
window.__ecrits = []; window.__toasts = [];
window._supaReal = true;
window.toast = function (t) { window.__toasts.push(String(t)); };
window.supaEnsureProfileExists = async function () { return true; };
window.supaUploadMedia = async function (id, folder) { return "https://storage.test/" + folder + "/" + id; };
Object.defineProperty(window.supa, "from", {
  configurable: true, writable: true,
  value: function (table) {
    return {
      insert: function (rows) {
        window.__ecrits.push({ table: table, row: rows[0] });
        var res = table === "posts" ? (window.__posts || { data: rows, error: null }) : { data: rows, error: null };
        return { select: function () { return Promise.resolve(res); }, then: function (a, c) { return Promise.resolve(res).then(a, c); } };
      },
      select: function () { var b = { eq: function () { return b; }, in: function () { return b; }, limit: function () { return b; }, order: function () { return b; }, range: function () { return b; },
        maybeSingle: function () { return Promise.resolve({ data: null, error: null }); }, then: function (a, c) { return Promise.resolve({ data: [], error: null }).then(a, c); } }; return b; },
      update: function () { var b = { eq: function () { return b; }, select: function () { return b; }, then: function (a, c) { return Promise.resolve({ data: [], error: null }).then(a, c); } }; return b; },
      upsert: function () { return Promise.resolve({ error: null }); },
      delete: function () { var b = { eq: function () { return b; }, then: function (a, c) { return Promise.resolve({ data: [], error: null }).then(a, c); } }; return b; },
    };
  }
});
`;

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(FAUX_SUPA);
}
const post = (id, extra) => Object.assign({ id, authorId: UID_MOI, passion: "musique", mood: "all", type: "text", text: "hello " + id, createdAt: Date.now(), likes: 0, comments: [], syncStatus: "syncing" }, extra || {});
const inserts = (page) => page.evaluate(() => window.__ecrits.filter((e) => e.table === "posts").map((e) => e.row.id));
const statut = (page, id) => page.evaluate((id) => (state.userPosts.find((p) => p.id === id) || {}).syncStatus || null, id);
const statutPersiste = (page, id) => page.evaluate((id) => {
  const s = JSON.parse(localStorage.getItem("passio_mvp_state_v1") || "{}");
  return ((s.userPosts || []).find((p) => p.id === id) || {}).syncStatus || null;
}, id);

test.describe("CONT-02 / ROB-01 — file de renvoi des publications", () => {
  test("① l'échec transitoire est écrit sur la publication et persisté", async ({ page }) => {
    await banc(page);
    const ok = await page.evaluate(async (p) => {
      window.__posts = { data: null, error: { message: "TypeError: Failed to fetch" } };
      state.userPosts.unshift(p);
      const ok = await supaPublishPostWithRetry(p);
      saveStateNow();
      return ok;
    }, post("p1"));
    expect(ok).toBe(false);
    // RÉINJECTION : sur le code d'avant, syncStatus reste "syncing" à jamais.
    expect(await statut(page, "p1")).toBe("offline");
    expect(await statutPersiste(page, "p1")).toBe("offline");
    expect(await page.evaluate(() => !!window._reelRetryTimer), "un renvoi est planifié").toBe(true);
  });

  test("② la file rejoue et marque « synced » quand le serveur accepte", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (p) => {
      state.userPosts.unshift(Object.assign(p, { syncStatus: "offline" }));
      window.__posts = null; window.__toasts = [];
      // RÉINJECTION : `_rejouerPublicationsEnAttente` n'existe pas sur le code d'avant.
      const n = await _rejouerPublicationsEnAttente();
      return { n, toasts: window.__toasts.slice() };
    }, post("p2"));
    expect(r.n).toBe(1);
    expect(await inserts(page)).toEqual(["p2"]);
    expect(await statut(page, "p2")).toBe("synced");
    expect(r.toasts.some((t) => /Publication envoyée/.test(t))).toBe(true);
    // Un second passage n'a plus rien à envoyer : pas de double insert.
    expect(await page.evaluate(() => _rejouerPublicationsEnAttente())).toBe(0);
    expect(await inserts(page)).toEqual(["p2"]);
  });

  test("③ la publication en attente survit au rechargement et repart au lancement", async ({ page }) => {
    await banc(page);
    await page.evaluate((p) => { state.userPosts.unshift(Object.assign(p, { syncStatus: "offline" })); saveStateNow(); }, post("p3"));
    // Un envoi interrompu par la fermeture (encore "syncing", antérieur à la page) repart aussi.
    await page.evaluate((p) => { state.userPosts.unshift(Object.assign(p, { createdAt: Date.now() - 60000 })); saveStateNow(); }, post("p3bis"));
    await page.reload();
    await page.waitForFunction(() => typeof _rejouerPublicationsEnAttente === "function" && window.supa && typeof state !== "undefined" && state.userPosts && typeof MY_UID !== "undefined" && MY_UID);
    await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); });
    await page.evaluate(FAUX_SUPA);
    expect(await statutPersiste(page, "p3")).toBe("offline");
    // Le lancement rejoue de lui-même (minuteur d'amorçage ~6 s).
    await page.waitForFunction(() => window.__ecrits.filter((e) => e.table === "posts").length >= 2, null, { timeout: 15000 });
    expect((await inserts(page)).sort()).toEqual(["p3", "p3bis"]);
    expect(await statut(page, "p3")).toBe("synced");
    expect(await statut(page, "p3bis")).toBe("synced");
  });

  test("④ un refus définitif (passion inconnue) n'est pas rejoué", async ({ page }) => {
    await banc(page);
    await page.evaluate(async (p) => { state.userPosts.unshift(p); await supaPublishPostWithRetry(p); }, post("p4", { passion: "ma-passion-perso" }));
    expect(await statut(page, "p4")).toBe("refusee");
    expect(await inserts(page)).toEqual([]);
    expect(await page.evaluate(() => _rejouerPublicationsEnAttente())).toBe(0);
    expect(await inserts(page)).toEqual([]);
  });

  test("⑤ un média absent de cet appareil n'est jamais inséré sans média", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (p) => {
      state.userPosts.unshift(Object.assign(p, { syncStatus: "offline" }));
      window.__toasts = [];
      const n = await _rejouerPublicationsEnAttente();
      return { n, toasts: window.__toasts.slice() };
    }, post("p5", { type: "photo", image: null }));
    expect(r.n).toBe(0);
    expect(await inserts(page)).toEqual([]);
    expect(await statut(page, "p5")).toBe("perdue");
    expect(r.toasts.some((t) => /média/.test(t))).toBe(true);
  });

  test("⑥ la publication d'un autre compte n'est jamais publiée sous le mien", async ({ page }) => {
    await banc(page);
    const n = await page.evaluate(async (p) => { state.userPosts.unshift(Object.assign(p, { syncStatus: "offline" })); return _rejouerPublicationsEnAttente(); }, post("p6", { authorId: UID_AUTRE }));
    expect(n).toBe(0);
    expect(await inserts(page)).toEqual([]);
    expect(await statut(page, "p6")).toBe("offline");
  });
});
