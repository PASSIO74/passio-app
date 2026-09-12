// ═══════════════════════════════════════════════════════════════════════════
// PARTICIPANTS D'UNE RENCONTRE — LA TABLE EST FERMÉE SANS COMPTE, LE CLIENT
// FRAPPAIT QUAND MÊME
//
// Défaut relevé par la sentinelle le 2026-09-12 sur la production :
//
//     HTTP 401 sur GET /rest/v1/event_attendees : refusé — jeton absent ou expiré
//     9 appel(s) refusé(s), 0 compte(s) identifié(s).
//
// ⚠️ LE ZÉRO EST LA PREUVE, PAS UN DÉTAIL. `telemetry.js` ne transmet un
// `user_id` que si `MY_UID` est un uuid d'auth (`authUserId`) : 9 refus et 0
// compte veut donc dire « 9 refus chez des clients SANS compte ».
//
// CAUSE. `migrations/migration_irl_donnees_privees.sql`, appliquée en production
// le 2026-09-08, ne retire pas seulement `address` et `contact` à `anon` : elle
// lui RÉVOQUE tout droit de lecture sur `event_attendees` (la liste nominative
// des participants d'une rencontre physique était lisible sans compte, audit
// IRL-03). La contrepartie CLIENT de ce jour-là n'a traité que les COLONNES
// d'`events` (`_EVENT_COLS_PUBLIC` / `_EVENT_COLS_PRIVE`) ; les QUATRE lectures
// d'`event_attendees` partaient encore pour tout le monde, dont le parcours
// visiteur (`js/first-run.js` → `chargerContenuPublic` → `supaLoadEvents`).
//
// ⚠️ 401 ET NON 403 : PostgREST rend 403 sur un 42501 quand un compte est
// authentifié, et 401 quand le rôle est le rôle ANONYME. Le code d'abord : ici la
// policy est juste, c'est le GRANT qui manque — et il manque exprès. La cause
// n'est donc PAS une règle d'accès à corriger (hors périmètre), c'est un appel
// client qui ne devait plus partir.
//
// ⚠️ ET LE REFUS ÉTAIT INVISIBLE : `const { data: atts } = await …` ne lisait
// jamais `{ error }`, et le SDK ne LÈVE PAS sur un refus — le `catch` voisin ne
// s'armait donc pas. Aucune conséquence à l'écran (un visiteur voyait déjà
// « 0 inscrit ») : du bruit pur dans le tableau de bord qui sert à voir les vrais
// défauts, même famille que « newestWorker is null ».
//
// Ce que ce banc garde — et il ÉCHOUE sur le code d'avant (réinjection) :
//   ⓪ SOURCE : les quatre lectures passent par `_attendeesLisibles()`, et plus
//      aucune ne jette son `{ error }` ;
//   ① appareil SANS compte → `supaLoadEvents` ne demande JAMAIS la table, et
//      rend quand même ses rencontres ;
//   ② appareil SANS compte → `supaLoadMyRsvps` n'en demande aucune (le chemin
//      d'échec en coûtait DEUX : `throw error` tombait dans un repli qui
//      REFAISAIT la requête refusée) ;
//   ③ compte réel → la table est demandée et les participants sont rangés : le
//      correctif ne ferme pas la porte à ceux qui y ont droit ;
//   ④ compte réel + refus 42501 → UN seul appel, et l'appel suivant n'en fait
//      plus AUCUN (le refus est mémorisé pour la session) ;
//   ⑤ compte réel + colonne `rsvp` absente → le repli, lui, a toujours lieu ;
//   ⑥ appareil SANS compte → `supaLoadEventRatings` et `supaFirstWaitlisted`
//      (ouvrir la fiche d'une rencontre) ne demandent rien non plus.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SOURCE_APP08 = path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js");

// Un uuid Supabase : la SEULE forme qui prouve un compte. `getMyUserId()`
// fabrique un `u_<aléatoire>` pour tout visiteur — c'est ce que `bootOnboarded`
// laisse en place, donc le cas « sans compte » n'a rien à poser.
const UID_COMPTE = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

