// ═══════════════════════════════════════════════════════════════════════════
// LES COLONNES PRIVÉES D'UNE RENCONTRE — LE VISITEUR LES DEMANDAIT POUR SE LES
// VOIR REFUSER
//
// Défaut relevé par la sentinelle le 2026-09-12 sur la production :
//
//     HTTP 401 sur GET /rest/v1/events : refusé — jeton absent ou expiré
//     13 appel(s) refusé(s), 0 compte(s) identifié(s).
//
// ⚠️ LE ZÉRO EST LA PREUVE, PAS UN DÉTAIL. `telemetry.js` ne transmet un
// `user_id` que si `MY_UID` est un uuid d'auth : 13 refus et 0 compte veut donc
// dire « 13 refus chez des clients SANS compte ».
//
// CAUSE. C'est le JUMEAU du défaut `event_attendees` du même jour
// (`participants-visiteur.spec.js`), une table plus loin.
// `migration_irl_donnees_privees.sql` (08/09) retire `address` et `contact` à
// `anon`, et `migration_ouverture_publique_2026-09-11.sql` y ajoute `conv_id` :
// un visiteur n'a JAMAIS le droit de lire ces trois colonnes. `supaLoadEvents`
// demandait pourtant `_EVENT_COLS_PRIVE` D'ABORD, pour TOUT LE MONDE, et ne
// retombait sur `_EVENT_COLS_PUBLIC` qu'APRÈS le refus. Une porte fermée exprès,
// à laquelle le client frappait une fois par session sans compte — le parcours
// visiteur y passe (`js/first-run.js` → `chargerContenuPublic` → `supaLoadEvents`).
//
// ⚠️ 401 ET NON 403 : PostgREST rend 403 sur un 42501 quand un compte est
// authentifié, et 401 quand le rôle est le rôle ANONYME. Le code d'abord : ici la
// policy est juste, c'est le GRANT qui manque — et il manque exprès. La cause
// n'est donc PAS une règle d'accès à corriger (hors périmètre), c'est un appel
// client qui ne devait plus partir.
//
// ⚠️ ET LE REFUS N'AVAIT AUCUNE CONSÉQUENCE À L'ÉCRAN : le repli rendait la liste
// complète, et `address`/`contact` retombaient déjà à la chaîne vide. Du bruit
// pur dans le tableau de bord qui sert à voir les vrais défauts — même famille
// que « newestWorker is null ».
//
// Ce que ce banc garde — et il ÉCHOUE sur le code d'avant (réinjection) :
//   ⓪ SOURCE : le choix des colonnes passe par `_compteAuthReel()`, le repli est
//      conditionné à la demande PRIVÉE, et `_attendeesLisibles` délègue à la même
//      autorité (une seule définition de « un compte existe ») ;
//   ① sans compte → UN SEUL appel à `events`, et il ne nomme ni `address`, ni
//      `contact`, ni `conv_id` ; les rencontres remontent quand même ;
//   ② sans compte + refus sur la liste PUBLIQUE → toujours un seul appel : on ne
//      retente jamais la requête qu'on vient de se faire refuser ;
//   ③ compte réel → la liste PRIVÉE part, et `address`/`contact`/`convId`
//      remontent : le correctif ne ferme pas la porte à ceux qui y ont droit ;
//   ④ compte réel dont la session est morte → UN repli, puis plus jamais la
//      liste privée de la session (le mémo `_eventColsPubliquesSeulement`).
//
// ── AJOUT DU 2026-09-12, APRÈS LA SECONDE REMONTÉE DU MÊME 401 ──────────────
// Les 17 refus de la seconde remontée portent, comme les 13 premiers,
// « 0 compte identifié » : ils décrivent le chemin VISITEUR, celui que les cas
// ① et ② ferment déjà. Ce qui restait ouvert dans la même fonction, c'est le
// mémo lui-même : `_eventColsPubliquesSeulement` se pose sur N'IMPORTE QUEL
// refus de la demande privée, y compris « jeton absent ou expiré » (PGRST301),
// qui n'a plus aucune cause au jeton suivant. Il SURVIVAIT pourtant à la
// session entière — seul mémo de refus du fichier dans ce cas, son voisin
// `_attendeesRefusLecture` étant levé depuis toujours par
// `SIGNED_IN`/`TOKEN_REFRESHED`. Conséquence pour un compte qui a PLEINEMENT
// droit à ces colonnes, et dont le jeton avait simplement expiré le temps d'un
// démarrage : `address`, `contact` et `conv_id` vides jusqu'au prochain
// rechargement complet — l'adresse du rendez-vous, le téléphone de
// l'organisateur, et « rejoindre la conversation » sans `conv_id`.
//   ⑤ SOURCE : la branche `SIGNED_IN`/`TOKEN_REFRESHED` lève les DEUX mémos par
//      un seul point (`_oublierRefusLecturesIRL`) — deux levées côte à côte
//      finissent par diverger, et c'est la seconde qu'on oublie ;
//   ⑤ bis COMPORTEMENT : mémo posé, jeton frais → la liste PRIVÉE repart.
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

