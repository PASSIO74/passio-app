// ═══════════════════════════════════════════════════════════════════════════
// VILLAGE 100 — les verdicts et les gardes de la simulation hybride, sans réseau.
//
// Ce qui décide d'un contrôle EXIGÉ (capacité tenue, cascade dans l'ordre,
// notification unique) vit dans scripts/lib/village100.mjs : un verdict faux
// rendrait la séance verte sur un serveur cassé. Chaque verdict est donc
// éprouvé ici sur son cas juste ET sur le défaut qu'il doit attraper.
// Les gardes (staging seul, jamais en CI, purge par identifiant) aussi.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as L from "../../scripts/lib/village100.mjs";
import { gardesCible, lotsPurge, motifRefusRsvp, motifServeurRsvp, TABLES_PURGE, Manifeste, purgerSeance, purgeComplete } from "../../scripts/lib/village100-figurants.mjs";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("le plan : 100 personnes, 20 places, 3 places pour 30 coureurs, 80 en attente, 99 prévenus", () => {
  const p = L.planVillage();
  const a = p.attendus;
  assert.equal(L.NB_FIGURANTS + L.YEUX.length, 100);
  assert.equal(a.venantsAvantCourse, 17);
  assert.equal(a.placesCourse, 3);
  assert.equal(a.coureurs, 30);
  assert.equal(a.refusCourse, 27);
  assert.equal(a.attente, 80);
  assert.equal(a.venants + a.attente, 100);
  assert.equal(a.likes, 100);
  assert.equal(a.likesNotifies, 99);
  assert.equal(a.commentaires, 50);
  assert.equal(a.prevenusAnnulation, 99);
  // Les rôles ne se chevauchent pas (sauf désistants ⊂ précoces, voulu).
  const roles = [...p.precoces, ...p.course, ...p.tardifs];
  assert.equal(new Set(roles).size, L.NB_FIGURANTS);
  assert.ok(p.desistants.every((k) => p.precoces.includes(k)));
  assert.throws(() => L.planVillage(95), /PLAN_FIGE/);
});

test("la cadence de connexion reste sous 134 / 5 min, yeux compris", () => {
  assert.ok(L.connexionsParFenetre(L.DELAI_CONNEXION_MS) <= L.PLAFOND_CONNEXIONS_5_MIN);
  assert.ok(L.connexionsParFenetre(2250) > L.PLAFOND_CONNEXIONS_5_MIN, "la cadence du banc seul ne laisse pas de place aux yeux");
});

test("campagne et adresses : la grammaire du banc de charge, domaine jetable", () => {
  const c = L.campagneVillage100(1763830000000, "a1b2c3d4");
  assert.match(c, /^capacite_\d{13}_[a-f0-9]{8}$/);
  assert.match(L.emailFigurant(c, 95), /^capacite_\d{13}_[a-f0-9]{8}_95@passio-capacite\.test$/);
  assert.throws(() => L.emailFigurant(c, 96), /FIGURANT_HORS_PLAN/);
  // Les yeux : même domaine, index 96 à 99 — JAMAIS @passio-e2e.test, que le
  // teardown de la CI purge par motif pendant la séance.
  const yeux = L.YEUX.map((_, i) => L.emailOeil(c, i));
  assert.deepEqual(yeux.map((e) => e.split("_").pop()), ["96@passio-capacite.test", "97@passio-capacite.test", "98@passio-capacite.test", "99@passio-capacite.test"]);
  assert.ok(yeux.every((e) => !/passio-e2e\.test/.test(e)));
  assert.throws(() => L.emailOeil(c, 4), /OEIL_HORS_PLAN/);
});

test("microsDe : la microseconde départage, quel que soit le format rendu", () => {
  assert.ok(L.microsDe("2026-11-22T17:00:00.123401+00:00") > L.microsDe("2026-11-22T17:00:00.1234+00:00"));
  assert.equal(L.microsDe("2026-11-22T17:00:00Z"), L.microsDe("2026-11-22T18:00:00+01:00"));
  assert.equal(L.microsDe("2026-11-22T17:00:00.5"), L.microsDe("2026-11-22T17:00:00.500000+00:00"));
  assert.throws(() => L.microsDe("hier"), /HORODATAGE_ILLISIBLE/);
});

