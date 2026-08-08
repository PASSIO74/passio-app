import { test } from "node:test";
import assert from "node:assert/strict";
import { computeKpi } from "../server/kpi.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-08-08T12:00:00.000Z");
// Ligne d'événement à `agoDays` jours avant NOW (fraction acceptée).
const row = (user_id, agoDays) => ({ user_id, received_at: new Date(NOW - agoDays * DAY).toISOString() });

test("DAU/WAU/MAU comptent des utilisateurs DISTINCTS par fenêtre", () => {
  const rows = [
    row("u1", 0.1), row("u1", 0.2),   // u1 actif aujourd'hui (2 events → 1 user)
    row("u2", 3),                      // u2 actif cette semaine
    row("u3", 20),                     // u3 actif ce mois seulement
  ];
  const k = computeKpi(rows, NOW);
  assert.equal(k.dau, 1, "DAU = u1");
  assert.equal(k.wau, 2, "WAU = u1,u2");
  assert.equal(k.mau, 3, "MAU = u1,u2,u3");
});

test("habitude (DAU/MAU) et bornes vides", () => {
  const k = computeKpi([row("u1", 0.1), row("u2", 10), row("u3", 10), row("u4", 10)], NOW);
  assert.equal(k.mau, 4);
  assert.equal(k.stickiness, 25, "1/4 = 25%");
  const empty = computeKpi([], NOW);
  assert.equal(empty.dau, 0);
  assert.equal(empty.stickiness, null, "pas de division par zéro");
  assert.equal(empty.returnRate7, null);
});

test("taux de retour 7 j = actifs [7-14j] revenus dans [0-7j]", () => {
  const rows = [
    row("a", 10), row("a", 2),   // a : présent semaine préc. ET revenu → compte
    row("b", 10),                 // b : présent semaine préc. seulement → base, pas revenu
    row("c", 2),                  // c : nouveau cette semaine → n'entre pas dans la base
  ];
  const k = computeKpi(rows, NOW);
  assert.equal(k.returnBase, 2, "base = a,b (actifs 7-14j)");
  assert.equal(k.returnCount, 1, "seul a est revenu");
  assert.equal(k.returnRate7, 50);
});

test("honnêteté : partial → confidence, retentionCohort reste inconnu (null)", () => {
  const k = computeKpi([row("u1", 1)], NOW, true);
  assert.equal(k.partial, true);
  assert.equal(k.confidence, "partial");
  assert.equal(k.retentionCohort, null, "cohorte J1/J7/J30 jamais inventée");
  const k2 = computeKpi([row("u1", 1)], NOW, false);
  assert.equal(k2.confidence, "high");
});

test("série 14 j : longueur, dernier jour = aujourd'hui, dédup par jour", () => {
  const rows = [row("u1", 0.1), row("u2", 0.2), row("u1", 0.3)]; // 2 users distincts aujourd'hui
  const k = computeKpi(rows, NOW);
  assert.equal(k.series.length, 14);
  assert.equal(k.series[13].n, 2, "aujourd'hui = u1,u2 (dédup)");
  assert.equal(k.series[0].n, 0, "il y a 13 jours = personne");
});

test("robustesse : lignes sans user_id ou date invalide sont ignorées", () => {
  const rows = [row("u1", 0.1), { user_id: null, received_at: new Date(NOW).toISOString() }, { user_id: "x", received_at: "pas-une-date" }];
  const k = computeKpi(rows, NOW);
  assert.equal(k.dau, 1, "seul u1 compte");
  assert.equal(k.mau, 1);
});
