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
});
