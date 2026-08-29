// Lot UI-4B — fiche activité V2.
//
// ⚠️ Mise en ligne du 2026-08-28 : ce lot est passé de l'APERÇU à l'ACTIF PAR
// DÉFAUT, sur ordre de Benjamin. L'URL normale porte donc désormais la fiche V2.
// Deux conséquences pour cette suite : ① son premier énoncé (« l'URL normale est
// strictement inchangée ») décrivait un état du produit qui n'existe plus — il a
// été réécrit, et l'ancien énoncé, mot pour mot, est devenu la description de ce
// que doivent rendre les deux coupures ; ② l'ancien lien
// `?passio_preview=passio-ui-4b` ne décide plus rien : il est toléré et sans
// effet, ce qui est prouvé à part. Seule la DÉMONSTRATION
// (`?passio_preview=passio-ui-4b-demo`, activité fictive en mémoire) reste
// strictement sur son lien — elle n'a rien à faire chez tout le monde.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① sur l'URL NORMALE, le lot est actif et sert l'action primaire unique ;
//      chacune de ses deux coupures rend la fiche historique intacte ;
//   ② la hiérarchie cible est en place et dans le bon ordre :
//      rendez-vous → organisateur → description → infos → participants →
//      discussion → contextuel → échanges → autres actions ;
//   ③ AUCUNE fonction historique n'est perdue : calendrier, invitation,
//      partage, gestion, discussion, check-in, album, réactions, commentaires
//      et signalement sont toujours là, déplacés et non supprimés ;
//   ④ vie privée : le premier niveau ne porte que la ville publique — ni
//      adresse exacte, ni téléphone — qui restent dans les infos pratiques ;
//   ⑤ une seule action primaire « Je participe », sans « Peut-être », sans
//      « Je ne participe pas », sans bloc « Choisir ma participation » ;
//   ⑥ aucune inscription à l'ouverture : l'écriture n'a lieu qu'au geste, par
//      le moteur historique (`setEventRsvp`), et le retrait reste secondaire ;
//   ⑦ complet → liste d'attente par le moteur historique ;
//   ⑧ annulé et terminé → aucun CTA trompeur, la fiche historique est laissée
//      telle quelle ;
//   ⑨ l'aperçu de démonstration ouvre une activité en mémoire — couverture
//      locale comprise — sans rien écrire dans `state` ni `localStorage` ;
//   ⑩ compatibilité UI-3B : « Voir l'activité » depuis le Feed mène à la même
//      fiche V2, avec une seule action primaire, et le retour rend le Feed ;
//   ⑪ kill switches local et mémoire : retour intégral à la fiche historique ;
//   ⑫ mobile 320 / 390 / 430 px, cibles ≥ 44 px, clavier et Escape.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Le lot vit sur l'URL NORMALE depuis le 2026-08-28 : c'est là qu'on l'observe.
// `LIEN_TOLERE` n'est plus un interrupteur, seulement un ancien lien qui ne doit
// ni activer, ni casser, ni écrire quoi que ce soit — un seul test s'en occupe.
const LIEN_TOLERE = "?passio_preview=passio-ui-4b";
const DEMO = "?passio_preview=passio-ui-4b-demo";
const SEUIL_PX = 4;
const DEFILEMENT_PX = 400;

function evenement(id, extra) {
  return Object.assign({
    id, title: "Jam acoustique", passion: "musique", emoji: "🎸",
    eventType: "Jam session", organizerId: "u_lea",
    date: Date.now() + 3 * 86400000, time: "18:30",
    city: "Lyon", venue: "Café des Arts", price: 0, maxAttendees: 12,
    attendees: ["u_karim", "u_nina"], maybes: [], waitlist: [],
    desc: "On installe deux guitares et on joue ce qui vient.",
  }, extra || {});
}

function post(id, extra) {
  return Object.assign({
    id, authorId: "auteur_" + id, authorName: "Alice", authorEmoji: "🎧",
    authorColor: "#7c3aed", passion: "musique", mood: "creation", type: "text",
    text: "Publication de " + id, createdAt: 9000, likes: 0, comments: [],
  }, extra || {});
}

