// Une activité créée apparaît dans le fil (2026-10-23).
//
// Signalé en production : Jerem crée « Via ferrata » (ligne `events` présente,
// statut actif), et rien n'arrive dans le fil. Créer une activité n'écrivait que
// dans `events` ; la seule carte du fil était celle du partage manuel. Ce que
// cette suite prouve :
//   ① une activité publiée sur le serveur pose SA carte dans le fil (id
//      déterministe `post_ev_<id>`, envoyée au serveur), sans fermer la
//      proposition d'invitation ;
//   ② rien n'est posé en mode local, sur un refus, ni à l'édition ;
//   ③ le rattrapage publie la carte d'une activité récente qui n'en a pas — et
//      rien quand le serveur en connaît déjà une, quand elle est ancienne,
//      passée, d'un autre compte, supprimée par son auteur, ou au second appel ;
//   ④ la coupure éteint les deux chemins.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UUID = "9f35913c-0000-4a55-a0b8-000000000001";

// Démarrage neutralisé (aucune écriture en production) : `supa` est un double
// chaînable dont la lecture `posts` rend `window.__postsServeur`.
async function banc(page, verdict) {
  await bootOnboarded(page);
  await page.evaluate(({ v, uuid }) => {
    ["supaUpdateEvent", "supaJoinEvent", "supaLeaveEvent", "supaSetEventRsvp", "supaLoadEvents",
      "supaLoadMyRsvps", "supaLoadEventCommentCounts", "supaCreateEventConversation",
      "supaJoinEventConversation", "supaLeaveEventConversation",
    ].forEach((fn) => { window[fn] = async () => null; });
    window.supaPublishEvent = async () => v === true;
    window.passioGeocode = async () => null;
    window._geocodeAddress = async () => null;
    window._supaReal = v !== null;
    window.__envoyes = [];
    window.supaPublishPostWithRetry = async (p) => { window.__envoyes.push(p.id); return true; };
    window.partagerOuCopier = () => {};
    window.__postsServeur = [];
    window.__lectures = [];
    const q = {
      select() { return q; }, eq(c, x) { window.__lectures.push([c, x]); return q; },
      like(c, x) { window.__lectures.push([c, x]); return q; }, limit() { return q; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: window.__postsServeur, error: null }).then(res, rej); },
    };
    supa = { from: () => q };
    MY_UID = uuid;
    state.user.general.username = "Jerem";
    state.userEvents = [];
    state.userPosts = [];
    state.seed.events = [];
    goTo("irl");
    renderIRL();
  }, { v: verdict, uuid: UUID });
}

async function creer(page, titre) {
  await page.evaluate((t) => {
    openCreateEvent();
    document.getElementById("evTitle").value = t;
    document.getElementById("evCity").value = "Sixt-Fer-à-Cheval";
  }, titre);
  await page.evaluate(() => submitEvent());
}

const activiteServeur = (o) => Object.assign({
  id: "ev_jerem", title: "Via ferrata", passion: "musique", city: "Sixt",
  date: Date.now() + 8 * 86400000, createdAt: Date.now() - 3600000,
  organizerId: UUID, authorId: UUID, status: "active", fromSupabase: true,
}, o);