test("ordreAttente : created_at à la microseconde, puis user_id — l'ordre de promouvoir_attente", () => {
  const l = [
    { user_id: "c", rsvp: "waitlist", created_at: "2026-11-22T17:00:00.000002+00:00" },
    { user_id: "b", rsvp: "waitlist", created_at: "2026-11-22T17:00:00.000001+00:00" },
    { user_id: "a", rsvp: "waitlist", created_at: "2026-11-22T17:00:00.000002+00:00" },
    { user_id: "z", rsvp: "going", created_at: "2026-11-22T16:00:00+00:00" },
  ];
  assert.deepEqual(L.ordreAttente(l), ["b", "a", "c"]);
});

const lignes = (going, waitlist = 0) => [
  ...Array.from({ length: going }, (_, i) => ({ user_id: `g${i}`, rsvp: "going" })),
  ...Array.from({ length: waitlist }, (_, i) => ({ user_id: `w${i}`, rsvp: "waitlist" })),
];

test("verdictCourse : 3 gagnants sur 30 est vert ; 21 venants ou une erreur 500 sont rouges", () => {
  const tent = (g, c, autres = []) => [...Array(g).fill({ issue: "going" }), ...Array(c).fill({ issue: "complete" }), ...autres];
  assert.equal(L.verdictCourse({ lignesApres: lignes(20), tentatives: tent(3, 27), places: 20, placesCourse: 3 }).ok, true);
  // Défaut réinjecté : le serveur laisse passer un quatrième.
  assert.equal(L.verdictCourse({ lignesApres: lignes(21), tentatives: tent(4, 26), places: 20, placesCourse: 3 }).ok, false);
  // Défaut réinjecté : un refus qui n'est pas « complète » (panne, verrou).
  const v = L.verdictCourse({ lignesApres: lignes(20), tentatives: tent(3, 26, [{ issue: "HTTP_500" }]), places: 20, placesCourse: 3 });
  assert.equal(v.ok, false);
  assert.deepEqual(v.motifs, { HTTP_500: 1 });
  // Défaut réinjecté : la base sous-remplit (2 gagnants, une place perdue).
  assert.equal(L.verdictCourse({ lignesApres: lignes(19), tentatives: tent(2, 28), places: 20, placesCourse: 3 }).ok, false);
});

test("verdictCascade : les 10 premiers promus, notifiés une fois, dans l'ordre", () => {
  const attente = Array.from({ length: 12 }, (_, i) => `w${i}`);
  const apres = [...lignes(10), ...attente.slice(0, 10).map((u) => ({ user_id: u, rsvp: "going" })), ...attente.slice(10).map((u) => ({ user_id: u, rsvp: "waitlist" }))];
  const ts = (i) => `2026-11-22T17:00:00.${String(100000 + i).padStart(6, "0")}+00:00`;
  const notifs = attente.slice(0, 10).map((u, i) => ({ user_id: u, created_at: ts(i) }));
  const ok = L.verdictCascade({ attenteAvant: attente, lignesApres: apres, notifs, desistements: 10, places: 20 });
  assert.equal(ok.ok, true);
  assert.equal(ok.ordreRespecte, true);

  // Défaut réinjecté : le 11ᵉ promu à la place du 10ᵉ (hors rang).
  const horsRang = apres.map((l) => (l.user_id === "w9" ? { ...l, rsvp: "waitlist" } : l.user_id === "w10" ? { ...l, rsvp: "going" } : l));
  const v1 = L.verdictCascade({ attenteAvant: attente, lignesApres: horsRang, notifs: notifs.map((n) => (n.user_id === "w9" ? { ...n, user_id: "w10" } : n)), desistements: 10, places: 20 });
  assert.equal(v1.ok, false);
  assert.equal(v1.horsRang, 1);
  assert.equal(v1.manquants, 1);

  // Défaut réinjecté : un promu notifié deux fois.
  const v2 = L.verdictCascade({ attenteAvant: attente, lignesApres: apres, notifs: [...notifs, { user_id: "w3", created_at: ts(20) }], desistements: 10, places: 20 });
  assert.equal(v2.ok, false);
  assert.equal(v2.doublons, 1);

  // Défaut réinjecté : un promu jamais prévenu.
  const v3 = L.verdictCascade({ attenteAvant: attente, lignesApres: apres, notifs: notifs.slice(1), desistements: 10, places: 20 });
  assert.equal(v3.ok, false);
  assert.equal(v3.promusSansNotif, 1);

  // Défaut réinjecté : 21 venants (une promotion de trop).
  const v4 = L.verdictCascade({ attenteAvant: attente, lignesApres: apres.map((l) => (l.user_id === "w10" ? { ...l, rsvp: "going" } : l)), notifs, desistements: 10, places: 20 });
  assert.equal(v4.ok, false);

  // L'ordre des notifications : une inversion se voit, sans rendre la cascade rouge.
  const inv = notifs.map((n, i) => ({ ...n, created_at: ts(i === 0 ? 5 : i === 5 ? 0 : i) }));
  const v5 = L.verdictCascade({ attenteAvant: attente, lignesApres: apres, notifs: inv, desistements: 10, places: 20 });
  assert.equal(v5.ok, true);
  assert.equal(v5.ordreRespecte, false);
  assert.ok(v5.inversions > 0);
});

