// Rappels d'activité (2026-10-05) — la moitié TÉLÉPHONE.
//
// Le serveur pousse les rappels J-1 et H-2 même appli fermée
// (supabase/functions/_shared/rappels.js, éprouvé par tests/unit/rappels.test.mjs,
// service worker compris). Ce que CETTE suite prouve, dans la page :
//   ① toucher un rappel pendant que l'application est ouverte l'amène sur
//      l'activité — le service worker confie l'identifiant (`OUVRIR_ACTIVITE`)
//      et c'est le routeur `#irl-event-` qui ouvre, jamais un second chemin ;
//   ② même quand le hash désigne DÉJÀ cette activité (aucun `hashchange`) ;
//   ③ un identifiant hors forme ne fait rien ;
//   ④ le rappel de la cloche (dans la page) n'est plus une ligne inerte : le
//      toucher ouvre l'activité ;
//   ⑤–⑧ l'abonnement aux push est PROPOSÉ juste après une inscription confirmée
//      — sans quoi personne n'est abonné et aucun rappel ne part — et jamais
//      hors de ce moment (refus serveur, activité trop proche, permission déjà
//      tranchée, visiteur, « Plus tard » récent, fenêtre ouverte, coupure).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const EVENT_SEED = "e1"; // « Jam session guitaristes débutants », présent dès le boot

function ficheOuverte(page, timeout = 15000) {
  return page.waitForFunction(() => {
    const el = document.getElementById("eventDetailPage");
    return !!(el && el.style && el.style.display !== "none");
  }, null, { timeout });
}
const ficheVisible = (page) => page.evaluate(() => {
  const el = document.getElementById("eventDetailPage");
  return !!(el && el.style && el.style.display !== "none");
});

/** Ce que fait sw.js au tap quand une fenêtre est ouverte : un message à la page. */
const messageDuServiceWorker = (page, data) => page.evaluate((d) => {
  navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: d }));
}, data);

