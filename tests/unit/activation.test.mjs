// Activation des nouveaux comptes (2026-10-06) — supabase/functions/_shared/pilotage.js.
//
// Un compte est ACTIVÉ s'il fait un geste social (publier, commenter, suivre,
// rejoindre ou organiser une activité, écrire un message) dans ses 7 premiers
// jours. UNE définition, DEUX lecteurs : la fonction `pilotage` (téléphone,
// PostgREST) et le digest du matin (SQL de la veille, GÉNÉRÉ depuis la même
// liste). Ce banc éprouve la décision (①②③), les exclusions (④), la requête
// générée (⑤), l'ACCORD des deux lecteurs sur un même jeu de données (⑥), le
// câblage des trois surfaces (⑦⑧⑨) et le manifeste des prérequis (⑩).
// MUTATIONS : `<=` → `<` sur la fenêtre (①) ; compter au taux un compte de
// moins de 7 jours (②) ; lire une date sans fuseau en heure locale (③) ; ne
// plus exclure e2e / éditeur / non confirmé (④) ; retirer une table de la
// requête ou une conversion de fuseau (⑤⑥) ; afficher la ligne avec un
// identifiant (⑨).
// Une machine à l'heure UTC ne verrait jamais une date naïve lue en heure
// locale (③) : le banc se met délibérément ailleurs.
process.env.TZ = "America/New_York";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  activation, activationDepuisLignes, compteMesurable, dateUtc, sqlActivation,
  GESTES_ACTIVATION, ACTIVATION_JOURS, COHORTE_ACTIVATION_JOURS, DOMAINE_E2E, COMPTE_PILOTE,
} from "../../supabase/functions/_shared/pilotage.js";
import { estSelectSeul, SQL } from "../../scripts/veille-production.mjs";
import { ligneActivation } from "../../scripts/digest.mjs";

const J = 864e5;
const MAINTENANT = Date.parse("2026-10-06T08:00:00Z");
const iso = (t) => new Date(t).toISOString();

test("① un geste dans les 7 premiers jours active, un geste au 8ᵉ jour non — la borne est incluse", () => {
  const cree = MAINTENANT - 20 * J;
  const comptes = [{ id: "a", cree: iso(cree) }, { id: "b", cree: iso(cree) }, { id: "c", cree: iso(cree) }];
  const gestes = [
    { uid: "a", le: iso(cree + 7 * J), geste: "posts" },          // pile 7 jours : activé
    { uid: "b", le: iso(cree + 7 * J + 1000), geste: "follows" },  // 7 jours et 1 s : non
  ];
  const r = activation(comptes, gestes, MAINTENANT);
  assert.equal(r.mures, 3);
  assert.equal(r.activesMures, 1);
  assert.equal(r.taux, 33);
  assert.deepEqual(r.premiers, { publication: 1 });
  assert.equal(r.jours, ACTIVATION_JOURS);
  assert.equal(r.cohorteJours, COHORTE_ACTIVATION_JOURS);
});

test("② un compte de moins de 7 jours est « en cours », jamais un échec ; hors fenêtre de 30 j, il n'existe pas", () => {
  const comptes = [
    { id: "jeune", cree: iso(MAINTENANT - 2 * J) },
    { id: "jeune-actif", cree: iso(MAINTENANT - 3 * J) },
    { id: "vieux", cree: iso(MAINTENANT - 31 * J) },
    { id: "futur", cree: iso(MAINTENANT + J) },
    { id: "jeune", cree: iso(MAINTENANT - 2 * J) }, // doublon : compté une fois
  ];
  const gestes = [{ uid: "jeune-actif", le: iso(MAINTENANT - 3 * J + 3600e3), geste: "conv_messages" }];
  const r = activation(comptes, gestes, MAINTENANT);
  assert.deepEqual({ cohorte: r.cohorte, mures: r.mures, enCours: r.enCours, enCoursActives: r.enCoursActives, taux: r.taux },
    { cohorte: 2, mures: 0, enCours: 2, enCoursActives: 1, taux: null }, "sans compte mûr, pas de taux — jamais un faux 0 %");
  assert.deepEqual(r.premiers, { message: 1 });
});

