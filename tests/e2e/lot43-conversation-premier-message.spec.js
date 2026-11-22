// ═══════════════════════════════════════════════════════════════════════════
// LOT-43 (audit UX/UI du 2026-11-10, MSG-C22) — LA CONVERSATION NAÎT AU PREMIER
// MESSAGE
//   ① choisir une personne n'écrit RIEN en base ; le brouillon vide n'est pas
//      listé ;
//   ② le premier envoi crée la conversation (sous l'identifiant du brouillon),
//      ses deux membres, PUIS le message ;
//   ③ une création refusée laisse le message en échec, et le brouillon reste
//      un brouillon (le rejeu retentera).
// Client Supabase SIMULÉ dans la page (il enregistre les écritures) : aucune
// écriture réseau, aucun compte réel touché.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "a1b2c3d4-0000-4000-8000-00000000c843";
const LEA = "a1b2c3d4-0000-4000-8000-00000000c844";

async function banc(page, refuserConv, opts) {
  opts = opts || {};
  await bootOnboarded(page);
  await page.evaluate(({ moi, refuser, o }) => {
    window.__ecritures = []; window.__suppressions = [];
    const vide = o.panneLecture ? { data: null, error: { code: "PGRST000", message: "panne" }, status: 503 } : { data: [], error: null };
    const chaine = (table) => {
      const b = {
        select() { return b; }, eq() { return b; }, in() { return b; }, limit() { return b; },
        order() { return b; }, maybeSingle() { return b; }, single() { return b; },
        insert(row) {
          window.__ecritures.push({ table, row });
          const refus = (refuser && table === "conversations") || (o.refuserMembre && table === "conv_members" && row.user_id !== moi);
          const r = refus ? { data: null, error: { code: "42501", message: "refus" }, status: 403 } : { data: [row], error: null, status: 201 };
          const p = Promise.resolve(r);
          p.select = () => p;
          return p;
        },
        upsert(row) { return b.insert(row); },
        update() { return b; }, delete() { window.__suppressions.push(table); return b; },
        then(ok, ko) { return Promise.resolve(vide).then(ok, ko); },
      };
      return b;
    };
    supa = { from: chaine, rpc: async () => ({ data: null, error: null }), channel: () => ({ on() { return this; }, subscribe() { return this; }, send() {} }), removeChannel() {} };
    window._supaReal = true;
    MY_UID = moi;
    window._compteAuthReel = () => true;
    window.supaEnsureProfileExists = async () => true;
    window._notifierMessage = () => {};
    conversationsState = [];
    saveConversationsNow();
  }, { moi: MOI, refuser: !!refuserConv, o: opts });
}

test("① ② rien en base à l'ouverture ; le premier envoi crée puis écrit", async ({ page }) => {
  await banc(page, false);
  const ouvert = await page.evaluate(async (lea) => {
    await startDirectMessage(lea, "Léa");
    await new Promise((r) => setTimeout(r, 300));
    const c = getConversations().find((x) => x.userId === lea);
    renderMessages();
    const liste = [...document.querySelectorAll("#messageList .msg-card")].some((e) => /Léa/.test(e.textContent));
    return { detail: JSON.stringify(window.__ecritures).slice(0, 300), ecritures: window.__ecritures.length, brouillon: !!(c && c._brouillon), id: c && c.id, liste };
  }, LEA);
  expect(ouvert.ecritures, "choisir une personne n'écrit rien : " + ouvert.detail).toBe(0);
  expect(ouvert.brouillon).toBe(true);
  expect(ouvert.liste, "un brouillon vide n'est pas listé").toBe(false);

  const envoye = await page.evaluate(async ({ id, moi }) => {
    const c = getConversations().find((x) => x.id === id);
    c.messages.push({ id: "m43_1", from: "me", text: "salut", at: Date.now(), status: "sending" });
    _sendTextToSupa(id, "m43_1", "salut", moi);
    await new Promise((r) => setTimeout(r, 400));
    return { ordre: window.__ecritures.map((e) => e.table + ":" + (e.row.conv_id || e.row.id)), brouillon: !!getConversations().find((x) => x.id === id)._brouillon };
  }, { id: ouvert.id, moi: MOI });
  expect(envoye.ordre).toEqual([
    "conversations:" + ouvert.id,
    "conv_members:" + ouvert.id,
    "conv_members:" + ouvert.id,
    "conv_messages:" + ouvert.id,
  ]);
  expect(envoye.brouillon).toBe(false);
});

