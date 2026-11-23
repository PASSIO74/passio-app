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
import { gardesCible, lotsPurge, motifRefusRsvp, motifServeurRsvp, TABLES_PURGE, Manifeste, purgerSeance, purgeComplete, PAGES_MAX, prendreVerrou } from "../../scripts/lib/village100-figurants.mjs";
import { TABLES_COMPTE } from "../../supabase/functions/_shared/purge-compte.js";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { tmpdir, hostname } from "node:os";

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

test("tableAbsente : seulement PGRST205 qui NOMME la table — jamais une colonne, ni un déclencheur, ni une autre table", () => {
  const absente = (t) => JSON.stringify({ code: "PGRST205", message: `Could not find the table 'public.${t}' in the schema cache` });
  assert.equal(L.tableAbsente(absente("user_passions"), "user_passions"), true);
  assert.equal(L.tableAbsente(absente("autre"), "user_passions"), false, "le refus doit nommer CETTE table");
  assert.equal(L.tableAbsente(JSON.stringify({ code: "42P01", message: 'relation "public.x" does not exist' }), "x"), false, "levé par un déclencheur : le DELETE n'a pas eu lieu");
  assert.equal(L.tableAbsente(JSON.stringify({ code: "42703", message: "column conversations.created_by does not exist" }), "conversations"), false);
  assert.equal(L.tableAbsente("Could not find the table 'public.x'", "x"), false, "un corps non JSON n'est pas un refus PostgREST");
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
  assert.equal(L.comptesAPurger({ listing, emails, idsNotes: ["x"], campagne: CAMP }).refus.length, 1);
  assert.equal(L.comptesAPurger({ listing, emails: [`${AUTRE}_0@passio-capacite.test`], idsNotes: [], campagne: CAMP }).refus.length, 1);
});

test("verrou à DEUX pid, ref de la clé, masque de la clé anon", () => {
  assert.equal(L.verrouLibre(null, () => true), true);
  assert.equal(L.verrouLibre({ pid: 42 }, () => true), false, "pid vivant : une séance tourne");
  assert.equal(L.verrouLibre({ pid: 42 }, () => false), true, "pid mort : reliquat");
  // Le lanceur tué, la séance Playwright vivante : rien n'est libre.
  assert.equal(L.verrouLibre({ pid: 42, pidSeance: 43 }, (p) => p === 43), false);
  assert.equal(L.verrouLibre({ pid: 42, pidSeance: 43 }, () => false), true);
  const jwt = (o) => "e." + Buffer.from(JSON.stringify(o)).toString("base64url") + ".s";
  assert.equal(L.refDeLaCle(jwt({ ref: L.STAGING_REF, role: "service_role" })), L.STAGING_REF);
  assert.equal(L.refDeLaCle(jwt({ ref: "njkiyoklssvefstljemx" })), "njkiyoklssvefstljemx");
  assert.equal(L.refDeLaCle("illisible"), null);
  assert.equal(L.masquerCle("wss://x/realtime/v1/websocket?apikey=eyJabc.def&vsn=1.0.0 failed"), "wss://x/realtime/v1/websocket?apikey=…&vsn=1.0.0 failed");
});

