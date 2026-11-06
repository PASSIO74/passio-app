// Verrous des accusés de réception (supabase/functions/_shared/reception.js).
// Le fichier testé est CELUI que Deno charge en production. `node --test tests/unit/`.
// Mutations éprouvées à la main : compter un accusé de pid inconnu → ② rougit ;
// juger « non reçue » avant le délai → ③ rougit ; compter un rappel en attente
// dans le dénominateur → ⑤ rougit ; une adresse d'accusé hors forme → ⑦ rougit.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bilanReception, ligneReception, descripteurAccuse, avecAccuse, pidValide, pidNeuf,
  DELAI_ACCUSE_MS, JUGEMENT_MAX_MS, MIN_RAPPELS, EVT_ENVOI, TYPE_ACCUSE, ACTION_ACCUSE,
} from "../../supabase/functions/_shared/reception.js";

const T = Date.parse("2026-11-06T21:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const alerte = (pid, il_y_a, acceptes = 2) => ({ created_at: iso(T - il_y_a), properties: { genre: "pilotage", pid, acceptes } });
const accuse = (pid, il_y_a) => ({ pid, received_at: iso(T - il_y_a) });

test("① noms et formes : un pid est un uuid ; un pid neuf l'est ; les constantes ne bougent pas en silence", () => {
  assert.equal(EVT_ENVOI, "push_envoye");
  assert.equal(TYPE_ACCUSE, "push");
  assert.equal(ACTION_ACCUSE, "recu");
  assert.ok(pidValide(P1));
  assert.ok(pidValide(pidNeuf()));
  assert.notEqual(pidNeuf(), pidNeuf());
  for (const x of [null, "", "abc", P1 + "x", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase(), 42]) assert.equal(pidValide(x), false, String(x));
});

test("② « reçue » : l'accusé du pid envoyé compte, avec son délai ; un accusé de pid INCONNU ne compte pour rien", () => {
  const b = bilanReception({ envois: [alerte(P1, 30 * 60e3)], accuses: [accuse(P1, 30 * 60e3 - 4000), accuse(P2, 60e3), { pid: "pas-un-uuid", received_at: iso(T) }], maintenant: T });
  assert.equal(b.derniereAlerte.etat, "recue");
  assert.equal(b.derniereAlerte.recus, 1);
  assert.equal(b.derniereAlerte.acceptes, 2);
  assert.equal(b.derniereAlerte.delaiMs, 4000);
  assert.equal(b.accusesIgnores, 2, "un pid que nous n'avons pas envoyé n'est la preuve de rien");
  // Plus d'accusés que d'appareils acceptés : jamais « reçue sur 3 appareils sur 2 ».
  const trop = bilanReception({ envois: [alerte(P1, 30 * 60e3, 1)], accuses: [accuse(P1, 20 * 60e3), accuse(P1, 19 * 60e3)], maintenant: T });
  assert.equal(trop.derniereAlerte.recus, 1);
});

test("③ sans accusé : « en attente » pendant le délai, « non reçue » après, « ancienne » au-delà de 48 h — jamais perdue faute de télémétrie", () => {
  assert.equal(bilanReception({ envois: [alerte(P1, DELAI_ACCUSE_MS - 1000)], maintenant: T }).derniereAlerte.etat, "en_attente");
  assert.equal(bilanReception({ envois: [alerte(P1, DELAI_ACCUSE_MS + 1000)], maintenant: T }).derniereAlerte.etat, "non_recue");
  assert.equal(bilanReception({ envois: [alerte(P1, JUGEMENT_MAX_MS + 1000)], maintenant: T }).derniereAlerte.etat, "ancienne");
  assert.equal(bilanReception({ envois: [alerte(P1, DELAI_ACCUSE_MS + 1000, 0)], maintenant: T }).derniereAlerte.etat, "aucun_appareil");
  assert.equal(bilanReception({ maintenant: T }).derniereAlerte.etat, "aucune");
});

test("④ c'est la DERNIÈRE alerte qui est jugée, pas la première reçue", () => {
  const b = bilanReception({ envois: [alerte(P1, 5 * 3600e3), alerte(P2, 30 * 60e3)], accuses: [accuse(P1, 5 * 3600e3 - 3000)], maintenant: T });
  assert.equal(b.derniereAlerte.etat, "non_recue", "l'alerte d'il y a 5 h a été reçue, celle d'il y a 30 min non");
});

test("⑤ rappels : un taux sur 24 h, les envois encore dans le délai attendent hors du dénominateur, « trop peu » sous le minimum", () => {
  const pids = Array.from({ length: 8 }, (_, i) => `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`);
  const envois = [
    { created_at: iso(T - 2 * 3600e3), properties: { genre: "rappel", pids: pids.slice(0, 6), acceptes: 6 } },
    { created_at: iso(T - 2 * 60e3), properties: { genre: "rappel", pids: pids.slice(6), acceptes: 2 } },
    { created_at: iso(T - 30 * 3600e3), properties: { genre: "rappel", pids: ["44444444-4444-4444-8444-444444444444"], acceptes: 1 } },
  ];
  const accuses = pids.slice(0, 5).map((p) => accuse(p, 2 * 3600e3 - 5000));
  const b = bilanReception({ envois, accuses, maintenant: T });
  assert.deepEqual(b.rappels, { etat: "mesure", envoyes: 6, recus: 5, enAttente: 2, taux: 5 / 6 }, "hors des 24 h : pas compté ; dans le délai : en attente");
  const peu = bilanReception({ envois: [{ created_at: iso(T - 3600e3), properties: { genre: "rappel", pids: pids.slice(0, MIN_RAPPELS - 1) } }], maintenant: T });
  assert.equal(peu.rappels.etat, "insuffisant");
  assert.equal(peu.rappels.taux, undefined, "jamais un taux sur trop peu");
});

test("⑥ la ligne « À faire » : seulement pour une alerte non reçue ou sans appareil — jamais pour une alerte reçue, en attente ou ancienne", () => {
  const nr = ligneReception(bilanReception({ envois: [alerte(P1, DELAI_ACCUSE_MS + 1000)], maintenant: T }));
  assert.match(nr.titre, /aucun appareil/);
  assert.match(nr.reference, /ne sait pas encore accuser/, "la cause bénigne connue est dite");
  assert.ok(ligneReception(bilanReception({ envois: [alerte(P1, DELAI_ACCUSE_MS + 1000, 0)], maintenant: T })));
  for (const etat of ["recue", "en_attente", "ancienne", "aucune"]) {
    assert.equal(ligneReception({ derniereAlerte: { etat, le: iso(T), acceptes: 1, recus: 1 } }), null, etat);
  }
  assert.equal(ligneReception(null), null);
});

test("⑦ l'adresse de l'accusé : l'URL d'un projet Supabase et une clé de forme JWT, sinon RIEN — et la charge ne change pas sans elle", () => {
  const cle = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl";
  assert.deepEqual(descripteurAccuse("https://njkiyoklssvefstljemx.supabase.co/", cle), { u: "https://njkiyoklssvefstljemx.supabase.co", k: cle });
  for (const u of ["", "http://njkiyoklssvefstljemx.supabase.co", "https://evil.example", "https://njkiyoklssvefstljemx.supabase.co.evil.example", "https://njkiyoklssvefstljemx.supabase.co/rest"]) {
    assert.equal(descripteurAccuse(u, cle), null, u);
  }
  assert.equal(descripteurAccuse("https://njkiyoklssvefstljemx.supabase.co", "pas une clé"), null);
  const ack = descripteurAccuse("https://njkiyoklssvefstljemx.supabase.co", cle);
  assert.deepEqual(avecAccuse({ type: "pilotage", titre: "x" }, P1, ack), { type: "pilotage", titre: "x", pid: P1, ack });
  assert.deepEqual(avecAccuse({ type: "pilotage" }, P1, null), { type: "pilotage" }, "sans adresse, pas de pid");
  assert.deepEqual(avecAccuse({ type: "pilotage" }, "x", ack), { type: "pilotage" }, "un pid hors forme ne part pas");
});

test("⑧ une lecture tronquée le dit", () => {
  assert.equal(bilanReception({ maintenant: T, tronque: true }).tronque, true);
  assert.equal(bilanReception({ maintenant: T }).tronque, false);
});
