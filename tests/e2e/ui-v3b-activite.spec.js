// Lot UI-3B — publication DÉJÀ reliée à une activité : « Voir l'activité » puis
// RSVP explicite dans la fiche.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① une publication reliée à une activité EXISTANTE porte UN SEUL lien,
//      « Voir l'activité », et rien d'autre (pas de « À vivre en vrai », pas de
//      Passio répétée, pas de trait, pas de bouton de participation) ;
//   ② une publication SANS activité liée garde « Trouver une expérience » (UI-3A) ;
//   ③ les deux références sont couvertes : `eventId` et `sharedReelData` ;
//   ④ une activité introuvable ne produit AUCUN CTA — la publication reste nue ;
//   ⑤ le tap ouvre exactement la fiche attendue, sans créer de participation ;
//   ⑥ la fiche n'offre qu'UNE action primaire « Je participe » — ni « Peut-être »,
//      ni « Je ne participe pas », ni bloc « Choisir ma participation » ;
//   ⑦ la participation n'existe qu'après le geste explicite, via le moteur
//      historique, et se retire sans être une action primaire concurrente ;
//   ⑧ le retour rend la même publication, à la même place, même identité active ;
//   ⑨ les kill switches rendent la fiche et la carte historiques ;
//   ⑩ mobile 320 / 390 / 430 px, cibles ≥ 44 px, contraste AA sur l'action.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SEUIL_PX = 4;
const DEFILEMENT_PX = 400;

// Activités semées. Dates FUTURES : une activité terminée relève de la fiche
// historique (« Partager mon expérience »), que ce lot ne recouvre jamais.
function evenement(id, titre, extra) {
  return Object.assign({
    id, title: titre, passion: "musique", emoji: "🎸", eventType: "Jam session",
    organizerId: "u_lea", date: Date.now() + 3 * 86400000, time: "18:30",
    city: "Lyon", venue: "Café des Arts", price: 0,
    attendees: [], maybes: [], waitlist: [], desc: "Description de " + titre,
  }, extra || {});
}

function post(id, name, extra) {
  return Object.assign({
    id, authorId: "auteur_" + id, authorName: name, authorEmoji: "🎧",
    authorColor: "#7c3aed", passion: "musique", mood: "creation", type: "text",
    text: "Publication de " + name, createdAt: 9000 - id.length,
    likes: 0, comments: [],
  }, extra || {});
}

function hautCarte(page, id) {
  return page.evaluate((postId) => {
    const el = document.querySelector(`#feedList article.post[data-postid="${postId}"]`);
    return el ? Math.round(el.getBoundingClientRect().top) : null;
  }, id);
}

async function boot(page, opts = {}) {
  if (opts.killLocal) await page.addInitScript(() => localStorage.setItem("passio_ui_3", "0"));
  await bootOnboarded(page, opts.errors, 1, { query: opts.query || "" });
  await page.evaluate(() => {
    // Mêmes neutralisations que la suite UI-3A : une requête de démarrage encore
    // en vol remplace `state.supabasePosts` en bloc et vide le fil semé.
    window.supaLoadPosts = async () => [];
    window.supaLoadEventPosts = async () => [];
    window.supaLoadEventComments = async () => [];
    // Aucune écriture réseau : le moteur RSVP doit rester en mode local.
    window._supaReal = false;
    // La géolocalisation est neutralisée et COMPTÉE : le moteur historique
    // repeint l'écran IRL après un RSVP, ce lot ne doit rien demander de plus.
    window.__geoCalls = 0;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = function () { window.__geoCalls++; };
    }
  });
}

