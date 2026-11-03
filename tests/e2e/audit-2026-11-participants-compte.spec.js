// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11 — DÉCISION C-04 : LA LISTE SUIT LE LIEN, LE NOMBRE RESTE PUBLIC
//
// `migrations/migration_participants_visibilite_2026-11-03.sql` ne rend plus à
// un compte la liste nominative d'une activité que s'il a un LIEN avec elle
// (lui-même, l'organisation, les co-inscrits, les personnes qu'il suit) ; le
// NOMBRE reste public par la RPC `participants_compte`, la moyenne des notes
// par `notes_evenement`, et `feedback`/`rating`/`rated_at` ne sont plus
// lisibles par le rôle. Le client du 2026-11-03 doit tenir dans les DEUX
// mondes — la migration passera en production d'abord, peut-être jamais en
// staging :
//   · APRÈS : `ev.counts` (RPC) porte le nombre, `ev.attendees` les visages
//     autorisés, l'écart s'écrit « +N autres » ;
//   · AVANT : RPC absente (PGRST202) → mémo pour la session, la liste fait foi
//     exactement comme avant.
//
// Faux serveur PostgREST de l'agent E (`audit-2026-11-parcours-faux-serveur.js`),
// basculé dans le monde « après » par `migrerParticipants()` : policy par lien,
// privilèges de colonne (une projection `*` ou une colonne retirée = la requête
// ENTIÈRE refusée, 42501, comme PostgreSQL), RPC miroirs du banc SQL
// `tests/sql/migration-participants-visibilite.test.sh`. Vrai SDK, vrais
// handlers ; on mesure l'écran, l'objet canonique ET les requêtes envoyées.
//
// ⚠️ CE QUE CE BANC NE PROUVE PAS : la RLS RÉELLE (recopiée ici — le cas
// « AUDIT E — participants » de `confidentialite.spec.js` la mesure en base,
// en CI), ni le cache de schéma de PostgREST (imité en coupant les RPC seules).
//
// Les quatre cas marqués `test.fail` en fin de fichier ÉPINGLENT des défauts
// trouvés en écrivant cette suite (voir le rapport) : ils rougissent sur le
// code d'aujourd'hui, c'est voulu. Le jour où un correctif les fait passer,
// Playwright signale « passe alors qu'un échec était attendu » : retirer la
// marque À CE MOMENT-LÀ, pas avant.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000041";
const V = "bbbbbbbb-0000-4000-8000-000000000042";      // le compte qui regarde : un tiers
const F = "cccccccc-0000-4000-8000-000000000043";      // une personne que V SUIT
const F2 = "cccccccc-0000-4000-8000-000000000044";
const F3 = "cccccccc-0000-4000-8000-000000000045";
const G = [1, 2, 3, 4, 5].map((i) => "dddddddd-0000-4000-8000-00000000005" + i);   // inconnus de V
const M = [1, 2].map((i) => "eeeeeeee-0000-4000-8000-00000000006" + i);            // « peut-être », inconnus
const W1 = "ffffffff-0000-4000-8000-000000000071";
const W2 = "ffffffff-0000-4000-8000-000000000072";

const E1 = "evt_c04_ouvert";    // 6 places : 5 venants (V n'en voit qu'un), 2 peut-être, 1 en attente
const E2 = "evt_c04_complet";   // 6 places : 6 venants (V n'en voit qu'un), 1 en attente
const E5 = "evt_c04_amis";      // sans limite : 3 venants, tous suivis par V
const RETIREES = ["feedback", "rating", "rated_at"];

const iso = (ms) => new Date(ms).toISOString().replace("Z", "");
const ligne = (ev, u, rsvp, extra) => Object.assign({ event_id: ev, user_id: u, rsvp, created_at: new Date(Date.now() - 3600000).toISOString() }, extra || {});
function activite(srv, id, opts) {
  srv.t.events.push(Object.assign({ id, author_id: ORGA, organizer_id: ORGA, title: "Activité " + id, passion_id: "musique", city: "Annecy",
    emoji: "🎸", max_attendees: null, status: "active", co_organizers: [], created_at: iso(Date.now() - 86400000), lat: 45.9, lng: 6.12 }, opts));
}