test("③ création refusée : message en échec, brouillon gardé, aucun message écrit", async ({ page }) => {
  await banc(page, true);
  const r = await page.evaluate(async ({ lea, moi }) => {
    await startDirectMessage(lea, "Léa");
    await new Promise((res) => setTimeout(res, 300));
    const c = getConversations().find((x) => x.userId === lea);
    c.messages.push({ id: "m43_2", from: "me", text: "salut", at: Date.now(), status: "sending" });
    _sendTextToSupa(c.id, "m43_2", "salut", moi);
    await new Promise((res) => setTimeout(res, 400));
    const cc = getConversations().find((x) => x.id === c.id);
    return { statut: cc.messages[0].status, brouillon: !!cc._brouillon, messages: window.__ecritures.filter((e) => e.table === "conv_messages").length };
  }, { lea: LEA, moi: MOI });
  expect(r.statut).toBe("failed");
  expect(r.brouillon).toBe(true);
  expect(r.messages).toBe(0);
});

// ── Relecture audit-passio (LOT-43) ─────────────────────────────────────────
test("④ recherche en panne : pas de brouillon, la panne est dite", async ({ page }) => {
  await banc(page, false, { panneLecture: true });
  const r = await page.evaluate(async (lea) => {
    window.__toasts = []; window.toast = (m) => window.__toasts.push(String(m));
    await startDirectMessage(lea, "Léa");
    await new Promise((res) => setTimeout(res, 300));
    return { conv: !!getConversations().find((x) => x.userId === lea), ecritures: window.__ecritures.length, toasts: window.__toasts };
  }, LEA);
  expect(r.conv, "aucun brouillon sur une absence non prouvée").toBe(false);
  expect(r.ecritures).toBe(0);
  expect(r.toasts.join(" ")).toMatch(/Conversation non ouverte/);
});

test("⑤ membre refusé (42501) sous id imposé : AUCUNE suppression, message sorti de la file, refus dit", async ({ page }) => {
  await banc(page, false, { refuserMembre: true });
  const r = await page.evaluate(async ({ lea, moi }) => {
    window.__toasts = []; window.toast = (m) => window.__toasts.push(String(m));
    await startDirectMessage(lea, "Léa");
    await new Promise((res) => setTimeout(res, 300));
    const c = getConversations().find((x) => x.userId === lea);
    c.messages.push({ id: "m43_5", from: "me", text: "salut", at: Date.now(), status: "sending" });
    _sendTextToSupa(c.id, "m43_5", "salut", moi);
    await new Promise((res) => setTimeout(res, 400));
    return { suppressions: window.__suppressions, file: _outboxLoad().some((e) => e.msgId === "m43_5"),
      statut: getConversations().find((x) => x.id === c.id).messages[0].status, toasts: window.__toasts };
  }, { lea: LEA, moi: MOI });
  expect(r.suppressions, "jamais de DELETE sous un id imposé").toEqual([]);
  expect(r.file).toBe(false);
  expect(r.statut).toBe("failed");
  expect(r.toasts.join(" ")).toMatch(/n'accepte pas de nouvelle conversation/);
});

test("⑥ un brouillon retrouvé par la base perd son drapeau ; la fusion garde le fil réel", async ({ page }) => {
  await banc(page, false);
  const r = await page.evaluate(({ lea }) => {
    const brouillon = { id: "conv_brouillon43", userId: lea, userName: "Léa", lastAt: Date.now(), messages: [], isGroup: false, _brouillon: true };
    const reel = { id: "conv_reel43", userId: lea, userName: "Léa", lastAt: Date.now() - 3600000, messages: [{ id: "x1", from: lea, text: "ancien", at: Date.now() - 3600000 }], isGroup: false };
    const fus = deduplicateConversations([brouillon, reel]);
    return { ids: fus.map((c) => c.id), brouillon: fus.some((c) => c._brouillon) };
  }, { lea: LEA });
  expect(r.ids).toEqual(["conv_reel43"]);
  expect(r.brouillon).toBe(false);
});