// Peuple le fil ET le catalogue d'activités, puis attend que la décoration se
// soit posée (même garde que la suite UI-3A : « 0 lien » est parfaitement stable
// tant que le scan n'a pas tourné).
async function seedFeed(page, posts, events) {
  await page.evaluate(([liste, evts]) => {
    window.__v3Tel = [];
    window.tel = window.tel || {};
    window.tel.action = function (name, meta) { window.__v3Tel.push({ name, meta }); };
    state.hintsVus = state.hintsVus || {};
    state.hintsVus.feed_auteur = true;
    state.seed.posts = [];
    state.seed.events = evts;
    state.userPosts = [];
    state.userEvents = [];
    state.supabasePosts = liste;
    state.user.joinedEvents = [];
    state.user.eventRsvp = {};
    state.user.profiles = [{ id: "pp_0", name: "Audit QA", passion: "musique", emoji: "🎵", color: "#7c3aed" }];
    _activeFeedPassions = new Set(["musique"]);
    activeFeedIntent = "for_you";
    window._feedDomSig = null;
    renderFeed();
  }, [posts, events || []]);
  await page.evaluate(() => {
    try { if (typeof fermerHint === "function") fermerHint(); } catch (e) {}
    document.querySelectorAll(".passio-hint").forEach((h) => h.remove());
  });
  await page.waitForFunction(() => {
    const l = document.getElementById("feedList");
    if (!l) return false;
    const liens = l.querySelectorAll("[data-v3-bridge]").length;
    const actif = !!(window.PassioUIV3 && window.PassioUIV3.isEnabled());
    if (actif && liens === 0) { window.__v3bStable = 0; return false; }
    const sig = l.querySelectorAll("article.post").length + ":" + liens + ":" + l.scrollHeight;
    if (window.__v3bSig === sig) { window.__v3bStable = (window.__v3bStable || 0) + 1; }
    else { window.__v3bSig = sig; window.__v3bStable = 0; }
    return window.__v3bStable >= 4;
  }, null, { timeout: 15000, polling: 100 });
}

const EVENTS = [evenement("ev_jam", "Jam acoustique")];

// Preview de validation destinée à Benjamin : la carte et la fiche sont
// interactives, mais aucune donnée de démonstration ne reste dans state.
test("aperçu UI-3B : une publication liée est visible sans donnée persistée", async ({ page }) => {
  await boot(page, { query: "?passio_preview=passio-ui-3b-demo" });

  const carte = page.locator('article.post[data-postid="__passio_ui3b_demo_post"]');
  await expect(carte).toBeVisible();
  await expect(carte.locator("[data-v3-activity]")).toHaveText("Voir l'activité");
  expect(await carte.innerText()).not.toContain("Trouver une expérience");

  const avant = await page.evaluate(() => ({
    post: [...(state.seed.posts || []), ...(state.userPosts || []), ...(state.supabasePosts || [])]
      .some((p) => p && p.id === "__passio_ui3b_demo_post"),
    event: [...(state.seed.events || []), ...(state.userEvents || [])]
      .some((e) => e && e.id === "__passio_ui3b_demo_event"),
  }));
  expect(avant).toEqual({ post: false, event: false });

  // La preview doit être immédiatement testable, sans bulle de première visite
  // au-dessus du lien.
  await page.evaluate(() => window.PassioUIV3.dismissHint());
  await expect(page.locator(".passio-hint")).toHaveCount(0);
  // Ce scénario vérifie le branchement et la non-persistance. Le tap physique
  // est couvert séparément ; ici on évite les overlays animés globaux entre tests.
  await carte.locator("[data-v3-activity]").evaluate((el) => el.click());
  await expect(page.locator("#eventDetailPage")).toBeVisible();
  await expect(page.locator("#eventDetailHeroTitle .event-detail-title")).toHaveText("Jam acoustique");
  await expect(page.locator("#eventDetailCta [data-v3-rsvp-go]")).toHaveText("Je participe");

  await page.locator("#eventDetailCta [data-v3-rsvp-go]").evaluate((el) => el.click());
  await expect(page.locator('#eventDetailCta [data-v3-rsvp-etat="going"]')).toBeVisible();

  const apres = await page.evaluate(() => ({
    post: [...(state.seed.posts || []), ...(state.userPosts || []), ...(state.supabasePosts || [])]
      .some((p) => p && p.id === "__passio_ui3b_demo_post"),
    event: [...(state.seed.events || []), ...(state.userEvents || [])]
      .some((e) => e && e.id === "__passio_ui3b_demo_event"),
    rsvp: (state.user.eventRsvp || {})["__passio_ui3b_demo_event"] || null,
    joined: (state.user.joinedEvents || []).includes("__passio_ui3b_demo_event"),
  }));
  expect(apres).toEqual({ post: false, event: false, rsvp: null, joined: false });
});

