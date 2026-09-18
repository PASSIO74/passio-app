// AUTH-05 / SUP-10 — « Compte supprimé » n'est annoncé que si le serveur l'a fait.
//
// LE DÉFAUT. `doDeleteAccount` (app-02) appelait l'Edge Function `delete-account`
// dans un `try {} catch {}` muet, puis déconnectait, purgeait l'appareil et
// affichait « Compte supprimé. Au revoir » — sans réseau, sur une erreur 500,
// sur une purge partielle. La suppression du compte Auth ne prouvait pas celle
// des données, et l'écran ne prouvait rien du tout.
//
// La fonction purge désormais, RELIT, et ne supprime le compte Auth que si rien
// ne reste (409 sinon, avec la liste). Ici : ① un verdict négatif n'annonce
// rien, ne purge rien localement, ne déconnecte pas (RÉINJECTION) ; ② une
// fonction injoignable non plus ; ③ un verdict positif fait tout.
// Aucune requête ne part : `supa.functions`, `supa.auth.signOut` et
// `supa.from` sont MUTÉS par `defineProperty` (en CI le vrai SDK expose des
// getters de prototype qu'une affectation ne masque pas).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

const FAUX_SUPA = `
window.__toasts = []; window.__signOut = 0; window.__invocations = [];
window._supaReal = true;
window.toast = function (t) { window.__toasts.push(String(t)); };
Object.defineProperty(window.supa, "functions", { configurable: true, writable: true,
  value: { invoke: function (nom) { window.__invocations.push(nom); return window.__verdict(); } } });
Object.defineProperty(window.supa, "auth", { configurable: true, writable: true,
  value: { signOut: function () { window.__signOut++; return Promise.resolve({ error: null }); },
           getSession: function () { return Promise.resolve({ data: { session: null } }); },
           onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; } } });
Object.defineProperty(window.supa, "from", { configurable: true, writable: true,
  value: function () { var b = { delete: function () { return b; }, eq: function () { return b; },
    then: function (a, c) { return Promise.resolve({ error: null }).then(a, c); } }; return b; } });
document.body.insertAdjacentHTML("beforeend", '<input id="deleteConfirmInput" value="SUPPRIMER">');
`;

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, FAUX_SUPA);
}


