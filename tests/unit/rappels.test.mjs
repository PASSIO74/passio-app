// Rappels d'activité par push, même appli fermée (2026-10-05) — le cœur PUR
// (`supabase/functions/_shared/rappels.js`, le fichier même que Deno déploie),
// son enveloppe contre un faux PostgREST, le service worker exécuté dans une
// machine virtuelle, et le câblage à la source.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { idGeste } from "../../supabase/functions/_shared/autonomie.js";
import {
  palierDu, rappelsDus, envoyerRappels, texteSur, jourRelatif, duree, dateUtc, cleRappel,
  MARQUE_EVENEMENT, MAX_PAR_TOUR, MAX_PAR_COMPTE, marqueUid,
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
      insert(rows) { journal.push({ op: "insert", nom, rows, options: null }); q._op = "insert"; q._rows = rows; return q; },
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
    { endpoint: "https://push/a1", user_id: A, subscription: { endpoint: "https://push/a1" } },
    { endpoint: "https://push/a2", user_id: A, subscription: { endpoint: "https://push/a2" } },
  ];
  const admin = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A), inscrit(B)], subs });
  const envois = [];
  const envoyer = async (sub, charge, opts) => {
    envois.push({ sub, charge: JSON.parse(charge), opts, marqueDeja: admin.journal.some((j) => j.op === "insert") });
    if (sub.endpoint === "https://push/a2") { const e = new Error("parti"); e.statusCode = 410; throw e; }
  };
  const r = await envoyerRappels(admin, envoyer, T0, S);
  assert.deepEqual(r, { activites: 1, dus: 2, envoyes: 1, sansAppareil: 1, expires: 1, dejaPris: 0 }, "B n'a aucun appareil");
  assert.ok(envois.length === 2 && envois.every((e) => e.marqueDeja), "aucune push ne part avant la marque");
  assert.deepEqual(envois[0].charge, { type: "rappel", titre: "Rando au Salève", texte: "Ça commence dans 1 h (à 15:00) · Annecy", eventId: "ev_1" });
  assert.deepEqual(envois[0].opts, { TTL: 3600, urgency: "high" });
  const marque = admin.journal.find((j) => j.op === "insert");
  assert.deepEqual(marque.rows.map((x) => [x.user_id, x.event, x.properties.cle]).sort(),
    [[marqueUid(A), MARQUE_EVENEMENT, cleRappel("ev_1", "h2", A)], [marqueUid(B), MARQUE_EVENEMENT, cleRappel("ev_1", "h2", B)]].sort());
  assert.deepEqual(marque.options, { onConflict: "id", ignoreDuplicates: true }, "ON CONFLICT (id) DO NOTHING : seul le tour qui écrit la marque envoie");
  for (const x of marque.rows) assert.equal(x.id, await idGeste(`rappel:${x.properties.cle}:${T0 + H}`, S), "l'identifiant de la marque est celui de sa CLÉ et de son DÉPART");
  assert.deepEqual(admin.journal.find((j) => j.op === "delete"), { op: "delete", nom: "push_subscriptions", valeurs: ["https://push/a2"] });

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
    { endpoint: "https://push/a", user_id: A, subscription: { endpoint: "https://push/a" } },
    { endpoint: "https://push/b", user_id: B, subscription: { endpoint: "https://push/b" } },
  ];
  const admin = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A), inscrit(B)], subs, rendezVous: 2 });
  const envois = [];
  const [r1, r2] = await Promise.all([
    envoyerRappels(admin, async (s) => { envois.push(s.endpoint); }, T0, S),
    envoyerRappels(admin, async (s) => { envois.push(s.endpoint); }, T0 + 30, S),
  ]);
  assert.deepEqual(envois.sort(), ["https://push/a", "https://push/b"], "une push par compte, pas deux");
  assert.equal(r1.dus + r2.dus, 2);
  assert.deepEqual([r1.dejaPris, r2.dejaPris].sort(), [0, 2], "le second tour a trouvé ses marques déjà prises — il n'envoie rien");
  // Et le tour suivant lit les marques écrites : rien ne repart.
  assert.deepEqual(await envoyerRappels(fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A), inscrit(B)], subs,
    marques: admin.journal.filter((j) => j.op === "insert" && j.nom === "analytics_events").flatMap((j) => j.rows) }), async () => { throw new Error("jamais"); }, T0 + 5 * 60e3, S),
  { activites: 1, dus: 0, envoyes: 0 });
});