test.describe("Rappels d'activité — le tap ouvre l'activité", () => {
  test("① OUVRIR_ACTIVITE ouvre la fiche de l'activité", async ({ page }) => {
    await bootOnboarded(page);
    expect(await ficheVisible(page)).toBe(false);
    await messageDuServiceWorker(page, { type: "OUVRIR_ACTIVITE", id: EVENT_SEED });
    await ficheOuverte(page);
    const texte = await page.evaluate(() => document.getElementById("eventDetailPage").textContent);
    expect(texte).toContain("Jam session");
  });

  test("② le hash désigne déjà l'activité : elle s'ouvre quand même", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate((id) => { history.replaceState(null, "", "#irl-event-" + id); }, EVENT_SEED);
    expect(await ficheVisible(page)).toBe(false);
    await messageDuServiceWorker(page, { type: "OUVRIR_ACTIVITE", id: EVENT_SEED });
    await ficheOuverte(page);
  });

  test("③ un identifiant hors forme, ou un autre message, ne fait rien", async ({ page }) => {
    await bootOnboarded(page);
    const avant = await page.evaluate(() => location.hash);
    await messageDuServiceWorker(page, { type: "OUVRIR_ACTIVITE", id: "e1\"><img src=x>" });
    await messageDuServiceWorker(page, { type: "OUVRIR_ACTIVITE", id: "" });
    await messageDuServiceWorker(page, { type: "AUTRE_CHOSE", id: EVENT_SEED });
    await page.waitForTimeout(1500);
    expect(await ficheVisible(page)).toBe(false);
    expect(await page.evaluate(() => location.hash)).toBe(avant);
  });

  test("④ le rappel de la cloche se touche et ouvre l'activité", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate((id) => {
      localStorage.removeItem("passio_event_reminded");
      const ev = state.seed.events.find((e) => e.id === id);
      ev.date = Date.now() + 90 * 60e3;
      ev.status = "active";
      state.user.joinedEvents = [id];
      state.notifications = [];
      _checkEventReminders();
    }, EVENT_SEED);
    const n = await page.evaluate(() => state.notifications[0] && {
      kind: state.notifications[0].kind, refId: state.notifications[0].refId, text: state.notifications[0].text });
    expect(n, "un rappel est posé dans la cloche").toBeTruthy();
    expect(n.kind).toBe("event_reminder");
    expect(n.refId).toBe(EVENT_SEED);
    expect(n.text).toMatch(/^Rappel : <b>Jam session/);

    await page.evaluate(() => openNotifications());
    await page.locator(".notif-row").first().click();
    await ficheOuverte(page);
  });

  test("⑤ inscription CONFIRMÉE : la proposition s'ouvre, « Activer » demande la permission puis abonne", async ({ page }) => {
    await bancInscription(page, { permission: "default" });
    await page.evaluate((id) => setEventRsvp(id, "going"), EVENT_SEED);
    await expect(page.locator("#modalBackdrop.active #_rappelsOuiBtn")).toBeVisible();
    const sous = await page.locator("#modalBackdrop.active .modal-subtitle").textContent();
    expect(sous).toContain("la veille et 2 h avant");
    expect(sous).toContain("Jam session");
    await page.locator("#_rappelsOuiBtn").click();
    await page.waitForFunction(() => window.__abonnements === 1);
    const r = await page.evaluate(() => ({ demandes: window.__demandes, tel: window.__telCap.map((t) => t.name),
      memo: !!localStorage.getItem("passio_rappels_proposes_v1") }));
    expect(r.demandes).toBe(1);
    expect(r.tel).toEqual(expect.arrayContaining(["rappels_proposes", "rappels_actives"]));
    expect(r.memo).toBe(true);
  });

  test("⑥ refus serveur : rien n'est proposé (l'inscription n'existe pas)", async ({ page }) => {
    await bancInscription(page, { permission: "default", rsvpOk: false });
    await page.evaluate((id) => setEventRsvp(id, "going"), EVENT_SEED);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => !!document.querySelector("#modalBackdrop.active #_rappelsOuiBtn"))).toBe(false);
  });

  test("⑦ le verdict se tait hors du bon moment ; permission déjà accordée → abonnement SILENCIEUX", async ({ page }) => {
    await bancInscription(page, { permission: "default" });
    const v = await page.evaluate((id) => {
      const ev = _findCanonicalEvent(id);
      const n = Date.now();
      const out = {};
      out.proposer = _rappelsVerdict(ev, n);
      out.tropTard = _rappelsVerdict({ ...ev, date: n + 90 * 60e3 }, n);
      localStorage.setItem("passio_rappels_proposes_v1", String(n - 3 * 864e5));
      out.repos = _rappelsVerdict(ev, n);
      localStorage.setItem("passio_rappels_proposes_v1", String(n - 15 * 864e5));
      out.reposFini = _rappelsVerdict(ev, n);
      openModal("<div>autre fenêtre</div>");
      out.fenetre = _rappelsVerdict(ev, n);
      closeModal();
      window._uidEstUnCompte = () => false;
      out.visiteur = _rappelsVerdict(ev, n);
      window._uidEstUnCompte = () => true;
      window.__notif.permission = "denied";
      out.refuse = _rappelsVerdict(ev, n);
      localStorage.setItem("passio_rappels_push_v1", "0");
      out.coupe = _rappelsVerdict(ev, n);
      localStorage.removeItem("passio_rappels_push_v1");
      window.__notif.permission = "granted";
      out.abonner = proposerRappelsActivite(ev);
      return out;
    }, EVENT_SEED);
    expect(v).toEqual({ proposer: "proposer", tropTard: "trop_tard", repos: "repos", reposFini: "proposer",
      fenetre: "fenetre_ouverte", visiteur: "sans_compte", refuse: "refuse", coupe: "coupe", abonner: "abonner" });
    expect(await page.evaluate(() => window.__abonnements)).toBe(1);
    expect(await page.evaluate(() => !!document.querySelector("#modalBackdrop.active #_rappelsOuiBtn"))).toBe(false);
  });

  test("⑧ « Plus tard » ferme sans rien demander, et la proposition se tait 14 jours", async ({ page }) => {
    await bancInscription(page, { permission: "default" });
    await page.evaluate((id) => setEventRsvp(id, "going"), EVENT_SEED);
    await page.locator("#modalBackdrop.active").getByText("Plus tard").click();
    await expect(page.locator("#modalBackdrop.active")).toHaveCount(0);
    const r = await page.evaluate((id) => ({ demandes: window.__demandes,
      ensuite: _rappelsVerdict(_findCanonicalEvent(id), Date.now()) }), EVENT_SEED);
    expect(r.demandes).toBe(0);
    expect(r.ensuite).toBe("repos");
  });
});

// Une inscription qui « réussit » sans écrire en production : le serveur est
// remplacé par un verdict (`rsvpOk`), la permission de notification par un faux
// objet piloté par le test, et l'abonnement push par un compteur.
async function bancInscription(page, { permission, rsvpOk = true }) {
  await bootOnboarded(page);
  await page.evaluate(({ id, permission, rsvpOk }) => {
    ["supaJoinEvent", "supaLeaveEvent", "supaLoadEvents", "supaLoadMyRsvps", "supaInsertNotif",
      "supaCreateEventConversation", "supaJoinEventConversation", "supaLeaveEventConversation",
    ].forEach((fn) => { window[fn] = async () => null; });
    window.supaSetEventRsvp = async () => rsvpOk;
    window._supaReal = true;
    window.requireAuthentication = () => true;
    window.requireAdmission = async () => true;
    if (window.PassioFirstRun) window.PassioFirstRun.participationPossible = () => true;
    window._uidEstUnCompte = () => true;
    window.__demandes = 0;
    window.__abonnements = 0;
    window.__notif = { permission, requestPermission: async () => { window.__demandes++; window.__notif.permission = "granted"; return "granted"; } };
    Object.defineProperty(window, "Notification", { configurable: true, get: () => window.__notif });
    window.ensureCallPushSubscription = async () => { window.__abonnements++; };
    window.__telCap = [];
    window.tel = window.tel || {};
    window.tel.action = (name, meta) => { window.__telCap.push({ name, meta }); };
    localStorage.removeItem("passio_rappels_proposes_v1");
    const ev = state.seed.events.find((e) => e.id === id);
    ev.date = Date.now() + 5 * 3600e3;
    ev.status = "active";
    ev.maxAttendees = null;
    ev.attendees = []; ev.maybes = []; ev.waitlist = [];
    try { closeModal(); } catch (e) {}
  }, { id: EVENT_SEED, permission, rsvpOk });
}
