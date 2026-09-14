// MSG-01 / SUP-06 — les appels : l'invitation part sans lire la sonnerie du
// pair, et l'identité de l'appelant vient du serveur.
//
// LE DÉFAUT (résidu de l'ouverture publique, relevé par la contre-revue).
// L'appelant S'ABONNAIT à `ring:<pair>` pour y émettre son invitation. Or
// Realtime refuse un abonnement privé sans droit de LECTURE : la policy de
// réception devait donc laisser TOUT compte lire la sonnerie de N'IMPORTE QUI —
// donc observer qui appelle qui, et y présenter une invitation sous un autre
// nom, puisque le client affichait `payload.name` / `payload.emoji`.
//
// Ce que cette suite exige :
//   ① `startCall` n'ABONNE JAMAIS `ring:<pair>` : l'invitation part par
//      `httpSend` (REST broadcast, policy d'ÉMISSION seule) — RÉINJECTION ;
//   ② l'écran d'appel entrant affiche le PROFIL de `from` (serveur), jamais
//      `payload.name` — RÉINJECTION ;
//   ③ un `from` qui n'est pas un compte (uuid) n'est pas une invitation ;
//   ④ « Répondre » retient l'identité du profil, pas celle de la charge ;
//   ⑤ à la SOURCE : plus de `ring.subscribe(` dans `startCall`, la migration
//      restreint `ring:` à son destinataire, et son banc est branché en CI.
//
// Aucune requête ne part : `supa.channel`, `_callGetMedia` et `supa.functions`
// sont MUTÉS (jamais remplacés — en CI le vrai SDK se charge avec des getters de
// prototype qu'une simple affectation ne masque pas).
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");
const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const FAUX_RT = `
window.__canaux = {};
window._supaReal = true;
Object.defineProperty(window.supa, "channel", {
  configurable: true, writable: true,
  value: function (topic, opts) {
    var c = window.__canaux[topic] || (window.__canaux[topic] = {
      topic: topic, opts: opts, subscribed: 0, httpSent: [], sent: [], handlers: [],
      on: function () { this.handlers.push(Array.from(arguments)); return this; },
      subscribe: function (cb) { this.subscribed++; try { cb && cb("SUBSCRIBED"); } catch (e) {} return this; },
      httpSend: function (ev, payload) { this.httpSent.push({ event: ev, payload: payload }); return Promise.resolve({ success: true }); },
      send: function (m) { this.sent.push(m); return Promise.resolve("ok"); },
      unsubscribe: function () { return Promise.resolve("ok"); },
    });
    return c;
  },
});
Object.defineProperty(window.supa, "removeChannel", { configurable: true, writable: true, value: function () { return Promise.resolve("ok"); } });
Object.defineProperty(window.supa, "functions", { configurable: true, writable: true, value: { invoke: function () { return Promise.resolve({ data: {} }); } } });
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

test.describe("MSG-01 / SUP-06 — appels : sonnerie privée, identité serveur", () => {
  test("① l'appelant n'écoute jamais la sonnerie du pair : l'invitation part en REST", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (lea) => {
      await startCall("dm_lea", "voice");
      await new Promise((r) => setTimeout(r, 120));
      const ring = window.__canaux["ring:" + lea];
      const appel = window._call;
      const out = {
        ringExiste: !!ring,
        ringAbonne: ring ? ring.subscribed : null,
        ringHttp: ring ? ring.httpSent.map((x) => ({ event: x.event, from: x.payload.from, callId: x.payload.callId })) : [],
        ringSendSocket: ring ? ring.sent.length : null,
        callAbonne: appel ? (window.__canaux["call:" + appel.id] || {}).subscribed : null,
        callId: appel ? appel.id : null,
      };
      try { endCall(); } catch (e) {}
      return out;
    }, UID_LEA);
    expect(r.ringExiste, "prémisse : le canal ring:<pair> est bien créé").toBe(true);
    // RÉINJECTION : sur le code d'avant, `ring.subscribe` est appelé (1) et rien ne part en REST.
    expect(r.ringAbonne, "aucun abonnement à la sonnerie du pair").toBe(0);
    expect(r.ringHttp.length, "l'invitation part par httpSend").toBeGreaterThanOrEqual(1);
    expect(r.ringHttp[0].event).toBe("invite");
    expect(r.ringHttp[0].from).toBe(UID_MOI);
    expect(r.ringHttp[0].callId).toBe(r.callId);
    expect(r.callAbonne, "le canal d'appel, lui, est bien écouté (réponse SDP)").toBe(1);
  });

  test("② l'écran d'appel entrant affiche le profil de `from`, jamais la charge utile", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate((lea) => {
      window._call = null; window._callIncoming = null; window._callInviteAffichee = 0;
      _callOnInvite({ callId: "c-usurpe", from: lea, kind: "voice", name: "Benjamin", emoji: "💣" });
      const el = document.getElementById("callOverlay");
      const out = { nom: el.querySelector(".call-name").textContent, avatar: el.querySelector(".call-avatar").textContent,
                    identite: window._callIncoming && window._callIncoming.identite };
      window._callIncoming = null; _callCloseUI();
      return out;
    }, UID_LEA);
    // RÉINJECTION : sur le code d'avant, nom = « Benjamin » et avatar = 💣.
    expect(r.nom).toBe("Léa");
    expect(r.avatar).toBe("🌿");
    expect(r.identite && r.identite.name).toBe("Léa");
  });

  test("③ un `from` qui n'est pas un compte n'est pas une invitation", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(() => {
      window._call = null; window._callIncoming = null; window._callInviteAffichee = 0;
      const rendus = [];
      window._callRenderIncomingUI = (inv) => rendus.push(inv.callId);
      _callOnInvite({ callId: "c-faux", from: "u_att", kind: "voice", name: "x" });
      _callOnInvite({ callId: "c-vide", kind: "voice", name: "x" });
      return { rendus, incoming: window._callIncoming };
    });
    expect(r.rendus).toEqual([]);
    expect(r.incoming).toBeNull();
  });

  test("④ « Répondre » retient l'identité du profil", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (lea) => {
      window._call = null; window._callIncoming = null; window._callInviteAffichee = 0;
      _callOnInvite({ callId: "c-accepte", from: lea, kind: "voice", name: "Benjamin", emoji: "💣" });
      await acceptIncomingCall();
      const peer = window._call && window._call.peer;
      const out = peer ? { id: peer.id, name: peer.name, emoji: peer.emoji } : null;
      try { endCall(); } catch (e) {}
      return out;
    }, UID_LEA);
    expect(r).toEqual({ id: UID_LEA, name: "Léa", emoji: "🌿" });
  });

  test("⑤ à la SOURCE : plus d'abonnement à ring:<pair>, migration restrictive, banc branché", async () => {
    const app05 = lire("js/app-05-config-profil.js");
    const i = app05.indexOf("async function startCall(");
    const corps = app05.slice(i, app05.indexOf("\nfunction ", i + 10));
    expect(corps).not.toContain("ring.subscribe(");
    expect(corps).toContain("_callEmettreInvitation(ring, invitePayload)");
    const mig = lire("migrations/migration_appels_sonnerie_privee_2026-09-14.sql");
    expect(mig).toMatch(/realtime\.topic\(\) like 'ring:%'\s+and substr\(realtime\.topic\(\), 6\) = \(select auth\.uid\(\)\)::text/);
    expect(mig).not.toMatch(/drop policy if exists "passio_rt_emettre"/);
    expect(lire(".github/workflows/deploy.yml")).toMatch(/bash tests\/sql\/migration-appels-sonnerie-privee\.test\.sh/);
    expect(fs.existsSync(path.join(RACINE, "tests/sql/migration-appels-sonnerie-privee.test.sh"))).toBe(true);
  });
});