// Quatre cas d'éligibilité en un seul fil : référence directe, référence
// partagée, activité introuvable, et aucune activité (UI-3A).
const POSTS = [
  post("p_direct", "Alice", { eventId: "ev_jam" }),
  post("p_share", "Bruno", { sharedReelData: { kind: "event", id: "ev_jam", title: "Jam acoustique", date: Date.now() + 3 * 86400000, passion: "musique", city: "Lyon" } }),
  post("p_perdu", "Carla", { eventId: "ev_supprime" }),
  post("p_libre", "Diane"),
];

// ── ① + ② + ③ + ④ Éligibilité et contrat visuel de la carte ────────────────
test("publication reliée : un seul CTA « Voir l'activité », et rien d'autre", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors });
  await seedFeed(page, POSTS, EVENTS);

  // ③ Les deux références portent le même lien, unique.
  for (const id of ["p_direct", "p_share"]) {
    const carte = page.locator(`article.post[data-postid="${id}"]`);
    await expect(carte.locator("[data-v3-activity]")).toHaveCount(1);
    await expect(carte.locator("[data-v3-activity]")).toHaveText("Voir l'activité");
    await expect(carte.locator("[data-v3-activity]")).toHaveAttribute("data-v3-activity", "ev_jam");

    // ① La ligne basse ne porte QUE ce lien : un seul enfant, aucun autre texte.
    const ligne = carte.locator("[data-v3-bridge]");
    expect(await ligne.evaluate((el) => el.children.length)).toBe(1);
    expect(await ligne.innerText()).toBe("Voir l'activité");
    await expect(ligne.locator(".v3-bridge-trace")).toHaveCount(0);
    await expect(ligne.locator(".v3-bridge-passion")).toHaveCount(0);
    // Ni « Trouver une expérience » (UI-3A), ni bouton de participation.
    await expect(carte.locator("[data-v3-tempt]")).toHaveCount(0);
    await expect(carte.locator("[data-v3-rsvp-go]")).toHaveCount(0);
  }

  // Le partage d'événement conserve son aperçu historique dans le DOM pour le
  // kill switch, mais il est invisible : une seule porte reste à l'écran.
  const partagee = page.locator('article.post[data-postid="p_share"]');
  const apercuHistorique = partagee.locator(".post-vlog-card");
  await expect(apercuHistorique).toHaveCount(1);
  await expect(apercuHistorique).toBeHidden();
  await expect(partagee.locator("[data-v3-activity]")).toBeVisible();

  // ① Aucun des libellés écartés par Benjamin n'apparaît dans le fil.
  const fil = await page.locator("#feedList").innerText();
  expect(fil).not.toContain("À vivre en vrai");
  expect(fil).not.toContain("Je participe");
  expect(fil).not.toContain("Je viens");

  // ④ Activité introuvable : aucun CTA, la publication reste visible et nue.
  const perdu = page.locator('article.post[data-postid="p_perdu"]');
  await expect(perdu).toBeVisible();
  await expect(perdu.locator("[data-v3-bridge]")).toHaveCount(0);
  await expect(perdu).not.toHaveAttribute("data-v3-decore", "1");
  expect(await perdu.innerText()).not.toContain("Voir l'activité");

  // ② Une publication sans activité liée garde exactement l'acquis UI-3A.
  const libre = page.locator('article.post[data-postid="p_libre"]');
  await expect(libre.locator("[data-v3-tempt]")).toHaveText("Trouver une expérience");
  await expect(libre.locator("[data-v3-activity]")).toHaveCount(0);

  // Coupure immédiate : l'ancienne sous-carte revient et le lien UI-3B part,
  // sans rechargement ni reconstruction du Feed.
  await page.evaluate(() => { window.PASSIO_UI_3 = false; window.PassioUIV3.apply(); });
  await expect(apercuHistorique).toBeVisible();
  await expect(partagee.locator("[data-v3-activity]")).toHaveCount(0);
  expect(await apercuHistorique.innerText()).toContain("Voir");

  expect(errors.js, "exceptions JS").toEqual([]);
});

