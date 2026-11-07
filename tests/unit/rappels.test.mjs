// Rappels d'activité par push, même appli fermée (2026-10-05) — le cœur PUR
// (`supabase/functions/_shared/rappels.js`, le fichier même que Deno déploie),
// son enveloppe contre un faux PostgREST, le service worker exécuté dans une
// machine virtuelle, et le câblage à la source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DELAI_PUSH_MS } from "../../supabase/functions/_shared/push-sur.js";
import fs from "node:fs";
import vm from "node:vm";
import { idGeste } from "../../supabase/functions/_shared/autonomie.js";
import {
  palierDu, rappelsDus, envoyerRappels, texteSur, jourRelatif, duree, dateUtc, cleRappel,
  MARQUE_EVENEMENT, MAX_PAR_TOUR, MAX_PAR_COMPTE, marqueUid, MARQUE_UID,
} from "../../supabase/functions/_shared/rappels.js";

const H = 3600e3;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const S = "secret-serveur-de-test-0123456789"; // le secret serveur (clé service_role en production)
const C = "33333333-3333-4333-8333-333333333333";
const ORGA = "44444444-4444-4444-8444-444444444444";
// 2026-10-05 12:00 UTC = 14:00 à Paris (heure d'été).
const T0 = Date.parse("2026-10-05T12:00:00Z");
/** `date_at` tel que la base le rend : UTC, SANS fuseau. */
const naif = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

function activite(depart, extra = {}) {
  return { id: "ev_1", title: "Rando au Salève", city: "Annecy", date_at: naif(depart), status: "active",
    author_id: ORGA, created_at: naif(T0 - 5 * 864e5), ...extra };
}
const inscrit = (uid, rsvp = "going", quand = T0 - 3 * 864e5, ev = "ev_1") => ({ event_id: ev, user_id: uid, rsvp, created_at: new Date(quand).toISOString() });

test("① paliers : H-2 jusqu'à 2 h pile, la veille jusqu'à 24 h pile, rien au-delà ni dans le passé", () => {
  assert.equal(palierDu(2 * H).cle, "h2");
  assert.equal(palierDu(1).cle, "h2");
  assert.equal(palierDu(2 * H + 1).cle, "j1");
  assert.equal(palierDu(24 * H).cle, "j1");
  assert.equal(palierDu(24 * H + 1), null);
  assert.equal(palierDu(0), null, "commencée : plus de rappel");
  assert.equal(palierDu(-5), null);
  assert.equal(palierDu(NaN), null, "date illisible : rien");
});

test("② seuls ceux qui VIENNENT (going, maybe) et l'organisateur, comptes réels, une fois chacun", () => {
  const dus = rappelsDus({
    maintenant: T0,
    activites: [activite(T0 + 90 * 60e3)],
    participants: [inscrit(A), inscrit(B, "maybe"), inscrit(C, "waitlist"), inscrit("u_demo1"), inscrit(ORGA), inscrit(A, "declined")],
    dejaEnvoyes: [],
  });
  assert.deepEqual(dus.map((r) => r.uid).sort(), [A, B, ORGA].sort(), "liste d'attente, refus, compte de démo exclus ; l'organisateur une seule fois");
  for (const r of dus) {
    assert.equal(r.palier, "h2");
    assert.equal(r.cle, cleRappel("ev_1", "h2", r.uid));
    assert.equal(r.titre, "Rando au Salève");
    assert.equal(r.texte, "Ça commence dans 1 h 30 (à 15:30) · Annecy", "heure de PARIS, absolue");
    assert.equal(r.urgence, "high");
    assert.equal(r.ttl, 90 * 60, "H-2 vit jusqu'au départ");
  }
});

test("③ on ne rappelle jamais ce qu'on vient de faire : inscrit après l'ouverture du palier → silence", () => {
  const depart = T0 + 20 * H;
  const tard = inscrit(A, "going", depart - 21 * H); // 21 h avant le départ : J-1 était DÉJÀ ouvert (24 h)
  const tot = inscrit(B, "going", depart - 30 * H);
  const dus = rappelsDus({ maintenant: T0, activites: [activite(depart, { author_id: null })], participants: [tard, tot], dejaEnvoyes: [] });
  assert.deepEqual(dus.map((r) => r.uid), [B], "A s'est inscrit 21 h avant : la veille était déjà ouverte");
  assert.equal(dus[0].palier, "j1");
  // À H-2, A a bien sa place : il s'était inscrit avant l'ouverture de CE palier.
  const h2 = rappelsDus({ maintenant: depart - 90 * 60e3, activites: [activite(depart, { author_id: null })], participants: [tard, tot], dejaEnvoyes: [] });
  assert.deepEqual(h2.map((r) => r.uid).sort(), [A, B].sort());
  // Une date d'inscription illisible compte comme ancienne : mieux vaut rappeler.
  const illisible = rappelsDus({ maintenant: T0, activites: [activite(depart, { author_id: null })], participants: [{ event_id: "ev_1", user_id: C, rsvp: "going", created_at: null }], dejaEnvoyes: [] });
  assert.deepEqual(illisible.map((r) => r.uid), [C]);
});

test("④ une fois, pas plus : une marque existante tait le rappel ; H-2 n'est pas tu par la veille", () => {
  const p = [inscrit(A)];
  const marque = cleRappel("ev_1", "j1", A);
  assert.equal(rappelsDus({ maintenant: T0, activites: [activite(T0 + 10 * H, { author_id: null })], participants: p, dejaEnvoyes: [marque] }).length, 0);
  assert.equal(rappelsDus({ maintenant: T0, activites: [activite(T0 + H, { author_id: null })], participants: p, dejaEnvoyes: new Set([marque]) }).length, 1);
});