const EV = { id: "ev_banc_participants", author_id: "org_1", title: "Rencontre de banc" };

function corpsDeFonction(src, nom) {
  const i = src.indexOf("async function " + nom + "(");
  if (i < 0) return "";
  const j = src.indexOf("\nasync function ", i + 10);
  return src.slice(i, j < 0 ? src.length : j);
}

/**
 * Démarre l'app puis REMPLACE `supa.from` par un faux client qui compte les
 * tables demandées.
 *
 * ⚠️ On MUTE `window.supa.from` : `supa` est un `let` de portée script, donc
 * `window.supa = x` créerait une propriété séparée que le code de l'app ne
 * regarde pas (piège déjà payé par `reprise-lectures-boot`).
 * ⚠️ `sansIsolationDesDonnees` : ce banc gère le réseau LUI-MÊME (tout Supabase
 * est coupé avant la navigation). Playwright évalue les routes dans l'ordre
 * INVERSE de leur enregistrement — sans cette porte, l'isolation par défaut de
 * `bootOnboarded` passerait devant la nôtre et laisserait filer les ÉCRITURES,
 * dont un `profiles` tenté sous l'uuid de banc.
 */
async function banc(page, { compte, plan }) {
  await page.route(/supabase\.co/, (route) => route.abort());
  if (compte) await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_COMPTE);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((p) => {
    window.__tables = [];
    window.__plan = p;
    // Le résolveur de profils interrogerait `profiles` : hors sujet ici.
    window._resolveProfilesByIds = async () => ({});
    const reponse = (table) => {
      const file = window.__plan[table];
      if (!Array.isArray(file) || !file.length) return { data: [], error: null };
      // La DERNIÈRE réponse est collante : un second `supaLoadEvents` doit
      // retrouver ses rencontres, sinon le cas ④ ne mesurerait plus rien.
      const r = (file.length > 1) ? file.shift() : file[0];
      return { data: r.data || null, error: r.error || null };
    };
    const requete = (table) => {
      const q = {};
      ["select", "order", "limit", "in", "eq", "not", "maybeSingle", "single"]
        .forEach((m) => { q[m] = () => q; });
      q.then = (ok, ko) => Promise.resolve(reponse(table)).then(ok, ko);
      return q;
    };
    window.supa.from = (table) => { window.__tables.push(table); return requete(table); };
  }, plan);
  // Un chargement de démarrage encore EN VOL compterait dans le relevé (le bloc
  // « 3. Les autres requêtes » de `supaInit` part à +2 s) : on laisse la poussière
  // retomber, puis on remet le compteur à zéro.
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__tables = []; });
}

const compter = (page) => page.evaluate(() =>
  window.__tables.filter((t) => t === "event_attendees").length);

