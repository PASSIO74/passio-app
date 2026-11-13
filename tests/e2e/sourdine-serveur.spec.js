// ═══════════════════════════════════════════════════════════════════════════
// MSG-C02, VOLET SERVEUR (audit UX/UI du 2026-11-10) — la sourdine d'une
// conversation est écrite sur MA ligne `conv_members` (`muted`), pour que
// `notify-call` ne réveille plus mes autres appareils (banc serveur :
// tests/unit/lien-metier.test.mjs, « MSG-C02 »).
//   ① couper puis rétablir écrit `muted` vrai puis faux, sur la seule ligne
//      (conv_id, user_id = moi) ;
//   ② base pas encore migrée (colonne inconnue) : rien n'est dit, la sourdine
//      locale tient ; un refus réel est dit, la sourdine locale tient aussi.
// Aucune écriture réseau : le client Supabase est remplacé par un relevé.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function poser(page, reponse) {
  await bootOnboarded(page);
  await page.evaluate((rep) => {
    window.__ecritures = [];
    window.__t = [];
    const t0 = window.toast;
    window.toast = function (m) { window.__t.push(String(m)); try { return t0.apply(this, arguments); } catch (e) { return null; } };
    const faux = {
      from(table) {
        const ecr = { table, champs: null, filtres: [] };
        const q = {
          update(v) { ecr.champs = v; return q; },
          eq(c, v) { ecr.filtres.push([c, v]); return q; },
          select() { window.__ecritures.push(ecr); return Promise.resolve(rep); },
        };
        return q;
      },
    };
    try { supa = faux; } catch (e) {}
    window.supa = faux;
    window._supaReal = true;
    window._uidEstUnCompte = () => true;
    conversationsState = [{ id: "c_sourdine", userId: "u_lea", userName: "Léa", lastAt: Date.now(), unread: 0, messages: [] }];
    window.openConvSettings = function () {};
  }, reponse);
}

test("① couper puis rétablir écrit muted sur ma seule ligne", async ({ page }) => {
  await poser(page, { data: [{ conv_id: "c_sourdine" }], error: null });
  const r = await page.evaluate(async () => {
    _toggleMuteConv("c_sourdine");
    await new Promise((res) => setTimeout(res, 50));
    _toggleMuteConv("c_sourdine");
    await new Promise((res) => setTimeout(res, 50));
    return { ecritures: window.__ecritures, moi: MY_UID, local: getConversations()[0]._muted };
  });
  expect(r.ecritures.map((e) => [e.table, e.champs])).toEqual([["conv_members", { muted: true }], ["conv_members", { muted: false }]]);
  expect(r.ecritures[0].filtres).toEqual([["conv_id", "c_sourdine"], ["user_id", r.moi]]);
  expect(r.local).toBe(false);
});

test("② colonne absente : silence ; refus réel : dit, et la sourdine locale tient", async ({ page }) => {
  await poser(page, { data: null, error: { code: "PGRST204", message: "column muted not found" } });
  const absente = await page.evaluate(async () => {
    _toggleMuteConv("c_sourdine");
    await new Promise((res) => setTimeout(res, 50));
    return { toasts: window.__t.slice(), local: getConversations()[0]._muted };
  });
  expect(absente.local).toBe(true);
  expect(absente.toasts.some((t) => /cet appareil seulement/.test(t))).toBe(false);

  await poser(page, { data: null, error: { code: "42501", message: "permission denied" } });
  const refus = await page.evaluate(async () => {
    _toggleMuteConv("c_sourdine");
    await new Promise((res) => setTimeout(res, 50));
    return { toasts: window.__t.slice(), local: getConversations()[0]._muted };
  });
  expect(refus.local).toBe(true);
  expect(refus.toasts.some((t) => /cet appareil seulement/.test(t))).toBe(true);
});