test("reliquatPurgeable : seulement un manifeste de CE poste, dont la séance est morte", () => {
  const m = (o = {}) => ({ campagne: "capacite_1700000000000_abcdef01", poste: "POSTE-A", pid: 4242, purge: false, comptes: [{ email: "x", id: null }], ...o });
  const mort = () => false, vivant = () => true;
  const ctx = (o = {}) => ({ poste: "POSTE-A", pid: 1, estVivant: mort, ...o });
  assert.deepEqual(L.reliquatPurgeable(m(), ctx()), { purger: true, refus: null }, "même poste, séance morte : purgé");
  // Rien à faire : pas de manifeste, déjà purgé, aucun compte.
  for (const x of [null, m({ purge: true }), m({ comptes: [] })]) assert.deepEqual(L.reliquatPurgeable(x, ctx({ estVivant: vivant })), { purger: false, refus: null });
  // Un autre poste : refus, même séance morte.
  const autre = L.reliquatPurgeable(m({ poste: "POSTE-B" }), ctx());
  assert.equal(autre.purger, false); assert.match(autre.refus, /autre poste \(POSTE-B\)/);
  // Une séance vivante : refus.
  const vit = L.reliquatPurgeable(m(), ctx({ estVivant: (p) => p === 4242 }));
  assert.equal(vit.purger, false); assert.match(vit.refus, /séance vivante \(pid 4242\)/);
  // Le pid égal au nôtre est un pid réutilisé : nous sommes ce processus, la séance est morte.
  assert.equal(L.reliquatPurgeable(m({ pid: 1 }), ctx({ estVivant: vivant })).purger, true);
  // Un manifeste sans poste ou sans pid (antérieur aux gardes) : jamais d'office.
  for (const x of [m({ poste: undefined }), m({ poste: "" }), m({ pid: undefined }), m({ pid: "4242" })]) {
    const d = L.reliquatPurgeable(x, ctx());
    assert.equal(d.purger, false); assert.match(d.refus, /antérieur aux gardes/);
  }
});

