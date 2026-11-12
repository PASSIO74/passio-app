// ═══════════════════════════════════════════════════════════════════════════
// LOT-7 (audit UX/UI du 2026-11-10) — DES RÉGLAGES QUI FONT CE QU'ILS DISENT
//   ① TRA-C04 : le panneau Notifications ne montre plus cinq interrupteurs
//        inertes ; il dit ce qui notifie et l'état du téléphone ; le récap reste.
//   ② TRA-C05 : « Bien-être digital » (compteur à 0, limite et pause sans effet)
//        a disparu, entrée et fonctions.
//   ③ MSG-C02 : une conversation en sourdine ne sonne pas, n'entre pas dans la
//        cloche, ne compte pas aux badges ; sa ligne le montre.
//   ④ TRA-C15 : le rappel d'une activité du lendemain dit « demain ».
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUTRE = "11111111-2222-4333-8444-555555555555";

test("① TRA-C04 : plus d'interrupteur inerte ; ce qui notifie est dit ; le récap s'enregistre", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => openNotifSettings());
  const m = page.locator("#modalContent");
  for (const id of ["notifPosts", "notifMessages", "notifLikes", "notifEvents", "notifSystem"]) {
    await expect(m.locator("#" + id), id + " : retiré").toHaveCount(0);
  }
  await expect(m.locator(".notif-ce-qui-notifie")).toContainText("messages");
  await expect(m.locator("[data-notif-perm]")).toHaveCount(1);
  await m.locator("#notifRecap").uncheck();
  await m.locator("button", { hasText: "Sauvegarder" }).click();
  expect(await page.evaluate(() => getCurrentConfig().notifs)).toEqual({ recap: false });
});

test("② TRA-C05 : « Bien-être digital » a disparu, entrée et fonctions", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => ({
    texte: document.body.innerHTML.includes("Bien-être digital"),
    fonctions: ["openScreenTime", "openPauseMode", "activatePause", "askParentalCode"].filter((f) => typeof window[f] === "function"),
  }));
  expect(r.texte).toBe(false);
  expect(r.fonctions).toEqual([]);
});

test("③ MSG-C02 : une conversation en sourdine ne sonne pas, ne s'ajoute pas à la cloche, ne compte pas aux badges", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (autre) => {
    window.__sons = 0;
    window._playMsgSound = () => { window.__sons++; };
    const cs = getConversations();
    cs.push({ id: "c_sourdine", userId: autre, userName: "Tom Girard", messages: [], lastAt: Date.now() - 5000, unread: 0, _muted: true });
    cs.push({ id: "c_normale", userId: "22222222-3333-4444-8555-666666666666", userName: "Léa", messages: [], lastAt: Date.now() - 6000, unread: 0 });
    saveConversationsNow();
    const notifsAvant = (state.notifications || []).length;
    const ligne = (id, from, txt) => ({ id, conv_id: id === "m1" ? "c_sourdine" : "c_normale", from_id: from, content: txt, created_at: new Date().toISOString().replace("Z", "") });
    await _handleIncomingConvMessage(ligne("m1", autre, "Tu viens ?"));
    const apresSourdine = { sons: window.__sons, notifs: (state.notifications || []).length - notifsAvant, nonLus: _convNonLus(), unreadLigne: getConversations().find((c) => c.id === "c_sourdine").unread };
    // La même notification écrite en base par l'expéditeur, arrivée par la cloche.
    mergeSupaNotifs([{ id: "n_srv_1", kind: "message", refId: "c_sourdine", fromId: autre, text: "Tom t'a envoyé un message", createdAt: Date.now(), unread: true, fromSupabase: true }]);
    const serveurEcarte = !(state.notifications || []).some((n) => n.id === "n_srv_1");
    // Témoin : une conversation NON coupée sonne et compte.
    await _handleIncomingConvMessage(ligne("m2", "22222222-3333-4444-8555-666666666666", "Coucou"));
    goTo("messages"); renderMessages();
    const marque = !!document.querySelector(".msg-card .msg-sourdine");
    return { apresSourdine, serveurEcarte, temoin: { sons: window.__sons, nonLus: _convNonLus() }, marque };
  }, AUTRE);
  expect(r.apresSourdine).toEqual({ sons: 0, notifs: 0, nonLus: 0, unreadLigne: 1 });
  expect(r.serveurEcarte, "la notification du serveur n'entre pas dans la cloche").toBe(true);
  expect(r.temoin, "témoin : la conversation normale sonne et compte").toEqual({ sons: 1, nonLus: 1 });
  expect(r.marque, "la ligne montre la sourdine").toBe(true);
});

test("④ TRA-C15 : une activité dans 26 h est rappelée « demain », pas « dans une semaine »", async ({ page }) => {
  await bootOnboarded(page);
  const texte = await page.evaluate(() => {
    localStorage.removeItem("passio_event_reminded");
    // Demain à 22:41, quelle que soit l'heure du banc : « demain » en jours de calendrier.
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(22, 41, 0, 0);
    state.seed.events = [{ id: "ev_l7", title: "Atelier réglage de guitare", passion: "musique", date: d.getTime(), time: "22:41", city: "Lyon", organizerId: "u_lea", attendees: [], maybes: [], waitlist: [] }];
    state.userEvents = [];
    state.user.joinedEvents = ["ev_l7"];
    state.notifications = [];
    _checkEventReminders();
    const n = (state.notifications || []).find((x) => x.kind === "event_reminder" && x.refId === "ev_l7");
    return n ? n.text : null;
  });
  expect(texte).toContain("demain");
  expect(texte).not.toContain("dans une semaine");
});
