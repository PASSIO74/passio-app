// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — LE FLOW RSVP EST RÉGLÉ AU VERDICT DU SERVEUR
//
// Carte télémétrie-client du 2026-09-18 (LOT E, G3) : `toggleJoinEvent`
// ouvrait un flow (`tel.flowStart`) puis JETAIT son cid — jamais de step, jamais
// de end — et `setEventRsvp`, appelée aussi directement depuis la fiche et la
// feuille de choix, n'ouvrait aucun flow. Un refus serveur (activité complète,
// annulée, passée, RLS) n'existait qu'en `diagLog`. Le pilotage voyait, au
// mieux, un verdict par la requête ambiante de 4 s ; au pire rien.
//
// Désormais : le flow s'ouvre DANS setEventRsvp (seule porte commune), APRÈS
// les gardes (invité, démo, annulé, inchangé) et seulement si une écriture va
// être tentée, puis `tel.settle(cid, "saved", ok, err)` au verdict — avec le
// motif fermé du refus en `rc`. Côté pilotage, le contrat event_join/leave
// exige ce « saved » (dashboard/test/traces.test.js).
//
// Même levier que irl-funnel.spec.js : le backend est remplacé par des doubles,
// rien ne part en production. `?telemetry=1` est OBLIGATOIRE : sans lui
// `flowStart` rend null et le banc mesurerait le vide.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SOURCE_APP07 = path.join(__dirname, "..", "..", "js", "app-07-ia-explore-irl.js");