test("doublonsNotifs et jugementSpam", () => {
  const n = (u, f, k, r) => ({ user_id: u, from_id: f, kind: k, ref_id: r });
  const d = L.doublonsNotifs([n("a", "b", "like", "p"), n("a", "b", "like", "p"), n("a", "c", "like", "p"), n("a", "b", "comment", "p")]);
  assert.equal(d.doublons, 1);
  assert.deepEqual(d.parGenre, { like: 3, comment: 1 });
  assert.equal(L.jugementSpam({ lignesAffichees: 29, notifsActivite: 29 }).spam, true);
  assert.equal(L.jugementSpam({ lignesAffichees: 3, notifsActivite: 29 }).spam, false);
  assert.equal(L.jugementSpam({ lignesAffichees: 5, notifsActivite: 5 }).spam, false);
});

test("latences, débit, décalages", () => {
  const l = L.latences([100, 200, 300, 400, 1000]);
  assert.equal(l.n, 5); assert.equal(l.p50, 300); assert.equal(l.p95, 1000); assert.equal(l.max, 1000);
  assert.equal(L.latences([]).n, 0);
  assert.equal(L.picParSeconde([0, 100, 999, 1000, 5000]), 3);
  const d = L.decalages(96, 10000, 7);
  assert.equal(d.length, 96);
  assert.ok(d.every((x) => x >= 0 && x < 10000));
  assert.deepEqual(d, L.decalages(96, 10000, 7), "déterministes pour une graine");
  const h = L.resumeHttp([{ famille: "like", status: 201, ms: 10 }, { famille: "like", status: 429, ms: 5 }, { famille: "x", status: 503, ms: 1 }]);
  assert.equal(h.total429, 1); assert.equal(h.total5xx, 1); assert.equal(h.totalReseau, 0);
  assert.equal(L.resumeHttp([{ famille: "push", status: null, ms: 15000 }]).totalReseau, 1, "une requête sans réponse (délai, coupure) est un échec compté"); assert.deepEqual(h.familles.like.statuts, { 201: 1, 429: 1 });
});