test.describe("Une activité créée apparaît dans le fil", () => {
  test("① publiée : sa carte arrive dans le fil, l'invitation reste à l'écran", async ({ page }) => {
    await banc(page, true);
    await creer(page, "Via ferrata");
    await expect.poll(() => page.evaluate(() => window.__envoyes.length)).toBe(1);
    const r = await page.evaluate(() => {
      const ev = state.userEvents[0];
      const p = state.userPosts.find((x) => x.id === "post_ev_" + ev.id);
      return { envoye: window.__envoyes[0], attendu: "post_ev_" + ev.id, p: p && {
        kind: p.sharedReelData.kind, ref: p.sharedReelData.id, evId: ev.id, mood: p.mood, auteur: p.authorId },
        invitation: !!document.querySelector("#modalBackdrop.active #_inviteEvBtn") };
    });
    expect(r.envoye).toBe(r.attendu);
    expect(r.p).toEqual({ kind: "event", ref: r.p.evId, evId: r.p.evId, mood: "irl", auteur: UUID });
    expect(r.invitation, "la carte ne remplace pas la proposition d'invitation").toBe(true);
    // Et elle est PEINTE dans le fil — la donnée seule ne suffit pas.
    await page.evaluate(() => { closeModal(); goTo("feed"); renderFeed(); });
    // (La sous-carte historique est masquée par UI-3 au profit de « Voir l'activité » :
    // c'est l'ARTICLE, porteur du titre, qui doit être visible.)
    const carte = page.locator('#feedList article[data-postid="' + r.attendu + '"]');
    await expect(carte).toBeVisible();
    await expect(carte).toContainText("Via ferrata");
  });

  test("② rien en mode local, sur un refus, ni à l'édition", async ({ page }) => {
    await banc(page, null);
    await creer(page, "Via ferrata");
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    expect(await page.evaluate(() => [state.userPosts.length, window.__envoyes.length])).toEqual([0, 0]);

    await banc(page, false);
    await creer(page, "Via ferrata");
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    expect(await page.evaluate(() => [state.userPosts.length, window.__envoyes.length])).toEqual([0, 0]);

    await banc(page, true);
    await page.evaluate((uuid) => {
      window.supaUpdateEvent = async () => true;
      state.userEvents = [{ id: "ev_moi", title: "Avant", passion: "musique", city: "Paris",
        date: Date.now() + 3 * 86400000, time: "18:00", attendees: [uuid], maybes: [], waitlist: [],
        checkedIn: [], organizerId: uuid, authorId: uuid, status: "active" }];
      openCreateEvent("ev_moi");
      document.getElementById("evTitle").value = "Après";
    }, UUID);
    await page.evaluate(() => submitEvent("ev_moi"));
    await expect.poll(() => page.evaluate(() => _findCanonicalEvent("ev_moi").title)).toBe("Après");
    expect(await page.evaluate(() => [state.userPosts.length, window.__envoyes.length])).toEqual([0, 0]);
  });

  test("③ rattrapage : une carte pour l'activité récente qui n'en a pas, et une seule", async ({ page }) => {
    await banc(page, true);
    const r = await page.evaluate(async ({ a, uuid }) => {
      const jour = 86400000;
      const evs = [
        a,                                                                   // la seule à rattraper
        Object.assign({}, a, { id: "ev_vieille", createdAt: Date.now() - 30 * jour }),
        Object.assign({}, a, { id: "ev_passee", date: Date.now() - jour }),
        Object.assign({}, a, { id: "ev_autre", organizerId: "u_x", authorId: "u_x" }),
        Object.assign({}, a, { id: "ev_annulee", status: "cancelled" }),
        Object.assign({}, a, { id: "ev_supprimee" }),
      ];
      marquerPostSupprime("post_ev_ev_supprimee");
      const n1 = await rattraperActivitesAuFil(evs);
      const n2 = await rattraperActivitesAuFil(evs);          // second démarrage
      return { n1, n2, envoyes: window.__envoyes.slice(), lectures: window.__lectures };
    }, { a: activiteServeur(), uuid: UUID });
    expect(r.n1).toBe(1);
    expect(r.n2).toBe(0);
    expect(r.envoyes).toEqual(["post_ev_ev_jerem"]);
    // La question posée au serveur couvre le partage MANUEL (même `shared_data`).
    expect(r.lectures).toEqual(expect.arrayContaining([["author_id", UUID], ["shared_data", '%"id":"ev_jerem"%']]));
  });

  test("③ bis rattrapage : le serveur connaît déjà une carte → rien", async ({ page }) => {
    await banc(page, true);
    const n = await page.evaluate(async (a) => {
      window.__postsServeur = [{ id: "post_manuel" }];
      return rattraperActivitesAuFil([a]);
    }, activiteServeur());
    expect(n).toBe(0);
    expect(await page.evaluate(() => [state.userPosts.length, window.__envoyes.length])).toEqual([0, 0]);
  });

  test("④ la coupure éteint la création comme le rattrapage", async ({ page }) => {
    await banc(page, true);
    await page.evaluate(() => { window.PASSIO_ACTIVITE_AU_FIL = false; });
    await creer(page, "Via ferrata");
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    const n = await page.evaluate((a) => rattraperActivitesAuFil([a]), activiteServeur());
    expect(n).toBe(0);
    expect(await page.evaluate(() => [state.userPosts.length, window.__envoyes.length])).toEqual([0, 0]);
  });
});
