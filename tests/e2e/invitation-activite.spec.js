// Inviter juste après avoir organisé une activité (2026-10-04).
//
// Mesuré en production : aucun lien partagé en sept jours, pour six activités
// créées en trente. La proposition d'inviter se pose donc au moment où l'on a le
// plus envie de le faire — juste après « Publier ». Ce que cette suite prouve :
//   ① une activité publiée sur le serveur propose l'invitation, et le bouton
//      diffuse le lien de `lienPartageDe` (la seule source) avec un texte qui
//      nomme l'activité ;
//   ② rien n'est proposé quand l'activité n'existe pas pour les autres (mode
//      local, publication refusée) ni à l'édition ;
//   ③ une fenêtre ouverte pendant la publication n'est jamais remplacée ;
//   ④ la coupure éteint la proposition ;
//   ⑤ un titre hostile reste du texte ;
//   ⑥ « Plus tard » referme sans rien diffuser.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const TITRE = "Rando au lac";

// Démarrage neutralisé (aucune écriture en production) ; `verdict` pilote la
// publication serveur : true (confirmée), false (refusée), null (mode local).
async function banc(page, verdict) {
  await bootOnboarded(page);
  await page.evaluate((v) => {
    ["supaUpdateEvent", "supaJoinEvent", "supaLeaveEvent", "supaSetEventRsvp", "supaLoadEvents",
      "supaLoadMyRsvps", "supaLoadEventCommentCounts", "supaCreateEventConversation",
      "supaJoinEventConversation", "supaLeaveEventConversation",
    ].forEach((fn) => { window[fn] = async () => null; });
    window.supaPublishEvent = async () => v === true;
    window.passioGeocode = async () => null;
    window._geocodeAddress = async () => null;
    window._supaReal = v !== null;
    window.__diffuse = [];
    window.partagerOuCopier = (data, msg) => { window.__diffuse.push({ data, msg }); };
    window.__telCap = [];
    window.tel = window.tel || {};
    window.tel.action = (name, meta) => { window.__telCap.push({ name, meta }); };
    state.userEvents = [];
    state.seed.events = [];
    goTo("irl");
    renderIRL();
  }, verdict);
}

async function creer(page, titre) {
  await page.evaluate((t) => {
    openCreateEvent();
    document.getElementById("evTitle").value = t;
    document.getElementById("evCity").value = "Annecy";
  }, titre);
  await page.evaluate(() => submitEvent());
}

const invitationOuverte = (page) => page.evaluate(() =>
  !!document.querySelector("#modalBackdrop.active #_inviteEvBtn"));

test.describe("Inviter après avoir créé une activité", () => {
  test("① publiée : l'invitation est proposée et diffuse le lien de l'activité", async ({ page }) => {
    await banc(page, true);
    await creer(page, TITRE);
    await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Ton activité est en ligne");
    await expect(page.locator("#_inviteEvApercu")).toContainText(TITRE);
    // Le CÂBLAGE vers la seule source du lien : en local, `lienPartageDe` rend la
    // forme en hash, que la forme recopiée à la main rendrait aussi — un espion
    // est le seul moyen de distinguer les deux.
    await page.evaluate(() => { window.lienPartageDe = (type, id) => "https://lien.test/" + type + "/" + id; });
    await page.locator("#_inviteEvBtn").click();
    const r = await page.evaluate(() => {
      const ev = state.userEvents[0];
      return { diffuse: window.__diffuse, attendu: "https://lien.test/event/" + ev.id,
        ferme: !document.querySelector("#modalBackdrop.active"),
        tel: window.__telCap.map((e) => e.name) };
    });
    expect(r.diffuse).toHaveLength(1);
    // Le suivi de partage (`?plk=`) s'ajoute au lien, il ne le remplace pas.
    expect(String(r.diffuse[0].data.url).replace(/\?plk=[^#]*/, "")).toBe(r.attendu);
    expect(r.diffuse[0].data.text).toContain(TITRE);
    expect(r.diffuse[0].data.text).toContain("Annecy");
    expect(r.ferme).toBe(true);
    expect(r.tel).toEqual(expect.arrayContaining(["activite_invite_proposee", "activite_invite_partagee"]));
    // Jamais un nom du funnel IRL : il ne compte que créations et participations.
    expect(r.tel.filter((n) => /^irl_(create|join)_/.test(n))).toEqual(["irl_create_success"]);
  });

  test("② rien n'est proposé si l'activité n'existe pas pour les autres, ni à l'édition", async ({ page }) => {
    await banc(page, null);                 // mode local : rien n'est parti au serveur
    await creer(page, TITRE);
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    expect(await invitationOuverte(page)).toBe(false);

    await banc(page, false);                // publication refusée par le serveur
    await creer(page, TITRE);
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    expect(await invitationOuverte(page)).toBe(false);

    await banc(page, true);                 // édition d'une activité existante
    await page.evaluate(() => {
      // L'écriture de l'édition RÉUSSIT : sinon le cas serait vert parce que
      // l'enregistrement a échoué, et non parce qu'une édition n'invite pas.
      window.supaUpdateEvent = async () => true;
      state.userEvents = [{ id: "ev_moi", title: "Avant", passion: "musique", city: "Paris",
        date: Date.now() + 3 * 86400000, time: "18:00", attendees: [MY_UID], maybes: [], waitlist: [],
        checkedIn: [], organizerId: MY_UID, authorId: MY_UID, status: "active" }];
      openCreateEvent("ev_moi");
      document.getElementById("evTitle").value = "Après";
    });
    await page.evaluate(() => submitEvent("ev_moi"));
    // L'édition a bien abouti : sinon le cas serait vert pour une autre raison.
    await expect.poll(() => page.evaluate(() => _findCanonicalEvent("ev_moi").title)).toBe("Après");
    expect(await invitationOuverte(page)).toBe(false);
  });

  test("③ une fenêtre ouverte pendant la publication n'est pas remplacée", async ({ page }) => {
    await banc(page, true);
    await page.evaluate(() => {
      window.supaPublishEvent = async () => { openModal('<div class="modal-title" id="_autreFenetre">Autre chose</div>'); return true; };
    });
    await creer(page, TITRE);
    await expect(page.locator("#_autreFenetre")).toBeVisible();
    expect(await invitationOuverte(page)).toBe(false);
  });

  test("④ la coupure éteint la proposition", async ({ page }) => {
    await banc(page, true);
    await page.evaluate(() => localStorage.setItem("passio_invite_apres_creation_v1", "0"));
    await creer(page, TITRE);
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    expect(await invitationOuverte(page)).toBe(false);
  });

  test("⑤ un titre hostile reste du texte", async ({ page }) => {
    await banc(page, true);
    await creer(page, '<img src=x onerror="window.__xss=1">Piège');
    await expect(page.locator("#_inviteEvApercu")).toContainText("Piège");
    const r = await page.evaluate(() => ({
      img: document.querySelectorAll("#_inviteEvApercu img").length, xss: window.__xss || 0,
    }));
    expect(r).toEqual({ img: 0, xss: 0 });
  });

  test("⑥ « Plus tard » referme sans rien diffuser", async ({ page }) => {
    await banc(page, true);
    await creer(page, TITRE);
    await page.locator("#_inviteEvPlusTard").click();
    const r = await page.evaluate(() => ({
      ouvert: !!document.querySelector("#modalBackdrop.active"), diffuse: window.__diffuse.length,
    }));
    expect(r).toEqual({ ouvert: false, diffuse: 0 });
  });
});