test("⑤ activité annulée, identifiant douteux, au-delà de 24 h : rien", () => {
  const p = [inscrit(A), inscrit(A, "going", T0 - 864e5, "x/../y")];
  assert.equal(rappelsDus({ maintenant: T0, activites: [activite(T0 + H, { status: "cancelled" })], participants: p, dejaEnvoyes: [] }).length, 0);
  assert.equal(rappelsDus({ maintenant: T0, activites: [activite(T0 + H, { id: "x/../y", author_id: null })], participants: p, dejaEnvoyes: [] }).length, 0);
  assert.equal(rappelsDus({ maintenant: T0, activites: [activite(T0 + 25 * H)], participants: p, dejaEnvoyes: [] }).length, 0);
});

test("⑥ la veille dit « demain » ou « aujourd'hui » selon le calendrier de PARIS, pas d'UTC", () => {
  // 23:30 à Paris (21:30 UTC) ; départ 00:30 à Paris le lendemain (22:30 UTC, même jour UTC).
  const maintenant = Date.parse("2026-10-05T21:30:00Z");
  const depart = Date.parse("2026-10-05T22:30:00Z") + 3 * H; // 03:30 Paris, le 6
  assert.equal(jourRelatif(depart, maintenant), "demain");
  assert.equal(jourRelatif(Date.parse("2026-10-05T20:00:00Z"), Date.parse("2026-10-05T08:00:00Z")), "aujourd'hui");
  const [r] = rappelsDus({ maintenant, activites: [activite(depart, { author_id: null, city: "" })], participants: [inscrit(A, "going", maintenant - 864e5)], dejaEnvoyes: [] });
  assert.equal(r.texte, "C'est demain à 03:30", "sans ville : pas de « · » orphelin");
  assert.equal(r.urgence, "normal");
  assert.ok(r.ttl >= 60 && r.ttl <= 6 * 3600, "la veille ne survit pas à l'ouverture de H-2");
  assert.equal(duree(45 * 60e3), "45 min");
  assert.equal(duree(2 * H), "2 h");
  assert.equal(duree(110 * 60e3), "1 h 50");
});

test("⑦ le texte de l'organisateur est purgé (contrôle, bidi, sauts) et borné ; le liant des émojis reste", () => {
  assert.equal(texteSur("Ra‮ndo\u0000 au\nSalève", 60), "Ra ndo au Salève");
  assert.equal(texteSur("👩‍👩‍👧 sortie", 60), "👩‍👩‍👧 sortie");
  assert.equal(Array.from(texteSur("é".repeat(100), 60)).length, 60);
  const [r] = rappelsDus({ maintenant: T0, activites: [activite(T0 + H, { title: "  ⁦⁧  ", author_id: null })], participants: [inscrit(A)], dejaEnvoyes: [] });
  assert.equal(r.titre, "Ton activité", "un titre vide après purge n'affiche pas un blanc");
});

test("⑧ borne par tour : au plus MAX_PAR_TOUR rappels, le reste au tour suivant", () => {
  const p = [];
  for (let i = 0; i < MAX_PAR_TOUR + 20; i++) p.push(inscrit(`55555555-5555-4555-8555-${String(i).padStart(12, "0")}`));
  assert.equal(rappelsDus({ maintenant: T0, activites: [activite(T0 + H, { author_id: null })], participants: p, dejaEnvoyes: [] }).length, MAX_PAR_TOUR);
});

test("⑧ bis une activité lue DEUX fois (ligne décalée entre deux pages) : une clé, un rappel", () => {
  const a = activite(T0 + H, { author_id: null });
  const dus = rappelsDus({ maintenant: T0, activites: [a, { ...a }], participants: [inscrit(A)], dejaEnvoyes: [] });
  assert.deepEqual(dus.map((r) => r.cle), [cleRappel("ev_1", "h2", A)]);
});

test("⑧ ter au plus MAX_PAR_COMPTE rappels par destinataire et par tour — le reste attend le tour suivant", () => {
  const evs = [];
  for (let i = 0; i < MAX_PAR_COMPTE + 5; i++) evs.push(activite(T0 + H, { id: "ev_" + String(i).padStart(3, "0") }));
  const dus = rappelsDus({ maintenant: T0, activites: evs, participants: [], dejaEnvoyes: [] });
  assert.equal(dus.length, MAX_PAR_COMPTE);
  assert.ok(dus.every((r) => r.uid === ORGA && r.debut === T0 + H), "chaque rappel dit son départ (il entre dans l'identifiant de la marque)");
  assert.ok(MAX_PAR_COMPTE <= 120, "sous la limite de trg_rate_limit, avec de la marge");
});

/**
 * Faux client PostgREST : applique les filtres `in`/`eq` sur les colonnes que les
 * lignes portent, pagine par `range`, note chaque écriture dans l'ORDRE et chaque
 * tri demandé — et refuse un INSERT qui dépasserait `trg_rate_limit` (120 lignes
 * par minute et par `user_id` sur analytics_events), comme la production.
 * `analytics_events` a sa CLÉ PRIMAIRE (`id`) : une écriture y devient visible
 * aux lectures suivantes ; un upsert `ignoreDuplicates` ne rend que les lignes
 * qu'il a ÉCRITES (ON CONFLICT DO NOTHING … RETURNING), un upsert sans lui les
 * rend toutes (fusion). `rendezVous: n` retient chaque lecture des marques
 * jusqu'à ce que n tours les aient lues : l'entrelacement mesuré en production
 * (deux veilles qui lisent toutes deux « aucune marque » avant d'écrire).
 */
