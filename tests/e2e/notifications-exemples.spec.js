// ══════════════════════════════════════════════════════════════════════════
// LE CONTENU D'EXEMPLE N'EST PLUS PRÉSENTÉ COMME RÉEL À UN COMPTE (2026-11-09)
// ──────────────────────────────────────────────────────────────────────────
// Trois constats mesurés en production le 09/11 :
//   ① `loadState` recopiait les notifications de la graine dans toute liste
//     vide — « Léa Moreau a aimé… », « Clara Jensen suit maintenant tes
//     publications » (profil à 0 abonné), « Yanis Perez a réagi », trois NON
//     LUES, comptées par la cloche, le titre « (3) PASSIO » et `setAppBadge` ;
//   ② `_irlWeeklyDigest` comptait les activités d'EXEMPLE : 44 résumés
//     « N événements cette semaine » chez 12 comptes réels sur 13, alors que la
//     base n'avait AUCUNE activité réelle à venir ;
//   ③ les tendances d'Explorer comptaient `state.seed.posts` : « Musique
//     41 posts » pour 2 publications réelles.
// Autorités : `_estNotifFabriqueeDepuisDemo` / `stripLegacyEconomy` /
// `loadState` (app-02), `_irlWeeklyDigest` (app-07, discriminant
// `PassioFirstRun.evenementDemo`), `peindreTendances` (app-06).
// Fiches : docs/journal/social-messagerie.md, docs/journal/passions-fil.md.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded, onboardedState } = require("./app-helper");

const UID_NORA = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";

test.describe("notifications : rien de fabriqué pour un compte", () => {
  test("① compte neuf : aucune notification non lue fabriquée, la bienvenue reste", async ({ page }) => {
    // `onboardedState` porte `notifications: []` : c'est la liste vide que
    // `loadState` remplissait avec la graine.
    await bootOnboarded(page, null, 1);
    const r = await page.evaluate(() => {
      renderBell();
      return {
        nonLues: unreadCount(),
        ids: (state.notifications || []).map((n) => n.id),
        textes: (state.notifications || []).map((n) => String(n.text || "")).join(" | "),
        pastille: (document.getElementById("bellDot") || {}).textContent || "",
        titre: document.title,
      };
    });
    // RÉINJECTION : sur le code d'avant, nonLues = 3 (n1, n2, n3), pastille « 3 »,
    // titre « (3) PASSIO », et les ids n1…n7 tous présents.
    expect(r.nonLues).toBe(0);
    expect(r.pastille).toBe("");
    expect(r.titre).toBe("PASSIO");
    for (const id of ["n1", "n2", "n3", "n4", "n7"]) expect(r.ids, "copie sociale " + id).not.toContain(id);
    expect(r.textes).not.toMatch(/Clara Jensen|Léa Moreau|Yanis Perez/);
    expect(r.ids, "le message système de bienvenue est gardé").toContain("n6");
  });

  test("② les copies déjà stockées sont retirées aux trois frontières ; le réel et la bienvenue restent", async ({ page }) => {
    const t = Date.now();
    const notifs = [
      // Copies de la graine, telles qu'un compte les porte depuis son ouverture.
      { id: "n1", kind: "like", fromId: "u_lea", text: "<b>Léa Moreau</b> a aimé ton intention de rejoindre PASSIO", createdAt: t - 1800000, unread: true, html: true, emoji: "💖" },
      { id: "n2", kind: "follow", fromId: "u_clara", text: "<b>Clara Jensen</b> suit maintenant tes publications voyage", createdAt: t - 3600000, unread: true, html: true, emoji: "🤝" },
      { id: "n6", kind: "system", fromId: "me", text: "Bienvenue sur PASSIO 🎉 Choisis tes passions et découvre qui les partage.", createdAt: t - 6 * 3600000, unread: false, html: true, emoji: "✨" },
      // Résumé écrit par l'ancien `_irlWeeklyDigest` (identifiant `uid()`).
      { id: "xk3j2ab9lq", kind: "local", fromId: "me", text: "<b>11 événements</b> cette semaine à Lyon — à commencer par <b>Jam session guitaristes débutants</b>", createdAt: t - 86400000, unread: true, html: true, emoji: "📍" },
      // Forme plus ancienne encore, préfixée de « 📍 » DANS le texte : 18 des 44
      // résumés stockés en production (relecture du 09/11) — la première version
      // du filtre les laissait passer.
      { id: "xp1n0ld7aa", kind: "local", fromId: "me", text: "📍 <b>9 événements</b> cette semaine près de toi — à commencer par <b>Rando</b>", createdAt: t - 2 * 86400000, unread: false, html: true, emoji: "📍" },
      { id: "xp2n0ld7bb", kind: "local", fromId: "me", text: "📍<b>1 événement</b> cette semaine à Annecy — à commencer par <b>Escalade</b>", createdAt: t - 3 * 86400000, unread: false, html: true, emoji: "📍" },
      // Une notification locale qui n'est PAS un résumé, même avec l'épingle.
      { id: "xrsvp0001z", kind: "local", fromId: "me", text: "📍 Tu rejoins <b>Atelier</b> samedi", createdAt: t - 4 * 86400000, unread: false, html: true, emoji: "📍" },
      // Résumé du code corrigé : jamais retiré.
      { id: "irl_digest_2026-W45", kind: "local", fromId: "me", text: "<b>1 événement</b> cette semaine près de toi — à commencer par <b>Atelier</b>", createdAt: t - 7200000, unread: true, html: true, emoji: "📍" },
      // Une vraie notification serveur.
      { id: "c0ffee00-1111-4222-8333-444455556666", kind: "like", fromId: UID_NORA, text: "Nora a aimé ta publication", createdAt: t - 600000, unread: true, fromSupabase: true },
    ];
    const etat = onboardedState(1);
    etat.notifications = notifs;
    await bootOnboarded(page, null, 1, { state: etat });
    const r = await page.evaluate((brutes) => {
      // Frontière ① : `loadState`, déjà passée au démarrage.
      const auChargement = state.notifications.map((n) => n.id);
      // Frontière ② : l'hydratation par un blob `user_state` qui les porte encore.
      const garde = state.notifications;
      _applyUserState({ notifications: brutes.map((n) => Object.assign({}, n)) });
      const aLHydratation = state.notifications.map((n) => n.id);
      // Frontière ③ : l'envoi, sans muter l'état vivant.
      state.notifications = brutes.map((n) => Object.assign({}, n));
      const vivantAvant = state.notifications.length;
      const envoyees = (_syncableState().notifications || []).map((n) => n.id);
      const vivantApres = state.notifications.length;
      state.notifications = garde;
      return { auChargement, aLHydratation, envoyees, vivantAvant, vivantApres, nonLues: unreadCount() };
    }, notifs);
    const gardees = ["n6", "irl_digest_2026-W45", "c0ffee00-1111-4222-8333-444455556666", "xrsvp0001z"];
    const retirees = ["n1", "n2", "xk3j2ab9lq", "xp1n0ld7aa", "xp2n0ld7bb"];
    // RÉINJECTION : sans `_estNotifFabriqueeDepuisDemo` dans `stripLegacyEconomy`,
    // les trois listes portent n1, n2 et l'ancien résumé, et nonLues = 4.
    for (const liste of ["auChargement", "aLHydratation", "envoyees"]) {
      for (const id of retirees) expect(r[liste], liste + " ne porte plus " + id).not.toContain(id);
      for (const id of gardees) expect(r[liste], liste + " garde " + id).toContain(id);
    }
    expect(r.vivantApres, "l'envoi ne mute pas l'état affiché").toBe(r.vivantAvant);
    expect(r.nonLues, "restent non lues : le résumé corrigé et la vraie notification").toBe(2);
  });
});