test("③ une date SANS fuseau (colonne `timestamp`) est de l'UTC, quelle que soit l'heure de la machine", () => {
  assert.equal(dateUtc("2026-09-09T12:41:51.433"), Date.parse("2026-09-09T12:41:51.433Z"));
  assert.equal(dateUtc("2026-09-09 12:41:51"), Date.parse("2026-09-09T12:41:51Z"));
  assert.equal(dateUtc("2026-09-09 12:41:51+00"), Date.parse("2026-09-09T12:41:51Z"));
  assert.equal(dateUtc("2026-09-09T14:41:51+02:00"), Date.parse("2026-09-09T12:41:51Z"));
  assert.equal(dateUtc(1234), 1234);
  assert.ok(Number.isNaN(dateUtc("")) && Number.isNaN(dateUtc(null)) && Number.isNaN(dateUtc("n'importe quoi")));
  // Le cas qui compte : compte créé à 23 h UTC, message 6 j 23 h plus tard en colonne naïve.
  const cree = Date.parse("2026-09-01T23:00:00Z");
  const r = activation([{ id: "x", cree: "2026-09-01T23:00:00+00:00" }], [{ uid: "x", le: "2026-09-08 22:00:00", geste: "conv_messages" }], cree + 20 * J);
  assert.equal(r.activesMures, 1);
});

test("④ hors mesure : e2e, éditeur (casse, PILOTAGE_EMAILS), non confirmé, anonyme, supprimé, sans e-mail", () => {
  const ok = { id: "u", email: "lea@exemple.fr", email_confirmed_at: "2026-09-01T00:00:00Z" };
  assert.equal(compteMesurable(ok), true);
  assert.equal(compteMesurable({ ...ok, confirmed_at: ok.email_confirmed_at, email_confirmed_at: null }), true, "confirmed_at suffit");
  assert.equal(compteMesurable({ ...ok, email: "x" + DOMAINE_E2E }), false);
  assert.equal(compteMesurable({ ...ok, email: " " + COMPTE_PILOTE.toUpperCase() + " " }), false);
  assert.equal(compteMesurable({ ...ok, email: "aide@exemple.fr" }, "aide@exemple.fr, b@c.d"), false);
  assert.equal(compteMesurable({ ...ok, email_confirmed_at: null }), false);
  assert.equal(compteMesurable({ ...ok, is_anonymous: true }), false);
  assert.equal(compteMesurable({ ...ok, deleted_at: "2026-09-02T00:00:00Z" }), false);
  assert.equal(compteMesurable({ ...ok, email: "" }), false);
  assert.equal(compteMesurable({ ...ok, id: "" }), false);
  assert.equal(compteMesurable(null), false);
});

test("⑤ la requête du digest est un SELECT seul, GÉNÉRÉE depuis la liste : chaque table, chaque colonne, le bon fuseau, les mêmes exclusions", () => {
  const sql = sqlActivation();
  assert.equal(estSelectSeul(sql), true, "la veille refuse tout ce qui n'est pas un SELECT seul — et plante à l'import");
  assert.equal(SQL.activation, sql, "la veille lit CETTE requête");
  for (const g of GESTES_ACTIVATION) {
    const conv = g.naif ? "created_at as le" : "(created_at at time zone 'UTC') as le";
    assert.ok(sql.includes(`select ${g.uid}::text as uid, ${conv}, '${g.table}' as geste from public.${g.table} where ${g.uid}::text in`), g.table);
  }
  for (const morceau of ["deleted_at is null", "coalesce(is_anonymous, false) = false", "email_confirmed_at is not null",
    `not like '%${DOMAINE_E2E}'`, `<> '${COMPTE_PILOTE}'`, `interval '${COHORTE_ACTIVATION_JOURS} days'`]) {
    assert.ok(sql.includes(morceau), morceau);
  }
  assert.ok(!/[;]|--|\/\*/.test(sql));
});

