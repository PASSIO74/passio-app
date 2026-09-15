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
      window.__verdict = () => Promise.resolve({ data: { ok: true, piecesJointes: 0 }, error: null });
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
});