// Un fs réel (dossier temporaire) dont la PREMIÈRE lecture du verrou laisse
// un concurrent agir : c'est l'instant où deux lancements voient le même
// verrou mort.
function fsAvecConcurrent(chemin, concurrent) {
  let fait = false;
  return {
    readFileSync: (p, e) => { const r = readFileSync(p, e); if (!fait && p === chemin) { fait = true; concurrent(); } return r; },
    writeFileSync, renameSync, rmSync,
  };
}
test("prendreVerrou : verrou libre, vivant, illisible ou `null`, périmé", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "village100-prise-"));
  try {
    const v = resolve(dir, "verrou.json");
    assert.deepEqual(prendreVerrou(v, { pid: 7, estVivant: () => false }), { ok: true });
    assert.equal(JSON.parse(readFileSync(v, "utf8")).pid, 7);
    const vivant = prendreVerrou(v, { pid: 8, estVivant: (p) => p === 7 });
    assert.equal(vivant.ok, false); assert.match(vivant.raison, /une séance tourne déjà/);
    for (const contenu of ["null", "{", "[]", "42"]) {
      writeFileSync(v, contenu);
      const r = prendreVerrou(v, { pid: 8, estVivant: () => false });
      assert.equal(r.ok, false, contenu); assert.match(r.raison, /illisible/);
      assert.equal(readFileSync(v, "utf8"), contenu, "un verrou illisible n'est pas touché");
    }
    writeFileSync(v, JSON.stringify({ pid: 7, pidSeance: 9, debut: "avant" }));
    assert.deepEqual(prendreVerrou(v, { pid: 8, estVivant: () => false }), { ok: true }, "périmé : repris");
    assert.equal(JSON.parse(readFileSync(v, "utf8")).pid, 8);
    assert.ok(!existsSync(v + ".8"), "le verrou écarté ne traîne pas");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("prendreVerrou : deux reprises concurrentes d'un même verrou périmé — une seule séance", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "village100-course-"));
  try {
    const v = resolve(dir, "verrou.json");
    const perime = JSON.stringify({ pid: 7, debut: "avant" });
    const neufA = JSON.stringify({ pid: 100, debut: "A" });
    // ① A reprend TOUT (renomme, pose le sien) entre notre lecture et notre
    // renommage : nous écartons le verrou NEUF de A — il doit lui être rendu.
    writeFileSync(v, perime);
    const r1 = prendreVerrou(v, { pid: 200, estVivant: (p) => p === 100,
      fs: fsAvecConcurrent(v, () => { renameSync(v, v + ".100"); rmSync(v + ".100"); writeFileSync(v, neufA, { flag: "wx" }); }) });
    assert.equal(r1.ok, false, "B ne prend pas le verrou de A");
    assert.equal(readFileSync(v, "utf8"), neufA, "le verrou de A est intact");
    assert.ok(!existsSync(v + ".200"));
    // ② A n'a fait que renommer : notre renommage reçoit ENOENT, refus.
    writeFileSync(v, perime);
    const r2 = prendreVerrou(v, { pid: 200, estVivant: () => false,
      fs: fsAvecConcurrent(v, () => { renameSync(v, v + ".100"); }) });
    assert.equal(r2.ok, false); assert.match(r2.raison, /repris à l'instant/);
    assert.ok(!existsSync(v), "B n'a rien posé");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("rouges connus : la liste est VIDE — A3 (annulation) est exigé depuis #1021", () => {
  const c = (code, statut, detail = "") => ({ code, statut, detail });
  assert.deepEqual(L.ROUGES_CONNUS, {});
  assert.equal(L.verdictFinal([c("A3", "OK"), c("A3b", "OK")]).ok, true, "A3 vert : verdict conforme");
  const a3 = L.verdictFinal([c("A3", "ÉCHEC", "60/99 prévenus"), c("A3b", "OK")]);
  assert.equal(a3.ok, false, "l'ancien rouge est désormais un NOUVEAU rouge"); assert.deepEqual(a3.nouveaux, ["A3"]);
});

test("rouges connus : le MÉCANISME — code ET signature figés, un autre rouge, le même AUTREMENT, ou un vert changent le verdict", () => {
  const c = (code, statut, detail = "") => ({ code, statut, detail });
  const connus = { A3: "60/99 prévenus" };
  const v = (x) => L.verdictFinal(x, connus);
  assert.equal(v([c("A3", "ÉCHEC", "60/99 prévenus ; écritures refusées chez Léa : {\"400\":39}"), c("A3b", "OK")]).ok, true);
  const nouveau = v([c("A3", "ÉCHEC", "60/99 prévenus"), c("E3", "ÉCHEC")]);
  assert.equal(nouveau.ok, false); assert.deepEqual(nouveau.nouveaux, ["E3"]);
  const autrement = v([c("A3", "ÉCHEC", "0/99 prévenus")]);
  assert.equal(autrement.ok, false, "A3 rouge AUTREMENT (0/99) n'est plus le rouge connu"); assert.deepEqual(autrement.autrement, ["A3"]);
  assert.deepEqual(v([c("A3", "ÉCHEC", "60/99 prévenus"), c("A3b", "ÉCHEC", "doublons 4")]).nouveaux, ["A3b"]);
  const gueri = v([c("A3", "OK")]);
  assert.equal(gueri.ok, false); assert.deepEqual(gueri.gueris, ["A3"]);
  assert.equal(v([c("E3", "OK")]).ok, false, "un rouge connu non joué n'est pas un vert");
});

test("Manifeste : écrit AVANT la création, pid et poste, n'écrase JAMAIS une séance non purgée, identifiants vérifiés", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "village100-"));
  const U7 = "00000000-0000-4000-8000-000000000007";
  try {
    const chemin = resolve(dir, "sous", "manifest.json");
    const m = new Manifeste(chemin, CAMP, { pid: 1234, poste: "poste-a" });
    m.avantCreation(`${CAMP}_7@passio-capacite.test`);
    let lu = JSON.parse(readFileSync(chemin, "utf8"));
    assert.deepEqual(lu.comptes, [{ email: `${CAMP}_7@passio-capacite.test`, id: null }], "sur disque avant même la requête");
    assert.equal(lu.pid, 1234); assert.equal(lu.poste, "poste-a");
    m.apresCreation(`${CAMP}_7@passio-capacite.test`, U7);
    assert.equal(Manifeste.lire(chemin).comptes[0].id, U7);
    assert.throws(() => m.apresCreation(`${CAMP}_7@passio-capacite.test`, "pas-un-uuid"), /IDENTIFIANT_INVALIDE/);
    assert.throws(() => m.avantCreation("e2e_qa_1@passio-e2e.test"), /ADRESSE_HORS_CAMPAGNE/);
    assert.throws(() => m.apresCreation(`${CAMP}_8@passio-capacite.test`, U7), /ADRESSE_NON_ANNONCEE/);
    // --retries / --repeat-each : le second essai ne doit pas effacer les adresses du premier.
    assert.throws(() => new Manifeste(chemin, AUTRE), /MANIFESTE_NON_PURGE/);
    assert.equal(Manifeste.lire(chemin).campagne, CAMP, "le manifeste non purgé est intact");
    m.purgee();
    assert.doesNotThrow(() => new Manifeste(chemin, AUTRE), "purgé : la séance suivante peut écrire le sien");
    assert.throws(() => new Manifeste(resolve(dir, "x.json"), "capacite_%"), /CAMPAGNE_INVALIDE/);
    writeFileSync(chemin, JSON.stringify({ campagne: CAMP, cible: "njkiyoklssvefstljemx", comptes: [] }));
    assert.throws(() => Manifeste.lire(chemin), /MANIFESTE_INVALIDE/, "un manifeste d'une autre cible n'est pas lu");
    writeFileSync(chemin, JSON.stringify({ campagne: CAMP, cible: L.STAGING_REF, comptes: [{ email: `${CAMP}_1@passio-capacite.test`, id: "x),or=(id.neq.0" }] }));
    assert.throws(() => Manifeste.lire(chemin), /MANIFESTE_INVALIDE/, "un identifiant qui n'est pas un UUID n'entre jamais dans une URL");
    const bloque = resolve(dir, "bloque.json"); mkdirSync(bloque);
    assert.throws(() => new Manifeste(bloque, CAMP), "le disque refuse : l'écriture LÈVE");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Un faux Supabase en mémoire pour `purgerSeance` : aucun réseau. Il respecte
// `filter` (sous-chaîne d'adresse), `page` et `per_page`, comme GoTrue.
function fauxSupabase({ comptes, tables = {}, renaitre = [], filtreIgnore = false }) {
  const appels = [];
  const vivants = new Map(comptes.map((c) => [c.id, c.email]));
  const reponse = (status, corps) => ({ ok: status >= 200 && status < 300, status, json: async () => corps, text: async () => (typeof corps === "string" ? corps : JSON.stringify(corps)) });
  const fetch = async (u, o = {}) => {
    const url = new URL(u), m = o.method || "GET";
    appels.push(`${m} ${url.pathname}`);
    if (url.pathname === "/auth/v1/admin/users" && m === "GET") {
      const filtre = filtreIgnore ? "" : (url.searchParams.get("filter") || "");
      const page = Number(url.searchParams.get("page") || 1), par = Number(url.searchParams.get("per_page") || 50);
      const tous = [...vivants].filter(([, e]) => e.includes(filtre)).concat(renaitre.map((id) => [id, comptes.find((c) => c.id === id).email]));
      return reponse(200, { users: tous.slice((page - 1) * par, page * par).map(([id, email]) => ({ id, email })) });
    }
    const mu = /^\/auth\/v1\/admin\/users\/(.+)$/.exec(url.pathname);
    if (mu && m === "DELETE") { vivants.delete(mu[1]); return reponse(200, {}); }
    if (mu && m === "GET") {
      if (renaitre.includes(mu[1])) return reponse(200, { id: mu[1], email: comptes.find((c) => c.id === mu[1]).email });
      return vivants.has(mu[1]) ? reponse(200, { id: mu[1], email: vivants.get(mu[1]) }) : reponse(404, {});
    }
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
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CI_UID = "00000000-0000-4000-8000-0000000000c1";

test("purgerSeance : les tables de la suppression de compte du produit (TABLES_COMPTE), importées", () => {
  for (const [t, c] of TABLES_COMPTE) assert.ok(TABLES_PURGE.some(([x, y]) => x === t && y === c), `${t}.${c} manque à la purge`);
  assert.ok(TABLES_PURGE.some(([t]) => t === "user_safety"), "declare_birth_year et l'onboarding écrivent user_safety");
  // Hors TABLES_COMPTE : ce que le banc écrit en plus (discussion d'activité, signalements).
  assert.ok(TABLES_PURGE.some(([t, c]) => t === "conversations" && c === "created_by"), "conversations.created_by");
  assert.ok(TABLES_PURGE.some(([t, c]) => t === "reports" && c === "reporter_id"), "reports.reporter_id");
  assert.deepEqual(TABLES_PURGE[TABLES_PURGE.length - 1], ["profiles", "id"], "les profils partent en dernier");
});

test("purgerSeance : retrouve un compte sans uid par son adresse, sur la PAGE 2, et prouve par uid (404) ET par adresse", async () => {
  // 210 comptes portent la campagne dans leur adresse : la cible est au-delà de la page 1.
  const bruit = Array.from({ length: 210 }, (_, i) => ({ id: uid(1000 + i), email: `${CAMP}_bruit${i}@passio-capacite.test` }));
  const faux = fauxSupabase({ comptes: [...bruit, { id: uid(0), email: e(0) }, { id: uid(1), email: e(1) }, { id: CI_UID, email: "e2e_qa_1@passio-e2e.test" }] });
  const p = await avecFetch(faux, () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: CAMP, comptes: [{ email: e(0), id: uid(0) }, { email: e(1), id: null }] } }));
  assert.equal(purgeComplete(p), true, JSON.stringify(p));
  assert.equal(p.comptes, 2); assert.equal(p.attendus, 2); assert.equal(p.annonces, 2);
  assert.ok(!faux.vivants.has(uid(1)), "le compte sans uid, trouvé en page 2, est parti");
  assert.ok(faux.vivants.has(CI_UID), "le compte de la CI n'est jamais touché");
  assert.ok(faux.vivants.has(uid(1000)), "une adresse qui contient la campagne sans être de la séance n'est pas touchée");
});

test("purgerSeance : un uid étranger — dans le listing OU relu hors listing — est un REFUS, rien n'est supprimé", async () => {
  const faux = fauxSupabase({ comptes: [{ id: uid(0), email: e(0) }, { id: CI_UID, email: "e2e_qa_1@passio-e2e.test" }] });
  const p = await avecFetch(faux, () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: CAMP, comptes: [{ email: e(0), id: CI_UID }] } }));
  assert.equal(purgeComplete(p), false); assert.equal(p.refus.length, 1);
  assert.ok(!faux.appels.some((a) => a.startsWith("DELETE")), "aucune suppression");
  const p2 = await avecFetch(fauxSupabase({ comptes: [] }), () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: "capacite_%", comptes: [] } }));
  assert.deepEqual(p2.refus, ["CAMPAGNE_INVALIDE"]);
  await assert.rejects(() => avecFetch(fauxSupabase({ comptes: [] }), () => purgerSeance({ url: "https://njkiyoklssvefstljemx.supabase.co", service: "k", manifeste: { campagne: CAMP, comptes: [] } })), /CIBLE_HORS_STAGING/);
});

