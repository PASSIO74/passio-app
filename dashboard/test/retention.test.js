import { test } from "node:test";
import assert from "node:assert/strict";
import { cohortRetention } from "../server/retention.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-08-08T12:00:00.000Z");
const iso = (agoDays) => new Date(NOW - agoDays * DAY).toISOString();
const TSTART = NOW - 100 * DAY;   // télémétrie ancienne → non limitante

test("rétention J1 : retour le lendemain compté, jour d'inscription non compté", () => {
  const profiles = [];
  for (let i = 0; i < 6; i++) profiles.push({ id: "u" + i, created_at: iso(10) }); // inscrits il y a 10 j
  const activity = [
    { user_id: "u0", received_at: iso(9) },   // D+1 → retour
    { user_id: "u1", received_at: iso(9) },
    { user_id: "u2", received_at: iso(9) },
    { user_id: "u3", received_at: iso(10) },  // jour d'inscription → PAS un retour
  ];
  const r = cohortRetention(profiles, activity, NOW, TSTART);
  assert.equal(r.j1.base, 6);
  assert.equal(r.j1.retained, 3);
  assert.equal(r.j1.rate, 50);
});

test("cohorte trop récente : fenêtre non écoulée → hors base (jamais 0 %)", () => {
  const profiles = [];
  for (let i = 0; i < 6; i++) profiles.push({ id: "n" + i, created_at: iso(3) }); // il y a 3 j
  const r = cohortRetention(profiles, [], NOW, TSTART);
  assert.equal(r.j1.base, 6, "J1 écoulé");
  assert.equal(r.j7.base, 0, "J7 pas écoulé");
  assert.equal(r.j7.insufficient, true);
  assert.equal(r.j7.rate, null);
});

test("cohorte antérieure à la télémétrie → exclue (inconnu, jamais 0 %)", () => {
  const tstart = NOW - 5 * DAY;   // télémétrie depuis 5 j
  const profiles = [];
  for (let i = 0; i < 6; i++) profiles.push({ id: "o" + i, created_at: iso(20) }); // avant télémétrie
  const r = cohortRetention(profiles, [], NOW, tstart);
  assert.equal(r.j1.base, 0);
  assert.equal(r.j1.insufficient, true);
  assert.equal(r.j1.rate, null);
});

test("échantillon < min → insuffisant (pas de taux inventé)", () => {
  const profiles = [{ id: "a", created_at: iso(10) }, { id: "b", created_at: iso(10) }];
  const r = cohortRetention(profiles, [{ user_id: "a", received_at: iso(9) }], NOW, TSTART);
  assert.equal(r.j1.base, 2);
  assert.equal(r.j1.insufficient, true);
  assert.equal(r.j1.rate, null);
});

test("retour hors fenêtre non compté (bornes J7 vs J30)", () => {
  const profiles = [];
  for (let i = 0; i < 5; i++) profiles.push({ id: "w" + i, created_at: iso(40) }); // J7 et J30 éligibles
  const activity = [
    { user_id: "w0", received_at: iso(32) }, // D+8 : hors J7, dans J30
    { user_id: "w1", received_at: iso(37) }, // D+3 : dans J7
  ];
  const r = cohortRetention(profiles, activity, NOW, TSTART);
  assert.equal(r.j7.base, 5);
  assert.equal(r.j7.retained, 1, "seul w1 (J+3) dans J7");
  assert.equal(r.j30.retained, 2, "w0 (J+8) et w1 (J+3) dans J30");
});