const EV = {
  id: "ev_banc_cols", author_id: "org_1", title: "Rencontre de banc",
  address: "12 rue du Banc", contact: "0600000000", conv_id: "evgrp_ev_banc_cols",
};

const REFUS_401 = { code: "42501", message: "permission denied for column address of relation events" };

// Le corps d'une fonction top-level, bornée au prochain `\nfunction ` ou
// `\nasync function ` — assez pour distinguer « la garde est DANS supaLoadEvents »
// de « la garde existe quelque part dans le fichier ».
function corpsDeFonction(src, nom) {
  const i = src.search(new RegExp("\\n(?:async )?function " + nom + "\\("));
  if (i < 0) return "";
  const suite = src.slice(i + 1);
  const k = suite.search(/\n(?:async )?function /);
  return k < 0 ? suite : suite.slice(0, k);
}

/**
 * Démarre l'app puis REMPLACE `supa.from` par un faux client qui note, pour
 * chaque table, les COLONNES demandées.
 *
 * ⚠️ On MUTE `window.supa.from` : `supa` est un `let` de portée script, donc
 * `window.supa = x` créerait une propriété séparée que le code de l'app ne
 * regarde pas (piège déjà payé par `reprise-lectures-boot`).
 * ⚠️ `sansIsolationDesDonnees` : ce banc gère le réseau LUI-MÊME (tout Supabase
 * est coupé avant la navigation). Playwright évalue les routes dans l'ordre
 * INVERSE de leur enregistrement — sans cette porte, l'isolation par défaut de
 * `bootOnboarded` passerait devant la nôtre.
 */
async function banc(page, { compte, plan }) {
  await page.route(/supabase\.co/, (route) => route.abort());
  if (compte) await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_COMPTE);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((p) => {
    window.__lectures = [];
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
    // ⚠️ LE FAUX CLIENT PROJETTE VRAIMENT LES COLONNES DEMANDÉES. Un faux qui
    // rendrait la ligne entière quel que soit le `select` laisserait
    // `evs[0].address` renseigné même sur la liste publique : les cas ① et ④
    // seraient alors VERTS sur un client qui ne respecte rien — ils ne
    // mesureraient plus que la présence de la ligne.
    const projeter = (r, cols) => {
      if (r.error || !Array.isArray(r.data) || !cols) return r;
      const noms = cols.split(",").map((c) => c.trim());
      return { data: r.data.map((row) => {
        const o = {};
        noms.forEach((n) => { if (n in row) o[n] = row[n]; });
        return o;
      }), error: null };
    };
    const requete = (table) => {
      const q = { __cols: "" };
      ["order", "limit", "in", "eq", "not", "maybeSingle", "single"]
        .forEach((m) => { q[m] = () => q; });
      q.select = (cols) => {
        q.__cols = String(cols || "");
        window.__lectures.push({ table: table, cols: q.__cols });
        return q;
      };
      q.then = (ok, ko) => Promise.resolve(projeter(reponse(table), q.__cols)).then(ok, ko);
      return q;
    };
    window.supa.from = (table) => requete(table);
  }, plan);
  // Un chargement de démarrage encore EN VOL compterait dans le relevé (le bloc
  // « 3. Les autres requêtes » de `supaInit` part à +2 s) : on laisse la poussière
  // retomber, puis on remet le compteur à zéro.
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__lectures = [];
    // ⚠️ Et le MÉMO avec : un `supaLoadEvents` de démarrage tombé sur le réseau
    // coupé aurait pu le poser, et les cas ③/④ mesureraient alors le repli au
    // lieu de la demande privée — un vert (ou un rouge) qui ne dirait rien.
    // ⚠️ Il se lit et s'écrit par son NOM NU : c'est un `let` de portée script,
    // `window._eventColsPubliquesSeulement` serait une propriété séparée.
    _eventColsPubliquesSeulement = false;
  });
}