// Le décor commun : V suit F, F2, F3 et personne d'autre.
function peupler(srv) {
  [ORGA, V, F, F2, F3, ...G, ...M, W1, W2].forEach((u, i) => srv.compte(u, "c04_" + i));
  [F, F2, F3].forEach((u) => srv.t.follows.push({ follower_id: V, following_id: u, status: "accepted", created_at: new Date().toISOString() }));
  const base = Date.now() + 2 * 86400000;
  activite(srv, E5, { date_at: iso(base - 3600000) });
  activite(srv, E1, { date_at: iso(base), max_attendees: 6 });
  activite(srv, E2, { date_at: iso(base + 3600000), max_attendees: 6 });
  srv.t.event_attendees.push(
    ligne(E1, F, "going"), ligne(E1, G[0], "going", { rating: 4, feedback: "Super soirée", rated_at: new Date().toISOString() }),
    ligne(E1, G[1], "going", { rating: 5, feedback: null, rated_at: new Date().toISOString() }), ligne(E1, G[2], "going"), ligne(E1, G[3], "going"),
    ligne(E1, M[0], "maybe"), ligne(E1, M[1], "maybe"), ligne(E1, W1, "waitlist"),
    ligne(E2, F, "going"), ...G.map((u) => ligne(E2, u, "going")), ligne(E2, W1, "waitlist"),
    ligne(E5, F, "going"), ligne(E5, F2, "going"), ligne(E5, F3, "going"),
  );
}

// V connecté, écran « Rencontrer » ouvert, lecture du démarrage terminée.
async function ouvrirV(browser, srv) {
  const ctx = await browser.newContext();
  const v = await ouvrirCompte(ctx, srv, V, { nom: "vic_c04" });
  expect(v.identite.uid, "prémisse : la page tourne sous V").toBe(V);
  expect(v.identite.reel, "prémisse : SDK réel").toBe(true);
  await v.page.evaluate(() => goTo("irl"));
  await v.page.waitForFunction(() => { const s = document.getElementById("screen-irl"); return !!s && s.classList.contains("active") && !_evenementsLectureEnVol; }, null, { timeout: 15000 });
  return { ctx, page: v.page };
}

// Le VRAI chemin de lecture, puis les activités du serveur SEULES à l'écran
// (aucune activité de démonstration ne dispute la liste).
async function charger(page) {
  return page.evaluate(async () => {
    const evs = await supaLoadEvents();
    state.seed.events = evs;
    state.userEvents = [];
    renderIRL();
    const o = {};
    evs.forEach((e) => { o[e.id] = { attendees: e.attendees, maybes: e.maybes, waitlist: e.waitlist, counts: e.counts }; });
    return o;
  });
}

// La carte HISTORIQUE (`renderIRL` / `_patchEventCardJoin`) : présente dans le
// DOM même quand le lot UI-4A2 la recouvre — c'est elle que le client C-04 a
// corrigée. La ligne du lot UI-4A2 est lue à part (cas épinglé plus bas).
function lireCarte(page, id) {
  return page.evaluate((id) => {
    const c = document.querySelector('#eventList .event-card[data-evid="' + CSS.escape(id) + '"]');
    if (!c) return null;
    const pill = c.querySelector(".event-footer .attendees .pill");
    const cta = c.querySelector(".event-footer > button");
    const monde = c.querySelector(".v4a2-monde");
    return { pill: pill && pill.textContent.trim(), cta: cta && cta.textContent.trim(), texte: c.textContent.replace(/\s+/g, " "), v4a2: monde && monde.textContent.trim() };
  }, id);
}

// La fiche : chaque titre de section avec son trombinoscope (visages et
// pastilles « +N autres »), le texte, et l'action de participation.
function lireFiche(page) {
  return page.evaluate(() => {
    const racine = document.getElementById("eventDetailPage");
    if (!racine || racine.style.display === "none") return null;
    const sections = {};
    racine.querySelectorAll(".event-detail-section-title").forEach((t) => {
      let b = t.nextElementSibling;
      while (b && !b.classList.contains("event-detail-participants") && !b.classList.contains("event-detail-section-title")) b = b.nextElementSibling;
      const bloc = b && b.classList.contains("event-detail-participants") ? b : null;
      sections[t.textContent.trim()] = bloc ? {
        visages: bloc.querySelectorAll('.event-detail-participant[role="button"]').length,
        restes: [...bloc.querySelectorAll(".event-detail-participant:not([role])")].map((x) => x.textContent.trim()),
      } : null;
    });
    const cta = document.querySelector("#eventDetailCta button");
    const rdv = racine.querySelector(".v4b-rdv-places");
    return { sections, titres: Object.keys(sections), texte: racine.textContent.replace(/\s+/g, " "),
      cta: cta ? { texte: cta.textContent.trim(), inactif: !!cta.disabled, v4b: !!cta.closest(".v4b-rsvp") } : null, v4b: rdv && rdv.textContent.trim() };
  });
}