function fauxAdmin({ events = [], attendees = [], marques = [], subs = [], refuserMarque = false, rendezVous = 0, idsPris = [], horloge = null }) {
  const journal = [];
  const lignes = { events, event_attendees: attendees, analytics_events: marques, push_subscriptions: subs };
  // `idsPris` : des marques écrites par un tour concurrent APRÈS notre lecture —
  // la clé primaire les connaît, la lecture ne les a pas vues.
  const ids = new Set([...marques.filter((m) => m && m.id).map((m) => m.id), ...idsPris]);
  let lus = 0, ouvrir;
  const porte = new Promise((r) => { ouvrir = r; });
  const table = (nom) => {
    const q = {
      _op: "select", _filtres: [], _range: null,
      select() { return q; }, lte() { return q; }, neq() { return q; },
      // La fenêtre de lecture des marques (`created_at`, 3 jours) est APPLIQUÉE :
      // sans elle, une marque ancienne passait pour lue (le report d'activité
      // de la revue du 2026-11-06 passait ainsi au vert).
      gte(col, v) { if (col === "created_at") q._depuis = v; return q; },
      order(col) { journal.push({ op: "order", nom, col }); return q; },
      eq(col, v) { q._filtres.push([col, [v]]); return q; },
      in(col, vals) { q._filtres.push([col, vals]); q._in = vals; return q; },
      range(a, b) { q._range = [a, b]; return q; },
      limit() { return q; },
      insert(rows) { journal.push({ op: "insert", nom, rows, options: null }); q._op = "insert"; q._rows = Array.isArray(rows) ? rows : [rows]; return q; },
      upsert(rows, options) { journal.push({ op: "insert", nom, rows, options }); q._op = "upsert"; q._rows = rows; q._options = options; return q; },
      delete() { q._op = "delete"; return q; },
      then(res, rej) {
        let out;
        if (q._op === "insert" || q._op === "upsert") {
          const parUid = {};
          for (const r of q._rows) parUid[r.user_id] = (parUid[r.user_id] || 0) + 1;
          const limite = nom === "analytics_events" && Object.values(parUid).some((n) => n > 120);
          out = (nom === "analytics_events" && refuserMarque) ? { error: { message: "refusé" } }
            : limite ? { error: { message: "rate limit: max 120 insertions/minute sur analytics_events" } } : { error: null };
          if (!out.error && nom === "analytics_events") {
            const neuves = q._rows.filter((r) => !(r.id && ids.has(r.id)));
            if (q._op === "insert" && neuves.length < q._rows.length) out = { error: { code: "23505", message: "duplicate key value violates unique constraint \"analytics_events_pkey\"" } };
            else {
              // `horloge` : l'heure que la base pose (`created_at default now()`).
              for (const r of neuves) { if (r.id) ids.add(r.id); lignes.analytics_events.push(horloge ? { created_at: horloge(), ...r } : r); }
              if (q._op === "upsert") out = { data: ((q._options && q._options.ignoreDuplicates) ? neuves : q._rows).map((r) => ({ id: r.id })), error: null };
            }
          }
        } else if (q._op === "delete") { journal.push({ op: "delete", nom, valeurs: q._in }); out = { error: null }; }
        else {
          let l = (lignes[nom] || []).filter((r) => q._filtres.every(([c, vals]) => !(c in r) || vals.includes(r[c])));
          if (q._depuis) l = l.filter((r) => !r.created_at || r.created_at >= q._depuis);
          if (q._range) l = l.slice(q._range[0], q._range[1] + 1);
          journal.push({ op: "select", nom });
          out = { data: l, error: null };
          if (nom === "analytics_events" && rendezVous) {
            if (++lus >= rendezVous) ouvrir();
            return porte.then(() => out).then(res, rej);
          }
        }
        return Promise.resolve(out).then(res, rej);
      },
    };
    return q;
  };
  return { from: (nom) => table(nom), journal };
}

test("⑨ enveloppe : la marque est écrite AVANT l'envoi ; charge « rappel » ; abonnement expiré retiré ; rejouer ne renvoie rien", async () => {
  const subs = [
    { endpoint: "https://fcm.googleapis.com/fcm/send/a1", user_id: A, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/a1" } },
    { endpoint: "https://fcm.googleapis.com/fcm/send/a2", user_id: A, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/a2" } },
  ];
  const admin = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A), inscrit(B)], subs });
  const envois = [];
  const envoyer = async (sub, charge, opts) => {
    envois.push({ sub, charge: JSON.parse(charge), opts, marqueDeja: admin.journal.some((j) => j.op === "insert") });
    if (sub.endpoint === "https://fcm.googleapis.com/fcm/send/a2") { const e = new Error("parti"); e.statusCode = 410; throw e; }
  };
  const r = await envoyerRappels(admin, envoyer, T0, S);
  assert.deepEqual(r, { activites: 1, dus: 2, envoyes: 1, sansAppareil: 1, expires: 1, dejaPris: 0 }, "B n'a aucun appareil");
  assert.ok(envois.length === 2 && envois.every((e) => e.marqueDeja), "aucune push ne part avant la marque");
  assert.deepEqual(envois[0].charge, { type: "rappel", titre: "Rando au Salève", texte: "Ça commence dans 1 h (à 15:00) · Annecy", eventId: "ev_1" });
  assert.deepEqual(envois[0].opts, { TTL: 3600, urgency: "high", timeout: DELAI_PUSH_MS }, "un envoi porte toujours son délai");
  const marque = admin.journal.find((j) => j.op === "insert");
  assert.deepEqual(marque.rows.map((x) => [x.user_id, x.event, x.properties.cle]).sort(),
    [[marqueUid(A), MARQUE_EVENEMENT, cleRappel("ev_1", "h2", A)], [marqueUid(B), MARQUE_EVENEMENT, cleRappel("ev_1", "h2", B)]].sort());
  assert.deepEqual(marque.options, { onConflict: "id", ignoreDuplicates: true }, "ON CONFLICT (id) DO NOTHING : seul le tour qui écrit la marque envoie");
  for (const x of marque.rows) assert.equal(x.id, await idGeste(`rappel:${x.properties.cle}:${T0 + H}`, S), "l'identifiant de la marque est celui de sa CLÉ et de son DÉPART");
  assert.deepEqual(admin.journal.find((j) => j.op === "delete"), { op: "delete", nom: "push_subscriptions", valeurs: ["https://fcm.googleapis.com/fcm/send/a2"] });

  // Tour suivant : les marques existent → rien ne repart.
  const admin2 = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A), inscrit(B)], subs,
    marques: marque.rows.map((x) => ({ user_id: x.user_id, event: x.event, properties: x.properties })) });
  const envois2 = [];
  assert.deepEqual(await envoyerRappels(admin2, async (s) => { envois2.push(s); }, T0 + 5 * 60e3, S), { activites: 1, dus: 0, envoyes: 0 });
  assert.equal(envois2.length, 0);
});

