// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-23, contrat de transition (cinquième contre-revue, 2026-09-15) — un
// canal d'appel REFUSÉ pour défaut de droit (ancien onglet, policy resserrée)
// termine l'appel en le disant, au lieu de sonner dans le vide. Une coupure
// réseau n'est pas un refus. Vrais gestionnaires, Realtime simulé.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const FAUX_RT = `
window.__canaux = {}; window.__traces = []; window.__toasts = [];
window._supaReal = true;
window.diagLog = function (m) { window.__traces.push(String(m)); };
var _vraiToast = window.toast; window.toast = function (t) { window.__toasts.push(String(t)); };
// Le statut que Realtime rendra au prochain abonnement d'un canal call: (et son erreur).
window.__statutCall = ["SUBSCRIBED", null];
Object.defineProperty(window.supa, "channel", {
  configurable: true, writable: true,
  value: function (topic, opts) {
    var c = window.__canaux[topic] || (window.__canaux[topic] = {
      topic: topic, opts: opts, sent: [], handlers: [],
      on: function () { this.handlers.push(Array.from(arguments)); return this; },
      subscribe: function (cb) { var st = topic.indexOf("call:") === 0 ? window.__statutCall : ["SUBSCRIBED", null]; setTimeout(function () { try { cb && cb(st[0], st[1]); } catch (e) {} }, 0); return this; },
      httpSend: function () { return Promise.resolve({ success: true }); },
      send: function (m) { this.sent.push(m); return Promise.resolve("ok"); },
      unsubscribe: function () { return Promise.resolve("ok"); },
    });
    return c;
  },
});
Object.defineProperty(window.supa, "removeChannel", { configurable: true, writable: true, value: function () { return Promise.resolve("ok"); } });
Object.defineProperty(window.supa, "functions", { configurable: true, writable: true, value: { invoke: function () { return Promise.resolve({ data: {} }); } } });
Object.defineProperty(window.supa, "from", { configurable: true, writable: true,
  value: function () { var b = { upsert: function () { return Promise.resolve({ error: null }); }, select: function () { return b; }, eq: function () { return b; }, maybeSingle: function () { return Promise.resolve({ data: null, error: null }); }, then: function (a, c) { return Promise.resolve({ data: [], error: null }).then(a, c); } }; return b; } });
window._callGetMedia = async function () { return { getTracks: function () { return []; } }; };
`;

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, FAUX_RT);
  await page.evaluate((lea) => {
    cacheRemoteProfile({ id: lea, username: "Léa", emoji: "🌿", color: "#22c55e", avatar_url: null });
    const convs = getConversations();
    convs.push({ id: "dm_lea", isGroup: false, userId: lea, userName: "Léa", userEmoji: "🌿", userColor: "#22c55e", unread: 0, lastAt: Date.now(), messages: [] });
    saveConversations();
  }, UID_LEA);
}

test.describe("ASTRA-23 — un canal d'appel refusé pour défaut de droit", () => {
  test("① appelant : CHANNEL_ERROR « policy » → l'appel se termine, la personne est prévenue, c'est tracé", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__statutCall = ["CHANNEL_ERROR", new Error("Unauthorized: no policy allows this channel (private)")];
      await startCall("dm_lea", "voice");
      await new Promise((res) => setTimeout(res, 100));
      return { appel: !!window._call, toasts: window.__toasts.slice(), traces: window.__traces.filter((t) => /call_canal_refuse/.test(t)) };
    });
    // AVANT : l'appel restait « calling » jusqu'au délai de 60 s (« Pas de réponse »), rien n'était dit.
    expect(r.appel, "l'appel est terminé, il ne sonne pas dans le vide").toBe(false);
    expect(r.toasts.some((t) => /version de l'application est périmée/.test(t)), JSON.stringify(r.toasts)).toBe(true);
    expect(r.traces.length).toBeGreaterThanOrEqual(1);
  });

  test("② appelé : même règle à l'acceptation", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__statutCall = ["CHANNEL_ERROR", new Error("permission denied for topic")];
      window._callIncoming = { callId: "call-23", from: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", to: "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31", kind: "voice" };
      await acceptIncomingCall();
      await new Promise((res) => setTimeout(res, 100));
      return { appel: !!window._call, toasts: window.__toasts.slice() };
    });
    expect(r.appel).toBe(false);
    expect(r.toasts.some((t) => /version de l'application est périmée/.test(t))).toBe(true);
  });

  test("③ une coupure réseau (TIMED_OUT sans motif de policy) n'est PAS un refus : l'appel continue, Realtime retente", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__statutCall = ["TIMED_OUT", undefined];
      await startCall("dm_lea", "voice");
      await new Promise((res) => setTimeout(res, 100));
      const out = { appel: !!window._call, status: window._call && window._call.status, toasts: window.__toasts.slice() };
      try { endCall(); } catch (e) {}
      return out;
    });
    expect(r.appel).toBe(true);
    expect(r.status).toBe("calling");
    expect(r.toasts.some((t) => /périmée/.test(t))).toBe(false);
  });
});