const compteRpc = (srv, nom) => srv.requetes((r) => r.rpc && r.table === nom && r.me === V).length;

test.describe("Audit 2026-11 — C-04 : nombre public, liste par lien (client compatible avant ET après la migration)", () => {
  test.setTimeout(120000);

  test("a. APRÈS migration : la liste lisible porte 1 visage, la RPC dit 5/2/1 → carte, fiche, places et tri disent 5", async ({ browser }) => {
    const srv = new FauxServeur().migrerParticipants();
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      const lu = await charger(page);
      // PRÉMISSE : la base ne rend à V que la personne qu'il suit — la liste est PARTIELLE.
      expect(lu[E1].attendees, "prémisse : V ne lit que F parmi les venants de E1").toEqual([F]);
      expect(lu[E1].maybes, "prémisse : aucun « peut-être » lisible").toEqual([]);
      expect(lu[E1].waitlist, "prémisse : la liste d'attente n'est pas lisible").toEqual([]);
      expect(lu[E1].counts, "le NOMBRE vient de participants_compte").toEqual({ going: 5, maybe: 2, waitlist: 1, checked_in: 0 });
      expect(lu[E5].counts).toEqual({ going: 3, maybe: 0, waitlist: 0, checked_in: 0 });
      const rpc = srv.requetes((r) => r.rpc && r.table === "participants_compte" && r.me === V);
      expect(rpc.length, "la RPC est appelée").toBeGreaterThan(0);
      expect(rpc[rpc.length - 1].body.p_event_ids, "…avec les activités lues").toEqual(expect.arrayContaining([E1, E2, E5]));

      const calc = await page.evaluate((id) => { const ev = _findCanonicalEvent(id); return { going: _nbInscrits(ev, "going"), maybe: _nbInscrits(ev, "maybe"), waitlist: _nbInscrits(ev, "waitlist"), places: _eventSpotsLeft(ev), complet: _eventIsFull(ev) }; }, E1);
      expect(calc).toEqual({ going: 5, maybe: 2, waitlist: 1, places: 1, complet: false });

      // ── La carte ──
      const carte = await lireCarte(page, E1);
      expect(carte, "la carte de E1 est dans la liste").toBeTruthy();
      expect(carte.pill, "pastille : le nombre public, pas la liste lisible").toBe("5 inscrits · 2 peut-être");
      expect(carte.texte, "places : 5 sur 6").toContain("5/6 places");
      expect(carte.cta).toBe("+ Rejoindre");

      // ── La fiche ──
      await page.evaluate((id) => openEventDetails(id), E1);
      const fiche = await lireFiche(page);
      console.log("[C-04 a] fiche", JSON.stringify(fiche.sections), "| v4b :", fiche.v4b);
      expect(fiche.titres).toContain("Participants (5 / 6 max)");
      expect(fiche.sections["Participants (5 / 6 max)"], "un visage (F) et l'écart écrit").toEqual({ visages: 1, restes: ["+4 autres"] });
      expect(fiche.sections["Peut-être (2)"], "section « peut-être » au nombre public, sans visage lisible").toEqual({ visages: 0, restes: ["+2 autres"] });
      expect(fiche.sections["Liste d'attente (1)"], "section « liste d'attente » au nombre public").toEqual({ visages: 0, restes: ["+1 autre"] });
      expect(fiche.texte, "places restantes : 6 − 5").toContain("Plus que 1 place");

      // ── Le tri par popularité suit le NOMBRE, pas la liste lisible ──
      // (par la liste, E5 et ses 3 visages passerait devant E1 et E2, 1 visage chacun)
      const ordre = await page.evaluate(() => { closeEventDetail(); setIrlSort("popular"); return [...document.querySelectorAll("#eventList .event-card[data-evid]")].map((c) => c.getAttribute("data-evid")); });
      expect(ordre, "populaires : 6 > 5 > 3").toEqual([E2, E1, E5]);
      const ordreDate = await page.evaluate(() => { setIrlSort("soon"); return [...document.querySelectorAll("#eventList .event-card[data-evid]")].map((c) => c.getAttribute("data-evid")); });
      expect(ordreDate, "contre-épreuve : par date, l'ordre est E5, E1, E2").toEqual([E5, E1, E2]);
    } finally { await ctx.close(); }
  });

  test("a bis. APRÈS migration : complet au NOMBRE (6/6, 1 visage) → « Complet », liste d'attente proposée, « je viens » part en attente", async ({ browser }) => {
    const srv = new FauxServeur().migrerParticipants();
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      const lu = await charger(page);
      expect(lu[E2].attendees, "prémisse : V ne lit qu'un venant de E2").toEqual([F]);
      expect(lu[E2].counts).toEqual({ going: 6, maybe: 0, waitlist: 1, checked_in: 0 });
      const calc = await page.evaluate((id) => { const ev = _findCanonicalEvent(id); return { places: _eventSpotsLeft(ev), complet: _eventIsFull(ev) }; }, E2);
      expect(calc, "complet au nombre public, quelle que soit la liste lisible").toEqual({ places: 0, complet: true });

      const carte = await lireCarte(page, E2);
      expect(carte.texte).toContain("Complet · 1 en attente");
      expect(carte.cta, "la carte propose la liste d'attente").toBe("Liste d'attente");
      expect(carte.pill).toBe("6 inscrits");

      await page.evaluate((id) => openEventDetails(id), E2);
      const fiche = await lireFiche(page);
      expect(fiche.titres).toContain("Participants (6 / 6 max)");
      expect(fiche.texte).toContain("Complet");
      // L'action de la fiche : celle du lot UI-4B (actif par défaut) ou, lot
      // coupé, le bouton historique — chacune avec son propre libellé exact.
      if (fiche.cta.v4b) expect(fiche.cta.texte, "UI-4B : la fiche propose la file").toBe("Rejoindre la liste d'attente");
      else expect(fiche.cta, "historique : bouton « Complet » inactif").toEqual({ texte: "Complet", inactif: true, v4b: false });

      // « Je viens » sur une activité complète AU NOMBRE : le client entre en file, et le dit.
      const apres = await page.evaluate(async (id) => {
        window.__toasts = [];
        await setEventRsvp(id, "going");
        const ev = _findCanonicalEvent(id);
        return { rsvp: myRsvp(id), counts: ev.counts, toasts: window.__toasts.map((t) => t.msg) };
      }, E2);
      expect(apres.toasts.join(" | ")).toMatch(/C'est complet — tu es sur liste d'attente/);
      expect(apres.rsvp).toBe("waitlist");
      expect(apres.counts, "le compteur mémorisé suit le geste : +1 en attente, venants inchangés").toEqual({ going: 6, maybe: 0, waitlist: 2, checked_in: 0 });
      expect(srv.t.event_attendees.find((a) => a.event_id === E2 && a.user_id === V).rsvp, "en base : en attente, jamais `going`").toBe("waitlist");
      const fiche2 = await lireFiche(page);
      expect(fiche2.titres, "la fiche ouverte se repeint au nouveau nombre").toContain("Liste d'attente (2)");
    } finally { await ctx.close(); }
  });

  test("b. AVANT migration : RPC absente (PGRST202) → mémo de session, plus jamais rappelée, et la liste fait foi comme avant", async ({ browser }) => {
    const srv = new FauxServeur();   // monde d'aujourd'hui : policy `true`, aucune des trois RPC
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      const lecturesAvant = srv.requetes((r) => r.table === "event_attendees" && r.m === "GET" && r.me === V).length;
      const lu = await charger(page);
      await page.evaluate(async () => { await supaLoadEvents(); await supaLoadEvents(); });
      const absente = await page.evaluate(() => window._participantsCompteAbsent === true);
      expect(absente, "PGRST202 posé en mémo pour la session").toBe(true);
      expect(compteRpc(srv, "participants_compte"), "UN appel pour toute la session (démarrage + trois lectures)").toBe(1);
      expect(srv.requetes((r) => r.table === "event_attendees" && r.m === "GET" && r.me === V).length - lecturesAvant,
        "la liste, elle, est relue à chaque chargement").toBeGreaterThanOrEqual(3);

      expect(lu[E1].counts, "aucun compteur serveur").toBeNull();
      expect(lu[E1].attendees.slice().sort(), "liste complète (policy d'avant)").toEqual([F, ...G.slice(0, 4)].sort());
      const calc = await page.evaluate((id) => { const ev = _findCanonicalEvent(id); return { going: _nbInscrits(ev, "going"), maybe: _nbInscrits(ev, "maybe"), waitlist: _nbInscrits(ev, "waitlist"), places: _eventSpotsLeft(ev) }; }, E1);
      expect(calc, "les nombres sont ceux de la liste").toEqual({ going: 5, maybe: 2, waitlist: 1, places: 1 });

      const carte = await lireCarte(page, E1);
      expect(carte.pill).toBe("5 inscrits · 2 peut-être");
      await page.evaluate((id) => openEventDetails(id), E1);
      const fiche = await lireFiche(page);
      expect(fiche.sections["Participants (5 / 6 max)"], "cinq visages, AUCUN « +N autres » (rien de caché)").toEqual({ visages: 5, restes: [] });
      expect(fiche.sections["Peut-être (2)"]).toEqual({ visages: 2, restes: [] });
      expect(fiche.sections["Liste d'attente (1)"]).toEqual({ visages: 1, restes: [] });
    } finally { await ctx.close(); }
  });

  test("c. APRÈS migration : je viens puis je pars → 5 → 6 → 5 ; une écriture refusée remet le compteur d'avant", async ({ browser }) => {
    const srv = new FauxServeur().migrerParticipants();
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      await charger(page);
      // Chaque repeinture de la carte note le nombre affiché : la première est
      // l'OPTIMISTE (avant le verdict du serveur), la suivante l'éventuelle annulation.
      await page.evaluate((id) => {
        window.__vus = [];
        const orig = window._patchEventCardJoin;
        window._patchEventCardJoin = function (x) { if (x === id) window.__vus.push(_nbInscrits(_findCanonicalEvent(x), "going")); return orig.apply(this, arguments); };
        openEventDetails(id);
      }, E1);
      const geste = (rsvp) => page.evaluate(async ([id, r]) => {
        window.__vus = []; window.__toasts = [];
        await setEventRsvp(id, r);
        const ev = _findCanonicalEvent(id);
        return { vus: window.__vus.slice(), counts: Object.assign({}, ev.counts), attendees: ev.attendees.slice(), rsvp: myRsvp(id), toasts: window.__toasts.map((t) => t.msg) };
      }, [E1, rsvp]);
      const ecran = async () => ({ pill: (await lireCarte(page, E1)).pill, titres: (await lireFiche(page)).titres });

      // ── Je viens : +1, confirmé par la base ──
      const vient = await geste("going");
      expect(vient.vus, "optimiste : 6 affiché tout de suite").toEqual([6]);
      expect(vient.counts.going, "compteur mémorisé +1").toBe(6);
      expect(vient.attendees).toEqual(expect.arrayContaining([F, V]));
      expect(srv.t.event_attendees.find((a) => a.event_id === E1 && a.user_id === V).rsvp).toBe("going");
      let vu = await ecran();
      expect(vu.pill).toBe("6 inscrits · 2 peut-être");
      expect(vu.titres).toContain("Participants (6 / 6 max)");

      // ── Je pars : −1 (le max(liste, compteur) ne sait pas descendre seul) ──
      const part = await geste(null);
      expect(part.vus).toEqual([5]);
      expect(part.counts.going, "compteur mémorisé −1").toBe(5);
      expect(part.attendees).toEqual([F]);
      expect(srv.t.event_attendees.some((a) => a.event_id === E1 && a.user_id === V), "en base : plus de ligne").toBe(false);
      vu = await ecran();
      expect(vu.pill).toBe("5 inscrits · 2 peut-être");
      expect(vu.titres).toContain("Participants (5 / 6 max)");

      // ── Inscription REFUSÉE par le serveur : l'optimiste est annulé, compteur compris ──
      srv.pannes.push({ table: "event_attendees", methode: "POST", status: 403, body: { code: "42501", message: "new row violates row-level security policy for table \"event_attendees\"" }, fois: 1 });
      const refus = await geste("going");
      expect(refus.vus, "6 optimiste, puis 5 rétabli").toEqual([6, 5]);
      expect(refus.counts, "compteurs d'avant, à l'identique").toEqual({ going: 5, maybe: 2, waitlist: 1, checked_in: 0 });
      expect(refus.attendees).toEqual([F]);
      expect(refus.rsvp).toBeNull();
      expect(refus.toasts.join(" | ")).toMatch(/Inscription non enregistrée/);
      expect(srv.t.event_attendees.some((a) => a.event_id === E1 && a.user_id === V)).toBe(false);
      vu = await ecran();
      expect(vu.pill).toBe("5 inscrits · 2 peut-être");
      expect(vu.titres).toContain("Participants (5 / 6 max)");

      // ── Désinscription REFUSÉE : la place reste prise, le compteur aussi ──
      const revient = await geste("going");
      expect(revient.counts.going).toBe(6);
      srv.pannes.push({ table: "event_attendees", methode: "DELETE", status: 500, body: { code: "XX000", message: "panne programmée" }, fois: 1 });
      const refusDepart = await geste(null);
      expect(refusDepart.vus, "5 optimiste, puis 6 rétabli").toEqual([5, 6]);
      expect(refusDepart.counts.going).toBe(6);
      expect(refusDepart.rsvp).toBe("going");
      expect(refusDepart.toasts.join(" | ")).toMatch(/Désinscription non enregistrée/);
      expect(srv.t.event_attendees.find((a) => a.event_id === E1 && a.user_id === V).rsvp).toBe("going");
    } finally { await ctx.close(); }
  });

  test("d. APRÈS migration : l'UPDATE de RSVP demande `select=event_id`, jamais `*` — « peut-être » puis « je viens » aboutit", async ({ browser }) => {
    const srv = new FauxServeur().migrerParticipants();
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      await charger(page);
      const peutEtre = await page.evaluate(async (id) => { await setEventRsvp(id, "maybe"); return myRsvp(id); }, E1);
      expect(peutEtre).toBe("maybe");
      expect(srv.t.event_attendees.find((a) => a.event_id === E1 && a.user_id === V).rsvp).toBe("maybe");
      // Changement d'avis : la ligne EXISTE, seul l'UPDATE peut aboutir (l'INSERT
      // rendrait 23505). Un RETURNING * serait refusé en entier (colonnes retirées).
      const vient = await page.evaluate(async (id) => { window.__toasts = []; await setEventRsvp(id, "going"); return { rsvp: myRsvp(id), counts: _findCanonicalEvent(id).counts, toasts: window.__toasts.map((t) => t.msg) }; }, E1);
      expect(vient.toasts.join(" | ")).not.toMatch(/non enregistrée/);
      expect(vient.rsvp).toBe("going");
      expect(srv.t.event_attendees.find((a) => a.event_id === E1 && a.user_id === V).rsvp, "en base : `going`").toBe("going");
      expect(vient.counts, "peut-être 2 → 3 → 2, venants 5 → 6").toEqual({ going: 6, maybe: 2, waitlist: 1, checked_in: 0 });

      const patchs = srv.requetes((r) => r.table === "event_attendees" && r.m === "PATCH" && r.me === V);
      expect(patchs.length, "deux UPDATE de RSVP envoyés").toBe(2);
      for (const p of patchs) {
        const sel = new URL("http://x" + p.url).searchParams.get("select");
        expect(sel, "UPDATE de RSVP : RETURNING event_id seulement — " + p.url).toBe("event_id");
      }
      // Et AUCUNE requête de V sur la table ne vise `*` ni une colonne retirée.
      const fautives = srv.requetes((r) => r.table === "event_attendees" && r.me === V).filter((r) => {
        const sp = new URL("http://x" + r.url).searchParams;
        const sel = sp.get("select");
        return (sel !== null && sel.split(",").some((c) => c.trim() === "*" || RETIREES.includes(c.trim()))) || RETIREES.some((c) => sp.has(c));
      }).map((r) => r.m + " " + r.url);
      expect(fautives, "aucune lecture ni RETURNING de feedback/rating/rated_at").toEqual([]);
    } finally { await ctx.close(); }
  });

  test("e1. notes APRÈS migration : la moyenne vient de `notes_evenement`, la colonne n'est jamais lue", async ({ browser }) => {
    const srv = new FauxServeur().migrerParticipants();
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      const r = await page.evaluate(async (id) => ({ agg: await supaLoadEventRatings(id), absente: window._notesEvenementAbsente === true }), E1);
      expect(r.agg, "agrégat de la RPC (4 et 5)").toEqual({ avg: 4.5, count: 2 });
      expect(r.absente).toBe(false);
      const appels = srv.requetes((x) => x.rpc && x.table === "notes_evenement" && x.me === V);
      expect(appels.length).toBe(1);
      expect(appels[0].body).toEqual({ p_event_id: E1 });
      expect(srv.requetes((x) => x.table === "event_attendees" && x.me === V && /rating/.test(x.url)).length, "aucune lecture de la colonne").toBe(0);
    } finally { await ctx.close(); }
  });

  test("e2. notes AVANT migration : RPC absente → lecture d'avant sur la colonne, mémo posé", async ({ browser }) => {
    const srv = new FauxServeur();
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      const r = await page.evaluate(async (id) => {
        const a = await supaLoadEventRatings(id);
        const b = await supaLoadEventRatings(id);
        return { a, b, absente: window._notesEvenementAbsente === true };
      }, E1);
      expect(r.a, "même agrégat que la RPC, calculé côté client").toEqual({ avg: 4.5, count: 2 });
      expect(r.b).toEqual({ avg: 4.5, count: 2 });
      expect(r.absente).toBe(true);
      expect(compteRpc(srv, "notes_evenement"), "la RPC absente n'est demandée qu'une fois").toBe(1);
      expect(srv.requetes((x) => x.table === "event_attendees" && x.m === "GET" && x.me === V && /select=rating/.test(x.url)).length, "deux lectures de la colonne").toBe(2);
    } finally { await ctx.close(); }
  });

  test("e3. transition (privilèges retirés, RPC encore inconnue du cache) : 42501 sur `rating` → null, SANS faire taire les lectures de participants", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.participantsParLien = true; srv.colonnesRetourRetirees = true; srv.rpcParticipants = false;
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      const r = await page.evaluate(async (id) => ({ agg: await supaLoadEventRatings(id), memo: _attendeesRefusLecture, lisibles: _attendeesLisibles() }), E1);
      expect(r.agg, "note indisponible : null, pas un faux « 0 avis »").toBeNull();
      const refus = srv.requetes((x) => x.table === "event_attendees" && x.m === "GET" && x.me === V && /select=rating/.test(x.url));
      expect(refus.length, "prémisse : la lecture de la colonne est partie (et a été refusée)").toBe(1);
      expect(r.memo, "un 42501 sur la COLONNE ne pose pas le mémo de refus de la TABLE").toBe(false);
      expect(r.lisibles).toBe(true);

      const avant = srv.requetes((x) => x.table === "event_attendees" && x.m === "GET" && x.me === V).length;
      const lu = await charger(page);
      expect(srv.requetes((x) => x.table === "event_attendees" && x.m === "GET" && x.me === V).length, "supaLoadEvents relit toujours les participants").toBeGreaterThan(avant);
      expect(lu[E5].attendees.slice().sort(), "…et les rend (les trois personnes suivies)").toEqual([F, F2, F3].sort());

      // CONTRE-ÉPREUVE : un refus de JETON (PGRST301) sur la même lecture pose bien le mémo.
      srv.pannes.push({ table: "event_attendees", methode: "GET", status: 401, body: { code: "PGRST301", message: "JWT expired" }, fois: 1 });
      const r2 = await page.evaluate(async (id) => ({ agg: await supaLoadEventRatings(id), memo: _attendeesRefusLecture }), E1);
      expect(r2.agg).toBeNull();
      expect(r2.memo, "contre-épreuve : un jeton refusé fait taire les lectures, comme avant").toBe(true);
    } finally { await ctx.close(); }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // DÉFAUTS ÉPINGLÉS (test.fail) — trouvés en écrivant cette suite, rapportés,
  // NON corrigés ici (le périmètre de ce lot de tests exclut `js/`).
  // ═════════════════════════════════════════════════════════════════════════

  test("ÉPINGLÉ — carte UI-4A2 (active par défaut) : « N participants » compte la liste lisible, pas le nombre public", async ({ browser }) => {
    test.fail(true, "js/ui-v4a2-cartes.js `ligneMonde` (et `signature`) lisent `ev.attendees.length` / `ev.waitlist.length` au lieu de `_nbInscrits` — retirer la marque avec le correctif");
    const srv = new FauxServeur().migrerParticipants();
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      await charger(page);
      await page.waitForFunction((id) => !!document.querySelector('#eventList .event-card[data-evid="' + id + '"] .v4a2-monde'), E1, { timeout: 5000 });
      const carte = await lireCarte(page, E1);
      console.log("[C-04 épinglé UI-4A2]", carte.v4a2);
      expect(carte.v4a2, "la ligne VISIBLE de la carte dit le nombre public").toBe("5 participants · 1 place restante · 1 en attente");
    } finally { await ctx.close(); }
  });

  test("ÉPINGLÉ — fiche UI-4B (active par défaut) : le bloc « rendez-vous » compte la liste lisible, pas le nombre public", async ({ browser }) => {
    test.fail(true, "js/ui-v4b-fiche.js `texteParticipation` lit `ev.attendees.length` / `ev.waitlist.length` au lieu de `_nbInscrits` — retirer la marque avec le correctif");
    const srv = new FauxServeur().migrerParticipants();
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      await charger(page);
      await page.evaluate((id) => openEventDetails(id), E1);
      await page.waitForFunction(() => !!document.querySelector("#eventDetailPage .v4b-rdv-places"), null, { timeout: 5000 });
      const fiche = await lireFiche(page);
      console.log("[C-04 épinglé UI-4B]", fiche.v4b);
      expect(fiche.v4b, "le bloc VISIBLE de la fiche dit le nombre public").toBe("5 participants · 1 place restante · 1 en liste d'attente");
    } finally { await ctx.close(); }
  });

  test("ÉPINGLÉ — fiche : plus de 12 visages lisibles ET des inscrits cachés → deux pastilles « +N autres » au lieu d'une", async ({ browser }) => {
    test.fail(true, "js/app-07-ia-explore-irl.js `_facesEtReste` ajoute son reste à celui que `_faces` écrit déjà au-delà de `max` — retirer la marque avec le correctif");
    const srv = new FauxServeur().migrerParticipants();
    peupler(srv);
    const E4 = "evt_c04_foule";
    activite(srv, E4, { date_at: iso(Date.now() + 3 * 86400000) });
    const amis = Array.from({ length: 13 }, (_, i) => "abababab-0000-4000-8000-0000000001" + String(i).padStart(2, "0"));
    amis.forEach((u, i) => { srv.compte(u, "ami_" + i); srv.t.follows.push({ follower_id: V, following_id: u, status: "accepted", created_at: new Date().toISOString() }); srv.t.event_attendees.push(ligne(E4, u, "going")); });
    G.slice(0, 3).forEach((u) => srv.t.event_attendees.push(ligne(E4, u, "going")));
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      const lu = await charger(page);
      expect(lu[E4].attendees.length, "prémisse : 13 visages lisibles").toBe(13);
      expect(lu[E4].counts.going, "prémisse : 16 inscrits au total").toBe(16);
      await page.evaluate((id) => openEventDetails(id), E4);
      const fiche = await lireFiche(page);
      console.log("[C-04 épinglé restes]", JSON.stringify(fiche.sections["Participants (16)"]));
      expect(fiche.sections["Participants (16)"], "12 visages, UNE pastille pour les 4 autres").toEqual({ visages: 12, restes: ["+4 autres"] });
    } finally { await ctx.close(); }
  });

  // Contrôle (vert) puis cas épinglé : le MÊME scénario dans les deux mondes.
  // V s'inscrit à une activité de 2 places (qu'il remplit), quelqu'un entre
  // ensuite en liste d'attente (autre appareil), V se désinscrit.
  async function placeLibereeParCeluiQuiNeVoitPasLaFile(browser, srv) {
    const E3 = "evt_c04_file";
    activite(srv, E3, { date_at: iso(Date.now() + 2 * 86400000), max_attendees: 2 });
    srv.t.event_attendees.push(ligne(E3, G[0], "going"));
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      await charger(page);
      await page.evaluate(async (id) => { await setEventRsvp(id, "going"); }, E3);
      expect(srv.t.event_attendees.find((a) => a.event_id === E3 && a.user_id === V).rsvp, "prémisse : V a pris la dernière place").toBe("going");
      srv.t.event_attendees.push(ligne(E3, W2, "waitlist", { created_at: new Date().toISOString() }));
      await page.evaluate(async (id) => { await setEventRsvp(id, null); }, E3);
      await expect.poll(() => (srv.t.event_attendees.find((a) => a.event_id === E3 && a.user_id === W2) || {}).rsvp, {
        message: "la place libérée revient à la personne en attente", timeout: 5000,
      }).toBe("going");
      expect(srv.requetes((r) => r.rpc && r.table === "promouvoir_attente" && r.me === V).length, "la promotion passe par la RPC").toBe(1);
    } finally { await ctx.close(); }
  }

  test("contrôle AVANT migration : place libérée → la personne en attente est promue (la file est lisible)", async ({ browser }) => {
    const srv = new FauxServeur();
    peupler(srv);
    await placeLibereeParCeluiQuiNeVoitPasLaFile(browser, srv);
  });

  test("ÉPINGLÉ — APRÈS migration : place libérée par un participant qui ne VOIT pas la file → personne n'est promu", async ({ browser }) => {
    test.fail(true, "js/app-07-ia-explore-irl.js `_promoteNextWaitlisted` : `if (!next) return;` — après la migration, `supaFirstWaitlisted` (appelé APRÈS le DELETE) ne voit plus la file ; la RPC `promouvoir_attente` choisit pourtant seule — retirer la marque avec le correctif");
    const srv = new FauxServeur().migrerParticipants();
    peupler(srv);
    await placeLibereeParCeluiQuiNeVoitPasLaFile(browser, srv);
  });
});