test("purgerSeance : un filtre ignoré par l'API, ou un listing qui déborde, est une ERREUR — jamais « rien trouvé »", async () => {
  const faux = fauxSupabase({ comptes: [{ id: uid(0), email: e(0) }, { id: CI_UID, email: "e2e_qa_1@passio-e2e.test" }], filtreIgnore: true });
  const p = await avecFetch(faux, () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: CAMP, comptes: [{ email: e(0), id: uid(0) }] } }));
  assert.equal(purgeComplete(p), false); assert.match(p.erreurs.join(" "), /FILTRE_NON_APPLIQUE/);
  assert.ok(!faux.appels.some((a) => a.startsWith("DELETE")));
  const enorme = Array.from({ length: PAGES_MAX * 200 }, (_, i) => ({ id: uid(5000 + i), email: `${CAMP}_b${i}@passio-capacite.test` }));
  const p2 = await avecFetch(fauxSupabase({ comptes: enorme }), () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: CAMP, comptes: [{ email: e(0), id: null }] } }));
  assert.match(p2.erreurs.join(" "), /LISTING_DEBORDE/);
});

test("purgerSeance : une colonne absente est une ERREUR, une table absente tolérée ; un compte qui reste est un RESTANT", async () => {
  const tables = {
    user_passions: { status: 404, corps: { code: "PGRST205", message: "Could not find the table 'public.user_passions' in the schema cache" } },
    conversations: { status: 400, corps: { code: "42703", message: "column conversations.created_by does not exist" } },
  };
  const faux = fauxSupabase({ comptes: [{ id: uid(0), email: e(0) }], tables });
  const p = await avecFetch(faux, () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: CAMP, comptes: [{ email: e(0), id: uid(0) }] } }));
  assert.equal(p.erreurs.length, 1); assert.match(p.erreurs[0], /conversations/);
  assert.equal(purgeComplete(p), false);
  // Le DELETE répond, mais le compte est encore là : par uid (GET 200) ET par adresse (listing).
  const faux2 = fauxSupabase({ comptes: [{ id: uid(0), email: e(0) }], renaitre: [uid(0)] });
  const p2 = await avecFetch(faux2, () => purgerSeance({ url: URL_STAGING, service: "k", manifeste: { campagne: CAMP, comptes: [{ email: e(0), id: uid(0) }] } }));
  assert.equal(p2.restants.length, 2, JSON.stringify(p2.restants)); assert.equal(purgeComplete(p2), false);
  assert.ok(p2.restants.some((x) => /adresse encore présente/.test(x)), "la preuve par adresse voit le reste");
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
    // Le LANCEUR est mort (pid inexistant), la SÉANCE vit encore : refus.
    writeFileSync(verrou, JSON.stringify({ pid: 2147483646, pidSeance: process.pid, debut: "maintenant" }));
    const sansJeton = { PATH: process.env.PATH, HOME: "/nonexistent-village100", USERPROFILE: "/nonexistent-village100" };
    const r = spawnSync(process.execPath, [resolve(racine, "scripts", "village100.mjs")], { cwd: dir, env: sansJeton, encoding: "utf8", timeout: 20000 });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /une séance tourne déjà/);
    assert.ok(existsSync(verrou), "le verrou de l'autre séance n'est pas retiré");
    // Un verrou qui contient `null` : refus propre, pas un plantage.
    writeFileSync(verrou, "null");
    const r2 = spawnSync(process.execPath, [resolve(racine, "scripts", "village100.mjs")], { cwd: dir, env: sansJeton, encoding: "utf8", timeout: 20000 });
    assert.equal(r2.status, 2);
    assert.match(r2.stderr, /verrou illisible/);
    assert.doesNotMatch(r2.stderr, /TypeError/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("le lanceur refuse un reliquat d'un autre poste ou d'une séance vivante, avant tout jeton ou réseau, sans le toucher", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "village100-reliquat-"));
  try {
    const d = resolve(dir, ".passio", "tmp", "village100");
    mkdirSync(d, { recursive: true });
    const man = resolve(d, "manifest.json");
    const base = { campagne: "capacite_1700000000000_abcdef01", cible: L.STAGING_REF, purge: false, comptes: [{ email: "capacite_1700000000000_abcdef01_0@passio-capacite.test", id: null }] };
    const sansJeton = { PATH: process.env.PATH, HOME: "/nonexistent-village100", USERPROFILE: "/nonexistent-village100" };
    for (const [m, motif] of [
      [{ ...base, poste: "UN-AUTRE-POSTE", pid: 2147483646 }, /autre poste/],
      [{ ...base, poste: hostname(), pid: process.pid }, /séance vivante/],
      [{ ...base, pid: 2147483646 }, /antérieur aux gardes/],
    ]) {
      writeFileSync(man, JSON.stringify(m));
      const r = spawnSync(process.execPath, [resolve(racine, "scripts", "village100.mjs")], { cwd: dir, env: sansJeton, encoding: "utf8", timeout: 20000 });
      assert.equal(r.status, 2);
      assert.match(r.stderr, motif);
      assert.doesNotMatch(r.stderr, /jeton personnel/, "refusé AVANT de chercher le jeton");
      assert.equal(readFileSync(man, "utf8"), JSON.stringify(m), "le manifeste n'est pas touché");
      assert.ok(!existsSync(resolve(d, "verrou.json")), "le verrou est libéré");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("le lanceur refuse --retries et --repeat-each : une séance = une campagne = un manifeste", () => {
  const sansJeton = { PATH: process.env.PATH, HOME: "/nonexistent-village100", USERPROFILE: "/nonexistent-village100" };
  for (const arg of ["--retries=1", "--retries", "--repeat-each=2"]) {
    const r = spawnSync(process.execPath, [resolve(racine, "scripts", "village100.mjs"), arg], { env: sansJeton, encoding: "utf8", timeout: 20000 });
    assert.equal(r.status, 2, arg);
    assert.match(r.stderr, /refusés/);
  }
});