async function boot(page, opts = {}) {
  if (opts.killLocal) await page.addInitScript(() => localStorage.setItem("passio_ui_4b", "0"));
  await bootOnboarded(page, opts.errors, 1, { query: opts.query || "" });
  await page.evaluate(() => {
    // Aucune requête réseau : le moteur RSVP doit rester en mode local, et les
    // chargements asynchrones de la fiche ne doivent rien attendre.
    window.supaLoadPosts = async () => [];
    window.supaLoadEventPosts = async () => [];
    window.supaLoadEventComments = async () => [];
    window._supaReal = false;
    window.__v4bTel = [];
    window.tel = window.tel || {};
    window.tel.action = function (name, meta) { window.__v4bTel.push({ name, meta }); };
  });
}

// Sème le catalogue d'activités puis ouvre la fiche par le chemin ORDINAIRE
// (`openEventDetails`), celui de l'écran IRL et des liens profonds : la fiche V2
// ne doit dépendre d'aucun contexte Feed.
async function ouvrir(page, events, id) {
  await page.evaluate(([evts]) => {
    state.seed.events = evts;
    state.userEvents = [];
    state.user.joinedEvents = [];
    state.user.eventRsvp = {};
  }, [events]);
  await page.evaluate((evId) => openEventDetails(evId), id);
  await expect(page.locator("#eventDetailPage")).toBeVisible();
}

function sections(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#eventDetailContent [data-v4b-sec]")]
      .map((s) => s.getAttribute("data-v4b-sec")));
}

// ── ① L'URL normale ────────────────────────────────────────────────────────
//
// ⚠️ ÉNONCÉ RÉÉCRIT LE 2026-08-28. Cette place portait « URL normale : aucune
// trace du lot, fiche historique intacte ». C'était vrai tant que la fiche V2
// n'était joignable que par `?passio_preview=passio-ui-4b` ; Benjamin a basculé
// le lot en ACTIF PAR DÉFAUT, donc « aucune trace sur l'URL normale » est
// devenu faux DU PRODUIT — ce n'est pas le test qui a dérivé, c'est le produit
// qui a changé de comportement, et le test dit maintenant le nouveau vrai.
// L'ancien énoncé n'est pas perdu : il décrit exactement ce que doivent rendre
// les deux coupures, et il est vérifié mot pour mot par le test suivant (kill
// switch local posé AU BOOT, selon la convention maison rappelée dans CLAUDE.md
// pour la mise en ligne d'UI-3A : on ne retire aucune assertion, on pose
// l'interrupteur du lot qui recouvre le comportement historique).
test("URL normale : le lot est actif par défaut, action primaire unique", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors });
  await ouvrir(page, [evenement("ev_jam")], "ev_jam");

  expect(await page.evaluate(() => window.PassioUIV4B.isEnabled())).toBe(true);
  await expect(page.locator("html")).toHaveClass(/passio-ui-4b/);
  await expect(page.locator(".v4b-fiche")).toHaveCount(1);

  // La barre historique a bien cédé la place, sans en garder un morceau.
  const cta = page.locator("#eventDetailCta");
  await expect(cta.locator("[data-v4b-rsvp-go]")).toHaveCount(1);
  await expect(cta.locator("[data-v4b-rsvp-go]")).toHaveText("Je participe");
  expect(await cta.innerText()).not.toContain("Rejoindre ·");

  // L'activation vient du CODE, jamais d'un état posé sur l'appareil : le
  // drapeau ne sait qu'enlever, il n'écrit aucune valeur positive.
  expect(await page.evaluate(() => localStorage.getItem("passio_ui_4b"))).toBeNull();
  expect(errors.js, "exceptions JS").toEqual([]);
});

// Les assertions ci-dessous sont celles de l'ancien test ① — inchangées. Seul
// leur contexte a bougé : la fiche historique ne s'obtient plus en s'abstenant
// d'un paramètre d'URL, mais en coupant le lot.
test("URL normale + coupure locale : aucune trace du lot, fiche historique intacte", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors, killLocal: true });
  await ouvrir(page, [evenement("ev_jam")], "ev_jam");

  expect(await page.evaluate(() => window.PassioUIV4B.isEnabled())).toBe(false);
  await expect(page.locator("html")).not.toHaveClass(/passio-ui-4b/);
  await expect(page.locator(".v4b-fiche")).toHaveCount(0);
  await expect(page.locator("[data-v4b-rsvp]")).toHaveCount(0);
  // La barre d'action historique, mot pour mot.
  expect(await page.locator("#eventDetailCta").innerText()).toContain("Rejoindre");
  expect(errors.js, "exceptions JS").toEqual([]);
});

