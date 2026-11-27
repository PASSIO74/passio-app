// Rencontrer — fiabilité de la participation (2026-11-27).
// Faux serveur PostgREST multi-comptes (policies et déclencheurs miroirs de la
// production), vrai SDK, vrais handlers. AUCUNE écriture réelle.
//
// Trois défauts, chacun REPRODUIT avant d'être corrigé (sondes à latence) :
//
//   A. DEUX RÉPONSES SUR LA MÊME ACTIVITÉ PARTAIENT EN PARALLÈLE. S'inscrire est
//      un UPDATE (0 ligne) puis un INSERT ; un retrait touché avant le verdict
//      glissait son DELETE entre les deux (0 ligne = « réussi »), et l'INSERT se
//      posait après : l'écran disait « Désinscrit », la base gardait la place.
//      → `setEventRsvp` tient une file par activité (①②③).
//
//   B. APRÈS UN REFUS, L'ÉCRAN NE REJOIGNAIT PAS LA BASE. Activité annulée,
//      supprimée ou déplacée pendant qu'on la regarde : le bon message (ou
//      « réessaie », pour une activité supprimée), puis « Je participe » toujours
//      là, et le même refus à chaque appui. Deux motifs de la base n'étaient pas
//      reconnus du tout (limite du jour, inscription fermée) (④ à ⑨).
//
//   C. LA LECTURE DU DÉMARRAGE EFFAÇAIT UNE RÉPONSE TOUTE NEUVE. « La base fait
//      foi » (`_fusionnerRsvpServeur`) s'appliquait aussi à une lecture partie
//      AVANT le geste : « pas inscrit » à l'écran, « je viens » en base (⑩⑪).
//
// Contre-épreuve de chaque cas : sur le code d'avant (8d5b5b29), il est rouge.
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000031";
const B = "bbbbbbbb-0000-4000-8000-000000000032";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function peupler(srv, evId, { inscrit = false, places = 5 } = {}) {
  srv.compte(ORGA, "orga_fiab"); srv.compte(B, "bob_fiab");
  const dans2j = new Date(Date.now() + 2 * 86400000).toISOString().replace("Z", "");
  srv.t.events.push({ id: evId, author_id: ORGA, organizer_id: ORGA, title: "Atelier fiabilité", passion_id: "musique", city: "Annecy",
    emoji: "🎸", max_attendees: places, date_at: dans2j, status: "active", co_organizers: [], visibilite: "publique",
    created_at: new Date().toISOString().replace("Z", ""), lat: 45.9, lng: 6.12 });
  srv.t.event_attendees.push({ event_id: evId, user_id: ORGA, rsvp: "going", created_at: new Date(Date.now() - 3 * 3600000).toISOString() });
  if (inscrit) srv.t.event_attendees.push({ event_id: evId, user_id: B, rsvp: "going", created_at: new Date(Date.now() - 2 * 3600000).toISOString() });
}

// Le compte B, l'activité en mémoire comme après une lecture de Rencontrer, et
// sa réponse connue de l'appareil (comme après le démarrage).
async function ouvrir(browser, srv, evId, { inscrit = false } = {}) {
  const ctx = await browser.newContext();
  const o = await ouvrirCompte(ctx, srv, B, { nom: "bob_fiab" });
  // Le démarrage a fini de lire (`_supaInitTerminee`) : aucune lecture de fond ne
  // croise plus les gestes du test — sauf celle que ⑩ et ⑪ lancent exprès.
  await o.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
  await o.page.evaluate(async ([id, inscrit]) => {
    const evs = await supaLoadEvents();
    const ev = evs.find((e) => e.id === id);
    state.seed.events = (state.seed.events || []).filter((e) => e.id !== id);
    state.seed.events.unshift(ev);
    _setMyRsvpLocal(id, inscrit ? "going" : null);
    saveState();
  }, [evId, inscrit]);
  return { ctx, page: o.page };
}

// Latence du trajet ALLER des écritures de participation, par méthode : la
// requête met `ms` à atteindre le serveur (qui, lui, traite dans l'ordre d'arrivée).
async function latence(page, parMethode) {
  await page.route(/supabase\.co\/rest\/v1\/event_attendees/, async (route) => {
    const ms = parMethode[route.request().method()];
    if (ms) await pause(ms);
    return route.fallback();
  });
}