test("⑨ bis deux tours EN PARALLÈLE (deux veilles dans la même seconde, mesuré le 30/10) : chaque rappel part UNE fois", async () => {
  // Réinjection éprouvée : l'ancien `insert` sans identifiant → 4 pushes ; un
  // upsert sans `ignoreDuplicates` (fusion) → 4 pushes ; ce test rougit.
  const subs = [
    { endpoint: "https://fcm.googleapis.com/fcm/send/a", user_id: A, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/a" } },
    { endpoint: "https://fcm.googleapis.com/fcm/send/b", user_id: B, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/b" } },
  ];
  const admin = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A), inscrit(B)], subs, rendezVous: 2 });
  const envois = [];
  const [r1, r2] = await Promise.all([
    envoyerRappels(admin, async (s) => { envois.push(s.endpoint); }, T0, S),
    envoyerRappels(admin, async (s) => { envois.push(s.endpoint); }, T0 + 30, S),
  ]);
  assert.deepEqual(envois.sort(), ["https://fcm.googleapis.com/fcm/send/a", "https://fcm.googleapis.com/fcm/send/b"], "une push par compte, pas deux");
  assert.equal(r1.dus + r2.dus, 2);
  assert.deepEqual([r1.dejaPris, r2.dejaPris].sort(), [0, 2], "le second tour a trouvé ses marques déjà prises — il n'envoie rien");
  // Et le tour suivant lit les marques écrites : rien ne repart.
  assert.deepEqual(await envoyerRappels(fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A), inscrit(B)], subs,
    marques: admin.journal.filter((j) => j.op === "insert" && j.nom === "analytics_events").flatMap((j) => j.rows) }), async () => { throw new Error("jamais"); }, T0 + 5 * 60e3, S),
  { activites: 1, dus: 0, envoyes: 0 });
});

test("⑨ ter conflit PARTIEL : la marque de A vient d'être prise par un tour concurrent — seul B part", async () => {
  const subs = [
    { endpoint: "https://fcm.googleapis.com/fcm/send/a", user_id: A, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/a" } },
    { endpoint: "https://fcm.googleapis.com/fcm/send/b", user_id: B, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/b" } },
  ];
  const admin = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A), inscrit(B)], subs,
    idsPris: [await idGeste(`rappel:${cleRappel("ev_1", "h2", A)}:${T0 + H}`, S)] });
  const envois = [];
  const r = await envoyerRappels(admin, async (s) => { envois.push(s.endpoint); }, T0, S);
  assert.deepEqual(envois, ["https://fcm.googleapis.com/fcm/send/b"], "A a déjà son rappel, envoyé par l'autre tour");
  assert.deepEqual(r, { activites: 1, dus: 1, envoyes: 1, sansAppareil: 0, expires: 0, dejaPris: 1 });
});

test("⑩ enveloppe : marque refusée → on LÈVE et RIEN ne part ; aucune activité → aucune lecture de plus", async () => {
  const admin = fauxAdmin({ events: [activite(T0 + H)], attendees: [inscrit(A)], subs: [{ endpoint: "e", user_id: A, subscription: {} }], refuserMarque: true });
  let envoye = 0;
  await assert.rejects(envoyerRappels(admin, async () => { envoye++; }, T0, S), (e) => e && e.message === "refusé");
  assert.equal(envoye, 0);
  const vide = fauxAdmin({});
  assert.deepEqual(await envoyerRappels(vide, async () => { throw new Error("jamais"); }, T0, S), { activites: 0, dus: 0, envoyes: 0 });
});

test("⑨ quater activité REPORTÉE d'une semaine : son rappel repart — la marque de l'ancienne date a 7 jours, la lecture n'en voit que 3, la clé primaire 13 mois", async () => {
  // Deux VRAIS tours sur la même base : le premier à H-2 de la date d'origine,
  // le second à H-2 de la date reportée. Réinjection éprouvée : un identifiant
  // de marque sans le départ → la seconde push ne part pas.
  let maintenant = T0;
  const ev = activite(T0 + H, { author_id: null });
  const subs = [{ endpoint: "https://fcm.googleapis.com/fcm/send/a", user_id: A, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/a" } }];
  const admin = fauxAdmin({ events: [ev], attendees: [inscrit(A, "going", T0 - 10 * 864e5)], subs, horloge: () => new Date(maintenant).toISOString() });
  const envois = [];
  const envoyer = async (s) => { envois.push(s.endpoint); };
  assert.equal((await envoyerRappels(admin, envoyer, maintenant, S)).envoyes, 1, "le rappel de la date d'origine");
  ev.date_at = naif(T0 + 7 * 864e5 + H);
  maintenant = T0 + 7 * 864e5;
  const r = await envoyerRappels(admin, envoyer, maintenant, S);
  assert.deepEqual(envois, ["https://fcm.googleapis.com/fcm/send/a", "https://fcm.googleapis.com/fcm/send/a"], "la date reportée a son propre rappel");
  assert.equal(r.dejaPris, 0);
});

test("⑩ quinquies un compte qui organise 121 activités à la même heure ne coupe PLUS les rappels de tout le monde (trg_rate_limit : 120 lignes par minute et par user_id)", async () => {
  // Réinjection éprouvée : sans MAX_PAR_COMPTE, le lot de marques lève sur la
  // limite et AUCUN rappel ne part — pour personne, à chaque tour.
  const evs = [];
  for (let i = 0; i < 121; i++) evs.push(activite(T0 + H, { id: "ev_" + String(i).padStart(3, "0") }));
  const subs = [{ endpoint: "https://fcm.googleapis.com/fcm/send/b", user_id: B, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/b" } }];
  const admin = fauxAdmin({ events: evs, attendees: [inscrit(B, "going", T0 - 3 * 864e5, "ev_000")], subs });
  const envois = [];
  const r = await envoyerRappels(admin, async (s) => { envois.push(s.endpoint); }, T0, S);
  assert.deepEqual(envois, ["https://fcm.googleapis.com/fcm/send/b"], "B reçoit son rappel malgré l'organisateur aux 121 activités");
  assert.equal(r.dus, 1 + MAX_PAR_COMPTE, "l'organisateur en reçoit MAX_PAR_COMPTE ce tour-ci, le reste aux tours suivants");
});

test("⑩ quater sans le secret serveur, aucune marque et AUCUN envoi : un identifiant calculable d'avance laisserait un compte taire le rappel d'un autre", async () => {
  const admin = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A)], subs: [{ endpoint: "e", user_id: A, subscription: {} }] });
  let envoye = 0;
  await assert.rejects(envoyerRappels(admin, async () => { envoye++; }, T0), /secret serveur absent/);
  assert.equal(envoye, 0);
  assert.equal(admin.journal.filter((j) => j.op === "insert").length, 0, "rien n'est écrit");
});