// L'ancien lien d'aperçu survit dans des favoris et des captures d'écran : il
// doit rester inoffensif — ni activation persistée, ni double application.
test("l'ancien lien d'aperçu est toléré et ne décide plus rien", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors, query: LIEN_TOLERE });
  await ouvrir(page, [evenement("ev_jam")], "ev_jam");

  await expect(page.locator(".v4b-fiche")).toHaveCount(1);
  await expect(page.locator("#eventDetailCta [data-v4b-rsvp-go]")).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("passio_ui_4b"))).toBeNull();
  expect(errors.js, "exceptions JS").toEqual([]);
});

// ── ② + ③ + ④ La composition ───────────────────────────────────────────────
test("URL normale : la hiérarchie cible, sans rien perdre de la fiche historique", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors });
  await ouvrir(page, [evenement("ev_jam", {
    address: "12 rue des Lilas", postalCode: "69006", contact: "06 12 34 56 78",
  })], "ev_jam");

  await expect(page.locator(".v4b-fiche")).toHaveCount(1);
  await expect(page.locator("html")).toHaveClass(/passio-ui-4b/);

  // ② L'ordre des surfaces est celui décidé, sans exception.
  const ordre = await sections(page);
  expect(ordre).toEqual([
    "rendezvous", "organisateur", "description", "infos",
    "participants", "discussion", "contexte", "echanges", "secondaire",
  ]);

  // Le bloc signature répond « quand ? où ? avec qui ? puis-je entrer ? ».
  const rdv = page.locator(".v4b-rdv");
  await expect(rdv).toBeVisible();
  const texteRdv = await rdv.innerText();
  expect(texteRdv).toContain("18:30");
  expect(texteRdv).toContain("Lyon");
  expect(texteRdv).toContain("2 participants");
  expect(texteRdv).toContain("10 places restantes");

  // Une SEULE mention de la Passio, portée par l'en-tête sur la photo.
  await expect(page.locator("#eventDetailHeroTitle .event-detail-passion-badge")).toHaveCount(1);
  await expect(page.locator("#eventDetailContent .event-detail-passion-badge")).toHaveCount(0);

  // ④ Vie privée : le premier niveau ne porte que la ville publique. L'adresse
  // exacte et le téléphone ne sont ni supprimés ni élevés — ils restent là où
  // le moteur historique les a mis.
  expect(texteRdv).not.toContain("12 rue des Lilas");
  expect(texteRdv).not.toContain("06 12 34 56 78");
  const infos = await page.locator('[data-v4b-sec="infos"]').innerText();
  expect(infos).toContain("12 rue des Lilas");
  expect(infos).toContain("06 12 34 56 78");

  // ③ Rien n'a disparu : chaque fonction historique est encore joignable.
  const restants = await page.evaluate(() => {
    const html = document.getElementById("eventDetailContent").innerHTML;
    return {
      calendrier: html.includes("downloadEventIcs"),
      invitation: html.includes("openEventInvite"),
      partage: html.includes("shareEvent("),
      discussion: html.includes("openEventChat"),
      carnet: html.includes("startTripFromEvent"),
      signalement: html.includes("reportEvent"),
      album: !!document.getElementById("eventAlbum"),
      commentaires: !!document.getElementById("eventCommentsList"),
      composeur: !!document.getElementById("eventCommentInput"),
      reactions: !!document.querySelector("#eventDetailContent .post-actions"),
      organisateur: !!document.querySelector(".event-detail-organizer"),
      participants: !!document.querySelector(".event-detail-participants"),
      infoCard: !!document.querySelector(".event-detail-info-card"),
    };
  });
  Object.keys(restants).forEach((k) => expect(restants[k], k).toBe(true));

  // Commentaires et réactions ne précèdent JAMAIS ce qui permet de décider.
  expect(ordre.indexOf("echanges")).toBeGreaterThan(ordre.indexOf("rendezvous"));
  expect(ordre.indexOf("echanges")).toBeGreaterThan(ordre.indexOf("participants"));

  expect(errors.js, "exceptions JS").toEqual([]);
});