const ecritures = (srv, depuis) => srv.journal.slice(depuis)
  .filter((r) => r.table === "event_attendees" && !r.rpc && r.m !== "GET" && r.me === B).map((r) => r.m);
const ligne = (srv, evId) => srv.t.event_attendees.find((x) => x.event_id === evId && x.user_id === B) || null;
const ecran = (page, evId) => page.evaluate((id) => myRsvp(id), evId);
const toasts = (page) => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));

test.describe("Rencontrer — fiabilité de la participation", () => {
  test.setTimeout(120000);

  test("① « Je participe » puis « Retirer » avant le verdict : le retrait part APRÈS l'inscription, écran et base disent « pas inscrit »", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_fiab_1";
    peupler(srv, evId);
    const { ctx, page } = await ouvrir(browser, srv, evId);
    try {
      await latence(page, { PATCH: 120, POST: 120, DELETE: 120 });
      const j0 = srv.journal.length;
      await page.evaluate(async (id) => {
        window.__toasts = [];
        const a = setEventRsvp(id, "going");
        await new Promise((r) => setTimeout(r, 60));   // le second geste tombe pendant le premier
        const b = setEventRsvp(id, null);
        await Promise.all([a, b]);
      }, evId);
      expect(ecritures(srv, j0), "une écriture à la fois, dans l'ordre des gestes").toEqual(["PATCH", "POST", "DELETE"]);
      expect(ligne(srv, evId), "la place est rendue EN BASE").toBeNull();
      expect(await ecran(page, evId), "l'écran dit la même chose que la base").toBeNull();
      expect(await toasts(page)).toContain("Désinscrit");
    } finally { await ctx.close(); }
  });

  test("② inscrit : « Retirer » (lent) puis « Je participe » (rapide) — la réinscription attend le retrait, inscrit des deux côtés", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_fiab_2";
    peupler(srv, evId, { inscrit: true });
    const { ctx, page } = await ouvrir(browser, srv, evId, { inscrit: true });
    try {
      // Le DELETE traîne : en parallèle, l'UPDATE de la réinscription passait
      // AVANT lui (ligne trouvée, « réussi »), puis le DELETE l'effaçait.
      await latence(page, { DELETE: 350, PATCH: 20, POST: 20 });
      const j0 = srv.journal.length;
      await page.evaluate(async (id) => {
        const a = setEventRsvp(id, null);
        await new Promise((r) => setTimeout(r, 60));
        const b = setEventRsvp(id, "going");
        await Promise.all([a, b]);
      }, evId);
      expect(ecritures(srv, j0)).toEqual(["DELETE", "PATCH", "POST"]);
      expect((ligne(srv, evId) || {}).rsvp, "inscrit EN BASE").toBe("going");
      expect(await ecran(page, evId), "inscrit À L'ÉCRAN").toBe("going");
    } finally { await ctx.close(); }
  });

  test("③ feuille de choix : « Je participe » puis « Peut-être » aussitôt — la DERNIÈRE réponse est gardée, sans faux échec", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_fiab_3";
    peupler(srv, evId);
    const { ctx, page } = await ouvrir(browser, srv, evId);
    try {
      await latence(page, { PATCH: 120, POST: 120 });
      await page.evaluate(async (id) => {
        window.__toasts = [];
        const a = setEventRsvp(id, "going");
        await new Promise((r) => setTimeout(r, 60));
        const b = setEventRsvp(id, "maybe");
        await Promise.all([a, b]);
      }, evId);
      expect((ligne(srv, evId) || {}).rsvp, "« peut-être » EN BASE").toBe("maybe");
      expect(await ecran(page, evId)).toBe("maybe");
      expect((await toasts(page)).filter((t) => /non enregistrée/.test(t)), "aucun « non enregistrée » pour un choix qui a abouti").toEqual([]);
    } finally { await ctx.close(); }
  });

  test("④ annulée pendant qu'on regarde la fiche : « Activité annulée » à l'écran, et le second appui n'écrit plus", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_fiab_4";
    peupler(srv, evId);
    const { ctx, page } = await ouvrir(browser, srv, evId);
    try {
      await page.evaluate((id) => { goTo("irl"); openEventDetails(id); }, evId);
      srv.t.events.find((e) => e.id === evId).status = "cancelled";   // l'organisation annule, ailleurs
      await page.evaluate((id) => { window.__toasts = []; return setEventRsvp(id, "going"); }, evId);
      expect(await toasts(page)).toContain("Cette activité a été annulée");
      const fiche = page.locator("#eventDetailPage");
      await expect(fiche.getByRole("button", { name: "Activité annulée" }).first()).toBeVisible();
      await expect(fiche.getByRole("button", { name: /^Je participe$/ })).toHaveCount(0);
      const j1 = srv.journal.length;
      await page.evaluate((id) => setEventRsvp(id, "going"), evId);
      expect(ecritures(srv, j1), "plus d'écriture vouée au même refus").toEqual([]);
      expect(await ecran(page, evId)).toBeNull();
    } finally { await ctx.close(); }
  });

  for (const cas of [
    { nom: "« je viens » (la garde de capacité le dit : activite_introuvable)", rsvp: "going", panne: null },
    { nom: "« peut-être » (la clé étrangère le dit : 23503)", rsvp: "maybe",
      panne: { table: "event_attendees", methode: "POST", status: 409, fois: 1,
        body: { code: "23503", message: "insert or update on table \"event_attendees\" violates foreign key constraint \"event_attendees_event_id_fkey\"", details: "Key (event_id) is not present in table \"events\"." } } },
  ]) {
    test("⑤ supprimée pendant qu'on la regarde — " + cas.nom + " : « plus disponible », la fiche se ferme, la carte part", async ({ browser }) => {
      const srv = new FauxServeur();
      const evId = "evt_fiab_5_" + cas.rsvp;
      peupler(srv, evId);
      const { ctx, page } = await ouvrir(browser, srv, evId);
      try {
        await page.evaluate((id) => { goTo("irl"); openEventDetails(id); }, evId);
        await expect(page.locator('#eventList .event-card[data-evid="' + evId + '"]')).toHaveCount(1);
        srv.t.events = srv.t.events.filter((e) => e.id !== evId);                 // supprimée ailleurs…
        srv.t.event_attendees = srv.t.event_attendees.filter((a) => a.event_id !== evId);   // …et la cascade
        if (cas.panne) srv.pannes.push(cas.panne);
        await page.evaluate(([id, r]) => { window.__toasts = []; return setEventRsvp(id, r); }, [evId, cas.rsvp]);
        const dits = await toasts(page);
        expect(dits, "un seul message, le vrai").toEqual(["Cette activité n'est plus disponible"]);
        expect(await page.evaluate((id) => !!_findCanonicalEvent(id), evId), "elle a quitté la mémoire de la session").toBe(false);
        await expect(page.locator("#eventDetailPage")).toBeHidden();
        await expect(page.locator('#eventList .event-card[data-evid="' + evId + '"]')).toHaveCount(0);
        expect(await ecran(page, evId)).toBeNull();
        expect(ligne(srv, evId), "rien n'a été écrit").toBeNull();
      } finally { await ctx.close(); }
    });
  }

  test("⑥ déplacée dans le passé pendant qu'on la regarde : relue, la fiche n'offre plus de s'inscrire", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_fiab_6";
    peupler(srv, evId);
    const { ctx, page } = await ouvrir(browser, srv, evId);
    try {
      await page.evaluate((id) => { goTo("irl"); openEventDetails(id); }, evId);
      const hier = new Date(Date.now() - 26 * 3600000).toISOString().replace("Z", "");
      Object.assign(srv.t.events.find((e) => e.id === evId), { date_at: hier, end_at: null });
      await page.evaluate((id) => { window.__toasts = []; return setEventRsvp(id, "going"); }, evId);
      expect(await toasts(page)).toContain("Cette activité est déjà passée");
      expect(await page.evaluate((id) => _eventIsOver(_findCanonicalEvent(id)), evId), "la nouvelle date est en mémoire").toBe(true);
      await expect(page.locator("#eventDetailPage").getByRole("button", { name: /^Je participe$/ })).toHaveCount(0);
      // La liste « à venir » ne la montre plus.
      await expect(page.locator('#eventList .event-card[data-evid="' + evId + '"]')).toHaveCount(0);
    } finally { await ctx.close(); }
  });

  test("⑦ limite d'inscriptions du jour : dite telle quelle (« réessaie demain »), l'activité reste", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_fiab_7";
    peupler(srv, evId);
    const { ctx, page } = await ouvrir(browser, srv, evId);
    try {
      srv.pannes.push({ table: "event_attendees", methode: "POST", status: 400, fois: 1, body: { code: "P0001", message: "inscriptions_jour_limite", details: null, hint: null } });
      await page.evaluate((id) => { window.__toasts = []; return setEventRsvp(id, "going"); }, evId);
      expect(await toasts(page)).toEqual(["Tu as atteint la limite d'inscriptions pour aujourd'hui — réessaie demain"]);
      expect(await page.evaluate((id) => !!_findCanonicalEvent(id), evId), "l'activité n'a rien : elle reste").toBe(true);
      expect(await ecran(page, evId)).toBeNull();
    } finally { await ctx.close(); }
  });

  test("⑧ inscription fermée par la base (42501) : plus lisible → « plus disponible » et elle part ; encore lisible → dit sans « réessaie », et elle reste", async ({ browser }) => {
    const refus = { table: "event_attendees", methode: "POST", status: 403, fois: 1, body: { code: "42501", message: "organisateur_bloque", details: null, hint: null } };
    // (a) la base ne la rend plus à ce compte
    {
      const srv = new FauxServeur();
      const evId = "evt_fiab_8a";
      peupler(srv, evId);
      const { ctx, page } = await ouvrir(browser, srv, evId);
      try {
        srv.t.events = srv.t.events.filter((e) => e.id !== evId);
        srv.pannes.push(Object.assign({}, refus));
        await page.evaluate((id) => { window.__toasts = []; return setEventRsvp(id, "going"); }, evId);
        expect(await toasts(page), "jamais le mot « bloqué »").toEqual(["Cette activité n'est plus disponible"]);
        expect(await page.evaluate((id) => !!_findCanonicalEvent(id), evId)).toBe(false);
      } finally { await ctx.close(); }
    }
    // (b) elle se lit encore
    {
      const srv = new FauxServeur();
      const evId = "evt_fiab_8b";
      peupler(srv, evId);
      const { ctx, page } = await ouvrir(browser, srv, evId);
      try {
        srv.pannes.push(Object.assign({}, refus));
        await page.evaluate((id) => { window.__toasts = []; return setEventRsvp(id, "going"); }, evId);
        expect(await toasts(page)).toEqual(["Tu ne peux pas t'inscrire à cette activité"]);
        expect(await page.evaluate((id) => !!_findCanonicalEvent(id), evId)).toBe(true);
        expect(await ecran(page, evId)).toBeNull();
      } finally { await ctx.close(); }
    }
  });

  test("⑨ un refus qui CITE la colonne `rsvp` n'inscrit personne en « je viens » (le repli d'avant-migration ne joue que sur une colonne inconnue)", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_fiab_9";
    peupler(srv, evId);
    const { ctx, page } = await ouvrir(browser, srv, evId);
    try {
      srv.pannes.push({ table: "event_attendees", methode: "POST", status: 400, fois: 1,
        body: { code: "23514", message: "new row for relation \"event_attendees\" violates check constraint \"event_attendees_rsvp_valeurs\"", details: null, hint: null } });
      const j0 = srv.journal.length;
      await page.evaluate((id) => { window.__toasts = []; return setEventRsvp(id, "maybe"); }, evId);
      expect(ecritures(srv, j0), "pas de seconde insertion SANS `rsvp` (la base la rangerait en « je viens »)").toEqual(["PATCH", "POST"]);
      expect(ligne(srv, evId)).toBeNull();
      expect(await ecran(page, evId)).toBeNull();
      expect(await toasts(page)).toContain("⚠️ Inscription non enregistrée — réessaie");
    } finally { await ctx.close(); }
  });

  // La lecture « mes réponses » du démarrage, retenue pendant le geste : son
  // instantané est pris À SON ARRIVÉE au serveur (avant l'écriture), sa réponse
  // n'est rendue qu'après le verdict du geste — puis appliquée comme au démarrage.
  async function lectureRetenue(page, srv) {
    let lacher;
    const feu = new Promise((r) => { lacher = r; });
    await page.route(/supabase\.co\/rest\/v1\/event_attendees\?select=event_id(%2C|,)rsvp(%2C|,)checked_in_at/, async (route) => {
      const rep = await srv.traiter(route.request());
      await feu;
      return route.fulfill(rep);
    });
    return lacher;
  }

  test("⑩ une lecture de mes réponses partie AVANT « Je participe » ne l'efface pas", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_fiab_10";
    peupler(srv, evId);
    const { ctx, page } = await ouvrir(browser, srv, evId);
    try {
      const lacher = await lectureRetenue(page, srv);
      await page.evaluate(() => { window.__lecture = supaLoadMyRsvps(); });
      await expect.poll(() => srv.journal.filter((r) => r.table === "event_attendees" && r.m === "GET" && /checked_in_at/.test(r.url)).length, { message: "la lecture a atteint le serveur" }).toBeGreaterThan(0);
      await page.evaluate((id) => setEventRsvp(id, "going"), evId);
      expect((ligne(srv, evId) || {}).rsvp, "l'inscription est en base").toBe("going");
      lacher();
      const apres = await page.evaluate(async (id) => {
        const map = await window.__lecture;
        const sansMoi = !map[id];
        _fusionnerRsvpServeur(map, true);   // ce que fait le démarrage (session vérifiée)
        return { sansMoi, rsvp: myRsvp(id) };
      }, evId);
      expect(apres.sansMoi, "témoin : la lecture, plus vieille, ne connaît pas l'inscription").toBe(true);
      expect(apres.rsvp, "l'écran reste « inscrit », comme la base").toBe("going");
    } finally { await ctx.close(); }
  });

  test("⑪ … ni ne ressuscite une inscription qu'on vient de retirer ; une réponse ANCIENNE, elle, suit toujours la base", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_fiab_11", autre = "evt_fiab_11_autre";
    peupler(srv, evId, { inscrit: true });
    // Une seconde activité, inscrite « ici » mais plus en base (désinscrit ailleurs) :
    // la règle « la base fait foi » doit continuer de s'y appliquer.
    const dans3j = new Date(Date.now() + 3 * 86400000).toISOString().replace("Z", "");
    srv.t.events.push({ id: autre, author_id: ORGA, organizer_id: ORGA, title: "Autre atelier", passion_id: "musique", city: "Annecy", emoji: "🎸",
      max_attendees: 5, date_at: dans3j, status: "active", co_organizers: [], visibilite: "publique", created_at: new Date().toISOString().replace("Z", ""), lat: 45.9, lng: 6.12 });
    const { ctx, page } = await ouvrir(browser, srv, evId, { inscrit: true });
    try {
      await page.evaluate(async (id) => {
        const ev = (await supaLoadEvents()).find((e) => e.id === id);
        state.seed.events.unshift(ev);
        _setMyRsvpLocal(id, "going");   // inscrit à l'écran, sans ligne en base
        saveState();
      }, autre);
      const lacher = await lectureRetenue(page, srv);
      await page.evaluate(() => { window.__lecture = supaLoadMyRsvps(); });
      await expect.poll(() => srv.journal.filter((r) => r.table === "event_attendees" && r.m === "GET" && /checked_in_at/.test(r.url)).length).toBeGreaterThan(0);
      await page.evaluate((id) => setEventRsvp(id, null), evId);
      expect(ligne(srv, evId), "la désinscription est en base").toBeNull();
      lacher();
      const apres = await page.evaluate(async ([id, autre]) => {
        const map = await window.__lecture;
        const avecMoi = !!map[id];
        _fusionnerRsvpServeur(map, true);
        return { avecMoi, rsvp: myRsvp(id), autre: myRsvp(autre) };
      }, [evId, autre]);
      expect(apres.avecMoi, "témoin : la lecture, plus vieille, me croit encore inscrit").toBe(true);
      expect(apres.rsvp, "l'écran reste « pas inscrit », comme la base").toBeNull();
      expect(apres.autre, "contre-épreuve : sans geste récent, la base fait foi (inscription locale sans ligne → retirée)").toBeNull();
    } finally { await ctx.close(); }
  });
});
