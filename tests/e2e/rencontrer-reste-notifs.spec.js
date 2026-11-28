// Rencontrer — LES DERNIERS DÉFAUTS DES NOTIFICATIONS ET DE LA DISCUSSION
// D'ACTIVITÉ (2026-11-27). Faux serveur PostgREST multi-comptes (vrai SDK, vrais
// handlers) ; navigateur seul pour ce qui ne touche pas la base. AUCUNE écriture
// réelle.
//
// Défauts fermés (dossiers DIS et FIC), chacun reproduit avant d'être corrigé :
//
//   n° 138  Rappel de cloche calculé au démarrage SEULEMENT : une PWA laissée
//           ouverte ne voyait jamais s'ouvrir le palier J-7 (①).
//   n° 140  Push « prévenir les inscrits » : les 20 premiers de la liste LOCALE —
//           aucune depuis un appareil qui ne connaît pas encore les inscrits (②).
//   n° 142  Notification réécrite par la base (même identifiant, seconde
//           annulation ou promotion) : forcée « lue » par la mémoire locale (③).
//   n° 146  Activité annulée : sa discussion restait dans la messagerie, muette —
//           un message tapé partait en échec sans un mot (④).
//   n° 148  Réaction emoji : refusée par la base, elle restait peinte, mémorisée
//           et annoncée « Réaction envoyée » ; un visiteur réagissait en local (⑤).
//   n° 150  La fiche ouverte hors de la liste montrait 0 j'aime et aucune
//           réaction (⑥).
//   n° 154  Notification d'un message de groupe : une ligne et une push par
//           membre, sans borne ni arrêt sur le plafond du serveur (⑦).
//   n° 158  Résumé hebdo « près de toi » compté sur Paris par défaut, et une
//           activité sans lieu calculable « proche » de toute ville (⑧).
//   n° 199  Activité d'EXEMPLE : j'aime, réaction et commentaire partaient en
//           base (`event_id = 'e3'`) et échouaient avec « réessaie » (⑨).
//
// Contre-épreuve : chaque cas est rouge sur le code d'avant (HEAD de la branche,
// servi à part) et vert ici.
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");
const { bootOnboarded } = require("./app-helper");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000061";
const B = "bbbbbbbb-0000-4000-8000-000000000062";
const json = (status, body) => ({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" } });
const iso = (ms) => new Date(ms).toISOString().replace("Z", "");
const uidN = (n) => "cccccccc-0000-4000-8000-" + String(n).padStart(12, "0");

// Faux serveur + RPC `prevenir_inscrits_activite` (absente du banc commun), et
// le compte des invocations de `notify-call` (le banc commun ne les journalise pas).
function serveur() {
  const srv = new FauxServeur();
  srv.compte(ORGA, "orga_rn"); srv.compte(B, "bob_rn");
  srv.pk.event_reactions = ["event_id", "user_id", "emoji"];
  srv.push = [];
  srv.prevenirReponse = { ok: true, destinataires: 1, prevenues: 1 };
  const orig = srv.traiter.bind(srv);
  srv.traiter = async function (req) {
    const url = new URL(req.url()); const m = req.method();
    let body = null; try { body = JSON.parse(req.postData() || "null"); } catch (e) {}
    if (m === "POST" && /\/functions\/v1\/notify-call$/.test(url.pathname)) {
      if (body && body.type === "notif") srv.push.push(body);
      return json(200, { ok: true, sent: 0 });
    }
    if (m === "POST" && /\/rest\/v1\/rpc\/prevenir_inscrits_activite$/.test(url.pathname)) return json(200, srv.prevenirReponse);
    return orig(req);
  };
  return srv;
}

function activite(srv, id, extra = {}) {
  const debut = Date.now() + 3 * 86400000;
  const r = Object.assign({ id, author_id: ORGA, organizer_id: ORGA, title: "Atelier " + id, passion_id: "musique", city: "Annecy",
    emoji: "🎸", max_attendees: 40, date_at: iso(debut), end_at: iso(debut + 2 * 3600000), status: "active", co_organizers: [],
    visibilite: "publique", created_at: iso(Date.now() - 3600000), lat: 45.9, lng: 6.12, event_type: "Atelier" }, extra);
  srv.t.events.push(r);
  srv.t.event_attendees.push({ event_id: id, user_id: ORGA, rsvp: "going", created_at: new Date(Date.now() - 3600000).toISOString() });
  return r;
}

async function compte(browser, srv, uid) {
  const ctx = await browser.newContext();
  const o = await ouvrirCompte(ctx, srv, uid, { nom: uid === ORGA ? "orga_rn" : "bob_rn" });
  await o.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
  return { ctx, page: o.page };
}

// L'activité serveur en mémoire, comme après une lecture de Rencontrer, et ma
// réponse connue de l'appareil.
async function charger(page, id, rsvp) {
  await page.evaluate(async ([id, rsvp]) => {
    const ev = (await supaLoadEvents()).find((e) => e.id === id);
    state.seed.events = (state.seed.events || []).filter((e) => e.id !== id);
    state.seed.events.unshift(ev);
    if (rsvp !== undefined) _setMyRsvpLocal(id, rsvp);
    saveState();
  }, [id, rsvp]);
}

const toasts = (page) => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
const raz = (page) => page.evaluate(() => { window.__toasts = []; });

test.describe("Rencontrer — derniers défauts des notifications et de la discussion", () => {
  test.setTimeout(150000);

  test("① n° 138 — PWA restée ouverte : le palier J-7 s'ouvre au retour au premier plan, une seule fois", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_rn_1", { date_at: iso(Date.now() + 8 * 86400000), end_at: iso(Date.now() + 8 * 86400000 + 7200000) });
    srv.t.event_attendees.push({ event_id: "evt_rn_1", user_id: B, rsvp: "going", created_at: new Date().toISOString() });
    const { ctx, page } = await compte(browser, srv, B);
    try {
      // La relecture des activités du démarrage (et son passage des rappels) est
      // finie : un passage TARDIF du démarrage ne doit pas se faire passer pour la relance.
      await page.waitForFunction(() => !_evenementsLectureEnVol && _evenementsLusA > 0, null, { timeout: 20000 });
      await page.waitForTimeout(300);
      await charger(page, "evt_rn_1", "going");
      const rappels = () => page.evaluate(() => (state.notifications || []).filter((n) => n && n.kind === "event_reminder").map((n) => n.id));
      // Le passage du démarrage, à J-8 : rien.
      await page.evaluate(() => _checkEventReminders());
      expect(await rappels()).toEqual([]);
      // Deux jours « passent » sans recharger (l'activité est à J-6), plus de
      // 10 minutes depuis le dernier passage ; l'appli revient au premier plan.
      await page.evaluate(() => {
        const ev = state.seed.events.find((e) => e.id === "evt_rn_1");
        ev.date = Date.now() + 6 * 86400000;
        window._rappelsPasseA = Date.now() - 11 * 60 * 1000;
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect.poll(rappels).toEqual(["rappel_evt_rn_1:d7"]);
      // Un second retour ne double rien.
      await page.evaluate(() => { window._rappelsPasseA = Date.now() - 11 * 60 * 1000; document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pageshow")); });
      await page.waitForTimeout(300);
      expect(await rappels()).toEqual(["rappel_evt_rn_1:d7"]);
    } finally { await ctx.close(); }
  });

  test("② n° 140 — liste locale vide : les inscrits sont relus et réveillés, venants d'abord, sous le plafond", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_rn_2");
    const venants = [], attente = [];
    for (let i = 1; i <= 20; i++) { venants.push(uidN(i)); srv.t.event_attendees.push({ event_id: "evt_rn_2", user_id: uidN(i), rsvp: "going", created_at: new Date().toISOString() }); }
    for (let i = 21; i <= 25; i++) { attente.push(uidN(i)); srv.t.event_attendees.push({ event_id: "evt_rn_2", user_id: uidN(i), rsvp: "waitlist", created_at: new Date().toISOString() }); }
    srv.prevenirReponse = { ok: true, destinataires: 25, prevenues: 25 };
    const { ctx, page } = await compte(browser, srv, ORGA);
    try {
      // Un appareil qui ne connaît pas les inscrits (copie sans listes, jamais lue).
      const v = await page.evaluate((orga) => _prevenirInscrits({ id: "evt_rn_2", organizerId: orga, fromSupabase: true, attendees: [], maybes: [], waitlist: [] }, "event_update", "On décale à 19 h"), ORGA);
      expect(v.total).toBe(25);
      await expect.poll(() => new Set(srv.push.map((p) => p.toUserId)).size).toBeGreaterThan(0);
      await page.waitForTimeout(500);
      const cibles = srv.push.map((p) => p.toUserId);
      // Sous le plafond de notify-call (20/min), sans doublon, venants d'abord.
      expect(cibles.length).toBeLessThanOrEqual(20);
      expect(new Set(cibles).size).toBe(cibles.length);
      cibles.forEach((u) => expect(venants).toContain(u));
      expect(srv.push.every((p) => p.kind === "event_update")).toBe(true);
    } finally { await ctx.close(); }
  });

  test("③ n° 142 — une notification réécrite par la base (même id, plus récente) redevient non lue ; sans réécriture, elle reste lue", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_rn_3");
    const ID = "n_pi_rn3_cancelled_b";
    srv.t.notifications.push({ id: ID, user_id: B, kind: "event_cancelled", from_id: ORGA, ref_id: "evt_rn_3", content: "a annulé un événement auquel tu participais", seen: false, created_at: iso(Date.now() - 2 * 86400000) });
    const { ctx, page } = await compte(browser, srv, B);
    try {
      const etat = () => page.evaluate((id) => { const n = (state.notifications || []).find((x) => x.id === id); return n ? { unread: !!n.unread } : null; }, ID);
      await page.evaluate(() => supaLoadNotifications().then((ns) => mergeSupaNotifs(ns)));
      await expect.poll(etat).toEqual({ unread: true });
      // La cloche est ouverte puis fermée : tout est lu (en base aussi).
      await page.evaluate(() => { openNotifications(); });
      await expect.poll(etat).toEqual({ unread: false });
      await expect.poll(() => srv.t.notifications.find((n) => n.id === ID).seen).toBe(true);
      await page.evaluate(() => closeModal());
      // Non-régression : une relecture SANS réécriture reste lue (même si la base
      // n'avait pas encore propagé le « vu »).
      srv.t.notifications.find((n) => n.id === ID).seen = false;
      await page.evaluate(() => supaLoadNotifications().then((ns) => mergeSupaNotifs(ns)));
      expect(await etat()).toEqual({ unread: false });
      // Seconde annulation : la base réécrit la MÊME ligne, non lue, datée de maintenant.
      const ligne = srv.t.notifications.find((n) => n.id === ID);
      ligne.seen = false; ligne.created_at = iso(Date.now());
      await page.evaluate(() => supaLoadNotifications().then((ns) => mergeSupaNotifs(ns)));
      await expect.poll(etat).toEqual({ unread: true });
      // Et la même ligne livrée en direct se dit (toast), une fois relue comme vue.
      await page.evaluate(() => { openNotifications(); });
      await expect.poll(etat).toEqual({ unread: false });
      await page.evaluate(() => closeModal());
      await raz(page);
      await page.evaluate(([id, orga]) => _rtNotificationRecue({ id, user_id: MY_UID, kind: "event_cancelled", from_id: orga, ref_id: "evt_rn_3", content: "a annulé un événement auquel tu participais", seen: false, created_at: new Date(Date.now() + 1000).toISOString() }), [ID, ORGA]);
      await expect.poll(etat).toEqual({ unread: true });
      await expect.poll(() => toasts(page)).toEqual(expect.arrayContaining([expect.stringContaining("annulé")]));
    } finally { await ctx.close(); }
  });

  test("④ n° 146 — activité annulée : la discussion est marquée fermée, et un message tapé ne part pas en silence", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_rn_4", { status: "cancelled" });
    srv.t.event_attendees.push({ event_id: "evt_rn_4", user_id: B, rsvp: "going", created_at: new Date().toISOString() });
    const conv = "evgrp_evt_rn_4";
    srv.t.events.find((e) => e.id === "evt_rn_4").conv_id = conv;
    srv.t.conversations.push({ id: conv, is_group: true, group_name: "📍 Atelier", created_by: ORGA, created_at: new Date().toISOString() });
    [ORGA, B].forEach((u) => srv.t.conv_members.push({ conv_id: conv, user_id: u }));
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_rn_4", "going");
      // La conversation, telle qu'un appareil la garde (relue avant l'annulation).
      await page.evaluate((c) => {
        const convs = getConversations();
        if (!convs.some((x) => x.id === c)) convs.unshift({ id: c, isGroup: true, groupName: "📍 Atelier evt_rn_4", userIds: [MY_UID], lastAt: Date.now(), messages: [] });
        conversationsState = convs; saveConversations();
        goTo("messages"); renderMessages();
      }, conv);
      await expect(page.locator(`.msg-card[data-conv-id="${conv}"]`)).toContainText("Activité annulée — discussion fermée");
      await page.evaluate((c) => openConversation(c), conv);
      await expect(page.locator("#convFpHead")).toContainText("Activité annulée — discussion fermée");
      await raz(page);
      const j0 = srv.journal.length;
      await page.evaluate((c) => { document.getElementById("convFpInput").value = "Désolé, report à samedi"; sendMessageFp(c, "Atelier"); }, conv);
      await expect.poll(() => toasts(page)).toEqual(expect.arrayContaining([expect.stringContaining("discussion fermée")]));
      expect(await page.evaluate(() => document.getElementById("convFpInput").value)).toBe("Désolé, report à samedi");
      await page.waitForTimeout(400);
      expect(srv.journal.slice(j0).filter((r) => r.table === "conv_messages" && r.m === "POST")).toHaveLength(0);
      // Depuis la fiche : on dit pourquoi.
      await page.evaluate(() => closeConversation());
      await raz(page);
      await page.evaluate(() => openEventChat("evt_rn_4"));
      await expect.poll(() => toasts(page)).toEqual(expect.arrayContaining([expect.stringContaining("Activité annulée")]));
    } finally { await ctx.close(); }
  });

  test("⑤ n° 148 — réaction emoji refusée par la base : rien ne reste, et c'est dit ; acceptée : un seul toast", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_rn_5");
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_rn_5");
      srv.pannes.push({ table: "event_reactions", methode: "POST", status: 403, body: { code: "42501", message: "new row violates row-level security policy" }, fois: 1 });
      await raz(page);
      await page.evaluate(() => applyEventEmojiReaction("evt_rn_5", ["🔥"]));
      await expect.poll(() => toasts(page)).toEqual(expect.arrayContaining([expect.stringContaining("Réaction non enregistrée")]));
      const apres = await page.evaluate(() => ({ mienne: (state.user.eventReactions || {})["evt_rn_5"] || null, feu: ((window._eventLikes || {})["evt_rn_5"] || { emojiCounts: {} }).emojiCounts["🔥"] || 0 }));
      expect(apres).toEqual({ mienne: null, feu: 0 });
      expect((await toasts(page)).some((t) => /Réaction envoyée/.test(t))).toBe(false);
      // Acceptée : en base, et UN toast de succès.
      await raz(page);
      await page.evaluate(() => applyEventEmojiReaction("evt_rn_5", ["🔥"]));
      await expect.poll(() => srv.t.event_reactions.filter((r) => r.event_id === "evt_rn_5" && r.user_id === B && r.emoji === "🔥").length).toBe(1);
      await expect.poll(() => toasts(page)).toEqual(["Réaction envoyée 🔥"]);
      expect(await page.evaluate(() => (state.user.eventReactions || {})["evt_rn_5"])).toBe("🔥");
    } finally { await ctx.close(); }
  });

  test("⑥ n° 150 — fiche ouverte hors de la liste : les j'aime et réactions de l'activité sont lus", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_rn_6");
    for (let i = 1; i <= 3; i++) srv.t.event_reactions.push({ event_id: "evt_rn_6", user_id: uidN(100 + i), emoji: "❤️", created_at: new Date().toISOString() });
    for (let i = 1; i <= 2; i++) srv.t.event_reactions.push({ event_id: "evt_rn_6", user_id: uidN(200 + i), emoji: "🔥", created_at: new Date().toISOString() });
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_rn_6");
      await page.evaluate(() => { window._eventLikes = {}; openEventDetails("evt_rn_6"); });
      await expect(page.locator('#eventDetailContent [data-evlike="evt_rn_6"]').first()).toContainText("3", { timeout: 10000 });
      await expect(page.locator('#eventDetailContent [data-evchipholder="evt_rn_6"]').first()).toContainText("2");
    } finally { await ctx.close(); }
  });

  test("⑦ n° 154 — message de groupe : lignes et pushes bornées, arrêt au premier refus de débit", async ({ browser }) => {
    const srv = serveur();
    const conv = "grp_rn_7";
    srv.t.conversations.push({ id: conv, is_group: true, group_name: "Les cent", created_by: B, created_at: new Date().toISOString() });
    srv.t.conv_members.push({ conv_id: conv, user_id: B });
    for (let i = 1; i <= 99; i++) srv.t.conv_members.push({ conv_id: conv, user_id: uidN(300 + i) });
    const { ctx, page } = await compte(browser, srv, B);
    try {
      const lignes = (j0) => srv.journal.slice(j0).filter((r) => r.table === "notifications" && r.m === "POST").length;
      let j0 = srv.journal.length;
      await page.evaluate((c) => _notifierMessage(c, "msg_rn_7a"), conv);
      const n1 = lignes(j0);
      expect(n1).toBeGreaterThan(0);
      expect(n1, "sous les 60 lignes/min de la base").toBeLessThanOrEqual(50);
      expect(srv.push.length, "sous les 20 invocations/min de notify-call").toBeLessThanOrEqual(15);
      expect(srv.push.length).toBeGreaterThan(0);
      // Le plafond de débit de la base : la première ligne refusée arrête la boucle.
      srv.pannes.push({ table: "notifications", methode: "POST", status: 400, body: { code: "P0001", message: "rate limit: max 60 insertions/minute sur notifications", details: null, hint: null } });
      await page.evaluate((c) => { window._msgNotifDerniere = {}; return _notifierMessage(c, "msg_rn_7b"); }, conv);
      j0 = srv.journal.length;
      await page.evaluate((c) => { window._msgNotifDerniere = {}; return _notifierMessage(c, "msg_rn_7c"); }, conv);
      expect(lignes(j0)).toBe(1);
    } finally { await ctx.close(); }
  });

  test("⑧ n° 158 — résumé hebdo : jamais « près de toi » sans position, et une activité sans lieu ne compte pas pour une ville", async ({ page }) => {
    await bootOnboarded(page);
    const lancer = (cas) => page.evaluate((cas) => {
      irlSelectedCity = cas.ville || null;
      irlUserLocation = null;
      state.userEvents = [];
      state.user.joinedEvents = [];
      state.seed.events = [];
      const now = Date.now();
      cas.evs.forEach((e, i) => state.seed.events.unshift(Object.assign({
        date: now + (i + 1) * 86400000, time: "18:00", passion: "musique", emoji: "🎸",
        attendees: [], maybes: [], waitlist: [], organizerId: "a1a1a1a1-0000-4000-8000-000000000001", status: "active",
      }, e)));
      localStorage.removeItem(IRL_DIGEST_KEY);
      state.notifications = [];
      _irlWeeklyDigest();
      return { textes: state.notifications.filter((n) => String(n.id || "").indexOf(NOTIF_DIGEST_IRL_PREFIXE) === 0).map((n) => n.text), semaine: localStorage.getItem(IRL_DIGEST_KEY) };
    }, cas);
    // Sans ville ni position : une activité à Paris ne se dit pas « près de toi ».
    const sans = await lancer({ evs: [{ id: "7b9e0f12-3456-4789-8abc-def012345681", title: "Jam à Paris", city: "Paris", lat: 48.857, lng: 2.352 }] });
    expect(sans.textes).toHaveLength(1);
    expect(sans.textes[0]).not.toContain("près de toi");
    expect(sans.textes[0]).toContain("sur PASSIO");
    // Ville = Lille, une seule activité, sans coordonnées et de ville inconnue : rien.
    const lille = await lancer({ ville: { id: "lille", name: "Lille", coords: [50.6292, 3.0573] },
      evs: [{ id: "7b9e0f12-3456-4789-8abc-def012345682", title: "Sans lieu", city: "Xyzzyville" }] });
    expect(lille.textes).toEqual([]);
    expect(lille.semaine).toBeNull();
  });

  test("⑨ n° 199 — activité d'exemple, compte connecté : ni j'aime, ni réaction, ni commentaire ne partent en base, et c'est expliqué", async ({ browser }) => {
    const srv = serveur();
    const { ctx, page } = await compte(browser, srv, B);
    try {
      expect(await page.evaluate(() => allEvents().some((e) => e.id === "e3")), "prémisse : l'exemple e3 est là").toBe(true);
      const j0 = srv.journal.length;
      await raz(page);
      await page.evaluate(() => { toggleEventLike("e3", null); applyEventEmojiReaction("e3", ["🔥"]); });
      await page.evaluate(() => openEventDetails("e3"));
      await page.evaluate(() => { const i = document.getElementById("eventCommentInput"); if (i) i.value = "Encore des places ?"; addEventComment("e3"); });
      await page.waitForTimeout(800);
      const ecrits = srv.journal.slice(j0).filter((r) => (r.table === "event_reactions" || r.table === "event_comments") && r.m !== "GET");
      expect(ecrits).toHaveLength(0);
      const t = await toasts(page);
      expect(t.some((x) => /exemple/i.test(x))).toBe(true);
      expect(t.some((x) => /réessaie/i.test(x))).toBe(false);
      expect(await page.evaluate(() => ({ like: (state.user.likedEvents || []).includes("e3"), reaction: (state.user.eventReactions || {}).e3 || null, champ: document.getElementById("eventCommentInput").value })))
        .toEqual({ like: false, reaction: null, champ: "Encore des places ?" });
    } finally { await ctx.close(); }
  });
});