test.describe("AUTH-05 / SUP-10 — la suppression du compte attend le verdict", () => {
  test("① purge incomplète (409) : rien n'est annoncé, rien n'est purgé, pas de déconnexion", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__verdict = () => Promise.resolve({ data: { ok: false, restes: ["user_state:user_id=1"] }, error: { message: "409" } });
      const ok = await doDeleteAccount();
      return { ok, toasts: window.__toasts.slice(), signOut: window.__signOut, invocations: window.__invocations.slice(),
               etatLocal: localStorage.getItem(STATE_KEY) !== null, uidLocal: localStorage.getItem("passio_uid") };
    });
    expect(r.invocations).toEqual(["delete-account"]);
    // RÉINJECTION : sur le code d'avant, ok est undefined, « Compte supprimé » est affiché, signOut = 1, l'état local a disparu.
    expect(r.ok).toBe(false);
    expect(r.toasts.some((t) => /Compte supprimé/.test(t)), "jamais « Compte supprimé »").toBe(false);
    expect(r.toasts.some((t) => /n'a PAS été supprimé/.test(t)), "l'échec est dit, avec la marche à suivre").toBe(true);
    expect(r.signOut, "la session reste : la suppression est relançable").toBe(0);
    expect(r.etatLocal, "l'état local reste").toBe(true);
    expect(r.uidLocal).toBe(UID_MOI);
  });

  test("② fonction injoignable : même retenue", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__verdict = () => Promise.reject(new Error("Failed to fetch"));
      const ok = await doDeleteAccount();
      return { ok, toasts: window.__toasts.slice(), signOut: window.__signOut, etatLocal: localStorage.getItem(STATE_KEY) !== null };
    });
    expect(r.ok).toBe(false);
    expect(r.toasts.some((t) => /Compte supprimé/.test(t))).toBe(false);
    expect(r.signOut).toBe(0);
    expect(r.etatLocal).toBe(true);
  });

  test("③ verdict positif : déconnexion, purge locale, annonce", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      // ASTRA-42 (2026-09-15) : le succès porte `garantie: "barriere"` — sans lui, rien n'est annoncé (cas ⑥).
      window.__verdict = () => Promise.resolve({ data: { ok: true, garantie: "barriere", objets: 0 }, error: null });
      const ok = await doDeleteAccount();
      const clesPassio = Object.keys(localStorage).filter((k) => k.indexOf("passio") !== -1);
      return { ok, toasts: window.__toasts.slice(), signOut: window.__signOut, clesPassio };
    });
    expect(r.ok).toBe(true);
    expect(r.signOut).toBe(1);
    expect(r.clesPassio).toEqual([]);
    expect(r.toasts.some((t) => /Compte supprimé/.test(t))).toBe(true);
  });

  // ASTRA-12 (2026-09-15) : le client faisait onze `delete()` par RLS — les
  // messages compris — AVANT d'appeler la fonction, qui ne retrouvait donc plus
  // les pièces jointes à purger ; et un 409 laissait un compte à moitié vidé.
  // La purge est serveur : le client n'efface RIEN avant le verdict.
  test("④ aucune suppression côté client avant le verdict — la purge est serveur", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__deletes = [];
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true,
        value: function (table) { var b = { delete: function () { window.__deletes.push(table); return b; }, eq: function () { return b; },
          select: function () { return b; }, then: function (a, c) { return Promise.resolve({ data: [], error: null }).then(a, c); } }; return b; } });
      window.__verdict = () => Promise.resolve({ data: { ok: false, restes: ["conv_messages:from_id=3"] }, error: { message: "409" } });
      const ok = await doDeleteAccount();
      return { ok, deletes: window.__deletes.slice(), invocations: window.__invocations.slice() };
    });
    expect(r.invocations).toEqual(["delete-account"]);
    // RÉINJECTION : sur le code du 14/09, deletes = ["posts", "post_likes", …, "blocks"] (15 tables).
    expect(r.deletes, "le client ne supprime rien lui-même").toEqual([]);
    expect(r.ok).toBe(false);
  });
  test("⑤ SUP-10 : pendant la purge serveur, aucun état ne part ; après un refus, les écritures reprennent", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__ops = [];
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true,
        value: function (table) { var b = { delete: function () { return b; }, eq: function () { return b; }, select: function () { return b; }, upsert: function () { window.__ops.push(table); return b; }, insert: function () { window.__ops.push(table); return b; }, update: function () { window.__ops.push(table); return b; }, maybeSingle: function () { return Promise.resolve({ data: null, error: null }); },
          then: function (a, c) { return Promise.resolve({ data: [], error: null }).then(a, c); } }; return b; } });
      // La purge serveur dure 3 s ; PENDANT, l'app enregistre son état (comme
      // closeModal et le toast le font) : le debounce de 2,5 s tire au milieu.
      window.__verdict = () => new Promise((res) => setTimeout(() => res({ data: { ok: false, restes: ["user_state:user_id=1"] }, error: { message: "409" } }), 3000));
      const promesse = doDeleteAccount();
      await new Promise((r) => setTimeout(r, 200));
      const pendant = { gele: window._suppressionEnCours === true, peut: _peutPousserEtat() };
      saveState();
      await supaSaveUserState();
      await new Promise((r) => setTimeout(r, 2800));
      const ecrituresPendant = window.__ops.filter((t) => t === "user_state").length;
      const ok = await promesse;
      // Refus rendu : la main revient, l'état repart.
      const apres = { gele: window._suppressionEnCours === true, peut: _peutPousserEtat() };
      window.__ops = [];
      await supaSaveUserState();
      return { ok, pendant, ecrituresPendant, apres, ecrituresApres: window.__ops.filter((t) => t === "user_state").length };
    });
    expect(r.ok).toBe(false);
    // RÉINJECTION : sur le code d'avant, `gele` est false, `peut` true, et une écriture user_state part pendant la purge.
    expect(r.pendant).toEqual({ gele: true, peut: false });
    expect(r.ecrituresPendant, "aucun état ne part pendant la purge").toBe(0);
    expect(r.apres).toEqual({ gele: false, peut: true });
    expect(r.ecrituresApres, "après le refus, l'état repart").toBe(1);
  });

  // ═══ ASTRA-42 (cinquième contre-revue, 2026-09-15) : le contrat de réponse, jusqu'à l'interface ═══
  test("⑥ ASTRA-42 : `ok:true` SANS `garantie:\"barriere\"` n'est pas un succès — rien n'est annoncé, rien n'est purgé", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      // La forme de la v1 : une purge sans barrière qui répondait 200 { ok:true, objets:0 }.
      window.__verdict = () => Promise.resolve({ data: { ok: true, objets: 0 }, error: null });
      const ok = await doDeleteAccount();
      return { ok, toasts: window.__toasts.slice(), signOut: window.__signOut, etatLocal: localStorage.getItem(STATE_KEY) !== null };
    });
    expect(r.ok).toBe(false);
    expect(r.toasts.some((t) => /Compte supprimé/.test(t)), "un succès non garanti n'est pas annoncé").toBe(false);
    expect(r.signOut).toBe(0);
    expect(r.etatLocal).toBe(true);
  });

  test("⑦ ASTRA-42 : sur une réponse non-2xx le corps est lu dans `error.context`, et chaque code a son message", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      // supabase-js : non-2xx → { data: null, error: FunctionsHttpError } avec `error.context` = la Response.
      const reponse = (status, corps) => Promise.resolve({ data: null, error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code",
        context: { status, json: () => Promise.resolve(corps) } } });
      const cas = {};
      window.__verdict = () => reponse(503, { ok: false, code: "infrastructure_absente", error: "x" });
      cas.absente = { ok: await doDeleteAccount(), toasts: window.__toasts.splice(0) };
      window.__verdict = () => reponse(500, { ok: false, code: "auth_non_supprime", donnees_purgees: true, error: "x" });
      cas.auth = { ok: await doDeleteAccount(), toasts: window.__toasts.splice(0) };
      window.__verdict = () => reponse(409, { ok: false, code: "deja_en_cours", error: "x" });
      cas.enCours = { ok: await doDeleteAccount(), toasts: window.__toasts.splice(0) };
      window.__verdict = () => reponse(409, { ok: false, code: "incomplete", restes: ["user_state:user_id=1"], error: "x" });
      cas.restes = { ok: await doDeleteAccount(), toasts: window.__toasts.splice(0) };
      return { cas, signOut: window.__signOut, etatLocal: localStorage.getItem(STATE_KEY) !== null };
    });
    for (const k of Object.keys(r.cas)) expect(r.cas[k].ok, k).toBe(false);
    expect(r.cas.absente.toasts.some((t) => /indisponible pour le moment : rien n'a été supprimé/.test(t)), JSON.stringify(r.cas.absente.toasts)).toBe(true);
    expect(r.cas.auth.toasts.some((t) => /données ont été supprimées, mais la fermeture du compte a échoué/.test(t)), JSON.stringify(r.cas.auth.toasts)).toBe(true);
    expect(r.cas.enCours.toasts.some((t) => /déjà en cours/.test(t)), JSON.stringify(r.cas.enCours.toasts)).toBe(true);
    expect(r.cas.restes.toasts.some((t) => /n'a PAS été supprimé/.test(t)), JSON.stringify(r.cas.restes.toasts)).toBe(true);
    expect(r.signOut).toBe(0);
    expect(r.etatLocal).toBe(true);
  });

  // ═══ ASTRA-56 (sixième contre-revue, 2026-09-16) : le verdict honnête jusqu'à l'interface ═══
  test("⑧ ASTRA-56 : `finalisation_refusee` (Auth parti, marqueur non finalisé) — session fermée, local purgé, MAIS jamais « Compte supprimé »", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const reponse = (status, corps) => Promise.resolve({ data: null, error: { name: "FunctionsHttpError", message: "non-2xx",
        context: { status, json: () => Promise.resolve(corps) } } });
      window.__verdict = () => reponse(500, { ok: false, code: "finalisation_refusee", auth_supprimee: true, donnees_purgees: true, marqueur: "echec", protection: false, error: "x" });
      const ok = await doDeleteAccount();
      const clesPassio = Object.keys(localStorage).filter((k) => k.indexOf("passio") !== -1);
      return { ok, toasts: window.__toasts.slice(), signOut: window.__signOut, clesPassio };
    });
    // Le compte Auth n'existe plus : la session et le local partent (il n'y a plus rien à relancer)…
    expect(r.ok).toBe(true);
    expect(r.signOut).toBe(1);
    expect(r.clesPassio).toEqual([]);
    // …mais le succès garanti n'est PAS annoncé : l'état réel est dit, avec le contact.
    expect(r.toasts.some((t) => /^Compte supprimé/.test(t)), "jamais « Compte supprimé » sans garantie").toBe(false);
    expect(r.toasts.some((t) => /confirmation finale n'a pas pu être enregistrée/.test(t)), JSON.stringify(r.toasts)).toBe(true);
  });

  test("⑨ ASTRA-56 : une reprise arrêtée après une purge antérieure ne dit plus « rien n'a été supprimé »", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const reponse = (status, corps) => Promise.resolve({ data: null, error: { name: "FunctionsHttpError", message: "non-2xx",
        context: { status, json: () => Promise.resolve(corps) } } });
      window.__verdict = () => reponse(409, { ok: false, code: "en_vol", donnees_purgees: true, barriere: "conservee", marqueur: "purgee", error: "x" });
      const ok = await doDeleteAccount();
      return { ok, toasts: window.__toasts.slice(), signOut: window.__signOut, etatLocal: localStorage.getItem(STATE_KEY) !== null };
    });
    expect(r.ok).toBe(false);
    expect(r.signOut).toBe(0);
    expect(r.etatLocal).toBe(true);
    expect(r.toasts.some((t) => /rien n'a été supprimé/.test(t)), "faux : les données sont parties").toBe(false);
    expect(r.toasts.some((t) => /déjà été supprimées/.test(t)), JSON.stringify(r.toasts)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LOT E (E-T2, 2026-09-18) — LA CHAÎNE RGPD PARLE AU PILOTAGE
//
// `doDeleteAccount` n'avait ni flow ni action : seul `diagLog`. Désormais
// `tel.flowStart("delete_account")` s'ouvre juste avant l'appel et
// `tel.settle(cid, "saved", okServeur, {message: code, code})` se règle sur le
// VERDICT lu (le `code` serveur devient `rc`, jamais le message qui cite
// l'adresse de contact) ; puis `tel.flush({keepalive:true})` AVANT la purge
// locale — sinon le lot part dans un `localStorage` déjà vidé.
// Le contrat serveur (dashboard/test/traces.test.js) exige ce `saved` ; ici on
// prouve que l'APP l'émet. `?telemetry=1` est OBLIGATOIRE : sans lui
// `flowStart` rend null et le banc mesurerait le vide.
// Les trois méthodes sont capturées À LA SOURCE : `settle` appelle `this.step`
// puis `this.flowEnd` ; `flush` est remplacé (rien ne part, la route est
// coupée de toute façon) et note si le local est ENCORE là à l'instant de l'appel.
// ═══════════════════════════════════════════════════════════════════════════
async function bancTel(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true, query: "?telemetry=1" });
  await page.evaluate((s) => { eval(s); }, FAUX_SUPA);
  await page.evaluate(() => {
    window.__flow = []; window.__flush = [];
    const vraiStart = window.tel.flowStart;
    window.tel.flowStart = function (action, meta) {
      const cid = vraiStart.call(window.tel, action, meta);
      window.__flow.push({ etape: "start", cid, action, meta: meta || {} });
      return cid;
    };
    window.tel.step = function (cid, key, status, meta) { window.__flow.push({ etape: "step", cid, key, status, meta: meta || null }); };
    window.tel.flowEnd = function (cid, status) { window.__flow.push({ etape: "end", cid, status }); };
    window.tel.flush = function (opts) {
      window.__flush.push({ keepalive: !!(opts && opts.keepalive),
        localEncoreLa: Object.keys(localStorage).some((k) => k.indexOf("passio") !== -1) });
    };
  });
}
const flowDe = (page) => page.evaluate(() => ({ flow: window.__flow.splice(0), flush: window.__flush.splice(0) }));
// La forme supabase-js d'une réponse non-2xx : le corps est dans `error.context`.
const REPONSE = `(status, corps) => Promise.resolve({ data: null, error: { name: "FunctionsHttpError", message: "non-2xx",
  context: { status, json: () => Promise.resolve(corps) } } })`;
// Un flow complet et cohérent : start → step saved → end, TOUS sur le même cid.
function chaineDelete(evs) {
  expect(evs.map((e) => e.etape)).toEqual(["start", "step", "end"]);
  expect(evs[0].action).toBe("delete_account");
  expect(evs[0].cid).toMatch(/^fl_/);
  expect(evs[1].cid).toBe(evs[0].cid);
  expect(evs[2].cid).toBe(evs[0].cid);
  expect(evs[1].key).toBe("saved");
  return evs;
}

test.describe("Télémétrie — delete_account réglé au verdict serveur (LOT E)", () => {

  // MUTATION : retirer `tel.flowStart("delete_account")` → aucun flow (rouge) ;
  // retirer `tel.settle(_delCid, "saved", …)` → start seul (rouge) ; retirer
  // `tel.flush({ keepalive: true })` → __flush vide (rouge) ; déplacer le flush
  // après la purge locale → localEncoreLa false (rouge).
  test("⑩ succès garanti : start → saved ok → end ok, même cid ; flush keepalive AVANT la purge locale", async ({ page }) => {
    await bancTel(page);
    const r = await page.evaluate(async () => {
      window.__verdict = () => Promise.resolve({ data: { ok: true, garantie: "barriere", objets: 0 }, error: null });
      const ok = await doDeleteAccount();
      return { ok, clesPassio: Object.keys(localStorage).filter((k) => k.indexOf("passio") !== -1) };
    });
    const { flow, flush } = await flowDe(page);
    expect(r.ok).toBe(true);
    const evs = chaineDelete(flow);
    expect(evs[1].status).toBe("ok");
    expect(evs[1].meta).toBeNull();
    expect(evs[2].status).toBe("ok");
    expect(flush).toEqual([{ keepalive: true, localEncoreLa: true }]);
    expect(r.clesPassio, "la purge locale a bien eu lieu — APRÈS le flush").toEqual([]);
  });

  // MUTATION : `okServeur ? null : { message: _delCode, code: _delCode }` → `null`
  // → saved error sans rc (rouge) ; settle avec `corps.error` (le message) → detail
  // non fermé (rouge).
  test("⑪ refus serveur : saved en ÉCHEC avec rc = code fermé (en_vol), end error ; fonction injoignable : rc=sans_verdict", async ({ page }) => {
    await bancTel(page);
    const enVol = await page.evaluate(async (rep) => {
      const reponse = eval(rep);
      window.__verdict = () => reponse(409, { ok: false, code: "en_vol", error: "ecris a contact@exemple.test" });
      return { ok: await doDeleteAccount(), etatLocal: localStorage.getItem(STATE_KEY) !== null };
    }, REPONSE);
    let { flow } = await flowDe(page);
    expect(enVol.ok).toBe(false);
    expect(enVol.etatLocal, "un refus ne purge rien").toBe(true);
    let evs = chaineDelete(flow);
    expect(evs[1].status).toBe("error");
    // settle mappe message→detail et code→rc : le CODE fermé, jamais `corps.error`.
    expect(evs[1].meta).toEqual({ detail: "en_vol", rc: "en_vol" });
    expect(evs[2].status).toBe("error");

    const reseau = await page.evaluate(async () => {
      window.__verdict = () => Promise.reject(new Error("Failed to fetch"));
      return { ok: await doDeleteAccount() };
    });
    ({ flow } = await flowDe(page));
    expect(reseau.ok).toBe(false);
    evs = chaineDelete(flow);
    expect(evs[1].status).toBe("error");
    expect(evs[1].meta).toEqual({ detail: "sans_verdict", rc: "sans_verdict" });
  });

  // MUTATION : `okServeur` remplacé par `okServeur || compteFermeSansGarantie`
  // dans le settle → saved ok (rouge) : une fermeture SANS garantie sonne comme
  // un échec, pour être relue par un humain. Mutation telemetry.js :
  // `slice(0, 40)` → `slice(0, 20)` sur rc → « infrastructure_absen » (rouge).
  test("⑫ finalisation_refusee : compte fermé MAIS saved error rc=finalisation_refusee, flush avant purge ; rc jamais amputé (infrastructure_absente)", async ({ page }) => {
    await bancTel(page);
    const absente = await page.evaluate(async (rep) => {
      const reponse = eval(rep);
      window.__verdict = () => reponse(503, { ok: false, code: "infrastructure_absente", error: "x" });
      return { ok: await doDeleteAccount() };
    }, REPONSE);
    let { flow } = await flowDe(page);
    expect(absente.ok).toBe(false);
    let evs = chaineDelete(flow);
    expect(evs[1].meta).toEqual({ detail: "infrastructure_absente", rc: "infrastructure_absente" });

    const fin = await page.evaluate(async (rep) => {
      const reponse = eval(rep);
      window.__verdict = () => reponse(500, { ok: false, code: "finalisation_refusee", auth_supprimee: true, donnees_purgees: true, marqueur: "echec", protection: false, error: "x" });
      const ok = await doDeleteAccount();
      return { ok, clesPassio: Object.keys(localStorage).filter((k) => k.indexOf("passio") !== -1) };
    }, REPONSE);
    const apres = await flowDe(page);
    expect(fin.ok).toBe(true);
    expect(fin.clesPassio).toEqual([]);
    evs = chaineDelete(apres.flow);
    expect(evs[1].status).toBe("error");
    expect(evs[1].meta).toEqual({ detail: "finalisation_refusee", rc: "finalisation_refusee" });
    expect(evs[2].status).toBe("error");
    expect(apres.flush).toEqual([{ keepalive: true, localEncoreLa: true }]);
  });
});