test("⑩ bis une activité de 150 inscrits : le lot de marques passe la limite de 120/min par user_id, et tous sont rappelés", async () => {
  const p = [];
  for (let i = 0; i < 150; i++) p.push(inscrit(`66666666-6666-4666-8666-${String(i).padStart(12, "0")}`));
  const admin = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: p });
  const r = await envoyerRappels(admin, async () => {}, T0, S);
  assert.equal(r.dus, 150, "une seule clé système aurait fait échouer les 150 marques — donc tous les rappels");
  const uids = new Set(admin.journal.find((j) => j.op === "insert").rows.map((x) => x.user_id));
  assert.equal(uids.size, 150, "une marque par destinataire, sous son propre identifiant système");
  for (const u of uids) assert.match(u, /^systeme:rappels:[0-9a-f-]{36}$/, "jamais un uuid nu : un client pourrait l'écrire");
});

test("⑩ ter lectures TRIÉES et PAGINÉES : 1 200 activités sont toutes lues, la plus proche d'abord", async () => {
  const evs = [];
  for (let i = 0; i < 1200; i++) evs.push(activite(T0 + H + i * 60e3, { id: "ev_" + String(i).padStart(4, "0"), author_id: null }));
  const p = [inscrit(A, "going", T0 - 864e5, "ev_1199")];
  const admin = fauxAdmin({ events: evs, attendees: p });
  const r = await envoyerRappels(admin, async () => {}, T0, S);
  assert.equal(r.activites, 1200, "une limite plate en aurait laissé hors du tour");
  assert.equal(r.dus, 1, "l'inscrit de la 1 200ᵉ activité est rappelé");
  assert.ok(admin.journal.some((j) => j.op === "order" && j.nom === "events" && j.col === "date_at"), "le plus proche d'abord");
});

test("⑪ dateUtc lit la base comme supaTs : sans fuseau = UTC", () => {
  assert.equal(dateUtc("2026-10-05 12:00:00"), T0);
  assert.equal(dateUtc("2026-10-05T12:00:00+00:00"), T0);
  assert.equal(dateUtc("2026-10-05T14:00:00+02:00"), T0);
  assert.ok(Number.isNaN(dateUtc(null)));
});

/** Le service worker, exécuté pour de vrai dans une machine virtuelle. */
function chargerSw({ fetch: fetchSw = () => {} } = {}) {
  const handlers = {};
  const notifs = [];
  const ouverts = [];
  const messages = [];
  let fenetres = [];
  const self = {
    addEventListener: (t, f) => { handlers[t] = f; },
    skipWaiting() {},
    // L'affichage se TERMINE plus tard, comme dans un navigateur : un accusé parti
    // avant la fin de l'affichage se voit (⑫ ter).
    registration: { showNotification: (titre, opts) => new Promise((r) => setTimeout(() => { notifs.push({ titre, opts }); r(); }, 0)) },
    clients: {
      matchAll: () => Promise.resolve(fenetres),
      openWindow: (u) => { ouverts.push(u); return Promise.resolve(); },
      claim: () => Promise.resolve(),
    },
  };
  // Les pauses du service worker (second essai d'un accusé) passent sans attendre.
  vm.runInNewContext(fs.readFileSync("sw.js", "utf8"), { self, caches: {}, fetch: fetchSw, URL, console, Response: class {}, crypto: globalThis.crypto, setTimeout: (f) => setTimeout(f, 0) });
  const attendre = async (f) => { let p; f({ waitUntil: (x) => { p = x; } }); await p; };
  return {
    handlers, notifs, ouverts, messages,
    avecFenetre() { fenetres = [{ focus: () => Promise.resolve(), postMessage: (m) => messages.push(m) }]; },
    async push(data) { await attendre((ext) => handlers.push({ ...ext, data: { json: () => data } })); },
    async clic(notification, action = "") { await attendre((ext) => handlers.notificationclick({ ...ext, action, notification: { close() {}, ...notification } })); },
  };
}