// ── ⑤ + ⑥ L'action primaire ────────────────────────────────────────────────
test("une seule action primaire, et aucune écriture avant le geste", async ({ page }) => {
  await boot(page, {});
  await ouvrir(page, [evenement("ev_jam")], "ev_jam");

  const cta = page.locator("#eventDetailCta");
  await expect(cta.locator("[data-v4b-rsvp-go]")).toHaveCount(1);
  await expect(cta.locator("[data-v4b-rsvp-go]")).toHaveText("Je participe");
  const texte = await cta.innerText();
  expect(texte).not.toContain("Peut-être");
  expect(texte).not.toContain("Je ne participe pas");
  expect(texte).not.toContain("Je ne peux pas");
  expect(texte).not.toContain("Choisir ma participation");
  expect(texte).not.toContain("Rejoindre ·");

  // ⑥ Rien n'a été écrit par la simple ouverture.
  expect(await page.evaluate(() => ({
    rsvp: myRsvp("ev_jam"),
    joined: (state.user.joinedEvents || []).length,
    inscrits: (_findCanonicalEvent("ev_jam").attendees || []).length,
  }))).toEqual({ rsvp: null, joined: 0, inscrits: 2 });

  await cta.locator("[data-v4b-rsvp-go]").click();

  // Le moteur historique a fait tout le travail — rien n'a été redéveloppé.
  await expect(cta.locator('[data-v4b-rsvp-etat="going"]')).toBeVisible();
  await expect(cta.locator("[data-v4b-rsvp-etat]")).toHaveText("✓ Je participe");
  expect(await page.evaluate(() => myRsvp("ev_jam"))).toBe("going");
  expect(await page.evaluate(() => (state.user.joinedEvents || []).includes("ev_jam"))).toBe(true);
  expect(await page.evaluate(() => (_findCanonicalEvent("ev_jam").attendees || []).length)).toBe(3);

  // L'état confirmé n'est PAS une bascule : plus d'action primaire concurrente.
  await expect(cta.locator("[data-v4b-rsvp-go]")).toHaveCount(0);

  // Le bloc « Le rendez-vous » suit le décompte réel.
  await expect(page.locator(".v4b-rdv-places")).toContainText("3 participants");

  // Le retrait reste possible, en secondaire, et repasse par le moteur existant.
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  await cta.locator("[data-v4b-rsvp-remove]").click();
  await expect(cta.locator("[data-v4b-rsvp-go]")).toHaveCount(1);
  expect(await page.evaluate(() => myRsvp("ev_jam"))).toBeNull();

  // Télémétrie : métadonnées techniques seulement, aucun identifiant, aucun texte.
  const tel = await page.evaluate(() => window.__v4bTel);
  const go = tel.find((e) => e.name === "ui_v4b_rsvp_go");
  expect(go).toBeTruthy();
  expect(Object.keys(go.meta).sort()).toEqual(["from", "full", "v"]);
});

// ── ⑦ Complet ──────────────────────────────────────────────────────────────
test("complet : le libellé annonce la liste d'attente, le moteur l'applique", async ({ page }) => {
  await boot(page, {});
  await ouvrir(page, [evenement("ev_full", {
    maxAttendees: 2, attendees: ["u_karim", "u_nina"],
  })], "ev_full");

  await expect(page.locator(".v4b-rdv-places")).toContainText("complet");
  const go = page.locator("#eventDetailCta [data-v4b-rsvp-go]");
  await expect(go).toHaveText("Rejoindre la liste d'attente");

  await go.click();
  await expect(page.locator('#eventDetailCta [data-v4b-rsvp-etat="waitlist"]')).toBeVisible();
  await expect(page.locator("#eventDetailCta [data-v4b-rsvp-etat]")).toHaveText("⏳ Sur liste d'attente");
  expect(await page.evaluate(() => myRsvp("ev_full"))).toBe("waitlist");
  expect(await page.evaluate(() => (_findCanonicalEvent("ev_full").attendees || []).length)).toBe(2);
});