test.describe("event_attendees : une lecture réservée aux comptes", () => {
  test("⓪ source — les quatre lectures sont gardées, et aucune ne jette son { error }", () => {
    const src = fs.readFileSync(SOURCE_APP08, "utf8");
    for (const nom of ["supaLoadEvents", "supaLoadMyRsvps", "supaLoadEventRatings", "supaFirstWaitlisted"]) {
      const corps = corpsDeFonction(src, nom);
      expect(corps, `${nom} existe toujours`).not.toBe("");
      expect(corps.includes("_attendeesLisibles("), `${nom} passe par la garde`).toBe(true);
    }
    // La forme EXACTE du défaut : un résultat déstructuré sans son `error`.
    expect(src.includes("const { data: atts } = await supa"),
      "plus aucune lecture de participants n'ignore son { error }").toBe(false);
  });

  test("① sans compte — supaLoadEvents ne demande pas les participants, et rend ses rencontres", async ({ page }) => {
    await banc(page, { compte: false, plan: { events: [{ data: [EV] }] } });
    const evs = await page.evaluate(() => supaLoadEvents());
    expect(await compter(page), "aucun appel à event_attendees sans compte").toBe(0);
    expect(evs.length, "les rencontres remontent quand même").toBe(1);
    expect(evs[0].attendees, "la liste est simplement vide").toEqual([]);
  });

  test("② sans compte — supaLoadMyRsvps n'appelle rien (le défaut en coûtait DEUX)", async ({ page }) => {
    await banc(page, { compte: false, plan: {} });
    const map = await page.evaluate(() => supaLoadMyRsvps());
    expect(await compter(page), "aucun appel, ni le premier ni son repli").toBe(0);
    expect(map, "rend un état vide, comme sur échec").toEqual({});
  });

  test("③ compte réel — la table est lue et les participants sont rangés", async ({ page }) => {
    await banc(page, {
      compte: true,
      plan: {
        events: [{ data: [EV] }],
        event_attendees: [{ data: [
          { event_id: EV.id, user_id: "u_vient", rsvp: "going" },
          { event_id: EV.id, user_id: "u_peutetre", rsvp: "maybe" },
          { event_id: EV.id, user_id: "u_attente", rsvp: "waitlist" },
          { event_id: EV.id, user_id: "u_refuse", rsvp: "declined" },
          { event_id: EV.id, user_id: "u_pointe", rsvp: "going", checked_in_at: "2026-09-12T10:00:00" },
        ] }],
      },
    });
    const evs = await page.evaluate(() => supaLoadEvents());
    expect(await compter(page), "un compte y a droit : la lecture part").toBe(1);
    expect(evs[0].attendees).toEqual(["u_vient", "u_pointe"]);
    expect(evs[0].maybes).toEqual(["u_peutetre"]);
    expect(evs[0].waitlist).toEqual(["u_attente"]);
    expect(evs[0].checkedIn).toEqual(["u_pointe"]);
  });

  test("④ compte réel + refus 42501 — un seul appel, puis plus aucun", async ({ page }) => {
    await banc(page, {
      compte: true,
      plan: {
        events: [{ data: [EV] }],
        event_attendees: [{ error: { code: "42501", message: "permission denied for table event_attendees" } }],
      },
    });
    await page.evaluate(() => supaLoadEvents());
    expect(await compter(page), "un refus ne se retente pas dans le même appel").toBe(1);
    await page.evaluate(() => supaLoadEvents());
    expect(await compter(page), "le refus est mémorisé pour la session").toBe(1);
    // Et le mémo vaut pour toutes les portes, pas seulement celle qui a pris le refus.
    await page.evaluate(() => supaLoadMyRsvps());
    expect(await compter(page), "les autres lectures s'abstiennent aussi").toBe(1);
  });

  test("⑤ compte réel + colonne rsvp absente — le repli a toujours lieu", async ({ page }) => {
    await banc(page, {
      compte: true,
      plan: {
        events: [{ data: [EV] }],
        event_attendees: [
          { error: { message: 'column event_attendees.rsvp does not exist' } },
          { data: [{ event_id: EV.id, user_id: "u_ancien" }] },
        ],
      },
    });
    const evs = await page.evaluate(() => supaLoadEvents());
    expect(await compter(page), "deux appels : la base non migrée garde son repli").toBe(2);
    expect(evs[0].attendees, "l'ancien modèle compte tout le monde comme venant").toEqual(["u_ancien"]);
  });

  test("⑥ sans compte — la fiche d'une rencontre ne demande ni notes ni liste d'attente", async ({ page }) => {
    await banc(page, { compte: false, plan: {} });
    const res = await page.evaluate(async () => ({
      notes: await supaLoadEventRatings("ev_x"),
      attente: await supaFirstWaitlisted("ev_x"),
    }));
    expect(await compter(page), "aucune des deux lectures ne part").toBe(0);
    expect(res.notes, "« indisponible », ce que l'appelant sait déjà traiter").toBe(null);
    expect(res.attente).toBe(null);
  });
});