async function bootRsvp(page) {
  await bootOnboarded(page, null, 1, { query: "?telemetry=1" });
  await page.route("**/rest/v1/telemetry_events*", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
  await page.evaluate(() => {
    ["supaPublishEvent", "supaUpdateEvent", "supaJoinEvent", "supaLeaveEvent",
      "supaSetEventRsvp", "supaLoadEvents", "supaLoadMyRsvps", "supaLoadEventCommentCounts",
      "supaCreateEventConversation", "supaJoinEventConversation", "supaLeaveEventConversation",
      "supaPromoteFromWaitlist", "supaFirstWaitlisted", "supaInsertNotif",
    ].forEach((fn) => { window[fn] = async () => null; });
    // Capture des trois étapes du flow, À LA SOURCE. `settle` appelle
    // `this.step` puis `this.flowEnd` : remplacer ces deux méthodes intercepte
    // aussi settle. `flowStart` est enveloppé (on garde le vrai cid).
    window.__flow = [];
    const vraiStart = window.tel.flowStart;
    window.tel.flowStart = function (action, meta) {
      const cid = vraiStart.call(window.tel, action, meta);
      window.__flow.push({ etape: "start", cid, action, meta: meta || {} });
      return cid;
    };
    window.tel.step = function (cid, key, status, meta) { window.__flow.push({ etape: "step", cid, key, status, meta: meta || null }); };
    window.tel.flowEnd = function (cid, status) { window.__flow.push({ etape: "end", cid, status }); };
    window.__actions = [];
    window.tel.action = function (name, meta) { window.__actions.push({ name, meta: meta || {} }); };

    window._supaReal = true;
    window._irlFunnelSeen = {};
    state.userEvents = [];
    state.seed.events = [{
      id: "ev0", title: "Événement hôte", passion: "musique", emoji: "🎸",
      city: "Paris", lat: 48.8566, lng: 2.3522, date: Date.now() + 3 * 86400000,
      time: "18:00", desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [],
      organizerId: "someone_else", status: "active",
    }];
    state.user.joinedEvents = [];
    state.user.eventRsvp = {};
    goTo("irl");
    renderIRL();
  });
}

const flow = (page) => page.evaluate(() => window.__flow);
const vider = (page) => page.evaluate(() => { window.__flow = []; window.__actions = []; });

// Un flow complet et cohérent : start → step saved → end, TOUS sur le même cid.
function chaine(evs) {
  expect(evs.map((e) => e.etape)).toEqual(["start", "step", "end"]);
  expect(evs[0].cid).toMatch(/^fl_/);
  expect(evs[1].cid).toBe(evs[0].cid);
  expect(evs[2].cid).toBe(evs[0].cid);
  expect(evs[1].key).toBe("saved");
  return evs;
}

test.describe("Télémétrie — flow RSVP réglé au verdict", () => {

  // MUTATION : retirer `_rsvpRegle(true)` après `supaSetEventRsvp` → start sans
  // step ni end ; retirer le `flowStart` de setEventRsvp → rien du tout.
  test("① inscription confirmée par le serveur : event_join start → saved ok → end ok, même cid", async ({ page }) => {
    await bootRsvp(page);
    await page.evaluate(() => { window.supaSetEventRsvp = async () => true; });
    await page.evaluate(() => setEventRsvp("ev0", "going"));

    const evs = chaine(await flow(page));
    expect(evs[0].action).toBe("event_join");
    expect(evs[0].meta).toEqual({ eventId: "ev0", rsvp: "going" });
    expect(evs[1].status).toBe("ok");
    expect(evs[1].meta).toBeNull();
    expect(evs[2].status).toBe("ok");
    expect(await page.evaluate(() => myRsvp("ev0"))).toBe("going");
  });

  // MUTATION : retirer `_rsvpRegle(false, …)` de `annuler` → le refus laisse un
  // flow ouvert (start seul) : « non confirmé » au lieu d'« échec » au pilotage.
  test("② refus serveur (activité complète) : saved en ÉCHEC avec rc=complete, end error, optimiste annulé", async ({ page }) => {
    await bootRsvp(page);
    await page.evaluate(() => {
      window.supaSetEventRsvp = async () => { window._irlRefusMotif = "complete"; return false; };
    });
    await page.evaluate(() => setEventRsvp("ev0", "going"));

    const evs = chaine(await flow(page));
    expect(evs[0].action).toBe("event_join");
    expect(evs[1].status).toBe("error");
    // settle mappe message→detail et code→rc : le motif FERMÉ, jamais le toast.
    expect(evs[1].meta).toEqual({ detail: "complete", rc: "complete" });
    expect(evs[2].status).toBe("error");
    // ROB-02 : l'affichage optimiste est bien annulé.
    expect(await page.evaluate(() => myRsvp("ev0"))).toBeNull();
  });

  test("③ refus sans motif nommé (RLS, 0 ligne) : rc=refus", async ({ page }) => {
    await bootRsvp(page);
    await page.evaluate(() => { window.supaSetEventRsvp = async () => false; });
    await page.evaluate(() => setEventRsvp("ev0", "maybe"));
    const evs = chaine(await flow(page));
    expect(evs[1].status).toBe("error");
    expect(evs[1].meta.rc).toBe("refus");
  });

  // MUTATION : retirer `_rsvpRegle(true)` après `supaLeaveEvent` → start seul.
  test("④ désinscription : event_leave réglé ok ; refusée : saved error rc=refus", async ({ page }) => {
    await bootRsvp(page);
    await page.evaluate(() => { window.supaSetEventRsvp = async () => true; window.supaLeaveEvent = async () => true; });
    await page.evaluate(() => setEventRsvp("ev0", "going"));
    await vider(page);
    await page.evaluate(() => setEventRsvp("ev0", null));
    let evs = chaine(await flow(page));
    expect(evs[0].action).toBe("event_leave");
    expect(evs[0].meta).toEqual({ eventId: "ev0", rsvp: "none" });
    expect(evs[1].status).toBe("ok");
    expect(await page.evaluate(() => myRsvp("ev0"))).toBeNull();

    // Désinscription refusée par le serveur.
    await page.evaluate(() => setEventRsvp("ev0", "going"));
    await vider(page);
    await page.evaluate(() => { window.supaLeaveEvent = async () => false; });
    await page.evaluate(() => setEventRsvp("ev0", null));
    evs = chaine(await flow(page));
    expect(evs[0].action).toBe("event_leave");
    expect(evs[1].status).toBe("error");
    expect(evs[1].meta.rc).toBe("refus");
    expect(await page.evaluate(() => myRsvp("ev0"))).toBe("going");   // optimiste annulé
  });

  // MUTATION : ouvrir le flow AVANT `window._supaReal` / avant les gardes → un
  // start sans requête = « clic mort » FABRIQUÉ (alerte high au pilotage).
  test("⑤ aucun flow fabriqué : mode local, RSVP inchangé, activité de démonstration", async ({ page }) => {
    await bootRsvp(page);
    // Mode local : aucune écriture ne sera tentée, rien à confirmer.
    await page.evaluate(() => { window._supaReal = false; });
    await page.evaluate(() => setEventRsvp("ev0", "going"));
    expect(await flow(page)).toEqual([]);
    expect(await page.evaluate(() => myRsvp("ev0"))).toBe("going");

    // Retour en mode serveur : RSVP INCHANGÉ (déjà « going ») → sortie sur la
    // garde `prev === rsvp`, avant tout flow.
    await page.evaluate(() => { window._supaReal = true; window.supaSetEventRsvp = async () => true; });
    await page.evaluate(() => setEventRsvp("ev0", "going"));
    expect(await flow(page)).toEqual([]);

    // Activité de démonstration refusée par PassioFirstRun : garde AVANT le flow.
    await page.evaluate(() => { window.PassioFirstRun = { participationPossible: () => false }; });
    await page.evaluate(() => setEventRsvp("ev0", "maybe"));
    expect(await flow(page)).toEqual([]);
  });

  // MUTATION : remettre le `tel.flowStart` de toggleJoinEvent → DEUX starts pour
  // un seul geste (le premier orphelin, jamais réglé).
  test("⑥ la bascule depuis une carte n'ouvre qu'UN flow, réglé (plus de cid jeté)", async ({ page }) => {
    await bootRsvp(page);
    await page.evaluate(() => { window.supaSetEventRsvp = async () => true; });
    await page.evaluate(() => toggleJoinEvent("ev0"));
    await page.waitForFunction(() => window.__flow.some((e) => e.etape === "end"), null, { timeout: 5000 });
    const evs = chaine(await flow(page));
    expect(evs.filter((e) => e.etape === "start")).toHaveLength(1);
    expect(evs[0].action).toBe("event_join");
    // L'action « intention » de la carte est toujours émise, une fois.
    const actions = await page.evaluate(() => window.__actions.filter((a) => /^event_(join|leave)$/.test(a.name)));
    expect(actions).toEqual([{ name: "event_join", meta: { eventId: "ev0" } }]);
  });

  test("⑦ contrat de source : un seul flowStart RSVP, dans setEventRsvp, gardé par _supaReal", async () => {
    const src = fs.readFileSync(SOURCE_APP07, "utf8");
    const starts = src.match(/tel\.flowStart\(rsvp \? "event_join" : "event_leave"/g) || [];
    expect(starts).toHaveLength(1);
    expect(src).not.toMatch(/tel\.flowStart\(cur \? "event_leave" : "event_join"/);
    expect(src).toMatch(/if \(window\._supaReal && window\.tel && tel\.flowStart\) _rsvpCid = tel\.flowStart\(/);
    // Les deux verdicts (inscription et désinscription) règlent le flow.
    expect((src.match(/_rsvpRegle\(true\)/g) || []).length).toBe(2);
    expect(src).toMatch(/_rsvpRegle\(false, \(rsvp && window\._irlRefusMotif\) \|\| "refus"\)/);
  });
});