const ACK = { u: "https://njkiyoklssvefstljemx.supabase.co", k: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2ln" };
const PID1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PID2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("⑫ ter service worker : APRÈS l'affichage, un accusé SANS CONTENU à l'adresse portée — jamais ailleurs, et l'affichage ne dépend pas de lui", async () => {
  // Réinjections éprouvées : accuser avant l'affichage → l'ordre rougit ; ne
  // plus valider l'adresse → « aucune requête hors forme » rougit.
  const appels = [];
  let sw;
  sw = chargerSw({ fetch: (u, o) => { appels.push({ u, o, affichees: sw.notifs.length }); return Promise.resolve({ ok: true }); } });
  await sw.push({ type: "pilotage", titre: "Problème", texte: "Le voyant passe au rouge", pid: PID1, ack: ACK });
  assert.equal(sw.notifs.length, 1);
  assert.equal(appels.length, 1);
  assert.equal(appels[0].affichees, 1, "la notification est affichée AVANT l'accusé");
  assert.equal(appels[0].u, ACK.u + "/rest/v1/telemetry_events");
  assert.equal(appels[0].o.method, "POST");
  assert.equal(appels[0].o.headers.apikey, ACK.k);
  const corps = JSON.parse(appels[0].o.body);
  assert.equal(corps.length, 1);
  assert.deepEqual({ type: corps[0].type, action: corps[0].action, status: corps[0].status, meta: corps[0].meta },
    { type: "push", action: "recu", status: "ok", meta: { pid: PID1, genre: "pilotage" } });
  assert.match(corps[0].event_id, /^[0-9a-f]{16}$/);
  assert.ok(!/Problème|rouge/.test(appels[0].o.body), "rien du texte de la notification dans l'accusé");
  assert.equal(corps[0].user_id, undefined, "aucune identité : la RLS l'admet nulle, et l'accusé n'en a pas besoin");

  await sw.push({ type: "rappel", titre: "Rando", texte: "x", eventId: "ev_1", pid: PID2, ack: ACK });
  assert.equal(JSON.parse(appels[1].o.body)[0].meta.genre, "rappel");

  // Adresse hors forme, pid absent ou hors forme : AUCUNE requête, la notification s'affiche quand même.
  for (const ack of [{ ...ACK, u: "https://evil.example" }, { ...ACK, u: ACK.u + ".evil.example" }, { ...ACK, u: ACK.u + "/x" }, { ...ACK, k: "pas une clé" }, null, "chaine"]) {
    await sw.push({ type: "pilotage", titre: "x", pid: PID1, ack });
  }
  await sw.push({ type: "pilotage", titre: "x", ack: ACK });
  await sw.push({ type: "pilotage", titre: "x", pid: "pas-un-pid", ack: ACK });
  assert.equal(appels.length, 2, "aucune requête hors forme");
  assert.equal(sw.notifs.length, 2 + 8, "chaque notification affichée");

  // Un réseau en panne n'empêche ni l'affichage, ni la fin de l'événement (la promesse se résout).
  const enPanne = chargerSw({ fetch: () => Promise.reject(new Error("hors ligne")) });
  await enPanne.push({ type: "pilotage", titre: "x", pid: PID1, ack: ACK });
  assert.equal(enPanne.notifs.length, 1);
  const leve = chargerSw({ fetch: () => { throw new Error("fetch indisponible"); } });
  await leve.push({ type: "rappel", titre: "x", eventId: "ev_1", pid: PID1, ack: ACK });
  assert.equal(leve.notifs.length, 1);

  // Refus de débit (429) ou coupure : UN second essai, jamais deux.
  for (const premier of [() => Promise.resolve({ status: 429 }), () => Promise.reject(new Error("coupure"))]) {
    const essais = [];
    const r = chargerSw({ fetch: () => { essais.push(1); return essais.length === 1 ? premier() : Promise.resolve({ status: 201 }); } });
    await r.push({ type: "pilotage", titre: "x", pid: PID1, ack: ACK });
    assert.equal(essais.length, 2, "un second essai");
  }
  const toujours = [];
  const r429 = chargerSw({ fetch: () => { toujours.push(1); return Promise.resolve({ status: 429 }); } });
  await r429.push({ type: "pilotage", titre: "x", pid: PID1, ack: ACK });
  assert.equal(toujours.length, 2, "jamais un troisième : l'événement push ne vit pas indéfiniment");
  const ok = [];
  const r201 = chargerSw({ fetch: () => { ok.push(1); return Promise.resolve({ status: 201 }); } });
  await r201.push({ type: "pilotage", titre: "x", pid: PID1, ack: ACK });
  assert.equal(ok.length, 1, "un accusé accepté ne repart pas");
});

// La clé PUBLIABLE (2026-11-07) : mesuré, le premier essai est parti « sans_adresse ».
// Elle ne part qu'en `apikey` — en Bearer, la plateforme la lit comme un JWT et refuse.
// Réinjection éprouvée : la publiable en Bearer → ce test rougit.
test("⑫ quater service worker : une clé PUBLIABLE accuse en `apikey` seulement ; un JWT, en `apikey` et en `Authorization`", async () => {
  const appels = [];
  const sw = chargerSw({ fetch: (u, o) => { appels.push(o); return Promise.resolve({ status: 201 }); } });
  const PUB = { u: ACK.u, k: "sb_publishable_Abc123_def-456XYZ" };
  await sw.push({ type: "pilotage", titre: "Essai", pid: PID1, ack: PUB });
  assert.equal(appels.length, 1);
  assert.equal(appels[0].headers.apikey, PUB.k);
  assert.equal(appels[0].headers.Authorization, undefined, "jamais la publiable en Bearer");
  await sw.push({ type: "pilotage", titre: "Essai", pid: PID1, ack: ACK });
  assert.equal(appels[1].headers.Authorization, "Bearer " + ACK.k);
  // Une publiable hors forme n'est jamais appelée.
  for (const k of ["sb_publishable_", "sb_publishable_court", "sb_secret_Abc123_def-456XYZ", "sb_publishable_Abc123 espace"]) await sw.push({ type: "pilotage", titre: "x", pid: PID1, ack: { u: ACK.u, k } });
  assert.equal(appels.length, 2);
  assert.equal(sw.notifs.length, 6, "l'affichage ne dépend jamais de l'accusé");
});

// Les APPELS (2026-11-07, _shared/appels.js) : un appel sur dix porte un pid.
// Réinjections éprouvées : accuser l'appel AVANT l'affichage → l'ordre rougit ;
// l'accuser sous le genre « rappel » → rougit ; ne plus l'accuser
// → rougit ; glisser le pid dans les données du tap → rougit ; glisser le nom de
// l'appelant dans l'accusé → rougit.
test("⑫ quinquies service worker : un APPEL mesuré s'affiche comme avant (« t'appelle », Répondre / Refuser, sonnerie persistante, données du tap), PUIS s'accuse « appel », sans rien de l'appelant ; sans pid, aucun accusé ; « Répondre » ouvre l'appel comme avant", async () => {
  const appels = [];
  let sw;
  sw = chargerSw({ fetch: (u, o) => { appels.push({ u, o, affichees: sw.notifs.length }); return Promise.resolve({ status: 201 }); } });
  const appel = { type: "call", callId: "c1", kind: "video", from: A, name: "Léa", emoji: "🎸" };
  await sw.push({ ...appel, pid: PID1, ack: ACK });
  assert.equal(sw.notifs.length, 1);
  const n = sw.notifs[0];
  assert.equal(n.titre, "🎸 Léa t'appelle");
  assert.equal(n.opts.body, "Appel vidéo entrant — touche pour répondre");
  assert.equal(n.opts.tag, "passio-call-c1");
  assert.equal(n.opts.requireInteraction, true, "la sonnerie reste à l'écran");
  assert.equal(n.opts.renotify, true);
  // (Objets nés dans la machine virtuelle : autre royaume, on compare leur JSON.)
  assert.deepEqual(JSON.parse(JSON.stringify(n.opts.actions)), [{ action: "answer", title: "✅ Répondre" }, { action: "decline", title: "📵 Refuser" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(n.opts.data)), { callId: "c1", from: A, kind: "video", name: "Léa", emoji: "🎸" }, "le tap ne porte ni pid ni adresse");
  assert.equal(appels.length, 1);
  assert.equal(appels[0].affichees, 1, "la sonnerie est affichée AVANT l'accusé");
  assert.equal(appels[0].u, ACK.u + "/rest/v1/telemetry_events");
  const corps = JSON.parse(appels[0].o.body);
  assert.deepEqual({ type: corps[0].type, action: corps[0].action, meta: corps[0].meta }, { type: "push", action: "recu", meta: { pid: PID1, genre: "appel" } });
  // Jugé SANS ses champs aléatoires : `event_id` (16 hexadécimaux) contient « c1 »
  // une fois sur 16 — la première version de ce test échouait au hasard (revue du 2026-11-07).
  const { event_id: idAccuse, client_ts: _ts, ...stable } = corps[0];
  assert.match(idAccuse, /^[0-9a-f]{16}$/);
  assert.deepEqual(Object.keys(stable).sort(), ["action", "meta", "status", "type"], "rien d'autre ne part");
  assert.ok(!/Léa|🎸|c1|video|1111/.test(JSON.stringify(stable)), "rien de l'appelant dans l'accusé");
  assert.ok(!/Léa|🎸|video/.test(appels[0].o.body), "ni nulle part dans le corps envoyé");
  assert.equal(corps[0].user_id, undefined, "aucune identité");
  // La clé publiable accuse en `apikey` seulement, comme pour les autres genres.
  await sw.push({ ...appel, callId: "c2", pid: PID2, ack: { u: ACK.u, k: "sb_publishable_Abc123_def-456XYZ" } });
  assert.equal(appels[1].o.headers.Authorization, undefined);
  assert.equal(JSON.parse(appels[1].o.body)[0].meta.genre, "appel");
  // Un appel NON tiré (sans pid) : la sonnerie, et rien d'autre.
  await sw.push(appel);
  assert.equal(sw.notifs.length, 3);
  assert.equal(appels.length, 2, "un appel non mesuré ne dépose rien");
  // Un réseau en panne ne retire pas la sonnerie.
  const enPanne = chargerSw({ fetch: () => Promise.reject(new Error("hors ligne")) });
  await enPanne.push({ ...appel, pid: PID1, ack: ACK });
  assert.equal(enPanne.notifs.length, 1);
  // « Répondre », application fermée : l'écran d'appel s'ouvre, comme avant ; « Refuser » n'ouvre rien.
  await sw.clic({ tag: "passio-call-c1", data: n.opts.data }, "answer");
  assert.deepEqual(sw.ouverts, ["./?call=c1&from=" + A + "&kind=video&cname=L%C3%A9a&cemoji=" + encodeURIComponent("🎸")]);
  await sw.clic({ tag: "passio-call-c1", data: n.opts.data }, "decline");
  assert.equal(sw.ouverts.length, 1);
});

test("⑨ sexies l'accusé côté envoi : un pid ALÉATOIRE par rappel et l'adresse ; seuls les rappels ACCEPTÉS sont notés envoyés ; sans adresse, ni pid ni note", async () => {
  const subs = [
    { endpoint: "https://fcm.googleapis.com/fcm/send/a", user_id: A, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/a" } },
    { endpoint: "https://fcm.googleapis.com/fcm/send/b", user_id: B, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/b" } },
  ];
  const admin = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A), inscrit(B)], subs });
  const charges = [];
  const envoyer = async (s, charge) => {
    charges.push({ fin: s.endpoint, c: JSON.parse(charge) });
    if (s.endpoint === "https://fcm.googleapis.com/fcm/send/b") { const e = new Error("refus"); e.statusCode = 500; throw e; }
  };
  await envoyerRappels(admin, envoyer, T0, S, ACK);
  assert.equal(charges.length, 2);
  for (const { c } of charges) {
    assert.match(c.pid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual(c.ack, ACK);
  }
  assert.notEqual(charges[0].c.pid, charges[1].c.pid, "un pid par rappel : jamais dérivé de la clé");
  const premiere = (j) => [].concat(j.rows)[0] || {};
  const notes = admin.journal.filter((j) => j.op === "insert" && premiere(j).event === "push_envoye");
  assert.equal(notes.length, 1, "UNE note par tour");
  const ligne = premiere(notes[0]);
  assert.equal(ligne.user_id, MARQUE_UID);
  assert.deepEqual(ligne.properties, { genre: "rappel", pids: [charges.find((x) => x.fin === "https://fcm.googleapis.com/fcm/send/a").c.pid], acceptes: 1 }, "B : refus du service de notification → pas noté envoyé");
  assert.ok(!JSON.stringify(ligne).includes("Rando"), "aucun texte dans la note");

  // Sans adresse d'accusé : la charge d'avant, et aucune note.
  const admin2 = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A)], subs: [subs[0]] });
  const c2 = [];
  await envoyerRappels(admin2, async (_s, charge) => { c2.push(JSON.parse(charge)); }, T0, S);
  assert.deepEqual(Object.keys(c2[0]).sort(), ["eventId", "texte", "titre", "type"]);
  assert.equal(admin2.journal.some((j) => j.op === "insert" && premiere(j).event === "push_envoye"), false);
});