test("rapport : même forme EXIGÉ / OBSERVATION que le village", () => {
  const md = L.rapportMarkdown({ date: "d", cible: "staging", dureeS: 1, campagne: "c", population: { yeux: 4, figurants: 96 },
    controles: [{ acte: "1", code: "E3", libelle: "la course | 3", exige: true, statut: "ÉCHEC", detail: "21 venants" },
      { acte: "1", code: "E10", libelle: "ordre", exige: false, statut: "À REGARDER", detail: "" }],
    personas: [{ nom: "Léa", role: "orga", inscrit: true }], latences: { course: L.latences([1, 2]) }, murs: { sockets: "100" },
    purge: { lignes: 3, comptes: 100, erreurs: [] }, portee: ["p"] });
  assert.match(md, /1 échec\(s\) exigé\(s\) · 1 observation\(s\)/);
  assert.match(md, /\| ❌ \| E3 \| la course \/ 3 \| exigé \| 21 venants \|/);
  assert.match(md, /\| 👀 \| E10 \| ordre \| observation \|/);
  assert.match(md, /## Latences/); assert.match(md, /## Murs de quota du staging/);
});

test("gardes : staging seul, jamais en CI, purge par identifiant seulement", () => {
  const avant = { CI: process.env.CI, GA: process.env.GITHUB_ACTIONS };
  delete process.env.CI; delete process.env.GITHUB_ACTIONS;
  try {
    assert.throws(() => gardesCible("https://njkiyoklssvefstljemx.supabase.co"), /CIBLE_HORS_STAGING/);
    assert.doesNotThrow(() => gardesCible(`https://${L.STAGING_REF}.supabase.co`));
    process.env.CI = "true";
    assert.throws(() => gardesCible(`https://${L.STAGING_REF}.supabase.co`), /EXECUTION_CI_INTERDITE/);
  } finally {
    if (avant.CI === undefined) delete process.env.CI; else process.env.CI = avant.CI;
    if (avant.GA !== undefined) process.env.GITHUB_ACTIONS = avant.GA;
  }
  const u = "0f5c2a3e-1111-4222-8333-944455556666";
  assert.deepEqual(lotsPurge([u, u, "%", "*", "e2e_%@passio-e2e.test"]), [[u]], "aucun motif, aucun doublon");
  assert.equal(lotsPurge(Array.from({ length: 100 }, (_, i) => `0f5c2a3e-1111-4222-8333-${String(i).padStart(12, "0")}`)).length, 3);
  assert.equal(TABLES_PURGE[TABLES_PURGE.length - 1][0], "profiles", "les profils partent en dernier");
});

test("motifRefusRsvp : EXACTEMENT les motifs de `_motifRefusRsvp` (app-08) ; les autres refus ne servent qu'au rapport", () => {
  assert.equal(motifRefusRsvp('{"message":"activite_complete"}'), "complete");
  assert.equal(motifRefusRsvp('{"message":"activite_annulee"}'), "annulee");
  // Le client ne connaît pas ces refus : il tente l'INSERT, le figurant aussi.
  assert.equal(motifRefusRsvp('{"message":"inscriptions_jour_limite"}'), null);
  assert.equal(motifServeurRsvp('{"message":"inscriptions_jour_limite"}'), "inscriptions_jour_limite");
  assert.equal(motifRefusRsvp("autre"), null);
  // Verrou de cohérence : la liste du client, lue dans le code de l'app.
  const app08 = readFileSync(resolve(racine, "js", "app-08-ui-modals-tour.js"), "utf8");
  assert.match(app08, /activite_\(complete\|annulee\|passee\|introuvable\)/, "si le client change ses motifs, le figurant doit suivre");
});

const CAMP = "capacite_1795368939927_ea35bdaa";
const AUTRE = "capacite_1795368939927_00000000";

test("adresses de la séance : exactement `capacite_<campagne>_<n>@passio-capacite.test`, n < 100", () => {
  assert.equal(L.emailDeLaCampagne(`${CAMP}_0@passio-capacite.test`, CAMP), true);
  assert.equal(L.emailDeLaCampagne(`${CAMP}_99@passio-capacite.test`, CAMP), true);
  assert.equal(L.emailDeLaCampagne(`${CAMP}_100@passio-capacite.test`, CAMP), false);
  assert.equal(L.emailDeLaCampagne(`${AUTRE}_3@passio-capacite.test`, CAMP), false, "une autre campagne n'est pas la séance");
  assert.equal(L.emailDeLaCampagne(`e2e_qa_1_abc@passio-e2e.test`, CAMP), false);
  // Un suffixe ajouté au domaine (construit en deux morceaux : le dépôt est public, `audit-pii-depot`).
  assert.equal(L.emailDeLaCampagne(`${CAMP}_3@passio-capacite.test` + ".evil", CAMP), false);
  assert.equal(L.emailDeLaCampagne(`${CAMP}_3@passio-capacite.test`, "capacite_%"), false, "campagne invalide : rien n'est de la séance");
});

test("tableAbsente : seule une TABLE absente est tolérée, jamais une colonne", () => {
  assert.equal(L.tableAbsente('{"message":"Could not find the table \'public.user_passions\' in the schema cache"}'), true);
  assert.equal(L.tableAbsente('relation "public.x" does not exist'), true);
  assert.equal(L.tableAbsente('{"message":"column conversations.created_by does not exist"}'), false);
  assert.equal(L.tableAbsente("HTTP 404"), false);
});

test("comptesAPurger : par adresse exacte, un identifiant étranger est un REFUS", () => {
  const listing = [
    { id: "a", email: `${CAMP}_0@passio-capacite.test` },
    { id: "b", email: `${CAMP}_1@passio-capacite.test` },   // uid jamais rendu : retrouvé par l'adresse
    { id: "x", email: "e2e_qa_1_abc@passio-e2e.test" },     // un compte d'une suite CI
  ];
  const emails = [`${CAMP}_0@passio-capacite.test`, `${CAMP}_1@passio-capacite.test`];
  const ok = L.comptesAPurger({ listing, emails, idsNotes: ["a", "z"], campagne: CAMP });
  assert.deepEqual(ok.ids.sort(), ["a", "b"]);
  assert.deepEqual(ok.aRelire, ["z"]);
  assert.deepEqual(ok.refus, []);
  // Manifeste édité : un uid qui désigne un compte de la CI.
  assert.equal(L.comptesAPurger({ listing, emails, idsNotes: ["x"], campagne: CAMP }).refus.length, 1);
  // Manifeste copié d'une autre campagne : adresses refusées.
  assert.equal(L.comptesAPurger({ listing, emails: [`${AUTRE}_0@passio-capacite.test`], idsNotes: [], campagne: CAMP }).refus.length, 1);
});

test("verrou de séance, ref de la clé, masque de la clé anon, rouges connus", () => {
  assert.equal(L.verrouLibre(null, () => true), true);
  assert.equal(L.verrouLibre({ pid: 42 }, () => true), false, "pid vivant : une séance tourne");
  assert.equal(L.verrouLibre({ pid: 42 }, () => false), true, "pid mort : reliquat");
  const jwt = (o) => "e." + Buffer.from(JSON.stringify(o)).toString("base64url") + ".s";
  assert.equal(L.refDeLaCle(jwt({ ref: L.STAGING_REF, role: "service_role" })), L.STAGING_REF);
  assert.equal(L.refDeLaCle(jwt({ ref: "njkiyoklssvefstljemx" })), "njkiyoklssvefstljemx");
  assert.equal(L.refDeLaCle("illisible"), null);
  assert.equal(L.masquerCle("wss://x/realtime/v1/websocket?apikey=eyJabc.def&vsn=1.0.0 failed"), "wss://x/realtime/v1/websocket?apikey=…&vsn=1.0.0 failed");
  const c = (code, statut) => ({ code, statut });
  assert.equal(L.verdictFinal([c("A3", "ÉCHEC"), c("E3", "OK")]).ok, true);
  const nouveau = L.verdictFinal([c("A3", "ÉCHEC"), c("E3", "ÉCHEC")]);
  assert.equal(nouveau.ok, false); assert.deepEqual(nouveau.nouveaux, ["E3"]);
  const gueri = L.verdictFinal([c("A3", "OK")]);
  assert.equal(gueri.ok, false); assert.deepEqual(gueri.gueris, ["A3"]);
  assert.equal(L.verdictFinal([c("E3", "OK")]).ok, false, "un rouge connu non joué n'est pas un vert");
});

test("Manifeste : écrit AVANT la création, refuse une adresse hors campagne, lève si le disque refuse", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "village100-"));
  try {
    const chemin = resolve(dir, "sous", "manifest.json");
    const m = new Manifeste(chemin, CAMP);
    m.avantCreation(`${CAMP}_7@passio-capacite.test`);
    let lu = JSON.parse(readFileSync(chemin, "utf8"));
    assert.deepEqual(lu.comptes, [{ email: `${CAMP}_7@passio-capacite.test`, id: null }], "sur disque avant même la requête");
    m.apresCreation(`${CAMP}_7@passio-capacite.test`, "uid-7");
    lu = Manifeste.lire(chemin);
    assert.equal(lu.comptes[0].id, "uid-7"); assert.equal(lu.purge, false);
    assert.throws(() => m.avantCreation("e2e_qa_1@passio-e2e.test"), /ADRESSE_HORS_CAMPAGNE/);
    assert.throws(() => m.apresCreation(`${CAMP}_8@passio-capacite.test`, "x"), /ADRESSE_NON_ANNONCEE/);
    assert.throws(() => new Manifeste(chemin, "capacite_%"), /CAMPAGNE_INVALIDE/);
    m.purgee(); assert.equal(Manifeste.lire(chemin).purge, true);
    writeFileSync(chemin, JSON.stringify({ campagne: CAMP, cible: "njkiyoklssvefstljemx", comptes: [] }));
    assert.throws(() => Manifeste.lire(chemin), /MANIFESTE_INVALIDE/, "un manifeste d'une autre cible n'est pas lu");
    // Le disque refuse : l'écriture LÈVE (un dossier à la place du fichier).
    const bloque = resolve(dir, "bloque.json"); mkdirSync(bloque);
    assert.throws(() => new Manifeste(bloque, CAMP));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Un faux Supabase en mémoire pour `purgerSeance` : aucun réseau.
function fauxSupabase({ comptes, tables = {}, renaitre = [] }) {
  const appels = [];
  const vivants = new Map(comptes.map((c) => [c.id, c.email]));
  const reponse = (status, corps) => ({ ok: status >= 200 && status < 300, status, json: async () => corps, text: async () => (typeof corps === "string" ? corps : JSON.stringify(corps)) });
  const fetch = async (u, o = {}) => {
    const url = new URL(u), m = o.method || "GET";
    appels.push(`${m} ${url.pathname}`);
    if (url.pathname === "/auth/v1/admin/users" && m === "GET") return reponse(200, { users: [...vivants].map(([id, email]) => ({ id, email })) });
    const mu = /^\/auth\/v1\/admin\/users\/(.+)$/.exec(url.pathname);
    if (mu && m === "DELETE") { const ok = vivants.delete(mu[1]); return reponse(ok || !renaitre.includes(mu[1]) ? 200 : 404, {}); }
    if (mu && m === "GET") return renaitre.includes(mu[1]) ? reponse(200, { id: mu[1], email: "x" }) : (vivants.has(mu[1]) ? reponse(200, { id: mu[1], email: vivants.get(mu[1]) }) : reponse(404, {}));
    const mt = /^\/rest\/v1\/(.+)$/.exec(url.pathname);
    if (mt && m === "DELETE") { const t = tables[mt[1]]; return t ? reponse(t.status, t.corps) : reponse(200, [{}]); }
    return reponse(500, "inattendu");
  };
  return { fetch, appels, vivants };
}
async function avecFetch(faux, fn) {
  const avant = globalThis.fetch, ci = process.env.CI, ga = process.env.GITHUB_ACTIONS;
  delete process.env.CI; delete process.env.GITHUB_ACTIONS;
  globalThis.fetch = faux.fetch;
  try { return await fn(); } finally {
    globalThis.fetch = avant;
    if (ci !== undefined) process.env.CI = ci;
    if (ga !== undefined) process.env.GITHUB_ACTIONS = ga;
  }
}
const URL_STAGING = `https://${L.STAGING_REF}.supabase.co`;
const e = (n) => `${CAMP}_${n}@passio-capacite.test`;

test("purgerSeance : retrouve un compte sans uid par son adresse, supprime, et PROUVE par une relecture en 404", async () => {
  const faux = fauxSupabase({ comptes: [{ id: "00000000-0000-4000-8000-000000000000", email: e(0) }, { id: "00000000-0000-4000-8000-000000000001", email: e(1) }, { id: "00000000-0000-4000-8000-0000000000c1", email: "e2e_qa_1@passio-e2e.test" }] });
  const p = await avecFetch(faux, () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: CAMP, comptes: [{ email: e(0), id: "00000000-0000-4000-8000-000000000000" }, { email: e(1), id: null }] } }));
  assert.equal(purgeComplete(p), true, JSON.stringify(p));
  assert.equal(p.comptes, 2); assert.equal(p.attendus, 2);
  assert.ok(faux.vivants.has("00000000-0000-4000-8000-0000000000c1"), "le compte de la CI n'est jamais touché");
  assert.ok(faux.appels.includes("GET /auth/v1/admin/users/00000000-0000-4000-8000-000000000001"), "chaque compte est relu");
});