// Le résumé hebdomadaire IRL, appelé tel quel. Les activités d'exemple du seed
// sont celles qu'un compte a réellement sous la main ; la notification système
// est capturée par une doublure de `serviceWorker.ready`.
async function bootDigest(page) {
  await bootOnboarded(page, null, 1);
  await page.evaluate(() => {
    window._supaReal = false;
    window.supaLoadEvents = async () => [];
    window.__sys = [];
    Object.defineProperty(window, "Notification", { configurable: true, writable: true, value: { permission: "granted" } });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ showNotification: (titre, o) => { window.__sys.push({ titre, body: o && o.body }); } }) },
    });
  });
}

// Tout se fait dans UN évaluateur synchrone jusqu'à l'appel : le minuteur du
// démarrage (`setTimeout(_irlWeeklyDigest, 4000)`) ne peut pas s'intercaler.
async function lancerDigest(page, reels) {
  return page.evaluate(async (evs) => {
    irlSelectedCity = null;
    irlUserLocation = { lat: 48.8566, lng: 2.3522 };
    state.userEvents = [];
    state.user.joinedEvents = [];
    state.seed.events = (state.seed.events || []).filter((e) => PassioFirstRun.evenementDemo(e));
    const now = Date.now();
    evs.forEach((e, i) => state.seed.events.unshift(Object.assign({
      date: now + (i + 1) * 86400000, time: "18:00", passion: "musique", emoji: "🎸",
      city: "Paris", lat: 48.8566, lng: 2.3522, attendees: [], maybes: [], waitlist: [],
      organizerId: "a1a1a1a1-0000-4000-8000-000000000001", status: "active",
    }, e)));
    // Prémisse : des activités d'EXEMPLE passent tous les autres filtres du
    // résumé — sans elles, un résumé muet ne prouverait rien.
    const ref = _irlReferenceLoc();
    const exemplesEligibles = state.seed.events.filter((e) => PassioFirstRun.evenementDemo(e)
      && !_eventIsCancelled(e) && _eventEndAt(e) > now && e.date <= now + 7 * 86400000
      && (function (d) { return d == null || d <= IRL_DIGEST_RADIUS_KM; })(_eventDistanceKm(e, ref))).length;
    localStorage.removeItem(IRL_DIGEST_KEY);
    state.notifications = [];
    _irlWeeklyDigest();
    const notifs = state.notifications.map((n) => ({ id: n.id, text: n.text, unread: n.unread }));
    await new Promise((r) => setTimeout(r, 50));
    return { exemplesEligibles, notifs, semaine: localStorage.getItem(IRL_DIGEST_KEY), sys: window.__sys.slice(), wk: _isoWeekKey() };
  }, reels);
}