// ── ⑤ + ⑥ Le tap ouvre la fiche, sans rien écrire ──────────────────────────
test("« Voir l'activité » ouvre la fiche attendue, sans aucun RSVP", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS, EVENTS);

  await page.locator('article.post[data-postid="p_direct"] [data-v3-activity]').click();

  const fiche = page.locator("#eventDetailPage");
  await expect(fiche).toBeVisible();
  // Exactement l'activité liée — aucun basculement silencieux.
  expect(await page.evaluate(() => window._openEventDetailId)).toBe("ev_jam");
  await expect(page.locator("#eventDetailHeroTitle .event-detail-title")).toHaveText("Jam acoustique");
  // Informations sûres, servies par le moteur existant.
  const corps = await page.locator("#eventDetailContent").innerText();
  expect(corps).toContain("Lyon");
  expect(corps).toContain("Description de Jam acoustique");

  // ⑥ Une seule action primaire, et pas l'ombre des deux autres états.
  const cta = page.locator("#eventDetailCta");
  await expect(cta.locator("[data-v3-rsvp-go]")).toHaveCount(1);
  await expect(cta.locator("[data-v3-rsvp-go]")).toHaveText("Je participe");
  const texteCta = await cta.innerText();
  expect(texteCta).not.toContain("Peut-être");
  expect(texteCta).not.toContain("Je ne participe pas");
  expect(texteCta).not.toContain("Je ne peux pas");
  expect(texteCta).not.toContain("Choisir ma participation");
  // Le CTA historique n'est plus là en doublon.
  expect(texteCta).not.toContain("Rejoindre");
  // Aucune feuille de choix à trois états n'a été ouverte.
  await expect(page.locator("#modalBackdrop")).not.toHaveClass(/active/);

  // ⑤ Rien n'a été écrit par la simple ouverture.
  expect(await page.evaluate(() => ({
    joined: (state.user.joinedEvents || []).length,
    rsvp: Object.keys(state.user.eventRsvp || {}).length,
    inscrits: (_findCanonicalEvent("ev_jam").attendees || []).length,
  }))).toEqual({ joined: 0, rsvp: 0, inscrits: 0 });

  // ⑫ Télémétrie : métadonnées techniques seulement, aucun texte libre.
  const tel = await page.evaluate(() => window.__v3Tel);
  const ouverture = tel.find((e) => e.name === "ui_v3b_open_event");
  expect(ouverture).toBeTruthy();
  expect(Object.keys(ouverture.meta).sort()).toEqual(["src", "v"]);
  expect(ouverture.meta.src).toBe("direct");
});