test("purgerSeance : un uid du manifeste qui désigne un compte étranger → REFUS, rien n'est supprimé", async () => {
  const faux = fauxSupabase({ comptes: [{ id: "00000000-0000-4000-8000-000000000000", email: e(0) }, { id: "00000000-0000-4000-8000-0000000000c1", email: "e2e_qa_1@passio-e2e.test" }] });
  const p = await avecFetch(faux, () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: CAMP, comptes: [{ email: e(0), id: "00000000-0000-4000-8000-0000000000c1" }] } }));
  assert.equal(purgeComplete(p), false);
  assert.equal(p.refus.length, 1);
  assert.ok(!faux.appels.some((a) => a.startsWith("DELETE")), "aucune suppression");
  const p2 = await avecFetch(fauxSupabase({ comptes: [] }), () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: "capacite_%", comptes: [] } }));
  assert.deepEqual(p2.refus, ["CAMPAGNE_INVALIDE"]);
  await assert.rejects(() => avecFetch(fauxSupabase({ comptes: [] }), () => purgerSeance({ url: "https://njkiyoklssvefstljemx.supabase.co", service: "k", manifeste: { campagne: CAMP, comptes: [] } })), /CIBLE_HORS_STAGING/);
});

test("purgerSeance : une colonne absente est une ERREUR, une table absente est tolérée ; un compte qui reste est un RESTANT", async () => {
  const tables = {
    user_passions: { status: 404, corps: { message: "Could not find the table 'public.user_passions' in the schema cache" } },
    conversations: { status: 400, corps: { message: "column conversations.created_by does not exist" } },
  };
  const faux = fauxSupabase({ comptes: [{ id: "00000000-0000-4000-8000-000000000000", email: e(0) }], tables });
  const p = await avecFetch(faux, () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: CAMP, comptes: [{ email: e(0), id: "00000000-0000-4000-8000-000000000000" }] } }));
  assert.equal(p.erreurs.length, 1); assert.match(p.erreurs[0], /conversations/);
  assert.equal(purgeComplete(p), false);
  // Le DELETE répond, mais la relecture trouve encore le compte.
  const faux2 = fauxSupabase({ comptes: [{ id: "00000000-0000-4000-8000-000000000000", email: e(0) }], renaitre: ["00000000-0000-4000-8000-000000000000"] });
  const p2 = await avecFetch(faux2, () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: CAMP, comptes: [{ email: e(0), id: "00000000-0000-4000-8000-000000000000" }] } }));
  assert.equal(p2.restants.length, 1); assert.equal(purgeComplete(p2), false);
  assert.ok(TABLES_PURGE.some(([t]) => t === "user_passions"), "l'onboarding des yeux écrit user_passions");
});