// ── ⑧ Annulé et terminé ────────────────────────────────────────────────────
test("annulé et terminé : aucun CTA trompeur", async ({ page }) => {
  await boot(page, {});

  await ouvrir(page, [evenement("ev_off", { status: "cancelled" })], "ev_off");
  await expect(page.locator(".v4b-fiche")).toHaveCount(1);
  await expect(page.locator("#eventDetailCta [data-v4b-rsvp]")).toHaveCount(0);
  expect(await page.locator("#eventDetailCta").innerText()).toContain("annulé");

  await page.evaluate(() => closeEventDetail());
  await ouvrir(page, [evenement("ev_old", { date: Date.now() - 10 * 86400000 })], "ev_old");
  await expect(page.locator(".v4b-fiche")).toHaveCount(1);
  await expect(page.locator("#eventDetailCta [data-v4b-rsvp]")).toHaveCount(0);
  expect(await page.locator("#eventDetailCta").innerText()).toContain("Partager mon expérience");
});

// ── ⑨ L'aperçu de démonstration ────────────────────────────────────────────
test("démonstration : une activité en mémoire, zéro donnée persistée", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors, query: DEMO });

  await expect(page.locator("#eventDetailPage")).toBeVisible();
  await expect(page.locator(".v4b-fiche")).toHaveCount(1);
  await expect(page.locator("#eventDetailHeroTitle .event-detail-title"))
    .toHaveText("Jam acoustique au coucher du soleil");

  // Couverture LOCALE : dessinée dans l'application, jamais une image distante.
  // Si le navigateur refusait le SVG en ligne, le moteur historique poserait son
  // repli graphique — local lui aussi. Les deux issues sont acceptables ; une
  // URL distante ne l'est pas.
  const cover = await page.evaluate(() => {
    const img = document.querySelector("#eventDetailCover img");
    return {
      src: img ? img.getAttribute("src") : "",
      repli: !!document.querySelector("#eventDetailCover .event-detail-cover-placeholder"),
    };
  });
  expect(cover.src === "" || cover.src.startsWith("data:image/svg+xml"), cover.src).toBe(true);
  expect(!!cover.src || cover.repli).toBe(true);

  const rdv = await page.locator(".v4b-rdv").innerText();
  expect(rdv).toContain("18:30");
  expect(rdv).toContain("Lyon");

  await page.locator("#eventDetailCta [data-v4b-rsvp-go]").click();
  await expect(page.locator('#eventDetailCta [data-v4b-rsvp-etat="going"]')).toBeVisible();

  // Ni dans le catalogue, ni dans la mémoire locale, ni dans localStorage.
  const trace = await page.evaluate((demoId) => ({
    catalogue: [...(state.seed.events || []), ...(state.userEvents || [])]
      .some((e) => e && e.id === demoId),
    rsvp: (state.user.eventRsvp || {})[demoId] || null,
    joined: (state.user.joinedEvents || []).includes(demoId),
    stockage: localStorage.getItem("passio_ui_4b"),
    persiste: (localStorage.getItem("passio_mvp_state_v1") || "").includes(demoId),
  }), "__passio_ui4b_demo_event");
  expect(trace).toEqual({
    catalogue: false, rsvp: null, joined: false, stockage: null, persiste: false,
  });
  expect(errors.js, "exceptions JS").toEqual([]);
});