test("⑨ ter conflit PARTIEL : la marque de A vient d'être prise par un tour concurrent — seul B part", async () => {
  const subs = [
    { endpoint: "https://push/a", user_id: A, subscription: { endpoint: "https://push/a" } },
    { endpoint: "https://push/b", user_id: B, subscription: { endpoint: "https://push/b" } },
  ];
  const admin = fauxAdmin({ events: [activite(T0 + H, { author_id: null })], attendees: [inscrit(A), inscrit(B)], subs,
    idsPris: [await idGeste(`rappel:${cleRappel("ev_1", "h2", A)}:${T0 + H}`, S)] });
  const envois = [];
  const r = await envoyerRappels(admin, async (s) => { envois.push(s.endpoint); }, T0, S);
  assert.deepEqual(envois, ["https://push/b"], "A a déjà son rappel, envoyé par l'autre tour");
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
  const subs = [{ endpoint: "https://push/a", user_id: A, subscription: { endpoint: "https://push/a" } }];
  const admin = fauxAdmin({ events: [ev], attendees: [inscrit(A, "going", T0 - 10 * 864e5)], subs, horloge: () => new Date(maintenant).toISOString() });
  const envois = [];
  const envoyer = async (s) => { envois.push(s.endpoint); };
  assert.equal((await envoyerRappels(admin, envoyer, maintenant, S)).envoyes, 1, "le rappel de la date d'origine");
  ev.date_at = naif(T0 + 7 * 864e5 + H);
  maintenant = T0 + 7 * 864e5;
  const r = await envoyerRappels(admin, envoyer, maintenant, S);
  assert.deepEqual(envois, ["https://push/a", "https://push/a"], "la date reportée a son propre rappel");
  assert.equal(r.dejaPris, 0);
});

test("⑩ quinquies un compte qui organise 121 activités à la même heure ne coupe PLUS les rappels de tout le monde (trg_rate_limit : 120 lignes par minute et par user_id)", async () => {
  // Réinjection éprouvée : sans MAX_PAR_COMPTE, le lot de marques lève sur la
  // limite et AUCUN rappel ne part — pour personne, à chaque tour.
  const evs = [];
  for (let i = 0; i < 121; i++) evs.push(activite(T0 + H, { id: "ev_" + String(i).padStart(3, "0") }));
  const subs = [{ endpoint: "https://push/b", user_id: B, subscription: { endpoint: "https://push/b" } }];
  const admin = fauxAdmin({ events: evs, attendees: [inscrit(B, "going", T0 - 3 * 864e5, "ev_000")], subs });
  const envois = [];
  const r = await envoyerRappels(admin, async (s) => { envois.push(s.endpoint); }, T0, S);
  assert.deepEqual(envois, ["https://push/b"], "B reçoit son rappel malgré l'organisateur aux 121 activités");
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
function chargerSw() {
  const handlers = {};
  const notifs = [];
  const ouverts = [];
  const messages = [];
  let fenetres = [];
  const self = {
    addEventListener: (t, f) => { handlers[t] = f; },
    skipWaiting() {},
    registration: { showNotification: (titre, opts) => { notifs.push({ titre, opts }); return Promise.resolve(); } },
    clients: {
      matchAll: () => Promise.resolve(fenetres),
      openWindow: (u) => { ouverts.push(u); return Promise.resolve(); },
      claim: () => Promise.resolve(),
    },
  };
  vm.runInNewContext(fs.readFileSync("sw.js", "utf8"), { self, caches: {}, fetch: () => {}, URL, console, Response: class {} });
  const attendre = async (f) => { let p; f({ waitUntil: (x) => { p = x; } }); await p; };
  return {
    handlers, notifs, ouverts, messages,
    avecFenetre() { fenetres = [{ focus: () => Promise.resolve(), postMessage: (m) => messages.push(m) }]; },
    async push(data) { await attendre((ext) => handlers.push({ ...ext, data: { json: () => data } })); },
    async clic(notification, action = "") { await attendre((ext) => handlers.notificationclick({ ...ext, action, notification: { close() {}, ...notification } })); },
  };
}

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