test("le lanceur refuse la CI avant tout jeton ou réseau", () => {
  const sansJeton = { PATH: process.env.PATH, HOME: "/nonexistent-village100", USERPROFILE: "/nonexistent-village100" };
  for (const ci of [{ CI: "true" }, { GITHUB_ACTIONS: "true" }]) {
    const r = spawnSync(process.execPath, [resolve(racine, "scripts", "village100.mjs")], { env: { ...sansJeton, ...ci }, encoding: "utf8", timeout: 20000 });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /refusé en CI/);
  }
});

test("le lanceur refuse une seconde séance (verrou d'un pid vivant), avant tout jeton ou réseau", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "village100-verrou-"));
  try {
    mkdirSync(resolve(dir, ".passio", "tmp", "village100"), { recursive: true });
    const verrou = resolve(dir, ".passio", "tmp", "village100", "verrou.json");
    writeFileSync(verrou, JSON.stringify({ pid: process.pid, debut: "maintenant" }));
    const sansJeton = { PATH: process.env.PATH, HOME: "/nonexistent-village100", USERPROFILE: "/nonexistent-village100" };
    const r = spawnSync(process.execPath, [resolve(racine, "scripts", "village100.mjs")], { cwd: dir, env: sansJeton, encoding: "utf8", timeout: 20000 });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /une séance tourne déjà/);
    assert.ok(existsSync(verrou), "le verrou de l'autre séance n'est pas retiré");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
