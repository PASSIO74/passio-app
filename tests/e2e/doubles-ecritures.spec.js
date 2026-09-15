// ROB-04 / ROB-06 — un geste répété n'écrit qu'une fois.
//
// LE DÉFAUT (contre-revue Astra, chantier 8), mesuré au chaos :
//   ROB-04 — deux taps sur « Suivre » en 300 ms → POST follows puis DELETE
//            follows, deux toasts contradictoires, état final « Suivre » ;
//            deux taps sur « Bloquer » → deux INSERT blocks, deux toasts ;
//   ROB-06 — deux vidages concurrents de la file d'envoi (`online` + boot, ou
//            deux « réessayer ») lisaient la même file et envoyaient chaque
//            message deux fois : quatre INSERT pour deux messages, et la
//            seconde réponse écrasait « envoyé » par « échec ».
// Ce que cette suite exige : pendant qu'une écriture est en vol, le second
// geste est IGNORÉ — pas différé, pas inversé — et le verrou tombe quand le
// serveur a répondu (① ② ③ RÉINJECTION : rouges sur le code d'avant) ; une fois
// la réponse arrivée, le geste inverse marche normalement (④ ⑤).
// Aucune requête ne part : `window.supa.from` est muté (jamais remplacé) et
// chaque INSERT/DELETE ne répond qu'au signal `window.__repondre()`.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LUI = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const FAUX_SUPA = `
window.__ecrits = []; window.__toasts = []; window.__attentes = [];
window._supaReal = true;
window.toast = function (t) { window.__toasts.push(String(t)); };
window.supaInsertNotif = async function () {};
window.supaEnsureProfileExists = async function () { return true; };
// Chaque écriture reste EN VOL jusqu'à __repondre() : c'est la fenêtre du double tap.
function __enVol(table, op, row) {
  window.__ecrits.push({ table: table, op: op, row: row });
  return new Promise(function (resolve) { window.__attentes.push(function () { resolve({ data: (table === "follows" && op === "insert") ? { status: "accepted" } : (row ? [row] : []), error: null, status: 201 }); }); });
}
// Répond à tout ce qui est en vol, y compris les écritures de suite (retrait
// d'abonné après un blocage…), jusqu'à ce que plus rien n'attende.
window.__repondre = async function () {
  for (var tour = 0; tour < 10; tour++) {
    var a = window.__attentes.splice(0); a.forEach(function (f) { f(); });
    await new Promise(function (r) { setTimeout(r, 40); });
    if (!window.__attentes.length) break;
  }
};
function __chaine(p) { var b = { eq: function () { return b; }, select: function () { return b; }, single: function () { return p; }, maybeSingle: function () { return p; }, then: function (a, c) { return p.then(a, c); } }; return b; }
Object.defineProperty(window.supa, "from", {
  configurable: true, writable: true,
  value: function (table) {
    return {
      insert: function (row) { var r = Array.isArray(row) ? row[0] : row; return __chaine(__enVol(table, "insert", r)); },
      upsert: function (row) { var r = Array.isArray(row) ? row[0] : row; return __chaine(__enVol(table, "upsert", r)); },
      delete: function () { return __chaine(__enVol(table, "delete", null)); },
      select: function () { return __chaine(Promise.resolve({ data: [], error: null })); },
    };
  }
});
window.__ecritsDe = function (table) { return window.__ecrits.filter(function (e) { return e.table === table; }).map(function (e) { return e.op; }); };
`;

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, FAUX_SUPA);
  await page.evaluate((lui) => {
    // Un bouton « Suivre » sur la page : `toggleFollowUser` est inerte sans lui.
    const b = document.createElement("button"); b.id = "followBtn_" + lui; b.setAttribute("data-follow-uid", lui); document.body.appendChild(b);
    state.user.following = []; state.user.followingPending = []; state.user.blocked = [];
  }, UID_LUI);
}

test.describe("ROB-04 — un bouton d'état ignore le second tap pendant l'écriture", () => {
  test("① deux taps sur « Suivre » en vol : une seule écriture, un seul toast, état « suivi »", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (lui) => {
      toggleFollowUser(lui, "Léa");
      await new Promise((r) => setTimeout(r, 300));
      toggleFollowUser(lui, "Léa"); // second tap, la première écriture n'a pas répondu
      const pendant = { follows: window.__ecritsDe("follows"), etat: etatSuivi(lui), toasts: window.__toasts.slice() };
      await window.__repondre();
      return { pendant, apres: { etat: etatSuivi(lui), follows: window.__ecritsDe("follows") } };
    }, UID_LUI);
    // RÉINJECTION : sur le code d'avant, follows = ["insert","delete"], deux toasts, état « aucun ».
    expect(r.pendant.follows).toEqual(["insert"]);
    expect(r.pendant.etat).toBe("suivi");
    expect(r.pendant.toasts.filter((t) => /Tu suis|ne suis plus/.test(t))).toEqual(["Tu suis Léa !"]);
    expect(r.apres.etat).toBe("suivi");
    expect(r.apres.follows).toEqual(["insert"]);
  });

  test("② deux taps sur « Bloquer » en vol : une seule écriture, un seul toast", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (lui) => {
      const p1 = blockUser(lui, "Léa");
      await new Promise((r) => setTimeout(r, 300));
      const p2 = blockUser(lui, "Léa");
      const pendant = window.__ecritsDe("blocks").slice();
      await window.__repondre();
      const [ok1, ok2] = await Promise.all([p1, p2]);
      return { pendant, ok1, ok2, bloque: (state.user.blocked || []).includes(lui), toasts: window.__toasts.filter((t) => /bloqué/.test(t)) };
    }, UID_LUI);
    // RÉINJECTION : sur le code d'avant, blocks = ["insert","insert"] et deux toasts « bloqué ».
    expect(r.pendant).toEqual(["insert"]);
    expect(r.ok1).toBe(true);
    expect(r.ok2).toBe(false);
    expect(r.bloque).toBe(true);
    expect(r.toasts.length).toBe(1);
  });

  test("④ une fois la réponse arrivée, le geste inverse marche : suivre puis ne plus suivre", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (lui) => {
      toggleFollowUser(lui, "Léa"); await window.__repondre();
      toggleFollowUser(lui, "Léa"); await window.__repondre();
      return { follows: window.__ecritsDe("follows"), etat: etatSuivi(lui) };
    }, UID_LUI);
    expect(r.follows).toEqual(["insert", "delete"]);
    expect(r.etat).toBe("aucun");
  });
});

test.describe("ROB-06 — un message en file n'est envoyé qu'une fois", () => {
  const poser = (page) => page.evaluate(() => {
    localStorage.removeItem("passio_outbox_v1");
    const convs = getConversations();
    convs.push({ id: "conv_r6", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", userName: "Léa",
      messages: [{ id: "m1", text: "un", mine: true, status: "failed" }, { id: "m2", text: "deux", mine: true, status: "failed" }] });
    saveConversations();
    // ⚠️ ASTRA-21 : `_outboxAdd` prend désormais son PROPRIÉTAIRE en argument —
    // il ne le relit plus dans la continuation, où le compte peut avoir changé.
    // Le banc le passe donc explicitement. Ce cas mesure ROB-06 (un message en
    // file n'est envoyé qu'une fois), pas la propriété de la file : lui donner
    // son propriétaire le laisse mesurer son propre sujet.
    _outboxAdd("conv_r6", "m1", "un", MY_UID); _outboxAdd("conv_r6", "m2", "deux", MY_UID);
    window.__ecrits = [];
  });
  const messages = (page) => page.evaluate(() => window.__ecrits.filter((e) => e.table === "conv_messages").map((e) => e.row.id));
  const statuts = (page) => page.evaluate(() => (getConversations().find((c) => c.id === "conv_r6").messages).map((m) => m.id + ":" + m.status));

  test("③ deux vidages concurrents : deux envois pour deux messages, tous deux « envoyés »", async ({ page }) => {
    await banc(page);
    await poser(page);
    await page.evaluate(async () => { _flushOutbox(); _flushOutbox(); await new Promise((r) => setTimeout(r, 50)); });
    // RÉINJECTION : sur le code d'avant, quatre INSERT (m1, m2, m1, m2).
    expect((await messages(page)).sort()).toEqual(["m1", "m2"]);
    await page.evaluate(() => window.__repondre());
    expect(await statuts(page)).toEqual(["m1:sent", "m2:sent"]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length)).toBe(0);
    // Le vidage concurrent n'a pas compté d'essai en double.
  });

  test("⑤ deux « réessayer » rapprochés : un seul envoi ; après la réponse, un nouvel échec se renvoie", async ({ page }) => {
    await banc(page);
    await poser(page);
    const r = await page.evaluate(async () => {
      _retryMsg("conv_r6", "m1"); _retryMsg("conv_r6", "m1");
      await new Promise((r) => setTimeout(r, 30));
      const pendant = window.__ecrits.filter((e) => e.table === "conv_messages").length;
      await window.__repondre();
      // La réponse est arrivée : un renvoi ultérieur (nouvel échec) repart normalement.
      _retryMsg("conv_r6", "m2");
      await new Promise((r) => setTimeout(r, 30));
      return { pendant, total: window.__ecrits.filter((e) => e.table === "conv_messages").map((e) => e.row.id) };
    });
    expect(r.pendant).toBe(1);
    expect(r.total).toEqual(["m1", "m2"]);
  });
});