const lecturesEvents = (page) => page.evaluate(() =>
  window.__lectures.filter((l) => l.table === "events").map((l) => l.cols));

test.describe("events : les colonnes privées ne partent qu'avec un compte", () => {
  test("⓪ source — le choix des colonnes et le repli passent par la même autorité", () => {
    const src = fs.readFileSync(SOURCE_APP08, "utf8");
    expect(src.includes("function _compteAuthReel("), "l'autorité existe").toBe(true);

    const corps = corpsDeFonction(src, "supaLoadEvents");
    expect(corps, "supaLoadEvents existe toujours").not.toBe("");
    expect(corps.includes("_compteAuthReel("),
      "le choix des colonnes passe par la garde").toBe(true);
    // La forme EXACTE du défaut : la liste privée demandée sur le seul mémo.
    expect(corps.includes("_eventColsPubliquesSeulement ? _EVENT_COLS_PUBLIC : _EVENT_COLS_PRIVE"),
      "plus aucun choix de colonnes sur le seul mémo de session").toBe(false);
    expect(corps.includes("if (error && prive)"),
      "le repli ne s'arme QUE si la demande privée est partie").toBe(true);

    // Une seule définition de « un compte existe » : `_attendeesLisibles` délègue.
    const garde = corpsDeFonction(src, "_attendeesLisibles");
    expect(garde.includes("_compteAuthReel("),
      "_attendeesLisibles délègue à l'autorité unique").toBe(true);
  });

  test("① sans compte — un seul appel, et jamais les colonnes privées", async ({ page }) => {
    await banc(page, { compte: false, plan: { events: [{ data: [EV] }] } });
    const evs = await page.evaluate(() => supaLoadEvents());
    const cols = await lecturesEvents(page);
    expect(cols.length, "une seule requête : la privée ne part plus du tout").toBe(1);
    for (const interdite of ["address", "contact", "conv_id"]) {
      expect(cols[0].split(",").includes(interdite),
        `« ${interdite} » n'est pas demandée sans compte`).toBe(false);
    }
    const publique = await page.evaluate(() => _EVENT_COLS_PUBLIC);
    expect(cols[0], "c'est exactement la liste publique").toBe(publique);
    expect(evs.length, "les rencontres remontent quand même").toBe(1);
    expect(evs[0].address, "l'adresse est simplement vide").toBe("");
  });

  test("② sans compte + refus sur la liste publique — on ne retente pas", async ({ page }) => {
    await banc(page, { compte: false, plan: { events: [{ error: REFUS_401 }] } });
    const evs = await page.evaluate(() => supaLoadEvents());
    const cols = await lecturesEvents(page);
    expect(cols.length, "un refus ne se retente pas à l'identique").toBe(1);
    expect(evs, "et l'appelant reçoit une liste vide, comme sur échec").toEqual([]);
  });

  test("③ compte réel — la liste privée part et ses colonnes remontent", async ({ page }) => {
    await banc(page, { compte: true, plan: { events: [{ data: [EV] }] } });
    const evs = await page.evaluate(() => supaLoadEvents());
    const cols = await lecturesEvents(page);
    const prive = await page.evaluate(() => _EVENT_COLS_PRIVE);
    expect(cols.length, "un seul aller-retour, celui qui a le droit").toBe(1);
    expect(cols[0], "un compte y a droit : la liste privée est demandée").toBe(prive);
    expect(evs[0].address).toBe(EV.address);
    expect(evs[0].contact).toBe(EV.contact);
    expect(evs[0].convId).toBe(EV.conv_id);
  });

  test("④ compte réel dont la session est morte — un repli, puis plus jamais", async ({ page }) => {
    await banc(page, {
      compte: true,
      plan: { events: [{ error: REFUS_401 }, { data: [EV] }] },
    });
    const evs = await page.evaluate(() => supaLoadEvents());
    let cols = await lecturesEvents(page);
    expect(cols.length, "le refus est suivi d'UN repli public").toBe(2);
    expect(cols[1], "et le repli demande la liste publique").toBe(await page.evaluate(() => _EVENT_COLS_PUBLIC));
    expect(evs.length, "les rencontres remontent par le repli").toBe(1);
    expect(evs[0].address, "sans ses colonnes privées").toBe("");

    await page.evaluate(() => supaLoadEvents());
    cols = await lecturesEvents(page);
    expect(cols.length, "l'appel suivant n'en fait qu'un").toBe(3);
    expect(cols[2], "le mémo tient : la liste privée ne repart pas de la session")
      .toBe(await page.evaluate(() => _EVENT_COLS_PUBLIC));
  });

  test("⑤ source — un jeton frais lève les DEUX mémos, par un seul point", () => {
    const src = fs.readFileSync(SOURCE_APP08, "utf8");

    const corps = corpsDeFonction(src, "_oublierRefusLecturesIRL");
    expect(corps, "la levée unique existe").not.toBe("");
    expect(corps.includes("_attendeesRefusLecture = false"),
      "elle lève le mémo des participants").toBe(true);
    expect(corps.includes("_eventColsPubliquesSeulement = false"),
      "elle lève AUSSI le mémo des colonnes d'une rencontre").toBe(true);

    // La branche qui reçoit un jeton frais doit l'appeler. Sans ce câblage, la
    // fonction serait juste et n'aurait aucun appelant — le défaut exact déjà
    // payé par `_notifierMessage` (fonction morte, 12 verrous verts).
    const i = src.indexOf('if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")');
    expect(i, "la branche du jeton frais existe toujours").toBeGreaterThan(-1);
    const branche = src.slice(i, i + 1600);
    expect(branche.includes("_oublierRefusLecturesIRL("),
      "la branche du jeton frais appelle la levée unique").toBe(true);
  });

  test("⑤ bis — mémo posé par un refus, jeton frais : la liste privée repart", async ({ page }) => {
    await banc(page, {
      compte: true,
      plan: { events: [{ error: REFUS_401 }, { data: [EV] }] },
    });
    await page.evaluate(() => supaLoadEvents());
    let cols = await lecturesEvents(page);
    expect(cols.length, "le refus a bien posé le mémo (un repli)").toBe(2);

    // Ce que fait la branche `SIGNED_IN`/`TOKEN_REFRESHED` : elle ne fait QUE
    // cela, et le cas ⑤ prouve qu'elle le fait.
    await page.evaluate(() => _oublierRefusLecturesIRL());

    const evs = await page.evaluate(() => supaLoadEvents());
    cols = await lecturesEvents(page);
    expect(cols.length, "un seul aller-retour, celui qui a le droit").toBe(3);
    expect(cols[2], "le mémo ne survit pas au jeton qui le causait")
      .toBe(await page.evaluate(() => _EVENT_COLS_PRIVE));
    expect(evs[0].address, "et l'adresse revient pour qui y a droit").toBe(EV.address);
    expect(evs[0].convId, "conv_id aussi : « rejoindre la conversation » remarche")
      .toBe(EV.conv_id);
  });
});
