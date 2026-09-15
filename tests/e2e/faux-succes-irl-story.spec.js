// ROB-02 / IRL-04 / CONT-06 — trois succès qui étaient annoncés sans verdict.
//
// La famille (contre-revue Astra, chantier 8) : une écriture optimiste, un
// message de succès, et le verdict du serveur lu trop tard ou pas du tout.
//   ROB-02  — l'inscription à une activité était annoncée (toast, notification,
//             conversation rejointe) AVANT `supaSetEventRsvp`, et un refus ne
//             défaisait rien ;
//   IRL-04  — la promotion depuis la liste d'attente était annoncée à la
//             personne (« tu es inscrit·e ! ») même quand `supaPromoteFromWaitlist`
//             rendait false ;
//   CONT-06 — « Story publiée » partait avant `supaPublishStory`, sans lire son
//             verdict.
// Chaque cas ① ③ ⑤ est éprouvé par RÉINJECTION (rouge sur le code d'avant) ;
// ② ④ ⑥ gardent le chemin nominal. Aucune requête ne part : les fonctions
// serveur sont remplacées par des verdicts programmés, comme dans irl-funnel.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => {
    window._supaReal = true;
    window.__toasts = []; window.__notifs = [];
    window.toast = (t) => window.__toasts.push(String(t));
    window.pushNotification = (t) => window.__notifs.push(String(t));
    ["supaJoinEvent", "supaLoadMyRsvps", "supaCreateEventConversation", "supaJoinEventConversation",
      "supaLeaveEventConversation", "supaInsertNotif", "supaFirstWaitlisted"].forEach((fn) => { window[fn] = async () => null; });
    window.requireAdmission = async () => true;
    window.__rsvp = true; window.__leave = true; window.__promote = true; window.__story = true;
    window.supaSetEventRsvp = async () => window.__rsvp;
    window.supaLeaveEvent = async () => window.__leave;
    window.supaPromoteFromWaitlist = async () => window.__promote;
    window.supaPublishStory = async () => window.__story;
    window.supaInsertNotif = async (to, kind, ref, txt) => { window.__notifs.push(kind + ":" + to + ":" + txt); };
    state.seed.events = [{ id: "ev1", title: "Rando", passion: "musique", emoji: "🎸", city: "Paris", lat: 48.85, lng: 2.35,
      date: Date.now() + 3 * 86400000, time: "10:00", desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [],
      organizerId: "someone_else", status: "active", fromSupabase: true, maxAttendees: 1 }];
    state.user.eventRsvp = {}; state.user.joinedEvents = [];
    renderIRL();
  });
}
const etatEv = (page) => page.evaluate(() => {
  const ev = _findCanonicalEvent("ev1") || allEvents().find((e) => e.id === "ev1");
  return { rsvp: myRsvp("ev1") || null, attendees: ev.attendees.slice(), waitlist: ev.waitlist.slice(), toasts: window.__toasts.slice(), notifs: window.__notifs.slice() };
});

test.describe("ROB-02 — l'inscription attend le verdict", () => {
  test("① refus serveur : l'optimiste est annulé, rien n'est annoncé, personne n'est notifié", async ({ page }) => {
    await banc(page);
    await page.evaluate(async () => { window.__rsvp = false; await setEventRsvp("ev1", "going"); });
    const r = await etatEv(page);
    // RÉINJECTION : sur le code d'avant, rsvp = "going", attendees = [moi], notification « Tu rejoins » émise.
    expect(r.rsvp).toBeNull();
    expect(r.attendees).toEqual([]);
    expect(r.notifs.some((n) => /Tu rejoins|event_join/.test(n)), "ni notification locale ni notification à l'organisateur").toBe(false);
    expect(r.toasts.some((t) => /non enregistrée/.test(t)), "l'échec est dit").toBe(true);
  });

  test("② succès serveur : inscrit, annoncé, organisateur notifié", async ({ page }) => {
    await banc(page);
    await page.evaluate(async () => { await setEventRsvp("ev1", "going"); });
    const r = await etatEv(page);
    expect(r.rsvp).toBe("going");
    expect(r.attendees.length).toBe(1);
    expect(r.notifs.some((n) => /Tu rejoins/.test(n))).toBe(true);
    expect(r.notifs.some((n) => /^event_join:someone_else/.test(n))).toBe(true);
  });

  test("③ désinscription refusée : la place n'est pas rendue à l'écran", async ({ page }) => {
    await banc(page);
    await page.evaluate(async () => { await setEventRsvp("ev1", "going"); window.__toasts = []; window.__leave = false; await setEventRsvp("ev1", null); });
    const r = await etatEv(page);
    // RÉINJECTION : sur le code d'avant, « Désinscrit » est affiché et rsvp = null.
    expect(r.rsvp).toBe("going");
    expect(r.attendees.length).toBe(1);
    expect(r.toasts.some((t) => /Désinscrit$/.test(t))).toBe(false);
    expect(r.toasts.some((t) => /Désinscription non enregistrée/.test(t))).toBe(true);
  });
});