test("⑫ service worker : la push « rappel » s'affiche et le TAP ouvre l'activité ; un identifiant douteux n'ouvre que l'accueil", async () => {
  const sw = chargerSw();
  await sw.push({ type: "rappel", titre: "Rando", texte: "Ça commence dans 1 h", eventId: "ev_1" });
  assert.equal(sw.notifs[0].titre, "⏰ Rando");
  assert.equal(sw.notifs[0].opts.tag, "passio-rappel-ev_1", "une notification par activité : H-2 remplace la veille");
  assert.equal(sw.notifs[0].opts.data.url, "./#irl-event-ev_1");
  await sw.push({ type: "rappel", titre: "X", eventId: "javascript:alert(1)" });
  assert.equal(sw.notifs[1].opts.data.url, "./");

  // Appli fermée : ouverture SUR l'activité.
  await sw.clic({ tag: "passio-rappel-ev_1", data: { url: "./#irl-event-ev_1" } });
  assert.deepEqual(sw.ouverts, ["./#irl-event-ev_1"]);
  // Une URL qui n'est pas une des deux formes admises n'est jamais ouverte telle quelle.
  await sw.clic({ tag: "passio-rappel-x", data: { url: "https://ailleurs.example/" } });
  assert.equal(sw.ouverts[1], "./");
  await sw.clic({ tag: "passio-rappel-x", data: { url: "./#irl-event-a/../b\"><i" } });
  assert.equal(sw.ouverts[2], "./", "un identifiant hors forme n'entre jamais dans l'URL ouverte");
  sw.ouverts.splice(2, 1);
  // Le digest (app-07, tag irl-digest) n'est plus pris pour un APPEL.
  await sw.clic({ tag: "irl-digest", data: { url: "./#irl-event-e2" } });
  assert.equal(sw.ouverts[2], "./#irl-event-e2");
  assert.ok(sw.ouverts.every((u) => !u.includes("?call=")));

  // Appli ouverte : focus + l'activité confiée à la page.
  sw.avecFenetre();
  await sw.clic({ tag: "passio-rappel-ev_1", data: { url: "./#irl-event-ev_1" } });
  // (Objets nés dans la machine virtuelle : autre royaume, on compare leur JSON.)
  assert.deepEqual(JSON.parse(JSON.stringify(sw.messages)), [{ type: "OUVRIR_ACTIVITE", id: "ev_1" }]);
  // Un appel garde son propre chemin.
  await sw.clic({ tag: "passio-call-1", data: { callId: "c1", from: A, kind: "voice" } });
  assert.equal(sw.messages[1].type, "INCOMING_CALL");
});