// ── ⑩ Compatibilité UI-3B ──────────────────────────────────────────────────
test("depuis le Feed : « Voir l'activité » mène à la fiche V2, et le retour rend le Feed", async ({ page }) => {
  await boot(page, {});
  await page.evaluate(([evts, posts]) => {
    state.seed.events = evts;
    state.seed.posts = [];
    state.userPosts = [];
    state.userEvents = [];
    state.supabasePosts = posts;
    state.user.joinedEvents = [];
    state.user.eventRsvp = {};
    state.hintsVus = state.hintsVus || {};
    state.hintsVus.feed_auteur = true;
    _activeFeedPassions = new Set(["musique"]);
    activeFeedIntent = "for_you";
    window._feedDomSig = null;
    renderFeed();
  }, [[evenement("ev_jam")], Array.from({ length: 9 }, (_, i) => post("p_" + i, { eventId: "ev_jam" }))]);
  await page.evaluate(() => {
    try { if (typeof fermerHint === "function") fermerHint(); } catch (e) {}
    document.querySelectorAll(".passio-hint").forEach((h) => h.remove());
  });

  // Même garde que la suite UI-3B : `renderFeed` peint en deux temps, et défiler
  // avant la seconde vague ferait mesurer une position que le rendu suivant
  // déplacerait. On attend que le fil ne bouge plus.
  await page.waitForFunction(() => {
    const l = document.getElementById("feedList");
    if (!l) return false;
    const liens = l.querySelectorAll("[data-v3-activity]").length;
    if (!liens) { window.__v4bStable = 0; return false; }
    const sig = l.querySelectorAll("article.post").length + ":" + liens + ":" + l.scrollHeight;
    if (window.__v4bSig === sig) window.__v4bStable = (window.__v4bStable || 0) + 1;
    else { window.__v4bSig = sig; window.__v4bStable = 0; }
    return window.__v4bStable >= 4;
  }, null, { timeout: 15000, polling: 100 });

  await page.evaluate((y) => { document.getElementById("appMain").scrollTop = y; }, DEFILEMENT_PX);
  await page.waitForTimeout(400);
  const cible = await page.evaluate(() => {
    const centre = window.innerHeight / 2;
    let best = null, dist = Infinity;
    document.querySelectorAll("#feedList [data-v3-activity]").forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 80) return;
      const d = Math.abs((r.top + r.bottom) / 2 - centre);
      if (d < dist) { dist = d; best = b.getAttribute("data-v3-post"); }
    });
    return best;
  });
  expect(cible, "un lien doit être visible à cette position").toBeTruthy();
  const avant = await page.evaluate((id) => {
    const el = document.querySelector(`#feedList article.post[data-postid="${id}"]`);
    return el ? Math.round(el.getBoundingClientRect().top) : null;
  }, cible);

  await page.locator(`[data-v3-post="${cible}"]`).click();
  await expect(page.locator("#eventDetailPage")).toBeVisible();

  // La fiche V2, et UNE seule action primaire : UI-3B laisse la barre à UI-4B.
  await expect(page.locator(".v4b-fiche")).toHaveCount(1);
  await expect(page.locator("#eventDetailCta [data-v4b-rsvp-go]")).toHaveCount(1);
  await expect(page.locator("#eventDetailCta [data-v3-rsvp-go]")).toHaveCount(0);

  const identiteAvant = await page.evaluate(() => state.user.currentProfileId);
  await page.locator("#eventDetailPage .event-detail-back").first().click();
  await expect(page.locator("#eventDetailPage")).toBeHidden();

  const apres = await page.evaluate((id) => {
    const el = document.querySelector(`#feedList article.post[data-postid="${id}"]`);
    return el ? Math.round(el.getBoundingClientRect().top) : null;
  }, cible);
  expect(Math.abs(apres - avant), "la publication revient au même endroit").toBeLessThanOrEqual(SEUIL_PX);
  await expect(page.locator("#screen-feed")).toHaveClass(/active/);
  expect(await page.evaluate(() => state.user.currentProfileId)).toBe(identiteAvant);
  expect(await page.evaluate(() => (state.user.joinedEvents || []).length)).toBe(0);
  // Le CTA « Trouver une expérience » d'UI-3A n'a pas bougé non plus.
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(true);
});

// ── ⑪ Kill switches ────────────────────────────────────────────────────────
// Le kill switch local reste prioritaire même quand l'ancien lien d'aperçu est
// dans l'URL : cet interrupteur ne décide plus rien, celui-ci décide toujours.
test("kill switch local : la fiche historique, même sous l'ancien lien d'aperçu", async ({ page }) => {
  await boot(page, { query: LIEN_TOLERE, killLocal: true });
  await ouvrir(page, [evenement("ev_jam")], "ev_jam");

  expect(await page.evaluate(() => window.PassioUIV4B.isEnabled())).toBe(false);
  await expect(page.locator(".v4b-fiche")).toHaveCount(0);
  await expect(page.locator("[data-v4b-rsvp]")).toHaveCount(0);
  expect(await page.locator("#eventDetailCta").innerText()).toContain("Rejoindre");
});

