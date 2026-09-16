// ASTRA-60 (sixième contre-revue, 2026-09-16) — LES APPELS SONT DÉSACTIVÉS
// POUR LE PILOTE, ET RÉELLEMENT INDISPONIBLES.
//
// Le défaut ouvert : avec deux vrais RTCPeerConnection et un bus simulé, perdre
// une `answer` laisse la négociation sans relance. Plutôt qu'une correction
// non validée, le pilote retire la fonction — et cette suite mesure que le
// retrait couvre les POINTS D'ENTRÉE, pas seulement un bouton :
//   ① les boutons d'appel ne sont pas rendus dans une conversation privée ;
//   ② `startCall` refuse, prévient, trace — aucun média, aucun canal ;
//   ③ une invitation reçue (ancien client en cache) est ignorée, tracée,
//      aucun écran entrant ;
//   ④ la sonnerie n'est pas abonnée ;
//   ⑤ l'armement de test (`passio_appels_actifs`) rétablit le tout — c'est ce
//      qui garde les suites d'appels vivantes, et c'est réservé aux tests.
// Aucune requête ne part (`supabase.co` coupé).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const SCAFFOLD = `
window.__traces = []; window.__toasts = []; window.__canaux = [];
window._supaReal = true;
window.diagLog = function (m) { window.__traces.push(String(m)); };
window.toast = function (t) { window.__toasts.push(String(t)); };
window.__media = 0;
navigator.mediaDevices.getUserMedia = function () { window.__media++; return Promise.reject(new Error("ne doit pas être appelé")); };
Object.defineProperty(window.supa, "channel", { configurable: true, writable: true,
  value: function (topic) { window.__canaux.push(topic); var c = { on: function () { return c; }, subscribe: function () { return c; }, send: function () { return Promise.resolve("ok"); }, unsubscribe: function () {} }; return c; } });
`;

async function banc(page, armer) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript(({ u, a }) => { localStorage.setItem("passio_uid", u); if (a) localStorage.setItem("passio_appels_actifs", "1"); else localStorage.removeItem("passio_appels_actifs"); }, { u: UID_MOI, a: !!armer });
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, SCAFFOLD);
  await page.evaluate((lea) => {
    cacheRemoteProfile({ id: lea, username: "Léa", emoji: "🌿", color: "#22c55e", avatar_url: null });
    const convs = getConversations();
    convs.push({ id: "dm_lea", isGroup: false, userId: lea, userName: "Léa", userEmoji: "🌿", userColor: "#22c55e", unread: 0, lastAt: Date.now(), messages: [] });
    saveConversations();
  }, UID_LEA);
}

test.describe("ASTRA-60 — les appels sont désactivés pour le pilote", () => {
  test("① aucun bouton d'appel dans une conversation privée ; ② startCall refuse, prévient, trace, ne touche ni média ni canal", async ({ page }) => {
    await banc(page, false);
    const r = await page.evaluate(async () => {
      const dispo = appelsDisponibles();
      openConversation("dm_lea");
      await new Promise((res) => setTimeout(res, 150));
      const boutons = Array.from(document.querySelectorAll('.conv-action-btn[title="Appel audio"], .conv-action-btn[title="Appel vidéo"]')).length;
      const html = document.body.innerHTML.indexOf("startCall(") !== -1;
      await startCall("dm_lea", "voice");
      await startCall("dm_lea", "video");
      return { dispo, boutons, html, appel: !!window._call, media: window.__media, canaux: window.__canaux.slice(), toasts: window.__toasts.slice(), traces: window.__traces.filter((t) => /call_refuse_pilote/.test(t)) };
    });
    expect(r.dispo).toBe(false);
    expect(r.boutons, "aucun bouton d'appel rendu").toBe(0);
    expect(r.html, "aucun handler startCall dans le DOM").toBe(false);
    expect(r.appel).toBe(false);
    expect(r.media, "getUserMedia jamais appelé").toBe(0);
    expect(r.canaux.filter((t) => /^(call|ring):/.test(t)), "aucun canal d'appel ouvert").toEqual([]);
    expect(r.toasts.filter((t) => /appels ne sont pas disponibles pendant le pilote/.test(t)).length).toBe(2);
    expect(r.traces.length).toBe(2);
  });

  test("③ une invitation reçue est ignorée et tracée — aucun écran entrant ; ④ la sonnerie n'est pas abonnée", async ({ page }) => {
    await banc(page, false);
    const r = await page.evaluate(async () => {
      window._call = null; window._callIncoming = null;
      const rendus = [];
      window._callRenderIncomingUI = (inv) => rendus.push(inv.callId);
      _callOnInvite({ callId: "call-pilote-1", from: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", to: "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31", kind: "voice", name: "Léa" });
      await new Promise((res) => setTimeout(res, 100));
      window._callRingChan = null;
      _subscribeCallRing();
      return { entrant: !!window._callIncoming, rendus, traces: window.__traces.filter((t) => /call_ignore_pilote/.test(t)), sonnerie: !!window._callRingChan, canaux: window.__canaux.filter((t) => /^ring:/.test(t)) };
    });
    expect(r.entrant, "aucun appel entrant").toBe(false);
    expect(r.rendus).toEqual([]);
    expect(r.traces.length).toBe(1);
    expect(r.sonnerie, "pas de canal de sonnerie").toBe(false);
    expect(r.canaux).toEqual([]);
  });

  test("⑤ l'armement de test rétablit boutons, sonnerie et démarrage — c'est ce qui garde les suites d'appels vivantes", async ({ page }) => {
    await banc(page, true);
    const r = await page.evaluate(async () => {
      openConversation("dm_lea");
      await new Promise((res) => setTimeout(res, 150));
      const boutons = Array.from(document.querySelectorAll('.conv-action-btn[title="Appel audio"], .conv-action-btn[title="Appel vidéo"]')).length;
      window._callRingChan = null;
      _subscribeCallRing();
      await startCall("dm_lea", "voice");
      return { dispo: appelsDisponibles(), boutons, sonnerie: !!window._callRingChan, media: window.__media, refus: window.__toasts.filter((t) => /pendant le pilote/.test(t)).length };
    });
    expect(r.dispo).toBe(true);
    expect(r.boutons).toBe(2);
    expect(r.sonnerie).toBe(true);
    expect(r.media, "armé, startCall va jusqu'au média (refusé par le faux)").toBe(1);
    expect(r.refus).toBe(0);
  });

  test("⑥ le serveur refuse une push d'appel : `notify-call` répond 503 appels_desactives (lecture du source, verrou statique)", async () => {
    const fs = require("fs"), path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "supabase", "functions", "notify-call", "index.ts"), "utf8");
    expect(src).toMatch(/const APPELS_ACTIFS = false;/);
    expect(src).toMatch(/type === "call" && !APPELS_ACTIFS\) return json\(\{ ok: false, code: "appels_desactives"/);
    const app05 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-05-config-profil.js"), "utf8");
    expect(app05).toMatch(/const PASSIO_APPELS_ACTIFS = false;/);
  });
});
