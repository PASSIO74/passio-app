// IRL-10 — rejoindre la discussion d'une activité : le refus du serveur est lu
// et rendu, la discussion n'apparaît que si l'on y est vraiment.
//
// LE DÉFAUT (contre-revue Astra, chantier 8). `_joinEventConversation` (app-07)
// ignorait le verdict de `supaJoinEventConversation` et créait le miroir local
// quoi qu'il arrive ; `openEventChat` ouvrait alors une conversation où rien
// ne pouvait s'écrire (403 sur chaque message). Le cas concret : une discussion
// créée par un CO-ORGANISATEUR, que `can_join_event_conversation` n'admettait
// pas (corrigé par `migration_discussion_coorganisateur_2026-09-14.sql`,
// éprouvée par son banc SQL). Ce que cette suite exige côté client :
//   ① refus serveur → pas de miroir local, « Impossible de rejoindre », on
//     reste sur la fiche (RÉINJECTION : rouge sur le code d'avant) ;
//   ② acceptation → miroir créé, Messages ouvert sur la discussion ;
//   ③ déjà membre localement → aucune nouvelle demande, ouverture directe ;
//   ④ la création par un gestionnaire lit aussi le verdict de son entrée.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => {
    window._supaReal = true;
    window.__toasts = []; window.toast = (t) => window.__toasts.push(String(t));
    window.__join = true; window.__joinAppels = 0;
    window.supaJoinEventConversation = async () => { window.__joinAppels++; return window.__join; };
    window.supaUpdateEvent = async () => true;
    window.openConversation = async (id) => { window.__ouverte = id; };
    conversationsState = (typeof getConversations === "function" ? getConversations() : []).filter((c) => c.id !== "evgrp_ev1");
    saveConversationsNow();
    state.seed.events = [{ id: "ev1", title: "Rando", passion: "musique", emoji: "🎸", city: "Paris", lat: 48.85, lng: 2.35,
      date: Date.now() + 3 * 86400000, time: "10:00", desc: "", attendees: [MY_UID], maybes: [], waitlist: [], checkedIn: [],
      organizerId: "someone_else", coOrganizers: ["co_org"], convId: "evgrp_ev1", status: "active", fromSupabase: true }];
    state.user.eventRsvp = { ev1: "going" }; state.user.joinedEvents = ["ev1"];
    renderIRL();
  });
}
const miroir = (page) => page.evaluate(() => getConversations().some((c) => c.id === "evgrp_ev1"));

test.describe("IRL-10 — la discussion d'une activité n'apparaît que si l'on y est", () => {
  test("① refus serveur : pas de miroir local, l'échec est dit, on reste sur la fiche", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => { window.__join = false; await openEventChat("ev1"); return { ouverte: window.__ouverte || null, toasts: window.__toasts.slice(), appels: window.__joinAppels }; });
    // RÉINJECTION : sur le code d'avant, le miroir est créé et Messages s'ouvre sur une discussion inaccessible.
    expect(r.appels).toBe(1);
    expect(await miroir(page)).toBe(false);
    expect(r.ouverte).toBeNull();
    expect(r.toasts.some((t) => /Impossible de rejoindre/.test(t))).toBe(true);
  });

  test("② acceptation : miroir créé, Messages ouvert sur la discussion", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => { await openEventChat("ev1"); await new Promise((res) => setTimeout(res, 300)); return { ouverte: window.__ouverte || null, appels: window.__joinAppels }; });
    expect(r.appels).toBe(1);
    expect(await miroir(page)).toBe(true);
    expect(r.ouverte).toBe("evgrp_ev1");
  });

  test("③ déjà membre localement : aucune nouvelle demande, ouverture directe", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      _ensureLocalEventConv(_findCanonicalEvent("ev1"));
      window.__join = false; // un refus n'aurait aucune occasion de se produire
      await openEventChat("ev1"); await new Promise((res) => setTimeout(res, 300));
      return { ouverte: window.__ouverte || null, appels: window.__joinAppels };
    });
    expect(r.appels).toBe(0);
    expect(r.ouverte).toBe("evgrp_ev1");
  });

  test("④ le gestionnaire qui crée la discussion : entrée lue ; créateur non membre = pas de discussion", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const ev = _findCanonicalEvent("ev1"); ev.convId = null; ev.organizerId = MY_UID;
      window.__creerMembre = { error: { code: "42501", message: "rls" } };
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: (table) => ({
        insert: () => Promise.resolve(table === "conv_members" ? window.__creerMembre : { error: null }),
      }) });
      window.supaEnsureProfileExists = async () => true;
      const conv1 = await supaCreateEventConversation(ev);
      window.__creerMembre = { error: null };
      const conv2 = await supaCreateEventConversation(ev);
      return { conv1, conv2 };
    });
    // RÉINJECTION : sur le code d'avant, conv1 vaut "evgrp_ev1" malgré le refus d'entrée.
    expect(r.conv1).toBeNull();
    expect(r.conv2).toBe("evgrp_ev1");
  });
  // ⑤ C-04 (troisième contre-revue, 2026-11-03) : la liste des membres d'une
  // discussion d'activité EST la liste des venants — un « peut-être » (qui se
  // pose même sur une activité complète) n'y entre plus, et quitter « je viens »
  // la quitte. Le serveur le refuse aussi (`can_join_event_conversation`).
  test("⑤ « peut-être » n'entre pas dans la discussion ; passer de « je viens » à « peut-être » la quitte", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const out = {};
      state.user.eventRsvp = { ev1: "maybe" }; state.user.joinedEvents = [];
      await openEventChat("ev1"); await new Promise((res) => setTimeout(res, 200));
      out.appelsPeutEtre = window.__joinAppels;
      out.ouvertePeutEtre = window.__ouverte || null;
      out.toastPeutEtre = window.__toasts.slice(-1)[0] || "";
      // Le chemin de l'inscription : on observe la DÉCISION (entrer ou sortir),
      // le serveur de l'inscription répond « accepté ».
      state.user.eventRsvp = { ev1: "going" }; state.user.joinedEvents = ["ev1"];
      window.__decisions = [];
      const vraiJoin = window._joinEventConversation, vraiLeave = window._leaveEventConversation;
      window._joinEventConversation = async () => { window.__decisions.push("entre"); return true; };
      window._leaveEventConversation = async () => { window.__decisions.push("sort"); };
      window.requireAuthentication = () => true;
      window.requireAdmission = async () => true;
      window.supaSetEventRsvp = async () => true;
      window.supaInsertNotif = async () => true;
      window.supaFirstWaitlisted = async () => null;
      window.supaPromoteFromWaitlist = async () => false;
      try {
        await setEventRsvp("ev1", "maybe");
        out.versPeutEtre = window.__decisions.slice();
        window.__decisions = [];
        await setEventRsvp("ev1", "going");
        out.versJeViens = window.__decisions.slice();
      } finally { window._joinEventConversation = vraiJoin; window._leaveEventConversation = vraiLeave; }
      return out;
    });
    expect(r.appelsPeutEtre, "« peut-être » : aucune demande d'entrée au serveur").toBe(0);
    expect(r.ouvertePeutEtre, "…et aucune discussion ouverte").toBeNull();
    expect(r.toastPeutEtre).toMatch(/Je viens/);
    expect(await miroir(page), "aucun miroir local").toBe(false);
    expect(r.versPeutEtre, "je viens → peut-être : la discussion est quittée, jamais rejointe").toEqual(["sort"]);
    expect(r.versJeViens, "peut-être → je viens : la discussion est rejointe").toEqual(["entre"]);
  });
});
