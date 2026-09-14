// MOD-04 — « bloqué » n'est annoncé que si le serveur l'a écrit.
//
// LE DÉFAUT. `blockUser` posait l'id dans `state.user.blocked`, appelait
// `supaBlockUser` SANS attendre ni lire son verdict, et affichait « bloqué ».
// Or c'est la ligne `blocks` qui fait TOUT ce que bloquer promet (six policies
// d'insertion, la sonnerie, `notify-call`). Un refus — RLS, réseau, session
// expirée — laissait un blocage purement local : l'autre continuait d'écrire,
// de commenter, d'appeler, pendant que l'écran disait le contraire, et l'état
// local survivait à la réhydratation. Même famille que « signalement envoyé »
// annoncé sans écriture (2026-09-10).
//
// Ce que cette suite exige : un refus serveur ANNULE l'affichage optimiste et le
// dit (① — RÉINJECTION, rouge sur le code d'avant), un succès ou un doublon
// l'annoncent (② ③), le déblocage a le même contrat (④), et sans compte réel
// l'action reste locale et le dit (⑤).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LUI = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// Faux client : `window.__blocs` dicte la réponse de l'INSERT sur `blocks` ;
// tout le reste (follows, delete) réussit. Mutation de `window.supa.from`, jamais
// remplacement (en CI le vrai SDK se charge avec des getters de prototype).
const FAUX_SUPA = `
window.__ecrits = [];
window.__toasts = [];
window._supaReal = true;
window.toast = function (t) { window.__toasts.push(String(t)); };
function __chaine(res) {
  var b = { select: function () { return b; }, eq: function () { return b; }, in: function () { return b; }, limit: function () { return b; },
            maybeSingle: function () { return Promise.resolve(res); }, then: function (a, c) { return Promise.resolve(res).then(a, c); } };
  return b;
}
Object.defineProperty(window.supa, "from", {
  configurable: true, writable: true,
  value: function (table) {
    return {
      insert: function (row) { window.__ecrits.push({ table: table, op: "insert", row: row });
        return Promise.resolve(table === "blocks" ? (window.__blocs || { error: null }) : { error: null }); },
      delete: function () { window.__ecrits.push({ table: table, op: "delete" });
        return __chaine(table === "blocks" ? (window.__deblocs || { data: [{ blocked_id: "x" }], error: null }) : { data: [], error: null }); },
      select: function () { return __chaine({ data: [], error: null }); },
    };
  },
});
`;

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, FAUX_SUPA);
  expect(await page.evaluate(() => MY_UID)).toBe(UID_MOI);
}

test.describe("MOD-04 — le blocage attend le verdict du serveur", () => {
  test("① refus serveur : l'affichage optimiste est ANNULÉ et l'échec est dit", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (lui) => {
      state.user.blocked = []; state.user.following = [lui]; saveState();
      window.__blocs = { status: 403, error: { code: "42501", message: "new row violates row-level security policy" } };
      const ok = await blockUser(lui, "Léa");
      return { ok, blocked: state.user.blocked.slice(), following: state.user.following.slice(), toasts: window.__toasts.slice(),
               estBloque: isBlocked(lui), persist: (JSON.parse(localStorage.getItem(STATE_KEY)).user.blocked || []) };
    }, UID_LUI);
    // RÉINJECTION : sur le code d'avant, ok est undefined, blocked contient l'id, le toast dit « bloqué ».
    expect(r.ok).toBe(false);
    expect(r.blocked).toEqual([]);
    expect(r.estBloque).toBe(false);
    expect(r.persist, "rien de persisté non plus").toEqual([]);
    expect(r.following, "l'abonnement retiré en optimiste est rendu").toEqual([UID_LUI]);
    expect(r.toasts.some((t) => /non enregistré/.test(t)), "l'échec est annoncé").toBe(true);
    expect(r.toasts.some((t) => /Léa bloqué$/.test(t)), "et jamais « bloqué »").toBe(false);
  });

  test("② succès serveur : bloqué, désabonné, annoncé", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (lui) => {
      state.user.blocked = []; state.user.following = [lui]; saveState();
      window.__blocs = { error: null };
      const ok = await blockUser(lui, "Léa");
      return { ok, blocked: state.user.blocked.slice(), following: state.user.following.slice(), toasts: window.__toasts.slice(),
               ecrits: window.__ecrits.filter((e) => e.table === "blocks" && e.op === "insert").map((e) => e.row.blocked_id) };
    }, UID_LUI);
    expect(r.ok).toBe(true);
    expect(r.blocked).toEqual([UID_LUI]);
    expect(r.following).toEqual([]);
    expect(r.ecrits).toEqual([UID_LUI]);
    expect(r.toasts.some((t) => /Léa bloqué$/.test(t))).toBe(true);
  });

  test("③ doublon (déjà bloqué côté serveur) : l'état voulu est atteint, c'est un succès", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (lui) => {
      state.user.blocked = []; saveState();
      window.__blocs = { error: { code: "23505", message: "duplicate key" } };
      const ok = await blockUser(lui, "Léa");
      return { ok, blocked: state.user.blocked.slice() };
    }, UID_LUI);
    expect(r.ok).toBe(true);
    expect(r.blocked).toEqual([UID_LUI]);
  });

  test("④ déblocage refusé : l'id RESTE bloqué, l'échec est dit", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (lui) => {
      state.user.blocked = [lui]; saveState();
      window.__deblocs = { status: 403, error: { code: "42501", message: "refus" } };
      const ok = await unblockUser(lui, "Léa");
      const r1 = { ok, blocked: state.user.blocked.slice(), toasts: window.__toasts.slice() };
      window.__toasts = [];
      window.__deblocs = { data: [{ blocked_id: lui }], error: null };
      const ok2 = await unblockUser(lui, "Léa");
      return { r1, ok2, blocked2: state.user.blocked.slice(), toasts2: window.__toasts.slice() };
    }, UID_LUI);
    expect(r.r1.ok).toBe(false);
    expect(r.r1.blocked).toEqual([UID_LUI]);
    expect(r.r1.toasts.some((t) => /non enregistré/.test(t))).toBe(true);
    expect(r.ok2).toBe(true);
    expect(r.blocked2).toEqual([]);
    expect(r.toasts2.some((t) => /Léa débloqué$/.test(t))).toBe(true);
  });

  test("⑤ sans compte réel : le blocage reste local, et le dit", async ({ page }) => {
    await page.route(/supabase\.co/, (route) => route.abort());
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true }); // MY_UID = u_<aléatoire>
    await page.evaluate((s) => { eval(s); }, FAUX_SUPA);
    const r = await page.evaluate(async (lui) => {
      state.user.blocked = []; saveState();
      const ok = await blockUser(lui, "Léa");
      return { uid: MY_UID, ok, blocked: state.user.blocked.slice(), toasts: window.__toasts.slice(),
               ecrits: window.__ecrits.filter((e) => e.table === "blocks").length };
    }, UID_LUI);
    expect(r.uid).toMatch(/^u_/);
    expect(r.ok).toBe(true);
    expect(r.blocked).toEqual([UID_LUI]);
    expect(r.ecrits, "aucune écriture sous une identité qui n'existe pas").toBe(0);
    expect(r.toasts.some((t) => /sur cet appareil/.test(t))).toBe(true);
  });
});