test("⑥ les deux lecteurs rendent la MÊME mesure sur le même jeu de données", () => {
  // Lecteur 1 — la fonction : comptes de listUsers (timestamptz), gestes PostgREST
  // (colonnes naïves SANS fuseau, colonnes tz avec +00:00), toutes les lignes.
  const c1 = MAINTENANT - 10 * J, c2 = MAINTENANT - 12 * J, c3 = MAINTENANT - 3 * J;
  const naif = (t) => iso(t).replace("Z", "");
  const tz = (t) => iso(t).replace("Z", "+00:00");
  const comptes = [{ id: "u1", cree: tz(c1) }, { id: "u2", cree: tz(c2) }, { id: "u3", cree: tz(c3) }];
  const gestes = [
    { uid: "u1", le: naif(c1 + 2 * J), geste: "posts" }, { uid: "u1", le: naif(c1 + 5 * 3600e3), geste: "posts" },
    { uid: "u1", le: tz(c1 + J), geste: "follows" },
    { uid: "u2", le: naif(c2 + 9 * J), geste: "conv_messages" },
    { uid: "u3", le: tz(c3 + 3600e3), geste: "event_attendees" },
  ];
  const fonction = activation(comptes, gestes, MAINTENANT);
  // Lecteur 2 — le SQL : une ligne par (compte, table), le PREMIER geste en ISO Z ;
  // un compte sans geste a une ligne `geste: null`.
  const z = (t) => iso(t);
  const lignes = [
    { id: "u1", cree: z(c1), geste: "posts", premier: z(c1 + 5 * 3600e3) },
    { id: "u1", cree: z(c1), geste: "follows", premier: z(c1 + J) },
    { id: "u2", cree: z(c2), geste: "conv_messages", premier: z(c2 + 9 * J) },
    { id: "u3", cree: z(c3), geste: "event_attendees", premier: z(c3 + 3600e3) },
  ];
  const digest = activationDepuisLignes(lignes, MAINTENANT);
  assert.deepEqual(digest, fonction);
  assert.deepEqual({ mures: fonction.mures, activesMures: fonction.activesMures, enCours: fonction.enCours, enCoursActives: fonction.enCoursActives },
    { mures: 2, activesMures: 1, enCours: 1, enCoursActives: 1 });
  assert.deepEqual(fonction.premiers, { publication: 1, "participation à une activité": 1 });
  // Un compte SANS geste reste dans la cohorte du lecteur SQL.
  assert.equal(activationDepuisLignes([{ id: "v", cree: z(c1), geste: null, premier: null }], MAINTENANT).mures, 1);
});

test("⑦ la fonction `pilotage` lit l'activation par la liste partagée, et la rend dans l'état", () => {
  const src = fs.readFileSync("supabase/functions/pilotage/index.ts", "utf8");
  assert.match(src, /activation: lireActivation\(admin\)/);
  assert.match(src, /GESTES_ACTIVATION\.map\(/, "les tables viennent de la liste, pas d'une copie");
  assert.match(src, /compteMesurable\(u, EXTRA\)/);
  assert.match(src, /return activation\(comptes, gestes, maintenant\)/);
});

test("⑧ le téléphone affiche le taux, la cohorte mûre, les comptes en cours, et « non lu » sans donnée", () => {
  const html = fs.readFileSync("pilotage/index.html", "utf8");
  const js = fs.readFileSync("pilotage/pilotage.js", "utf8");
  assert.match(html, /id="activation"/);
  assert.match(js, /nonLu\("activation", "Activation"\)/);
  assert.match(js, /act\.activesMures \+ " \/ " \+ act\.mures/);
});

test("⑨ digest : des comptages seulement, « non lue » quand la lecture échoue", () => {
  const a = activation([{ id: "secret-uid", cree: iso(MAINTENANT - 9 * J) }, { id: "x2", cree: iso(MAINTENANT - J) }],
    [{ uid: "secret-uid", le: iso(MAINTENANT - 8 * J), geste: "posts" }], MAINTENANT);
  const l = ligneActivation(a);
  assert.equal(l, "- Activation à 7 j : 1 / 1 compte(s) de 7 à 30 j ont fait un geste social dans leurs 7 premiers jours (100 %) ; 1 compte(s) de moins de 7 j");
  assert.ok(!l.includes("secret-uid"));
  assert.match(ligneActivation({ erreur: "HTTP 401 sur api.supabase.com/database/query" }), /non lue \(HTTP 401/);
  assert.match(ligneActivation(undefined), /non lue$/);
  assert.match(ligneActivation(activation([], [], MAINTENANT)), /aucun compte de 7 à 30 j$/);
  const src = fs.readFileSync("scripts/digest.mjs", "utf8");
  assert.match(src, /ligneActivation\(usage\.activation\)/);
  const veille = fs.readFileSync("scripts/veille-production.mjs", "utf8");
  assert.match(veille, /activationDepuisLignes\(await lireSql\(env, SQL\.activation\)\)/);
});

test("⑩ le manifeste des prérequis de `pilotage` déclare chaque colonne lue par l'activation", () => {
  const m = JSON.parse(fs.readFileSync(".passio/deploiement/prerequis-fonctions.json", "utf8"));
  const objets = m.fonctions.pilotage.objets;
  for (const g of GESTES_ACTIVATION) {
    assert.ok(objets.includes(`column:public.${g.table}.${g.uid}`), g.table + "." + g.uid);
    assert.ok(objets.includes(`column:public.${g.table}.created_at`), g.table + ".created_at");
  }
  assert.equal(m.fonctions.pilotage.obligatoire, false, "une table manquante dégrade l'état (« non lu »), elle ne retient pas le déploiement");
});