test.describe("résumé hebdomadaire IRL : le réel seulement", () => {
  test("③ sans activité réelle à venir, il se tait : ni cloche, ni notification système", async ({ page }) => {
    await bootDigest(page);
    const r = await lancerDigest(page, []);
    expect(r.exemplesEligibles, "prémisse : des exemples seraient comptés").toBeGreaterThan(0);
    // RÉINJECTION : sur le code d'avant, une notification « N événements cette
    // semaine » (N = exemplesEligibles) et une notification système partent.
    expect(r.notifs).toEqual([]);
    expect(r.sys).toEqual([]);
    expect(r.semaine, "la semaine n'est pas consommée : une vraie activité pourra encore être annoncée").toBeNull();
  });

  test("④ une activité réelle à venir est annoncée — et comptée SEULE", async ({ page }) => {
    await bootDigest(page);
    const r = await lancerDigest(page, [{ id: "7b9e0f12-3456-4789-8abc-def012345678", title: "Atelier céramique du jeudi" }]);
    expect(r.exemplesEligibles, "prémisse : des exemples seraient comptés").toBeGreaterThan(0);
    // RÉINJECTION : sur le code d'avant, « <b>N+1 événements</b> » (exemples compris).
    expect(r.notifs).toHaveLength(1);
    expect(r.notifs[0].text).toMatch(/^<b>1 événement<\/b> cette semaine /);
    expect(r.notifs[0].text).toContain("Atelier céramique du jeudi");
    expect(r.notifs[0].unread).toBe(true);
    expect(r.notifs[0].id, "porte la marque du résumé compté sur le réel").toBe("irl_digest_" + r.wk);
    expect(r.semaine).toBe(r.wk);
    expect(r.sys).toEqual([{ titre: "PASSIO — ça bouge près de toi", body: "1 événement cette semaine · Atelier céramique du jeudi" }]);
    // Et ce résumé-là survit aux frontières (`stripLegacyEconomy`).
    const garde = await page.evaluate(() => stripLegacyEconomy({ notifications: state.notifications.slice() }).notifications.length);
    expect(garde).toBe(1);
  });
});

test.describe("Explorer : les tendances ne comptent pas les exemples", () => {
  test("⑤ « N posts » = publications réelles, une fois chacune ; aucun « 0 post »", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    const r = await page.evaluate(() => {
      const t = Date.now();
      const auteur = "a1a1a1a1-0000-4000-8000-000000000002";
      state.supabasePosts = [
        { id: "5d0c1f7e-0000-4000-8000-0000000000b1", authorId: auteur, passion: "musique", type: "text", text: "a", createdAt: t - 3600000, fromSupabase: true },
        { id: "5d0c1f7e-0000-4000-8000-0000000000b2", authorId: auteur, passion: "musique", type: "text", text: "b", createdAt: t - 7200000, fromSupabase: true },
      ];
      // Ma publication revient aussi du serveur : même id, comptée une fois.
      state.userPosts = [Object.assign({}, state.supabasePosts[0])];
      const exemplesMusique = (state.seed.posts || []).filter((p) => p && p.passion === "musique").length;
      renderExplorer();
      const tuiles = Array.from(document.querySelectorAll("#trendingGrid .trending-tile")).map((el) => ({
        nom: (el.querySelector(".trending-name") || {}).textContent || "",
        stat: el.querySelector(".trending-stat") ? el.querySelector(".trending-stat").textContent : null,
      }));
      return { exemplesMusique, tuiles };
    });
    expect(r.exemplesMusique, "prémisse : la démo porte bien plus de 2 publications Musique").toBeGreaterThan(2);
    // RÉINJECTION : sur le code d'avant, Musique affiche « 41 posts » (ou plus,
    // exemples compris) et les autres tuiles leurs comptes de démo.
    // LOT-11 (REC-C14) : seules les passions qui ont des publications RÉELLES
    // forment la section ; LOT-11 (REC-C09) : le mot est « publications ».
    expect(r.tuiles).toEqual([{ nom: "Musique", stat: "2 publications" }]);
  });
});