test("coupure en cours de session : retour intégral à la fiche historique", async ({ page }) => {
  await boot(page, {});
  await ouvrir(page, [evenement("ev_jam")], "ev_jam");
  await expect(page.locator(".v4b-fiche")).toHaveCount(1);

  await page.evaluate(() => { window.PASSIO_UI_4B = false; window.PassioUIV4B.apply(); });

  await expect(page.locator(".v4b-fiche")).toHaveCount(0);
  await expect(page.locator("[data-v4b-rsvp]")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/passio-ui-4b/);
  expect(await page.locator("#eventDetailCta").innerText()).toContain("Rejoindre");
  // La fiche est toujours ouverte et complète, et rien n'a été écrit.
  await expect(page.locator("#eventDetailPage")).toBeVisible();
  await expect(page.locator(".event-detail-info-card")).toHaveCount(1);
  expect(await page.evaluate(() => (state.user.joinedEvents || []).length)).toBe(0);
});

// ── ⑫ Clavier, Escape et mobile ────────────────────────────────────────────
test("clavier : l'action est atteignable, Escape ferme la fiche", async ({ page }) => {
  await boot(page, {});
  await ouvrir(page, [evenement("ev_jam")], "ev_jam");

  await page.locator("#eventDetailCta [data-v4b-rsvp-go]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('#eventDetailCta [data-v4b-rsvp-etat="going"]')).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#eventDetailPage")).toBeHidden();
});

test("l'action « Je participe » respecte le contraste AA (4,5:1)", async ({ page }) => {
  await boot(page, {});
  await ouvrir(page, [evenement("ev_jam")], "ev_jam");
  await expect(page.locator("#eventDetailCta [data-v4b-rsvp-go]")).toBeVisible();

  const mesure = await page.evaluate(() => {
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const el = document.querySelector("#eventDetailCta [data-v4b-rsvp-go]");
    const st = getComputedStyle(el);
    const c = lum(parse(st.color)), f = lum(parse(st.backgroundColor));
    const hi = Math.max(c, f), lo = Math.min(c, f);
    return { ratio: (hi + 0.05) / (lo + 0.05), couleur: st.color, fond: st.backgroundColor };
  });
  expect(mesure.ratio, `contraste réel ${mesure.couleur} sur ${mesure.fond}`).toBeGreaterThanOrEqual(4.5);
});

for (const largeur of [320, 390, 430]) {
  test(`aucun débordement et cibles ≥ 44 px en ${largeur} px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 844 });
    await boot(page, {});
    await ouvrir(page, [evenement("ev_jam")], "ev_jam");
    await expect(page.locator(".v4b-fiche")).toHaveCount(1);

    const go = page.locator("#eventDetailCta [data-v4b-rsvp-go]");
    await expect(go).toBeVisible();
    const b = await go.boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(Math.round(b.x + b.width)).toBeLessThanOrEqual(largeur);

    // Le retour et le partage restent des cibles confortables sur la photo.
    for (const sel of ["#eventDetailPage .event-detail-back", "#eventDetailShareBtn"]) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box.height, sel).toBeGreaterThanOrEqual(44);
      expect(box.width, sel).toBeGreaterThanOrEqual(44);
    }

    const debord = await page.evaluate(() => {
      const doc = document.documentElement;
      const rdv = document.querySelector(".v4b-rdv");
      const corps = document.querySelector(".event-detail-body");
      return {
        page: doc.scrollWidth - doc.clientWidth,
        rdv: Math.round(rdv.getBoundingClientRect().right - corps.getBoundingClientRect().right),
      };
    });
    expect(debord.page).toBeLessThanOrEqual(0);
    expect(debord.rdv).toBeLessThanOrEqual(0);

    await go.click();
    const rm = page.locator("#eventDetailCta [data-v4b-rsvp-remove]");
    await expect(rm).toBeVisible();
    const br = await rm.boundingBox();
    expect(br.height).toBeGreaterThanOrEqual(44);
    expect(Math.round(br.x + br.width)).toBeLessThanOrEqual(largeur);
  });
}