test("⑬ câblage : la veille lance les rappels sans pouvoir tomber avec eux ; la page route OUVRIR_ACTIVITE ; la cloche rend le rappel cliquable", () => {
  const idx = fs.readFileSync("supabase/functions/pilotage/index.ts", "utf8");
  const veille = idx.slice(idx.indexOf("async function veille("), idx.indexOf("async function lireEtatMemorise("));
  assert.match(veille, /Promise\.allSettled\(\[[^\]]*rappels\(admin\)[^\]]*\]\)/, "les rappels tournent DANS l'allSettled de la veille");
  assert.match(veille, /rappels_echec/, "un échec laisse une trace");
  const debut = veille.lastIndexOf("return json(");
  const reponse = veille.slice(debut, veille.indexOf("\n", debut));
  assert.doesNotMatch(reponse, /rap\b|rappels/, "la réponse SANS compte ne livre aucun compteur de rappels");
  assert.match(idx, /envoyerRappels\(admin,/);
  const app07 = fs.readFileSync("js/app-07-ia-explore-irl.js", "utf8");
  assert.match(app07, /d\.type === "OUVRIR_ACTIVITE"\) _ouvrirActiviteDepuisNotification\(d\.id\)/);
  assert.match(app07, /kind: "event_reminder", refId: e\.id/);
  const prereq = JSON.parse(fs.readFileSync(".passio/deploiement/prerequis-fonctions.json", "utf8"));
  for (const o of ["column:public.events.date_at", "column:public.event_attendees.rsvp", "table:public.push_subscriptions"]) {
    assert.ok(prereq.fonctions.pilotage.objets.includes(o), o);
  }
});

test("audit 2026-11-06 : un abonnement hors des services push connus n'est pas contacté, et sa ligne reste", async () => {
  const subs = [
    { endpoint: "https://collecteur.exemple.test/a", user_id: A, subscription: { endpoint: "https://collecteur.exemple.test/a" } },
    { endpoint: "https://fcm.googleapis.com/fcm/send/a2", user_id: A, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/a2" } },
  ];
  const admin = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A)], subs });
  const contactes = [];
  const r = await envoyerRappels(admin, async (sub) => { contactes.push(sub.endpoint); }, T0, S);
  assert.deepEqual(contactes, ["https://fcm.googleapis.com/fcm/send/a2"]);
  assert.equal(r.envoyes, 1);
  assert.equal(admin.journal.some((j) => j.op === "delete"), false);
});

test("audit 2026-11-06 : le préfixe des marques est le même des deux côtés, sinon la purge ne les trouve plus", async () => {
  const { MARQUE_RAPPELS } = await import("../../supabase/functions/_shared/purge-compte.js");
  assert.equal(marqueUid("abc"), MARQUE_RAPPELS + "abc");
});