test.describe("IRL-04 — la promotion attend le verdict", () => {
  test("④ promotion refusée : la personne reste en liste d'attente, sans « tu es inscrit·e »", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const ev = _findCanonicalEvent("ev1") || allEvents().find((e) => e.id === "ev1");
      ev.attendees = ["u_autre"]; ev.waitlist = ["u_suivant"]; ev.maxAttendees = 1;
      window.__promote = false; window.__notifs = [];
      await _promoteNextWaitlisted(ev);
      return { attendees: ev.attendees.slice(), waitlist: ev.waitlist.slice(), notifs: window.__notifs.slice() };
    });
    // RÉINJECTION : sur le code d'avant, u_suivant passe en attendees et reçoit « tu es inscrit·e ! ».
    expect(r.waitlist).toEqual(["u_suivant"]);
    expect(r.attendees).toEqual(["u_autre"]);
    expect(r.notifs.some((n) => /inscrit/.test(n))).toBe(false);
  });

  test("⑤ promotion acceptée : la personne monte et est prévenue", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const ev = _findCanonicalEvent("ev1") || allEvents().find((e) => e.id === "ev1");
      ev.attendees = []; ev.waitlist = ["u_suivant"]; ev.maxAttendees = 1;
      window.__notifs = [];
      await _promoteNextWaitlisted(ev);
      return { attendees: ev.attendees.slice(), waitlist: ev.waitlist.slice(), notifs: window.__notifs.slice() };
    });
    expect(r.attendees).toEqual(["u_suivant"]);
    expect(r.waitlist).toEqual([]);
    expect(r.notifs.some((n) => /event_update:u_suivant/.test(n))).toBe(true);
  });

  // IRL-04, second volet (contre-revue Astra, 2026-09-15) : la promotion
  // MANUELLE (bouton « Inscrire » de la liste d'attente, organisateur) restait
  // optimiste — refus serveur simulé → participant ajouté localement, notifié,
  // « Participant inscrit » annoncé.
  test("④ bis promotion manuelle refusée : personne n'est inscrit, rien n'est annoncé, l'échec est dit", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const ev = _findCanonicalEvent("ev1") || allEvents().find((e) => e.id === "ev1");
      ev.organizerId = MY_UID; ev.attendees = ["u_autre"]; ev.waitlist = ["u_suivant"]; ev.maxAttendees = 1;
      window.__promote = false; window.__notifs = []; window.__toasts = [];
      const ok = await promoteWaitlisted("ev1", "u_suivant");
      return { ok, attendees: ev.attendees.slice(), waitlist: ev.waitlist.slice(), notifs: window.__notifs.slice(), toasts: window.__toasts.slice() };
    });
    // RÉINJECTION : sur le code d'avant, attendees = ["u_autre","u_suivant"], notif envoyée, « Participant inscrit ».
    expect(r.ok).toBe(false);
    expect(r.attendees).toEqual(["u_autre"]);
    expect(r.waitlist).toEqual(["u_suivant"]);
    expect(r.notifs).toEqual([]);
    expect(r.toasts.some((t) => /Participant inscrit/.test(t))).toBe(false);
    expect(r.toasts.some((t) => /non enregistrée/.test(t))).toBe(true);
  });

  test("⑤ bis promotion manuelle acceptée : inscrit, prévenu, annoncé", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const ev = _findCanonicalEvent("ev1") || allEvents().find((e) => e.id === "ev1");
      ev.organizerId = MY_UID; ev.attendees = []; ev.waitlist = ["u_suivant"]; ev.maxAttendees = 1;
      window.__promote = true; window.__notifs = []; window.__toasts = [];
      const ok = await promoteWaitlisted("ev1", "u_suivant");
      return { ok, attendees: ev.attendees.slice(), waitlist: ev.waitlist.slice(), notifs: window.__notifs.slice(), toasts: window.__toasts.slice() };
    });
    expect(r.ok).toBe(true);
    expect(r.attendees).toEqual(["u_suivant"]);
    expect(r.waitlist).toEqual([]);
    expect(r.notifs.some((n) => /event_update:u_suivant/.test(n))).toBe(true);
    expect(r.toasts.some((t) => /Participant inscrit/.test(t))).toBe(true);
  });
});

test.describe("CONT-06 — « Story publiée » attend le verdict", () => {
  test("⑥ refus serveur : la story locale est retirée et l'échec est dit", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__story = false; window.__toasts = [];
      state.seed.stories = [];
      const story = { id: "story_x", authorId: MY_UID, authorName: "Moi", text: "hello", content: "hello", createdAt: Date.now() };
      state.seed.stories.unshift(story);
      const ok = await _publierStoryAvecVerdict(story);
      return { ok, reste: state.seed.stories.map((s) => s.id), toasts: window.__toasts.slice() };
    });
    // RÉINJECTION : sur le code d'avant, `_publierStoryAvecVerdict` n'existe pas et « Story publiée » est affiché.
    expect(r.ok).toBe(false);
    expect(r.reste).toEqual([]);
    expect(r.toasts.some((t) => /Story publiée/.test(t))).toBe(false);
    expect(r.toasts.some((t) => /non publiée/.test(t))).toBe(true);
  });

  test("⑦ succès serveur : publiée ; sans compte réel : « sur cet appareil »", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__toasts = []; state.seed.stories = [];
      const story = { id: "story_y", authorId: MY_UID, text: "ok", content: "ok", createdAt: Date.now() };
      state.seed.stories.unshift(story);
      const ok = await _publierStoryAvecVerdict(story);
      const t1 = window.__toasts.slice(); window.__toasts = [];
      window._supaReal = false;
      const ok2 = await _publierStoryAvecVerdict({ id: "story_z", authorId: MY_UID, text: "local", content: "local", createdAt: Date.now() });
      return { ok, t1, ok2, t2: window.__toasts.slice(), reste: state.seed.stories.map((s) => s.id) };
    });
    expect(r.ok).toBe(true);
    expect(r.t1.some((t) => /Story publiée/.test(t))).toBe(true);
    expect(r.reste).toEqual(["story_y"]);
    expect(r.ok2).toBe(true);
    expect(r.t2.some((t) => /sur cet appareil/.test(t))).toBe(true);
  });
});