// ── ⑦ La participation : un geste explicite, le moteur historique ──────────
test("« Je participe » n'écrit qu'au geste explicite, via le moteur historique", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS, EVENTS);

  await page.locator('article.post[data-postid="p_share"] [data-v3-activity]').click();
  await expect(page.locator("#eventDetailPage")).toBeVisible();
  expect(await page.evaluate(() => myRsvp("ev_jam"))).toBeNull();

  await page.locator("#eventDetailCta [data-v3-rsvp-go]").click();

  // Le moteur historique a fait son travail : mémoire locale, liste d'inscrits,
  // et compatibilité `joinedEvents` — rien n'a été redéveloppé ici.
  await expect(page.locator('#eventDetailCta [data-v3-rsvp-etat="going"]')).toBeVisible();
  await expect(page.locator("#eventDetailCta [data-v3-rsvp-etat]")).toHaveText("✓ Je participe");
  expect(await page.evaluate(() => myRsvp("ev_jam"))).toBe("going");
  expect(await page.evaluate(() => (state.user.joinedEvents || []).includes("ev_jam"))).toBe(true);
  expect(await page.evaluate(() => (_findCanonicalEvent("ev_jam").attendees || []).length)).toBe(1);

  // L'état confirmé n'est PAS une bascule : plus d'action primaire concurrente.
  await expect(page.locator("#eventDetailCta [data-v3-rsvp-go]")).toHaveCount(0);
  const cta = page.locator("#eventDetailCta");
  expect(await cta.innerText()).not.toContain("Peut-être");

  // Le retrait reste possible, en secondaire, et repasse par le moteur existant.
  // ⚠️ Les toasts de récompense sont retirés d'abord : ils sont posés en couche
  // au-dessus et intercepteraient le tap le temps de s'effacer.
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  await page.locator("#eventDetailCta [data-v3-rsvp-remove]").click();
  await expect(page.locator("#eventDetailCta [data-v3-rsvp-go]")).toHaveCount(1);
  expect(await page.evaluate(() => myRsvp("ev_jam"))).toBeNull();
  expect(await page.evaluate(() => (_findCanonicalEvent("ev_jam").attendees || []).length)).toBe(0);

  // Télémétrie de l'action, sans identifiant ni texte libre.
  const tel = await page.evaluate(() => window.__v3Tel);
  const go = tel.find((e) => e.name === "ui_v3b_rsvp_go");
  expect(go).toBeTruthy();
  expect(Object.keys(go.meta).sort()).toEqual(["from", "v"]);
});

// ── ⑧ Retour au Feed ───────────────────────────────────────────────────────
test("retour : même publication, même position, même identité active", async ({ page }) => {
  await boot(page);
  const beaucoup = [];
  for (let i = 0; i < 9; i++) beaucoup.push(post("p_f" + "x".repeat(i), "Auteur " + i, { eventId: "ev_jam" }));
  await seedFeed(page, beaucoup, EVENTS);

  const identiteAvant = await page.evaluate(() => state.user.currentProfileId);
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

  const avant = await hautCarte(page, cible);
  expect(await page.evaluate(() => document.getElementById("appMain").scrollTop),
    "le fil doit réellement avoir défilé").toBeGreaterThan(100);

  await page.locator(`[data-v3-post="${cible}"]`).click();
  await expect(page.locator("#eventDetailPage")).toBeVisible();

  await page.locator("#eventDetailPage .event-detail-back").first().click();
  await expect(page.locator("#eventDetailPage")).toBeHidden();

  const apres = await hautCarte(page, cible);
  expect(Math.abs(apres - avant), "la carte tapée revient au même endroit").toBeLessThanOrEqual(SEUIL_PX);
  await expect(page.locator("#screen-feed")).toHaveClass(/active/);
  expect(await page.evaluate(() => state.user.currentProfileId)).toBe(identiteAvant);
  // Le retour n'a rien écrit non plus.
  expect(await page.evaluate(() => (state.user.joinedEvents || []).length)).toBe(0);
});

// ── ⑨ Kill switches ────────────────────────────────────────────────────────
test("kill switch local : ni lien sur la carte, ni action V2 dans la fiche", async ({ page }) => {
  await boot(page, { killLocal: true });
  await seedFeed(page, POSTS, EVENTS);

  await expect(page.locator("#feedList [data-v3-activity]")).toHaveCount(0);
  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(0);
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(false);

  // La fiche historique reste EXACTEMENT celle d'avant.
  await page.evaluate(() => openEventDetails("ev_jam"));
  await expect(page.locator("#eventDetailPage")).toBeVisible();
  await expect(page.locator("#eventDetailCta [data-v3-rsvp]")).toHaveCount(0);
  expect(await page.locator("#eventDetailCta").innerText()).toContain("Rejoindre");
});

