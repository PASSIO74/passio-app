// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-03 (revue) — LES MÉMOS « RPC ABSENTE » DE C-04 ONT UNE DURÉE DE VIE
//
// `participants_compte` et `notes_evenement` rendent PGRST202 tant que
// `migration_participants_visibilite_2026-11-03.sql` n'est pas en base, et
// app-08 le mémorise (`window._participantsCompteAbsent`,
// `window._notesEvenementAbsente`) pour ne pas payer un 404 par lecture.
// DÉFAUT trouvé en revue : le mémo était posé À VIE. Une PWA ouverte AVANT la
// migration continuait, APRÈS elle, de prendre la liste nominative — devenue
// PARTIELLE — pour le nombre d'inscrits (« 1 inscrit » là où il y en a cinq),
// et la moyenne des notes, de lire une colonne retirée au rôle, jusqu'au
// prochain rechargement complet. Une application installée ne recharge presque
// jamais.
//
// Ce que cette suite exige (même contrat que `fil_compteurs`) :
//   ① PGRST202 → mémo posé, AVEC son heure (`…Le`), et la RPC n'est pas
//      redemandée tant que l'heure n'est pas passée ;
//   ② une heure après la pose (heure de pose reculée : l'horloge de la page
//      reste celle du SDK, dont les jetons dépendent), la RPC est RETENTÉE —
//      la migration passée entre-temps, les compteurs serveur reviennent ;
//   ③ même chose pour `notes_evenement` ;
//   ④ un jeton frais (SIGNED_IN puis TOKEN_REFRESHED, émis par le VRAI SDK)
//      lève les deux mémos, au même point que le mémo de refus des
//      participants (`_oublierRefusLecturesIRL`).
//
// Banc : faux serveur PostgREST de l'agent E (`audit-2026-11-parcours-faux-
// serveur.js`) — vrai SDK, vraies requêtes, AUCUNE n'atteint la production
// (`brancher` route tout `*.supabase.co` et le WebSocket temps réel).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte, jwtPour } = require("./audit-2026-11-parcours-faux-serveur");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000081";
const V = "bbbbbbbb-0000-4000-8000-000000000082";
const G = [1, 2, 3, 4].map((i) => "dddddddd-0000-4000-8000-00000000009" + i);
const E1 = "evt_memo_rpc";
const HEURE = 60 * 60 * 1000;

const iso = (ms) => new Date(ms).toISOString().replace("Z", "");

function peupler(srv) {
  [ORGA, V, ...G].forEach((u, i) => srv.compte(u, "memo_" + i));
  srv.t.events.push({ id: E1, author_id: ORGA, organizer_id: ORGA, title: "Activité mémo", passion_id: "musique", city: "Annecy",
    emoji: "🎸", max_attendees: 8, status: "active", co_organizers: [], created_at: iso(Date.now() - 86400000),
    date_at: iso(Date.now() + 2 * 86400000), lat: 45.9, lng: 6.12 });
  const ligne = (u, rsvp, extra) => Object.assign({ event_id: E1, user_id: u, rsvp, created_at: new Date(Date.now() - 3600000).toISOString() }, extra || {});
  srv.t.event_attendees.push(
    ligne(G[0], "going", { rating: 4, rated_at: new Date().toISOString() }),
    ligne(G[1], "going", { rating: 5, rated_at: new Date().toISOString() }),
    ligne(G[2], "going"), ligne(G[3], "maybe"),
  );
}

const compteRpc = (srv, nom) => srv.requetes((r) => r.rpc && r.table === nom && r.me === V).length;

// « La migration passe » pendant que la page vit : les trois volets d'un coup.
const migrer = (srv) => srv.migrerParticipants();

async function ouvrirV(browser, srv) {
  const ctx = await browser.newContext();
  const v = await ouvrirCompte(ctx, srv, V, { nom: "vic_memo" });
  expect(v.identite.uid, "prémisse : la page tourne sous V").toBe(V);
  expect(v.identite.reel, "prémisse : SDK réel").toBe(true);
  return { ctx, page: v.page, errors: v.errors };
}

const lireEv = (page) => page.evaluate(async (id) => {
  const evs = await supaLoadEvents();
  const e = evs.find((x) => x.id === id);
  return e ? { counts: e.counts, attendees: e.attendees.length } : null;
}, E1);

const memo = (page, nom) => page.evaluate((n) => ({ drapeau: window[n] === true, le: window[n + "Le"] }), nom);

