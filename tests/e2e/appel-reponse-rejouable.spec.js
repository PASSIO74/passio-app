// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-49 / ASTRA-50 (cinquième contre-revue Astra, 2026-09-15) — les appels.
//
// ASTRA-49 : depuis ASTRA-23 l'appelant DÉPOSE l'invitation (HTTP) avant de
// s'abonner à `call:<id>`. Si l'appelé accepte et envoie `ready` pendant que la
// réponse HTTP tarde, le message part vers ZÉRO abonné ; l'appelant reste
// « calling », l'appelé « connecting », aucune offre. Ici : les VRAIS
// gestionnaires (`startCall`, `acceptIncomingCall`, `_callBindChannelEvents`),
// un Realtime SIMULÉ dont le bus ne livre qu'aux canaux ABONNÉS au moment de
// l'envoi, et de vraies RTCPeerConnection (Chromium).
//
// ASTRA-50 : une panne de transport, dans la forme RÉELLE du SDK embarqué
// (`{ status: 0, error: { code: "", message: "TypeError: Failed to fetch" } }`
// — mesurée dans tests/unit/appel-verdict-invitation.test.mjs contre
// js/vendor/supabase-js-2.116.0.js), était classée « refus » : l'appel se
// terminait avant d'armer la répétition. Le cas ③ b) d'appel-canal-lie modélisait
// la panne par une promesse REJETÉE — une forme que le SDK ne produit pas.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// Un Realtime simulé AVEC BUS : `send` sur un canal livre aux gestionnaires de
// TOUS les canaux du même sujet qui sont abonnés à cet instant (c'est la
// sémantique du broadcast : éphémère, pas de rejeu). `window.__livrer` joue le
// PAIR (l'autre appareil), et rend le nombre de canaux qui ont reçu.
const FAUX_RT = `
window.__canaux = {};
window.__journal = [];
window._supaReal = true;
window.__livrer = function (topic, event, payload) {
  var n = 0;
  Object.keys(window.__canaux).forEach(function (t) {
    var c = window.__canaux[t];
    if (t !== topic || !c.abonne) return;
    c.handlers.forEach(function (h) { if (h[0] === "broadcast" && h[1] && h[1].event === event) { n++; try { h[2]({ payload: payload }); } catch (e) {} } });
  });
  window.__journal.push({ vers: topic, event: event, recus: n });
  return n;
};
Object.defineProperty(window.supa, "channel", {
  configurable: true, writable: true,
  value: function (topic, opts) {
    var c = window.__canaux[topic] || (window.__canaux[topic] = {
      topic: topic, opts: opts, abonne: false, httpSent: [], sent: [], handlers: [],
      on: function () { this.handlers.push(Array.from(arguments)); return this; },
      subscribe: function (cb) { var self = this; setTimeout(function () { self.abonne = true; try { cb && cb("SUBSCRIBED"); } catch (e) {} }, 0); return this; },
      httpSend: function (ev, payload) { this.httpSent.push({ event: ev, payload: payload }); return Promise.resolve({ success: true }); },
      send: function (m) { this.sent.push(m); return Promise.resolve("ok"); },
      unsubscribe: function () { this.abonne = false; return Promise.resolve("ok"); },
    });
    return c;
  },
});
Object.defineProperty(window.supa, "removeChannel", { configurable: true, writable: true, value: function (c) { if (c) c.abonne = false; return Promise.resolve("ok"); } });
Object.defineProperty(window.supa, "functions", { configurable: true, writable: true, value: { invoke: function () { return Promise.resolve({ data: {} }); } } });
window._callGetMedia = async function () { return { getTracks: function () { return []; } }; };
window.__upserts = [];
window.__inviteReponse = { error: null };
window.__tenir = false;
window.__relacher = null;
Object.defineProperty(window.supa, "from", { configurable: true, writable: true,
  value: function (table) {
    var b = {
      upsert: function (ligne, opts) {
        window.__upserts.push({ table: table, ligne: ligne, opts: opts });
        if (!window.__tenir) return Promise.resolve(window.__inviteReponse);
        return new Promise(function (res) { window.__relacher = function () { res(window.__inviteReponse); }; });
      },
      select: function () { return b; }, eq: function () { return b; },
      maybeSingle: function () { return Promise.resolve({ data: null, error: null }); },
      then: function (a, c) { return Promise.resolve({ data: [], error: null }).then(a, c); },
    };
    return b;
  } });
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
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

test.describe("ASTRA-49 — la réponse de l'appelé est rejouable", () => {
  test("① REPRODUCTION : `ready` envoyé avant l'abonnement de l'appelant → perdu ; un `ready` REJOUÉ produit l'offre", async ({ page }) => {
    test.setTimeout(60000);
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__tenir = true;
      const p = startCall("dm_lea", "voice");
      for (let i = 0; i < 50 && !window.__relacher; i++) await new Promise((r) => setTimeout(r, 10));
      const callId = window._call && window._call.id;
      // L'appelé a reçu la sonnerie (trigger) et accepte AVANT la réponse HTTP :
      // son `ready` part vers un canal que l'appelant n'écoute pas encore.
      const recusAvant = window.__livrer("call:" + callId, "ready", { from: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
      window.__relacher();
      await p;
      await new Promise((r) => setTimeout(r, 30));
      const chan = window.__canaux["call:" + callId];
      const etatApresPerte = { status: window._call && window._call.status, offres: chan ? chan.sent.filter((m) => m.event === "offer").length : 0, abonne: !!(chan && chan.abonne) };
      // L'invitation répétée arrive chez l'appelé : « déjà cet appel » → ignorée (c'est l'impasse d'Astra).
      // ASTRA-49 : l'appelé REJOUE `ready`. Le second est reçu.
      const recusApres = window.__livrer("call:" + callId, "ready", { from: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
      await new Promise((r) => setTimeout(r, 300));
      const apres = { status: window._call && window._call.status, offres: chan.sent.filter((m) => m.event === "offer").length, sdp: !!(chan.sent.find((m) => m.event === "offer") || { payload: {} }).payload.sdp };
      // Un troisième `ready` (la réponse n'est pas encore là) REJOUE la même offre, sans en créer une autre.
      window.__livrer("call:" + callId, "ready", { from: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
      await new Promise((r) => setTimeout(r, 100));
      const rejeu = { offres: chan.sent.filter((m) => m.event === "offer").length, memeSdp: chan.sent.filter((m) => m.event === "offer").every((m) => (String(m.payload.sdp.sdp).match(/^o=.*$/m) || [""])[0] === (String(chan.sent.find((x) => x.event === "offer").payload.sdp.sdp).match(/^o=.*$/m) || [""])[0]) };
      try { endCall(); } catch (e) {}
      return { recusAvant, etatApresPerte, recusApres, apres, rejeu };
    });
    expect(r.recusAvant, "prémisse : le premier `ready` n'a AUCUN destinataire").toBe(0);
    expect(r.etatApresPerte.abonne, "l'appelant est abonné après la réponse HTTP").toBe(true);
    expect(r.etatApresPerte.status, "…mais il attend toujours : `calling`").toBe("calling");
    expect(r.etatApresPerte.offres, "…et aucune offre n'est partie — c'est l'impasse").toBe(0);
    expect(r.recusApres, "le `ready` rejoué est reçu").toBe(1);
    expect(r.apres.status).toBe("connecting");
    expect(r.apres.offres, "une offre SDP part").toBe(1);
    expect(r.apres.sdp).toBe(true);
    expect(r.rejeu.offres, "un `ready` de plus REJOUE l'offre (elle a pu se perdre)").toBe(2);
    expect(r.rejeu.memeSdp, "…la MÊME, sans renégocier").toBe(true);
  });

  test("② côté appelé : `ready` est répété chaque seconde jusqu'à l'offre ; une offre en double rejoue la réponse", async ({ page }) => {
    test.setTimeout(60000);
    await banc(page);
    const r = await page.evaluate(async () => {
      window._callIncoming = { callId: "call-49", from: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", to: "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31", kind: "voice" };
      await acceptIncomingCall();
      await new Promise((r) => setTimeout(r, 50));
      const chan = window.__canaux["call:call-49"];
      const readyT0 = chan.sent.filter((m) => m.event === "ready").length;
      await new Promise((r) => setTimeout(r, 2300));
      const readyT2 = chan.sent.filter((m) => m.event === "ready").length;
      // L'offre de l'appelant arrive (un vrai SDP, d'une vraie RTCPeerConnection).
      const pcA = new RTCPeerConnection(); pcA.addTransceiver("audio");
      const offre = await pcA.createOffer(); await pcA.setLocalDescription(offre);
      window.__livrer("call:call-49", "offer", { from: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sdp: { type: pcA.localDescription.type, sdp: pcA.localDescription.sdp } });
      await new Promise((r) => setTimeout(r, 400));
      const reponses1 = chan.sent.filter((m) => m.event === "answer").length;
      const readyApresOffre = chan.sent.filter((m) => m.event === "ready").length;
      await new Promise((r) => setTimeout(r, 1200));
      const readyStop = chan.sent.filter((m) => m.event === "ready").length;
      // La même offre en double (l'appelant l'a rejouée) : la réponse est REJOUÉE, pas renégociée.
      window.__livrer("call:call-49", "offer", { from: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sdp: { type: pcA.localDescription.type, sdp: pcA.localDescription.sdp } });
      await new Promise((r) => setTimeout(r, 200));
      const reponses2 = chan.sent.filter((m) => m.event === "answer").length;
      const etatSignal = window._call && window._call.pc && window._call.pc.signalingState;
      // La description locale grossit avec les candidats ICE recueillis entre-temps : on compare la SESSION (ligne o=), pas l'octet.
      const session = (sdp) => (String(sdp).match(/^o=.*$/m) || [""])[0];
      const memeReponse = chan.sent.filter((m) => m.event === "answer").every((m, _i, a) => m.payload.sdp.type === "answer" && session(m.payload.sdp.sdp) === session(a[0].payload.sdp.sdp));
      try { pcA.close(); } catch (e) {}
      try { endCall(); } catch (e) {}
      return { readyT0, readyT2, reponses1, readyApresOffre, readyStop, reponses2, etatSignal, memeReponse };
    });
    expect(r.readyT0, "un `ready` part dès l'abonnement").toBe(1);
    expect(r.readyT2, "…et il est répété (≥ 2 de plus en 2,3 s)").toBeGreaterThanOrEqual(3);
    expect(r.reponses1, "l'offre reçue produit une réponse").toBe(1);
    expect(r.readyStop, "après l'offre, `ready` ne se répète plus").toBe(r.readyApresOffre);
    expect(r.reponses2, "l'offre en double REJOUE la réponse").toBe(2);
    expect(r.memeReponse).toBe(true);
    expect(r.etatSignal, "…sans renégocier : l'état reste stable").toBe("stable");
  });
});

test.describe("ASTRA-50 — une panne de transport n'est pas un refus", () => {
  test("① REPRODUCTION avec la forme RÉELLE du SDK (status 0, code vide, « Failed to fetch ») : l'appel continue, la répétition est armée", async ({ page }) => {
    test.setTimeout(60000);
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__toasts = []; const vraiToast = window.toast; window.toast = function (t) { window.__toasts.push(String(t)); return vraiToast.apply(this, arguments); };
      window.__inviteReponse = { data: null, status: 0, statusText: "", error: { code: "", message: "TypeError: Failed to fetch", details: "TypeError: Failed to fetch", hint: "" } };
      await startCall("dm_lea", "voice");
      await new Promise((r) => setTimeout(r, 120));
      const out = { appel: !!window._call, status: window._call && window._call.status, repetition: !!(window._call && window._call.inviteInterval), canaux: Object.keys(window.__canaux).filter((t) => t.indexOf("call:") === 0).length, toasts: window.__toasts.slice() };
      // Le réseau revient : la répétition (2 s) redépose, et cette fois c'est « ok ».
      window.__inviteReponse = { error: null };
      await new Promise((r) => setTimeout(r, 2300));
      out.upserts = window.__upserts.length;
      try { endCall(); } catch (e) {}
      return out;
    });
    // AVANT : appel:false, « Appel impossible vers cette personne », aucune répétition.
    expect(r.appel, "l'appel n'est PAS abandonné sur une panne de transport").toBe(true);
    expect(r.status).toBe("calling");
    expect(r.repetition, "la répétition est armée : c'est elle qui rend la sonnerie fiable").toBe(true);
    expect(r.canaux).toBe(1);
    expect(r.toasts.some((t) => /Appel impossible/.test(t))).toBe(false);
    expect(r.upserts, "…et elle a redéposé l'invitation").toBeGreaterThanOrEqual(2);
  });

  test("② les autres formes réelles : 503 (page HTML) et 429 continuent ; 403/42501 est un refus ; 401 est une session expirée", async ({ page }) => {
    test.setTimeout(60000);
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__toasts = []; window.toast = function (t) { window.__toasts.push(String(t)); };
      const jouer = async (rep) => {
        window.__canaux = {}; window.__toasts = [];
        window.__inviteReponse = rep;
        await startCall("dm_lea", "voice");
        await new Promise((r) => setTimeout(r, 120));
        const out = { appel: !!window._call, toasts: window.__toasts.slice() };
        try { endCall(); } catch (e) {}
        return out;
      };
      return {
        panne503: await jouer({ data: null, status: 503, error: { message: "<html>503 Service Unavailable</html>" } }),
        limite429: await jouer({ data: null, status: 429, error: { code: "PGRST000", message: "rate limited" } }),
        refus403: await jouer({ data: null, status: 403, error: { code: "42501", message: "new row violates row-level security policy for table call_invites" } }),
        session401: await jouer({ data: null, status: 401, error: { code: "PGRST301", message: "JWT expired" } }),
      };
    });
    expect(r.panne503.appel, "503 : transitoire, l'appel continue").toBe(true);
    expect(r.limite429.appel, "429 : transitoire, l'appel continue").toBe(true);
    expect(r.refus403.appel, "403/42501 : refus prouvé, l'appel s'arrête").toBe(false);
    expect(r.refus403.toasts.some((t) => /Appel impossible vers cette personne/.test(t))).toBe(true);
    expect(r.session401.appel, "401 : session, l'appel s'arrête").toBe(false);
    expect(r.session401.toasts.some((t) => /session a expiré/.test(t))).toBe(true);
    expect(r.session401.toasts.some((t) => /Appel impossible vers cette personne/.test(t)), "…sans accuser la personne appelée").toBe(false);
  });
});