test("coupure en cours de session : la fiche redevient historique", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS, EVENTS);

  await page.locator('article.post[data-postid="p_direct"] [data-v3-activity]').click();
  await expect(page.locator("#eventDetailCta [data-v3-rsvp-go]")).toHaveCount(1);

  await page.evaluate(() => { window.PASSIO_UI_3 = false; window.PassioUIV3.apply(); });

  // La barre d'action rendue par le moteur historique, sans rechargement…
  await expect(page.locator("#eventDetailCta [data-v3-rsvp]")).toHaveCount(0);
  expect(await page.locator("#eventDetailCta").innerText()).toContain("Rejoindre");
  // …et le fil a perdu le lien du lot.
  await expect(page.locator("#feedList [data-v3-activity]")).toHaveCount(0);
  // Aucune participation n'a été créée par la coupure.
  expect(await page.evaluate(() => (state.user.joinedEvents || []).length)).toBe(0);
});

// ── ⑩ Accessibilité et mobile ──────────────────────────────────────────────
test("l'action « Je participe » respecte le contraste AA (4,5:1)", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS, EVENTS);
  await page.locator('article.post[data-postid="p_direct"] [data-v3-activity]').click();
  await expect(page.locator("#eventDetailCta [data-v3-rsvp-go]")).toBeVisible();

  const mesure = await page.evaluate(() => {
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const el = document.querySelector("#eventDetailCta [data-v3-rsvp-go]");
    const st = getComputedStyle(el);
    const c = lum(parse(st.color)), f = lum(parse(st.backgroundColor));
    const hi = Math.max(c, f), lo = Math.min(c, f);
    return { ratio: (hi + 0.05) / (lo + 0.05), couleur: st.color, fond: st.backgroundColor };
  });
  expect(mesure.ratio, `contraste réel ${mesure.couleur} sur ${mesure.fond}`).toBeGreaterThanOrEqual(4.5);
});

test("clavier : le lien et l'action sont atteignables et actionnables", async ({ page }) => {
  await boot(page);
  await seedFeed(page, [post("p_direct", "Alice", { eventId: "ev_jam" })], EVENTS);

  // Le lien est un vrai bouton : focus puis Entrée suffisent.
  await page.locator('[data-v3-activity="ev_jam"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#eventDetailPage")).toBeVisible();

  await page.locator("#eventDetailCta [data-v3-rsvp-go]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('#eventDetailCta [data-v3-rsvp-etat="going"]')).toBeVisible();
});

for (const largeur of [320, 390, 430]) {
  test(`aucun débordement et cibles ≥ 44 px en ${largeur} px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 844 });
    await boot(page);
    await seedFeed(page, POSTS, EVENTS);

    const lien = page.locator('article.post[data-postid="p_direct"] [data-v3-activity]');
    await expect(lien).toBeVisible();
    expect((await lien.boundingBox()).height).toBeGreaterThanOrEqual(44);

    const debord = await page.evaluate(() => {
      const doc = document.documentElement;
      const row = document.querySelector('article.post[data-postid="p_direct"] [data-v3-bridge]');
      const carte = row.closest("article.post");
      return {
        page: doc.scrollWidth - doc.clientWidth,
        ligne: Math.round(row.getBoundingClientRect().right - carte.getBoundingClientRect().right),
      };
    });
    expect(debord.page).toBeLessThanOrEqual(0);
    expect(debord.ligne).toBeLessThanOrEqual(0);

    await lien.click();
    const go = page.locator("#eventDetailCta [data-v3-rsvp-go]");
    await expect(go).toBeVisible();
    const b = await go.boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(Math.round(b.x + b.width)).toBeLessThanOrEqual(largeur);

    // État confirmé : le retrait reste dans l'écran et reste tapable.
    await go.click();
    const rm = page.locator("#eventDetailCta [data-v3-rsvp-remove]");
    await expect(rm).toBeVisible();
    const br = await rm.boundingBox();
    expect(br.height).toBeGreaterThanOrEqual(44);
    expect(Math.round(br.x + br.width)).toBeLessThanOrEqual(largeur);
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