test.describe("Audit 2026-11 — mémos « RPC absente » de C-04 : une heure de vie, levés par un jeton frais", () => {
  test.setTimeout(120000);

  test("① ② participants_compte : mémo horodaté, pas de relance dans l'heure, RETENTÉE après — les compteurs serveur reviennent", async ({ browser }) => {
    const srv = new FauxServeur();   // monde d'avant la migration : RPC inconnues
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      const avant = Date.now();
      const l1 = await lireEv(page);
      expect(l1, "prémisse : l'activité est lue").not.toBeNull();
      expect(l1.counts, "RPC absente : aucun compteur serveur").toBeNull();
      const m1 = await memo(page, "_participantsCompteAbsent");
      expect(m1.drapeau, "PGRST202 → mémo posé (booléen, lu tel quel par les bancs)").toBe(true);
      expect(typeof m1.le === "number" && m1.le >= avant - 60000 && m1.le <= Date.now(), "…avec son heure de pose à côté").toBe(true);

      // ① Dans l'heure : la RPC n'est PAS redemandée, même si la migration est passée.
      const n1 = compteRpc(srv, "participants_compte");
      migrer(srv);
      await lireEv(page);
      await lireEv(page);
      expect(compteRpc(srv, "participants_compte"), "dans l'heure : pas une relance de plus").toBe(n1);

      // ② Une heure plus tard (heure de pose reculée) : la RPC est retentée.
      await page.evaluate((h) => { window._participantsCompteAbsentLe = Date.now() - h - 1000; }, HEURE);
      const l2 = await lireEv(page);
      expect(compteRpc(srv, "participants_compte"), "après l'heure : la RPC est RETENTÉE").toBe(n1 + 1);
      expect(l2.counts, "la migration passée, le nombre vient de la base").toEqual({ going: 3, maybe: 1, waitlist: 0, checked_in: 0 });
      expect((await memo(page, "_participantsCompteAbsent")).drapeau, "et le mémo est levé").toBe(false);

      // Contre-épreuve : 59 minutes, le mémo tient encore.
      const srv2Avant = compteRpc(srv, "participants_compte");
      await page.evaluate((h) => { window._participantsCompteAbsent = true; window._participantsCompteAbsentLe = Date.now() - h + 60000; }, HEURE);
      await lireEv(page);
      expect(compteRpc(srv, "participants_compte"), "59 minutes : le mémo tient").toBe(srv2Avant);
      // Une heure de pose dans le FUTUR (horloge reculée) ne prolonge rien.
      await page.evaluate((h) => { window._participantsCompteAbsentLe = Date.now() + h; }, HEURE);
      await lireEv(page);
      expect(compteRpc(srv, "participants_compte"), "heure de pose dans le futur : la RPC est retentée").toBe(srv2Avant + 1);
    } finally { await ctx.close(); }
  });

  test("③ notes_evenement : même durée de vie — après l'heure, la moyenne vient de la RPC, plus de la colonne", async ({ browser }) => {
    const srv = new FauxServeur();
    peupler(srv);
    const { ctx, page } = await ouvrirV(browser, srv);
    try {
      const a = await page.evaluate((id) => supaLoadEventRatings(id), E1);
      expect(a, "avant migration : lecture d'avant sur la colonne").toEqual({ avg: 4.5, count: 2 });
      const m1 = await memo(page, "_notesEvenementAbsente");
      expect(m1.drapeau).toBe(true);
      expect(typeof m1.le, "heure de pose à côté du drapeau").toBe("number");
      expect(compteRpc(srv, "notes_evenement")).toBe(1);

      // La migration passe : la colonne n'est plus lisible, seule la RPC répond.
      migrer(srv);
      const b = await page.evaluate((id) => supaLoadEventRatings(id), E1);
      expect(compteRpc(srv, "notes_evenement"), "dans l'heure : pas de relance").toBe(1);
      expect(b, "dans l'heure, la colonne retirée rend l'indisponible (null), pas un faux « 0 avis »").toBeNull();

      await page.evaluate((h) => { window._notesEvenementAbsenteLe = Date.now() - h - 1000; }, HEURE);
      const c = await page.evaluate((id) => supaLoadEventRatings(id), E1);
      expect(compteRpc(srv, "notes_evenement"), "après l'heure : RETENTÉE").toBe(2);
      expect(c, "la moyenne revient, calculée en base").toEqual({ avg: 4.5, count: 2 });
      expect((await memo(page, "_notesEvenementAbsente")).drapeau).toBe(false);
    } finally { await ctx.close(); }
  });

  test("④ un jeton frais (SIGNED_IN puis TOKEN_REFRESHED du vrai SDK) lève les DEUX mémos — la RPC est retentée sans attendre l'heure", async ({ browser }) => {
    // ⚠️ LE GESTIONNAIRE `onAuthStateChange` D'APP-08 N'EST ENREGISTRÉ QUE SI LE
    // DÉMARRAGE N'A TROUVÉ AUCUNE SESSION (la branche « session retrouvée » de
    // `boot` se termine par un `return` avant lui). Le chemin réel d'un jeton
    // frais est donc : page ouverte SANS session, connexion par le SDK
    // (SIGNED_IN), puis rafraîchissement (TOKEN_REFRESHED). C'est lui qu'on
    // éprouve, de bout en bout, contre le faux serveur.
    const srv = new FauxServeur().migrerParticipants();   // la migration est passée
    peupler(srv);
    const ctx = await browser.newContext();
    try {
      const v = await ouvrirCompte(ctx, srv, null, { nom: "vic_memo" });
      const page = v.page;
      const poser = () => page.evaluate(() => {
        const t = Date.now();
        window._participantsCompteAbsent = true; window._participantsCompteAbsentLe = t;
        window._notesEvenementAbsente = true; window._notesEvenementAbsenteLe = t;
      });
      const lire = async () => ({ p: await memo(page, "_participantsCompteAbsent"), n: await memo(page, "_notesEvenementAbsente") });
      // Un mémo FRAIS (posé il y a un instant, avant la migration) : l'heure ne
      // l'aurait pas levé avant 60 minutes.
      await poser();
      expect((await lire()).p.drapeau, "prémisse : mémo frais posé").toBe(true);

      const attendre = (evt, geste) => page.evaluate(([e, g]) => new Promise((resoudre) => {
        let fini = false;
        const { data } = supa.auth.onAuthStateChange((x) => { if (x === e && !fini) { fini = true; resoudre(x); } });
        Promise.resolve().then(() => (g.type === "connexion"
          ? supa.auth.setSession({ access_token: g.jwt, refresh_token: g.rt })
          : supa.auth.refreshSession())).catch(() => {});
        setTimeout(() => { if (!fini) { fini = true; resoudre("aucun"); } try { data.subscription.unsubscribe(); } catch (er) {} }, 8000);
      }), [evt, geste]);

      // SIGNED_IN : la connexion du compte dans la page.
      const e1 = await attendre("SIGNED_IN", { type: "connexion", jwt: jwtPour(V), rt: "rt_" + V });
      expect(e1, "prémisse : le SDK a émis SIGNED_IN").toBe("SIGNED_IN");
      await page.waitForFunction(() => window._participantsCompteAbsent !== true && window._notesEvenementAbsente !== true, null, { timeout: 5000 }).catch(() => {});
      const apres1 = await lire();
      expect(apres1.p.drapeau, "SIGNED_IN lève le mémo participants").toBe(false);
      expect(apres1.n.drapeau, "SIGNED_IN lève le mémo notes").toBe(false);
      await page.waitForFunction((u) => MY_UID === u, V, { timeout: 5000 });

      // La RPC est retentée tout de suite : les compteurs serveur reviennent.
      const nP = compteRpc(srv, "participants_compte"), nN = compteRpc(srv, "notes_evenement");
      const l = await lireEv(page);
      const r = await page.evaluate((id) => supaLoadEventRatings(id), E1);
      expect(compteRpc(srv, "participants_compte"), "participants_compte retentée").toBeGreaterThan(nP);
      expect(compteRpc(srv, "notes_evenement"), "notes_evenement retentée").toBeGreaterThan(nN);
      expect(l.counts).toEqual({ going: 3, maybe: 1, waitlist: 0, checked_in: 0 });
      expect(r).toEqual({ avg: 4.5, count: 2 });

      // TOKEN_REFRESHED : même levée.
      await poser();
      const e2 = await attendre("TOKEN_REFRESHED", { type: "rafraichir" });
      expect(e2, "prémisse : le SDK a émis TOKEN_REFRESHED").toBe("TOKEN_REFRESHED");
      await page.waitForFunction(() => window._participantsCompteAbsent !== true && window._notesEvenementAbsente !== true, null, { timeout: 5000 }).catch(() => {});
      const apres2 = await lire();
      expect(apres2.p.drapeau, "TOKEN_REFRESHED lève le mémo participants").toBe(false);
      expect(apres2.n.drapeau, "TOKEN_REFRESHED lève le mémo notes").toBe(false);

      // Et la levée passe par le point UNIQUE des silences de l'IRL.
      await poser();
      await page.evaluate(() => _oublierRefusLecturesIRL());
      const leve = await lire();
      expect(leve.p.drapeau || leve.n.drapeau, "_oublierRefusLecturesIRL lève les deux").toBe(false);
    } finally { await ctx.close(); }
  });
});
